import test from "node:test";
import assert from "node:assert/strict";
import {
  encodePayload,
  decodePayload,
  toBase64Url,
  fromBase64Url,
  ShareError,
} from "../js/share.js";

function rawPayload(data) {
  return "r" + toBase64Url(new TextEncoder().encode(JSON.stringify(data)));
}

test("base64url round-trips arbitrary bytes", function () {
  const bytes = new Uint8Array([0, 1, 2, 127, 128, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(Array.from(fromBase64Url(toBase64Url(bytes))), Array.from(bytes));
});

test("base64url round-trips every byte value", function () {
  const bytes = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) bytes[index] = index;
  const decoded = fromBase64Url(toBase64Url(bytes));
  assert.deepEqual(Array.from(decoded), Array.from(bytes));
});

test("round-trips unicode, accents, emoji, and CRLF", async function () {
  const note = {
    name: "Café 🌍",
    text: "héllo 🌍\nsecond line\r\nthird — line\n\tindented",
  };
  const payload = await encodePayload(note);
  assert.match(payload, /^[zr]/);

  const decoded = await decodePayload(payload);
  assert.equal(decoded.name, note.name);
  assert.equal(decoded.text, note.text);
});

test("round-trips a 32 KB note and compresses it", async function () {
  const text = "The quick brown fox jumps over the lazy dog.\n".repeat(800);
  assert.ok(text.length > 32 * 1024);

  const payload = await encodePayload({ name: "Big note", text: text });
  assert.equal(payload[0], "z");

  const decoded = await decodePayload(payload);
  assert.equal(decoded.name, "Big note");
  assert.equal(decoded.text, text);
});

test("round-trips empty text", async function () {
  const decoded = await decodePayload(
    await encodePayload({ name: "Empty", text: "" })
  );
  assert.equal(decoded.name, "Empty");
  assert.equal(decoded.text, "");
});

test("accepts an uncompressed raw payload", async function () {
  const decoded = await decodePayload(rawPayload({ v: 1, n: "Raw", t: "plain" }));
  assert.equal(decoded.name, "Raw");
  assert.equal(decoded.text, "plain");
});

test("falls back to a shared name when the payload name is empty", async function () {
  const decoded = await decodePayload(rawPayload({ v: 1, n: "", t: "x" }));
  assert.equal(decoded.name, "Shared note");
});

test("rejects empty and malformed payloads", async function () {
  const invalid = [
    "",
    "xabc",
    "r!!!!",
    "z",
    "r" + toBase64Url(new TextEncoder().encode("not json")),
    rawPayload({ v: 2, n: "a", t: "b" }),
    rawPayload({ v: 1, n: 3, t: "b" }),
    rawPayload({ v: 1, n: "a", t: null }),
    "z" + toBase64Url(new Uint8Array([1, 2, 3])),
  ];

  for (const payload of invalid) {
    await assert.rejects(decodePayload(payload), ShareError, payload);
  }
});

test("rejects oversized payload text before decoding", async function () {
  await assert.rejects(decodePayload("r" + "A".repeat(400001)), ShareError);
});

test("rejects a decompression bomb without buffering all of it", async function () {
  const bomb = new Uint8Array(300 * 1024);
  const stream = new Blob([bomb]).stream().pipeThrough(
    new CompressionStream("gzip")
  );
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  assert.ok(compressed.length < 1000);

  await assert.rejects(
    decodePayload("z" + toBase64Url(compressed)),
    ShareError
  );
});
