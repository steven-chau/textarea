# textarea — Implementation Plan

**Status:** Implemented (v1)
**Date:** 2026-11-26
**Companion:** [features.md](features.md)

## 1. Approach

Ship a single static page with no build step, no runtime dependencies, and no network
calls after load. Vanilla HTML, CSS, and native ES modules. All assets (CSS, JS, icons,
favicon) are served from this repository under `/textarea/`, using relative URLs.

The app is a small state machine:

- In-memory state for notes, active note, preferences, and UI (popover, dialogs).
- `localStorage` is the only persistence layer.
- Rendering is explicit and targeted (no framework). User text is only ever written with
  `textContent` or `textarea.value`; never `innerHTML`.
- Sharing is pure client-side: encode the note into the URL fragment, decode it on load.

Two technical choices were validated before writing this plan:

1. **Gutter alignment with word wrap works.** A hidden mirror element with the same font,
   width, padding, `white-space: pre-wrap`, and `overflow-wrap: break-word` renders each
   logical line. Its measured line heights match the textarea's wrapped layout, so line
   numbers can be top-aligned per logical line and highlight bands can be positioned
   accurately. Verified with a throwaway prototype in Chromium.
2. **Toolbar undo/redo can use native history.** `document.execCommand('undo'|'redo')`
   operates on the textarea even after the button takes focus. Programmatic `.value`
   assignments reset the native history, which is fine because tab switches should start
   a fresh undo scope. See §6 for the deviation this implies.

## 2. File layout

```
/
  index.html            page shell, CSP, landmarks, dialogs, inline SVG icons
  styles.css            tokens, layout, components, light/dark themes
  theme.js              blocking script: apply stored theme before first paint
  app.js                state, rendering, events, editor layout, dialogs
  js/store.js           localStorage schema, validation, debounced persistence
  js/share.js           base64url + gzip codec for fragment payloads
  favicon.svg           self-hosted icon (no external requests)
  tests/share.test.mjs  node:test unit tests for the codec (no dependencies)
  tests/privacy.test.mjs static privacy checks over source files
  LICENSE               MIT
  README.md             what it is, privacy guarantees, local dev, deploy notes
  features.md           product spec
  plan.md               this document
```

Module imports use relative paths (`./js/share.js`), so the site works at
`https://steven-chau.github.io/textarea/` and locally.

Local development: `python3 -m http.server 8000` from the repo root, then open
`http://localhost:8000/`. No package manager, install step, or build.

## 3. Data model and persistence

### Storage keys

```
ta:v1:notes    → [{ id, name, text, highlights: [[startLine, endLine]], scrollTop, updatedAt }]
ta:v1:active   → note id
ta:v1:prefs    → { theme: "auto" | "light" | "dark", wrap: boolean }
```

### Rules

- Note IDs use `crypto.randomUUID()` with a `Date.now()` + random fallback.
- Default note name is `Note 1`; new notes get the next unused `Note N`.
- Highlight ranges are 1-based, inclusive logical line numbers, sorted and merged.
- `store.load()` validates every note: strings for `id`, `name`, `text`, finite
  `scrollTop`, arrays for highlights. Invalid entries are dropped; valid siblings survive.
  Unknown keys and future-version keys are ignored, never deleted.
- `store.saveNotes()` is debounced at 300 ms. `store.saveActive()` and
  `store.savePrefs()` write immediately. `store.flush()` runs on `pagehide` and
  `visibilitychange` (hidden).
- If a write throws (quota, privacy mode), show a persistent status message, keep the
  text in memory, and offer Download. Never silently lose input.

### Shares

Payload is `{ v: 1, n: string, t: string }` serialized as UTF-8 JSON. See §7.

### Origin caveat

GitHub Pages project sites share the `steven-chau.github.io` origin. `localStorage` is
therefore reachable by other project sites published under the same account. Keys are
namespaced, but this cannot provide strong isolation. The README and privacy dialog will
state this plainly. If strict isolation matters later, a custom domain is the fix (listed
as deferred).

