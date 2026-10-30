import { assert, blocked, community, summary, type Query } from "./social";
import type { Row } from "./social";

/** Private communities and members who have blocked each other never leak via the marketplace. */
export async function loadVisibleCommunityGig(id: string, viewer: string, q: Query) {
  const [gig] = await q("SELECT * FROM community_gigs WHERE id=$1", [id]);
  assert(gig, 404, "Listing not found");
  const group = gig.community_id ? await community(gig.community_id, viewer, q) : null;
  assert(!group || !group.isPrivate || group.membership === "member", 404, "Listing not found");
  assert(!await blocked(viewer, gig.author_id, q), 404, "Listing not found");
  return { gig, group };
}

/** Shape a gig for public discovery without exposing other people's private responses. */
export async function shapeCommunityGig(gig: Row, viewer: string, q: Query) {
  const group = gig.community_id ? await community(gig.community_id, viewer, q) : null;
  assert(!group || !group.isPrivate || group.membership === "member", 404, "Listing not found");
  assert(!await blocked(viewer, gig.author_id, q), 404, "Listing not found");
  const [privateFields] = await q(`SELECT
    (SELECT count(*)::int FROM community_gig_responses WHERE gig_id=$1) AS "responseCount",
    (SELECT id FROM community_gig_responses WHERE gig_id=$1 AND user_id=$2) AS "myResponseId",
    (SELECT state FROM community_gig_responses WHERE gig_id=$1 AND user_id=$2) AS "myResponseState"`, [gig.id, viewer]);
  const dueDate = gig.due_date instanceof Date
    ? gig.due_date.toISOString().slice(0, 10)
    : typeof gig.due_date === "string" ? gig.due_date.slice(0, 10) : null;
  return {
    id: gig.id, communityId: gig.community_id ?? null, communityName: group?.name ?? null,
    author: await summary(gig.author_id, viewer, q), kind: gig.kind, title: gig.title,
    description: gig.description, category: gig.category, rateNote: gig.rate_note || "",
    locationLabel: gig.location_label || "", dueDate,
    state: gig.state, responseCount: privateFields.responseCount,
    myResponseId: privateFields.myResponseId ?? null, myResponseState: privateFields.myResponseState ?? null,
    createdAt: gig.created_at,
  };
}

/** Applicant messages are private between the applicant and the listing owner. */
export async function shapeCommunityGigResponse(response: Row, viewer: string, q: Query) {
  assert(!await blocked(viewer, response.user_id, q), 404, "Response not found");
  return {
    id: response.id, gigId: response.gig_id,
    author: await summary(response.user_id, viewer, q),
    message: response.message, state: response.state, createdAt: response.created_at,
  };
}

/** Only a current community member who posted the listing can read its private introductions. */
export async function listCommunityGigResponses(id: string, viewer: string, q: Query) {
  const { gig, group } = await loadVisibleCommunityGig(id, viewer, q);
  assert(!group || group.membership === "member", 403, "Join the community to view responses");
  assert(gig.author_id === viewer, 403, "Only the listing author can view responses");
  const responses = await q(`SELECT r.* FROM community_gig_responses r
    WHERE r.gig_id=$1 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=$2 AND b.target_id=r.user_id) OR (b.target_id=$2 AND b.user_id=r.user_id))
    ORDER BY r.created_at DESC LIMIT 100`, [gig.id, viewer]);
  return Promise.all(responses.map((response) => shapeCommunityGigResponse(response, viewer, q)));
}
