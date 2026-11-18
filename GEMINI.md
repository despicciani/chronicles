# CHRONICLE (`rpg-tabletop`) — Mandatory UI/UX & Architecture Rules

Whenever editing or creating files in `C:\Users\gabri\rpg-tabletop`, always follow these mandatory design and engineering rules (and activate the `chronicle-fantasy-ui` skill for full visual recipes):

1. **Zero "AI Slop" Visuals:**
   - **Never** display plain 2-letter text initials (`"DV"`, `"GA"`, `"E"`) inside flat colored circles for tokens or portraits. Always render illustrated SVG creature/class heraldic artwork inside an engraved metallic/stone coin bezel (`TokenPortrait.tsx`) when `imageUrl` is empty.
   - **Never** use SaaS-style `rounded-full` floating pill bars, generic neon Tailwind badges, `animate-bounce`, or spinning dashed circles. Use beveled/chamfered obsidian & antique brass plates (`rounded-md` / `rounded-lg`), inset shadows, and SVG filigree corners (`OrnateFrame.tsx`).
   - **Never** render flat solid/gradient map backgrounds when no image is uploaded: always layer architectural dungeon flagstones / timber floor SVG textures, subtle torchlight radial glow, and deep edge vignettes.

2. **Strict Role Separation in Bottom HUD (`PlayerActionHUD.tsx`):**
   - When `role === 'player'`: display ONLY the player's own character (`myCharacter`). Never fall back to `campaign.characters[0]`. If `!myCharacter`, hide the bottom HUD while onboarding is active.
   - When `role === 'gm'`: display the **GM Tactical Command Dock** (showing the currently selected map token's live HP, CA, speed, 1-click monster/hero attacks, and quick delete, plus a Party Roster strip to inspect or delete any character).

3. **Complete Character & Token Deletion:**
   - The GM must be able to delete any character completely from the campaign (removing it from `campaign.characters`, all `maps[].tokens`, and `combat.combatants`) both from `CharacterSheetModal.tsx`, the map token menu in `StageCanvas.tsx`, and the GM Dock.
