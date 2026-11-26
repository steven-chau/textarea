import * as store from "./js/store.js";
import { encodePayload, decodePayload } from "./js/share.js";
import { renderMarkdown } from "./js/markdown.js";

const MAX_TABS = 20;
const MAX_NAME = 64;
const WARN_BYTES = 28 * 1024;
const LONG_URL = 8000;
const MAX_MEASURE_LINES = 2500;
const MAX_GUTTER_LINES = 4000;

const els = {
  tabs: document.getElementById("tabs"),
  addTab: document.getElementById("add-tab"),
  themeToggle: document.getElementById("theme-toggle"),
  shareBtn: document.getElementById("share-btn"),
  editorPane: document.getElementById("editor-pane"),
  editor: document.getElementById("editor"),
  gutter: document.getElementById("gutter"),
  gutterInner: document.getElementById("gutter-inner"),
  highlightInner: document.getElementById("highlight-inner"),
  measure: document.getElementById("measure"),
  preview: document.getElementById("preview"),
  previewBtn: document.getElementById("preview-btn"),
  saveStatus: document.getElementById("save-status"),
  noteWarning: document.getElementById("note-warning"),
  undoBtn: document.getElementById("undo-btn"),
  redoBtn: document.getElementById("redo-btn"),
  copyBtn: document.getElementById("copy-btn"),
  clearBtn: document.getElementById("clear-btn"),
  downloadBtn: document.getElementById("download-btn"),
  wrapBtn: document.getElementById("wrap-btn"),
  privacyBtn: document.getElementById("privacy-btn"),
  statLines: document.getElementById("stat-lines"),
  statWords: document.getElementById("stat-words"),
  statChars: document.getElementById("stat-chars"),
  statBytes: document.getElementById("stat-bytes"),
  live: document.getElementById("live"),
  toast: document.getElementById("toast"),
  sharePopover: document.getElementById("share-popover"),
  shareStatus: document.getElementById("share-status"),
  shareStatusText: document.getElementById("share-status-text"),
  shareUrl: document.getElementById("share-url"),
  shareCopy: document.getElementById("share-copy"),
  shareWarning: document.getElementById("share-warning"),
  privacyDialog: document.getElementById("privacy-dialog"),
  confirmDialog: document.getElementById("confirm-dialog"),
  confirmTitle: document.getElementById("confirm-title"),
  confirmMessage: document.getElementById("confirm-message"),
  confirmOk: document.querySelector("[data-confirm-ok]"),
  confirmCancel: document.querySelector("[data-confirm-cancel]"),
};

const state = {
  notes: [],
  activeId: null,
  prefs: { theme: "auto", wrap: true },
  renamingId: null,
  preview: false,
  shareOpen: false,
  sharePending: false,
  shareUrl: "",
  pristineDefaultId: null,
  undoAvailable: false,
  redoAvailable: false,
  applyingHistory: false,
  escapePressed: false,
  anchorLine: 1,
  lineTops: [],
  contentHeight: 0,
  lineHeight: 20,
  padTop: 12,
  measureWidth: 0,
  measureHeights: [],
  measureLines: [],
  layoutFrame: 0,
  afterLayout: [],
  savedTimer: 0,
  statusTimer: 0,
  statusSeq: 0,
  toastTimer: 0,
  toastPersistent: false,
  scrollSaveTimer: 0,
  themeQuery: null,
};

/* Utilities */

