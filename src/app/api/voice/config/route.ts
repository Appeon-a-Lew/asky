import { hasJev } from "@/lib/engine/jev";
import { hasLLM } from "@/lib/llm";

export async function GET() {
  return Response.json({
    elevenlabs: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID),
    llm: hasLLM(),
    jev: hasJev(),
  });
}
