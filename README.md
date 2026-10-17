# ✨ Ripple

**One post. Every platform. Written privately in your browser.**

Paste a blog post or newsletter and get a Substack Note, an Instagram caption, a LinkedIn post and a short post for X, Threads or Bluesky. The drafts are written by **Gemma running in your browser** with [WebLLM](https://webllm.mlc.ai), so your unpublished writing never leaves your device.

Built for the DEV Hacktoberfest Open-Source AI Challenge, Week 2: Side Hustle.

## Who it's for

Indie writers, newsletter creators and small business bloggers who publish a post and then spend another hour rewriting it for every app.

## How it works

- **Gemma does the writing.** Each platform gets its own short, focused prompt, because small models do best with one clear job.
- **The app owns the facts.** Gemma never writes links, hashtags or sign-offs. The app adds the link where each platform wants it ("Link in bio" on Instagram, a ready-to-copy first comment on LinkedIn, the link itself on X), turns Gemma's topic list into clean hashtags, adds your sign-off, and enforces each platform's character limit at a sentence boundary.
- **A safety check for made-up numbers.** If a draft contains a number that isn't in your post, the app flags it, because small models love to invent stats.
- **Cleanup.** Preambles ("Sure! Here's your caption:"), quotes, stray links and repeated sentences are stripped.
- **Private and offline.** The model downloads once and is cached by the browser. Drafts are saved in your browser's local storage only.

## Models

| Model                       | Size    | Notes                                    |
| --------------------------- | ------- | ---------------------------------------- |
| `gemma-2-2b-it-q4f16_1-MLC` | ~1.4 GB | Better writing. Best on a laptop.        |
| `gemma3-1b-it-q4f16_1-MLC`  | ~700 MB | Lighter. The only option on iPhone/iPad. |

Needs a browser with WebGPU: Chrome or Edge on desktop, or Safari on iOS 26+.

## Run it

```bash
npm install
npm run dev      # http://localhost:4200
npm run build    # static files in dist/ripple/browser
```

## Deploy on Render

`render.yaml` defines a free static site. In Render: **New → Blueprint**, pick this repo, and deploy. No server and no API keys: everything runs in the visitor's browser.

## Stack

Angular 22 (signals, zoneless), `@mlc-ai/web-llm`, Gemma, Angular service worker, Render static hosting.

## Credits

The on-device Gemma loader (crash guard, cache check, memory-friendly context settings) is adapted from my earlier project, [Off-Grid Trails](https://github.com/tmott13/off-grid-trails). Everything else in this repo was built new for this challenge. Built with Claude as a pair programmer.
