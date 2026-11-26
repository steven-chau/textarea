const GZIP_PREFIX = "z";
const RAW_PREFIX = "r";
const MAX_PAYLOAD_CHARS = 400000;
const MAX_DECODED_BYTES = 256 * 1024;

export class ShareError extends Error {
  constructor(message) {
    super(message);
    this.name = "ShareError";
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function toBase64Url(bytes) {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function fromBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new ShareError("Invalid link data.");
  }
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    return base64ToBytes(padded);
  } catch (error) {
    throw new ShareError("Invalid link data.");
  }
}

async function compressBytes(bytes) {
  if (typeof globalThis.CompressionStream !== "function") return null;

  try {
    const stream = new Blob([bytes]).stream().pipeThrough(
      new CompressionStream("gzip")
    );
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    return null;
  }
}

async function decompressBytes(bytes) {
  if (typeof globalThis.DecompressionStream !== "function") return null;

  let reader;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(
      new DecompressionStream("gzip")
    );
    reader = stream.getReader();

    const chunks = [];
    let total = 0;

    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.length;
      if (total > MAX_DECODED_BYTES) {
        try {
          await reader.cancel();
        } catch (error) {
          /* Already closing. */
        }
        throw new ShareError("This link expands to too much text.");
      }
      chunks.push(result.value);
    }

    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  } catch (error) {
    if (error instanceof ShareError) throw error;
    return null;
  }
}

export async function encodePayload(note) {
  const name = typeof note.name === "string" ? note.name : "";
  const text = typeof note.text === "string" ? note.text : "";
  const json = JSON.stringify({ v: 1, n: name, t: text });
  const bytes = new TextEncoder().encode(json);

  const compressed = await compressBytes(bytes);
  if (compressed && compressed.length < bytes.length) {
    return GZIP_PREFIX + toBase64Url(compressed);
  }
  return RAW_PREFIX + toBase64Url(bytes);
}

export async function decodePayload(payload) {
  if (typeof payload !== "string" || payload.length === 0) {
    throw new ShareError("This link is empty.");
  }
  if (payload.length > MAX_PAYLOAD_CHARS) {
    throw new ShareError("This link is too large.");
  }

  const prefix = payload[0];
  if (prefix !== GZIP_PREFIX && prefix !== RAW_PREFIX) {
    throw new ShareError("This link is not a textarea link.");
  }

  let bytes = fromBase64Url(payload.slice(1));
  if (bytes.length > MAX_DECODED_BYTES) {
    throw new ShareError("This link is too large.");
  }

  if (prefix === GZIP_PREFIX) {
    const decompressed = await decompressBytes(bytes);
    if (!decompressed) {
      throw new ShareError("This link could not be opened in this browser.");
    }
    bytes = decompressed;
  }

  let data;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new ShareError("This link is damaged.");
  }

  if (
    data === null ||
    typeof data !== "object" ||
    data.v !== 1 ||
    typeof data.n !== "string" ||
    typeof data.t !== "string"
  ) {
    throw new ShareError("This link is not a textarea link.");
  }

  return {
    name: data.n.slice(0, 64) || "Shared note",
    text: data.t,
  };
}
