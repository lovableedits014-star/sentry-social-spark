export type RawSegment = {
  id?: number;
  start: number;
  end: number;
  text: string;
};

export type SrtBlock = {
  index: number;
  start: number;
  end: number;
  text: string;
};

function pad(n: number, w = 2) {
  return String(Math.floor(n)).padStart(w, "0");
}

export function formatSrtTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms, 3)}`;
}

export function formatVttTime(seconds: number): string {
  return formatSrtTime(seconds).replace(",", ".");
}

/**
 * Agrupa segmentos brutos da Whisper em blocos de ~maxSeconds (default 7s)
 * e/ou maxChars (default 90) para legibilidade no Premiere.
 */
export function groupSegments(
  segments: RawSegment[],
  opts: { maxSeconds?: number; maxChars?: number } = {}
): SrtBlock[] {
  const maxSeconds = opts.maxSeconds ?? 7;
  const maxChars = opts.maxChars ?? 90;
  const blocks: SrtBlock[] = [];
  let cur: SrtBlock | null = null;

  for (const seg of segments) {
    const text = (seg.text ?? "").trim();
    if (!text) continue;
    if (!cur) {
      cur = { index: blocks.length + 1, start: seg.start, end: seg.end, text };
      continue;
    }
    const wouldText = `${cur.text} ${text}`.trim();
    const wouldDur = seg.end - cur.start;
    if (wouldDur <= maxSeconds && wouldText.length <= maxChars) {
      cur.end = seg.end;
      cur.text = wouldText;
    } else {
      blocks.push(cur);
      cur = { index: blocks.length + 1, start: seg.start, end: seg.end, text };
    }
  }
  if (cur) blocks.push(cur);
  return blocks.map((b, i) => ({ ...b, index: i + 1 }));
}

export function blocksToSrt(blocks: SrtBlock[]): string {
  return blocks
    .map(
      (b) =>
        `${b.index}\n${formatSrtTime(b.start)} --> ${formatSrtTime(b.end)}\n${b.text}\n`
    )
    .join("\n");
}

export function blocksToVtt(blocks: SrtBlock[]): string {
  const body = blocks
    .map(
      (b) =>
        `${b.index}\n${formatVttTime(b.start)} --> ${formatVttTime(b.end)}\n${b.text}\n`
    )
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

export function blocksToPlainText(blocks: SrtBlock[]): string {
  return blocks.map((b) => b.text).join(" ");
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}