function newId() {
  if (globalThis.crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "n-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function makeNote(name, text) {
  const clean = String(name || "Untitled").trim().slice(0, MAX_NAME) || "Untitled";
  return {
    id: newId(),
    name: clean,
    text: typeof text === "string" ? text : "",
    highlights: [],
    scrollTop: 0,
    updatedAt: Date.now(),
  };
}

function activeNote() {
  return state.notes.find((note) => note.id === state.activeId) || state.notes[0] || null;
}

function lineCount() {
  return els.editor.value.split("\n").length;
}

function nextNoteName() {
  const used = new Set(state.notes.map((note) => note.name));
  let index = 1;
  while (used.has("Note " + index)) index += 1;
  return "Note " + index;
}

function uniqueName(base) {
  const name = String(base || "Shared note").trim().slice(0, MAX_NAME) || "Shared note";
  const used = new Set(state.notes.map((note) => note.name));
  if (!used.has(name)) return name;
  let index = 2;
  while (used.has(name + " (" + index + ")")) index += 1;
  return (name + " (" + index + ")").slice(0, MAX_NAME);
}

function displayName(name) {
  const match = /^Note (\d+)$/.exec(name);
  return match ? match[1] : name;
}

function plural(count, singular, pluralForm) {
  return count + " " + (count === 1 ? singular : pluralForm);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function announce(message) {
  els.live.textContent = "";
  window.setTimeout(function () {
    els.live.textContent = message;
  }, 20);
}

function exec(command, value) {
  try {
    if (typeof document.execCommand !== "function") return false;
    return document.execCommand(command, false, value);
  } catch (error) {
    return false;
  }
}

/* Status and storage */

function showToast(text, persistent) {
  if (!els.toast) return;
  els.toast.textContent = text;
  els.toast.hidden = false;
  state.toastPersistent = Boolean(persistent);
  window.clearTimeout(state.toastTimer);
  if (!persistent) {
    state.toastTimer = window.setTimeout(hideToast, 2800);
  }
}

function hideToast() {
  if (!els.toast) return;
  window.clearTimeout(state.toastTimer);
  els.toast.hidden = true;
  els.toast.textContent = "";
  state.toastPersistent = false;
}

function setStatus(text, transient) {
  const seq = (state.statusSeq += 1);
  els.saveStatus.textContent = text;
  els.saveStatus.classList.remove("is-error");
  els.saveStatus.title = "";
  window.clearTimeout(state.statusTimer);
  if (transient) {
    showToast(text, false);
    state.statusTimer = window.setTimeout(function () {
      if (seq !== state.statusSeq) return;
      if (!store.getLastError()) {
        els.saveStatus.textContent = "Saved in this browser";
      }
    }, 2600);
  }
}

function handleStorageError() {
  state.statusSeq += 1;
  els.saveStatus.textContent = "Could not save in this browser";
  els.saveStatus.classList.add("is-error");
  els.saveStatus.title = "Your browser blocked local storage. Download the note to keep it.";
  window.clearTimeout(state.statusTimer);
  showToast("Could not save. Download your note.", true);
  announce("Could not save. Download your note to keep it.");
}

function persistNotes(options) {
  const note = activeNote();
  if (note) note.updatedAt = Date.now();
  store.saveNotes(state.notes);

  if (options && options.silent) return;

  const seq = (state.statusSeq += 1);
  els.saveStatus.classList.remove("is-error");
  els.saveStatus.textContent = "Saving…";
  window.clearTimeout(state.savedTimer);
  state.savedTimer = window.setTimeout(function () {
    if (seq !== state.statusSeq) return;
    if (store.getLastError()) return;
    els.saveStatus.textContent = "Saved in this browser";
    els.saveStatus.classList.remove("is-error");
    if (state.toastPersistent) hideToast();
  }, 420);
}

function saveScrollNow() {
  rememberScroll();
  store.saveNotes(state.notes);
}

function rememberScroll() {
  if (state.preview) return;
  const note = activeNote();
  if (note) note.scrollTop = els.editor.scrollTop;
}

/* Theme */

function effectiveTheme() {
  if (state.prefs.theme === "auto") {
    return state.themeQuery.matches ? "dark" : "light";
  }
  return state.prefs.theme;
}

function applyTheme() {
  const theme = effectiveTheme();
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#141414" : "#f8fafc");

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  els.themeToggle.title = label;
  els.themeToggle.setAttribute("aria-label", label);
}

function toggleTheme() {
  state.prefs.theme = effectiveTheme() === "dark" ? "light" : "dark";
  store.savePrefs(state.prefs);
  applyTheme();
}

/* Word wrap */

function applyWrap() {
  const on = state.prefs.wrap;
  els.editor.classList.toggle("wrap-off", !on);
  els.editor.setAttribute("wrap", on ? "soft" : "off");
  els.wrapBtn.setAttribute("aria-pressed", String(on));
  const label = on ? "Disable word wrap" : "Enable word wrap";
  els.wrapBtn.title = label;
  els.wrapBtn.setAttribute("aria-label", label);
  if (!state.preview) scheduleLayout();
}

function toggleWrap() {
  state.prefs.wrap = !state.prefs.wrap;
  store.savePrefs(state.prefs);
  applyWrap();
}

/* Markdown preview */

function renderPreview() {
  const note = activeNote();
  if (!note) {
    els.preview.textContent = "";
    return;
  }
  renderMarkdown(note.text, els.preview);
}

function setPreviewMode(on, focus) {
  if (on) rememberScroll();

  state.preview = Boolean(on);
  els.editorPane.classList.toggle("preview-mode", state.preview);
  els.preview.hidden = !state.preview;
  els.previewBtn.setAttribute("aria-pressed", String(state.preview));

  const label = state.preview ? "Back to editing" : "Show Markdown preview";
  els.previewBtn.title = label + " (Ctrl/⌘+Alt+M)";
  els.previewBtn.setAttribute("aria-label", label);

  if (state.preview) {
    els.preview.scrollTop = 0;
    renderPreview();
    if (focus) els.preview.focus();
  } else {
    scheduleLayout(function () {
      const note = activeNote();
      if (note) {
        els.editor.scrollTop = note.scrollTop || 0;
        syncScroll();
      }
    });
    if (focus) els.editor.focus();
  }

  updateUndoButtons();
}

function togglePreview() {
  setPreviewMode(!state.preview, true);
}

/* Tabs */

function renderTabs() {
  els.tabs.textContent = "";

  state.notes.forEach(function (note, index) {
    const slot = document.createElement("div");
    slot.className = "tab-slot";
    if (note.id === state.activeId) slot.classList.add("active");

    if (state.renamingId === note.id) {
      const input = document.createElement("input");
      input.className = "tab-rename";
      input.id = "rename-" + note.id;
      input.type = "text";
      input.value = note.name;
      input.maxLength = MAX_NAME;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", "Note name");
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          commitRename(note.id, true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancelRename(note.id);
        }
      });
      input.addEventListener("blur", function () {
        if (state.renamingId === note.id) commitRename(note.id, false);
      });
      slot.append(input);
      els.tabs.append(slot);
      return;
    }

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab";
    tab.id = "tab-" + note.id;
    tab.dataset.id = note.id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", "editor");
    tab.setAttribute("aria-selected", String(note.id === state.activeId));
    tab.tabIndex = note.id === state.activeId ? 0 : -1;
    tab.setAttribute("aria-label", note.name + ", " + (note.text ? "contains text" : "empty"));
    tab.title =
      note.name +
      (index < 9 ? " · Ctrl/⌘+Alt+" + (index + 1) : "") +
      " · Double-click to rename";
    tab.addEventListener("click", function () {
      switchNote(note.id);
    });
    tab.addEventListener("dblclick", function () {
      startRename(note.id);
    });
    tab.addEventListener("keydown", onTabKeydown);

    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = displayName(note.name);

    const ext = document.createElement("span");
    ext.className = "tab-ext";
    ext.textContent = ".txt";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab-close";
    close.textContent = "×";
    close.tabIndex = -1;
    close.title = "Close note";
    close.setAttribute("aria-label", "Close " + note.name);
    close.addEventListener("click", function (event) {
      event.stopPropagation();
      requestClose(note.id);
    });

    tab.append(label, ext);
    slot.append(tab, close);
    els.tabs.append(slot);
  });

  els.addTab.disabled = state.notes.length >= MAX_TABS;
  els.addTab.title =
    state.notes.length >= MAX_TABS
      ? "Tab limit reached (20)"
      : "Add note (Ctrl/⌘+Alt+N)";
  scrollActiveTabIntoView();
}

