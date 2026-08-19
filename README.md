# INGEST - Job Ingestion Pipeline

A small Node.js/Express application that fetches real public job
listings and keeps serving usable data when a source fails.

## Data sources

The application does not contain a hardcoded job dataset.

-   **Primary:** Remote OK public JSON API ---
    `https://remoteok.com/api`
-   **Fallback:** We Work Remotely public programming RSS feed ---
    `https://weworkremotely.com/categories/remote-programming-jobs.rss`
-   **Last resort:** last-known-good local cache

Each listing keeps its original source URL so the user can open the
original job post.

## Flow

``` text
Remote OK API
     |
     | success
     v
 normalize -> deduplicate -> job index
     |
     | failure
     v
WWR programming RSS
     |
     | failure
     v
last-known-good cache
```

## Resilience

The pipeline includes:

-   retries for temporary HTTP/server/network failures
-   exponential backoff with jitter
-   `Retry-After` handling for 429 responses
-   per-source token-bucket rate limiting
-   per-source circuit breakers
-   malformed-item handling
-   empty-result detection
-   simple cross-listing deduplication
-   last-known-good caching

A successful primary source stops the pipeline. The fallback is used
only when the primary source cannot provide usable listings.

## Running locally

Requirements: Node.js 18+ and npm.

``` bash
npm install
npm start
```

Open:

``` text
http://localhost:3000
```

## Endpoints

``` text
GET /health
GET /api/jobs
GET /api/jobs/refresh
GET /api/runs
```

## Project structure

``` text
job-ingestion/
├── public/
│   ├── index.html
│   └── favicon.svg
├── src/
│   ├── cache.js
│   ├── httpClient.js
│   ├── parsers.js
│   ├── pipeline.js
│   ├── rateLimiter.js
│   └── sources.js
├── server.js
├── DESIGN.md
├── DECISIONS.md
├── Dockerfile
└── package.json
```

## Scope

This project uses public feeds/APIs. It does not log into LinkedIn,
Indeed, or other restricted accounts, and it does not attempt to bypass
CAPTCHA, access controls, or anti-bot protections.

Remote OK and We Work Remotely attribution/original links are retained
in the application.

## Limitations

The cache and run history are local to the application instance. A
larger multi-instance deployment would use persistent storage.

The goal is a small, explainable ingestion system rather than a full
job-search platform.
