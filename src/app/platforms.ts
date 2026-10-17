/** The facts the app owns. Gemma only writes the words in the middle. */
export type PlatformId = "note" | "instagram" | "linkedin" | "short";
export type Tone = "warm" | "professional" | "playful";

export interface Settings {
  signoff: string; // e.g. "🖤 Tanya"
  tone: Tone;
  hashtags: boolean;
}

export interface PostInput {
  title: string;
  link: string;
  body: string;
}

export interface Platform {
  id: PlatformId;
  label: string;
  icon: string;
  limit: number; // hard character limit the app enforces
  hashtagMax: number; // 0 = none
  maxTokens: number;
  task: string; // what Gemma should write
  /** How the app handles the link, so Gemma never has to (or gets to) write one. */
  linkLine: (link: string) => string;
  /** A separate "first comment" box, for platforms that bury posts with links. */
  firstComment?: (link: string) => string;
  signoff: boolean;
  tip: string;
}

export const PLATFORMS: Platform[] = [
  {
    id: "note",
    label: "Substack Note",
    icon: "📝",
    limit: 1200,
    hashtagMax: 0,
    maxTokens: 140,
    signoff: false,
    task: "a Substack Note: 2 to 4 short sentences that make readers want to open the post. Sound like a person talking to friends, not an ad.",
    linkLine: () => "",
    tip: "Attach the post itself to the Note so readers can tap straight in.",
  },
  {
    id: "instagram",
    label: "Instagram caption",
    icon: "📸",
    limit: 2200,
    hashtagMax: 5,
    maxTokens: 260,
    signoff: true,
    task: "an Instagram caption: a strong first line that stops the scroll, then 2 or 3 short paragraphs, with 2 to 4 fitting emojis.",
    linkLine: (link) => (link ? "New post is up. Link in bio 🔗" : ""),
    tip: "Instagram captions can’t hold clickable links, so put the link in your bio or a story link sticker.",
  },
  {
    id: "linkedin",
    label: "LinkedIn post",
    icon: "💼",
    limit: 3000,
    hashtagMax: 3,
    maxTokens: 300,
    signoff: false,
    task: "a LinkedIn post: a one-line hook, then 3 to 5 short lines about the lesson or takeaway, professional but personal. End with one question that invites comments.",
    linkLine: (link) => (link ? "Full post in the first comment 👇" : ""),
    firstComment: (link) => (link ? `Here’s the full post: ${link}` : ""),
    tip: "LinkedIn tends to show posts with links to fewer people, so the link goes in the first comment.",
  },
  {
    id: "short",
    label: "X / Threads / Bluesky",
    icon: "💬",
    limit: 280,
    hashtagMax: 1,
    maxTokens: 90,
    signoff: false,
    task: "one short social post under 200 characters. One idea, punchy, no lists.",
    linkLine: (link) => link,
    tip: "Links count as about 23 characters on X. The app saves room for yours.",
  },
];

const TONES: Record<Tone, string> = {
  warm: "warm, honest and friendly",
  professional: "clear, confident and professional",
  playful: "playful, upbeat and a little funny",
};

/** Builds one focused prompt per platform. Small models do best with one clear job. */
export function promptFor(
  p: Platform,
  post: PostInput,
  excerpt: string,
  s: Settings,
): string {
  return [
    `You help an independent writer share their new post. Write ${p.task}`,
    `Write in first person as the author, in a ${TONES[s.tone]} voice.`,
    "Use ONLY ideas from the POST below. Do not invent facts, numbers, names, quotes or events.",
    "Do not include links, hashtags, a title line, or a sign-off. Reply with the text only, no preamble.",
    "",
    post.title ? `POST TITLE: ${post.title}` : "",
    `POST:\n${excerpt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function topicsPrompt(post: PostInput, excerpt: string): string {
  return [
    "List 6 short topics for this post, one or two words each, separated by commas. Reply with the list only.",
    post.title ? `POST TITLE: ${post.title}` : "",
    `POST:\n${excerpt.slice(0, 1200)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
