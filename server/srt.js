// Minimal SRT parser -> [{start, end, text}] in seconds.
const toSec = (t) => {
  const m = t.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0;
};
export function parseSrt(srt) {
  return srt.replace(/\r/g, '').split(/\n\n+/).map((block) => {
    const lines = block.trim().split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) return null;
    const [a, b] = lines[i].split('-->');
    return { start: toSec(a), end: toSec(b), text: lines.slice(i + 1).join(' ').trim() };
  }).filter(Boolean);
}

// Group one-word cues into short caption chunks (for karaoke style): max 4 words, split on pauses.
export function groupWords(words, maxWords = 4, gap = 0.8) {
  const chunks = [];
  let cur = [];
  const flush = () => { if (cur.length) { chunks.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(' '), words: cur }); cur = []; } };
  for (const w of words) {
    if (!w.text) continue;
    if (cur.length && (w.start - cur[cur.length - 1].end > gap || cur.length >= maxWords)) flush();
    cur.push(w);
  }
  flush();
  return chunks;
}
