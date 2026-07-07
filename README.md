# CODING AGENTS: READ THIS FIRST

This is a **handoff bundle** from Claude Design (claude.ai/design).

A user mocked up designs in HTML/CSS/JS using an AI design tool, then exported this bundle so a coding agent can implement the designs for real.

## What you should do — IMPORTANT

**Read the chat transcripts first.** There are 1 chat transcript(s) in `chats/`. The transcripts show the full back-and-forth between the user and the design assistant — they tell you **what the user actually wants** and **where they landed** after iterating. Don't skip them. The final HTML files are the output, but the chat is where the intent lives.

**Read `project/Thru Pass.dc.html` in full.** The user had this file open when they triggered the handoff, so it's almost certainly the primary design they want built. Read it top to bottom — don't skim. Then **follow its imports**: open every file it pulls in (shared components, CSS, scripts) so you understand how the pieces fit together before you start implementing.

**If anything is ambiguous, ask the user to confirm before you start implementing.** It's much cheaper to clarify scope up front than to build the wrong thing.

## About the design files

The design medium is **HTML/CSS/JS** — these are prototypes, not production code. Your job is to **recreate them pixel-perfectly** in whatever technology makes sense for the target codebase (React, Vue, native, whatever fits). Match the visual output; don't copy the prototype's internal structure unless it happens to fit.

**Don't render these files in a browser or take screenshots unless the user asks you to.** Everything you need — dimensions, colors, layout rules — is spelled out in the source. Read the HTML and CSS directly; a screenshot won't tell you anything they don't.

## Bundle contents

- `README.md` — this file
- `chats/` — conversation transcripts (read these!)
- `project/` — the `Thru Pass RFID Event Access` project files (HTML prototypes, assets, components)

## Implementation

The design has been implemented as three services. Colors/fonts live in `shared/tokens.js`, consumed directly by `gate-reader`; `app` keeps its own copy at `app/src/theme.js` since Metro's production web export can't resolve files outside the Expo project root.

- `server/` — Express + `node:sqlite`, real validation logic (tier check, anti-passback, blocklist), seeded with one demo attendee (Naledi Mokoena / Electric Valley '26).
- `gate-reader/` — React (Vite) kiosk screen. Polls the server so it reacts live to taps from *either* its own "simulate a tap" panel or the attendee app.
- `app/` — React Native (Expo) attendee app: Wallet → Tap to enter → Access granted/denied, wired to the same backend.

Run all three (each in its own terminal):

```
node --experimental-sqlite server/src/index.js   # http://localhost:4000
cd gate-reader && npm run dev                     # http://localhost:5174
cd app && npx expo start --web                    # http://localhost:8081
```

No physical RFID hardware exists in this environment, so the "tap" is simulated (a button in the gate reader, an auto-triggered scan after a delay in the app) — but the validation/decision logic, data model, and API are real, not stubbed.

## Deployment

`.github/workflows/deploy-pages.yml` builds `gate-reader` and `app`'s web export and publishes them to GitHub Pages on every push to `main`, at:

- `https://<org>.github.io/thrupass/gate-reader/`
- `https://<org>.github.io/thrupass/app/`

**One-time repo setup required** (needs admin access, can't be done via git push): in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.

**The backend isn't hosted anywhere yet.** Both frontends read their API base URL from a build-time variable (`VITE_API_URL` for gate-reader, `EXPO_PUBLIC_API_URL` for app), both driven off a single repo variable: set **`API_URL`** under **Settings → Secrets and variables → Actions → Variables** to wherever `server/` ends up hosted (Render, Fly.io, Railway, etc.), then re-run the workflow. Until that's set, the pages will load but every API call will fail.
