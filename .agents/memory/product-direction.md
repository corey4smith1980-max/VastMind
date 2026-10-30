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

Users can add another device only by scanning its short-lived QR with a device already signed in, then confirming the account password on the device being added. A direct password or passkey login must not create a concurrent session. Web and native apps must follow the same rule. Users can still download a recovery phrase as a plain-text file, but the phrase itself must stay client-side. VastMind-hosted encrypted data sync comes first; self-host support comes next. The organization should not have full control of users' private data.

**Why:** The user chose a 24-word recovery phrase and later specified QR approval from an already signed-in device plus password verification as the path for adding concurrent devices, across web and native clients.

**How to apply:** Direct password/passkey sign-in must not add another active session. For additional devices, require an authenticated current device to approve its QR and require the account password on the new device; make approval/revocation visible to the user. Preserve legacy accounts during migration and keep trust credentials revocable. Show only broad app/browser type and dates; do not expose or persist IP addresses, location, or device fingerprints. Recovery phrases are not retrievable after creation; a replacement is a new phrase, downloaded unencrypted by the user and activated only after confirmation. Keep account-recovery keys separate from content-encryption keys. Distinguish authentication from actual end-to-end encryption. Do not promise absolute zero tracking, spoofing or monitoring, or claim self-hosting exists before it works.

A forgotten VastMind password may be reset from a passkey- or recovery-verified session. Resetting ends other sessions but must not add any device to the trusted-password list; normal password sign-in remains limited to previously trusted devices.

**Why:** The user requested passkey-based password recovery and explicitly confirmed password access must stay locked to trusted devices.

**How to apply:** Keep password-reset authorization separate from trusted-device enrollment. Revoke other sessions after a reset, preserve existing trust records, and never treat a password reset as approval for a new device.

Ordinary emoji should be free and static. VastMind-specific premium emoji should be animated and intended for paid access; billing is deferred until a payment provider is activated.

**Why:** The user requested static ordinary emoji and animated VastMind premium emoji, after previously choosing to build premium features now and add billing later.

**How to apply:** Keep the two libraries visibly distinct. Preview access must not imply a purchase, active subscription, or enforced paid entitlement.

The navigation destination is labeled “Community,” but it remains a general social-post feed rather than a community-group feature.

**Why:** The user asked to rename Home to Community after explicitly removing community groups and creation.

**How to apply:** Keep general posts, photos, polls, reactions, and comments in the feed. Do not add community discovery, membership, opportunity listings, or group-scoped posts. Keep the current `/home` route for compatibility.

Feed and posted videos belong together on the Videos page across web and mobile. Preserve the original video-page design and move the Feed's missing features into that single experience, not a separate Posts tab.

**Why:** The user explicitly prefers the original video design and wants one TikTok-like page for watching and enjoying both posts and clips.

**How to apply:** Keep posts and clips in one vertical timeline, preserve existing social features and content, and redirect old Feed links instead of reintroducing a second feed destination.

Primary navigation should prioritize Chats, Feed, Shop and the Community post feed across web and mobile. Shop stays in the center of the five-item mobile bar, while Channels and other less-frequent tools go under More. Keep Channels separate from the Community feed and use a chat-style full-page layout for channel browsing and updates.

**Why:** The user explicitly asked to prioritize daily-use destinations, move secondary items into More, keep Shop centered, and make Channels feel like chat without adding channel tools to Communities.

**How to apply:** Use a More dropdown on desktop and the existing More destination/sheet on mobile. Preserve links to secondary tools, keep Channels accessible from More, and do not place channel management inside the Community post feed.

Chat discovery should not suggest people; starting a new relationship requires searching an exact username. Status browsing belongs in the chat surface and is limited to mutual contacts, while the status page is for managing the signed-in user's own posts, listed one per card.

**Why:** The user explicitly requested direct username lookup, mutual-contact-only status viewing, and a personal status page with separate entries.

**How to apply:** Use reciprocal follows or an existing private chat as the contact relationship, and enforce status access for both status metadata and attached media. The chat shortcut opens a full-screen, auto-advancing sequence of mutual contacts' statuses, never the personal status-management page. Keep suggestions out of chat discovery.

**Why:** The user explicitly asked to watch friends' statuses one after another from the chat shortcut, with animation, without being sent to their own status page.

In chat, place mutual-status rings inline before the VastMind inbox title. Keep the new-conversation action at the lower-right edge, just above the navigation menu, while alerts stay in the header.

**Why:** The user requested the status indicator before the chat title and the new-chat control lowered toward the menu.

**How to apply:** Keep status circles tappable and limited to mutual contacts. Do not move the alerts control away from its top-right header position.
