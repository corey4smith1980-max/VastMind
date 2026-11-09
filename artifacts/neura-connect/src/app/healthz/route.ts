// Railway probes this route directly. It is not wrapped in Clerk.
export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "cache-control": "no-store" } },
  );
}
