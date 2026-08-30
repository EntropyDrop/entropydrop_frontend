import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceMarketClient, SpaceMarketError } from '../src/bootstrap/SpaceMarketClient.ts';

test('SpaceMarketClient sends authenticated market list, publish, download, like, and delete requests', async () => {
  const calls: Array<{ url: string; options: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, options: RequestInit = {}) => {
    calls.push({ url: String(url), options });
    const value = String(url);
    if (value.endsWith('/download')) {
      return new Response(JSON.stringify({ id: 'r1', kind: 'colorset', payload: { type: 'space-colorset' } }), { status: 200 });
    }
    if (value.endsWith('/like')) {
      return new Response(JSON.stringify({ is_liked: true, likes_count: 1 }), { status: 200 });
    }
    if (options.method === 'DELETE') {
      return new Response(JSON.stringify({ deleted: true, resource_id: 'r1' }), { status: 200 });
    }
    if (options.method === 'POST') {
      return new Response(JSON.stringify({ resource: { id: 'r1' }, quota: { remaining_today: 9 } }), { status: 201 });
    }
    return new Response(JSON.stringify({ items: [], total: 0, quota: { remaining_today: 10 } }), { status: 200 });
  };
  const client = new SpaceMarketClient('https://api.entropydrop.com/', 'token-1', fetchImpl as typeof fetch);

  await client.listResources('entity', 'downloads');
  await client.publishResource('colorset', { type: 'space-colorset', version: 2 });
  await client.downloadResource('r1');
  await client.toggleLike('r1');
  await client.deleteResource('r1');

  assert.equal(calls.length, 5);
  assert.match(calls[0].url, /kind=entity/);
  assert.match(calls[0].url, /sort=downloads/);
  assert.equal((calls[0].options.headers as any).Authorization, 'Bearer token-1');
  assert.deepEqual(JSON.parse(String(calls[1].options.body)), {
    kind: 'colorset',
    payload: { type: 'space-colorset', version: 2 }
  });
  assert.equal(calls[2].options.method, undefined);
  assert.equal(calls[3].options.method, 'POST');
  assert.equal(calls[4].options.method, 'DELETE');
});

test('SpaceMarketClient exposes structured backend errors', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    detail: { code: 'RESOURCE_ALREADY_PUBLISHED', message: 'Duplicate resource', resource_id: 'existing' }
  }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  const client = new SpaceMarketClient('http://localhost:8000', 'token', fetchImpl as typeof fetch);

  await assert.rejects(
    () => client.publishResource('blockset', {}),
    (error: any) => {
      assert.ok(error instanceof SpaceMarketError);
      assert.equal(error.status, 409);
      assert.equal(error.code, 'RESOURCE_ALREADY_PUBLISHED');
      assert.equal(error.detail.resource_id, 'existing');
      return true;
    }
  );
});

test('SpaceMarketClient keeps native fetch bound to the browser global', async () => {
  let receiver: unknown;
  const receiverSensitiveFetch = function (this: unknown) {
    receiver = this;
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return Promise.resolve(new Response(JSON.stringify({
      items: [],
      total: 0,
      limit: 24,
      offset: 0,
      quota: { daily_limit: 10, published_today: 0, remaining_today: 10 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  } as typeof fetch;

  const client = new SpaceMarketClient('https://api.example.test', 'token', receiverSensitiveFetch);
  await client.listResources('blockset');

  assert.equal(receiver, globalThis);
});
