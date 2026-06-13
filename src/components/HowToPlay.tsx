import { useState } from 'react';
import { useLang } from '../lib/lang';

export function HowToPlay() {
  const { t } = useLang();
  const [ruleOpen, setRuleOpen] = useState(false);

  return (
    <>
      {/* RULE section — collapsible */}
      <div className="panel-section">
        <button
          type="button"
          className="rule-toggle-btn"
          onClick={() => setRuleOpen((o) => !o)}
          aria-expanded={ruleOpen}
        >
          <span className="section-eyebrow rule-toggle-eyebrow">{t.rulesTitle}</span>
          <span className="rule-toggle-icon">{ruleOpen ? '▲' : '▼'}</span>
        </button>
        {ruleOpen && (
          <div className="rule-body">
            {t.rulesBody.map((item) => (
              <div key={item.heading} className="rule-article">
                <div className="rule-article-heading">{item.heading}</div>
                <div className="rule-article-body">
                  {item.body.split('\n').map((line, i) => (
                    <span key={i}>
                      {line}
                      {i < item.body.split('\n').length - 1 && <br />}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


    </>
  );
}
