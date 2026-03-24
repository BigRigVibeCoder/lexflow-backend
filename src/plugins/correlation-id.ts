/**
 * @file src/plugins/correlation-id.ts
 * @description Fastify plugin that generates or propagates correlation IDs.
 *
 * Every incoming request receives a unique correlation ID, either from the
 * `X-Correlation-ID` header (if provided by caller) or auto-generated.
 * The ID is attached to the request for downstream logging and error context.
 *
 * REF: GOV-004 §8 (Correlation IDs)
 * REF: GOV-006 §3.1 (correlation_id required field)
 */

import { randomUUID } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Augment Fastify request interface with correlationId.
 *
 * DECISION: Using module augmentation over casting to maintain type safety.
 * ALTERNATIVES CONSIDERED: Decorating request with `any` cast (violates GOV-003).
 */
declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

/**
 * Fastify plugin — attaches a correlation ID to every request.
 *
 * PRECONDITION: None.
 * POSTCONDITION: `request.correlationId` is always a non-empty string.
 * SIDE EFFECTS: Sets `X-Correlation-ID` response header.
 */
async function correlationIdPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest('correlationId', '');

  fastify.addHook('onRequest', async (request, reply) => {
    const headerValue = request.headers[CORRELATION_HEADER];
    const correlationId = typeof headerValue === 'string' && headerValue.length > 0
      ? headerValue
      : `req-${randomUUID().slice(0, 12)}`;

    request.correlationId = correlationId;

    /* Set correlation ID on response so callers can trace responses back */
    void reply.header(CORRELATION_HEADER, correlationId);
  });
}

export default fp(correlationIdPlugin, {
  name: 'correlation-id',
  fastify: '4.x',
});
