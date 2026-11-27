# LinkedIn content for Whiteboard.io

> **Clarification:** Whiteboard.io is a collaborative whiteboard, not a LinkedIn publishing tool. There is no LinkedIn OAuth, share API, scheduler, or post composer in the codebase. This file contains copy **about** the project that you can paste into LinkedIn, plus a suggested carousel outline for the existing showcase image (`whiteboard_io_linkedin_post.jpg`).

---

## 1. Paste-ready LinkedIn post (main announcement)

Most team whiteboards still feel like a video call with a drawing app bolted on.

So I built **Whiteboard.io** — an all-in-one real-time visual collaboration workspace that brings the canvas, the conversation, and the diagram generation into one browser tab.

What it does:

- **Infinite Canvas 2D board** — pen, highlighter, eraser, shapes, icons, sticky notes, text, wire connectors, multi-select, undo/redo, alignment guides, grid snap, minimap navigation, and touch gestures.
- **Real-time rooms** — Socket.IO rooms with live cursors, optimistic stroke streaming, batch updates, presence, and role-aware host controls.
- **Built-in voice** — a peer-to-peer WebRTC audio mesh with speaking halos, a waveform visualizer, mute/deafen, and volume controls. No separate meeting link.
- **Multi-provider AI diagramming** — turn a prompt into editable mind maps, flowcharts, sticky boards, and architecture diagrams using Gemini, Groq, NVIDIA NIM, OpenRouter, DeepSeek, local Ollama, or a procedural fallback. Follow-up chat refines the diagram with highlighted visual diffs.
- **Accountability for shared boards** — creator/last-editor attribution, Blame Mode, an Activity Timeline, and a 15-second Vote-to-Clear consensus flow.
- **Solo and offline continuity** — autosave to IndexedDB with cross-tab merge, then “Share & Go Live” when you are ready to collaborate.
- **Export-ready visuals** — PNG, SVG, JPEG, WebP, and JSON with a live preview, scale options, and transparent backgrounds.

Under the hood: React 19, TypeScript, Vite, Tailwind CSS, Node.js/Express, Socket.IO, MongoDB, WebRTC, and a provider-agnostic AI layer with caching, queue pacing, and circuit breakers. CI runs typechecks, tests, builds, docs validation, and secret scanning.

It is self-hostable, MIT-licensed, and live at **https://whiteboard-io-1.onrender.com/** — open it in two tabs or two devices to see the collaboration in action.

If you work on distributed teams, teach, or sketch systems for a living: which workflow would you want to see next?

`#WebDevelopment #RealTimeCollaboration #SocketIO #WebRTC #GenerativeAI #React #TypeScript #OpenSource`

---

## 2. Short post / showcase-image caption

One browser tab instead of “whiteboard + meeting link + AI tab”.

I built **Whiteboard.io**: an infinite-canvas workspace with real-time rooms, peer-to-peer WebRTC voice, multi-provider AI diagram generation, contributor attribution, and export to PNG/SVG/JPEG/WebP/JSON.

Built with React 19, TypeScript, Node.js, Socket.IO, MongoDB, and WebRTC. Self-hostable, MIT-licensed, and live at https://whiteboard-io-1.onrender.com/

`#BuildInPublic #OpenSource #WebRTC #SocketIO #GenerativeAI`

---

## 3. Technical variant (for an engineering audience)

I recently finished a full-stack project that forced me to think about latency, consistency, and failure modes at the same time.

**Whiteboard.io** is a real-time distributed collaborative whiteboard. The interesting engineering problems were:

- **Low-latency drawing:** Canvas 2D rendering with a spatial index, point simplification, live stroke streaming, and optimistic local updates.
- **Authoritative shared state:** Socket.IO room isolation, server-issued identity, strict payload allowlists, element locks, host permission migration, and debounced incremental MongoDB writes.
- **Voice without a media server:** browser WebRTC peer connections with SDP/ICE signaling relayed over Socket.IO, plus session epochs and recovery windows so stale callbacks cannot corrupt a new connection.
- **AI that degrades gracefully:** six configurable engines plus a procedural fallback, protected by rate limits, a response cache, an outbound queue, circuit breakers, and visual diffs for chat-based revisions.
- **Governance:** creator/last-editor attribution, Blame Mode, Activity Timeline, and majority Vote-to-Clear.

Stack: React 19, TypeScript, Vite, Tailwind, Node.js, Express, Socket.IO, MongoDB, WebRTC, Google OAuth, and Node’s built-in test runner in CI.

Live demo: https://whiteboard-io-1.onrender.com/ · Source: https://github.com/PARASMANI-KHUNTE/Whiteboard.io

`#SoftwareEngineering #DistributedSystems #FullStack #NodeJS #WebRTC`

---

## 4. LinkedIn “Add project” entry