## 4. Page structure and UI behaviour

### `index.html`

- `<html lang="en">`, `data-theme` set by `theme.js`.
- Head: charset, viewport, title, description, `<meta name="referrer" content="no-referrer">`,
  strict CSP meta, dual `theme-color` metas, favicon link, blocking `theme.js`, external
  `styles.css`, module `app.js`.
- Body:
  - `<header class="topbar">` with `role="tablist"` and Add button on the left; theme
    toggle and Share button on the right.
  - `<main>` with the editor pane: highlight layer, line-number gutter
    (`role="group"`), and the `<textarea>`.
  - `<footer class="statusbar">` with the Privacy button, save state, Undo, Redo, Copy,
    Clear, Download, Wrap, and stats. A visually hidden `aria-live="polite"` region sits
    outside the visible chrome.
  - Share popover (non-modal) and two native `<dialog>` elements: Privacy and a reusable
    Confirm dialog.
- All icons are inline SVG authored in the HTML. No icon font, sprite server, or CDN.
- No inline event handlers and no inline `<style>`, so CSP can stay strict.

### Tabs

- Each tab wrapper contains a `role="tab"` button and a sibling close button (never nested
  buttons). Roving tabindex; Left/Right/Home/End move and activate; F2 or double-click
  renames inline; Enter commits, Esc cancels, blur commits.
- Active tab scrolls into view after add/switch.
- Closing a non-empty note opens the Confirm dialog; empty notes close immediately.
  Closing the last tab creates a fresh empty note.
- Soft cap 20 tabs; Add disabled at the cap with a title explaining why.
- Tab labels derive from `name`; a small `.txt` suffix is visual only.

### Share popover

- Opens anchored under the Share button; width `min(360px, 100vw - 20px)`.
- Contents: status line ("Link copied"), read-only link field (selectable), Copy button,
  snapshot warning, and length warning when applicable.
- Esc, outside click, or Share again closes it; focus returns to Share.
- `aria-expanded` on the trigger; the popover has `role="dialog"` and a label.

### Privacy and Confirm dialogs

- Native `<dialog>` with `showModal()` for focus containment and Esc handling.
- Privacy copy: text stays in this browser, nothing is uploaded, no third-party code,
  shared links are snapshots, GitHub Pages sees page requests but not note text, and the
  shared-origin limitation. A user-initiated link to the repository opens in a new tab
  with `rel="noopener noreferrer"`.
- Confirm copy is parameterized; confirming returns focus sensibly.

### Status and stats

- Status text: "Saving…", "Saved in this browser", "Link copied", "Opened from link",
  storage errors. Announced via the live region.
- Stats update on input: lines (`\n` count + 1), words (whitespace-separated, trimmed),
  characters (Unicode code points), UTF-8 bytes (`TextEncoder`).
- Long notes (> 28 KB) show a non-blocking warning in the status area.

## 5. Editor mechanics

### Textarea

```html
<textarea id="editor" aria-label="Text editor"
  autocomplete="off" autocorrect="off" autocapitalize="off"
  spellcheck="false" wrap="soft"></textarea>
```

- Paste normalizes CRLF/CR to LF before insertion (intercept `paste`, read
  `clipboardData`, set the value via `setRangeText`, dispatch input). The site still never
  calls a clipboard read API.
- Tab inserts `\t` while focused; Esc then Tab is the documented way to leave the editor.
- Placeholder "Start typing..." when empty.
- The editor pane is a CSS grid: gutter column plus textarea. Only the textarea scrolls.

### Gutter and wrapped lines

- One gutter button per logical line (`aria-pressed`, `data-line`, accessible name
  "Line N"). Buttons are reconciled, not rebuilt, when the line count changes.
- **Wrap off:** `white-space: pre`, horizontal scrolling. Each gutter row is exactly
  `line-height` tall. Highlight band top = `paddingTop + (line - 1) * lineHeight`.
