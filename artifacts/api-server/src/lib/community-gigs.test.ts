import { after, test } from "node:test";
import strict from "node:assert/strict";
import { pool } from "@workspace/db";
import { blocked, transaction, uuid, type Query, HttpError } from "./social";
import { listCommunityGigResponses, loadVisibleCommunityGig, shapeCommunityGig } from "./community-gigs";

after(() => pool.end());

async function addUser(q: Query, id: string) {
  const username = `gig${id.replaceAll("-", "")}`;
  await q("INSERT INTO users(id,name,username) VALUES($1,'Community opportunity test',$2)", [id, username]);
}

test("private community listings and responses stay within membership and block boundaries", async () => {
  const rollback = new Error("rollback community opportunity fixture");
  try {
    await transaction(async (q) => {
      const owner = uuid(), worker = uuid(), stranger = uuid(), groupId = uuid(), gigId = uuid(), responseId = uuid();
      for (const id of [owner, worker, stranger]) await addUser(q, id);
      await q("INSERT INTO communities(id,owner_id,name,description,category,is_private) VALUES($1,$2,'Private skills group','Fixture','Skills',true)", [groupId, owner]);
      for (const id of [owner, worker]) await q("INSERT INTO community_members(community_id,user_id) VALUES($1,$2)", [groupId, id]);
      const [gig] = await q(`INSERT INTO community_gigs(id,community_id,author_id,kind,title,description,category,rate_note)
        VALUES($1,$2,$3,'request','Need a tutor','Looking for someone to help with lessons.','learning','Flexible budget')
        RETURNING *`, [gigId, groupId, owner]);
      await q("INSERT INTO community_gig_responses(id,gig_id,user_id,message) VALUES($1,$2,$3,'I can help and would like to discuss the schedule.')", [responseId, gigId, worker]);

      await strict.rejects(() => loadVisibleCommunityGig(gigId, stranger, q), HttpError);
      const own = await shapeCommunityGig(gig, worker, q);
      strict.equal(own.myResponseId, responseId);
      strict.equal(own.myResponseState, "pending");
      strict.equal(own.responseCount, 1);

      await strict.rejects(() => listCommunityGigResponses(gigId, worker, q), HttpError, "members cannot read someone else's private applications");
      const ownerView = await listCommunityGigResponses(gigId, owner, q);
      strict.equal(ownerView.length, 1);
      strict.equal(ownerView[0].author.id, worker);
      strict.equal(ownerView[0].message, "I can help and would like to discuss the schedule.");

      await q("INSERT INTO blocks(user_id,target_id) VALUES($1,$2)", [owner, worker]);
      strict.equal(await blocked(owner, worker, q), true);
      strict.equal((await listCommunityGigResponses(gigId, owner, q)).length, 0);
      await strict.rejects(() => loadVisibleCommunityGig(gigId, worker, q), HttpError);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});

test("a member cannot send multiple responses to the same community listing", async () => {
  const rollback = new Error("rollback community opportunity fixture");
  try {
    await transaction(async (q) => {
      const owner = uuid(), worker = uuid(), groupId = uuid(), gigId = uuid(), responseId = uuid();
      for (const id of [owner, worker]) await addUser(q, id);
      await q("INSERT INTO communities(id,owner_id,name,description,category,is_private) VALUES($1,$2,'Public skills group','Fixture','Skills',false)", [groupId, owner]);
      await q("INSERT INTO community_members(community_id,user_id) VALUES($1,$2),($1,$3)", [groupId, owner, worker]);
      await q(`INSERT INTO community_gigs(id,community_id,author_id,kind,title,description,category)
        VALUES($1,$2,$3,'offer','Bike repair','Tune-ups in my community.','home-repairs')`, [gigId, groupId, owner]);
      await q("INSERT INTO community_gig_responses(id,gig_id,user_id,message) VALUES($1,$2,$3,'I am interested.')", [responseId, gigId, worker]);
      await q("SAVEPOINT duplicate_gig_response");
      await strict.rejects(() => q("INSERT INTO community_gig_responses(id,gig_id,user_id,message) VALUES($1,$2,$3,'One more message')", [uuid(), gigId, worker]));
      await q("ROLLBACK TO SAVEPOINT duplicate_gig_response");
      const [counts] = await q("SELECT count(*)::int AS n FROM community_gig_responses WHERE gig_id=$1 AND user_id=$2", [gigId, worker]);
      strict.equal(counts.n, 1);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});

test("standalone local listings are visible without group membership and keep responses private", async () => {
  const rollback = new Error("rollback standalone marketplace fixture");
  try {
    await transaction(async (q) => {
      const owner = uuid(), worker = uuid(), stranger = uuid(), gigId = uuid(), responseId = uuid();
      for (const id of [owner, worker, stranger]) await addUser(q, id);
      const [gig] = await q(`INSERT INTO community_gigs
        (id,community_id,author_id,kind,title,description,category,rate_note,location_label,due_date)
        VALUES($1,NULL,$2,'request','Help move a sofa','Need help moving one sofa this weekend.','errands','$40, negotiable','Oakland, California','2026-11-14')
        RETURNING *`, [gigId, owner]);

      const publicView = await shapeCommunityGig(gig, stranger, q);
      strict.equal(publicView.communityId, null);
      strict.equal(publicView.communityName, null);
      strict.equal(publicView.locationLabel, "Oakland, California");
      strict.equal(publicView.dueDate, "2026-11-14");

      await q("INSERT INTO community_gig_responses(id,gig_id,user_id,message) VALUES($1,$2,$3,'I am available Saturday and can bring a truck.')", [responseId, gigId, worker]);
      strict.equal((await listCommunityGigResponses(gigId, owner, q)).length, 1);
      await strict.rejects(() => listCommunityGigResponses(gigId, worker, q), HttpError);
      strict.equal((await shapeCommunityGig(gig, worker, q)).myResponseId, responseId);
      await q("INSERT INTO blocks(user_id,target_id) VALUES($1,$2)", [owner, worker]);
      await strict.rejects(() => loadVisibleCommunityGig(gigId, worker, q), HttpError);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
});
