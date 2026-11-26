# textarea

A private, local-first plain-text clipboard for the browser.

Live site (after enabling GitHub Pages): <https://steven-chau.github.io/textarea/>

Type or paste, keep several notes as tabs, and share a note as a self-contained link.
There is no account, no server, and no database. Notes live in `localStorage`; a share
link carries the text in the URL fragment.

## Features

- Plain-text editor with a synchronized line-number gutter and clickable line highlights.
- Multiple notes (tabs) with rename, close, and per-note scroll position.
- Autosave to the browser, restored on reload.
- Light and dark themes, following the OS by default.
- Copy, clear (undoable), download as `.txt`, word wrap, and live line/word/char/byte counts.
- Share by link, encoded in the fragment as compressed base64url, decoded locally.
- Keyboard accessible controls, a privacy dialog, and no third-party resources.

## Privacy

The short version: your text stays in this browser, and nothing on this page phones home.

- Notes and preferences are stored only in `localStorage`.
- The app contains no `fetch`, XHR, WebSocket, beacon, analytics, telemetry, or third-party
  scripts, styles, fonts, or images.
- A strict Content Security Policy ships in `index.html`, including
  `default-src 'none'` and `connect-src 'none'`.
- The clipboard is write-only. The site never reads it.
- Autofill, autocorrect, autocapitalize, and spellcheck are disabled on the editor.
- The site requests no permissions and registers no service worker.
- Share links are snapshots. Fragment text is never sent to the host, but anyone with the
  link, browser history, a clipboard manager, or the messaging app can read it.

Caveats worth knowing:

- GitHub Pages sees ordinary page requests (IP, user agent, path), never note text.
- All project sites under `steven-chau.github.io` share a browser origin, so JavaScript on
  another project page there could read this site's `localStorage`. A custom domain would
  isolate it.
- No site can protect text from malicious browser extensions or a compromised device.

Run `node --test tests/*.test.mjs` to check the privacy invariants and the share codec.

## Local development

No build step and no dependencies.

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

Tests use the Node test runner and the built-in compression streams (Node 20+):

```sh
node --test tests/*.test.mjs
```

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| New note | `Ctrl/⌘ + Alt + N` |
| Switch to note 1–9 | `Ctrl/⌘ + Alt + 1…9` |
| Rename note | `F2` (or double-click the tab) |
| Close note | `Ctrl/⌘ + Alt + W` (or `Delete` on a focused tab) |
| Toggle theme | `Ctrl/⌘ + Alt + D` |
| Share | `Ctrl/⌘ + Alt + S` |
| Toggle word wrap | `Ctrl/⌘ + Alt + L` |
| Privacy details | `Ctrl/⌘ + Alt + P` |
| Move focus out of the editor | `Escape`, then `Tab` |

Some operating systems reserve certain `Ctrl/Alt` combinations. Every action is also
available from the toolbar.

## Limits

- Notes above 28 KB (UTF-8) show a warning; share links get very long.
- Share URLs above 8,000 characters show a warning and may be truncated by some apps.
- Up to 20 tabs.
- Storage depends on the browser's `localStorage` quota. If writing fails, the app says so
  and you can download the note instead.
- Open the site in one browser tab at a time. Browser tabs do not sync; the last one to
  save wins.

## Deploy

The repository is already a static site. On GitHub:

1. Settings → Pages → Build and deployment → Deploy from a branch.
2. Branch `main`, folder `/` (root).
3. The site appears at <https://steven-chau.github.io/textarea/>.

All asset paths are relative, so the `/textarea/` subpath works without configuration.
There is no build workflow.

## License

MIT. See [LICENSE](LICENSE).
