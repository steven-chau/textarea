import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath) {
  return readFileSync(new URL("../" + relativePath, import.meta.url), "utf8");
}

const html = read("index.html");
const css = read("styles.css");
const theme = read("theme.js");
const app = read("app.js");
const store = read("js/store.js");
const share = read("js/share.js");
const js = [theme, app, store, share].join("\n");

test("index.html ships a strict CSP", function () {
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'self'/);
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
    /\bserviceWorker\b/,
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
  assert.doesNotMatch([withoutSourceLink, css, js].join("\n"), /https?:\/\//);
  assert.match(html, /View the source/);
});
