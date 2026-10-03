// Creates the asky ElevenLabs agent (interviewer + tutor voice).
//   ELEVENLABS_API_KEY=… pnpm setup:voice [--voice <voice_id>] [--llm <model>] [--update <agent_id>]
// Prints the agent id → put it in .env.local as ELEVENLABS_AGENT_ID.
// Afterwards, in the ElevenLabs dashboard you can enable Expressive Mode for
// the voice and tune turn-taking; skip_turn is already configured here.

import { AGENT_PROMPT, FIRST_MESSAGE } from "../src/lib/voice/prompts";

const arg = (n: string, d?: string) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);

async function main() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Set ELEVENLABS_API_KEY");
  const body = {
    name: "asky — AI Apprentice",
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE.interviewer,
        language: "en",
        prompt: {
          prompt: AGENT_PROMPT,
          llm: arg("llm", "claude-haiku-4-5"),
          temperature: 0,
          built_in_tools: {
            skip_turn: { type: "system", name: "skip_turn", description: "Call when the person is working, thinking aloud or not addressing you.", params: { system_tool_type: "skip_turn" } },
          },
        },
      },
      tts: { voice_id: arg("voice", "21m00Tcm4TlvDq8ikWAM") },
      // the app decides when to speak: be patient, never fill silence, no end-of-call on silence
      turn: { turn_timeout: 30, turn_eagerness: "patient", silence_end_call_timeout: -1, soft_timeout_config: { timeout_seconds: -1 } },
      conversation: {
        max_duration_seconds: 3600,
        client_events: ["audio", "interruption", "agent_response", "user_transcript", "agent_response_correction", "agent_tool_response", "vad_score"],
      },
    },
    platform_settings: {
      overrides: {
        conversation_config_override: {
          agent: { prompt: { prompt: true }, first_message: true, language: true },
          tts: { voice_id: true },
        },
      },
    },
  };
  // --update <agent_id> pushes the current prompt/config to an existing agent
  const update = arg("update");
  const r = await fetch(update ? `https://api.elevenlabs.io/v1/convai/agents/${update}` : "https://api.elevenlabs.io/v1/convai/agents/create", {
    method: update ? "PATCH" : "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${JSON.stringify(j)}`);
  if (update) return console.log(`✔ agent ${update} updated`);
  console.log(`✔ agent created: ${j.agent_id}\n\nAdd to .env.local:\nELEVENLABS_AGENT_ID=${j.agent_id}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
