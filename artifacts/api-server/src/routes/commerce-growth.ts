import { assert, uuid } from "../lib/social";
import type { CommerceContext, CommerceRoute } from "../lib/commerce/http";

const PLANS = [
  { id: "free", name: "Free", features: ["Organic posts and short videos", "Public shop and channel tools", "Basic first-party campaign links"] },
  { id: "creator", name: "Creator", features: ["Plan post promotions for a future billing launch", "Creator profile and content tools", "Badge application requires paid eligibility and manual review"] },
  { id: "business", name: "Business", features: ["Plan post, channel, and product promotions", "Seller catalog, orders, coupons, and team tools", "Badge application requires paid eligibility and manual review"] },
] as const;
const TIERS = new Set(["free", "creator", "business"]);
const SUBSCRIPTION_STATES = new Set(["free", "active", "pending", "past_due", "cancelled"]);

function reviewerIds() {
  return new Set((process.env.VASTMIND_PLATFORM_ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean));
}
function isReviewer(userId: string) {
  return reviewerIds().has(userId);
}
function verificationShape(row: Record<string, any> | undefined, eligibleForBadge: boolean) {
  return row ? {
    applicationId: row.id,
    state: row.state,
    businessName: row.business_name,
    website: row.website,
    reason: row.reason,
    reviewNote: row.review_note ?? "",
    eligibleForBadge,
  } : {
    applicationId: null,
    state: "not_submitted",
    businessName: "",
    website: "",
    reason: "",
    reviewNote: "",
    eligibleForBadge,
  };
}
function promotionShape(row: Record<string, any>) {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    name: row.name,
    objective: row.objective,
    desiredDailyBudgetMinor: row.desired_daily_budget_minor ?? null,
    currency: row.currency ?? null,
    durationDays: row.duration_days,
    state: row.state,
    createdAt: row.created_at,
  };
}
async function subscriptionAccess(userId: string, q: CommerceContext["q"]) {
  const [row] = await q("SELECT plan,status FROM member_subscriptions WHERE user_id=$1", [userId]);
  const plan = row && TIERS.has(row.plan) ? row.plan : "free";
  const status = row && SUBSCRIPTION_STATES.has(row.status) ? row.status : "free";
  const entitled = status === "active" && plan !== "free";
  return { plan: entitled ? plan : "free", status, entitled };
}
async function getVerification(userId: string, q: CommerceContext["q"], eligibleForBadge: boolean) {
  const [row] = await q("SELECT * FROM verification_applications WHERE user_id=$1", [userId]);
  return verificationShape(row, eligibleForBadge);
}
function requireReviewer(c: CommerceContext) {
  assert(isReviewer(c.u), 403, "Platform reviewer access is not configured for this account");
}

