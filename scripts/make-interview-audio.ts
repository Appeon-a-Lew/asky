// Generates a realistic recorded expert interview with ElevenLabs voices: an
// interviewer and Sabine (accounts payable lead, 24 years) talk in German about
// how she really works. The recording is then imported like any other
// recording: ElevenLabs Scribe transcribes it, asky extracts the knowledge.
//
//   pnpm make:interview            # → public/demo/interview-sabine-de.mp3 (+ .json script)
//
// Everything in it is fictional. Needs ELEVENLABS_API_KEY and ffmpeg.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("ELEVENLABS_API_KEY missing");
const MODEL = process.env.INTERVIEW_TTS_MODEL || "eleven_multilingual_v2";
const VOICE = {
  interviewer: process.env.INTERVIEWER_VOICE_ID || "iP95p4xoKVk53GoZ742B", // Chris — charming, down-to-earth
  sabine: process.env.SABINE_VOICE_ID || "XrExE9yKIg1WjnnlVkGX", // Matilda — knowledgeable, professional
};
const OUT = path.join(process.cwd(), "public", "demo", "interview-sabine-de.mp3");

type Line = { who: keyof typeof VOICE; text: string; pause?: number };

// Corroborates what capture saw (capex, Czech approval, Nordlicht) and adds
// what a screen never shows: Skonto deadlines, bank-detail fraud, new
// suppliers, the backup approver, the low-value-asset line, month-end accruals.
const SCRIPT: Line[] = [
  { who: "interviewer", text: "Frau Weber, danke, dass Sie sich die Zeit nehmen. Wie fängt bei Ihnen ein ganz normaler Morgen in der Kreditorenbuchhaltung an?" },
  { who: "sabine", text: "Mit dem Posteingang. Aber nicht von oben nach unten. Ich sortiere zuerst nach Skonto. Wenn eine Rechnung zwei Prozent Skonto bei Zahlung innerhalb von vierzehn Tagen hat, dann kommt die nach vorne. Bei allem über tausend Euro lasse ich nie ein Skonto verfallen, das ist bares Geld." },
  { who: "interviewer", text: "Und dann codieren Sie die Rechnungen?" },
  { who: "sabine", text: "Genau. Die meisten kommen schon mit einer Kostenstelle rein. Wenn die zur Warengruppe passt, also Fracht auf achtundvierzighundert, Reinigung auf siebenundvierzigzwanzig, dann lasse ich sie so. Fracht von Schmidt ist immer in Ordnung, da brauche ich auch keine Bestellung." },
  { who: "interviewer", text: "Wann ändern Sie die Kostenstelle?" },
  { who: "sabine", text: "Bei Anlagen. Ausrüstung über fünftausend Euro ist immer Capex, also Kostenstelle null vierhundert, nicht Instandhaltung. Und ohne Anlagennummer keine Capex-Buchung. Die Nummer bekomme ich von Herrn Krause aus der Anlagenbuchhaltung." },
  { who: "interviewer", text: "Und wenn es weniger ist? Ein Laptop für neunhundert Euro zum Beispiel?" },
  { who: "sabine", text: "Da gibt es die Grenze für geringwertige Wirtschaftsgüter. Bis achthundert Euro netto geht das direkt in den Aufwand, auf siebenundvierzigzwanzig. Darüber ist es IT-Hardware auf null vierhundertzehn, auch mit Anlagennummer. Das verwechseln die Neuen am häufigsten.", pause: 0.9 },
  { who: "interviewer", text: "Gibt es Rechnungen, bei denen Sie grundsätzlich jemanden fragen?" },
  { who: "sabine", text: "Alles von unserer tschechischen Tochter, Keller CZ. Das geht immer zu Doktor Fischer im Controlling zur zweiten Freigabe, egal wie hoch der Betrag ist. Wegen der Verrechnungspreise. Und auf diesen Rechnungen steht keine Mehrwertsteuer, das ist Reverse Charge. Wenn da doch Steuer drauf ist, ist die Rechnung falsch." },
  { who: "interviewer", text: "Was machen Sie, wenn Doktor Fischer nicht da ist?" },
  { who: "sabine", text: "Dann geht es an Frau Yilmaz, die Regionalcontrollerin. Aber nur, wenn es vor dem Monatsabschluss sein muss. Sonst warte ich lieber auf ihn." },
  { who: "interviewer", text: "Gab es mal einen Fall, der richtig schiefgehen konnte?" },
  { who: "sabine", text: "Ja. Vor drei Jahren kam eine E-Mail, angeblich von einem Lieferanten: neue Bankverbindung, bitte ab sofort dorthin überweisen. Das war Betrug. Seitdem gilt bei mir: Eine Bankverbindung ändere ich nie auf Grund einer E-Mail. Ich rufe beim Lieferanten an, und zwar unter der Nummer aus unseren Stammdaten, nicht unter der aus der Mail.", pause: 1.0 },
  { who: "interviewer", text: "Und bei ganz neuen Lieferanten?" },
  { who: "sabine", text: "Da macht Thomas das Vier-Augen-Prinzip. Bevor die erste Zahlung an einen neuen Lieferanten rausgeht, prüft er die Stammdaten. Nie die gleiche Person, die angelegt hat." },
  { who: "interviewer", text: "Sie haben vorhin Nordlicht erwähnt. Was ist da los?" },
  { who: "sabine", text: "Nordlicht Bürobedarf schickt jeden Dezember doppelte Rechnungen. Wenn der Betrag genau gleich ist wie eine Rechnung, die schon bezahlt ist, dann halte ich die neue an, schreibe die Originalnummer dazu und frage nach einer Gutschrift. Vorher schaue ich aber immer in die Lieferantenhistorie." },
  { who: "interviewer", text: "Letzte Frage: Was ist beim Monatsabschluss anders?" },
  { who: "sabine", text: "Rechnungen, die nach dem dritten Arbeitstag kommen, buche ich in den nächsten Monat. Aber wenn so eine Rechnung über fünftausend Euro ist, melde ich sie dem Controlling, damit die eine Rückstellung bilden. Sonst stimmt das Ergebnis nicht." },
  { who: "interviewer", text: "Vielen Dank, Frau Weber. Das war sehr hilfreich." },
];

