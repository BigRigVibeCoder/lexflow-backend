/**
 * @file src/lib/errors.ts
 * @description Application error classes and error taxonomy for the Trust Service.
 *
 * READING GUIDE FOR INCIDENT RESPONDERS:
 * 1. If you need the list of error categories → see ErrorCategory enum
 * 2. If you need to understand error structure → see ApplicationError class
 * 3. If you need HTTP status mapping → see ERROR_HTTP_STATUS_MAP
 *
 * REF: GOV-004 §2 (Error Taxonomy), §3.2 (TypeScript structured error context)
 * REF: CON-002 §6.2 (Error Handling Requirements)
 */

import { randomUUID } from 'node:crypto';

/**
 * Error categories per GOV-004 §2.
 * Each category maps to a retry strategy and default severity.
 */
export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
  DATABASE = 'DATABASE',
  RESOURCE = 'RESOURCE',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  CONFIGURATION = 'CONFIGURATION',
  NETWORK = 'NETWORK',
  SECURITY = 'SECURITY',
  FATAL = 'FATAL',
  TRANSIENT = 'TRANSIENT',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Structured error context attached to every application error.
 * REF: GOV-004 §3.2
 *
 * PRECONDITION: None.
 * POSTCONDITION: errorId is always populated with a unique identifier.
 */
export interface ErrorContext {
  /** Unique error identifier for tracing. */
  readonly errorId: string;
  /** Error classification per GOV-004 §2 taxonomy. */
  readonly category: ErrorCategory;
  /** Human-readable operation name (e.g., "deposit", "create_ledger"). */
  readonly operation?: string;
  /** Service or module that generated the error. */
  readonly component?: string;
  /** Request correlation ID from GOV-004 §8. */
  readonly correlationId?: string;
  /** Sanitized input data — NEVER include secrets, passwords, tokens. */
  readonly inputData?: Record<string, unknown>;
  /** Whether this error is safe to retry. */
  readonly retryable: boolean;
}

/**
 * Application-level error code used in HTTP responses.
 * REF: CON-002 — each route defines specific error codes.
 */
export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'DUPLICATE_ENTRY'
  | 'INSUFFICIENT_BALANCE'
  | 'ALREADY_VOIDED'
  | 'MATTER_NOT_FOUND'
  | 'CLIENT_NOT_FOUND'
  | 'CLIENT_NOT_ON_MATTER'
  | 'LEDGER_BUSY'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR';

/**
 * Maps application error codes to HTTP status codes.
 * REF: CON-002 §2-5 (error tables per route)
 */
export const ERROR_HTTP_STATUS_MAP: Record<AppErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DUPLICATE_ENTRY: 409,
  ALREADY_VOIDED: 409,
  INSUFFICIENT_BALANCE: 422,
  MATTER_NOT_FOUND: 404,
  CLIENT_NOT_FOUND: 404,
  CLIENT_NOT_ON_MATTER: 422,
  LEDGER_BUSY: 503,
  INTERNAL_ERROR: 500,
} as const;

/**
 * Base application error with structured context.
 *
 * All service errors MUST extend this class. Never throw bare Error instances.
 *
 * FAILURE MODE: If this class is not used, error responses will lack structured
 * context and the Fastify error handler cannot produce CON-002-compliant responses.
 * BLAST RADIUS: All API consumers receive unstructured 500 errors.
 * MITIGATION: The global error handler wraps unknown errors in ApplicationError.
 *
 * @example
 * ```typescript
 * throw new ApplicationError('Ledger not found', 'NOT_FOUND', {
 *   category: ErrorCategory.RESOURCE,
 *   operation: 'get_ledger',
 *   component: 'ledger-service',
 * });
 * ```
 */
export class ApplicationError extends Error {
  public readonly code: AppErrorCode;
  public readonly context: ErrorContext;
  public readonly cause?: Error;

  constructor(
    message: string,
    code: AppErrorCode,
    contextOverrides: Partial<ErrorContext> = {},
    cause?: Error,
  ) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.context = {
      errorId: `err-${randomUUID().slice(0, 12)}`,
      category: ErrorCategory.UNKNOWN,
      retryable: false,
      ...contextOverrides,
    };
    this.cause = cause;
  }

  /** Returns the HTTP status code for this error. */
  get httpStatus(): number {
    return ERROR_HTTP_STATUS_MAP[this.code];
  }
}
