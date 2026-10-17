import { Component, computed, effect, inject, signal } from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { EXCERPT_CHARS, LocalAiService } from "./local-ai.service";
import {
  PLATFORMS,
  Platform,
  PlatformId,
  PostInput,
  Settings,
  Tone,
  promptFor,
  topicsPrompt,
} from "./platforms";
import {
  assemble,
  countFor,
  excerpt,
  hashtags,
  newNumbers,
  tidy,
} from "./postprocess";
import { SAMPLE } from "./sample";

type DraftStatus = "idle" | "queued" | "writing" | "done" | "stopped" | "error";
interface Draft {
  text: string;
  live: string;
  status: DraftStatus;
  flags: string[];
}

const KEY = "ripple.state.v1";
const blank = (): Draft => ({ text: "", live: "", status: "idle", flags: [] });

interface Saved {
  post: PostInput;
  settings: Settings;
  picked: PlatformId[];
  drafts: Partial<Record<PlatformId, Draft>>;
  tags: string[];
}

function load(): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

@Component({
  selector: "app-root",
  imports: [NgTemplateOutlet],
  templateUrl: "./app.html",
  styleUrl: "./app.css",
})
export class App {
  readonly ai = inject(LocalAiService);
  readonly platforms = PLATFORMS;
  readonly tones: { id: Tone; label: string }[] = [
    { id: "warm", label: "Warm" },
    { id: "professional", label: "Professional" },
    { id: "playful", label: "Playful" },
  ];

  private readonly saved = load();
  readonly post = signal<PostInput>(
    this.saved?.post ?? { title: "", link: "", body: "" },
  );
  readonly settings = signal<Settings>(
    this.saved?.settings ?? { signoff: "", tone: "warm", hashtags: true },
  );
  readonly picked = signal<Set<PlatformId>>(
    new Set(this.saved?.picked ?? PLATFORMS.map((p) => p.id)),
  );
  readonly drafts = signal<Record<PlatformId, Draft>>(
    Object.fromEntries(
      PLATFORMS.map((p) => [
        p.id,
        {
          ...blank(),
          ...(this.saved?.drafts?.[p.id] ?? {}),
          live: "",
          status: this.saved?.drafts?.[p.id]?.text ? "done" : "idle",
        },
      ]),
    ) as Record<PlatformId, Draft>,
  );
  readonly tags = signal<string[]>(this.saved?.tags ?? []);
  readonly copied = signal<string | null>(null);
  readonly running = signal(false);
  readonly online = signal(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  private stopAll = false;

  readonly words = computed(
    () => (this.post().body.trim().match(/\S+/g) ?? []).length,
  );
  readonly canWrite = computed(
    () =>
      this.ai.state() === "ready" &&
      this.words() >= 40 &&
      this.picked().size > 0 &&
      !this.running(),
  );
  readonly hasDrafts = computed(() =>
    PLATFORMS.some((p) => this.drafts()[p.id].text),
  );

  constructor() {
    this.ai.loadIfCached();
    addEventListener("online", () => this.online.set(true));
    addEventListener("offline", () => this.online.set(false));
    // Drafts stay on this device only.
    effect(() => {
      const d = this.drafts();
      const data: Saved = {
        post: this.post(),
        settings: this.settings(),
        picked: [...this.picked()],
        tags: this.tags(),
        drafts: Object.fromEntries(
          PLATFORMS.map((p) => [
            p.id,
            { text: d[p.id].text, flags: d[p.id].flags },
          ]),
        ),
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch {
        /* private mode */
      }
    });
  }

  // ---------- inputs ----------
  setPost(field: keyof PostInput, e: Event) {
    const value = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.post.update((p) => ({ ...p, [field]: value }));
  }
  setSetting<K extends keyof Settings>(field: K, value: Settings[K]) {
    this.settings.update((s) => ({ ...s, [field]: value }));
  }
  inputValue(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  toggle(id: PlatformId) {
    this.picked.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  useSample() {
    this.post.set({ ...SAMPLE });
    this.settings.update((s) => ({ ...s, signoff: s.signoff || "— Maya" }));
  }
  clearAll() {
    this.post.set({ title: "", link: "", body: "" });
    this.drafts.set(
      Object.fromEntries(PLATFORMS.map((p) => [p.id, blank()])) as Record<
        PlatformId,
        Draft
      >,
    );
    this.tags.set([]);
  }

  // ---------- writing ----------
  private patch(id: PlatformId, d: Partial<Draft>) {
    this.drafts.update((all) => ({ ...all, [id]: { ...all[id], ...d } }));
  }

  async writeAll() {
    if (!this.canWrite()) return;
    this.running.set(true);
    this.stopAll = false;
    const todo = PLATFORMS.filter((p) => this.picked().has(p.id));
    for (const p of todo) this.patch(p.id, { status: "queued", live: "" });
    try {
      if (this.settings().hashtags && todo.some((p) => p.hashtagMax))
        await this.writeTags();
      for (const p of todo) {
        if (this.stopAll) {
          this.patch(p.id, {
            status: this.drafts()[p.id].text ? "done" : "idle",
          });
          continue;
        }
        await this.writeOne(p);
      }
    } finally {
      this.running.set(false);
    }
  }

  async again(p: Platform) {
    if (this.running() || this.ai.state() !== "ready") return;
    this.running.set(true);
    this.stopAll = false;
    try {
      if (this.settings().hashtags && p.hashtagMax && !this.tags().length)
        await this.writeTags();
      await this.writeOne(p);
    } finally {
      this.running.set(false);
    }
  }

  stop() {
    this.stopAll = true;
    this.ai.stop();
  }

  private async writeTags() {
    try {
      const raw = await this.ai.generate(
        topicsPrompt(this.post(), excerpt(this.post().body, EXCERPT_CHARS)),
        { maxTokens: 40, temperature: 0.3 },
      );
      this.tags.set(hashtags(raw, 5));
    } catch {
      this.tags.set([]);
    }
  }

  private async writeOne(p: Platform) {
    const post = this.post();
    this.patch(p.id, { status: "writing", live: "" });
    try {
      const raw = await this.ai.generate(
        promptFor(p, post, excerpt(post.body, EXCERPT_CHARS), this.settings()),
        {
          maxTokens: p.maxTokens,
          onToken: (t) => this.patch(p.id, { live: t }),
        },
      );
      const body = tidy(raw);
      if (!body) {
        this.patch(p.id, {
          status: this.stopAll ? "stopped" : "error",
          live: "",
        });
        return;
      }
      const text = assemble(p, body, this.tags(), post, this.settings());
      this.patch(p.id, {
        text,
        live: "",
        status: this.stopAll ? "stopped" : "done",
        flags: newNumbers(body, post),
      });
    } catch (e) {
      console.warn(e);
      this.patch(p.id, { status: "error", live: "" });
    }
  }

  // ---------- output ----------
  edit(id: PlatformId, e: Event) {
    const text = (e.target as HTMLTextAreaElement).value;
    this.patch(id, { text, flags: newNumbers(text, this.post()) });
  }
  count(p: Platform) {
    return countFor(p, this.drafts()[p.id].text);
  }
  async copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    this.copied.set(key);
    setTimeout(() => this.copied() === key && this.copied.set(null), 1600);
  }
}
