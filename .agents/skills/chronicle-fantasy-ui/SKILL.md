---
name: chronicle-fantasy-ui
description: >-
  AAA Dark-Fantasy Tabletop RPG UI/UX, Skeuomorphic Material Craft, Illustrated SVG Tokens,
  Tactical Battlemap Architecture, and Choreographed Animations for CHRONICLE. Activate this
  skill whenever designing, refactoring, styling, or animating any component, modal, HUD,
  token, dice overlay, or map in CHRONICLE (rpg-tabletop) to eliminate generic AI-slop visuals.
---

# CHRONICLE — Dark-Fantasy UI & Animation Design System (Anti-AI-Slop Runbook)

Use this skill whenever creating or improving UI components, tokens, maps, HUDs, modals, or animations in `C:\Users\gabri\rpg-tabletop`. Every screen must look like an authentic, art-directed Dark-Fantasy RPG client (*Baldur's Gate 3*, *Pathfinder: Wrath of the Righteous*, *Pillars of Eternity*, *Alchemy VTT*) — never a Tailwind SaaS dashboard.

## 1. Forbidden "AI Slop" Patterns (NEVER USE)
1. **NO Initials in Flat Colored Circles (`"DV"`, `"GA"`, `"E"`):** Always render an intricate SVG creature/class crest illustration inside a metallic coin bezel when no custom portrait image is uploaded.
2. **NO Generic Tailwind Neon Pills (`rounded-full` toolbars, `animate-bounce`, `animate-pulse` containers):** Use chamfered dark-fantasy plates (`rounded-md`/`rounded-lg`), double inset brass borders, and recessed stone sockets.
3. **NO Flat Empty Map Backgrounds:** Default tactical maps without custom images must render carved stone/wood architectural floor tiles, mortar lines, and torchlight vignette depth.
4. **NO Player HUD Stuck on GM Screen:** When `role === 'gm'`, the bottom dock must be the **GM Tactical Command Dock** (inspecting the selected token/monster/hero + Party Roster management), never falling back to a lone `campaign.characters[0]` player bar.
5. **Choreographed Animations & Visual Polish:** Always include `.hp-ghost-bar` delayed damage drain on HP bars, SVG movement path trails and targeting sightlines on `StageCanvas.tsx`, physical attacker lunge + SVG shield fracture shards in `CombatDuelOverlay.tsx`, octagonal bronze attribute medallions in `CharacterSheetModal.tsx`, and miniature portraits + diamond action gems in `InitiativeBar.tsx`.
