import { useLang } from '../lib/lang';

export function HowToPlay() {
  const { t } = useLang();
  return (
    <div className="panel-section">
      <div className="section-eyebrow">{t.rulesTitle}</div>
      <dl className="rules-list-new">
        <dt>{t.massive}</dt><dd>{t.massiveDesc}</dd>
        <dt>{t.selective}</dt><dd>{t.selectiveDesc}</dd>
        <dt>{t.quad}</dt><dd>{t.quadDesc}</dd>
      </dl>
    </div>
  );
}
