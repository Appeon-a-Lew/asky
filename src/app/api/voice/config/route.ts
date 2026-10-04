import { hasJev } from "@/lib/engine/jev";
import { hasLLM } from "@/lib/llm";
import { voiceSeatFree } from "@/lib/voiceSeats";
import { withWorkspace } from "@/lib/workspace";

async function handleGET() {
  return Response.json({
    elevenlabs: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID) && voiceSeatFree(),
    llm: hasLLM(),
    jev: hasJev(),
  });
}

export const GET = withWorkspace(handleGET);