function scrollActiveTabIntoView() {
  window.requestAnimationFrame(function () {
    const tab = document.getElementById("tab-" + state.activeId);
    if (tab) tab.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

function focusTab(id) {
  const tab = document.getElementById("tab-" + id);
  if (tab) tab.focus();
}

function onTabKeydown(event) {
  const id = event.currentTarget.dataset.id;
  const order = state.notes.map((note) => note.id);
  let index = order.indexOf(id);

  if (event.key === "ArrowRight") {
    event.preventDefault();
    index = (index + 1) % order.length;
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    index = (index - 1 + order.length) % order.length;
  } else if (event.key === "Home") {
    event.preventDefault();
    index = 0;
  } else if (event.key === "End") {
    event.preventDefault();
    index = order.length - 1;
  } else if (event.key === "F2") {
    event.preventDefault();
    startRename(id);
    return;
  } else if (event.key === "Delete") {
    event.preventDefault();
    requestClose(id);
    return;
  } else {
    return;
  }

  switchNote(order[index]);
  focusTab(order[index]);
}

function startRename(id) {
  const note = state.notes.find((item) => item.id === id);
  if (!note) return;
  state.renamingId = id;
  renderTabs();
  const input = document.getElementById("rename-" + id);
  if (input) {
    input.focus();
    input.select();
  }
}

function commitRename(id, focus) {
  const input = document.getElementById("rename-" + id);
  const note = state.notes.find((item) => item.id === id);
  if (!note) {
    state.renamingId = null;
    return;
  }

  const value = input ? input.value.trim() : "";
  if (value && value !== note.name) {
    note.name = value.slice(0, MAX_NAME);
    persistNotes();
    announce("Note renamed");
  }

  state.renamingId = null;
  renderTabs();
  if (focus) focusTab(id);
}

function cancelRename(id) {
  state.renamingId = null;
  renderTabs();
  focusTab(id);
}

function switchNote(id) {
  if (id === state.activeId) return;
  const target = state.notes.find((note) => note.id === id);
  if (!target) return;

  rememberScroll();
  closeSharePopover();
  state.activeId = id;
  state.renamingId = null;
  state.anchorLine = 1;
  store.saveActive(id);
  store.saveNotes(state.notes);
  renderTabs();
  loadActiveNote();
}

function addNote() {
  rememberScroll();
  closeSharePopover();
  if (state.notes.length >= MAX_TABS) {
    setStatus("Tab limit reached (20)", true);
    announce("Tab limit reached. Close a note to add another.");
    return;
  }

  if (state.preview) setPreviewMode(false, false);

  const note = makeNote(nextNoteName());
  state.notes.push(note);
  state.activeId = note.id;
  state.renamingId = null;
  store.saveActive(note.id);
  persistNotes();
  renderTabs();
  loadActiveNote();
  els.editor.focus();
}

function requestClose(id) {
  const note = state.notes.find((item) => item.id === id);
  if (!note) return;

  if (note.text.length > 0) {
    openConfirm(
      "Close note?",
      'The note "' + note.name + '" will be removed from this browser. This cannot be undone.',
      "Close note"
    ).then(function (confirmed) {
      if (confirmed) closeNote(id);
    });
    return;
  }

  closeNote(id);
}

function closeNote(id) {
  const index = state.notes.findIndex((note) => note.id === id);
  if (index === -1) return;

  closeSharePopover();
  const wasActive = state.activeId === id;
  state.notes.splice(index, 1);
  if (state.renamingId === id) state.renamingId = null;

  if (state.notes.length === 0) {
    const note = makeNote("Note 1");
    state.notes.push(note);
    state.activeId = note.id;
  } else if (wasActive) {
    const next = state.notes[Math.min(index, state.notes.length - 1)];
    state.activeId = next.id;
  }

  store.saveActive(state.activeId);
  persistNotes();
  renderTabs();
  if (wasActive) {
    loadActiveNote();
    if (state.preview) {
      els.preview.focus();
    } else {
      els.editor.focus();
    }
  } else {
    focusTab(state.activeId);
  }
  announce("Note closed");
}

/* Editor loading and layout */

function loadActiveNote() {
  const note = activeNote();
  if (!note) return;

  els.editor.value = note.text;
  state.escapePressed = false;
  state.undoAvailable = false;
  state.redoAvailable = false;
  updateActionButtons();
  updateUndoButtons();
  updateStats();

  if (state.preview) {
    els.preview.scrollTop = 0;
    renderPreview();
    return;
  }

  scheduleLayout(function () {
    els.editor.scrollTop = note.scrollTop || 0;
    syncScroll();
    updateHighlightButtons();
    renderHighlightBands();
  });
}

function updateActionButtons() {
  const note = activeNote();
  const empty = !note || note.text.length === 0;
  els.copyBtn.disabled = empty;
  els.clearBtn.disabled = empty;
}

function updateUndoButtons() {
  els.undoBtn.disabled = state.preview || !state.undoAvailable;
  els.redoBtn.disabled = state.preview || !state.redoAvailable;
}

function updateStats() {
  const text = els.editor.value;
  const lines = text.split("\n").length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = Array.from(text).length;
  const bytes = new TextEncoder().encode(text).length;

  els.statLines.textContent = plural(lines, "line", "lines");
  els.statWords.textContent = " · " + plural(words, "word", "words");
  els.statChars.textContent = " · " + plural(chars, "char", "chars");
  els.statBytes.textContent = " · " + formatBytes(bytes);

  const large = bytes > WARN_BYTES;
  els.noteWarning.hidden = !large;
  els.noteWarning.title = large
    ? "This note is " + formatBytes(bytes) + ". Share links may be very long; download it instead."
    : "";
}

function updateTabAria(note) {
  const tab = document.getElementById("tab-" + note.id);
  if (tab) {
    tab.setAttribute(
      "aria-label",
      note.name + ", " + (note.text ? "contains text" : "empty")
    );
  }
}

function scheduleLayout(after) {
  if (state.preview) return;
  if (after) state.afterLayout.push(after);
  if (state.layoutFrame) return;
  state.layoutFrame = window.requestAnimationFrame(function () {
    state.layoutFrame = 0;
    layoutEditor();
    const callbacks = state.afterLayout.slice();
    state.afterLayout.length = 0;
    callbacks.forEach(function (callback) {
      callback();
    });
  });
}

function layoutEditor() {
  const note = activeNote();
  if (!note) return;

  const text = els.editor.value;
  const lines = text.split("\n");
  const count = lines.length;
  const changedGutter = ensureGutter(count);

  const style = window.getComputedStyle(els.editor);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const padTop = parseFloat(style.paddingTop) || 0;
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padRight = parseFloat(style.paddingRight) || 0;
  state.lineHeight = lineHeight;
  state.padTop = padTop;

  let tops = new Array(count);
  let contentHeight = 0;

  if (state.prefs.wrap && count <= MAX_MEASURE_LINES) {
    const width = Math.max(1, els.editor.clientWidth - padLeft - padRight);
    const heights = measureLineHeights(width, lines);
    let y = 0;
    for (let index = 0; index < count; index += 1) {
      tops[index] = y;
      y += heights[index] || lineHeight;
    }
    contentHeight = y;
  } else {
    for (let index = 0; index < count; index += 1) tops[index] = index * lineHeight;
    contentHeight = count * lineHeight;
  }

  state.lineTops = tops;
  state.contentHeight = contentHeight;

  const buttons = els.gutterInner.children;
  for (let index = 0; index < buttons.length && index < count; index += 1) {
    const bottom = index + 1 < count ? tops[index + 1] : contentHeight;
    buttons[index].style.height = Math.max(1, bottom - tops[index]) + "px";
  }

  const clamped = clampHighlights(count);
  renderHighlightBands();
  if (changedGutter || clamped) updateHighlightButtons();
  syncScroll();
}

function ensureGutter(count) {
  const target = Math.min(count, MAX_GUTTER_LINES);
  let changed = false;

  while (els.gutterInner.children.length < target) {
    const line = els.gutterInner.children.length + 1;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gutter-line";
    button.dataset.line = String(line);
    button.textContent = String(line);
    button.setAttribute("aria-label", "Line " + line);
    button.setAttribute("aria-pressed", "false");
    els.gutterInner.append(button);
    changed = true;
  }

  while (els.gutterInner.children.length > target) {
    els.gutterInner.lastElementChild.remove();
    changed = true;
  }

  return changed;
}

function measureLineHeights(width, lines) {
  if (width !== state.measureWidth) {
    state.measureWidth = width;
    state.measureLines = new Array(lines.length);
    state.measureHeights = new Array(lines.length);
    els.measure.style.width = width + "px";
  } else if (state.measureLines.length !== lines.length) {
    state.measureLines.length = lines.length;
    state.measureHeights.length = lines.length;
  }

  while (els.measure.children.length < lines.length) {
    const child = document.createElement("div");
    els.measure.append(child);
  }
  while (els.measure.children.length > lines.length) {
    els.measure.lastElementChild.remove();
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (state.measureLines[index] !== lines[index]) {
      els.measure.children[index].textContent = lines[index];
      state.measureLines[index] = lines[index];
      state.measureHeights[index] = 0;
    }
  }

  const heights = new Array(lines.length);
  for (let index = 0; index < lines.length; index += 1) {
    let height = state.measureHeights[index];
    if (!height) {
      height =
        els.measure.children[index].getBoundingClientRect().height ||
        state.lineHeight;
      state.measureHeights[index] = height;
    }
    heights[index] = height;
  }
  return heights;
}

function syncScroll() {
  const y = els.editor.scrollTop;
  const transform = y ? "translate3d(0, " + -y + "px, 0)" : "";
  els.gutterInner.style.transform = transform;
  els.highlightInner.style.transform = transform;
}

function clampHighlights(count) {
  const note = activeNote();
  if (!note) return false;

  const before = note.highlights;
  const clamped = store.mergeRanges(
    before
      .map(function (range) {
        if (range[0] > count) return null;
        return [range[0], Math.min(range[1], count)];
      })
      .filter(Boolean)
  );

  if (JSON.stringify(clamped) !== JSON.stringify(before)) {
    note.highlights = clamped;
    persistNotes({ silent: true });
    return true;
  }
  return false;
}

/* Highlights */

function isHighlighted(line) {
  const note = activeNote();
  if (!note) return false;
  return note.highlights.some(function (range) {
    return line >= range[0] && line <= range[1];
  });
}

function updateHighlightButtons() {
  const buttons = els.gutterInner.children;
  for (let index = 0; index < buttons.length; index += 1) {
    const line = Number(buttons[index].dataset.line);
    buttons[index].setAttribute("aria-pressed", String(isHighlighted(line)));
  }
}

function renderHighlightBands() {
  els.highlightInner.textContent = "";
  const note = activeNote();
  if (!note || note.highlights.length === 0) return;

  const count = state.lineTops.length;
  const tops = state.lineTops;
  const contentHeight = state.contentHeight;

  note.highlights.forEach(function (range) {
    const start = Math.max(1, range[0]);
    const end = Math.min(count, range[1]);
    if (end < start) return;

    const top = tops[start - 1];
    const bottom = end < count ? tops[end] : contentHeight;
    if (bottom <= top) return;

    const band = document.createElement("div");
    band.className = "hl-band";
    band.style.top = top + 1 + "px";
    band.style.height = Math.max(2, bottom - top - 2) + "px";
    els.highlightInner.append(band);
  });
}

function applyLineAction(line, extend) {
  const note = activeNote();
  if (!note) return;

  const count = lineCount();
  const target = Math.max(1, Math.min(line, count));

  if (extend) {
    const anchor = Math.max(1, Math.min(state.anchorLine || target, count));
    const start = Math.min(anchor, target);
    const end = Math.max(anchor, target);
    note.highlights = store.mergeRanges(note.highlights.concat([[start, end]]));
  } else {
    const index = note.highlights.findIndex(function (range) {
      return target >= range[0] && target <= range[1];
    });
    if (index >= 0) {
      note.highlights.splice(index, 1);
    } else {
      note.highlights = store.mergeRanges(note.highlights.concat([[target, target]]));
    }
    state.anchorLine = target;
  }

  updateHighlightButtons();
  renderHighlightBands();
  persistNotes();
}

function onGutterKeydown(event) {
  const button = event.target.closest(".gutter-line");
  if (!button) return;

  const line = Number(button.dataset.line);

  if ((event.key === "Enter" || event.key === " ") && event.shiftKey) {
    event.preventDefault();
    applyLineAction(line, true);
    return;
  }

  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    const nextLine =
      event.key === "ArrowUp" ? Math.max(1, line - 1) : Math.min(
        els.gutterInner.children.length,
        line + 1
      );
    const next = els.gutterInner.querySelector('[data-line="' + nextLine + '"]');
    if (next) next.focus();
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    const first = els.gutterInner.firstElementChild;
    if (first) first.focus();
  } else if (event.key === "End") {
    event.preventDefault();
    const last = els.gutterInner.lastElementChild;
    if (last) last.focus();
  }
}

/* History */

function doHistory(kind) {
  const note = activeNote();
  if (!note) return;

  state.applyingHistory = true;
  const ok = exec(kind);
  state.applyingHistory = false;
  if (!ok) return;

  if (els.editor.value !== note.text) {
    note.text = els.editor.value;
    updateStats();
    persistNotes();
    scheduleLayout();
  }

  state.undoAvailable = true;
  state.redoAvailable = kind === "undo";
  updateUndoButtons();
  updateActionButtons();
}

function insertTabCharacter() {
  if (exec("insertText", "\t")) return;
  const start = els.editor.selectionStart;
  const end = els.editor.selectionEnd;
  els.editor.setRangeText("\t", start, end, "end");
  els.editor.dispatchEvent(new Event("input", { bubbles: true }));
}

/* Actions */

function copyAll() {
  const note = activeNote();
  if (!note || !note.text) return;

  const text = note.text;
  const done = function (ok) {
    setStatus(ok ? "Copied" : "Copy failed", true);
    announce(ok ? "Text copied" : "Copy failed");
  };

  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(text).then(
      function () {
        done(true);
      },
      function () {
        fallbackCopy();
      }
    );
  } else {
    fallbackCopy();
  }

  function fallbackCopy() {
    const start = els.editor.selectionStart;
    const end = els.editor.selectionEnd;
    els.editor.focus();
    els.editor.select();
    const ok = exec("copy");
    els.editor.setSelectionRange(start, end);
    done(ok);
  }
}

function clearNote() {
  const note = activeNote();
  if (!note || !note.text) return;

  openConfirm(
    "Clear note?",
    "This removes all text and line highlights from this note. You can press Undo afterwards.",
    "Clear note"
  ).then(function (confirmed) {
    if (!confirmed) return;

    if (state.preview) setPreviewMode(false, true);
    els.editor.focus();
    els.editor.select();
    let usedNative = exec("delete");
    if (!usedNative) {
      els.editor.setRangeText("", 0, els.editor.value.length, "start");
      els.editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    const current = activeNote();
    if (current) {
      current.text = els.editor.value;
      current.highlights = [];
      persistNotes();
    }
    state.anchorLine = 1;

    updateStats();
    updateActionButtons();
    scheduleLayout(function () {
      updateHighlightButtons();
      renderHighlightBands();
    });
    if (usedNative) {
      state.undoAvailable = true;
      state.redoAvailable = false;
      updateUndoButtons();
    }
    announce("Note cleared");
  });
}

function safeFilename(name) {
  const base = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/\.txt$/i, "");
  return base || "note";
}

function downloadNote() {
  const note = activeNote();
  if (!note) return;

  const blob = new Blob([note.text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFilename(note.name) + ".txt";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 2000);

  setStatus("Downloaded", true);
  announce("Note downloaded");
}

/* Sharing */

function setShareStatus(text, isError) {
  els.shareStatusText.textContent = text;
  els.shareStatus.classList.toggle("is-error", Boolean(isError));
}

async function copyString(value) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      /* Fall through to the selection-based copy. */
    }
  }
  els.shareUrl.focus();
  els.shareUrl.select();
  return exec("copy");
}

