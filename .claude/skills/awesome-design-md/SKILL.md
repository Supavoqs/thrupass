---
name: awesome-design-md
description: "Clone a real brand's design system into this project as a DESIGN.md file, then build UI that matches it. Source: VoltAgent/awesome-design-md, a catalog of 73+ DESIGN.md files extracted from brand sites (Stripe, Linear, Apple, Notion, Airbnb, Tesla, Claude, etc). Actions: match a brand's look, clone a design system, build UI like X, install/fetch a DESIGN.md. Use when the user names a specific brand/product as a visual reference (\"make it look like Stripe\", \"Linear-style dashboard\", \"Apple-esque landing page\")."
argument-hint: "[brand name]"
license: MIT
metadata:
  author: claudekit
  version: "1.0.0"
---

# Awesome DESIGN.md

Fetches a brand's `DESIGN.md` — a plain-text design system document (colors, type, components, layout, motion) — from the [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) catalog and drops it into the project so UI generation matches that brand's look.

This skill handles **sourcing and applying** an existing brand's design system. It does not invent a new brand identity from scratch — for that, use the `brand` or `design` skills instead.

## When to Activate

- User names a specific brand/product as a visual reference: "make this look like Stripe", "Linear-style table", "Apple-esque hero section"
- User asks to "install"/"clone"/"fetch" a DESIGN.md or the awesome-design-md catalog
- User wants to compare/blend two brand aesthetics for a new page

## Workflow

### Step 1: Identify the brand

Ask (or infer from the request) which brand/product to match. Confirm the closest catalog entry — see `references/catalog.md` for the current category list (AI/LLM platforms, dev tools, fintech, e-commerce, media, automotive, retro web, etc).

### Step 2: Locate the exact file

Folder names in the catalog are lowercase-hyphenated brand slugs. If the exact slug isn't known, browse the tree first:

```
WebFetch: https://github.com/VoltAgent/awesome-design-md/tree/main/design-md
```

to find the matching folder name.

### Step 3: Fetch the DESIGN.md

Raw file URL pattern:

```
https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/<brand-slug>/DESIGN.md
```

Fetch it with WebFetch (prompt: "return the full raw markdown verbatim"), then `Write` the content into the project — conventionally the project root as `DESIGN.md`, or `docs/design-systems/<brand-slug>.md` if the project already has (or expects) more than one reference system.

Optionally also fetch `preview.html` / `preview-dark.html` from the same folder for a visual sanity check in a browser before building:

```
https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/<brand-slug>/preview.html
```

### Step 4: Build UI from it

Each `DESIGN.md` follows the Stitch DESIGN.md format with sections for: visual atmosphere, color palette, typography rules, component styling, layout/grid principles, depth/elevation system, responsive behavior, and an agent prompt guide. Read the fetched file fully before generating any UI — treat it as the source of truth over generic style defaults.

- Follow its color palette and typography exactly (don't substitute similar-looking values).
- Match its component patterns (buttons, cards, nav) rather than the project's existing defaults, unless the user asks to blend the two.
- If this project also uses the `design-system` skill's token layers, map the DESIGN.md's raw values into primitive/semantic/component tokens rather than hardcoding them inline.
- If this project uses `ui-styling` (Tailwind/shadcn), translate the DESIGN.md spec into the Tailwind theme config instead of ad-hoc classes.

### Step 5: Confirm before overwriting

If a `DESIGN.md` already exists at the destination path, confirm with the user before overwriting — it may be a different brand reference they're actively using.

## Notes

- This is a read-only content source (public GitHub repo); nothing is installed as code or executed. "Installing" the skill means keeping this SKILL.md in `.claude/skills/`, and "installing a design" means writing the fetched `DESIGN.md` into the project.
- The catalog only covers the brands it has extracted (see `references/catalog.md`). If a requested brand isn't present, say so rather than fabricating a DESIGN.md — either pick the closest available analog or build the reference manually with the `brand` skill.
