import { takeVoiceSeat } from "@/lib/voiceSeats";
import { withWorkspace } from "@/lib/workspace";
// Signed URL for the private ElevenLabs agent (API key never reaches the browser).
async function handleGET() {
  const key = process.env.ELEVENLABS_API_KEY;
  const agent = process.env.ELEVENLABS_AGENT_ID;
  if (!key || !agent) return Response.json({ error: "ElevenLabs not configured" }, { status: 501 });
  if (!takeVoiceSeat()) return Response.json({ error: "All live voice seats are taken — using the browser voice" }, { status: 429 });
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agent}`, { headers: { "xi-api-key": key } });
  if (!r.ok) return Response.json({ error: `ElevenLabs ${r.status}: ${await r.text()}` }, { status: 502 });
  return Response.json(await r.json());
}

export const GET = withWorkspace(handleGET);
