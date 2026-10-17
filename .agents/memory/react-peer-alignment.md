---
name: Shared client React alignment
description: Keep React and React Query peer contexts compatible when web, Expo and shared hooks packages coexist.
---

All workspace client packages and apps that consume shared React Query hooks must resolve a single compatible React and React Query instance. When updating Expo or Next dependencies, inspect the resolved dependency graph as well as typecheck output.

**Why:** mismatched React peer resolution previously allowed typechecking but produced a runtime “No QueryClient set” error because the API hooks read a different QueryClient context from the provider.

**How to apply:** after changing a workspace React version, reinstall and inspect `@tanstack/react-query` and `react` resolution from the web app, mobile app, and shared API client before exercising authenticated screens.
