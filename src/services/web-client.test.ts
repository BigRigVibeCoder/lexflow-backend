/**
 * @file src/services/web-client.test.ts
 * @description Tests for the web client service and circuit breaker.
 *
 * REF: GOV-002 (Testing Protocol)
 * REF: CON-001 §3-4 (Inter-service communication)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebClientService, createWebClient } from './web-client.js';

describe('WebClientService', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('createWebClient', () => {
    it('should create a WebClientService from env vars', () => {
      const client = createWebClient();
      expect(client).toBeInstanceOf(WebClientService);
    });
  });

  describe('validateMatterClient', () => {
    it('should return valid result on 200 success', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ valid: true, matterNumber: 'M-001', clientName: 'Test Client' }),
      });

      const client = new WebClientService('http://localhost:3000', 'test-key');
      const result = await client.validateMatterClient('matter-1', 'client-1');
      expect(result).toEqual({ valid: true, matterNumber: 'M-001', clientName: 'Test Client' });
    });

    it('should return invalid result with reason', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ valid: false, reason: 'Matter not found' }),
      });

      const client = new WebClientService('http://localhost:3000', 'test-key');
      const result = await client.validateMatterClient('bad', 'client-1');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Matter not found');
    });

    it('should throw ApplicationError on non-ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = new WebClientService('http://localhost:3000', 'test-key');
      await expect(client.validateMatterClient('m', 'c')).rejects.toThrow('Web service returned 500');
    });

    it('should throw ApplicationError on network failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const client = new WebClientService('http://localhost:3000', 'test-key');
      await expect(client.validateMatterClient('m', 'c')).rejects.toThrow('Web service unreachable');
    });

    it('should include service key header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      });
      globalThis.fetch = mockFetch;

      const client = new WebClientService('http://localhost:3000', 'my-secret-key');
      await client.validateMatterClient('m', 'c');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/internal/validate-matter-client'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Internal-Service-Key': 'my-secret-key',
          }) as Record<string, string>,
        }),
      );
    });

    it('should URL-encode matterId and clientId', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      });
      globalThis.fetch = mockFetch;

      const client = new WebClientService('http://localhost:3000', 'key');
      await client.validateMatterClient('id with spaces', 'id&special=chars');

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('id%20with%20spaces');
      expect(calledUrl).toContain('id%26special%3Dchars');
    });
  });

  describe('circuit breaker', () => {
    it('should open after 3 consecutive failures', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const client = new WebClientService('http://localhost:3000', 'key');

      /* 3 failures to trip the breaker */
      for (let i = 0; i < 3; i++) {
        try { await client.validateMatterClient('m', 'c'); } catch { /* expected */ }
      }

      /* 4th call should fail fast with circuit breaker message */
      await expect(client.validateMatterClient('m', 'c')).rejects.toThrow('circuit breaker is open');
    });

    it('should reset to closed on success', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('ECONNREFUSED'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ valid: true }),
        });
      });

      const client = new WebClientService('http://localhost:3000', 'key');

      /* 2 failures (not enough to trip) */
      try { await client.validateMatterClient('m', 'c'); } catch { /* expected */ }
      try { await client.validateMatterClient('m', 'c'); } catch { /* expected */ }

      /* Success resets the counter */
      const result = await client.validateMatterClient('m', 'c');
      expect(result.valid).toBe(true);

      /* Another failure should not trip (counter was reset) */
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'));
      try { await client.validateMatterClient('m', 'c'); } catch { /* expected */ }

      /* Circuit should still be closed */
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      });
      const result2 = await client.validateMatterClient('m', 'c');
      expect(result2.valid).toBe(true);
    });
  });
});