**Project name:** Whiteboard.io — Real-Time Collaborative Whiteboard  
**Role:** Creator / Full-Stack Developer  
**Link:** https://whiteboard-io-1.onrender.com/  
**Source:** https://github.com/PARASMANI-KHUNTE/Whiteboard.io  
**Dates:** September 2026 – Present (started as an MCA Semester 3 minor project)

**Description:**

> An all-in-one real-time visual collaboration workspace built in the browser. Whiteboard.io combines an infinite Canvas 2D whiteboard with Socket.IO room sync, live cursors, peer-to-peer WebRTC voice, multi-provider AI diagram generation, and export to PNG, SVG, JPEG, WebP, and JSON.
>
> I designed the authoritative room model, server-issued identity and permission flow, strict canvas payload validation, debounced MongoDB persistence, and the AI resilience layer (caching, queue pacing, circuit breakers, and procedural fallback). The client includes attribution with Blame Mode, an Activity Timeline, a command palette, solo/offline autosave with cross-tab merge, and accessibility-focused modal and context-menu behaviour.
>
> Built with React 19, TypeScript, Vite, Tailwind CSS, Node.js, Express, Socket.IO, MongoDB, WebRTC, Google OAuth, and Node’s built-in test runner. Deployed on Render; MIT-licensed and self-hostable.

**Skills to tag:** React · TypeScript · Node.js · Express · Socket.IO · MongoDB · WebRTC · Tailwind CSS · Vite · Google OAuth · Generative AI · CI/CD

---

## 5. Profile headline and About blurb

**Headline option:**

> Full-stack developer | Real-time collaboration, WebRTC & AI-assisted tools | Creator of Whiteboard.io

**About snippet:**

> I build web applications where people can think together in real time. My main project, Whiteboard.io, is an infinite-canvas collaborative workspace with Socket.IO sync, peer-to-peer WebRTC voice, multi-provider AI diagramming, and built-in contributor attribution. I care about low-latency UX, authoritative shared state, and systems that fail gracefully.

---

## 6. Carousel outline for the existing showcase image

Use `whiteboard_io_linkedin_post.jpg` (1376×768, showing the brand and collaborators) as the cover or final slide.

| Slide | Message | Visual suggestion |
|---|---|---|
| 1 | **Whiteboard.io** — one tab for canvas, voice, and AI | Existing showcase image |
| 2 | The problem: whiteboard tab + meeting link + AI tab = lost context | Three disconnected tabs, then one merged tab |
| 3 | Infinite canvas + real-time rooms | Screenshot of board with live cursors |
| 4 | Talk while you draw: WebRTC voice mesh | Speaking halos / waveform visualizer |
| 5 | Prompt → editable diagram → chat refinement | AI modal + generated flowchart |
| 6 | Trust and portability: attribution, Blame Mode, Vote-to-Clear, 5 export formats | Activity timeline + export modal |
| 7 | **Try it live** — https://whiteboard-io-1.onrender.com/ · MIT / self-hostable | Logo + URL + GitHub link |

---

## 7. Claim safety: say this, not that

| Safe to say | Avoid saying | Why |
|---|---|---|
| “Automated typechecks, tests, builds, docs validation, and secret scanning in CI” | An exact test count such as “204 tests” or “222 tests” | Counts conflict across README, decks, and current source inspection. |
| “Multi-provider AI with cloud and local engines plus procedural fallback” | “Gemini-only” or “guaranteed 100% AI uptime” | Code supports Gemini, Groq, NVIDIA NIM, OpenRouter, DeepSeek, and Ollama; failover is best-effort. |
| “Single-server rooms today; Redis/SFU/CRDT/E2EE are roadmap items” | “Infinite scalability”, “Socket.io cluster”, “end-to-end encrypted voice” | Not implemented; current docs explicitly list these as future work. |
| “PNG, SVG, JPEG, WebP, and JSON export” | “PDF export” | PDF is roadmap, not shipped. |
| “Debounced MongoDB persistence” | An exact debounce/TTL number | Docs and code disagree on timing and token TTL. |
| “Sessions use opaque bearer tokens and password hashing with PBKDF2-SHA512” | “JWT auth” or “tokens are unreadable by client script” | No JWT is issued; tokens are stored in `localStorage`. |
| “Room-code and direct-link sharing” | “QR-code sharing” | QR code is documented but not implemented in source. |
| “Built-in voice depends on browser permission and STUN/TURN/network conditions” | “Voice always works with zero setup” | Preview iframes can block microphones; TURN is configurable. |
| “Create and export visuals for LinkedIn manually” | “Posts directly to LinkedIn” | No LinkedIn API integration exists. |

---

## 8. Pre-publish checklist

- Replace the `September 2026 – Present` dates if you want a narrower range (first commit: 2026-09-06; latest feature work: 2026-11-26).
- Add the live URL as the project link and the GitHub URL as the source link.
- Attach the showcase image or a 2–3 image carousel; LinkedIn posts with a visual generally read better than text alone.
- If you mention the academic context, keep it in the project entry rather than the main technical post unless your audience expects it.
