# EntropyDrop Backend Runtime Architecture and Elastic Scaling Boundaries

**Author: EntropyDrop Dev Team**  
**Date: 2026-05-25**

## Abstract

The EntropyDrop backend uses a layered runtime architecture that separates HTTP control-plane responsibilities, durable state, asynchronous generation work, singleton background jobs, database migration, and deployment-time scaling. The goal is to keep API processes focused, prevent long-running work from blocking request paths, and provide a foundation for multi-replica deployment, rolling releases, and API-layer autoscaling.

The current architecture uses FastAPI as the HTTP API layer, PostgreSQL as the primary durable store, Redis/RQ as the asynchronous task queue, a dedicated background service for singleton jobs, S3/CDN for asset storage and delivery, and AWS ALB/ECS for ingress load balancing, service rollout, and API-layer autoscaling.

This article describes implemented runtime behavior and deployment boundaries. API-layer elastic scaling is in place; GPU/RQ worker autoscaling, blue-green deployment, canary deployment, and metric-driven automatic rollback remain future work.

## 1. Runtime Topology

```text
Client / Frontend
   |
   v
AWS ALB
   |
   v
ECS API Service  <----> PostgreSQL
   |                       ^
   |                       |
   v                       |
Redis / RQ Queues          |
   |                       |
   v                       |
GPU / RQ Workers ----------+
   |
   v
Redis generate_results
   |
   v
ECS Background Service ---> PostgreSQL

S3 / CDN serves generated files, uploaded files, and public assets.
```

The topology has three primary runtime paths:

- **Request path**: client traffic enters through ALB and reaches the API service, where authentication, validation, queries, and enqueueing happen.
- **Generation path**: RQ workers consume Redis queue jobs, execute generation, and publish results into Redis.
- **Background coordination path**: the background service consumes generation results, recovers missing pending jobs, repairs order state, and refreshes discovery cache.

This separation allows API replicas to scale around HTTP load without being coupled to long-running singleton jobs or GPU inference throughput.

## 2. API Control Plane

The API service is implemented with FastAPI and mounted under the `/skin` prefix. Its responsibilities include:

- authentication, request validation, and rate limiting;
- database reads and writes;
- generation task enqueueing;
- order, collection, history, and discovery APIs;
- health, readiness, and version endpoints.

The API exposes two health-related endpoints:

```text
/skin/api/health
/skin/api/ready
```

`/skin/api/health` is a process-level liveness endpoint. It confirms that the API process can respond to HTTP.

`/skin/api/ready` is dependency-aware readiness. It checks:

- PostgreSQL: SQLAlchemy connection plus `SELECT 1`;
- Redis: `PING`.

When both dependencies are available, the endpoint returns 200:

```json
{"status": "ready", "dependencies": {"database": "ok", "redis": "ok"}}
```

If any dependency is unavailable, the endpoint returns 503 and marks the failed dependency. The AWS target group uses `/skin/api/ready` as its health check path, so ALB avoids routing traffic to API tasks whose dependencies are not ready.

## 3. Database Access and Connection Pooling

PostgreSQL stores durable system state. The API accesses it through SQLAlchemy sessions. To support multi-replica API deployment, non-SQLite environments use explicit engine pool settings:

| Setting | Default |
| --- | --- |
| `DB_POOL_SIZE` | `3` |
| `DB_MAX_OVERFLOW` | `2` |
| `DB_POOL_TIMEOUT` | `30` |
| `DB_POOL_RECYCLE` | `1800` |

With the default configuration, one API task can use up to 5 database connections. The current API autoscaling maximum is 4 tasks, so the API layer can use roughly 20 database connections. Capacity planning should also reserve connections for the background service, migration tasks, RQ workers, and operational access.

Database schema changes are owned by Alembic migrations. The code retains `create_all`, but it is disabled by default with `AUTO_CREATE_TABLES=false`. Production environments should keep this disabled to prevent API task startup from creating or modifying schema.

## 4. Asynchronous Generation Work

AI generation jobs are long-running, resource-intensive, and GPU-dependent. They are not executed synchronously inside the HTTP request lifecycle. Instead, generation requests are converted into Redis/RQ jobs consumed by independent workers.

Queues are split by task mode and priority:

| Mode | Normal queue | High-priority queue |
| --- | --- | --- |
| text-to-image | `queue_text_to_image` | `high_queue_text_to_image` |
| image editing | `queue_image_edit` | `high_queue_image_edit` |
| image-to-skin | `queue_image_to_skin` | `high_queue_image_to_skin` |