async function tts(line: Line, prev?: Line, next?: Line): Promise<Buffer> {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE[line.who]}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": KEY!, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text: line.text,
      model_id: MODEL,
      language_code: "de",
      // continuity between a speaker's lines makes it sound like one conversation
      previous_text: prev?.who === line.who ? prev.text : undefined,
      next_text: next?.who === line.who ? next.text : undefined,
      voice_settings: line.who === "sabine" ? { stability: 0.42, similarity_boost: 0.8, style: 0.25 } : { stability: 0.55, similarity_boost: 0.75, style: 0.15 },
    }),
  });
  if (!r.ok) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asky-interview-"));
  const parts: string[] = [];
  const silence = (sec: number) => {
    const f = path.join(dir, `sil-${sec}.mp3`);
    if (!fs.existsSync(f)) execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(sec), "-b:a", "128k", f]);
    return f;
  };
  for (const [k, line] of SCRIPT.entries()) {
    process.stdout.write(`  ${String(k + 1).padStart(2)} ${line.who.padEnd(11)} ${line.text.slice(0, 70)}…\n`);
    const f = path.join(dir, `${String(k).padStart(2, "0")}.mp3`);
    fs.writeFileSync(f, await tts(line, SCRIPT[k - 1], SCRIPT[k + 1]));
    parts.push(f, silence(line.pause ?? (line.who === "interviewer" ? 0.5 : 0.7)));
  }
  const list = path.join(dir, "list.txt");
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // re-encode so the joined file is one clean stream (a little room tone keeps it from sounding studio-dry)
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-af", "aresample=44100,highpass=f=80,acompressor=threshold=-20dB:ratio=2", "-ac", "1", "-b:a", "96k", OUT]);
  fs.writeFileSync(OUT.replace(/\.mp3$/, ".json"), JSON.stringify({ language: "de", voices: VOICE, model: MODEL, script: SCRIPT }, null, 2));
  const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", OUT]).toString());
  console.log(`✔ ${path.relative(process.cwd(), OUT)} · ${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, "0")} min · ${SCRIPT.length} turns`);
  fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
