---
name: Generated API exports
description: Non-obvious Orval regeneration behavior in this workspace
---

Orval may append wildcard exports back into the package barrel on regeneration. Replacing only the wildcard with a type-only or namespaced export does not reliably eliminate schema/type export collisions.

**Why:** Repeated regeneration restored a conflicting wildcard export even after the barrel was changed; renaming the operation merely renamed the collision.

**How to apply:** Prefer noncolliding component names, and explicitly select the runtime schema export when a path-parameter schema and query-parameter TypeScript type share a generated name. Confirm by running codegen, not just a standalone typecheck.