async function openShare() {
  if (state.shareOpen) {
    closeSharePopover();
    return;
  }
  if (state.sharePending) return;

  const note = activeNote();
  if (!note || !note.text) {
    setStatus("Nothing to share", true);
    announce("Nothing to share");
    return;
  }

  state.sharePending = true;
  setStatus("Creating link…");
  try {
    const payload = await encodePayload({ name: note.name, text: note.text });
    const url = location.origin + location.pathname + "#n=" + payload;

    state.shareUrl = url;
    els.shareUrl.value = url;
    els.shareUrl.title = url;
    els.shareWarning.hidden = url.length <= LONG_URL;
    setShareStatus("Link copied", false);
    openSharePopover();

    const copied = await copyString(url);
    if (copied) {
      setStatus("Link copied", true);
      announce("Share link copied");
    } else {
      setShareStatus("Copy the link", true);
    }

    els.shareUrl.focus();
    els.shareUrl.select();
  } catch (error) {
    setStatus("Could not create link", true);
    announce("Could not create a share link.");
  } finally {
    state.sharePending = false;
  }
}

function openSharePopover() {
  state.shareOpen = true;
  els.sharePopover.hidden = false;
  els.shareBtn.setAttribute("aria-expanded", "true");
  positionSharePopover();
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  document.addEventListener("keydown", onDocumentKeydown, true);
  window.addEventListener("resize", positionSharePopover);
}

