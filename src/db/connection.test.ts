/**
 * @file src/db/connection.test.ts
 * @description Tests for database connection module.
 *
 * REF: GOV-002 (Testing Protocol)
 */

import { describe, it, expect, vi } from 'vitest';
import { createPool, createDrizzle, testConnection } from './connection.js';

describe('createPool', () => {
  it('should return a Pool instance with configured settings', () => {
    const pool = createPool('postgresql://test:test@localhost:5432/test_db');
    expect(pool).toBeDefined();
    expect(typeof pool.connect).toBe('function');
    expect(typeof pool.query).toBe('function');
    expect(typeof pool.end).toBe('function');
    void pool.end();
  });
});

describe('createDrizzle', () => {
  it('should return a Drizzle instance', () => {
    const pool = createPool('postgresql://test:test@localhost:5432/test_db');
    const db = createDrizzle(pool);
    expect(db).toBeDefined();
    expect(db).toHaveProperty('select');
    expect(db).toHaveProperty('insert');
    void pool.end();
  });
});

describe('testConnection', () => {
  it('should return true when DB is reachable', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 }),
      release: vi.fn(),
    };
    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as import('pg').Pool;

    const result = await testConnection(mockPool);
    expect(result).toBe(true);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('should return false when DB connect fails', async () => {
    const mockPool = {
      connect: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as import('pg').Pool;

    const result = await testConnection(mockPool);
    expect(result).toBe(false);
  });

  it('should return false when query fails', async () => {
    const mockClient = {
      query: vi.fn().mockRejectedValue(new Error('permission denied')),
      release: vi.fn(),
    };
    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    } as unknown as import('pg').Pool;

    const result = await testConnection(mockPool);
    expect(result).toBe(false);
    expect(mockClient.release).toHaveBeenCalled();
  });
});
