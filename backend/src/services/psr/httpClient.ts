/**
 * PSR HTTP Client (US-5.5 — Resilience & Rate-Limit Safety)
 *
 * Wraps axios with:
 *   1. Token-bucket rate limiter    — max req/sec per source key
 *   2. Exponential backoff + jitter — retries on 429 / 5xx
 *   3. Circuit breaker              — open/half-open/closed per source key
 *
 * Usage: replace raw `axios(config)` calls in the engine with
 *   `await psrHttp.request(sourceKey, config, sourceRateLimitConfig)`
 *
 * All state is process-local (in-memory Map). For multi-worker deployments
 * a Redis-backed limiter should be added in a future iteration.
 */

import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  maxRequestsPerSecond?: number; // defaults to unlimited
}

export interface RetryConfig {
  maxAttempts?: number;          // default 3
  baseDelayMs?: number;          // default 500
  maxDelayMs?: number;           // default 30_000
}

// ─── Token Bucket ─────────────────────────────────────────────────────────────

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRateMs: number; // ms per token
}

const buckets = new Map<string, TokenBucket>();

function acquireToken(sourceKey: string, cfg: RateLimitConfig): void {
  const maxRps = cfg.maxRequestsPerSecond;
  if (!maxRps || maxRps <= 0) return; // unlimited

  let bucket = buckets.get(sourceKey);
  if (!bucket) {
    bucket = {
      tokens: maxRps,
      lastRefill: Date.now(),
      maxTokens: maxRps,
      refillRateMs: 1000 / maxRps,
    };
    buckets.set(sourceKey, bucket);
  }

  // Refill tokens based on elapsed time
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  const newTokens = Math.floor(elapsed / bucket.refillRateMs);
  if (newTokens > 0) {
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + newTokens);
    bucket.lastRefill = now;
  }

  if (bucket.tokens < 1) {
    // Block synchronously until a token is available — synchronous sleep
    // is acceptable here because the engine is async/await and we want to
    // avoid complex async token queues for now.
    const waitMs = bucket.refillRateMs - (now - bucket.lastRefill);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, waitMs));
    bucket.tokens = 1;
    bucket.lastRefill = Date.now();
  }

  bucket.tokens--;
}

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreaker {
  state: CircuitState;
  failures: number;
  successesInHalfOpen: number;
  openedAt: number;
}

const FAILURE_THRESHOLD = 5;     // open after 5 consecutive failures
const RESET_TIMEOUT_MS = 60_000; // try half-open after 60s
const HALF_OPEN_SUCCESSES = 2;   // close after 2 successes in half-open

const circuits = new Map<string, CircuitBreaker>();

function getCircuit(sourceKey: string): CircuitBreaker {
  if (!circuits.has(sourceKey)) {
    circuits.set(sourceKey, { state: "closed", failures: 0, successesInHalfOpen: 0, openedAt: 0 });
  }
  return circuits.get(sourceKey)!;
}

function recordSuccess(sourceKey: string): void {
  const cb = getCircuit(sourceKey);
  if (cb.state === "half-open") {
    cb.successesInHalfOpen++;
    if (cb.successesInHalfOpen >= HALF_OPEN_SUCCESSES) {
      cb.state = "closed";
      cb.failures = 0;
      cb.successesInHalfOpen = 0;
      console.log(`[PSR Circuit] ${sourceKey}: CLOSED (recovered)`);
    }
  } else {
    cb.failures = 0;
  }
}

function recordFailure(sourceKey: string): void {
  const cb = getCircuit(sourceKey);
  cb.failures++;
  if (cb.state === "closed" && cb.failures >= FAILURE_THRESHOLD) {
    cb.state = "open";
    cb.openedAt = Date.now();
    cb.successesInHalfOpen = 0;
    console.warn(`[PSR Circuit] ${sourceKey}: OPEN after ${cb.failures} failures`);
  } else if (cb.state === "half-open") {
    cb.state = "open";
    cb.openedAt = Date.now();
    cb.successesInHalfOpen = 0;
    console.warn(`[PSR Circuit] ${sourceKey}: re-OPENED (half-open probe failed)`);
  }
}

function checkCircuit(sourceKey: string): void {
  const cb = getCircuit(sourceKey);
  if (cb.state === "open") {
    const elapsed = Date.now() - cb.openedAt;
    if (elapsed >= RESET_TIMEOUT_MS) {
      cb.state = "half-open";
      cb.successesInHalfOpen = 0;
      console.log(`[PSR Circuit] ${sourceKey}: HALF-OPEN (probing)`);
    } else {
      throw new Error(
        `[PSR Circuit] Source "${sourceKey}" circuit is OPEN — refusing request. ` +
          `Retrying in ${Math.ceil((RESET_TIMEOUT_MS - elapsed) / 1000)}s.`,
      );
    }
  }
}

// ─── Exponential Backoff + Jitter ─────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

function backoffDelay(attempt: number, base: number, max: number): number {
  // Full jitter: random delay in [0, min(max, base * 2^attempt)]
  const cap = Math.min(max, base * Math.pow(2, attempt));
  return Math.floor(Math.random() * cap);
}

function isRetryable(status?: number): boolean {
  return status === 429 || (status !== undefined && status >= 500 && status < 600);
}

// ─── Main Request Function ────────────────────────────────────────────────────

export async function psrHttpRequest(
  sourceKey: string,
  config: AxiosRequestConfig,
  rateLimitCfg: RateLimitConfig = {},
  retryCfg: RetryConfig = {},
): Promise<AxiosResponse> {
  const maxAttempts = retryCfg.maxAttempts ?? 3;
  const baseDelay = retryCfg.baseDelayMs ?? 500;
  const maxDelay = retryCfg.maxDelayMs ?? 30_000;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Circuit breaker check
    checkCircuit(sourceKey);

    // Rate limiter
    acquireToken(sourceKey, rateLimitCfg);

    try {
      const response = await axios(config);
      recordSuccess(sourceKey);
      return response;
    } catch (err: any) {
      const status: number | undefined = err?.response?.status;

      if (isRetryable(status) && attempt < maxAttempts - 1) {
        // 429: honour Retry-After header if present
        const retryAfter = err?.response?.headers?.["retry-after"];
        const waitMs = retryAfter
          ? Number(retryAfter) * 1000
          : backoffDelay(attempt, baseDelay, maxDelay);

        console.warn(
          `[PSR HTTP] ${sourceKey}: HTTP ${status} on attempt ${attempt + 1}/${maxAttempts}. ` +
            `Retrying in ${waitMs}ms.`,
        );
        await sleep(waitMs);
        lastError = err;
        continue;
      }

      // Non-retryable or final attempt
      recordFailure(sourceKey);
      throw err;
    }
  }

  // Exhausted retries
  recordFailure(sourceKey);
  throw lastError ?? new Error(`${sourceKey}: max retries exhausted`);
}

/** Expose circuit state for observability */
export function getCircuitState(sourceKey: string): CircuitState {
  return getCircuit(sourceKey).state;
}

/** Reset circuit (for testing / manual recovery) */
export function resetCircuit(sourceKey: string): void {
  circuits.delete(sourceKey);
}
