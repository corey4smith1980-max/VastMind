---
name: Expo native build port
description: Replit's shared preview port can look like a healthy Expo Metro server unless the build probes the configured app port and verifies the Metro status marker.
---

Expo production bundling must use the mobile artifact's configured Metro port and verify that `/status` returns Metro's `packager-status:running` marker.

**Why:** The component preview also uses port 8081. Its SPA fallback returned an HTTP success for Expo's health check, so the headless build believed the wrong server was Metro and stalled while downloading bundles.

**How to apply:** Honor `EXPO_METRO_PORT` or the artifact's configured `PORT`; do not hardcode the shared preview port, and do not treat an arbitrary HTTP 200 as Metro health.