function closeSharePopover() {
  if (!state.shareOpen) return;
  const hadFocus = els.sharePopover.contains(document.activeElement);
  state.shareOpen = false;
  els.sharePopover.hidden = true;
  els.shareBtn.setAttribute("aria-expanded", "false");
  document.removeEventListener("pointerdown", onDocumentPointerDown, true);
  document.removeEventListener("keydown", onDocumentKeydown, true);
  window.removeEventListener("resize", positionSharePopover);
  if (hadFocus) els.shareBtn.focus();
}

function positionSharePopover() {
  if (!state.shareOpen) return;
  const rect = els.shareBtn.getBoundingClientRect();
  const width = Math.min(420, window.innerWidth - 20);
  els.sharePopover.style.width = width + "px";
  els.sharePopover.style.top = rect.bottom + 6 + "px";
  els.sharePopover.style.right = Math.max(10, window.innerWidth - rect.right) + "px";
  els.sharePopover.style.left = "auto";
}

function onDocumentPointerDown(event) {
  if (els.sharePopover.contains(event.target)) return;
  if (els.shareBtn.contains(event.target)) return;
  closeSharePopover();
}

function onDocumentKeydown(event) {
  if (event.key === "Escape" && state.shareOpen) {
    event.preventDefault();
    closeSharePopover();
  }
}

