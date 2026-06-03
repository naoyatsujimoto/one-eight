(function () {
  'use strict';
  var LANG_KEY = 'one8_lang';
  var SUPPORTED = ['en', 'ja'];

  function detectLang() {
    try {
      var stored = localStorage.getItem(LANG_KEY);
      if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
    } catch (e) {}
    var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    return nav.startsWith('ja') ? 'ja' : 'en';
  }

  function applyLang(lang) {
    var effective = (SUPPORTED.indexOf(lang) !== -1) ? lang : 'en';
    document.body.dataset.lang = effective;
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyLang(detectLang());
  });
})();
