import { useEffect, useRef, useState } from 'react';
import { SUPPORTED_LOCALES } from '../lib/locales';
import type { LocaleCode } from '../lib/locales';
import { useLang } from '../lib/lang';
import './CompactLanguageSelector.css';

interface Props {
  selectedLocale: LocaleCode;
  onSelect: (code: LocaleCode) => void;
  /** Optional extra CSS class applied to the root element */
  className?: string;
}

/**
 * CompactLanguageSelector
 *
 * Displays the current locale label as a pill trigger.
 * Clicking opens an inline panel listing all 10 supported locales.
 * After selection the panel closes automatically.
 *
 * Used by: TitleScreen, UserPage, JournalListPage, JournalArticlePage
 */
export function CompactLanguageSelector({ selectedLocale, onSelect, className }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  const rootRef = useRef<HTMLDivElement>(null);

  const currentLabel =
    SUPPORTED_LOCALES.find(l => l.code === selectedLocale)?.label ?? selectedLocale;

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  function handleTrigger(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(v => !v);
  }

  function handleSelect(e: React.MouseEvent, code: LocaleCode) {
    e.stopPropagation();
    onSelect(code);
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className={`cls-root${className ? ` ${className}` : ''}`}
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        className={`cls-trigger${open ? ' open' : ''}`}
        onClick={handleTrigger}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="cls-current">{currentLabel}</span>
        <span className="cls-label">{t.langLabel}</span>
        <span className="cls-chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          className="cls-panel"
          role="listbox"
          aria-label={t.langLabel}
          onClick={e => e.stopPropagation()}
        >
          {SUPPORTED_LOCALES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              role="option"
              aria-selected={selectedLocale === code}
              className={`cls-option${selectedLocale === code ? ' active' : ''}`}
              onClick={e => handleSelect(e, code as LocaleCode)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
