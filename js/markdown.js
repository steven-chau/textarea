const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function sanitizeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, document.baseURI);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch (error) {
    return null;
  }
}

function appendLink(parent, label, href) {
  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label || href;
  parent.append(link);
}

function appendImageLink(parent, link) {
  const span = document.createElement("span");
  span.className = "md-image";
  const anchor = document.createElement("a");
  anchor.href = link.url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = "image: " + (link.label || "link");
  span.append(anchor);
  parent.append(span);
}

function parseLink(text, start, image) {
  const prefix = image ? "![" : "[";
  if (!text.startsWith(prefix, start)) return null;

  const labelStart = start + prefix.length;
  const labelEnd = text.indexOf("]", labelStart);
  if (labelEnd === -1) return null;
  if (text[labelEnd + 1] !== "(") return null;

  const urlEnd = text.indexOf(")", labelEnd + 2);
  if (urlEnd === -1) return null;

  let raw = text.slice(labelEnd + 2, urlEnd).trim();
  if (!raw) return null;

  if (raw.startsWith("<")) {
    const angledEnd = raw.indexOf(">");
    if (angledEnd !== -1) raw = raw.slice(1, angledEnd);
  } else {
    raw = raw.split(/\s+/)[0];
  }

  const href = sanitizeUrl(raw);
  if (!href) return null;

  return {
    label: text.slice(labelStart, labelEnd),
    url: href,
    end: urlEnd + 1,
    image: image,
  };
}

function runLength(text, index, char) {
  let length = 0;
  while (text[index + length] === char) length += 1;
  return length;
}

function canOpenUnderscore(text, index) {
  const previous = index === 0 ? "" : text[index - 1];
  const next = text[index + 1] || "";
  return !/[A-Za-z0-9]/.test(previous) && Boolean(next) && !/\s/.test(next);
}

function canCloseUnderscore(text, index, markerLength) {
  const previous = text[index - 1] || "";
  const after = text[index + markerLength] || "";
  return Boolean(previous) && !/\s/.test(previous) && !/[A-Za-z0-9]/.test(after);
}

function findEmphasisClose(text, from, char, double) {
  const marker = double ? char + char : char;
  let index = text.indexOf(marker, from);

  while (index !== -1) {
    if (index <= from) {
      index = text.indexOf(marker, index + marker.length);
      continue;
    }
    if (char === "_" && !canCloseUnderscore(text, index, marker.length)) {
      index = text.indexOf(marker, index + marker.length);
      continue;
    }
    return index;
  }

  return -1;
}

function appendInline(parent, text) {
  let buffer = "";
  let index = 0;

  function flush() {
    if (buffer) {
      parent.append(document.createTextNode(buffer));
      buffer = "";
    }
  }

  while (index < text.length) {
    const char = text[index];

    if (char === "\\" && index + 1 < text.length) {
      buffer += text[index + 1];
      index += 2;
      continue;
    }

    if (char === "\n") {
      flush();
      parent.append(document.createElement("br"));
      index += 1;
      continue;
    }

    if (char === "`") {
      const run = runLength(text, index, "`");
      const fence = "`".repeat(run);
      const close = text.indexOf(fence, index + run);
      if (close !== -1) {
        flush();
        const code = document.createElement("code");
        code.textContent = text.slice(index + run, close).replace(/\s+/g, " ");
        parent.append(code);
        index = close + run;
        continue;
      }
      buffer += fence;
      index += run;
      continue;
    }

    if (char === "!" && text[index + 1] === "[") {
      const image = parseLink(text, index, true);
      if (image) {
        flush();
        appendImageLink(parent, image);
        index = image.end;
        continue;
      }
    }

    if (char === "[") {
      const link = parseLink(text, index, false);
      if (link) {
        flush();
        appendLink(parent, link.label, link.url);
        index = link.end;
        continue;
      }
    }

    if (char === "<") {
      const close = text.indexOf(">", index + 1);
      if (close !== -1) {
        const inner = text.slice(index + 1, close);
        if (
          !/\s/.test(inner) &&
          /^[A-Za-z][A-Za-z0-9+.-]*:\S*$/.test(inner)
        ) {
          const href = sanitizeUrl(inner);
          if (href) {
            flush();
            appendLink(parent, inner, href);
            index = close + 1;
            continue;
          }
        }
      }
      buffer += char;
      index += 1;
      continue;
    }

    if (char === "~" && text[index + 1] === "~") {
      const close = text.indexOf("~~", index + 2);
      if (close !== -1) {
        flush();
        const deleted = document.createElement("del");
        appendInline(deleted, text.slice(index + 2, close));
        parent.append(deleted);
        index = close + 2;
        continue;
      }
    }

    if (char === "*" || char === "_") {
      const underscore = char === "_";
      if (underscore && !canOpenUnderscore(text, index)) {
        buffer += char;
        index += 1;
        continue;
      }

      const run = runLength(text, index, char);

      if (run >= 3) {
        const triple = text.indexOf(char + char + char, index + 3);
        if (
          triple !== -1 &&
          (!underscore ||
            canCloseUnderscore(text, triple, 3))
        ) {
          flush();
          const strong = document.createElement("strong");
          const em = document.createElement("em");
          appendInline(em, text.slice(index + 3, triple));
          strong.append(em);
          parent.append(strong);
          index = triple + 3;
          continue;
        }
      }

      if (run >= 2) {
        const close = findEmphasisClose(text, index + 2, char, true);
        if (close !== -1) {
          flush();
          const strong = document.createElement("strong");
          appendInline(strong, text.slice(index + 2, close));
          parent.append(strong);
          index = close + 2;
          continue;
        }
      }

      const close = findEmphasisClose(text, index + 1, char, false);
      if (close !== -1) {
        flush();
        const em = document.createElement("em");
        appendInline(em, text.slice(index + 1, close));
        parent.append(em);
        index = close + 1;
        continue;
      }

      buffer += char;
      index += 1;
      continue;
    }

    buffer += char;
    index += 1;
  }

  flush();
}

