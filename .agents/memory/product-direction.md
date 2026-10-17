---
name: Product direction
description: User-approved product and infrastructure choices
---

NeuraCoreConnect extends the existing Gather product with web and mobile rather than becoming an unrelated app.

**Why:** The user explicitly chose “Extend Gather with web and mobile.”

Use Replit-managed Clerk and Replit Postgres now; defer media uploads until storage is connected.

**Why:** The user confirmed Replit-managed Clerk and chose “Use Replit Postgres now; defer media uploads” after dismissing the Supabase secret request.

**How to apply:** Keep accounts and shared social data aligned across clients. Do not re-request Supabase credentials or introduce an external database without a new user decision. Media upload deferral does not mean unrelated requested features were rejected.
