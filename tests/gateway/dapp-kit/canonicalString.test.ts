/**
 * Pure unit test: canonical-string format used by the gateway's
 * requireAuth middleware. The dashboard's useSignedFetch hook
 * sends the same shape.
 */
import { describe, it, expect } from 'vitest';
import { canonicalString } from '@/lib/sui';
import { sha256Hex } from '@/lib/hash';

describe('canonicalString', () => {
  it('GET with empty body hashes to the empty-string hash', () => {
    const cs = canonicalString('GET', '/v1/spaces', '');
    expect(cs).toBe(`GET\n/v1/spaces\n${sha256Hex('')}`);
  });
  it('POST hashes the body', () => {
    const body = JSON.stringify({ name: 'agent-1' });
    const cs = canonicalString('POST', '/v1/spaces', body);
    expect(cs).toBe(`POST\n/v1/spaces\n${sha256Hex(body)}`);
  });
  it('preserves query string in path', () => {
    const cs = canonicalString('GET', '/v1/spaces?owner=0xabc', '');
    expect(cs).toContain('/v1/spaces?owner=0xabc');
  });
  it('uppercases the method', () => {
    expect(canonicalString('get', '/', '')).toBe(canonicalString('GET', '/', ''));
  });
});