Active Pro users use queues with the `high_` prefix. Jobs are enqueued with RQ Retry using intervals `[5, 10, 30, 60]` seconds.

This queue model provides several runtime properties:

- API requests do not wait for GPU inference;
- different generation modes can be consumed by different workers;
- high-priority and standard work are separated;
- queue depth and failure state can be monitored;
- lost or long-pending jobs can be re-enqueued by recovery logic.

## 5. Admission Control and Backpressure

Asynchronous queues are not a substitute for capacity control. Before enqueueing, the API applies admission control to limit unbounded backlog risk:

- pending/processing limits by user tier;
- admin bypass for per-user concurrency limits;
- rejection when global pending/processing count exceeds 10000;
- upload size and image dimension limits;
- bounded generation parameters such as `guidance` and `n_step`.

These rules form a protective layer for the scaling system. API autoscaling can increase HTTP control-plane throughput, but GPU worker capacity has cost and startup-time constraints. Backpressure protects queues, databases, and user experience when downstream compute capacity is constrained.

## 6. Result Writeback Path

After completing a generation job, workers write results into the Redis `generate_results` list. The result listener in the background service consumes this list and persists state back to PostgreSQL:

- `status`
- `result`
- `edited_result`
- `error_msg`

This decouples generation execution from durable state updates. When users refresh a page or query history, the API reads the latest task state from PostgreSQL rather than relying on the original request connection.

## 7. Singleton Background Service

Some background jobs have global singleton semantics and should not run once per API replica. These include:

- Redis result listening;
- pending recovery;
- order repair;
- discovery cache refresh;
- external ledger synchronization.

They are centralized in `background_service.py`. The service first acquires a Redis distributed lock:

| Setting | Default |
| --- | --- |
| `BACKGROUND_LOCK_KEY` | `ed:background:singleton` |
| `BACKGROUND_LOCK_TTL_SECONDS` | `60` |
| `BACKGROUND_LOCK_RENEW_SECONDS` | `20` |
| `BACKGROUND_LOCK_RETRY_SECONDS` | `10` |

Lock acquisition uses Redis `SET key token NX EX ttl`. Renewal and release use Lua scripts that verify the token, ensuring that only the lock owner can renew or release the lock.

After acquiring the lock, the background service:

1. runs order repair once at startup;
2. continuously refreshes discovery cache;
3. continuously listens for generation results;
4. periodically runs pending recovery;
5. periodically runs external ledger synchronization.

If lock renewal fails or any long-running task exits unexpectedly, the service cancels active tasks and returns to lock acquisition.

## 8. Shared Discovery Cache

Discovery data is cached, but a multi-replica API service cannot rely on process memory as the only cache source. The current design uses Redis as the shared cache layer:

- the background service samples public successful records from PostgreSQL;
- cache is written to Redis key `ed:discovery:cache:v1`;
- Redis TTL defaults to 900 seconds;
- API processes read from Redis;
- API processes keep a 60-second local mirror to reduce Redis read load;
- Redis misses fall back to synchronous refresh.

This provides a consistent discovery cache view across API replicas while avoiding database access on every request.

## 9. External Ledger Synchronization and Financial Transparency

The public ledger only displays ledger entries synchronized from external APIs and normalized.

External ledger synchronization is scheduled by the singleton background service. After acquiring the Redis distributed lock, the service periodically runs PayPal Reporting API and AWS Cost Explorer synchronization jobs. The default interval is 86400 seconds, or once per day. Sync results are written into two tables:

- `external_ledger_entries`: normalized ledger entries for PayPal, AWS, and future bank APIs;
- `ledger_sync_runs`: provider, time range, execution status, inserted/updated counts, and error details for each sync run.

`external_ledger_entries` uses `provider + external_id` as the external idempotency key. PayPal transactions, AWS cost usage, and future bank transactions map into the same field set: provider, entry type, category, amount, currency, posted time, status, source, and public description. Source-specific raw payloads can remain in internal fields, while public APIs read only normalized and sanitized display fields.

The public endpoint `/skin/api/public/ledger` reads only the `paypal`, `aws`, and `bank` external providers, and only exposes entries with `posted` or `estimated` status. Local orders, manual operating records, and unconfirmed sync results do not appear in the public ledger view. When bank APIs are added later, a new sync adapter can write bank transactions into the same `external_ledger_entries` table without introducing another provider-specific ledger model.

This design moves financial transparency from a page-rendering concern to a source-of-truth and synchronization-boundary concern: the public page reads standardized results from trusted external sources, the background service handles periodic sync and audit trails, and the database schema provides long-term storage for third-party ledger records.

