const { fetchWithRetry, CircuitBreaker } = require("./httpClient");
const { RateLimiter } = require("./rateLimiter");
const { SOURCES } = require("./sources");
const { saveSnapshot, loadSnapshot } = require("./cache");

// One limiter + breaker per source. A failure in one source does not throttle
// or disable another source.
const limiters = new Map(SOURCES.map((s) => [s.name, new RateLimiter(2, 60_000)]));
const breakers = new Map(SOURCES.map((s) => [s.name, new CircuitBreaker(3, 5 * 60_000)]));

const runLog = [];

function logRun(entry) {
  runLog.unshift({ ...entry, at: new Date().toISOString() });
  if (runLog.length > 50) runLog.pop();
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function dedupeListings(listings) {
  const seen = new Set();
  return listings.filter((listing) => {
    const key = [listing.company, listing.title, listing.location]
      .map(normalizeKey)
      .join("|");

    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchFromSource(source) {
  const breaker = breakers.get(source.name);
  const limiter = limiters.get(source.name);
  const startedAt = Date.now();

  if (breaker.isOpen()) {
    const error = new Error(`Circuit open for ${source.name}`);
    error.code = "CIRCUIT_OPEN";
    error.durationMs = 0;
    error.attempts = 0;
    throw error;
  }

  try {
    const res = await fetchWithRetry(source.url, {
      retries: 3,
      baseDelayMs: 600,
      beforeAttempt: () => limiter.wait(),
    });

    const body = await res.text();
    const listings = dedupeListings(source.parse(body));

    if (listings.length === 0) {
      throw new Error(`Parsed 0 listings from ${source.name} - possible feed drift`);
    }

    breaker.recordSuccess();

    return {
      listings,
      durationMs: Date.now() - startedAt,
      attempts: res.attempts || 1,
    };
  } catch (err) {
    breaker.recordFailure();
    err.durationMs = err.durationMs || Date.now() - startedAt;
    err.attempts = err.attempts || 1;
    throw err;
  }
}

/**
 * True priority-based fallback:
 * primary -> fallback -> last-known-good cache.
 * A successful primary source stops the pipeline immediately.
 */
async function runIngestion() {
  const errors = [];
  const runStartedAt = Date.now();

  for (let index = 0; index < SOURCES.length; index += 1) {
    const source = SOURCES[index];

    try {
      const result = await fetchFromSource(source);
      const isFallback = index > 0;

      logRun({
        source: source.name,
        status: isFallback ? "fallback" : "ok",
        attempts: result.attempts,
        count: result.listings.length,
        durationMs: result.durationMs,
        cacheUsed: false,
      });

      saveSnapshot(result.listings, {
        source: source.name,
        errors,
      });

      return {
        listings: result.listings,
        status: isFallback ? "degraded" : "healthy",
        degraded: isFallback,
        errors,
        servedFromCache: false,
        source: source.name,
        durationMs: Date.now() - runStartedAt,
      };
    } catch (err) {
      const failure = {
        source: source.name,
        error: err.message,
        code: err.code || null,
        attempts: err.attempts || 0,
      };
      errors.push(failure);

      logRun({
        source: source.name,
        status: "failed",
        attempts: err.attempts || 0,
        count: 0,
        durationMs: err.durationMs || 0,
        cacheUsed: false,
        error: err.message,
      });
    }
  }

  const snapshot = loadSnapshot();
  if (snapshot && Array.isArray(snapshot.listings) && snapshot.listings.length > 0) {
    logRun({
      source: "cache",
      status: "cached",
      attempts: 0,
      count: snapshot.listings.length,
      durationMs: 0,
      cacheUsed: true,
    });

    return {
      listings: snapshot.listings,
      status: "cached",
      degraded: true,
      errors,
      servedFromCache: true,
      cachedAt: snapshot.savedAt,
      source: snapshot.meta?.source || "cache",
      durationMs: Date.now() - runStartedAt,
    };
  }

  logRun({
    source: "pipeline",
    status: "failed",
    attempts: 0,
    count: 0,
    durationMs: Date.now() - runStartedAt,
    cacheUsed: false,
    error: "No live source or last-known-good cache available",
  });

  return {
    listings: [],
    status: "failed",
    degraded: true,
    errors,
    servedFromCache: false,
    source: null,
    durationMs: Date.now() - runStartedAt,
  };
}

function getRunLog() {
  return runLog;
}

module.exports = { runIngestion, getRunLog };
