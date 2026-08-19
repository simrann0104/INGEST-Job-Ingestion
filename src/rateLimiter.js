/**
 * Small in-memory token-bucket limiter.
 * Tokens refill continuously instead of resetting at fixed windows.
 * This keeps requests paced without adding Redis or another service.
 */
class RateLimiter {
  constructor(capacity = 6, refillIntervalMs = 60_000, jitterRangeMs = [200, 700]) {
    this.capacity = capacity;
    this.refillRate = capacity / refillIntervalMs;
    this.tokens = capacity;
    this.lastRefill = Date.now();
    this.jitterRangeMs = jitterRangeMs;
  }

  _refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
      this.lastRefill = now;
    }
  }

  _jitter() {
    const [min, max] = this.jitterRangeMs;
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  async wait() {
    this._refill();

    if (this.tokens < 1) {
      const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
      await sleep(waitMs);
      this._refill();
    }

    this.tokens -= 1;
    await sleep(this._jitter());
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { RateLimiter, sleep };
