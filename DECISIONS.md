# DECISIONS

## 1. Why did I choose this ingestion strategy?

I chose a public API/RSS approach instead of scraping a restricted job
platform.

Remote OK is the primary source because it provides a public JSON feed.
We Work Remotely is the fallback because it provides a public
programming RSS feed.

The flow is intentionally simple:

``` text
primary -> fallback -> last-known-good cache
```

This gives the system real live data while still handling source
failures.

## 2. What trade-off did I make?

I kept the infrastructure small.

The rate limiter, circuit breakers, run history, and cache are local to
the Node.js process. I did not add Redis, PostgreSQL, a message queue,
or another service.

This makes the project easy to run and explain for the assessment, but
it would need persistent/shared infrastructure for a larger
multi-instance production system.

## 3. Where did I use AI tools, and what did I personally verify or change afterward?

I used AI tools to help with scaffolding, implementation, debugging,
documentation, and UI work.

I personally ran the application locally, checked the live job source,
verified the primary/fallback flow, reviewed the backend logic, and made
changes where the generated implementation did not match the intended
design.

I kept the final implementation small enough that I can explain the
retry, rate limiting, circuit breaker, fallback, cache, parsing, and
frontend behavior.
