---
name: flagship-site
description: Build a premium "Flagship" client website (tens of thousands of shekels tier) in this repo — real hero photo, Three.js 3D object with a scroll-driven camera, and a business interaction (e.g. pick a floor/apartment/product option → WhatsApp lead with context). Use when the user asks for a premium / luxury / 3D / "expensive-looking" / Flagship / "like Aven" website, a real-estate project site, or another site at the level of clients/aven-residences.
---

# Flagship site

The reference build is `website-builder/clients/aven-residences/` (frozen as git tag `flagship-v1`, live at
https://arieleilon900-bit.github.io/ariel4/website-builder/clients/aven-residences/).

## Before starting, read these in order
1. `website-builder/FLAGSHIP_RECIPE.md` — the step-by-step recipe and a map of the file (what to change where). **Follow it.**
2. `website-builder/PREMIUM_PLAYBOOK.md` — why it sells, design pillars, copy and image prompts, QA checklist.
3. `website-builder/component-library/premium-effects.md` — tested code patterns and pitfalls.

## Non-negotiables
- Start by copying `clients/aven-residences/` to `clients/<client-slug>/`, not from a blank file.
- Hebrew + `dir="rtl"`, single `index.html` + image files, no build step, Three.js from jsdelivr via importmap.
- Settle step 0 of the recipe first (central 3D object, business interaction, real hero photo, palette). Ask the user only when the brief leaves one of these unanswerable.
- Real photos only in the hero: the client's own, or free (non-Unsplash+) Unsplash images with a visible credit. Never present a photo of a real, identifiable building or product as the client's own; label it "תמונת השראה" in concept work.
- Keep fake data (prices, availability, phone numbers) marked as illustrative until the client provides real data.
- Test with `node website-builder/tools/shoot.mjs <client-slug> <outDir>` (after `npx http-server -p 8765 -s . &`) and **look at every screenshot**, desktop and mobile, before committing.
- Finish with: a featured card in the root `index.html`, an entry in `website-builder/build-log.md`, and anything newly learned added to the recipe or the premium-effects doc.
