# LinkBoard - Changelog

## v3.16.0 - Maintenance Pass (2026-09-10)

### Bug Fixes
- **Context menu position** - Menu now opens at the cursor even when the board is scrolled down (was using page coordinates on a fixed-position element)
- **Delete dialog** - Cancelling a delete with Escape no longer leaves a stale handler behind that could resurrect deleted cards or drop newly added ones on the next delete
- **Special characters** - Titles and paths containing quotes, ampersands or angle brackets no longer break the card markup
- **Off-screen window** - Saved window position is ignored if it is no longer on a connected display
- **Missing icon.png** - File referenced by main.js and the build config now exists
- **Broken .gitignore** - Leading whitespace meant nothing was ignored; node_modules and dist were being staged
- **Menu toggles** - Stacked / Always on Top / Auto-Transparency toggles keep the menu open instead of closing it
- **URL prefix** - Only bare hostnames get https:// prepended; mailto:, ftp:, HTTP:// etc. are left alone
- **Ctrl/Cmd + N** - Shortcut from the README is now actually implemented

### Improvements
- **Grid-aware drag & drop** - Reorder indicator uses left/right halves in grid mode and top/bottom in stacked mode
- **Local image paths** - Image field accepts a plain path like C:Imagescover.png as well as a URL
- **Less disk churn** - Window bounds are saved once after a move/resize finishes instead of on every event
- **Smoother resize** - Corner resize batches movement per animation frame
- **Cleanup** - Single card template, event delegation instead of per-card listeners, dead CSS removed, corrupted saved data no longer crashes startup

---

## v2.3 - Major Visual Overhaul

### New Features
- **Theme Color Picker** - Each card can have its own theme color (affects title and default background when no image)
- **Optional Titles** - Titles are now optional; if omitted, URL is displayed more prominently
- **Overlay Text Design** - Card titles/URLs now overlay at the bottom with a gradient backdrop for readability
- **Proper Transparency** - Transparent canvas now actually works correctly

### Visual Improvements
- **Less Vertical Cards** - Reduced height from 180px to 140px for better width/height ratio
- **Near-Black Backgrounds** - Transparent or missing images show near-black (#0a0a0a) instead of gradient
- **Compact Modal** - Edit window is tighter with reduced padding throughout
- **Better Image Display** - Images fill entire card area with text overlaid elegantly
- **Text Shadows** - Subtle shadows ensure text is always readable over any image

### Removed Features
- **Middle-click dragging** - Removed entirely; use the top drag region instead

### Bug Fixes
- Window no longer expands when interacting
- Transparent canvas actually makes background transparent now

---

## v2.2 - Bug Fixes & Polish

- Fixed middle-click dragging
- Fixed transparent canvas  
- Fixed edit/delete positioning
- Grey-white text for reduced eye strain
- Smart scrollbar

---

## v2.1 - Polish Update

- Simplified card actions
- Better compact mode
- Transparent canvas option
- Window dragging
- Smart context menu

---

## v2 - Minimalist Overhaul

- Borderless window
- Right-click context menu
- Compact mode
- Always on top
- Auto-transparency
