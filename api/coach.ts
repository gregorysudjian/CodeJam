// POST /api/coach (docs/CONTRACTS.md, "Server endpoint"). Owner: backend (Greg).
//
// Verifies the player's Supabase token, reads their profile and last sessions through a client
// that carries that token (so row-level security applies here too; no service key), asks Claude
// for a recap, a tip and the next session, validates the answer, and returns a CoachAdvice.
// Any failure returns an error status; the client then uses the rule-based coach.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import {
  COACH_MAX_TOKENS,
  COACH_MODEL,
  COACH_SCHEMA,
  COACH_TIMEOUT_MS,
  HISTORY_LIMIT,
  SYSTEM_PROMPT,
  bearerToken,
  buildUserPrompt,
  parseAdvice,
  readSessionId,
  type ProfileFacts,
  type SessionFacts,
} from './_lib/advice.js';

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request): Promise<Response> {
  const token = bearerToken(request.headers.get('authorization'));
  if (!token) return json({ error: 'missing token' }, 401);

  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return json({ error: 'server not configured' }, 500);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const sessionId = readSessionId(body);
  if (!sessionId) return json({ error: 'sessionId must be a uuid' }, 400);

  const sb = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await sb.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'invalid token' }, 401);

  const [profileRes, sessionsRes] = await Promise.all([
    sb
      .from('profiles')
      .select('display_name, goal, level, weekly_goal_min')
      .eq('id', auth.user.id)
      .maybeSingle<ProfileFacts>(),
    sb
      .from('sessions')
      .select(
        'id, workout, mode, duration_sec, active_sec, difficulty, score, best_streak, cleared, hit, accuracy, kcal, reps, missed, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)
      .returns<SessionFacts[]>(),
  ]);
  if (profileRes.error || sessionsRes.error) return json({ error: 'could not load history' }, 502);
  const sessions = sessionsRes.data ?? [];
  const latest = sessions.find((s) => s.id === sessionId);
  if (!latest) return json({ error: 'session not found' }, 404);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: 'coach not configured' }, 503);

  const client = new Anthropic({ apiKey, timeout: COACH_TIMEOUT_MS, maxRetries: 0 });
  try {
    const response = await client.beta.messages.create({
      model: COACH_MODEL,
      max_tokens: COACH_MAX_TOKENS,
      // On a safety decline, the API re-runs the request on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'low', // a short, simple answer; keeps the reply well inside the 7 s budget
        format: { type: 'json_schema', schema: COACH_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(profileRes.data, sessions, sessionId) }],
    });
    if (response.stop_reason !== 'end_turn') {
      return json({ error: `coach stopped: ${response.stop_reason}` }, 502);
    }
    const text = response.content.find((b) => b.type === 'text');
    const advice = parseAdvice(text?.type === 'text' ? text.text : undefined, latest.mode);
    if (!advice) return json({ error: 'coach answer failed validation' }, 502);
    return json(advice);
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError)
      return json({ error: 'coach timed out' }, 504);
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'coach rate limited' }, 429);
    if (err instanceof Anthropic.APIError) return json({ error: `coach error ${err.status}` }, 502);
    return json({ error: 'coach unavailable' }, 502);
  }
}
