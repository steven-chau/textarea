const NOTES_KEY = "ta:v1:notes";
const ACTIVE_KEY = "ta:v1:active";
const PREFS_KEY = "ta:v1:prefs";
const SAVE_DELAY = 300;
const MAX_NAME = 64;

let pendingNotes = null;
let saveTimer = 0;
let lastError = null;
let errorHandler = function () {};

function storage() {
  try {
    return window.localStorage;
  } catch (error) {
    return null;
  }
}

function reportError(error) {
  lastError = error || new Error("Storage is unavailable.");
  errorHandler(lastError);
}

function readJSON(key) {
  const ls = storage();
  if (!ls) {
    reportError();
    return null;
  }
  try {
    const raw = ls.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch (error) {
    reportError(error);
    return null;
  }
}

function write(key, value) {
  const ls = storage();
  if (!ls) {
    reportError();
    return false;
  }
  try {
    ls.setItem(key, value);
    lastError = null;
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}

function isRange(range) {
  return (
    Array.isArray(range) &&
    range.length === 2 &&
    Number.isInteger(range[0]) &&
    Number.isInteger(range[1]) &&
    range[0] >= 1 &&
    range[1] >= range[0]
  );
}

function isValidNote(note) {
  return (
    note !== null &&
    typeof note === "object" &&
    !Array.isArray(note) &&
    typeof note.id === "string" &&
    note.id.length > 0 &&
    typeof note.name === "string" &&
    typeof note.text === "string" &&
    (note.highlights === undefined || Array.isArray(note.highlights))
  );
}

export function mergeRanges(ranges) {
  const sorted = ranges
    .filter(isRange)
    .map(function (range) {
      return [range[0], range[1]];
    })
    .sort(function (a, b) {
      return a[0] - b[0];
    });

  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], range[1]);
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function normalizeNote(note) {
  const name = note.name.trim().slice(0, MAX_NAME) || "Untitled";
  return {
    id: note.id,
    name: name,
    text: note.text,
    highlights: mergeRanges(
      Array.isArray(note.highlights) ? note.highlights.filter(isRange) : []
    ),
    scrollTop:
      Number.isFinite(note.scrollTop) && note.scrollTop > 0 ? note.scrollTop : 0,
    updatedAt: Number.isFinite(note.updatedAt) ? note.updatedAt : 0,
  };
}

export function load() {
  const rawNotes = readJSON(NOTES_KEY);
  const notes = Array.isArray(rawNotes)
    ? rawNotes.filter(isValidNote).map(normalizeNote)
    : [];

  const rawActive = readJSON(ACTIVE_KEY);
  const rawPrefs = readJSON(PREFS_KEY);

  const prefs = {
    theme:
      rawPrefs && ["auto", "light", "dark"].includes(rawPrefs.theme)
        ? rawPrefs.theme
        : "auto",
    wrap: rawPrefs && typeof rawPrefs.wrap === "boolean" ? rawPrefs.wrap : true,
  };

  return {
    notes: notes,
    activeId: typeof rawActive === "string" ? rawActive : null,
    prefs: prefs,
  };
}

export function saveNotes(notes) {
  pendingNotes = JSON.stringify(notes.map(normalizeNote));
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    saveTimer = 0;
    writePending();
  }, SAVE_DELAY);
}

function writePending() {
  if (pendingNotes === null) return;
  const data = pendingNotes;
  pendingNotes = null;
  write(NOTES_KEY, data);
}

export function saveActive(id) {
  write(ACTIVE_KEY, JSON.stringify(id));
}

export function savePrefs(prefs) {
  write(PREFS_KEY, JSON.stringify(prefs));
}

export function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = 0;
  }
  writePending();
}

export function getLastError() {
  return lastError;
}

export function onStorageError(handler) {
  errorHandler = typeof handler === "function" ? handler : function () {};
}
