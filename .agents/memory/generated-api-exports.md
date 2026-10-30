---
name: Generated API exports
description: Non-obvious Orval regeneration behavior in this workspace
---

Orval may append wildcard exports back into the package barrel on regeneration. Replacing only the wildcard with a type-only or namespaced export does not reliably eliminate schema/type export collisions.

**Why:** Repeated regeneration restored a conflicting wildcard export even after the barrel was changed; renaming the operation merely renamed the collision.

**How to apply:** Prefer noncolliding component names, and explicitly select the runtime schema export when a path-parameter schema and query-parameter TypeScript type share a generated name. Confirm by running codegen, not just a standalone typecheck.

Orval also cleans its generated output directories before rewriting files. Running codegen while Next.js or Metro is bundling can briefly make generated schema modules disappear.

**Why:** A live web build and Metro bundler reported missing generated schema files during a successful contract regeneration; restarting after generation cleared the transient errors.

**How to apply:** Finish API codegen before restarting client workflows. If a client reports a missing generated module during regeneration, verify the file exists after codegen completes, then restart that client once.
