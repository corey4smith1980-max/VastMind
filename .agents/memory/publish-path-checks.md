---
name: Publish path checks
description: Why path-mounted Next apps need production URL checks in addition to successful compilation
---

Do not treat a successful build as proof that a path-mounted web artifact can pass its publish startup check. Proxy mount-point normalization and framework trailing-slash normalization can disagree.

**Why:** Publishing reached successful builds and running servers, but the web startup probe hit a repeated redirect at the mounted root. The API health check was healthy; compilation and dependency installation were not the problem.

**How to apply:** Keep the framework's canonical mount URL consistent with the artifact's startup path. Test the exact startup URL against a production-mode server without following redirects and require a direct 200. Check an ordinary route as well; do not fix the symptom by dropping the app's route prefix.

In this multi-artifact autoscale setup, deployment logs also probed the API service mount root (`/api`) in addition to its configured `/api/healthz` startup path. Keep `/api` as a minimal, unauthenticated 200 health response.

**Why:** The failed release logged `/api` as unhealthy while `/api/healthz` returned 200; later `/api` failures followed service termination from the web health-check failure.

**How to apply:** When publishing multiple services, verify both the artifact mount root and its explicit startup path. Do not put database checks or private details in the public readiness response.
