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

Use Replit Postgres and Replit App Storage. Replit-managed Clerk must remain a migration bridge until existing accounts can move safely to VastMind login.

**Why:** The user chose these data services, then approved preserving existing Clerk accounts and migrating users gradually.

**How to apply:** Keep accounts and shared social data aligned across clients. Do not re-request Supabase credentials or introduce an external database without a new user decision. Media upload deferral does not mean unrelated requested features were rejected.

Commerce belongs inside the VastMind web and native apps. The initial commerce scope is catalog, inventory, cart, and order management; payments are deferred until a provider is explicitly selected.

**Why:** The user asked for the shop to be built inside both apps, selected catalog/orders first, chose to add billing later, and continued without connecting a payment integration.

**How to apply:** Use the shared API and database for buyer and seller workflows. Keep payment status explicitly manual until a real processor is connected; never collect card details in a fake checkout.

VastMind identity is for account creation, login and profile identification only, not sending email or providing an inbox. An internal `username@vastmind.com` identifier is not a public email mailbox.

**Why:** The user clarified that the earlier “mail” request was not meant to send messages; it should provide secure account identity without external email sign-in.

**How to apply:** Do not add email delivery or require external mail hosting for these identifiers. Preserve existing account IDs and stored data during migration; do not delete legacy content as part of retiring inbox UI.

Users should sign in with passkeys and a user-held recovery phrase. VastMind-hosted encrypted data sync comes first; self-host support comes next. The organization should not have full control of users' private data.

**Why:** These are the user's explicit login, recovery, hosting and gradual-migration choices.

**How to apply:** Keep account-recovery keys cryptographically separate from content-encryption keys. Distinguish authentication from actual end-to-end encryption. Do not promise absolute zero tracking, spoofing or monitoring, or claim self-hosting exists before it works.

Ordinary emoji should be free and static. VastMind-specific premium emoji should be animated and intended for paid access; billing is deferred until a payment provider is activated.

**Why:** The user requested static ordinary emoji and animated VastMind premium emoji, after previously choosing to build premium features now and add billing later.

**How to apply:** Keep the two libraries visibly distinct. Preview access must not imply a purchase, active subscription, or enforced paid entitlement.

Communities should combine Nextdoor-style local conversation with opportunities for members to request help and offer their skills for extra income.

**Why:** The user described community conversation, people who need help, and members who want to earn from their skills as one Communities product direction.

**How to apply:** Preserve group discussions and membership while adding community-scoped service listings and private introductions. Do not treat a rate note as checkout or a payout.

Feed and posted videos belong together on the Videos page across web and mobile. Preserve the original video-page design and move the Feed's missing features into that single experience, not a separate Posts tab.

**Why:** The user explicitly prefers the original video design and wants one TikTok-like page for watching and enjoying both posts and clips.

**How to apply:** Keep posts and clips in one vertical timeline, preserve existing social features and content, and redirect old Feed links instead of reintroducing a second feed destination.

Preserve the existing VastMind menu order unless the user asks to move or rename a destination. Shop belongs in the center of the primary mobile menu, and the combined video-and-post destination is labeled “Feed.”

**Why:** The user asked to keep the existing menu arrangements while centering Shop and renaming Videos to Feed.

**How to apply:** Keep other destinations accessible and in their existing order. If a platform's tab limit requires an overflow menu, move secondary links there without removing them.

Chat discovery should not suggest people; starting a new relationship requires searching an exact username. Status browsing belongs in the chat surface and is limited to mutual contacts, while the status page is for managing the signed-in user's own posts, listed one per card.

**Why:** The user explicitly requested direct username lookup, mutual-contact-only status viewing, and a personal status page with separate entries.

**How to apply:** Use reciprocal follows or an existing private chat as the contact relationship, and enforce status access for both status metadata and attached media. Keep suggestions out of chat discovery.

In chat, place mutual-status rings inline before the VastMind inbox title. Keep the new-conversation action at the lower-right edge, just above the navigation menu, while alerts stay in the header.

**Why:** The user requested the status indicator before the chat title and the new-chat control lowered toward the menu.

**How to apply:** Keep status circles tappable and limited to mutual contacts. Do not move the alerts control away from its top-right header position.
