/**
 * @file src/services/web-client.ts
 * @description HTTP client for calling the web service (validate-matter-client).
 *
 * Implements circuit breaker pattern: 3 failures → open (reject all) → 30s timeout → half-open (try one).
 *
 * REF: CON-001 §3 (Inter-service validate call)
 * REF: CON-001 §4 (validate-matter-client spec)
 * REF: SPR-004 T-037
 */

import { ApplicationError, ErrorCategory } from '../lib/errors.js';

/** Timeout for HTTP calls to the web service. */
const REQUEST_TIMEOUT_MS = 5_000;

/** Circuit breaker configuration. */
const CB_FAILURE_THRESHOLD = 3;
const CB_RESET_TIMEOUT_MS = 30_000;

type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Response from the web service validate-matter-client endpoint.
 * REF: CON-001 §4
 */
export interface ValidateMatterClientResult {
  valid: boolean;
  matterNumber?: string;
  clientName?: string;
  reason?: string;
}

/**
 * HTTP client for the web service with circuit breaker.
 *
 * FAILURE MODE: If the web service is unreachable for 3+ consecutive calls,
 * the circuit opens and all subsequent calls fail fast with 503 for 30 seconds.
 * BLAST RADIUS: All trust operations requiring matter/client validation fail.
 * MITIGATION: Circuit half-opens after 30s and retries one call.
 */
export class WebClientService {
  private readonly baseUrl: string;
  private readonly serviceKey: string;
  private circuitState: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(baseUrl: string, serviceKey: string) {
    this.baseUrl = baseUrl;
    this.serviceKey = serviceKey;
  }

  /**
   * Validate that a matter+client pair exists in the web service.
   *
   * PRECONDITION: matterId and clientId are valid UUIDs.
   * POSTCONDITION: Returns validation result or throws ApplicationError.
   */
  async validateMatterClient(
    matterId: string,
    clientId: string,
  ): Promise<ValidateMatterClientResult> {
    this.checkCircuit();

    const url = `${this.baseUrl}/api/internal/validate-matter-client?matterId=${encodeURIComponent(matterId)}&clientId=${encodeURIComponent(clientId)}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => { controller.abort(); }, REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Internal-Service-Key': this.serviceKey,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new ApplicationError(
          `Web service returned ${String(response.status)}`,
          'INTERNAL_ERROR',
          { category: ErrorCategory.EXTERNAL_SERVICE, operation: 'validate-matter-client' },
        );
      }

      const result = await response.json() as ValidateMatterClientResult;
      this.onSuccess();
      return result;
    } catch (error: unknown) {
      this.onFailure();

      if (error instanceof ApplicationError) {
        throw error;
      }

      throw new ApplicationError(
        'Web service unreachable',
        'INTERNAL_ERROR',
        {
          category: ErrorCategory.EXTERNAL_SERVICE,
          operation: 'validate-matter-client',
          component: 'web-client',
          retryable: true,
        },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Check circuit breaker state before making a request.
   * Throws immediately if circuit is open and reset timeout hasn't elapsed.
   */
  private checkCircuit(): void {
    if (this.circuitState === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;

      if (elapsed >= CB_RESET_TIMEOUT_MS) {
        this.circuitState = 'half-open';
        return;
      }

      throw new ApplicationError(
        'Web service circuit breaker is open',
        'INTERNAL_ERROR',
        {
          category: ErrorCategory.EXTERNAL_SERVICE,
          operation: 'circuit-breaker-check',
          component: 'web-client',
          retryable: false,
        },
      );
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.circuitState = 'closed';
  }

  private onFailure(): void {
    this.failureCount += 1;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= CB_FAILURE_THRESHOLD) {
      this.circuitState = 'open';
    }
  }
}

/**
 * Create a WebClientService instance from environment variables.
 */
export function createWebClient(): WebClientService {
  const baseUrl = process.env['WEB_SERVICE_URL'] ?? 'http://localhost:3000';
  const serviceKey = process.env['INTERNAL_SERVICE_KEY'] ?? '';
  return new WebClientService(baseUrl, serviceKey);
}
