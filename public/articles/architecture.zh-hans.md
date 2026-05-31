# EntropyDrop 后端运行时架构与弹性伸缩边界

**作者：EntropyDrop Dev Team**  
**日期：2026-05-25**

## 摘要

EntropyDrop 后端采用分层运行时架构，将 HTTP 控制面、持久化状态、异步生成任务、全局后台任务、数据库迁移和部署伸缩拆分为相互独立但协同工作的组件。该设计目标是降低 API 进程职责复杂度，避免长任务阻塞请求路径，并为多副本部署、滚动发布和 API 层弹性伸缩提供基础。

当前架构以 FastAPI 作为 HTTP API 层，PostgreSQL 作为核心持久化存储，Redis/RQ 作为异步任务队列，独立后台服务承载 singleton 任务，S3/CDN 承载资产存储与分发，AWS ALB/ECS 承载入口负载均衡、服务发布和 API 层自动伸缩。

本文仅描述当前代码与部署脚本中已经体现的架构事实，同时明确尚未实现的边界：API 层已具备基础弹性伸缩能力；GPU/RQ worker 层自动伸缩、蓝绿发布、金丝雀发布和指标驱动自动回滚仍属于后续演进方向。

## 1. 运行时拓扑

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

S3 / CDN 负责生成结果、上传文件和公开资产分发
```

该拓扑将系统拆分为三条主要运行路径：

- **请求路径**：客户端请求经 ALB 进入 API service，由 API 完成鉴权、校验、查询和任务入队。
- **生成路径**：RQ worker 从 Redis 队列取任务，执行生成后将结果写入 Redis 结果列表。
- **后台协调路径**：独立 background service 负责消费生成结果、恢复异常 pending 任务、修复订单状态和刷新 discovery cache。

这种拆分使 API 副本可以围绕 HTTP 负载独立伸缩，而不与长周期后台任务或 GPU 推理吞吐绑定。

## 2. API 控制面

API 服务由 FastAPI 实现，统一挂载在 `/skin` 路径前缀下。其主要职责包括：

- 用户鉴权、请求校验和限流；
- 数据库读写和状态查询；
- 生成任务入队；
- 订单、收藏、历史、发现页等业务接口；
- 健康检查、readiness 和版本信息暴露。

API 层包含两个健康接口：

```text
/skin/api/health
/skin/api/ready
```

`/skin/api/health` 是进程级 liveness probe，用于确认 API 进程能够响应 HTTP 请求。

`/skin/api/ready` 是依赖级 readiness probe，用于确认实例是否具备接收真实流量的条件。当前 readiness 检查包括：

- PostgreSQL：通过 SQLAlchemy connection 执行 `SELECT 1`；
- Redis：执行 `PING`。

当依赖均可用时，接口返回 200：

```json
{"status": "ready", "dependencies": {"database": "ok", "redis": "ok"}}
```

任一依赖不可用时，接口返回 503，并在 `dependencies` 中标识失败依赖。AWS Target Group 使用 `/skin/api/ready` 作为健康检查路径，从而避免将流量转发到依赖未就绪的 API task。

## 3. 数据库访问与连接池

PostgreSQL 保存系统持久化状态。API 通过 SQLAlchemy Session 访问数据库。为支持多副本 API service，数据库 engine 对非 SQLite 环境启用显式连接池参数：

| 配置 | 默认值 |
| --- | --- |
| `DB_POOL_SIZE` | `3` |
| `DB_MAX_OVERFLOW` | `2` |
| `DB_POOL_TIMEOUT` | `30` |
| `DB_POOL_RECYCLE` | `1800` |

默认配置下，单个 API task 最多占用 5 个数据库连接。当前 API autoscaling 默认最大容量为 4，因此 API 层理论上最多约占用 20 个数据库连接。实际容量规划还应为 background service、migration task、RQ worker 和运维访问预留连接余量。

数据库 schema 由 Alembic migration 负责。代码中保留 `create_all` 能力，但默认通过 `AUTO_CREATE_TABLES=false` 禁用。生产环境应保持关闭，避免 API task 启动时执行 schema 创建或变更操作。

## 4. 异步生成任务

AI 生成任务具有长耗时、高资源消耗和 GPU 依赖等特征，不适合在 HTTP 请求生命周期内同步执行。当前架构将生成请求转换为 Redis/RQ 队列任务，由独立 worker 异步消费。

队列按任务模式和优先级拆分：

| 模式 | 普通队列 | 高优先级队列 |
| --- | --- | --- |
| 文生图 | `queue_text_to_image` | `high_queue_text_to_image` |
| 图像编辑 | `queue_image_edit` | `high_queue_image_edit` |
| 图生皮肤 | `queue_image_to_skin` | `high_queue_image_to_skin` |

Pro 用户任务进入 `high_` 前缀队列。任务入队时配置 RQ Retry，重试间隔为 `[5, 10, 30, 60]` 秒。

该队列模型提供以下运行时特性：

- API 请求无需等待 GPU 推理完成；
- 不同生成类型可以由不同 worker 消费；
- 高优先级任务与普通任务隔离；
- 队列长度、执行中任务和失败任务可以被监控；
- 丢失或长时间 pending 的任务可通过 recovery 机制重新入队。

## 5. Admission Control 与背压

异步队列不能替代容量控制。API 在任务入队前执行 admission control，以限制无界排队风险：

- 按用户等级限制 pending/processing 任务数；
- 管理员可跳过单用户并发限制；
- 全局 pending/processing 超过 10000 时拒绝新任务；
- 上传体积和图片尺寸受限；
- `guidance`、`n_step` 等生成参数受范围约束。

这些规则构成扩容系统的保护层。API autoscaling 可以提高 HTTP 控制面的吞吐能力，但 GPU worker 扩容存在资源和启动时间约束。背压机制用于在下游计算能力不足时保护队列、数据库和用户体验。

## 6. 结果回写路径

worker 完成生成任务后，将结果写入 Redis `generate_results` 列表。独立 background service 中的结果监听器消费该列表，并将生成状态持久化到 PostgreSQL：

- `status`
- `result`
- `edited_result`
- `error_msg`

该设计将生成执行与状态写回解耦。用户刷新页面或查询历史记录时，API 从数据库读取最新任务状态，而不依赖原始请求连接。

## 7. Singleton 后台服务

部分后台任务具有全局 singleton 语义，不应随 API 副本数增加而重复执行。当前此类任务包括：

- Redis 结果监听；
- pending recovery；
- 订单修复；
- discovery cache refresh；
- 外部账本同步。

这些任务集中运行在 `background_service.py`。服务启动后首先获取 Redis 分布式锁：

| 配置 | 默认值 |
| --- | --- |
| `BACKGROUND_LOCK_KEY` | `ed:background:singleton` |
| `BACKGROUND_LOCK_TTL_SECONDS` | `60` |
| `BACKGROUND_LOCK_RENEW_SECONDS` | `20` |
| `BACKGROUND_LOCK_RETRY_SECONDS` | `10` |

锁获取使用 Redis `SET key token NX EX ttl`。续租和释放均通过 Lua 脚本校验 token，确保只有锁持有者能够续租或释放锁。

后台服务持有锁后执行以下任务：

1. 启动时执行一次订单修复；
2. 持续刷新 discovery cache；
3. 持续监听生成结果；
4. 定期执行 pending recovery；
5. 定期执行外部账本同步。

若锁续租失败或任一常驻任务异常退出，服务会取消当前任务并重新进入锁获取流程。

## 8. Discovery Cache 共享机制

discovery 数据需要缓存，但 API 多副本环境下不能依赖单进程内存作为唯一缓存来源。当前实现使用 Redis 作为共享缓存层：

- background service 从数据库采样公开成功记录；
- 缓存写入 Redis key `ed:discovery:cache:v1`；
- Redis TTL 默认 900 秒；
- API 进程从 Redis 读取；
- API 进程保留 60 秒本地短缓存以降低 Redis 读压力；
- Redis 未命中时，API 同步刷新作为兜底。

该机制在多 API 副本之间提供一致的 discovery cache 视图，同时避免每次请求直接查询数据库。

## 9. 外部账本同步与财务公开

公开总账的数只展示由外部 API 同步并标准化后的账本记录。

当前外部账本同步由 singleton background service 调度。服务持有 Redis 分布式锁后，按固定周期执行 PayPal Reporting API 与 AWS Cost Explorer 同步任务；默认周期为 86400 秒，即每天一次。同步结果写入两类表：

- `external_ledger_entries`：统一保存 PayPal、AWS 和未来银行 API 的标准化账本分录；
- `ledger_sync_runs`：记录每次同步的 provider、时间范围、执行状态、插入/更新数量和错误信息。

`external_ledger_entries` 以 `provider + external_id` 作为外部幂等键。PayPal 交易、AWS 成本消耗和未来银行流水都映射为同一套字段：provider、entry type、category、amount、currency、posted time、status、source 和 public description。不同来源的原始 payload 可以保留在内部字段中，但公开接口只读取已经标准化和脱敏后的展示字段。

公开接口 `/skin/api/public/ledger` 只读取 `paypal`、`aws` 和 `bank` 三类外部 provider，并只展示 `posted` 或 `estimated` 状态的记录。平台内部订单、手工运营记录和未确认同步结果不会进入公开总账视图。后续接入银行 API 时，只需要新增同步适配器，将银行流水写入同一张 `external_ledger_entries` 表，而不需要再为每个 provider 建立独立账本模型。

该设计把“财务公开”从页面展示问题前移为数据来源和同步边界问题：公开页面只负责读取可信来源的标准化结果，后台服务负责周期同步和同步状态留痕，数据库 schema 负责统一第三方账本的长期存储与审计。

## 10. 数据库迁移与发布顺序

API 容器启动命令仅启动 Uvicorn：

```text
uvicorn main:app --host 0.0.0.0 --port 8000
```

数据库迁移作为部署流程中的一次性 ECS task 执行：

```text
alembic upgrade head
```

AWS backend 部署顺序如下：

1. 构建并推送 Docker image；
2. 注册 API task definition；
3. 配置 Target Group deregistration delay；
4. 执行 migration one-off task；
5. migration 成功后更新 API service；
6. 等待 API service stable；
7. 将 Target Group health check 切换到 `/skin/api/ready`；
8. 配置 ECS Service Auto Scaling；
9. 更新 background service。

该流程避免多个 API task 并发执行 Alembic migration。需要注意的是，独立 migration task 只解决迁移执行位置问题，不自动保证所有 schema 变更零停机。涉及破坏性变更时仍应采用 expand/migrate/contract：先引入兼容结构，再部署兼容代码，完成数据迁移后再删除旧结构。

## 11. AWS 负载均衡与 API 自动伸缩

API 入口由 AWS ALB 和 ECS Fargate 承载。部署脚本为 API service 配置多副本和基础弹性伸缩：

| 项目 | 默认值 |
| --- | --- |
| `API_DESIRED_COUNT` | `2` |
| `API_MIN_CAPACITY` | `2` |
| `API_MAX_CAPACITY` | `4` |
| `API_MIN_HEALTHY_PERCENT` | `100` |
| `API_MAX_PERCENT` | `200` |
| `ALB_DEREGISTRATION_DELAY_SECONDS` | `60` |

`minimumHealthyPercent=100` 与 `maximumPercent=200` 允许 ECS 在滚动发布过程中先启动新 task，再停止旧 task。默认两个 API task 可在常规发布期间维持基础健康容量。

API autoscaling 使用三类 target tracking policy：

| 指标 | 默认目标 |
| --- | --- |
| CPU | `API_CPU_TARGET_VALUE=60` |
| Memory | `API_MEMORY_TARGET_VALUE=70` |
| ALB RequestCountPerTarget | `API_REQUESTS_PER_TARGET_VALUE=1000` |

当请求量、CPU 或内存压力升高时，ECS 可增加 API task；压力下降后，根据 cooldown 策略缩容。

## 12. API 扩容与生成能力边界

当前自动伸缩覆盖的是 API 控制面，主要提升：

- 请求接入能力；
- 鉴权和参数校验能力；
- 入队能力；
- 数据库查询能力；
- 状态返回能力。

API autoscaling 不会自动增加 GPU worker 数量。因此，在流量升高时，系统可能具备更强的请求接入和入队能力，但如果 GPU worker 数量固定，生成等待时间仍可能增长。

当前尚未实现的弹性能力包括：

- GPU/RQ worker 根据队列压力自动扩容；
- worker 缩容前 draining；
- oldest pending age 驱动扩容；
- worker 空闲时间驱动缩容；
- 蓝绿发布；
- 金丝雀流量权重；
- 指标驱动自动回滚；
- 多版本任务协议兼容层；
- background service standby 高可用。

## 13. 后续演进方向

worker 层更适合由队列压力驱动扩缩容，例如：

```text
if queue.count / active_workers > threshold
or oldest_pending_age > threshold
then add worker
```

缩容不应直接终止 worker，而应先进入 draining：

```text
mark worker draining
stop taking new jobs
wait current job done
terminate worker
```

background service 可从 `desiredCount=1` 演进到 `desiredCount=2`，形成一个 active 实例和一个 standby 实例。Redis lock 保证同一时刻只有一个实例执行 singleton 任务。该方案提升可用性，不提升吞吐。

发布策略方面，当前基线是 ECS rolling update。更高阶方案包括蓝绿发布、金丝雀发布，以及基于错误率、延迟、队列积压和 worker failure 指标的自动回滚。

## 14. 结论

EntropyDrop 当前后端架构可以概括为：

- FastAPI 提供 HTTP 控制面；
- PostgreSQL 保存持久化状态；
- Redis/RQ 缓冲异步生成任务；
- GPU/RQ worker 执行生成；
- 独立 background service 处理 singleton 任务；
- Redis 提供共享 discovery cache；
- `external_ledger_entries` 和 `ledger_sync_runs` 提供统一外部 API 账本；
- Alembic migration 作为部署时 one-off task 执行；
- ALB/ECS 提供 API 负载均衡、readiness、滚动发布和基础自动伸缩。

当前已经实现的是 API 层弹性伸缩。尚未实现的是 GPU/RQ worker 层弹性伸缩和更高级的发布策略。这个边界决定了系统当前的容量模型：入口层可自动扩展，生成吞吐仍依赖后续 worker autoscaling 能力建设。
