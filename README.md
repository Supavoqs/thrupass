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

The design has been implemented as three services, sharing `shared/tokens.js` for colors/fonts:

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
