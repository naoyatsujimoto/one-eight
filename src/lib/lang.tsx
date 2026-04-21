import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export type Lang = 'en' | 'ja';

// ── Translations ──────────────────────────────────────────────────────────────

export const T = {
  en: {
    // Title
    titleSub: 'Abstract Strategy Game',
    titleHint: 'Swipe down to start',
    titleVersion: 'v0.1.0 · Beta',
    langLabel: 'Language',

    // Tutorial steps
    tutSteps: [
      { caption: 'WIN THE POSITIONS', sub: 'This game is a battle over Positions. The player who holds more Positions at the end wins.' },
      { caption: 'BUILD UP GATES', sub: 'Stack Assets onto Gates to increase your dominance over Positions. Gates are the battlefield.' },
      { caption: 'THE BOARD', sub: 'The board has 13 Positions and 12 Gates. Each Position is connected to 4 Gates.' },
      { caption: 'EACH TURN', sub: 'Select a Position, then Build up a Gate. Try it now — tap a Position on the board.' },
      { caption: 'SELECT A POSITION', sub: 'Selecting a Position lights up its 4 connected Gates. Those 4 Gates are your targets for that turn.' },
      { caption: 'MASSIVE', sub: 'Massive places 1 Large asset into a Gate. A strong, focused investment.' },
      { caption: 'SELECTIVE', sub: 'Selective places 1 Middle asset into each of 2 Gates. Split your build across two Gates.' },
      { caption: 'QUAD', sub: 'Quad places up to 4 Small assets — one per Gate. Spread wide across the board.' },
      { caption: 'SIZE VALUES', sub: 'Small = 1 · Middle = 8 · Large = 64. Larger assets dominate a Gate more powerfully.' },
      { caption: 'SHARED GATES', sub: 'Both players can build in the same Gate. Gates become contested battlegrounds.' },
      { caption: 'CAPTURE', sub: "You can take your opponent's Position. The outcome depends on the Gates connected to it." },
      { caption: 'MOST-BUILT GATE', sub: 'To capture, look at the most built-up Gate linked to that Position. Dominate it — and the Position is yours.' },
      { caption: 'END OF GAME', sub: 'The game ends when all 12 Gates are full. The player with more Positions wins.' },
      { caption: 'START PLAYING', sub: 'Play a game. The fastest way to learn is to play.' },
    ],
    tutSkip: 'Skip',
    tutStartBtn: 'Start Playing →',

    // Game UI
    currentTurn: 'Current Turn',
    move: 'Move',
    phaseSelect: 'Position',
    phaseBuild: 'Build',
    phaseFinished: 'Finished',
    hintSelectPos: 'Select a position on the board',
    hintBuildMode: 'Large → Massive · Middle → Selective · Small → Quad',
    hintSelectiveFirst: 'Selective — pick first middle pocket',
    hintSelectiveConfirm: (gate: number) => `Selective: Gate ${gate} — Confirm or pick 2nd`,
    hintSelectiveSecond: (gate: number) => `Selective: Gate ${gate} selected — pick second`,
    hintQuadPick: 'Quad — pick small pockets',
    hintQuadConfirm: (n: number, max: number) => `Quad: ${n}/${max} — Confirm to commit`,
    actions: 'Actions',
    confirm: 'Confirm',
    pass: 'Pass',
    clear: 'Clear',
    buildAvailable: 'Build available — pass not allowed',
    rulesTitle: 'Rules / Build Types',
    massive: 'Massive',
    massiveDesc: 'Large pocket — click once',
    selective: 'Selective',
    selectiveDesc: 'Middle × 2 gates',
    quad: 'Quad',
    quadDesc: 'Small × up to 4 gates',
    undo: 'Undo',
    history: 'History',
    stats: 'Stats',
    newGame: 'New Game',
    cpuThinking: 'CPU is thinking…',
    moveHistory: 'Move History',
    humanVsHuman: 'Human × Human',
    humanVsCpu: 'Human × CPU',
    selectMode: 'Select Mode',
    cancel: 'Cancel',
    signOut: 'Sign out',
    gameHistory: 'Game History',
    analyze: 'Analyze',
    postmortem: 'Postmortem',
    analyzing: 'Analyzing…',
    decisiveMove: 'Decisive Move',
    topLosses: 'Top Losses (Black)',
    noAnalysis: 'Not enough data',
  },

  ja: {
    // Title
    titleSub: 'アブストラクト戦略ゲーム',
    titleHint: '下にスワイプしてスタート',
    titleVersion: 'v0.1.0 · ベータ版',
    langLabel: '言語',

    // Tutorial steps
    tutSteps: [
      { caption: 'POSITION を制する', sub: 'このゲームは Position の取り合い。最後に多くの Position を持つ方が勝ち。' },
      { caption: 'GATE に積み上げる', sub: 'Gate に Asset を積み上げて、Position への支配力を高める。Gate が勝負の場になる。' },
      { caption: 'ボードの構造', sub: '盤面には 13 の Position と 12 の Gate がある。各 Position は 4つの Gate とつながっている。' },
      { caption: '1ターンの流れ', sub: 'Position を選んで、Gate に Build up する。実際に触ってみよう — ボードの Position をタップして。' },
      { caption: 'POSITION を選ぶ', sub: 'Position を選ぶと、関係する 4つの Gate が光る。その4つがそのターンの対象になる。' },
      { caption: 'MASSIVE', sub: 'Massive は Large を1つ置く Build up。1つの Gate に強く集中投資する。' },
      { caption: 'SELECTIVE', sub: 'Selective は Middle を2つ置く Build up。2つの Gate に分けて配置する。' },
      { caption: 'QUAD', sub: 'Quad は Small を最大4つ置く Build up。最大4つの Gate に広く展開できる。' },
      { caption: 'サイズの価値', sub: 'Small = 1 · Middle = 8 · Large = 64。大きい Asset ほど Gate での支配力が高い。' },
      { caption: '共有される Gate', sub: '同じ Gate を両者が使うことがある。Gate は競り合いの場になる。' },
      { caption: 'キャプチャ', sub: '相手の Position を奪えることがある。判定は、その Position につながる Gate を見る。' },
      { caption: '最も Build された Gate', sub: '奪取では、まず最も Build された Gate を見る。そこで優勢なら奪取できる。' },
      { caption: 'ゲーム終了', sub: '12個の Gate がすべて埋まったら終了。Position が多い方が勝ち。' },
      { caption: 'さあ、始めよう', sub: 'まずは1局やってみる。実際に触るのが一番早い。' },
    ],
    tutSkip: 'スキップ',
    tutStartBtn: 'ゲームを始める →',

    // Game UI
    currentTurn: '現在のターン',
    move: 'Move',
    phaseSelect: 'Position選択',
    phaseBuild: 'Build',
    phaseFinished: '終了',
    hintSelectPos: 'ボードの Position を選んでください',
    hintBuildMode: 'Large → Massive · Middle → Selective · Small → Quad',
    hintSelectiveFirst: 'Selective — 最初の Middle を選んでください',
    hintSelectiveConfirm: (gate: number) => `Selective: Gate ${gate} — 確定 または 2つ目を選択`,
    hintSelectiveSecond: (gate: number) => `Selective: Gate ${gate} 選択済み — 2つ目を選んでください`,
    hintQuadPick: 'Quad — Small のポケットを選んでください',
    hintQuadConfirm: (n: number, max: number) => `Quad: ${n}/${max} — 確定して配置`,
    actions: 'アクション',
    confirm: '確定',
    pass: 'パス',
    clear: 'クリア',
    buildAvailable: 'Build 可能 — パスできません',
    rulesTitle: 'ルール / Build タイプ',
    massive: 'Massive',
    massiveDesc: 'Large ポケット — 1回クリック',
    selective: 'Selective',
    selectiveDesc: 'Middle × 2 Gate',
    quad: 'Quad',
    quadDesc: 'Small × 最大4 Gate',
    undo: '元に戻す',
    history: '手順',
    stats: '戦績',
    newGame: '新しいゲーム',
    cpuThinking: 'CPU が考えています…',
    moveHistory: '手順履歴',
    humanVsHuman: '人間 × 人間',
    humanVsCpu: '人間 × CPU',
    selectMode: 'モードを選択',
    cancel: 'キャンセル',
    signOut: 'ログアウト',
    gameHistory: '対局履歴',
    analyze: '分析',
    postmortem: '分析',
    analyzing: '分析中…',
    decisiveMove: '決定的な一手',
    topLosses: '最大損失手（Black）',
    noAnalysis: 'データ不足',
  },
} as const;

