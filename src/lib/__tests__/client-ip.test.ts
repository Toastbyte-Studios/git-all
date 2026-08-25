import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { getClientIp } from '@/lib/client-ip';

function makeRequest(headers: Record<string, string>) {
  return new NextRequest('https://gitall.app/', { headers });
}

describe('getClientIp', () => {
  it('prefers cf-connecting-ip over x-forwarded-for', () => {
    const request = makeRequest({
      'CF-Connecting-IP': '203.0.113.10',
      'X-Forwarded-For': '198.51.100.1, 203.0.113.99',
    });
    expect(getClientIp(request)).toBe('203.0.113.10');
  });

  it('ignores a caller-supplied leftmost XFF segment', () => {
    // The spoofing case: a visitor prepends an address of their choosing.
    // Only the rightmost segment, appended by the proxy, may be trusted.
    const request = makeRequest({
      'X-Forwarded-For': 'attacker-chosen, 203.0.113.20',
    });
    expect(getClientIp(request)).toBe('203.0.113.20');
  });

  it('falls back to a single-segment x-forwarded-for', () => {
    const request = makeRequest({ 'X-Forwarded-For': '203.0.113.30' });
    expect(getClientIp(request)).toBe('203.0.113.30');
  });

  it('trims whitespace around segments', () => {
    const request = makeRequest({
      'X-Forwarded-For': '198.51.100.1,   203.0.113.40   ',
    });
    expect(getClientIp(request)).toBe('203.0.113.40');
  });

  it('skips empty segments from a trailing comma', () => {
    const request = makeRequest({ 'X-Forwarded-For': '203.0.113.50, ' });
    expect(getClientIp(request)).toBe('203.0.113.50');
  });

  it('returns "unknown" when no address header is present', () => {
    expect(getClientIp(makeRequest({}))).toBe('unknown');
  });

  it('returns "unknown" when cf-connecting-ip is blank', () => {
    const request = makeRequest({ 'CF-Connecting-IP': '   ' });
    expect(getClientIp(request)).toBe('unknown');
  });
});
