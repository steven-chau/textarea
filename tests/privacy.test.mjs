import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(relativePath) {
  return readFileSync(new URL("../" + relativePath, import.meta.url), "utf8");
}

const html = read("index.html");
const css = read("styles.css");
const theme = read("theme.js");
const app = read("app.js");
const store = read("js/store.js");
const share = read("js/share.js");
const markdown = read("js/markdown.js");
const sw = read("sw.js");
const manifest = JSON.parse(read("manifest.webmanifest"));
const js = [theme, app, store, share, markdown].join("\n");

test("index.html ships a strict CSP", function () {
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /worker-src 'self'/);
  assert.match(html, /style-src 'self'/);
  assert.match(html, /font-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /base-uri 'none'/);
  assert.doesNotMatch(html, /'unsafe-inline'/);
  assert.doesNotMatch(html, /'unsafe-eval'/);
});

test("index.html sends no referrer", function () {
  assert.match(html, /<meta name="referrer" content="no-referrer"/);
});

test("no inline scripts or style attributes", function () {
  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /\sstyle\s*=\s*["']/i);
});

test("no third-party resources are loaded", function () {
  assert.doesNotMatch(
    html,
    /<(?:script|img|iframe|source|audio|video|link)\b[^>]*(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i
  );
  assert.doesNotMatch(css, /@import\s/i);
  assert.doesNotMatch(css, /url\(\s*["']?\s*(?:https?:)?\/\//i);
});

test("no hidden forms or autofill surfaces", function () {
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /<input\b(?![^>]*readonly)[^>]*>/i);
});

test("the editor disables browser assistance", function () {
  assert.match(html, /autocomplete="off"/);
  assert.match(html, /autocorrect="off"/);
  assert.match(html, /autocapitalize="off"/);
  assert.match(html, /spellcheck="false"/);
});

test("no network or data-collection APIs", function () {
  const forbidden = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /\bsendBeacon\b/,
    /navigator\s*\.\s*clipboard\s*\.\s*read/i,
    /\breadText\s*\(/,
    /\bimportScripts\b/,
    /\beval\s*\(/,
    /\bnew\s+Function\b/,
  ];

  for (const pattern of forbidden) {
    assert.doesNotMatch(js, pattern, String(pattern));
  }
});

test("no remote URLs are loaded, aside from the user-initiated source link", function () {
  const withoutSourceLink = html.replace(
    /<a href="https:\/\/github\.com\/steven-chau\/textarea"[^>]*>[^<]*<\/a>/,
    ""
  );
  assert.doesNotMatch(
    [withoutSourceLink, css, js, sw, JSON.stringify(manifest)].join("\n"),
    /https?:\/\//
  );
  assert.match(html, /View the source/);
});

test("the Markdown renderer never creates HTML or loads external content", function () {
  assert.doesNotMatch(
    markdown,
    /innerHTML|outerHTML|insertAdjacentHTML|document\.write/i
  );
  assert.doesNotMatch(markdown, /createElement\(\s*["']img["']\)|new\s+Image\b/i);
  assert.doesNotMatch(markdown, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/i);
  assert.match(markdown, /textContent/);
});

test("the manifest and service worker stay same-origin and ship every icon", function () {
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3);

  for (const icon of manifest.icons) {
    assert.ok(!/^https?:/i.test(icon.src), icon.src);
    const path = new URL("../" + icon.src.replace(/^\.\//, ""), import.meta.url);
    assert.ok(existsSync(path), icon.src);
  }

  assert.doesNotMatch(sw, /https?:\/\//);
  assert.match(sw, /textarea-shell/);
  assert.match(sw, /caches\.open/);

  const shellFiles = Array.from(sw.matchAll(/"\.\/([^"]+)"/g))
    .map(function (match) {
      return match[1];
    })
    .filter(Boolean);

  for (const file of shellFiles) {
    assert.ok(
      existsSync(new URL("../" + file, import.meta.url)),
      "missing service worker shell file: " + file
    );
  }
});
