---
name: Product direction
description: User-approved product and infrastructure choices
---

VastMind (formerly I AM / NeuraCoreConnect) extends the existing Gather product with web and mobile rather than becoming an unrelated app.

**Why:** The user explicitly chose “Extend Gather with web and mobile.”

The product's user-facing name is “VastMind.”

**Why:** The user requested “Update App name to VastMind and update app icon and logo,” superseding the earlier I AM name.

**How to apply:** Use VastMind for customer-facing branding and preserve existing account identities. The main published URL should serve the web app at `/`; keep the mobile installer at `/mobile/`.

**Why:** The user explicitly chose the web app rather than the installer for the main published link.

Use Replit-managed Clerk and Replit Postgres. The initial media deferral ended when the user selected Replit App Storage for uploads.

**Why:** The user confirmed Replit-managed Clerk, chose Replit Postgres after dismissing the Supabase secret request, then explicitly chose “Use Replit App Storage” for media.

**How to apply:** Keep accounts and shared social data aligned across clients. Do not re-request Supabase credentials or introduce an external database without a new user decision. Media upload deferral does not mean unrelated requested features were rejected.

Commerce belongs inside the VastMind web and native apps. The initial commerce scope is catalog, inventory, cart, and order management; payments are deferred until a provider is explicitly selected.

**Why:** The user asked for the shop to be built inside both apps, selected catalog/orders first, chose to add billing later, and continued without connecting a payment integration.

**How to apply:** Use the shared API and database for buyer and seller workflows. Keep payment status explicitly manual until a real processor is connected; never collect card details in a fake checkout.

VastMind Mail is for communication within the web and mobile apps only, not public internet email. The user wants user-controlled message data and chose a user-held recovery phrase.

**Why:** The user explicitly clarified the internal-only scope, non-tracking intent, and that the organization should not control users' message content.

**How to apply:** Do not require external mail hosting or DNS for internal aliases. Preserve the distinction between encrypted content, visible delivery metadata, and account authentication. The user has not approved changing the existing sign-in system.
