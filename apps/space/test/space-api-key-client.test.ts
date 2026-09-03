import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceApiKeyClient } from '../src/bootstrap/SpaceApiKeyClient.ts';


const metadata = {
  id: 'AbCdEfGhJkMnPqRs',
  name: 'Builder agent',
  key_prefix: 'edapi_AbCdEfGhJkMnPqRs_',
  scopes: ['space:entity:create', 'space:entity:run'],
  created_at: '2026-09-03T00:00:00+00:00',
  last_used_at: null,
};

test('SpaceApiKeyClient creates, lists, and revokes account-level keys with login auth', async () => {
  const calls: Array<{ url: string; options: RequestInit }> = [];
  const fetchImpl = async (url: string | URL | Request, options: RequestInit = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === 'POST') {
      return new Response(JSON.stringify({
        ...metadata,
        api_key: `${metadata.key_prefix}one-time-secret`,
      }), { status: 201 });
    }
    if (options.method === 'DELETE') {
      return new Response(JSON.stringify({ revoked: true, api_key_id: metadata.id }));
    }
    return new Response(JSON.stringify({ items: [metadata] }));
  };
  const client = new SpaceApiKeyClient(
    'https://api.example.test/',
    'login-token',
    fetchImpl as typeof fetch,
  );

  const listed = await client.list();
  const created = await client.create('Builder agent', true);
  await client.revoke(metadata.id);

  assert.equal(listed[0].key_prefix, metadata.key_prefix);
  assert.equal(created.api_key, `${metadata.key_prefix}one-time-secret`);
  assert.equal((calls[0].options.headers as any).Authorization, 'Bearer login-token');
  assert.equal(calls[0].url, 'https://api.example.test/space/api/v2/api-keys');
  assert.deepEqual(JSON.parse(String(calls[1].options.body)), {
    name: 'Builder agent',
    scopes: ['space:entity:create', 'space:entity:run'],
  });
  assert.equal(calls[2].options.method, 'DELETE');
  assert.match(calls[2].url, new RegExp(`/${metadata.id}$`));
});
