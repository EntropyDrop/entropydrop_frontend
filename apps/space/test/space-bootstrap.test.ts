import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPngSignature, resolveApiOrigin } from '../src/bootstrap/SpaceBootstrap.ts';

test('Space derives the API origin from the main frontend API configuration', () => {
  assert.equal(resolveApiOrigin('http://localhost:8000/skin', 'http://localhost:5173'), 'http://localhost:8000');
  assert.equal(resolveApiOrigin('https://api.entropydrop.com/skin/', 'https://entropydrop.com'), 'https://api.entropydrop.com');
});

test('Space accepts only a PNG signature before decoding the configured skin', () => {
  assert.equal(hasPngSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(hasPngSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), false);
});