## 10. Database Migration and Release Order

The API container command starts only Uvicorn:

```text
uvicorn main:app --host 0.0.0.0 --port 8000
```

Database migration runs as a one-off ECS task during deployment:

```text
alembic upgrade head
```

The AWS backend deployment sequence is:

1. build and push the Docker image;
2. register the API task definition;
3. configure target group deregistration delay;
4. run the migration one-off task;
5. update the API service after migration succeeds;
6. wait for the API service to become stable;
7. switch the target group health check to `/skin/api/ready`;
8. configure ECS Service Auto Scaling;
9. update the background service.

This flow prevents multiple API tasks from running Alembic migrations concurrently. A separate migration task only determines where migration runs; it does not make every schema change zero-downtime. Breaking schema changes should follow expand/migrate/contract: introduce compatible structure, deploy compatible code, migrate data, and only then remove old structure.

## 11. AWS Load Balancing and API Autoscaling

API ingress runs on AWS ALB and ECS Fargate. The deployment script configures multiple API tasks and baseline elastic scaling:

| Item | Default |
| --- | --- |
| `API_DESIRED_COUNT` | `2` |
| `API_MIN_CAPACITY` | `2` |
| `API_MAX_CAPACITY` | `4` |
| `API_MIN_HEALTHY_PERCENT` | `100` |
| `API_MAX_PERCENT` | `200` |
| `ALB_DEREGISTRATION_DELAY_SECONDS` | `60` |

`minimumHealthyPercent=100` and `maximumPercent=200` allow ECS to start new tasks before stopping old tasks during rolling deployment. With two API tasks by default, normal releases can preserve baseline healthy capacity.

API autoscaling uses three target tracking policies:

| Metric | Default target |
| --- | --- |
| CPU | `API_CPU_TARGET_VALUE=60` |
| Memory | `API_MEMORY_TARGET_VALUE=70` |
| ALB RequestCountPerTarget | `API_REQUESTS_PER_TARGET_VALUE=1000` |

When request volume, CPU pressure, or memory pressure increases, ECS can add API tasks. When pressure falls, ECS can scale in according to cooldown settings.

## 12. Boundary Between API Scaling and Generation Scaling

Current autoscaling covers the API control plane. It improves:

- request ingress capacity;
- authentication and validation throughput;
- enqueueing throughput;
- database query throughput;
- status response throughput.

API autoscaling does not automatically increase GPU worker capacity. During traffic spikes, the system may accept and enqueue tasks faster while generation latency still increases if GPU worker capacity remains fixed.

Elastic capabilities not yet implemented include:

- GPU/RQ worker scale-out based on queue pressure;
- worker draining before scale-in;
- oldest pending age driven scale-out;
- idle worker driven scale-in;
- blue-green deployment;
- canary traffic weights;
- metric-driven automatic rollback;
- multi-version task protocol compatibility;
- standby high availability for the background service.

## 13. Evolution Path

Worker scaling should be driven by queue pressure, for example:

```text
if queue.count / active_workers > threshold
or oldest_pending_age > threshold
then add worker
```

Scale-in should not terminate workers immediately. It should first drain the worker:

```text
mark worker draining
stop taking new jobs
wait current job done
terminate worker
```

The background service can evolve from `desiredCount=1` to `desiredCount=2`, creating one active instance and one standby instance. The Redis lock ensures that only one instance runs singleton jobs at a time. This improves availability but does not increase throughput.

For deployment strategy, the current baseline is ECS rolling update. More advanced options include blue-green deployment, canary rollout, and automatic rollback based on error rate, latency, queue backlog, and worker failure metrics.

## 14. Conclusion

The current EntropyDrop backend architecture can be summarized as follows:

- FastAPI provides the HTTP control plane;
- PostgreSQL stores durable state;
- Redis/RQ buffers asynchronous generation work;
- GPU/RQ workers perform generation;
- a dedicated background service handles singleton jobs;
- Redis provides shared discovery cache;
- `external_ledger_entries` and `ledger_sync_runs` provide a unified external API ledger;
- Alembic migration runs as a deployment-time one-off task;
- ALB/ECS provides API load balancing, readiness, rolling deployment, and baseline autoscaling.

The implemented elastic capability is API-layer autoscaling. The remaining major scalability work is GPU/RQ worker-layer autoscaling and more advanced release strategies. This boundary defines the current capacity model: the ingress layer can scale automatically, while generation throughput still depends on future worker autoscaling work.
