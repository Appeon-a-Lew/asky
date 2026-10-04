import "server-only";

// ElevenLabs Scribe: speech-to-text with word timestamps and speaker diarization.

export interface SttUtterance {
  speaker: string; // "speaker_0" …
  text: string;
  start: number; // seconds
  end: number;
}

type Word = { text: string; start: number; end: number; type: "word" | "spacing" | "audio_event"; speaker_id?: string };

export async function transcribe(audio: Blob, filename: string, opts: { language?: string; speakers?: number } = {}): Promise<{ language?: string; text: string; utterances: SttUtterance[]; model: string }> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY missing — speech-to-text needs ElevenLabs");
  let lastError = "";
  for (const model of [process.env.ELEVENLABS_STT_MODEL, "scribe_v2", "scribe_v1"].filter(Boolean) as string[]) {
    const form = new FormData();
    form.set("model_id", model);
    form.set("file", audio, filename);
    form.set("diarize", "true");
    form.set("timestamps_granularity", "word");
    form.set("tag_audio_events", "false");
    if (opts.speakers) form.set("num_speakers", String(opts.speakers));
    if (opts.language) form.set("language_code", opts.language);
    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: form });
    if (!r.ok) {
      lastError = `${model}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`;
      if (r.status === 400 || r.status === 422 || r.status === 404) continue; // unknown model → try the next
      throw new Error(`speech-to-text ${lastError}`);
    }
    const j = (await r.json()) as { language_code?: string; text: string; words?: Word[] };
    return { language: j.language_code, text: j.text, utterances: group(j.words ?? []), model };
  }
  throw new Error(`speech-to-text failed: ${lastError}`);
}

/** Words → turns: a new utterance whenever the speaker changes. */
function group(words: Word[]): SttUtterance[] {
  const out: SttUtterance[] = [];
  for (const w of words) {
    if (w.type === "audio_event") continue;
    const sp = w.speaker_id ?? "speaker_0";
    const cur = out[out.length - 1];
    if (cur && cur.speaker === sp) {
      cur.text += w.text;
      if (w.type === "word") cur.end = w.end;
    } else if (w.type === "word") {
      out.push({ speaker: sp, text: w.text, start: w.start, end: w.end });
    }
  }
  return out.map((u) => ({ ...u, text: u.text.replace(/\s+/g, " ").trim() })).filter((u) => u.text);
}