async function copyShareLink() {
  const value = state.shareUrl || els.shareUrl.value;
  if (!value) return;
  const ok = await copyString(value);
  setShareStatus(ok ? "Link copied" : "Copy failed", !ok);
  if (ok) announce("Share link copied");
}

function handleHash() {
  if (!location.hash.startsWith("#n=")) return;

  const payload = location.hash.slice(3);
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch (error) {
    /* Fragments still work on hosts that restrict history. */
  }

  rememberScroll();
  closeSharePopover();
  setStatus("Opening shared note…");
  decodePayload(payload)
    .then(function (shared) {
      const initial = state.notes[0];
      if (
        state.pristineDefaultId &&
        state.notes.length === 1 &&
        initial.id === state.pristineDefaultId &&
        initial.text === ""
      ) {
        state.notes = [];
      }
      state.pristineDefaultId = null;

      const note = makeNote(uniqueName(shared.name || "Shared note"), shared.text);
      state.notes.push(note);
      state.activeId = note.id;
      state.renamingId = null;
      store.saveActive(note.id);
      persistNotes();
      renderTabs();
      loadActiveNote();
      setStatus("Opened from link — saved in this browser", true);
      announce("Shared note opened and saved in this browser.");
    })
    .catch(function () {
      setStatus("Could not open shared note", true);
      announce("Could not open the shared link. It may be incomplete.");
    });
}

