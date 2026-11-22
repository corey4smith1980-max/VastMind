import { pool } from "@workspace/db";

export { shouldReleaseRegistration } from "./registration-orphan-policy";

/**
 * Remove synthetic accounts created for a passkey signup that never received a
 * passkey or session. A used intent is released after one minute so a failed
 * attempt such as vastmind1 can be retried; untouched intents wait 15 minutes.
 */
/** Drop a synthetic profile when session creation fails so the username can be reused. */
export async function abandonFailedRegistration(userId: string): Promise<void> {
  await pool.query(
    `WITH doomed AS (
       SELECT au.id
       FROM "user" au
       WHERE au.id = $1
         AND au.email = $1 || '@users.vastmind.invalid'
         AND NOT EXISTS (SELECT 1 FROM passkey p WHERE p.user_id = au.id)
         AND NOT EXISTS (SELECT 1 FROM "session" s WHERE s.user_id = au.id)
     ),
     removed_profiles AS (
       DELETE FROM users u USING doomed d WHERE u.id = d.id RETURNING u.id
     )
     DELETE FROM passkey_registration_intent i USING doomed d WHERE i.user_id = d.id`,
    [userId],
  );
}

/** Save the public profile only after the passkey session row exists. */
export async function finalizePasskeyRegistration(userId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [intent] } = await client.query<{
      username: string;
      display_name: string;
      recovery_public_key: string;
    }>(
      `SELECT username, display_name, recovery_public_key
       FROM passkey_registration_intent
       WHERE user_id=$1 AND used_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [userId],
    );
    if (!intent) {
      await client.query("COMMIT");
      return;
    }
    const { rows: [taken] } = await client.query(
      "SELECT id FROM users WHERE lower(username)=lower($1) AND id<>$2",
      [intent.username, userId],
    );
    if (taken) throw new Error("That VastMind ID is already in use.");
    await client.query(
      `INSERT INTO users (id, name, username, email)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, username=EXCLUDED.username`,
      [userId, intent.display_name, intent.username],
    );
    await client.query(
      `INSERT INTO account_recovery_key (user_id, public_key)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET public_key=EXCLUDED.public_key, rotated_at=now()`,
      [userId, intent.recovery_public_key],
    );
    await client.query(
      `UPDATE passkey_registration_intent
       SET used_at=now()
       WHERE user_id=$1 AND used_at IS NULL`,
      [userId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Release synthetic signups from before the session-id fix that stored a
 * passkey and never created a session. The cutoff keeps later accounts out.
 */
export async function releasePreFixPasskeyAccounts(): Promise<string[]> {
  const { rows } = await pool.query<{ username: string }>(`
    WITH doomed AS (
      SELECT DISTINCT i.user_id, u.username
      FROM passkey_registration_intent i
      JOIN "user" au ON au.id = i.user_id
      JOIN users u ON u.id = i.user_id
      WHERE au.email = i.user_id || '@users.vastmind.invalid'
        AND i.used_at IS NOT NULL
        AND u.created_at < timestamptz '2026-11-22 20:00:00+00'
        AND EXISTS (SELECT 1 FROM passkey p WHERE p.user_id = i.user_id)
        AND NOT EXISTS (SELECT 1 FROM "session" s WHERE s.user_id = i.user_id)
    ),
    removed_passkeys AS (
      DELETE FROM passkey p USING doomed d WHERE p.user_id = d.user_id RETURNING p.user_id
    ),
    removed_keys AS (
      DELETE FROM account_recovery_key k USING doomed d WHERE k.user_id = d.user_id RETURNING k.user_id
    ),
    removed_profiles AS (
      DELETE FROM users u USING doomed d WHERE u.id = d.user_id RETURNING u.username
    ),
    removed_auth AS (
      DELETE FROM "user" au USING doomed d WHERE au.id = d.user_id RETURNING au.id
    ),
    removed_intents AS (
      DELETE FROM passkey_registration_intent i USING doomed d WHERE i.user_id = d.user_id RETURNING i.user_id
    )
    SELECT DISTINCT p.username
    FROM removed_profiles p
    LEFT JOIN removed_passkeys ON true
    LEFT JOIN removed_keys ON true
    LEFT JOIN removed_auth ON true
    LEFT JOIN removed_intents ON true
  `);
  return rows.map((row) => row.username).filter((username): username is string => typeof username === "string");
}

export async function releaseOrphanRegistrations(): Promise<number> {
  const { rows: [row] } = await pool.query<{ released: number }>(`
    WITH doomed AS (
      SELECT DISTINCT i.user_id
      FROM passkey_registration_intent i
      JOIN "user" au ON au.id = i.user_id
      WHERE au.email = i.user_id || '@users.vastmind.invalid'
        AND NOT EXISTS (SELECT 1 FROM passkey p WHERE p.user_id = i.user_id)
        AND NOT EXISTS (SELECT 1 FROM "session" s WHERE s.user_id = i.user_id)
        AND (
          (i.used_at IS NOT NULL AND i.used_at < now() - interval '1 minute')
          OR i.expires_at < now() - interval '15 minutes'
          OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = i.user_id AND u.created_at < now() - interval '15 minutes'
          )
        )
    ),
    removed_profiles AS (
      DELETE FROM users u USING doomed d WHERE u.id = d.user_id RETURNING u.id
    ),
    removed_auth AS (
      DELETE FROM "user" au USING doomed d WHERE au.id = d.user_id RETURNING au.id
    ),
    removed_intents AS (
      DELETE FROM passkey_registration_intent i USING doomed d WHERE i.user_id = d.user_id RETURNING i.id
    )
    SELECT (SELECT count(*)::int FROM removed_auth) AS released
  `);
  return row?.released ?? 0;
}
