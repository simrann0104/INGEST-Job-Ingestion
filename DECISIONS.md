# DECISIONS

## 1. Why this ingestion strategy over the obvious alternative you rejected?

I chose the public API/RSS approach instead of directly scraping platforms like LinkedIn or Indeed. RemoteOK gives me real job data through a public API, and I use We Work Remotely as a fallback through its public RSS feed. This allowed me to focus on the ingestion and resilience part of the task without trying to bypass access restrictions.

## 2. One trade-off you made under the time limit, and what you’d do with a real week.

I kept the storage simple by using a local last-known-good cache and in-memory run history instead of adding a database or Redis. This helped me keep the project simple and deploy it within the time limit. With a full week, I would add persistent storage and shared caching/rate limiting to make it more suitable for multiple instances.

## 3. Where did you use AI tools, and what did you personally verify or change afterward?

I used AI tools for coding, debugging, documentation, and UI development. I personally ran and tested the application, verified that the listings were coming from the live RemoteOK API, checked the retry, fallback, rate-limiting and caching behavior, and made changes when something did not work as expected. I also deployed and tested the final application myself.