/** Promotion drafts and verification review. No payment or paid delivery is performed here. */
export default function growth(route: CommerceRoute) {
  route("get", "/commerce/growth/overview", "GetGrowthOverview", async (c) => {
    const subscription = await subscriptionAccess(c.u, c.q);
    const [promotionRows, verificationRows] = await Promise.all([
      c.q("SELECT * FROM growth_promotions WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100", [c.u]),
      c.q("SELECT * FROM verification_applications WHERE user_id=$1", [c.u]),
    ]);
    return {
      billingEnabled: false,
      currentPlan: subscription.plan,
      subscriptionStatus: subscription.status,
      isPlatformReviewer: isReviewer(c.u),
      plans: PLANS,
      promotions: promotionRows.map(promotionShape),
      verification: verificationShape(verificationRows[0], subscription.entitled),
    };
  });

  route("post", "/commerce/growth/promotions", "CreateGrowthPromotion", async (c) => {
    const b = c.b;
    const name = b.name.trim();
    assert(name.length > 0, 400, "Campaign name is required");
    if (b.desiredDailyBudgetMinor > 0) {
      assert(typeof b.currency === "string" && /^[A-Za-z]{3}$/.test(b.currency), 400, "Choose a three-letter currency for the planning budget");
    }
    const currency = b.currency ? String(b.currency).toUpperCase() : null;
    if (b.targetType === "post") {
      assert((await c.q("SELECT 1 FROM posts WHERE id=$1 AND author_id=$2 AND surface='feed' AND community_id IS NULL", [b.targetId, c.u])).length > 0, 404, "Choose your own Feed post");
    } else if (b.targetType === "channel") {
      assert((await c.q("SELECT 1 FROM channels WHERE id=$1 AND owner_id=$2", [b.targetId, c.u])).length > 0, 404, "Choose a channel you own");
    } else if (b.targetType === "product") {
      assert((await c.q(`SELECT 1 FROM shop_products p JOIN shop_stores s ON s.id=p.shop_id
        WHERE p.id=$1 AND s.owner_id=$2 AND p.is_published=true`, [b.targetId, c.u])).length > 0, 404, "Choose a published product from your shop");
    } else {
      assert(false, 400, "Unsupported promotion target");
    }
    const id = uuid();
    const [row] = await c.q(`INSERT INTO growth_promotions
      (id,owner_id,target_type,target_id,name,objective,desired_daily_budget_minor,currency,duration_days,state)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft') RETURNING *`,
    [id, c.u, b.targetType, b.targetId, name, b.objective, b.desiredDailyBudgetMinor ?? null, currency, b.durationDays]);
    return promotionShape(row);
  }, 201);

  route("patch", "/commerce/growth/promotions/:promotionId", "UpdateGrowthPromotion", async (c) => {
    const [row] = await c.q("SELECT * FROM growth_promotions WHERE id=$1 AND owner_id=$2", [c.p.promotionId, c.u]);
    assert(row, 404, "Promotion draft not found");
    assert(row.state === "draft" || row.state === "cancelled", 409, "Only a draft can be cancelled");
    const [updated] = await c.q("UPDATE growth_promotions SET state='cancelled' WHERE id=$1 RETURNING *", [row.id]);
    return promotionShape(updated);
  });

  route("get", "/commerce/growth/verification", "GetGrowthVerification", async (c) => {
    const subscription = await subscriptionAccess(c.u, c.q);
    return getVerification(c.u, c.q, subscription.entitled);
  });

  route("post", "/commerce/growth/verification", "SubmitGrowthVerification", async (c) => {
    const businessName = c.b.businessName.trim();
    const website = c.b.website.trim();
    const reason = c.b.reason.trim();
    if (website) {
      let url: URL;
      try { url = new URL(website); } catch { assert(false, 400, "Enter a complete website URL"); }
      assert(["http:", "https:"].includes(url!.protocol), 400, "Website must use HTTP or HTTPS");
    }
    const id = uuid();
    const [row] = await c.q(`INSERT INTO verification_applications
      (id,user_id,business_name,website,reason,state,review_note,reviewed_by,reviewed_at)
      VALUES ($1,$2,$3,$4,$5,'pending','',NULL,NULL)
      ON CONFLICT (user_id) DO UPDATE SET business_name=EXCLUDED.business_name,website=EXCLUDED.website,
        reason=EXCLUDED.reason,state='pending',review_note='',reviewed_by=NULL,reviewed_at=NULL,created_at=now()
      WHERE verification_applications.state='rejected'
      RETURNING *`, [id, c.u, businessName, website, reason]);
    assert(row, 409, "A verification request is already pending or approved");
    return verificationShape(row, false);
  }, 200);

  route("get", "/commerce/growth/review-queue", "GetGrowthReviewQueue", async (c) => {
    requireReviewer(c);
    return c.q(`SELECT a.id AS "applicationId",u.id AS "userId",u.name,u.username,
      a.business_name AS "businessName",a.website,a.reason,a.created_at AS "createdAt"
      FROM verification_applications a JOIN users u ON u.id=a.user_id
      WHERE a.state='pending' ORDER BY a.created_at ASC LIMIT 100`);
  });

  route("patch", "/commerce/growth/verification/:applicationId", "ReviewGrowthVerification", async (c) => {
    requireReviewer(c);
    const [application] = await c.q("SELECT * FROM verification_applications WHERE id=$1 AND state='pending' FOR UPDATE", [c.p.applicationId]);
    assert(application, 404, "Pending verification request not found");
    const subscription = await subscriptionAccess(application.user_id, c.q);
    if (c.b.decision === "approved") assert(subscription.entitled, 409, "Badge approval requires an active paid subscription; billing is currently disabled");
    const [row] = await c.q(`UPDATE verification_applications SET state=$1,review_note=$2,reviewed_by=$3,reviewed_at=now()
      WHERE id=$4 RETURNING *`, [c.b.decision, c.b.reviewNote.trim(), c.u, application.id]);
    // A badge is never self-awarded. A future billing integration must revoke it if entitlement ends.
    await c.q("UPDATE users SET verified_badge=$1 WHERE id=$2", [c.b.decision === "approved", application.user_id]);
    c.impact.add(application.user_id);
    const entitlement = await subscriptionAccess(application.user_id, c.q);
    return verificationShape(row, entitlement.entitled);
  });
}
