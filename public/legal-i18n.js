(function () {
  'use strict';
  var LANG_KEY = 'one8_lang';

  function detectLang() {
    try {
      var stored = localStorage.getItem(LANG_KEY);
      if (stored === 'en' || stored === 'ja') return stored;
    } catch (e) {}
    var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    return nav.startsWith('ja') ? 'ja' : 'en';
  }

  function applyLang(lang) {
    document.body.dataset.lang = lang;
    var btnEn = document.getElementById('btn-lang-en');
    var btnJa = document.getElementById('btn-lang-ja');
    if (btnEn) btnEn.classList.toggle('active', lang === 'en');
    if (btnJa) btnJa.classList.toggle('active', lang === 'ja');
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    var lang = detectLang();
    applyLang(lang);

    var btnEn = document.getElementById('btn-lang-en');
    var btnJa = document.getElementById('btn-lang-ja');
    if (btnEn) btnEn.addEventListener('click', function () { applyLang('en'); });
    if (btnJa) btnJa.addEventListener('click', function () { applyLang('ja'); });
  });
})();
