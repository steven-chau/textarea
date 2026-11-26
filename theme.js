/* Blocking script: apply the stored colour scheme before the first paint. */
(function () {
  var theme = "auto";
  try {
    var raw = localStorage.getItem("ta:v1:prefs");
    if (raw) {
      var prefs = JSON.parse(raw);
      if (prefs && (prefs.theme === "light" || prefs.theme === "dark")) {
        theme = prefs.theme;
      }
    }
  } catch (error) {
    /* Storage can be unavailable; fall back to the OS preference. */
  }

  var dark =
    theme === "dark" ||
    (theme === "auto" &&
      typeof matchMedia === "function" &&
      matchMedia("(prefers-color-scheme: dark)").matches);

  document.documentElement.dataset.theme = dark ? "dark" : "light";

  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#141414" : "#f8fafc");
})();
