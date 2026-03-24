/**
 * @file src/plugins/error-handler.ts
 * @description Fastify error handler plugin — structured error responses per CON-002.
 *
 * READING GUIDE FOR INCIDENT RESPONDERS:
 * 1. If API responses have wrong error shape → check buildErrorResponse()
 * 2. If errors are not logged → check the error handler hook
 * 3. If unknown errors leak internals → check the fallback branch
 *
 * REF: GOV-004 §4.2 (Global exception handler)
 * REF: CON-002 §6.2 (Error Handling Requirements)
 * REF: CON-001 §2 (Error shape: { error: { code, message, details? } })
 */

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApplicationError } from '../lib/errors.js';

/**
 * CON-002 compliant error response shape.
 * ALL errors from this service MUST use this format.
 */
interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Build a structured error response body per CON-001 §2.
 *
 * PRECONDITION: code and message must be non-empty strings.
 * POSTCONDITION: Returns a valid ErrorResponseBody.
 */
function buildErrorResponse(
  code: string,
  message: string,
  details?: unknown,
): ErrorResponseBody {
  return {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

/**
 * Fastify error handler plugin.
 *
 * Catches all errors thrown in route handlers and transforms them into
 * CON-002-compliant structured JSON responses.
 *
 * FAILURE MODE: If this plugin is not registered, Fastify's default error
 * handler will return non-compliant error shapes.
 * BLAST RADIUS: All API consumers receive non-CON-002 error responses.
 * MITIGATION: This plugin MUST be registered before any route plugins.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin registration requires async
async function errorHandlerPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler(
    (error: Error, request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = request.correlationId;

      /* Branch: Known application error with structured context */
      if (error instanceof ApplicationError) {
        const statusCode = error.httpStatus;

        request.log.error(
          {
            err: error,
            errorId: error.context.errorId,
            correlationId,
            category: error.context.category,
            operation: error.context.operation,
            code: error.code,
          },
          `ApplicationError: ${error.message}`,
        );

        return reply
          .status(statusCode)
          .send(buildErrorResponse(error.code, error.message));
      }

      /* Branch: Fastify validation error (from TypeBox schema validation) */
      if ('validation' in error && 'validationContext' in error) {
        request.log.warn(
          { err: error, correlationId },
          `ValidationError: ${error.message}`,
        );

        return reply
          .status(400)
          .send(buildErrorResponse('VALIDATION_ERROR', error.message));
      }

      /* Branch: Unknown/unhandled error — never expose internals */
      request.log.error(
        { err: error, correlationId, stack: error.stack },
        `UnhandledError: ${error.message}`,
      );

      return reply
        .status(500)
        .send(buildErrorResponse(
          'INTERNAL_ERROR',
          'An unexpected error occurred',
        ));
    },
  );
}

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
  fastify: '4.x',
  dependencies: ['correlation-id'],
});