- **Wrap on:** a hidden mirror element matches the textarea's content width, font,
  line-height, padding, `white-space: pre-wrap`, and `overflow-wrap: break-word`. Each
  logical line is a block. Measure heights once per layout pass, apply them to gutter
  buttons, and cache line tops for highlight bands.
- Layout passes are scheduled with `requestAnimationFrame` after input and on
  `ResizeObserver` for the pane. Measurements are read in one pass, then writes are
  batched to avoid layout thrash.
- Scroll sync: translate the gutter inner and highlight layer by `-textarea.scrollTop`.
  The gutter has `overflow: hidden`; a translucent scrollbar track sits outside it.
- Per-note `scrollTop` is restored on switch and saved on scroll (debounced).

### Line highlights

- Single click or Enter/Space on a focused line: if the line is inside a range, remove
  that whole range; otherwise add `[line, line]` and merge with adjacent ranges.
- Shift-click or Shift+Enter/Space: add `[min(anchor, line), max(anchor, line)]`,
  merging with existing ranges. The anchor is the last non-shift line.
- Ranges persist with the note and are not included in share links.
- Highlight bands render behind a transparent textarea; text selection and caret remain
  visible. Clearing text clears ranges.

### Word wrap

- Toggle flips `prefs.wrap` and a container class, then reruns layout. Wrap is on by
  default. No reload required.

## 6. Undo and redo (proposed deviation from features.md §5.6)

Use the browser's native textarea history. Keyboard undo/redo is untouched. The toolbar
buttons call `document.execCommand('undo')` / `'redo'`, which was verified to operate on
the textarea in Chromium.

- No custom snapshot stack. This avoids reimplementing IME composition, selection
  restoration, and coalescing, which is where home-grown undo usually breaks.
- Programmatic `.value` changes (tab switches) clear the native stack. Undo therefore
  applies to the current editing scope, not across tab switches. This matches the
  existing "history is not persisted" rule.
- Button enabled state is a heuristic: Undo enables after the first edit in the current
  scope; Redo enables after an Undo action; both reset on tab switch. A click with nothing
  to undo is a harmless no-op. Exact disabled-state fidelity is not achievable without
  replacing native undo, and native editing reliability wins.
- features.md §5.6 will be updated to describe this.

## 7. Share link implementation

### Codec (`js/share.js`)

- `encodeNote({ name, text }) → Promise<string>`
  1. `JSON.stringify({ v: 1, n: name, t: text })`
  2. UTF-8 encode.
  3. Try `CompressionStream("gzip")`, prefix `z`. If unavailable or it throws, use raw
     bytes, prefix `r`.
  4. Base64url encode (no padding) in chunks to avoid argument limits.
- `decodeNote(payload) → Promise<{ name, text }>`
  - Validate prefix, base64url alphabet, and decoded size (cap 256 KB) before parsing.
  - Gunzip for `z`; parse JSON; require `v === 1`, string `n`, string `t`.
  - Reject malformed input with a typed error; never modify existing notes on failure.
- Base64url helpers are byte-based and handle all Unicode; no `btoa(unescape(...))`.

### Flow

- Share click: if text is empty, status "Nothing to share". Otherwise encode, build
  `location.origin + location.pathname + "#n=" + payload`, try
  `navigator.clipboard.writeText`, then open the popover with the link selected.
  If the Clipboard API is denied, the link field is selected and the user can copy
  manually; status says "Copy the link".
- Warn when the full URL exceeds 8,000 characters.
- On load and on `hashchange`, if the hash starts with `#n=`, decode asynchronously,
  append a note, activate it, show "Opened from link", then
  `history.replaceState(null, "", location.pathname + location.search)` so refreshes do
  not duplicate it. Preserve the `/textarea/` base path.
- Name collisions are allowed; IDs are unique.
- No QR code in v1.

## 8. Privacy implementation

- **CSP meta** exactly:
  `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'none'; connect-src 'none'; manifest-src 'self'; base-uri 'none'; form-action 'none'`
