# textarea — Feature Document

**Status:** Implemented (v1)
**Date:** 2026-11-26
**Hosting:** GitHub Pages (static only)
**Repository:** <https://github.com/steven-chau/textarea>
**Site:** <https://steven-chau.github.io/textarea/>

## 1. Summary

A local-first, no-frills plain-text clipboard in the browser. Open the page, type or
paste, and everything stays on the device. "Share" produces a link that carries the note
inside the URL fragment, so no server, account, or database is needed.

The point of the project is privacy: **anything typed into the editor is never collected,
transmitted, or read by the site or by any third party.** The site loads no third-party
code and makes no outbound requests.

Inspired by [textarea.online](https://textarea.online/), but deliberately scoped to what
static hosting can do.

## 2. Goals

- A fast, keyboard-friendly plain-text editor that is ready to type in immediately.
- Multiple notes ("tabs") that survive reload, with no sign-up.
- Sharing that works with zero infrastructure and keeps note contents off the server.
- A compact, polished light/dark UI that feels at home on desktop and mobile.
- Privacy as a product property, not a policy: local-only storage, no third-party
  content, no clipboard reads, no autofill, no analytics, no telemetry.
- A total payload small enough to load almost instantly on any connection.

**Success criteria**

- First meaningful paint under 1 s on a typical broadband connection.
- All core actions reachable by keyboard.
- Text survives reload, tab close, and offline use after the page has loaded.
- A share link reproduces the same note title and text in a different browser.
- `grep` of the source finds no third-party origins used for loading anything.
- DevTools shows zero network requests after the initial page load.
- Content Security Policy blocks all outbound connections (`connect-src 'none'`).
- The editor has autofill, autocorrect, autocapitalize, and spellcheck disabled.
- Works when served from a subpath: `https://steven-chau.github.io/textarea/`.

## 3. Non-goals

Explicitly out of scope for v1:

- Real-time co-editing, presence, cursors, or comments.
- Accounts, profiles, permissions, named spaces, or read-only guest mode.
- Server-stored notes, short URLs, link expiry, or any backend API.
- Cookies, analytics, telemetry, ads, error reporting, or A/B testing.
- Third-party scripts, stylesheets, fonts, images, icons, or CDNs of any kind.
- Reading the clipboard, requesting permissions, or loading hidden resources.
- Contenteditable/rich text, Markdown editing, or syntax highlighting.
- End-to-end encryption as a server feature. Since content never reaches a server, the
  whole note is client-side by construction.

## 4. Users and use cases

- Moving a snippet between devices or browsers without chat apps mangling it.
- A scratchpad that is always one bookmark away.
- Sending a plain-text note to someone as a link they can open read-only.
- Keeping several unrelated snippets side by side as tabs.
- Typing something sensitive with confidence that the page does not phone home.

## 5. v1 scope

### 5.1 Notes and tabs

- A horizontal tab strip; the first note is created automatically on first visit.
- Add note, switch note, rename note (double-click the tab, or F2), close note.
- Closing a note with text requires confirmation, or offers undo. Empty notes close
  immediately.
- Each tab remembers its own text, title, highlight ranges, and scroll position.
- Tabs and the active tab persist in `localStorage`.
- Soft limit of 20 tabs; beyond that, "Add" is disabled with an explanatory title.
- Reordering tabs is not required in v1.

### 5.2 Editor

- A plain `<textarea>` with no autocorrect, autocapitalize, spellcheck, or smart quotes.
  Explicitly set `autocomplete="off"`, `autocorrect="off"`, `autocapitalize="off"`,
  and `spellcheck="false"`.
- No forms, no hidden inputs, and no field names that invite password managers or
  autofill to attach.
- Monospace type; line-height tuned for scanning.
- A line-number gutter synchronized with vertical scroll.
- Placeholder "Start typing..." when the active note is empty.
- Word wrap on by default, with a toggle that persists.
- Tab key inserts a tab character while the editor is focused. (Accessibility fallback:
  Escape then Tab moves focus out; toolbar controls are always reachable by keyboard.)
- Trailing newlines are preserved.
- Paste normalizes line endings to `\n`.
- No maximum hard block on typing; see limits in §8.

### 5.3 Persistence

- Autosave to `localStorage` shortly after typing stops (debounced), and on
  `visibilitychange` / `beforeunload`.
- Status line shows "Saved in this browser" or "Saving..." briefly.
- If `localStorage` is unavailable or full, the UI explains that notes cannot be saved
  and offers to download instead. The editor remains usable.
- All keys are namespaced and versioned so a future format change can migrate or ignore
  old data safely.
- Nothing is written anywhere except `localStorage` and, on explicit user action, the
  clipboard or a downloaded file.

### 5.4 Share by link

- "Share" builds a URL that encodes the active note's title and text in the fragment:
  `…/#n=<payload>`.
- The payload is the UTF-8 JSON of `{v, n, t}` (version, name, text), optionally
  compressed with `CompressionStream("gzip")` and then base64url-encoded. A one-letter
  prefix indicates compressed vs. uncompressed so decoding is unambiguous.
- If compression or encoding is unavailable, fall back to uncompressed base64url.
- Activating Share:
  - Empty note: show "Nothing to share" and do nothing.
  - Non-empty note: copy the link to the clipboard and show a small popover with the
    link, a Copy button, and a clear note that **the link is a snapshot**: edits after
    sharing do not update it, and editing the imported copy never affects the sender.
- Opening a URL with `#n=…` decodes it into a new note titled after the shared note,
  marks it as opened from a link, and then removes the fragment from the address bar
  with `history.replaceState` so refreshes do not re-import it. Decode failures show a
  readable error and leave existing notes untouched.
- The share link is built and copied entirely in the browser. The app never sends it
  anywhere. Fragments are not included in the HTTP request or in `Referer` headers.
- Link length:
  - Warn when the generated URL exceeds 8,000 characters: "Long link; some apps may
    truncate it. Download the note instead."
  - Below that, copy silently.
- The share popover explains that the text lives in the link itself, is never uploaded,
  and may be retained by browser history, clipboard managers, or messaging apps.
- A QR code is **not** included in v1 (see §10).

### 5.5 Line highlights

- Clicking a line number toggles a highlight for that line.
- Shift-click extends a contiguous range from the last clicked line.
- Highlight ranges belong to the note, persist locally, and are never included in the
  share link unless explicitly carried (v1: not included).
- Line numbers are real buttons, reachable by keyboard: arrow keys move focus, Enter or
  Space toggles, Shift+Space extends. `aria-pressed` reflects state.
- Highlights use a subtle accent and remain legible in both themes.
- Clearing the note's text also clears its highlights. A dedicated "clear highlights"
  action may be added later.

### 5.6 Toolbar and status bar

Top bar:

- Left: tab strip and Add note.
- Right: theme toggle, Share.

Bottom status bar:

- Left: a "Private" indicator that opens the privacy dialog (see §5.10), save state,
  Undo, Redo, Copy text, Clear text, Download `.txt`, Word wrap toggle.
- Right: live counts — lines, words, characters, UTF-8 bytes. Compact on mobile.

Behaviors:

- **Copy text** copies the whole note, not the selection, and briefly confirms. It uses
  the clipboard write API only; the site never reads the clipboard.
- **Clear text** confirms when the note is non-empty, then clears text and highlights;
  Undo can restore.
- **Download** saves a `.txt` file named from the tab title, falling back to
  `note-<n>.txt`.
- **Undo/Redo** use the browser's native textarea history. The toolbar buttons invoke
  `document.execCommand('undo'|'redo')`; keyboard shortcuts are not intercepted. History
  is not persisted across reloads or tab switches, because programmatic tab changes reset
  the native stack. Button enabled states are heuristic; a click with nothing to undo is
  a harmless no-op.

### 5.7 Themes

- Light and dark themes, defaulting to the OS preference.
- A toggle switches and persists the choice; it overrides the OS preference.
- A small blocking `theme.js` (same origin) applies the stored theme before first paint
  to avoid a flash. No inline script is used, so the CSP can stay strict.
- Colors are defined as CSS custom properties in one external stylesheet.

### 5.8 Responsive layout

- Desktop: full toolbar labels and generous tab widths.
- Narrow screens: icon-only toolbar controls with accessible labels, horizontally
  scrollable tab strip, shortened stats.
- The editor fills the remaining viewport; only the editor scrolls.
- Touch targets at least 24 px, with primary toolbar controls 28–34 px.

### 5.9 Accessibility

- Semantic landmarks and headings; the editor is the page's main control.
- Every icon-only control has an accessible name; stateful controls use `aria-pressed`
  or `aria-expanded`.
- Visible `:focus-visible` rings; the editor and all controls are fully keyboard
  reachable.
- Status changes (saved, copied, share result) are announced via a polite live region.
- Color contrast meets WCAG AA for text and controls in both themes.
- Motion is minimal and respects `prefers-reduced-motion`.

### 5.10 Privacy by construction

The core promise: **the site never takes anything from the user.** These are properties
of the implementation, not just claims in a policy.

1. **Content stays on the device.** Notes and preferences live only in `localStorage`.
   There is no API call, WebSocket, beacon, `fetch`, or XHR in the application. Opening a
   shared link decodes it locally.
2. **Zero third-party resources.** No external scripts, styles, fonts, images, icons,
   avatars, analytics, error trackers, or CDNs. The source contains no third-party URLs
   used for loading. The only outbound link, if any, is a user-initiated link to the
   repository in the privacy dialog.
3. **Strict Content Security Policy.** A meta CSP ships in `index.html`:
   `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:;
   font-src 'none'; connect-src 'none'; manifest-src 'self'; base-uri 'none';
   form-action 'none'`. (`frame-ancestors` cannot be set via meta; GitHub Pages does not
   allow custom headers.) `connect-src 'none'` makes accidental network calls fail.
4. **No clipboard reads.** Copy is write-only and always triggered by a user gesture.
   Pasting is the browser's native paste into the editor, initiated by the user.
5. **No autofill or password-manager input surfaces.** The editor disables autocomplete,
   autocorrect, and spellcheck; the app has no form submissions and no hidden fields.
6. **No permissions.** The site never requests camera, microphone, notifications,
   geolocation, contacts, clipboard read, or anything else. It registers no service
   worker in v1.
7. **No cookies, no analytics, no telemetry, no logging.** There is no server we operate.
   GitHub Pages (the host) sees ordinary page requests (IP, user agent, requested path)
   as any static host does, but never sees note text: text is in `localStorage` or the
   URL fragment, and fragments are not sent in HTTP requests or `Referer` headers.
8. **Share links are explicit and self-contained.** The user's text travels only in a URL
   the user deliberately copies. Anyone with the link, browser history, clipboard
   managers, or the delivery app can read it. The UI says this plainly.
9. **Shared GitHub Pages origin.** Every project site under `steven-chau.github.io`
   shares one browser origin, so JavaScript on another project page published under that
   account could read this site's `localStorage`. Keys are namespaced to avoid collisions,
   but strict isolation would require a custom domain (listed as deferred).
10. **Honest limits.** The site cannot protect content from malicious browser extensions,
    a compromised device, or someone looking over the user's shoulder. It also cannot
    stop the user from pasting text into another site later.

The privacy dialog repeats the short version in plain language: *your text stays in this
browser; nothing is uploaded; no third-party code runs here.* It loads no external
content.

### 5.11 Performance and footprint

- Vanilla HTML, CSS, and ES modules. No framework and no build step required to deploy.
- System monospace stack (`ui-monospace, SFMono-Regular, Menlo, Consolas, …`). No webfont
  files and no font requests.
- Target: under ~60 KB gzipped for HTML + CSS + JS.
- No layout shift from late-loading assets.
- No dependencies fetched at runtime or build time.

## 6. UI layout

```
┌──────────────────────────────────────────────────────────────┐
│ [1·txt] [2·txt] [+]                        ◐   Share         │
├────┬─────────────────────────────────────────────────────────┤
│  1 │ Start typing...                                         │
│  2 │                                                         │
│  3 │                                                         │
│    │                                                         │
├────┴─────────────────────────────────────────────────────────┤
│ Private · Saved · ↶ ↷ Copy Clear Download Wrap   2 lines·4 words│
└──────────────────────────────────────────────────────────────┘
```

- Thin 42–48 px top bar; editor fills the viewport; 34–40 px status bar.
- Active tab uses a raised, bordered treatment; inactive tabs are flat.
- Share opens an anchored popover, not a modal.
- The "Private" control opens a small dialog explaining local-only storage.

## 7. Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| New note | `Ctrl/⌘ + Alt + N` (the `+` button is always available) |
| Switch to note 1–9 | `Ctrl/⌘ + Alt + 1…9` |
| Rename active note | `F2` |
| Close active note | `Ctrl/⌘ + Alt + W` |
| Toggle theme | `Ctrl/⌘ + Alt + D` |
| Open Share | `Ctrl/⌘ + Alt + S` |
| Toggle word wrap | `Ctrl/⌘ + Alt + L` |
| Open privacy dialog | `Ctrl/⌘ + Alt + P` |
| Close popover / cancel rename | `Esc` |
| Toggle a line highlight | `Enter` / `Space` on a focused line number |
| Extend highlight range | `Shift + Space` / `Shift + Enter` |

Native shortcuts (`Ctrl/⌘+C`, `V`, `X`, `A`, `Z`, `Y`) inside the editor are left to the
browser.

## 8. Limits

- **Note size:** 32 KB of UTF-8 text, matching the reference. Show a non-blocking warning
  at 28 KB; do not truncate input.
- **Share URL:** warn above 8,000 characters. Copy still works. Very large notes may
  exceed practical URL limits in some browsers or chat apps.
- **Tabs:** soft cap of 20.
- **Storage:** relies on the browser's `localStorage` quota (typically ~5 MB). If a save
  fails, surface it and keep the text in memory.
- **Browser tabs:** multiple tabs of the site do not sync. Each tab keeps its own
  in-memory state and the last tab to save wins. Use one tab at a time.

## 9. Data model (localStorage)

```
ta:v1:notes    → [{ id, name, text, highlights: [[startLine, endLine]], scrollTop, updatedAt }]
ta:v1:active   → note id
ta:v1:prefs    → { theme: "auto" | "light" | "dark", wrap: boolean }
```

- Highlight ranges are inclusive line numbers, stored sorted and merged.
- Writes are debounced. The active note and preferences are saved immediately.
- Unknown keys or future versions are ignored, not deleted.
- Share payload: `{ v: 1, n: string, t: string }`, fragment-encoded as described in §5.4.

## 10. Deferred candidates (not in v1)

Reviewed later; none are blockers for shipping:

- Markdown preview pane.
- QR code for share links (client-side library only, bundled locally).
- Installable PWA with a service worker for offline loading.
- Import via drag-and-drop or file picker.
- A dedicated About page (v1 ships the privacy dialog instead).
- Named spaces / `/ ~space/note` URLs.
- Read-only guest mode.
- Tab reordering, search/replace, go-to-line.
- Custom domain.

Anything added later must preserve §5.10. In particular, no third-party service may be
introduced for fonts, rendering, analytics, or sharing.

## 11. Resolved decisions

| Decision | Choice |
| --- | --- |
| Name/branding | **textarea** (repository name) |
| Hosting | GitHub Pages, deployed from `main` at <https://steven-chau.github.io/textarea/> |
| Base path | `/textarea/`; every asset URL is relative so the app works under a subpath |
| Font | System monospace stack; no webfonts |
| License | **MIT** (add a `LICENSE` file) |
| About | Short "Private by design" dialog, no separate page |
| Custom domain | None |
| Privacy posture | Local-only; no third-party resources; strict CSP; no clipboard reads; no autofill |

## 12. Milestones and verification

1. **Shell and editor** — layout, tabs, autosave, editor + gutter, themes.
   Verify: reload restores notes and active tab; theme survives reload with no flash.
2. **Sharing** — encode/decode, share popover, import flow, size warnings.
   Verify: round-trip a note containing emoji, accents, CRLF, and 30 KB of text between
   two browser profiles.
3. **Editing conveniences** — line highlights, undo/redo, copy/clear/download, wrap,
   stats.
   Verify: keyboard-only pass through every action.
4. **Privacy and accessibility pass**
   - DevTools Network shows only same-origin assets; zero requests after load.
   - CSP has `connect-src 'none'`; source contains no `fetch`, XHR, WebSocket, beacon, or
     third-party asset URLs.
   - Editor attributes confirm autofill/autocorrect/spellcheck are off.
   - Contrast and focus checks at 375 px, 768 px, and 1280 px.
5. **Deploy** — GitHub Pages from `main`, relative paths, MIT license committed.
   Verify: `https://steven-chau.github.io/textarea/` loads; share links work; no
   post-load requests.