function isRule(line) {
  const trimmed = line.trim();
  if (trimmed.length < 3) return false;
  return (
    /^(\*[ \t]*){3,}$/.test(trimmed) ||
    /^(-[ \t]*){3,}$/.test(trimmed) ||
    /^(_[ \t]*){3,}$/.test(trimmed)
  );
}

function isFenceClose(line, marker, length) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
  return (
    Boolean(match) &&
    match[1][0] === marker &&
    match[1].length >= length
  );
}

function isBlockStart(line) {
  return (
    /^ {0,3}(`{3,}|~{3,})/.test(line) ||
    /^ {0,3}#{1,6}[ \t]+/.test(line) ||
    isRule(line) ||
    /^ {0,3}>/.test(line) ||
    /^ {0,3}[-*+][ \t]+/.test(line) ||
    /^ {0,3}\d+[.)][ \t]+/.test(line)
  );
}

function renderList(lines, index, parent, ordered) {
  const list = document.createElement(ordered ? "ol" : "ul");
  if (ordered) {
    const startMatch = lines[index].match(/^ {0,3}(\d+)/);
    const start = startMatch ? Number(startMatch[1]) : 1;
    if (start !== 1) list.start = String(start);
  }

  while (index < lines.length) {
    const match = ordered
      ? lines[index].match(/^ {0,3}\d+[.)][ \t]+(.*)$/)
      : lines[index].match(/^ {0,3}[-*+][ \t]+(.*)$/);
    if (!match) break;

    const item = document.createElement("li");
    appendInline(item, match[1]);
    index += 1;

    while (
      index < lines.length &&
      /^[ \t]{2,}\S/.test(lines[index]) &&
      !/^ {0,3}[-*+][ \t]+/.test(lines[index]) &&
      !/^ {0,3}\d+[.)][ \t]+/.test(lines[index])
    ) {
      item.append(document.createElement("br"));
      appendInline(item, lines[index].trim());
      index += 1;
    }

    list.append(item);

    while (index < lines.length && !lines[index].trim()) {
      const next = lines[index + 1] || "";
      const nextItem = ordered
        ? /^ {0,3}\d+[.)][ \t]+/.test(next)
        : /^ {0,3}[-*+][ \t]+/.test(next);
      if (!nextItem) break;
      index += 1;
    }
  }

  parent.append(list);
  return index;
}

function renderBlocks(lines, parent) {
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      const marker = fence[1][0];
      const length = fence[1].length;
      index += 1;

      const codeLines = [];
      while (index < lines.length && !isFenceClose(lines[index], marker, length)) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;

      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = codeLines.join("\n");
      pre.append(code);
      parent.append(pre);
      continue;
    }

    const heading = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/);
    if (heading) {
      const element = document.createElement("h" + heading[1].length);
      appendInline(element, (heading[2] || "").trim());
      parent.append(element);
      index += 1;
      continue;
    }

    if (isRule(line)) {
      parent.append(document.createElement("hr"));
      index += 1;
      continue;
    }

    if (/^ {0,3}>/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^ {0,3}>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^ {0,3}> ?/, ""));
        index += 1;
      }
      const quote = document.createElement("blockquote");
      renderBlocks(quoteLines, quote);
      parent.append(quote);
      continue;
    }

    const unordered = /^ {0,3}[-*+][ \t]+/.test(line);
    const ordered = /^ {0,3}\d+[.)][ \t]+/.test(line);
    if (unordered || ordered) {
      index = renderList(lines, index, parent, ordered);
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isBlockStart(lines[index])
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    const paragraph = document.createElement("p");
    appendInline(paragraph, paragraphLines.join("\n"));
    parent.append(paragraph);
  }
}

export function renderMarkdown(text, container) {
  container.textContent = "";
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  renderBlocks(lines, container);

  if (!container.firstChild) {
    const empty = document.createElement("p");
    empty.className = "preview-empty";
    empty.textContent = "Nothing to preview.";
    container.append(empty);
  }
}