export type Translations = {
  titleSub: string;
  titleHint: string;
  titleVersion: string;
  langLabel: string;
  tutSteps: readonly { caption: string; sub: string }[];
  tutSkip: string;
  tutStartBtn: string;
  currentTurn: string;
  move: string;
  phaseSelect: string;
  phaseBuild: string;
  phaseFinished: string;
  hintSelectPos: string;
  hintBuildMode: string;
  hintSelectiveFirst: string;
  hintSelectiveConfirm: (gate: number) => string;
  hintSelectiveSecond: (gate: number) => string;
  hintQuadPick: string;
  hintQuadConfirm: (n: number, max: number) => string;
  actions: string;
  confirm: string;
  pass: string;
  clear: string;
  buildAvailable: string;
  rulesTitle: string;
  massive: string;
  massiveDesc: string;
  selective: string;
  selectiveDesc: string;
  quad: string;
  quadDesc: string;
  undo: string;
  history: string;
  stats: string;
  newGame: string;
  cpuThinking: string;
  moveHistory: string;
  humanVsHuman: string;
  humanVsCpu: string;
  selectMode: string;
  cancel: string;
  signOut: string;
  gameHistory: string;
  analyze: string;
  postmortem: string;
  analyzing: string;
  decisiveMove: string;
  topLosses: string;
  noAnalysis: string;
};

// ── Context ───────────────────────────────────────────────────────────────────

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translations;
}

const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => {},
  t: T.en as unknown as Translations,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');
  return (
    <LangContext.Provider value={{ lang, setLang, t: T[lang] as unknown as Translations }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