/* Dialogs and shortcuts */

function openConfirm(title, message, confirmLabel) {
  if (els.confirmDialog.open) return Promise.resolve(false);

  return new Promise(function (resolve) {
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmOk.textContent = confirmLabel;
    els.confirmDialog.returnValue = "";

    function onClose() {
      els.confirmDialog.removeEventListener("close", onClose);
      resolve(els.confirmDialog.returnValue === "confirm");
    }

    els.confirmDialog.addEventListener("close", onClose);
    els.confirmDialog.showModal();
    els.confirmCancel.focus();
  });
}

function openPrivacy() {
  if (!els.privacyDialog.open) els.privacyDialog.showModal();
}

function isTextInput(element) {
  return element && (element.tagName === "TEXTAREA" || element.tagName === "INPUT");
}

function onGlobalKeydown(event) {
  if (event.defaultPrevented) return;
  if (document.querySelector("dialog[open]")) return;

  if (event.key === "F2" && !isTextInput(event.target)) {
    const focusedTab = event.target.closest && event.target.closest(".tab");
    event.preventDefault();
    startRename(focusedTab ? focusedTab.dataset.id : state.activeId);
    return;
  }

  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier || !event.altKey || event.shiftKey) return;

  const code = event.code;

  if (/^Digit[1-9]$/.test(code)) {
    const index = Number(code.slice(5)) - 1;
    if (state.notes[index]) {
      event.preventDefault();
      switchNote(state.notes[index].id);
      focusTab(state.notes[index].id);
    }
    return;
  }

  switch (code) {
    case "KeyN":
      event.preventDefault();
      addNote();
      break;
    case "KeyW":
      event.preventDefault();
      requestClose(state.activeId);
      break;
    case "KeyD":
      event.preventDefault();
      toggleTheme();
      break;
    case "KeyS":
      event.preventDefault();
      openShare();
      break;
    case "KeyL":
      event.preventDefault();
      toggleWrap();
      break;
    case "KeyM":
      event.preventDefault();
      togglePreview();
      break;
    case "KeyP":
      event.preventDefault();
      openPrivacy();
      break;
    default:
      break;
  }
}

