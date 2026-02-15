Original prompt: Make the Stacktris web build run locally and add an easter egg so that triple-tapping the "i" in "Coins" on the double-earnings screen enables infinite coins (offline).

## 2026-02-14
- Fixed a JS SyntaxError in `webapp/source_min.js` caused by an invalid `style.fontFamily=\\\"...\\\"` token.
- The SyntaxError prevented `Module.locateFile` from being defined, which cascaded into `index.js` fetching `/index.data` instead of `/webapp/index.data` and failing with 404.
- Added a toast (`Infinite coins enabled`) when the triple-tap cheat is activated so it is observable during manual testing.
- Updated the cheat toggle: enabling sets coins to a very large value, disabling sets coins to 0.
- Moved the trigger off the main canvas. It now only listens inside the `webViewIframe` and only triggers when clicking/tapping the "Stacktris Coins" area (element containing that text).
- Updated the gesture requirement to 10 rapid taps/clicks.
- Removed the forced reload: the cheat now calls the wasm export `set_user_gems` to update the in-memory coin count immediately, and also patches `/sandbox/db` for persistence.
- Fixed the 10-tap gesture reliability: the "Stacktris Coins" area detection now climbs up the DOM tree to target the full panel (not just the smallest text node), avoids false full-screen matches, and falls back to `click` events when Pointer Events aren't supported. Added a small dedupe so `click`+`pointerup` won't double-count.
- Added a debug toast when the cheat can't find the "Stacktris Coins" area (`Coins cheat: area not found`) so it's obvious why clicks aren't counting.
- Added an automated verification script (`scripts/verify_coins_cheat.js`) and a `npm run verify:coins` command to validate: 10 taps toggles, enabling patches `/sandbox/db` high, disabling sets coins to 0.
- Added a canvas-based fallback trigger: if the "Stacktris Coins" reward prompt is rendered in the WebGL canvas (not a DOM webview), the cheat now detects the bright reward panel/card on the canvas and only counts taps inside that panel. This should make manual clicking work on the real in-game offer screen while still avoiding "click anywhere" behavior.

## TODO
- Run a local server and verify no console errors + `webapp/index.data` loads (no 404). (Done via `python3 -m http.server 5173`.)
- Validate the cheat in the actual "Stacktris Coins" rewarded screen: triple-tap the "i" and confirm the next rewarded action always succeeds.

## 2026-02-15
- Made the infinite-coins patch more compatible with the real Fancade `/sandbox/db` schema: it now updates both `gc[GAME_ID].c` and the top-level `c[GAME_ID]` entry (creating `c` if missing).
- Switched the max coins value to `999999` (matches the in-game UI cap seen in screenshots, avoids potential overflow/clamp issues).
- Made the in-memory update more robust by calling `Module._set_user_gems()` directly when available (fallback to `Module.ccall`).
- Canvas gesture listener is now attached to the parent document (still constrained to the computed HUD/card rects), so it works even when overlays/webviews are on top of the canvas.
- Webview/iframe rect detection now continues trying to find the real "Stacktris Coins" panel rect even when the HTML contains the phrase, avoiding the "click anywhere in the webview" failure mode when the first lookup happens too early.
- Updated `scripts/verify_coins_cheat.js` so it actually verifies the webview trigger (10 taps), closes the webview, then verifies the canvas triggers.
- Removed the tap-count/toast progress popups (no more "Coins cheat: N/10" or "ready" messages).
- Fixed accidental "click anywhere" counting by removing the webview full-viewport fallback and shrinking the canvas fallback hit area.
- Webview hit-testing now prefers the smallest matching "Stacktris Coins" element (not the largest panel), with padding for usability.
- Tightened webview hit-testing: clicks only count when they land inside the detected "Stacktris Coins" element rect (padding reduced from 60px to 8px) and the detector now rejects absurdly-large elements (>90% width or >60% height) and caps candidate area to 25% of the viewport.
- Canvas cheat no longer counts clicks in the center-card/upgrade area; it only counts taps in the top-right coins HUD rect.
- Added negative tests to `scripts/verify_coins_cheat.js` to ensure clicks outside the target (including center/upgrade area) do not count.
- Reverted iframe point-based hit-testing (it incorrectly counted anywhere because body contains the phrase). Webview hit-testing is back to strict rect matching from the smallest reasonable "Stacktris Coins" element.

## 2026-02-15 (follow-up)
- Disabled the canvas-based cheat trigger entirely (no auto-install) because it was still arming when clicking upgrade UI; the easter egg now only works on the "Stacktris Coins" webview screen.
- Webview target detection now matches elements containing both words (`stacktris` and `coins`) and prefers a larger containing panel (easier to hit than just the text).
- Webview listener now listens on both `pointerup` and `click` with dedupe and a small padding for usability, while still not calling `preventDefault()` / `stopPropagation()` (so the page remains clickable).
- Updated `scripts/verify_coins_cheat.js` to only verify the webview flow and added a regression check that the webview click still passes through to the page.
- Verified with `npm run verify:coins` (served via `python3 -m http.server 5174` because 5173 was already in use).
- Strengthened the webview-only hit-test further (union-of-words fallback + larger pad) and added an opt-in console debug mode via `localStorage.__stacktrisCheatDebug = "1"`.
- Reintroduced a canvas listener, but only for the "Stacktris Coins" prompt: it uses WebGL `readPixels` sampling to detect the bright beige screen (corners bright + center contains both dark and light pixels) and only then counts 10 taps within a central rect. This avoids the previous false positives in the upgrade/shop UI.
- Fixed WebGL sampling returning transparent zeros by forcing `preserveDrawingBuffer: true` when creating the WebGL context.
- Updated canvas prompt detection to match the real in-canvas "Stacktris Coins" prompt (dark background + mid panel), by detecting a centered lighter panel via `readPixels` and requiring low saturation + text-like contrast inside the panel.
- Switched canvas rect detection from "find a centered panel" to "find the panel under the user's click" (scan outward from the click point until luma drops below a threshold). This avoids missing the prompt when the panel isn't centered or spans full width.
- Reworked the canvas cheat again to avoid false positives: it now arms only when a global screen signature matches the Stacktris Coins prompt (dark edges + mid panel luma in 120-210 range), then counts taps only inside the detected mid-panel rect.
