---
name: Publish path checks
description: Why path-mounted Next apps need production URL checks in addition to successful compilation
---

Do not treat a successful build as proof that a path-mounted web artifact can pass its publish startup check. Proxy mount-point normalization and framework trailing-slash normalization can disagree.

**Why:** Publishing reached successful builds and running servers, but the web startup probe hit a repeated redirect at the mounted root. The API health check was healthy; compilation and dependency installation were not the problem.

**How to apply:** Keep the framework's canonical mount URL consistent with the artifact's startup path. Test the exact startup URL against a production-mode server without following redirects and require a direct 200. Check an ordinary route as well; do not fix the symptom by dropping the app's route prefix.