/* Wiring */

function bindEvents() {
  state.themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const onThemeChange = function () {
    if (state.prefs.theme === "auto") applyTheme();
  };
  if (state.themeQuery.addEventListener) {
    state.themeQuery.addEventListener("change", onThemeChange);
  } else if (state.themeQuery.addListener) {
    state.themeQuery.addListener(onThemeChange);
  }

  els.addTab.addEventListener("click", addNote);
  els.previewBtn.addEventListener("click", togglePreview);
  els.themeToggle.addEventListener("click", toggleTheme);
  els.shareBtn.addEventListener("click", openShare);
  els.undoBtn.addEventListener("click", function () {
    doHistory("undo");
  });
  els.redoBtn.addEventListener("click", function () {
    doHistory("redo");
  });
  els.copyBtn.addEventListener("click", copyAll);
  els.clearBtn.addEventListener("click", clearNote);
  els.downloadBtn.addEventListener("click", downloadNote);
  els.wrapBtn.addEventListener("click", toggleWrap);
  els.privacyBtn.addEventListener("click", openPrivacy);

  els.editor.addEventListener("input", function () {
    const note = activeNote();
    if (!note) return;
    note.text = els.editor.value;

    if (!state.applyingHistory) {
      state.undoAvailable = true;
      state.redoAvailable = false;
      updateUndoButtons();
    }

    updateActionButtons();
    updateStats();
    updateTabAria(note);
    persistNotes();
    scheduleLayout();
  });

  els.editor.addEventListener(
    "scroll",
    function () {
      syncScroll();
      const note = activeNote();
      if (!note) return;
      note.scrollTop = els.editor.scrollTop;
      window.clearTimeout(state.scrollSaveTimer);
      state.scrollSaveTimer = window.setTimeout(function () {
        store.saveNotes(state.notes);
      }, 400);
    },
    { passive: true }
  );

  els.editor.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      state.escapePressed = true;
      return;
    }

    if (event.key === "Tab") {
      if (event.shiftKey || state.escapePressed) {
        state.escapePressed = false;
        return;
      }
      event.preventDefault();
      insertTabCharacter();
      return;
    }

    state.escapePressed = false;
  });

  els.gutter.addEventListener("click", function (event) {
    const button = event.target.closest(".gutter-line");
    if (!button) return;
    applyLineAction(Number(button.dataset.line), event.shiftKey);
  });

  els.gutter.addEventListener("keydown", onGutterKeydown);

  els.shareCopy.addEventListener("click", copyShareLink);

  els.privacyDialog.querySelectorAll("[data-close]").forEach(function (button) {
    button.addEventListener("click", function () {
      els.privacyDialog.close();
    });
  });

  els.confirmCancel.addEventListener("click", function () {
    els.confirmDialog.returnValue = "cancel";
    els.confirmDialog.close();
  });

  els.confirmOk.addEventListener("click", function () {
    els.confirmDialog.returnValue = "confirm";
    els.confirmDialog.close();
  });

  document.addEventListener("keydown", onGlobalKeydown);
  window.addEventListener("hashchange", handleHash);

  window.addEventListener("pagehide", function () {
    saveScrollNow();
    store.flush();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      saveScrollNow();
      store.flush();
    }
  });

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(function () {
      scheduleLayout();
    }).observe(els.editorPane);
  } else {
    window.addEventListener("resize", function () {
      scheduleLayout();
    });
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (
    location.protocol !== "https:" &&
    location.hostname !== "localhost" &&
    location.hostname !== "127.0.0.1"
  ) {
    return;
  }

  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("./sw.js", { scope: "./", updateViaCache: "none" })
      .catch(function () {
        /* Offline support is optional; the editor works without it. */
      });
  });
}

function init() {
  store.onStorageError(handleStorageError);
  const loaded = store.load();
  state.notes = loaded.notes;
  state.prefs = loaded.prefs;

  if (state.notes.length === 0) {
    const note = makeNote("Note 1");
    state.notes.push(note);
    state.activeId = note.id;
    state.pristineDefaultId = note.id;
    store.saveNotes(state.notes);
    store.saveActive(note.id);
  } else {
    state.activeId = state.notes.some(function (note) {
      return note.id === loaded.activeId;
    })
      ? loaded.activeId
      : state.notes[0].id;
  }

  bindEvents();
  applyTheme();
  applyWrap();
  renderTabs();
  loadActiveNote();
  handleHash();
  registerServiceWorker();
}

init();
