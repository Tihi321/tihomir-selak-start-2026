// Runs synchronously in <head> before first paint, so the stored theme and
// background choice apply with no flash. External file because CSP forbids
// inline. The ts-theme cookie is shared with the other sites and wins over
// localStorage.
(function () {
  var root = document.documentElement;
  var theme = null;
  var kind = 'field';
  try {
    var match = document.cookie.match(/(?:^|;\s*)ts-theme=(light|dark)(?:;|$)/);
    theme = match ? match[1] : localStorage.getItem('ts-theme');
    var stored = localStorage.getItem('start-page:background-kind');
    if (
      stored === 'field' ||
      stored === 'photo' ||
      stored === 'custom' ||
      stored === 'plain'
    ) {
      kind = stored;
    }
  } catch (error) {
    // Storage can be blocked. Fall back to OS theme and the neural field.
  }
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  }
  root.setAttribute('data-background', kind);
  root.setAttribute('data-field', kind === 'field' ? 'on' : 'off');
  root.setAttribute('data-js', '');
})();
