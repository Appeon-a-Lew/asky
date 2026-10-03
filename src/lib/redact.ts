// PII redaction for transcripts before they are stored (Presidio-style
// recognizers, regex edition). Frames are protected in the app itself:
// [data-pii] fields are blurred while capture is on.

const RULES: { name: string; re: RegExp }[] = [
  { name: "IBAN", re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g },
  { name: "EMAIL", re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { name: "PHONE", re: /(?:\+|00)\d{1,3}[\s/-]?\(?\d{2,5}\)?[\s/-]?\d{3,}[\s/-]?\d{0,6}/g },
  { name: "CARD", re: /\b(?:\d[ -]?){13,19}\b/g },
];

export function redact(text: string): { text: string; found: string[] } {
  const found: string[] = [];
  let out = text;
  for (const r of RULES) {
    out = out.replace(r.re, () => {
      found.push(r.name);
      return `[${r.name}]`;
    });
  }
  return { text: out, found };
}
