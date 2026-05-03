import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { upsertProfile } from './profile';

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
      { caption: 'THE BOARD', sub: 'The board has 13 Positions and 12 Gates. Each Position is diagonally connected to 4 Gates.' },
      { caption: 'BLACK GOES FIRST', sub: 'Black always takes the first turn. Players then alternate turns throughout the game.' },
      { caption: 'EACH TURN', sub: 'Select a Position, then Build up a Gate. Try it now — tap a Position on the board.' },
      { caption: 'SELECT A POSITION', sub: 'Selecting a Position lights up its 4 connected Gates. Those 4 Gates are your targets for that turn.' },
      { caption: 'MASSIVE', sub: 'Massive places 1 Large Asset into a Gate. A strong, focused investment.' },
      { caption: 'SELECTIVE', sub: 'Selective places 1 Middle Asset into each of 2 Gates. Split your build across two Gates.' },
      { caption: 'QUAD', sub: 'Quad places up to 4 Small Assets — one per Gate. Spread wide across the board.' },
      { caption: 'SIZE VALUES', sub: 'Small = 1 · Middle = 8 · Large = 64. Larger assets dominate a Gate more powerfully.' },
      { caption: 'SHARED GATES', sub: 'Both players can build in the same Gate. Gates become contested battlegrounds.' },
      { caption: 'PASS RULE', sub: 'You must build if a build is available. Passing is only allowed when no build option exists for your selected Position.' },
      { caption: 'NO BUILD AVAILABLE', sub: 'If all Gates connected to your Position are full, no build is possible. Select the Position to end your turn without building.' },
      { caption: 'CAPTURE', sub: "You can take your opponent's Position. The outcome depends on the Gates connected to it." },
      { caption: 'EMPTY POSITIONS', sub: 'An empty Position can always be taken freely — no capture check needed. Only opponent-owned Positions require the Gate comparison.' },
      { caption: 'MOST-BUILT GATE', sub: 'To capture, look at the most built-up Gate linked to that Position. Dominate it — and the Position is yours.' },
      { caption: 'TIED GATES', sub: 'If multiple Gates are tied as most-built, compare all of them. You capture only if you dominate more of those tied Gates than your opponent.' },
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
    hintBuildMode: 'Massive → Large Asset · Selective → Middle Asset · Quad → Small Asset',
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
    massiveDesc: 'Large Asset pocket — click once',
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
    cpuSettings: 'CPU Settings',
    cpuDifficulty: 'Difficulty',
    cpuDiffNormal: 'Normal',
    cpuDiffHard: 'Hard',
    cpuDiffVeryHard: 'Very Hard',

    cpuColor: 'Your Color',
    cpuColorBlack: 'Black (First)',
    cpuColorWhite: 'White (Second)',
    startGame: 'Start Game',
    signOut: 'Sign out',
    gameHistory: 'Game History',
    analyze: 'Analyze',
    postmortem: 'Postmortem',
    analyzing: 'Analyzing…',
    analyzingEstimate: (sec: number) => sec < 60 ? `est. ~${sec}s` : `est. ~${Math.round(sec / 60)}min`,
    decisiveMove: 'Decisive Move',
    topLosses: 'Top Losses (Black)',
    noAnalysis: 'Not enough data',
    onlinePlay: 'Online Play',
    onlineCreate: 'Create',
    onlineJoin: 'Join',
    onlineCreateDesc: 'Create a room and share the code with your opponent.',
    onlineCreateBtn: 'Create Room',
    onlineCreating: 'Creating…',
    onlineJoinDesc: 'Enter the 6-character room code to join.',
    onlineJoinBtn: 'Join',
    onlineJoining: 'Joining…',
    onlineRoomCode: 'Room Code',
    onlineShareCode: 'Share this code with your opponent.',
    onlineWaitingForOpponent: 'Waiting for opponent…',
    onlineYourTurn: 'Your turn',
    onlineOpponentTurn: "Opponent's turn…",
    onlineSending: 'Sending…',
    onlineYouWin: 'You win!',
    onlineYouLose: 'You lose.',
    onlineDraw: 'Draw.',
    onlineExit: 'Exit',
    onlineBackToMenu: 'Back to Menu',
    onlineRoomNotFound: 'Room not found or already started.',
    onlineCannotJoinOwn: 'You cannot join your own room.',
    // Online mode select
    onlineFriendMatch: 'Friend Match',
    onlineFriendMatchDesc: 'Play with a friend using a private room code.',
    onlineRandomMatch: 'Random Match',
    onlineRandomMatchDesc: 'Be matched with a random opponent.',
    onlineRanked: 'Ranked Match',
    onlineRankedDesc: 'Rated games for subscribers only.',
    onlineTournament: 'Competition',
    onlineTournamentDesc: 'Enter with an official competition key.',
    onlineComingSoon: 'Coming Soon',
    onlineRandomSearching: 'Searching for opponent…',
    onlineRandomCancel: 'Cancel',
    // User Page
    userPage: 'User Page',
    userProfile: 'Profile',
    userJoined: 'Joined',
    userRating: 'Rating',
    userDomesticRank: 'Domestic Rank',
    userSeasonRank: 'Season Rank',
    userTotalGames: 'Total Games',
    userWinRate: 'Win Rate',
    userBlackWinRate: 'Black Win Rate',
    userWhiteWinRate: 'White Win Rate',
    userCpuWinRate: 'vs CPU',
    userPvpWinRate: 'vs Human',
    userRecent20: 'Last 20 Games',
    userRatingHistory: 'Rating History',
    userTrends: 'Play Trends',
    userRecentGames: 'Recent Games',
    userFeaturedGames: 'Featured Games',
    userTournamentHistory: 'Competition History',
    userBadges: 'Badges',
    userBestWin: 'Best Win',
    userLongestGame: 'Longest Game',
    userUpsetWin: 'Upset Win',
    userTournamentGame: 'Tournament Game',
    userPinnedGame: 'Pinned Game',
    userEditName: 'Edit',
    userSaveName: 'Save',
    userCancelEdit: 'Cancel',
    userBack: '← Back',
    userBuildUsage: 'Build Usage',
    userFavPositions: 'Favorite Positions',
    userWeakPositions: 'Weak Positions',
    userTimes: 'x',
    userNoData: 'No data',
    userViewGame: 'View Game',
    userColDate: 'Date',
    userColResult: 'Result',
    userColSide: 'Side',
    userColMoves: 'Moves',
    userColType: 'Type',
    userSideBlack: 'Black',
    userSideWhite: 'White',
    userTypeHuman: 'H×H',
    userTypeCpu: 'vs CPU',
    userTypeOnline: 'Online',
    statsVisibility: 'Stats Visibility',
    statsPublic: 'Public',
    statsPrivate: 'Private',
    opponentStats: "Opponent's Stats",
    statsPrivateMsg: "This player's stats are private.",
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
      { caption: 'ボードの構造', sub: '盤面には 13 の Position と 12 の Gate がある。各ポジションは対角線上の4つのGateとつながっている。' },
      { caption: 'BLACK が先手', sub: 'Black が必ず最初のターンを取る。以降は交互にターンを進める。' },
      { caption: '1ターンの流れ', sub: 'Position を選んで、Gate に Build up する。実際に触ってみよう — ボードの Position をタップして。' },
      { caption: 'POSITION を選ぶ', sub: 'Position を選ぶと、関係する 4つの Gate が光る。その4つがそのターンの対象になる。' },
      { caption: 'MASSIVE', sub: 'Massive は Large Asset を1つ置く Build up。1つの Gate に強く集中投資する。' },
      { caption: 'SELECTIVE', sub: 'Selective は Middle Asset を2つ置く Build up。2つの Gate に分けて配置する。' },
      { caption: 'QUAD', sub: 'Quad は Small Asset を最大4つ置く Build up。最大4つの Gate に広く展開できる。' },
      { caption: 'サイズの価値', sub: 'Small = 1 · Middle = 8 · Large = 64。大きい Asset ほど Gate での支配力が高い。' },
      { caption: '共有される Gate', sub: '同じゲートで両者がAssetを積み上げることがある。Gate は競り合いの場になる。' },
      { caption: 'パスのルール', sub: 'Build が可能な場合はパスできない。選択した Position に Build の手段がない場合のみパスが許可される。' },
      { caption: 'Build 不可のターン', sub: '選択した Position に接続する全 Gate が埋まっている場合、Build できない。その Position を選んでターンを終了する。' },
      { caption: 'キャプチャ', sub: '相手の Position を奪えることがある。判定は、その Position につながる Gate を見る。' },
      { caption: '空き Position', sub: '空き Position は常に自由に取得できる。Gate の比較判定が必要なのは、相手が所有する Position を奪う場合のみ。' },
      { caption: '最も Build された Gate', sub: '奪取では、まず最も Build された Gate を見る。そこで優勢なら奪取できる。' },
      { caption: 'タイの場合', sub: '最多 Build の Gate が同点で複数ある場合は、それらすべてを比較する。タイの Gate の中で、相手より多くを制しているときのみ奪取できる。' },
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
    hintBuildMode: 'Massive → Large Asset · Selective → Middle Asset · Quad → Small Asset',
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
    massiveDesc: 'Large Asset ポケット — 1回クリック',
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
    cpuSettings: 'CPU 設定',
    cpuDifficulty: '強さ',
    cpuDiffNormal: 'ノーマル',
    cpuDiffHard: 'ハード',
    cpuDiffVeryHard: 'Very Hard',
    cpuColor: '自分の色',
    cpuColorBlack: '黒（先手）',
    cpuColorWhite: '白（後手）',
    startGame: 'ゲーム開始',
    signOut: 'ログアウト',
    gameHistory: '対局履歴',
    analyze: '分析',
    postmortem: '分析',
    analyzing: '分析中…',
    analyzingEstimate: (sec: number) => sec < 60 ? `目安 約${sec}秒` : `目安 約${Math.round(sec / 60)}分`,
    decisiveMove: '決定的な一手',
    topLosses: '最大損失手（Black）',
    noAnalysis: 'データ不足',
    onlinePlay: 'オンライン対戦',
    onlineCreate: 'ルーム作成',
    onlineJoin: '入室',
    onlineCreateDesc: 'ルームを作成して、コードを相手に伝えてください。',
    onlineCreateBtn: 'ルームを作成',
    onlineCreating: '作成中…',
    onlineJoinDesc: '6文字のルームコードを入力してください。',
    onlineJoinBtn: '入室',
    onlineJoining: '参加中…',
    onlineRoomCode: 'ルームコード',
    onlineShareCode: 'このコードを相手に伝えてください。',
    onlineWaitingForOpponent: '相手を待っています…',
    onlineYourTurn: 'あなたのターン',
    onlineOpponentTurn: '相手のターン…',
    onlineSending: '送信中…',
    onlineYouWin: 'あなたの勝利！',
    onlineYouLose: '敗北。',
    onlineDraw: '引き分け。',
    onlineExit: '退出',
    onlineBackToMenu: 'メニューに戻る',
    onlineRoomNotFound: 'ルームが見つからないか、すでに開始済みです。',
    onlineCannotJoinOwn: '自分のルームには入室できません。',
    // Online mode select
    onlineFriendMatch: 'フレンドマッチ',
    onlineFriendMatchDesc: 'ルームコードを使って友達と対戦。',
    onlineRandomMatch: 'ランダムマッチ',
    onlineRandomMatchDesc: 'ランダムに相手とマッチングして対戦。',
    onlineRanked: '公式戦',
    onlineRankedDesc: 'レーティングが変動する対戦。サブスク加入者限定。',
    onlineTournament: 'コンペティション',
    onlineTournamentDesc: '運営発行のキーで参加する公式コンペティション。',
    onlineComingSoon: 'Coming Soon',
    onlineRandomSearching: '対戦相手を検索中…',
    onlineRandomCancel: 'キャンセル',
    // User Page
    userPage: 'ユーザーページ',
    userProfile: 'プロフィール',
    userJoined: '参加開始日',
    userRating: '現在レート',
    userDomesticRank: '国内順位',
    userSeasonRank: 'シーズン順位',
    userTotalGames: '総対局数',
    userWinRate: '総勝率',
    userBlackWinRate: '先手勝率',
    userWhiteWinRate: '後手勝率',
    userCpuWinRate: 'CPU戦勝率',
    userPvpWinRate: '対人戦勝率',
    userRecent20: '直近20局',
    userRatingHistory: 'レーティング推移',
    userTrends: 'プレイ傾向',
    userRecentGames: '最近の対局',
    userFeaturedGames: '代表棋譜',
    userTournamentHistory: '大会実績',
    userBadges: '称号 / バッジ',
    userBestWin: '最高勝利',
    userLongestGame: '最長対局',
    userUpsetWin: 'アップセット勝利',
    userTournamentGame: '大会対局',
    userPinnedGame: 'ピン留め対局',
    userEditName: '編集',
    userSaveName: '保存',
    userCancelEdit: 'キャンセル',
    userBack: '← 戻る',
    userBuildUsage: 'Build 使用率',
    userFavPositions: 'よく選ぶ Position',
    userWeakPositions: '苦手な Position',
    userTimes: '回',
    userNoData: 'データなし',
    userViewGame: '棋譜を見る',
    userColDate: '日時',
    userColResult: '勝敗',
    userColSide: '先後',
    userColMoves: '手数',
    userColType: '種別',
    userSideBlack: '先手',
    userSideWhite: '後手',
    userTypeHuman: '対人戦',
    userTypeCpu: 'CPU戦',
    userTypeOnline: 'オンライン',
    statsVisibility: 'STATS 公開設定',
    statsPublic: '公開',
    statsPrivate: '非公開',
    opponentStats: '相手の STATS',
    statsPrivateMsg: 'このプレイヤーの STATS は非公開です。',
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
  cpuSettings: string;
  cpuDifficulty: string;
  cpuDiffNormal: string;
  cpuDiffHard: string;
  cpuDiffVeryHard: string;
  cpuColor: string;
  cpuColorBlack: string;
  cpuColorWhite: string;
  startGame: string;
  signOut: string;
  gameHistory: string;
  analyze: string;
  postmortem: string;
  analyzing: string;
  analyzingEstimate: (sec: number) => string;
  decisiveMove: string;
  topLosses: string;
  noAnalysis: string;
  onlinePlay: string;
  onlineCreate: string;
  onlineJoin: string;
  onlineCreateDesc: string;
  onlineCreateBtn: string;
  onlineCreating: string;
  onlineJoinDesc: string;
  onlineJoinBtn: string;
  onlineJoining: string;
  onlineRoomCode: string;
  onlineShareCode: string;
  onlineWaitingForOpponent: string;
  onlineYourTurn: string;
  onlineOpponentTurn: string;
  onlineSending: string;
  onlineYouWin: string;
  onlineYouLose: string;
  onlineDraw: string;
  onlineExit: string;
  onlineBackToMenu: string;
  onlineRoomNotFound: string;
  onlineCannotJoinOwn: string;
  onlineFriendMatch: string;
  onlineFriendMatchDesc: string;
  onlineRandomMatch: string;
  onlineRandomMatchDesc: string;
  onlineRanked: string;
  onlineRankedDesc: string;
  onlineTournament: string;
  onlineTournamentDesc: string;
  onlineComingSoon: string;
  onlineRandomSearching: string;
  onlineRandomCancel: string;
  userPage: string;
  userProfile: string;
  userJoined: string;
  userRating: string;
  userDomesticRank: string;
  userSeasonRank: string;
  userTotalGames: string;
  userWinRate: string;
  userBlackWinRate: string;
  userWhiteWinRate: string;
  userCpuWinRate: string;
  userPvpWinRate: string;
  userRecent20: string;
  userRatingHistory: string;
  userTrends: string;
  userRecentGames: string;
  userFeaturedGames: string;
  userTournamentHistory: string;
  userBadges: string;
  userBestWin: string;
  userLongestGame: string;
  userUpsetWin: string;
  userTournamentGame: string;
  userPinnedGame: string;
  userEditName: string;
  userSaveName: string;
  userCancelEdit: string;
  userBack: string;
  userBuildUsage: string;
  userFavPositions: string;
  userWeakPositions: string;
  userTimes: string;
  userNoData: string;
  userViewGame: string;
  userColDate: string;
  userColResult: string;
  userColSide: string;
  userColMoves: string;
  userColType: string;
  userSideBlack: string;
  userSideWhite: string;
  userTypeHuman: string;
  userTypeCpu: string;
  userTypeOnline: string;
  statsVisibility: string;
  statsPublic: string;
  statsPrivate: string;
  opponentStats: string;
  statsPrivateMsg: string;
};

// ── Context ───────────────────────────────────────────────────────────────────

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** setLang + persist to profiles table if userId is set */
  setLangWithSync: (l: Lang) => void;
  /** Call after login to bind a userId for profile sync */
  setUserId: (id: string | null) => void;
  t: Translations;
}

const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => {},
  setLangWithSync: () => {},
  setUserId: () => {},
  t: T.en as unknown as Translations,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');
  const [userId, setUserId] = useState<string | null>(null);

  const setLangWithSync = useCallback((l: Lang) => {
    setLang(l);
    if (userId) {
      upsertProfile(userId, { lang: l }).catch(() => {/* silent */});
    }
  }, [userId]);

  return (
    <LangContext.Provider value={{ lang, setLang, setLangWithSync, setUserId, t: T[lang] as unknown as Translations }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
