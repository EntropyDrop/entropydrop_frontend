import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPngSignature,
  loadTerrainEditRemote,
  resolveApiOrigin,
} from '../src/bootstrap/SpaceBootstrap.ts';

test('Space derives the API origin from the main frontend API configuration', () => {
  assert.equal(resolveApiOrigin('http://localhost:8000/skin', 'http://localhost:5173'), 'http://localhost:8000');
  assert.equal(resolveApiOrigin('https://api.entropydrop.com/skin/', 'https://entropydrop.com'), 'https://api.entropydrop.com');
});

test('Space accepts only a PNG signature before decoding the configured skin', () => {
  assert.equal(hasPngSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(hasPngSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), false);
});

test('Space loads every terrain snapshot page and posts authenticated mutation batches', async () => {
  const requests: { url: string; options: RequestInit }[] = [];
  const fetchImpl = async (url: string | URL | Request, options: RequestInit = {}) => {
    const value = String(url);
    requests.push({ url: value, options });
    if (options.method === 'POST') {
      return new Response(JSON.stringify({ applied: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const parsed = new URL(value);
    const cursor = parsed.searchParams.get('cursor');
    return new Response(JSON.stringify(cursor
      ? {
          chunks: [{ chunk_x: 2, chunk_z: 0, revision: 2, standard: [], micro: [] }],
          next_cursor: null
        }
      : {
          chunks: [{ chunk_x: 0, chunk_z: 0, revision: 1, standard: [], micro: [] }],
          next_cursor: '0,0'
        }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const remote = await loadTerrainEditRemote(
    'https://api.entropydrop.com',
    'test-token',
    '00000000-0000-0000-0000-000000000001',
    fetchImpl as typeof fetch
  );
  await remote.sendBatch('00000000-0000-4000-8000-000000000001', [{
    kind: 'set_standard', x: 1, y: 80, z: 1, block: 1, color: 0x123456
  }]);

  assert.deepEqual(remote.chunks.map(chunk => chunk.chunk_x), [0, 2]);
  assert.equal(requests.length, 3);
  assert.equal((requests[0].options.headers as any).Authorization, 'Bearer test-token');
  assert.match(requests[1].url, /cursor=0%2C0/);
  assert.deepEqual(JSON.parse(String(requests[2].options.body)), {
    batch_id: '00000000-0000-4000-8000-000000000001',
    mutations: [{ kind: 'set_standard', x: 1, y: 80, z: 1, block: 1, color: 0x123456 }]
  });
});
