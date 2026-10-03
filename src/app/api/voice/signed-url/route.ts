// Signed URL for the private ElevenLabs agent (API key never reaches the browser).
export async function GET() {
  const key = process.env.ELEVENLABS_API_KEY;
  const agent = process.env.ELEVENLABS_AGENT_ID;
  if (!key || !agent) return Response.json({ error: "ElevenLabs not configured" }, { status: 501 });
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agent}`, { headers: { "xi-api-key": key } });
  if (!r.ok) return Response.json({ error: `ElevenLabs ${r.status}: ${await r.text()}` }, { status: 502 });
  return Response.json(await r.json());
}
