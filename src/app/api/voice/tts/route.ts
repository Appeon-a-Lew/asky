import { chargeTTS } from "@/lib/visitors";
import { withWorkspace } from "@/lib/workspace";
// ElevenLabs text-to-speech, streamed. The app says exactly what it decided to
// say (deterministic), instead of asking the agent's LLM to repeat it.
async function handleGET(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  const text = (new URL(req.url).searchParams.get("text") ?? "").slice(0, 2500);
  if (!key) return new Response("ElevenLabs not configured", { status: 501 });
  if (!text.trim()) return new Response("no text", { status: 400 });
  if (!chargeTTS(text.length)) return new Response("voice budget used up", { status: 429 });
  const voice = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!r.ok || !r.body) return new Response(`ElevenLabs TTS ${r.status}: ${await r.text()}`, { status: 502 });
  return new Response(r.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
}

export const GET = withWorkspace(handleGET);
