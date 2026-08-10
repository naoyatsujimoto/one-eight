/**
 * postmortem_redesign_ui.test.ts
 * Postmortem Modal UIリデザイン 回帰テスト
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');

function readSrc(rel: string) {
  return readFileSync(resolve(ROOT, 'src', rel), 'utf-8');
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

describe('PostmortemModal.css — 存在・主要スタイル', () => {
  const css = readSrc('components/PostmortemModal.css');

  it('PostmortemModal.css が存在する', () => {
    expect(css.length).toBeGreaterThan(100);
  });

  it('modal max-width 560px', () => {
    expect(css).toContain('max-width: 560px');
  });

  it('modal border-radius 24px', () => {
    expect(css).toContain('border-radius: 24px');
  });

  it('decisive card white + black border', () => {
    expect(css).toContain('.pm-decisive-card');
    expect(css).toContain('border: 1px solid #141413');
    expect(css).toContain('background: #fff');
  });

  it('chart card border-radius 18px', () => {
    expect(css).toContain('.pm-chart-card');
    expect(css).toContain('border-radius: 18px');
  });

  it('history card border-radius 18px', () => {
    expect(css).toContain('.pm-history-card');
  });

  it('@keyframes pm-spin を定義', () => {
    expect(css).toContain('@keyframes pm-spin');
  });

  it('overlay が position: fixed', () => {
    expect(css).toContain('position: fixed');
  });
});

// ─── TSX構造 ──────────────────────────────────────────────────────────────────

describe('PostmortemModal.tsx — CSS import と構造', () => {
  const tsx = readSrc('components/PostmortemModal.tsx');

  it('PostmortemModal.css を import する', () => {
    expect(tsx).toContain("import './PostmortemModal.css'");
  });

  it('固定色の巨大 styles オブジェクトが残っていない', () => {
    // 旧 styles.overlay / styles.card / styles.decisiveBox は削除済み
    expect(tsx).not.toContain('styles.overlay');
    expect(tsx).not.toContain('styles.decisiveBox');
    expect(tsx).not.toContain('styles.card');
  });

  it('buildResolvedWPSeries を import・使用する', () => {
    expect(tsx).toContain('buildResolvedWPSeries');
  });

  it('SVG viewBox が 520x160', () => {
    expect(tsx).toContain('520');
    expect(tsx).toContain('160');
  });

  it('PostmortemGameMeta 型が export されている', () => {
    expect(tsx).toContain('export type PostmortemGameMeta');
  });

  it('gameMeta prop が定義されている', () => {
    expect(tsx).toContain('gameMeta?:');
  });
});

// ─── 棋譜初期表示件数 ────────────────────────────────────────────────────────

describe('HistoryList — 初期表示9件・show-all', () => {
  const tsx = readSrc('components/PostmortemModal.tsx');

  it('INITIAL_ROWS = 9 が定義されている', () => {
    expect(tsx).toContain('INITIAL_ROWS = 9');
  });

  it('rows.slice(0, INITIAL_ROWS) で初期表示を制限する', () => {
    expect(tsx).toContain('rows.slice(0, INITIAL_ROWS)');
  });

  it('postmortemShowAllMoves を使用する', () => {
    expect(tsx).toContain('postmortemShowAllMoves');
  });

  it('showAll state が存在する', () => {
    expect(tsx).toContain('showAll');
  });
});

// ─── i18n ────────────────────────────────────────────────────────────────────

import { EN_TRANSLATIONS } from '../i18n/en';
import { JA_TRANSLATIONS } from '../i18n/ja';
import { ZH_HANS_TRANSLATIONS } from '../i18n/zh-Hans';
import { ZH_HANT_TRANSLATIONS } from '../i18n/zh-Hant';
import { KO_TRANSLATIONS } from '../i18n/ko';
import { ES_TRANSLATIONS } from '../i18n/es';
import { PT_BR_TRANSLATIONS } from '../i18n/pt-BR';
import { DE_TRANSLATIONS } from '../i18n/de';
import { FR_TRANSLATIONS } from '../i18n/fr';
import { IT_TRANSLATIONS } from '../i18n/it';

const ALL_DICTS = [
  { code: 'en', d: EN_TRANSLATIONS },
  { code: 'ja', d: JA_TRANSLATIONS },
  { code: 'zh-Hans', d: ZH_HANS_TRANSLATIONS },
  { code: 'zh-Hant', d: ZH_HANT_TRANSLATIONS },
  { code: 'ko', d: KO_TRANSLATIONS },
  { code: 'es', d: ES_TRANSLATIONS },
  { code: 'pt-BR', d: PT_BR_TRANSLATIONS },
  { code: 'de', d: DE_TRANSLATIONS },
  { code: 'fr', d: FR_TRANSLATIONS },
  { code: 'it', d: IT_TRANSLATIONS },
];

describe('postmortemShowAllMoves — 全10言語', () => {
  for (const { code, d } of ALL_DICTS) {
    it(`${code}: 関数として存在する`, () => {
      expect(typeof d.postmortemShowAllMoves).toBe('function');
    });

    it(`${code}: 引数 1 を保持する`, () => {
      const result = d.postmortemShowAllMoves(1);
      expect(result).toContain('1');
    });

    it(`${code}: 引数 52 を保持する`, () => {
      const result = d.postmortemShowAllMoves(52);
      expect(result).toContain('52');
    });
  }
});

describe('postmortemShowAllMoves — 欧州言語 単複', () => {
  it('es: 1 → jugada (単数)', () => {
    expect(ES_TRANSLATIONS.postmortemShowAllMoves(1)).toContain('jugada');
    expect(ES_TRANSLATIONS.postmortemShowAllMoves(1)).not.toContain('jugadas');
  });
  it('es: 2 → jugadas (複数)', () => {
    expect(ES_TRANSLATIONS.postmortemShowAllMoves(2)).toContain('jugadas');
  });
  it('pt-BR: 1 → jogada (単数)', () => {
    expect(PT_BR_TRANSLATIONS.postmortemShowAllMoves(1)).toContain('jogada');
    expect(PT_BR_TRANSLATIONS.postmortemShowAllMoves(1)).not.toContain('jogadas');
  });
  it('pt-BR: 2 → jogadas (複数)', () => {
    expect(PT_BR_TRANSLATIONS.postmortemShowAllMoves(2)).toContain('jogadas');
  });
  it('de: 1 → Zug (単数)', () => {
    expect(DE_TRANSLATIONS.postmortemShowAllMoves(1)).toContain('Zug');
    expect(DE_TRANSLATIONS.postmortemShowAllMoves(1)).not.toContain('Züge');
  });
  it('de: 2 → Züge (複数)', () => {
    expect(DE_TRANSLATIONS.postmortemShowAllMoves(2)).toContain('Züge');
  });
  it('fr: 1 → coup (単数)', () => {
    expect(FR_TRANSLATIONS.postmortemShowAllMoves(1)).toContain('coup');
    expect(FR_TRANSLATIONS.postmortemShowAllMoves(1)).not.toContain('coups');
  });
  it('fr: 2 → coups (複数)', () => {
    expect(FR_TRANSLATIONS.postmortemShowAllMoves(2)).toContain('coups');
  });
  it('it: 1 → mossa (単数)', () => {
    expect(IT_TRANSLATIONS.postmortemShowAllMoves(1)).toContain('mossa');
    expect(IT_TRANSLATIONS.postmortemShowAllMoves(1)).not.toContain('mosse');
  });
  it('it: 2 → mosse (複数)', () => {
    expect(IT_TRANSLATIONS.postmortemShowAllMoves(2)).toContain('mosse');
  });
  it('en: 1 → move (単数)', () => {
    expect(EN_TRANSLATIONS.postmortemShowAllMoves(1)).toContain('move');
    expect(EN_TRANSLATIONS.postmortemShowAllMoves(1)).not.toContain('moves');
  });
  it('en: 2 → moves (複数)', () => {
    expect(EN_TRANSLATIONS.postmortemShowAllMoves(2)).toContain('moves');
  });
});

describe('postmortemCloseLabel — 全10言語', () => {
  for (const { code, d } of ALL_DICTS) {
    it(`${code}: 非空文字列`, () => {
      expect(typeof d.postmortemCloseLabel).toBe('string');
      expect(d.postmortemCloseLabel.length).toBeGreaterThan(0);
    });
  }
});

// ─── UserPage / MyStats ───────────────────────────────────────────────────────

describe('UserPage — gameMeta を PostmortemModal に渡す', () => {
  const src = readSrc('components/UserPage.tsx');

  it('pendingModalGameRecord state が存在する', () => {
    expect(src).toContain('pendingModalGameRecord');
  });

  it('gameMeta prop を PostmortemModal に渡す', () => {
    expect(src).toContain('gameMeta=');
  });

  it('close 時に setPendingModalGameRecord(null) する', () => {
    expect(src).toContain('setPendingModalGameRecord(null)');
  });
});

// MyStats コンポーネントは削除済み。UserPage が同等機能を担当する。
describe('UserPage — MyStatsと同等の gameMeta PostmortemModal機能を維持', () => {
  const src = readSrc('components/UserPage.tsx');

  it('pendingModalGameRecord state が存在する', () => {
    expect(src).toContain('pendingModalGameRecord');
  });

  it('gameMeta prop を PostmortemModal に渡す', () => {
    expect(src).toContain('gameMeta=');
  });

  it('close 時に setPendingModalGameRecord(null) する', () => {
    expect(src).toContain('setPendingModalGameRecord(null)');
  });
});

// ─── candidate / Pro条件 ─────────────────────────────────────────────────────

describe('PostmortemModal.tsx — candidate・Pro条件を維持', () => {
  const tsx = readSrc('components/PostmortemModal.tsx');

  it('proActive && humanColor の条件で候補手ボタンを表示', () => {
    expect(tsx).toContain('proActive && humanColor');
  });

  it('enrichWithCandidateMoves を呼び出す', () => {
    expect(tsx).toContain('enrichWithCandidateMoves');
  });

  it('candidateCancelRef が存在する', () => {
    expect(tsx).toContain('candidateCancelRef');
  });

  it('candidatesComputed が存在する', () => {
    expect(tsx).toContain('candidatesComputed');
  });

  it('computingCandidates が存在する', () => {
    expect(tsx).toContain('computingCandidates');
  });
});

// ─── autoStart 動作 ───────────────────────────────────────────────────────────

describe('PostmortemModal.tsx — autoStart動作', () => {
  const tsx = readSrc('components/PostmortemModal.tsx');

  it('autoStart && analyzing の時 null を返す', () => {
    expect(tsx).toContain('autoStart && analyzing');
  });

  it('autoStart && !result && !analyzeError の時 null を返す', () => {
    expect(tsx).toContain('autoStart && !result && !analyzeError');
  });
});

// ─── error retry ─────────────────────────────────────────────────────────────

describe('PostmortemModal.tsx — error retry を維持', () => {
  const tsx = readSrc('components/PostmortemModal.tsx');

  it('analyzeError を使用', () => {
    expect(tsx).toContain('analyzeError');
  });

  it('postmortemRetry を使用', () => {
    expect(tsx).toContain('postmortemRetry');
  });
});
