const { sleep } = require("./rateLimiter");

// A transparent User-Agent is preferable for public feeds: it identifies the
// application rather than trying to impersonate different browsers.
const USER_AGENT = "JobIngestionPipeline/1.0 (public-feed assessment demo)";

function pickUserAgent() {
  return USER_AGENT;
}

/**
 * Per-source circuit breaker. Repeated failures temporarily disable a source
 * so the pipeline can move to its configured fallback.
 */
class CircuitBreaker {
  constructor(failureThreshold = 3, cooldownMs = 5 * 60_000) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.failures = 0;
    this.openedAt = null;
  }

  isOpen() {
    if (this.openedAt === null) return false;
    if (Date.now() - this.openedAt >= this.cooldownMs) {
      // Cooldown elapsed: allow one trial request.
      this.openedAt = null;
      this.failures = 0;
      return false;
    }
    return true;
  }

  recordSuccess() {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure() {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.openedAt = Date.now();
  }
}

/**
 * Fetch with bounded exponential backoff + jitter for 429/5xx/network errors.
 * The optional beforeAttempt hook lets the pipeline pace every HTTP attempt,
 * including retries, instead of only pacing the first request.
 */
async function fetchWithRetry(
  url,
  {
    headers = {},
    retries = 3,
    baseDelayMs = 600,
    timeoutMs = 10_000,
    beforeAttempt = null,
  } = {}
) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (beforeAttempt) await beforeAttempt();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/rss+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          ...headers,
        },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 429 || res.status >= 500) {
        const error = new RetryableError(`Upstream returned ${res.status}`);
        error.status = res.status;
        error.retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
        error.attempts = attempt + 1;
        throw error;
      }

      if (!res.ok) {
        const error = new Error(`Non-retryable HTTP ${res.status} from ${url}`);
        error.status = res.status;
        error.attempts = attempt + 1;
        throw error;
      }

      res.attempts = attempt + 1;
      return res;
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      lastError.attempts = lastError.attempts || attempt + 1;

      const retryable =
        err instanceof RetryableError ||
        err.name === "AbortError" ||
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT";

      if (!retryable || attempt === retries) break;

      const backoff = err.retryAfterMs ?? baseDelayMs * 2 ** attempt;
      const jitter = Math.floor(Math.random() * 250);
      await sleep(Math.min(backoff + jitter, 8_000));
    }
  }

  throw lastError;
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1000, 8_000));
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, Math.min(dateMs - Date.now(), 8_000));
  return null;
}

class RetryableError extends Error {}

module.exports = { fetchWithRetry, pickUserAgent, CircuitBreaker, RetryableError };
