import { Platform, PostInput, Settings } from "./platforms";

/** Plain text from the pasted post: no markdown noise, no extra blank lines. */
export function cleanPost(body: string): string {
  return body
    .replace(/!\[[^\]]*]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1") // links -> text
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/[*_`>]/g, "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Start of the post, cut at a sentence so the model never sees half a thought. */
export function excerpt(body: string, max: number): string {
  const text = cleanPost(body);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
    cut.lastIndexOf("\n"),
  );
  return (end > max * 0.6 ? cut.slice(0, end + 1) : cut) + " …";
}

const PREAMBLE =
  /^(sure|okay|ok|here(’|')?s|here is|absolutely|of course)[^\n:]*:\s*/i;

/** Small models add preambles, quotes, links and repeats. Strip all of that. */
export function tidy(raw: string): string {
  let t = raw.trim().replace(PREAMBLE, "");
  t = t.replace(/^["“]|["”]$/g, "");
  t = t.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, ""); // the app owns hashtags
  t = t.replace(/^\s*(title|caption|post|note)\s*:\s*/gim, "");
  t = t.replace(/https?:\/\/\S+|www\.\S+/gi, " URLX "); // mark links so dots in them don't split sentences
  const seen = new Set<string>();
  // Keep the model's line breaks (LinkedIn and Instagram rely on them), but clean each line.
  const lines = t.split("\n").map((line) => {
    const out: string[] = [];
    for (const s of line.match(/[^.!?]+[.!?]*\s*/g) ?? []) {
      if (/\bURLX\b/.test(s)) continue; // the app owns links: drop "Visit https://…" whole
      const key = s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (!key) {
        if (out.length) out[out.length - 1] += " " + s.trim();
        continue;
      } // keep emoji-only bits
      if (seen.has(key)) continue; // drop repeated sentences, a common small-model loop
      seen.add(key);
      out.push(s.trim());
    }
    return out.join(" ");
  });
  return lines
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Turn Gemma's topic list into clean hashtags. */
export function hashtags(raw: string, max: number): string[] {
  if (!max) return [];
  const tags: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const words = part
      .replace(/^[\s\d.)#-]+/, "")
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length || words.length > 3) continue;
    const tag = words
      .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase()))
      .join("");
    if (
      tag.length < 3 ||
      tag.length > 24 ||
      tags.some((x) => x.toLowerCase() === tag.toLowerCase())
    )
      continue;
    tags.push(tag);
    if (tags.length === max) break;
  }
  return tags.map((t) => "#" + t);
}

/** Cut at the last full sentence that fits. */
export function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
    cut.lastIndexOf("."),
    cut.lastIndexOf("!"),
    cut.lastIndexOf("?"),
  );
  return (
    end > 20 ? cut.slice(0, end + 1) : cut.slice(0, max - 1) + "…"
  ).trim();
}

/** Numbers in the draft that never appear in the post: the classic small-model mistake. */
const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
];
const WORD_RE = new RegExp(`\\b(${WORDS.join("|")})\\b`, "gi");

export function newNumbers(draft: string, post: PostInput): string[] {
  // "three years" in the post makes "3 years" in the draft fine.
  const source = (post.title + " " + post.body)
    .replace(/,/g, "")
    .replace(WORD_RE, (w) => `${w} ${WORDS.indexOf(w.toLowerCase())}`);
  const known = new Set(source.match(/\d+(?:\.\d+)?/g) ?? []);
  const found = (draft.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) =>
    n.replace(/,/g, ""),
  );
  return [...new Set(found)].filter((n) => !known.has(n));
}

/** Put the pieces together. Gemma wrote the middle; the app adds the link line, sign-off and hashtags. */
export function assemble(
  p: Platform,
  body: string,
  tags: string[],
  post: PostInput,
  s: Settings,
): string {
  const link = post.link.trim();
  const extras = [
    p.linkLine(link),
    p.signoff ? s.signoff.trim() : "",
    s.hashtags ? tags.slice(0, p.hashtagMax).join(" ") : "",
  ].filter(Boolean);
  if (p.id === "short") {
    // X counts a link as ~23 characters, so reserve that much.
    const tail = [s.hashtags ? tags.slice(0, 1).join(" ") : "", link]
      .filter(Boolean)
      .join(" ");
    const room =
      p.limit - (link ? 24 : 0) - (tail.length - link.length) - (tail ? 1 : 0);
    return [fit(body, room), tail].filter(Boolean).join(" ");
  }
  const tail = extras.join("\n\n");
  return [fit(body, p.limit - tail.length - 2), tail]
    .filter(Boolean)
    .join("\n\n");
}

/** Character count the way the platform counts it (links on X count as 23). */
export function countFor(p: Platform, text: string): number {
  return p.id === "short"
    ? text.replace(/https?:\/\/\S+/g, "x".repeat(23)).length
    : [...text].length;
}
