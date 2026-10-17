---
name: Product direction
description: User-approved product and infrastructure choices
---

I AM (formerly NeuraCoreConnect) extends the existing Gather product with web and mobile rather than becoming an unrelated app.

**Why:** The user explicitly chose “Extend Gather with web and mobile.”

The product's user-facing name is “I AM.”

**Why:** The user explicitly approved “Yes, rename it to I AM,” rather than leaving the rename as a tentative idea.

**How to apply:** Use I AM for customer-facing branding; a rename does not by itself require changing existing routing prefixes or account identities.

Use Replit-managed Clerk and Replit Postgres. The initial media deferral ended when the user selected Replit App Storage for uploads.

**Why:** The user confirmed Replit-managed Clerk, chose Replit Postgres after dismissing the Supabase secret request, then explicitly chose “Use Replit App Storage” for media.

**How to apply:** Keep accounts and shared social data aligned across clients. Do not re-request Supabase credentials or introduce an external database without a new user decision. Media upload deferral does not mean unrelated requested features were rejected.