- **Referrer:** `<meta name="referrer" content="no-referrer">`.
- No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, or `sendBeacon` anywhere.
- No service worker, permissions, cookies, `navigator.clipboard.read*`, or hidden iframes.
- Clipboard use is writes only, inside user gestures.
- All asset URLs are relative; only the repository link in the privacy dialog is
  external, is user-initiated, and never loads as a resource.
- `tests/privacy.test.mjs` scans `index.html`, `styles.css`, `theme.js`, `app.js`, and
  `js/*.js` for forbidden APIs and external resource URLs, and asserts the CSP contains
  the required directives. This makes the invariant repeatable, not just a manual review.
- Manual verification with DevTools: the Network panel shows only same-origin documents
  and assets; no requests after load; console is clean.

## 9. Accessibility

- Tabs follow the ARIA tabs pattern (roving tabindex, arrow keys, `aria-selected`,
  `aria-controls`).
- Gutter is a labeled group of real buttons with `aria-pressed`.
- Share popover and dialogs manage focus and return it on close.
- Visible `:focus-visible` outlines at AA contrast; 24 px minimum touch targets, with
  28–34 px for primary toolbar controls.
- Status updates use a polite live region; errors use the same region.
- `prefers-reduced-motion` removes non-essential transitions.
- Keyboard shortcuts are enhancements, never the only path. Use `Ctrl/⌘ + Alt +` combos
  because browsers reserve plain `Ctrl+N`, `Ctrl+1…9`, and similar. features.md §7 will
  change `Ctrl/⌘+1…9` to `Ctrl/⌘+Alt+1…9`.
- Verify with the browse tool's accessibility snapshot plus a keyboard-only pass.

## 10. Styling

- System monospace stack: `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`.
- Light and dark token sets inspired by the reference: neutral canvas, subtle borders,
  blue accent, yellow highlight, green saved state.
- Layout: `100dvh` grid with fixed top bar, flexible editor pane, fixed status bar.
- Top bar 42–48 px; status bar 34–40 px; editor padding 10–12 px 16 px; line-height 1.55.
- Below 640 px: icon-only toolbar buttons, compact stats, scrollable tab strip, popover
  spans the viewport minus 20 px.
- Icons 16 px, stroke-based, consistent weight.
- Focus, hover, active, disabled, and pressed states defined for every control.

## 11. Build sequence

Each step ends with a working page and a verification pass.

0. **Scaffold.** `index.html`, `styles.css`, `theme.js`, `favicon.svg`, `LICENSE`,
   README stub. Verify: page loads from `python3 -m http.server`, CSP reports no errors,
   theme applies before paint from stored preference.
1. **Single-note editor.** Textarea, autosave, status, stats, placeholder, input
   normalization. Verify: type, reload, text and caret-ish state survive; characters,
   words, bytes are correct for ASCII and emoji.
2. **Tabs.** Add/switch/rename/close, per-note scroll and highlights scaffolding, cap,
   persistence. Verify: reload restores order, active tab, and each note; rename via
   keyboard; closing non-empty prompts.
3. **Gutter, wrap, highlights.** Mirror measurement, scroll sync, highlight bands,
   click/shift/keyboard interactions. Verify: wrapped lines stay aligned while typing,
   resizing, and toggling wrap; highlights survive reload and tab switches.
4. **Chrome and actions.** Theme toggle, copy, clear, download, wrap toggle, privacy
   dialog, responsive rules. Verify: every toolbar action by mouse and keyboard; download
   filename is safe; theme persists with no flash.
5. **Sharing.** Codec module, unit tests, popover, clipboard fallback, import flow,
   warnings. Verify: round-trip between two browser profiles; malformed hashes fail
   safely; base path is preserved after import.
6. **Undo/redo.** Toolbar buttons driving native history with heuristic states. Verify:
   type, undo, redo; switch tabs and confirm history does not cross notes.
