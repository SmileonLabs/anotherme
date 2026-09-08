// Read-only incident snapshot. Run on stdin in the API container; credentials,
// participant identities, room names and messages are never printed.
import { createRequire } from 'node:module';
const apiRequire = createRequire('/app/artifacts/api-server/package.json');
const dbRequire = createRequire('/app/lib/db/package.json');
const { Pool } = dbRequire('pg');
const { RoomServiceClient } = apiRequire('livekit-server-sdk');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
const client = new RoomServiceClient(process.env.LIVEKIT_URL.replace(/^ws/, 'http'), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
const deadline = setTimeout(() => process.exit(2), 25000);
try {
  const { rows: counts } = await pool.query("select count(*)::int as count from calls where status in ('active', 'ringing')");
  const { rows } = await pool.query("select id, room_name, caller_id, callee_id, media, status, accepted_at, livekit_participant_count, livekit_last_observed_at from calls where status in ('active', 'ringing') or created_at > now() - interval '30 minutes' order by (status in ('active', 'ringing')) desc, created_at desc limit 10");
  console.log(JSON.stringify({ activeCalls: counts[0].count }));
  for (const row of rows) {
    let participants;
    try {
      participants = row.status !== 'active' && row.status !== 'ringing' ? [] : (await client.listParticipants(row.room_name)).map(p => ({
        role: p.identity === row.caller_id ? 'caller' : p.identity === row.callee_id ? 'callee' : 'other',
        state: p.state,
        permission: { canPublish: p.permission?.canPublish, canSubscribe: p.permission?.canSubscribe },
        tracks: p.tracks.map(t => ({ source: t.source, type: t.type, muted: t.muted, width: t.width, height: t.height, mimeType: t.mimeType })),
      }));
    } catch (error) { participants = { error: error.code ?? error.name }; }
    console.log(JSON.stringify({ callId: row.id, media: row.media, status: row.status, acceptedAt: row.accepted_at, observedParticipants: row.livekit_participant_count, lastObservedAt: row.livekit_last_observed_at, participants }));
  }
} finally { clearTimeout(deadline); await pool.end(); }
