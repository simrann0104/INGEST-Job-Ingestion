# Design

## 1. Source and request strategy

The application uses public sources rather than authenticated or
restricted job-board accounts.

**Primary:** Remote OK public JSON API.

**Fallback:** We Work Remotely public programming RSS feed.

Requests use:

-   a transparent application User-Agent
-   request timeouts
-   rate limiting
-   retries for temporary failures
-   exponential backoff and jitter

The application does not try to impersonate browsers or bypass anti-bot
controls.

## 2. Ingestion flow

``` text
Remote OK API
     |
     | usable response
     v
  normalize
     |
  deduplicate
     |
  job index

If primary fails:
     |
     v
WWR programming RSS
     |
  normalize
     |
  deduplicate
     |
  job index

If both fail:
     |
     v
last-known-good cache
```

The sources are ordered by priority. A successful source ends the run,
so the fallback is not unnecessarily called.

## 3. Retry and rate limiting

Each source has its own in-memory token bucket. The limiter refills
continuously and adds a small delay jitter.

Temporary failures such as 429 and 5xx responses can be retried up to
the configured limit. Network errors and timeouts are also retryable.

The `Retry-After` header is respected when supplied.

Non-retryable HTTP errors fail fast.

## 4. Circuit breaker

Each source has its own circuit breaker.

- 3 recorded failures open the circuit.
- The source remains open for 5 minutes.
- After the cooldown, the failure state resets and the next request is allowed as a trial.

This prevents a failing source from repeatedly delaying the whole pipeline.

## 5. Parsing and data quality

Remote OK JSON records are accepted only when the required job fields
are present.

RSS records require a usable title and original URL.

Incoming text is cleaned for HTML, entities, whitespace, and common
encoding problems. Malformed individual records are skipped.

Listings are deduplicated using normalized company, title, and location.

If a source returns zero usable listings, the run treats that source as
failed rather than accepting an empty result.

## 6. Cache and observability

After a successful live run, the listings are saved as a last-known-good
snapshot.

If both live sources fail, the snapshot can be returned.

The application also keeps a small in-memory run history containing
source, status, attempts, count, duration, cache usage, and errors.

## 7. Boundaries

The system intentionally stops at public feeds/APIs.

It does not:

-   log into restricted job-board accounts
-   bypass CAPTCHA
-   bypass access controls
-   use fingerprint spoofing for evasion
-   scrape a private user session

If a public source becomes unavailable or changes its access rules, the
fallback/cache path is used instead.

## 8. Future improvements

For a larger production system, the next steps would be persistent
storage, distributed rate limiting, stronger cross-source deduplication,
and external monitoring.