7. **Privacy, accessibility, polish pass.** Privacy test, focus order, live regions,
   reduced motion, contrast, 375/768/1280 screenshots. Verify: full keyboard-only pass.
8. **Documentation and deploy.** README, LICENSE, Pages configuration, live verification.

## 12. Test plan

### Automated

- `node --test tests/share.test.mjs`
  - Raw and gzip round-trips, Unicode (emoji, accents), CRLF, empty text, 32 KB text,
    malformed prefixes, truncated base64, oversized payloads, wrong JSON shape.
- `node --test tests/privacy.test.mjs`
  - Forbidden API/URL scan and CSP assertions.
- Browser checks with the `browse` tool against the local server:
  - Persistence, tabs, stats, wrap/gutter alignment, highlights, theme, share round-trip
    across two browser contexts, download, confirm dialogs, console/network cleanliness.
  - Responsive screenshots at 375, 768, and 1280 px.

### Manual

- Chrome, Firefox, and Safari: `execCommand` undo, Clipboard API fallback,
  `CompressionStream` fallback (force `r` path in a test hook or temporary edit), IME
  input in the textarea, and undo.
- DevTools Network: zero requests after load.
- Keyboard-only and screen-reader label spot check.

Current environment only has Chromium via the browse tool; the plan calls out Firefox and
Safari as manual checks by the user unless another browser is available.

## 13. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Wrapped-line gutter drift | Mirror measurement, one-pass reads/writes; validated prototype. Fallback if regressions: wrap off by default (requires sign-off) or numbers only on logical-line starts with explicit spacing. |
| Native undo quirks across browsers | Buttons no-op safely; keyboard remains native; manual cross-browser check. If a browser fails, hide the toolbar pair rather than reimplement history. |
| `CompressionStream` unavailable | Raw base64url `r` prefix; links are longer but valid. |
| Very long share URLs | 8,000-character warning; download offered. |
| localStorage quota or disabled storage | Persistent error status, in-memory editing, download path. |
| Shared origin on `*.github.io` | Namespaced keys; documented caveat; custom domain deferred. |
| Clipboard permission denial | Link field selected, manual copy path. |
| GitHub Pages caching after deploy | Document a hard refresh; add query versioning to asset URLs only if it becomes a problem. |
| Browser-reserved shortcuts | Buttons are the primary path; use `Ctrl/⌘+Alt` combinations. |

## 14. Deployment

- Repository: `steven-chau/textarea`, public, default branch `main`.
- GitHub Pages: deploy from branch `main`, folder `/` (root). No Actions workflow needed.
- URL: `https://steven-chau.github.io/textarea/`.
- Steps: implement and verify locally, run tests, commit (only when requested), push,
  enable Pages via the GitHub UI or `gh api`, then verify the live URL, share round-trip,
  and network panel.
- Add an MIT `LICENSE` and a README covering purpose, privacy posture, local development,
  shortcuts, limits, and the shared-origin caveat.

## 15. Definition of done

- [ ] All §5 v1 features in features.md work, with the two documented deviations.
- [ ] Share links round-trip titles and text, including Unicode and 32 KB notes.
- [ ] Reload, tab close, and offline-after-load preserve local notes.
- [ ] Zero post-load network requests and zero third-party resources.
- [ ] Privacy static test passes; CSP has no console violations.
- [ ] Keyboard-only pass succeeds for every action.
- [ ] 375 px, 768 px, and 1280 px layouts verified.
- [ ] `node --test` passes.
- [ ] README, LICENSE, and live Pages URL in place.

## 16. Deviations from features.md (to update after approval)

1. **Undo/redo:** native browser history instead of a custom 50-step stack (§6).
   Rationale: reliability and far less code; tab switches reset history.
2. **Tab switching shortcut:** `Ctrl/⌘+Alt+1…9` instead of `Ctrl/⌘+1…9`, because browsers
   reserve the plain combinations (§9).
3. **Caveat added:** localStorage is shared across all project sites on
   `steven-chau.github.io`, so origin isolation is weaker than a dedicated domain (§3).
