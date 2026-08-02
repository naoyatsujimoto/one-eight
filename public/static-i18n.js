/**
 * static-i18n.js
 * ONE EIGHT — Static page i18n base layer
 * Phase 5-1A: Core infrastructure only (no dictionaries, no UI selector)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'one8_lang';

  var SUPPORTED_LOCALES = ['zh-Hans', 'zh-Hant', 'es', 'en', 'pt-BR', 'ja', 'ko', 'de', 'fr', 'it'];

  /**
   * Intl locale tag → one8 locale mapping (BCP 47 region-specific overrides)
   * Keys are lowercased for matching.
   */
  var INTL_MAP = {
    'zh-tw': 'zh-Hant',
    'zh-hk': 'zh-Hant',
    'zh-mo': 'zh-Hant',
    'pt-br': 'pt-BR',
    'pt-pt': 'pt-BR',
    'pt':    'pt-BR',
  };

  /** Registered page dictionaries: { [locale]: { [key]: string | function } } */
  var _dictionaries = {};

  /** Currently active locale */
  var _currentLocale = null;

  // ---------------------------------------------------------------------------
  // resolveLocale
  // ---------------------------------------------------------------------------

  /**
   * Resolve a raw BCP-47 tag (e.g. from navigator.language) to a supported locale.
   * Returns 'en' for unknown/null input.
   *
   * @param {string|null|undefined} raw
   * @returns {string}
   */
  function resolveLocale(raw) {
    if (!raw) return 'en';

    var lower = raw.toLowerCase();

    // 1. Case-insensitive exact match against SUPPORTED_LOCALES (highest priority)
    for (var i = 0; i < SUPPORTED_LOCALES.length; i++) {
      if (SUPPORTED_LOCALES[i].toLowerCase() === lower) return SUPPORTED_LOCALES[i];
    }

    // 2. INTL_MAP region overrides (zh-TW/HK/MO, pt-BR, pt-PT, pt)
    if (INTL_MAP[lower]) return INTL_MAP[lower];

    // 3. zh-* fallback → zh-Hans
    if (lower.startsWith('zh')) return 'zh-Hans';

    // 4. Primary language subtag match
    var primary = lower.split('-')[0];
    for (var j = 0; j < SUPPORTED_LOCALES.length; j++) {
      if (SUPPORTED_LOCALES[j].toLowerCase() === primary) return SUPPORTED_LOCALES[j];
    }

    return 'en';
  }

  // ---------------------------------------------------------------------------
  // getIntlLocale
  // ---------------------------------------------------------------------------

  /**
   * Map a one8 locale to a standard Intl locale tag.
   *
   * @param {string} locale
   * @returns {string}
   */
  function getIntlLocale(locale) {
    var map = {
      'en':      'en',
      'ja':      'ja',
      'zh-Hant': 'zh-TW',
      'zh-Hans': 'zh-CN',
      'ko':      'ko',
      'es':      'es',
      'pt-BR':   'pt-BR',
      'de':      'de',
      'fr':      'fr',
      'it':      'it',
    };
    return map[locale] || 'en';
  }

  // ---------------------------------------------------------------------------
  // getCurrentLocale
  // ---------------------------------------------------------------------------

  /**
   * Return the currently active locale. Initialises on first call.
   *
   * Priority:
   *   1. Already initialised (_currentLocale set)
   *   2. localStorage value (if supported locale)
   *   3. navigator.language resolved via resolveLocale()
   *   4. 'en'
   *
   * @returns {string}
   */
  function getCurrentLocale() {
    if (_currentLocale) return _currentLocale;

    // 1. localStorage
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED_LOCALES.indexOf(stored) !== -1) {
        _currentLocale = stored;
        return _currentLocale;
      }
    } catch (e) { /* localStorage unavailable */ }

    // 2. navigator.language
    var nav = (typeof navigator !== 'undefined' && navigator.language) || null;
    _currentLocale = resolveLocale(nav);
    return _currentLocale;
  }

  // ---------------------------------------------------------------------------
  // registerPage
  // ---------------------------------------------------------------------------

  /**
   * Register a page-specific dictionary.
   * Values may be strings or functions (called with no args at translation time).
   *
   * @param {Object.<string, Object.<string, string|function>>} dict
   *   e.g. { en: { title: 'Hello' }, ja: { title: 'こんにちは' } }
   */
  function registerPage(dict) {
    if (!dict || typeof dict !== 'object') return;

    for (var locale in dict) {
      if (!Object.prototype.hasOwnProperty.call(dict, locale)) continue;
      if (!_dictionaries[locale]) _dictionaries[locale] = {};
      var entries = dict[locale];
      for (var key in entries) {
        if (!Object.prototype.hasOwnProperty.call(entries, key)) continue;
        _dictionaries[locale][key] = entries[key];
      }
    }
  }

  // ---------------------------------------------------------------------------
  // translate
  // ---------------------------------------------------------------------------

  /**
   * Look up a translation key for the given locale (falls back to 'en').
   * If the value is a function, calls it and returns the result.
   *
   * @param {string} key
   * @param {string} [locale]
   * @returns {string|undefined}
   */
  function translate(key, locale) {
    var loc = locale || getCurrentLocale();
    var args = Array.prototype.slice.call(arguments, 2);
    var dict = _dictionaries[loc] || _dictionaries['en'] || {};
    var val = dict[key];
    if (val === undefined && loc !== 'en') {
      var fallback = _dictionaries['en'] || {};
      val = fallback[key];
    }
    if (typeof val === 'function') return val.apply(null, args);
    return val;
  }

  // ---------------------------------------------------------------------------
  // renderTemplate — safe DOM construction for data-i18n-template elements
  // ---------------------------------------------------------------------------

  /**
   * Render a translated template string into a DOM element without using
   * innerHTML, insertAdjacentHTML, or eval.  Only three token types are
   * recognised:
   *   {{EMAIL}}   → <a href="mailto:contact@oneeightgame.com">
   *   {{WEBSITE}} → <a href="https://oneeightgame.com">
   *   \n          → <br>
   * All other characters become Text nodes.
   *
   * @param {Element} el   - Target DOM element.
   * @param {string}  text - Translated string (may contain tokens).
   */
  function renderTemplate(el, text) {
    var EMAIL_ADDR   = 'contact@oneeightgame.com';
    var WEBSITE_URL  = 'https://oneeightgame.com';
    var TOKEN_RE     = /(\{\{EMAIL\}\}|\{\{WEBSITE\}\}|\n)/g;
    var frag         = document.createDocumentFragment();
    var last         = 0;
    var match;
    TOKEN_RE.lastIndex = 0;
    while ((match = TOKEN_RE.exec(text)) !== null) {
      if (match.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, match.index)));
      }
      if (match[0] === '\n') {
        frag.appendChild(document.createElement('br'));
      } else if (match[0] === '{{EMAIL}}') {
        var ae = document.createElement('a');
        ae.href        = 'mailto:' + EMAIL_ADDR;
        ae.textContent = EMAIL_ADDR;
        frag.appendChild(ae);
      } else {
        /* {{WEBSITE}} */
        var aw = document.createElement('a');
        aw.href        = WEBSITE_URL;
        aw.textContent = WEBSITE_URL;
        frag.appendChild(aw);
      }
      last = TOKEN_RE.lastIndex;
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }
    if (typeof el.replaceChildren === 'function') {
      el.replaceChildren(frag);
    } else {
      while (el.firstChild) { el.removeChild(el.firstChild); }
      el.appendChild(frag);
    }
  }

  // ---------------------------------------------------------------------------
  // apply
  // ---------------------------------------------------------------------------

  /**
   * Walk all [data-i18n] and [data-i18n-template] elements in the document
   * and update them from the current locale dictionary. Also syncs lang
   * attributes, aria-labels, and locale selector value.
   */
  function apply() {
    var locale = getCurrentLocale();

    // Sync document lang attributes
    if (typeof document !== 'undefined') {
      document.documentElement.lang = getIntlLocale(locale);
      if (document.body) {
        document.body.dataset.lang = locale;
      }

      var elements = document.querySelectorAll('[data-i18n]');
      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        var key = el.getAttribute('data-i18n');
        if (!key) continue;
        var text = translate(key, locale);
        if (text !== undefined) {
          el.textContent = text;
        }
      }

      // Sync aria-label from data-i18n-aria-label
      var ariaEls = document.querySelectorAll('[data-i18n-aria-label]');
      for (var a = 0; a < ariaEls.length; a++) {
        var ariaEl = ariaEls[a];
        var ariaKey = ariaEl.getAttribute('data-i18n-aria-label');
        if (!ariaKey) continue;
        var ariaText = translate(ariaKey, locale);
        if (ariaText !== undefined) {
          ariaEl.setAttribute('aria-label', ariaText);
        }
      }

      // Sync locale selector value (no double-bind: only set value, no listener)
      var selects = document.querySelectorAll('select[data-lang-select]');
      for (var s = 0; s < selects.length; s++) {
        selects[s].value = locale;
      }

      // Handle data-i18n-template elements (safe DOM construction, no innerHTML)
      var tplEls = document.querySelectorAll('[data-i18n-template]');
      for (var tp = 0; tp < tplEls.length; tp++) {
        var tplEl  = tplEls[tp];
        var tplKey = tplEl.getAttribute('data-i18n-template');
        if (!tplKey) continue;
        var tplText = translate(tplKey, locale);
        if (tplText !== undefined) {
          renderTemplate(tplEl, tplText);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // setLocale
  // ---------------------------------------------------------------------------

  /**
   * Persist a new locale to localStorage, update internal state, and re-apply.
   *
   * @param {string} locale - Must be a supported locale string.
   */
  function setLocale(locale) {
    if (SUPPORTED_LOCALES.indexOf(locale) === -1) return;
    _currentLocale = locale;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch (e) { /* localStorage unavailable */ }
    apply();
    // Notify listeners that locale has changed
    if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
      document.dispatchEvent(new CustomEvent('oneeight:localechange', { detail: { locale: locale } }));
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  var ONE_EIGHT_STATIC_I18N = {
    supportedLocales: SUPPORTED_LOCALES,
    resolveLocale:    resolveLocale,
    getIntlLocale:    getIntlLocale,
    getCurrentLocale: getCurrentLocale,
    registerPage:     registerPage,
    apply:            apply,
    setLocale:        setLocale,
    translate:        translate,
  };

  if (typeof window !== 'undefined') {
    window.ONE_EIGHT_STATIC_I18N = ONE_EIGHT_STATIC_I18N;
  }

  if (typeof module !== 'undefined') {
    module.exports = ONE_EIGHT_STATIC_I18N;
  }
})();
