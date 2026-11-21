// Owner: C. STUB — replace with the real endpoint (docs/CONTRACTS.md, "Server endpoint").
// Returning an error makes the client fall back to the rule-based coach.
export function POST(): Response {
  return Response.json({ error: 'coach not implemented yet' }, { status: 503 });
}
