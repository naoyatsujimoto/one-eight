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
    rulesTitle: 'Rules',
    buildTypesTitle: 'Build Types',
    rulesBody: [
      { heading: '1. Winning', body: 'The player who holds more of the 13 Positions at the end of the game wins. If both players hold the same number, the game is a draw.' },
      { heading: '2. Position', body: 'The board has 13 Positions labeled A–M. A player holds a Position by placing their Symbol on it.' },
      { heading: '3. Gate', body: 'The board has 12 Gates numbered 1–12 around the perimeter. Each Gate has Slots for Assets.\nLarge Slots: 2 · Middle Slots: 2 · Small Slots: 4' },
      { heading: '4. Diagonal Gate', body: 'Each Position has 4 diagonally connected Gates called its Diagonal Gates. Build up is only performed on the Diagonal Gates of the specified Position.' },
      { heading: '5. Turn', body: 'On your turn, select one Position: an empty Position, a capturable opponent Position, or a Build-up-able own Position. If Build up is possible after selecting, it is mandatory. Passing at will is not allowed.' },
      { heading: '6. Taking an Empty Position', body: 'Select an empty Position to place your Symbol on it, then Build up on its Diagonal Gates.' },
      { heading: '7. Capturing an Opponent Position', body: 'You may capture an opponent Position when you are dominant in its Diagonal Gates.\n\nCompare the most built-up Gate among the Diagonal Gates. If your Build value there exceeds your opponent\'s, you capture the Position.\n\nIf multiple Gates are tied as most-built, compare all of them. You capture only if you dominate more of those tied Gates than your opponent.' },
      { heading: '8. Asset Values', body: 'Build values: Small = 1 · Middle = 8 · Large = 64' },
      { heading: '9. Build Up', body: 'Massive — place 1 Large Asset into one Diagonal Gate.\nSelective — place 1 Middle Asset into each of 2 different Diagonal Gates.\nQuad — place 1 Small Asset into each of the 4 Diagonal Gates.' },
      { heading: '10. Slot Shortage', body: 'If a Slot is unavailable during Build up, skip that Slot. If at least one Slot is available, place as many Assets as possible.' },
      { heading: '11. Auto Pass', body: 'If no legal move exists at the start of your turn (no empty Position to take, no opponent Position to capture, no Build up possible), the turn ends automatically and P is recorded in the game record.' },
      { heading: '12. Game End', body: 'The game ends when no further Build up is possible. The winner is determined by rule 1.' },
      { heading: '13. Game Record', body: 'Notation uses Position and Build up content.\nG,m(7): select Position G, Massive on Gate 7\nM,s(6,8): select Position M, Selective on Gates 6 and 8\nA,q: select Position A, Quad\nP: Auto Pass\nPosition names and Gate numbers use shared coordinates for both players.' },
    ],
    massive: 'Massive',
    massiveDesc: 'Large Asset Slot — click once',
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
    modeTraining: 'Training',
    trainingTitle: 'TRAINING',
    trainingRecordeTitle: 'Recorde Training',
    trainingPlaceholderMsg: 'Training mode is in development.',
    trainingT1Title: 'Build Basics',
    trainingT1Step1: 'Select position G. Apply Massive Build to Gate 7.',
    trainingT1Step3: 'Select position M. Apply Selective Build to Gates 6 and 8.',
    trainingT1Step5: 'Select position A. Apply Quad Build.',
    trainingFeedbackWrong: 'That is not the correct move. Try again.',
    trainingFeedbackCleared: 'Correct.',
    trainingCompleteTitle: 'Build Basics Complete',
    trainingT2Title: 'Capture and Build',
    trainingT2Intro: 'Learn how to capture an opponent Position and build on its Diagonal Gate.',
    trainingT2Step1: 'Position E is owned by White. Gate 6 has your large asset. Select position E, apply Massive Build to Gate 10.',
    trainingT2Complete: 'Capture and Build Complete',
    trainingNextTraining: 'Next Training',
    trainingRestartStep: 'Restart Step',
    trainingBackToMenu: 'Back',
    trainingBackToIntro: 'Back to Training List',
    trainingIntroSubtitle: 'Recorde Training',
    trainingIntroDesc: 'Learn ONE EIGHT step by step.',
    trainingTaskStatusAvailable: 'Available',
    trainingTaskStatusComplete: 'Complete',
    trainingTaskStatusLocked: 'Locked',
    trainingStart: 'Start',
    trainingReplay: 'Replay',
    trainingLockedMessage: 'Complete the previous task to unlock.',
    trainingT1Desc: 'Learn Massive, Selective, and Quad builds.',
    trainingT2Desc: 'Learn how to capture and build.',
    trainingT7Title: 'Diagonal Gates',
    trainingT7Step1: 'Select Position H and apply Massive Build to one of its connected Gates (2, 5, 6, 9).',
    trainingT7Complete: 'Diagonal Gates Complete',
    trainingT7Desc: 'Learn which Gates are connected to each Position.',
    trainingT4Title: 'Partial Build',
    trainingT4Step1: 'Select Position F. Apply Quad Build. Gate 8 is full — assets will only be placed in the remaining open slots.',
    trainingT4Complete: 'Partial Build Complete',
    trainingT4Desc: 'Learn that Build fills only the available slots, even when some are already occupied.',
    trainingT6Title: 'Asset Values',
    trainingT6Step1: 'Select Position J. Apply Massive Build to Gate 5. A Large Asset (64) dominates any combination of Middle (8) or Small (1) assets.',
    trainingT6Complete: 'Asset Values Complete',
    trainingT6Desc: 'Learn that Small=1, Middle=8, Large=64. One Large Asset outweighs eight Middle Assets.',
    trainingT5Title: 'Capture Tie',
    trainingT5Step1: 'Position K is owned by White. Gate 4 is controlled by Black and Gate 9 is controlled by White, so K cannot be captured yet. Choose Position C, then Massive Build on Gate 10 to create a future capture threat.',
    trainingT5Complete: 'Capture Tie Complete',
    trainingT5Desc: 'Learn that a tie in most-built Gates blocks capture. Build to break the tie.',
    trainingT5TieExplanation: 'Tied Gates block capture. Build to gain dominance.',
    trainingT8Title: 'Prepare Capture',
    trainingT8Step1: 'Step 1 / 2 — Prepare the Dominance\n\nWhite owns Position D. You cannot take D yet. White controls Gate 3 and Black controls Gate 7, so the dominance is tied 1 to 1.\n\nChoose Position F, then Massive Build on Gate 11 (F,m(11)). This expands the dominance around D and prepares a future capture.',
    trainingT8CpuMsg: 'White played E,m(2) to take Position E. The dominance around Position D is unchanged.',
    trainingT8Step2: 'Step 2 / 2 — Capture and Build\n\nNow you can take D. Choose Position D, then Massive Build on Gate 1 (D,m(1)).',
    trainingT8Complete: 'By creating Gate dominance first, you set up a capture for your next turn.',
    trainingT8Desc: 'Learn to prepare Gate dominance before capturing a Position.',
    trainingT9Title: 'No-build Endgame',
    trainingT9Step1: 'Step 1 / 1 — Win with the final move\n\nYou are Black. The board is nearly full. Only Gate 1 has one large slot empty.\n\nPosition D is the only unowned position left. Black owns 6 positions and White owns 6.\n\nChoose Position D, then Massive Build on Gate 1 (D,m(1)).\n\nThis single move claims D, fills the last Gate slot, and ends the game with Black 7 to White 6.',
    trainingT9Complete: 'Every slot on every Gate is filled. The game has ended.\n\nFinal Position count: Black 7 — White 6\n\nBlack wins by holding one more Position than White.',
    trainingT9WhyEnded: 'A ONE EIGHT game ends when all twelve Gates have every slot filled. Your final Massive Build filled the last empty slot in Gate 1, so the endgame condition was met.',
    trainingT9WhyWinner: 'The winner is decided by the simple count of owned Positions. Asset value on Gates does not affect the winner. At endgame, Black has 7 and White has 6, so Black wins.',
    trainingT9Desc: 'Learn how ONE EIGHT ends and how the winner is determined.',
    trainingT10Title: 'Defensive Build',
    trainingT10Step1: 'Step 1 / 1 — Defend your Position\n\nWarning. Position E is yours, but White has placed a Massive on Gate 2. If you do nothing, White will be able to capture E on the next turn.\n\nRe-select Position E, then Massive Build on Gate 4 (E,m(4)).\n\nBy placing your own Black Large on another Gate connected to E, the strongest-Gate dominance becomes tied 1 to 1, and White can no longer capture E.',
    trainingT10Complete: 'Two Gates around E now share the maximum value. Gate 2 is controlled by White, and Gate 4 is controlled by Black.\n\nMost-built dominance count: White 1 — Black 1\n\nWith the count tied, White can no longer capture E. Your Position remains yours.',
    trainingT10WhyThreat: 'Capture checks only the highest-value Gates connected to the target Position.In the initial state, Gate 2 was the only highest-value Gate, and it was controlled by White. That made E capturable by White.',
    trainingT10WhyDefended: 'By placing a Black Massive on Gate 4, Gate 4 matches Gate 2 as a highest-value Gate. Gate 2 is won by White, and Gate 4 is won by Black, so the dominance count becomes tied 1 to 1. White can no longer capture E.',
    trainingT10Desc: 'Learn to defend your Position by building on a connected Gate.',


    selectMode: 'Select Mode',
    cancel: 'Cancel',
    cpuSettings: 'CPU Settings',
    cpuDifficulty: 'Difficulty',
    cpuDiffNormal: 'Agnesi',
    cpuDiffHard: 'al-Kashi',
    cpuDiffVeryHard: 'Maupertuis',

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
    historySection: 'History',
    refresh: 'Refresh',
    refreshing: 'Refreshing…',
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
    onlineTimeoutWin: 'Time out — You win!',
    onlineTimeoutLose: 'Time out — You lose.',
    onlineTimeoutDraw: 'Time out — Draw.',
    onlineOpponentTimeout: "Opponent's time ran out!",
    onlineExit: 'Exit',
    onlineBackToMenu: 'Back to Menu',
    onlineRoomNotFound: 'Room not found or already started.',
    onlineCannotJoinOwn: 'You cannot join your own room.',
    // Online mode select
    onlineFriendMatch: 'Friend Match',
    onlineFriendMatchDesc: 'Play with a friend using a room code.',
    onlineRandomMatch: 'Random Match',
    onlineRandomMatchDesc: 'Be matched with a random opponent.',
    onlineRanked: 'Official Arena',
    onlineRankedDesc: 'Official Pro competition with ELEPHANT / JAGUAR Arenas.',
    onlineTournament: 'Competition',
    onlineTournamentDesc: 'Join an event using an organizer-issued key.',
    onlineComingSoon: 'Coming Soon',
    officialMatchEnterFromOnlinePlay: 'Enter matches from Online Play → Official Arena / Competition.',
    onlineNoRankedMatches: 'No ranked matches scheduled.',
    onlineNoCompetitions: 'No competitions scheduled.',
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
    cpuProfiles: 'CPU Records',
    cpuProfileTitle: (d: string) => `${d} CPU`,
    cpuTotalGames: 'Total',
    cpuWins: 'Wins',
    cpuLosses: 'Losses',
    cpuDraws: 'Draws',
    cpuWinRate: 'Win Rate',
    cpuNoGames: 'No games recorded yet.',
    // Official Match Calendar
    omStatusScheduled: 'Scheduled',
    omStatusJoinNow: 'Join Now',
    omStatusLive: 'Live',
    omStatusCompleted: 'Completed',
    omStatusCancelled: 'Cancelled',
    omStatusForfeited: 'Forfeited',
    omStatusNoContest: 'No Contest',
    omTimerTotal: 'Total',
    omTimerPerMove: 'Per Move',
    omTimerNoClock: 'No Clock',
    omResultDraw: 'Draw',
    omResultWin: 'Win',
    omResultWinNoShow: 'Win by no-show',
    omResultWinTimeout: 'Win by timeout',
    omResultLoss: 'Loss',
    omResultLossNoShow: 'Loss by no-show',
    omResultLossTimeout: 'Loss by timeout',
    omResultNeutralNoContest: 'No contest',
    omResultNeutralCancelled: 'Cancelled',
    omResultNeutralForfeited: 'Forfeited',
    omStartsIn: (label: string) => `Starts in ${label}`,
    omAvailable15Min: 'Available 15 min before start',
    omRejoinInProgress: 'Rejoin in progress',

    // Pro status
    proBadge: 'PRO',
    proUpgradeBannerTitle: 'Unlock Pro Features',
    proUpgradeBannerDesc: 'Ghost analysis, Postmortem candidate moves, and more.',
    proUpgradeBtn: 'Upgrade to Pro',
    proAlreadyActive: 'You are already Pro',
    proRenewsOn: (date: string) => `Renews ${date}`,
    proUpgradeGames: 'View all past games (Pro only)',
    ghostProBadge: 'Pro',
    ghostProOnlyTitle: 'Ghost (Pro Only)',
    ghostProOnlyText: 'Ghost is a Pro feature. Upgrade to Pro to view suggested moves based on past match data.',
    ghostProUpgradeCta: 'View Pro features',
    omEnterMatch: 'Enter Match',
    omEntering: 'Entering…',
    omUpcomingMatches: 'Upcoming Matches',
    omRecentResults: 'Recent Results',
    omNoUpcomingOfficial: 'No upcoming official matches',
    omNoMatchesOnDate: 'No matches on this date',
    omNoUpcomingMatches: 'No upcoming matches',
    omShowAllMatches: 'Show all matches',
    omToday: 'Today',
    omMatchesOn: (dateStr: string) => `Matches on ${dateStr}`,
    omLoading: 'Loading official matches…',
    omLoadFailed: 'Failed to load matches.',
    omRetry: 'Retry',
    omOfficialMatches: 'Official Matches',
    omWaitingForBlack: "Waiting for Black's first move. Black's clock is running.",
    loading: 'Loading…',
    // Official Arena (Phase E-1)
    arenaOfficialArena: 'Official Arena',
    arenaElephantArena: 'ELEPHANT Arena',
    arenaJaguarArena: 'JAGUAR Arena',
    arenaProRequired: 'Pro required',
    arenaEntrySoon: 'Entry coming soon',
    arenaNoMaster: 'No Master yet',
    arenaNoInterim: 'No Interim Master',
    arenaNextEvent: 'Next event',
    arenaEntryDeadline: 'Entry deadline',
    arenaCurrentMaster: 'Current Master',
    arenaInterimMaster: 'Interim Master',
    arenaPointRanking: 'Arena Point Ranking',
    arenaRecentMatchHistory: 'Recent Match History',
    arenaTapForDetail: 'View details',
    arenaMyEntry: 'My entry',
    arenaNotEntered: 'Not entered',
    arenaEntryStatusPending: 'Entry confirmed / Pairing pending',
    arenaEntryStatusMatched: 'Match assigned',
    arenaEntryStatusNoMatch: 'No match',
    arenaDetailBtn: 'View details',
    arenaOpenDetail: 'Open details',
    arenaMasterHistory: 'Master History',
    // Official Arena (Phase E-2) — Entry confirmation + execution
    arenaConfirmEntryTitle: 'Confirm Arena Entry',
    arenaEntryCannotCancel: 'This entry cannot be cancelled after confirmation.',
    arenaEventTime: 'Event time',
    arenaNoShowWarning: 'If you do not enter your assigned match at the start time, you may lose by no-show.',
    arenaNoShowPenalty: 'A no-show loss applies -3 Arena Points.',
    arenaProOnlyEntry: 'Official Arena entry is available for Pro users only.',
    arenaConfirmEntryBtn: 'Confirm Entry',
    arenaBackBtn: 'Back',
    arenaEntryConfirmed: 'Entry confirmed',
    arenaEntryClosed: 'Entry closed',
    arenaAlreadyEntered: 'Already entered',
    arenaLoginRequired: 'Login required',
    arenaNoUpcomingEvent: 'No upcoming event',
    arenaEntryFailed: 'Entry failed',
    arenaEntryBtn: 'Enter Arena',
    arenaEntryErrNotAuthenticated: 'You must be logged in to enter.',
    arenaEntryErrProRequired: 'Pro required to enter Official Arena.',
    arenaEntryErrAlreadyEntered: 'You have already entered this Arena event.',
    arenaEntryErrDeadlinePassed: 'Entry deadline has passed.',
    arenaEntryErrEventNotFound: 'Event not found.',
    arenaEntryErrEventNotOpen: 'Entry is not open for this event.',
    arenaEntryErrUnknown: 'Entry failed. Please try again.',
    // Official Arena (Phase E-3) — My Arena Match
    arenaMyArenaMatch: 'Your Arena Match',
    arenaPairingAfterDeadline: 'Pairing will be decided after the entry deadline.',
    arenaMatchWillAppear: 'Your match will appear here after pairing is generated.',
    arenaNoMatchEstablished: 'No match was established for this Arena event.',
    arenaNoArenaPointsChanged: 'No Arena Points were changed.',
    arenaMatchLabel: 'Match',
    arenaMasterMatch: 'Master Match',
    arenaPointMatch: 'Point Match',
    arenaYouAreBlack: 'You are Black',
    arenaYouAreWhite: 'You are White',
    arenaOpponent: 'Opponent',
    arenaStartTime: 'Start time',
    arenaEnterMatch: 'Enter Match',
    arenaEnterMatchComingSoon: 'Enter Match coming soon',
    arenaEnterMatchUnavailable: 'Enter Match unavailable',
    arenaMatchCompleted: 'Match completed',
    arenaEnterMatchFailed: 'Failed to enter match',
    arenaMatchNotStartedYet: 'Match has not started yet',
    arenaMatchNoLongerAvailable: 'Match is no longer available',
    arenaMatchKindInaugural: 'Inaugural Match',
    arenaMatchKindDefend: 'Defense Match',
    arenaMatchKindMasterSuccession: 'Master Succession',
    arenaMatchKindInterimSet: 'Interim Set',
    // E-5: Arena result status
    arenaResultPendingTitle: 'Match completed.',
    arenaResultPendingBody: 'Arena result is pending.',
    arenaResultPendingNote: 'Arena Points and Master status will be updated after verification.',
    arenaResultProcessed: 'Arena result processed.',
    // E-6: Arena titles on Profile/UserPage
    arenaArenaTitles: 'Arena Titles',
    arenaNoArenaTitles: 'No Arena titles yet',
    arenaTitleMaster: 'Master',
    arenaTitleCurrentHolder: 'Current holder',

    // Timer
    timerClock: 'Time Clock',
    timerByoyomi: 'Byoyomi',
    timerModeNone: 'None',
    timerModeTotal: 'Total Time',
    timerModePerMove: 'Per Move',
    timerNone: 'None',
    timerMin5: '5 min',
    timerMin10: '10 min',
    timerSec10: '10 sec',
    timerSec30: '30 sec',
    timerSec60: '60 sec',

    // Result modal
    resultGameFinished: 'Game Finished',
    resultDraw: 'Draw',
    resultBlackWins: 'Black Wins',
    resultWhiteWins: 'White Wins',
    resultTimeOut: 'Time Out',

    // Modal eyebrow
    newGameEyebrow: 'New Game',
    vsCpuEyebrow: 'vs CPU',

    // Stats / Move History
    myStats: 'My Stats',
    copyBtn: 'Copy',
    copiedBtn: 'Copied',

    // Postmortem
    postmortemRetry: 'Retry',

    // ConfirmModal
    execute: 'Execute',

    // Tutorial
    tutNext: 'Next →',

    // Prize / UserPage
    prizeSectionTitle: 'Reward / Prize',
    prizeNoAwards: 'No prize awards.',
    prizeSubmitInfo: 'Submit payout / tax information',
    prizeSubmittedMsg: 'Your information has been submitted. Admin will process your Winner File.',
    prizeStatusSubmitted: 'Submitted — awaiting processing',
    prizeStatusProcessed: 'Processed',
    prizeStatusOnHold: 'This award is on hold.',

    // AuthGate
    authMagicLink: 'Magic Link',
    authPasswordLogin: 'Password Login',
    authEmailSent: 'Email sent. Click the link in your inbox to log in.',
    authSendMagicLink: 'Send Magic Link',
    authSending: 'Sending…',
    authPassword: 'Password',
    authLogIn: 'Log In',
    authLoggingIn: 'Logging in…',
    authTagline: 'ONE EIGHT is a competitive abstract strategy game. Monthly membership available.',

    // Arena (additional)
    arenaProcessing: 'Processing…',
    arenaName: 'Name',
    arenaWin: 'W: ',
    arenaCurrent: '(current)',

    // Label guide captions (Option C: canonical labels, board rotates for white)
    labelGuideBlackText: 'Labels are shared canonical coordinates. From Black’s view, Gates 1–4 are on the far side and Gates 7–10 are on the near side. Move records use these shared labels.',
    labelGuideWhiteText: 'Labels are shared canonical coordinates. From White’s view, Gates 7–10 are on the far side and Gates 1–4 are on the near side. Move records use these shared labels.'
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
    rulesTitle: '競技規則',
    buildTypesTitle: 'Build タイプ',
    rulesBody: [
      { heading: '1. 勝敗', body: '本ゲームは、13個のPositionの保持数を競う。ゲーム終了時、保持しているPosition数が多いプレイヤーを勝者とする。保持数が同数の場合は引き分けとする。' },
      { heading: '2. Position', body: '盤上にはA〜Mの13個のPositionがある。Positionに自分のSymbolを置いているプレイヤーは、そのPositionを保持する。' },
      { heading: '3. Gate', body: '盤の外周には1〜12の12個のGateがある。各Gateには、Assetを置くためのSlotがある。\nLarge Slot：2 · Middle Slot：2 · Small Slot：4' },
      { heading: '4. Diagonal Gate', body: '各Positionには、斜め方向に対応する4つのGateがある。これを、そのPositionのDiagonal Gateとする。Build upは、手番で指定したPositionのDiagonal Gateに対してのみ行う。' },
      { heading: '5. 手番', body: 'プレイヤーは手番において、Positionを1つ指定する。指定できるPositionは、空きPosition・奪取可能な相手Position・Build up可能な自分Positionのいずれかに限る。Position指定後、Build upが可能な場合、プレイヤーは必ずBuild upを行う。任意のPassは認められない。' },
      { heading: '6. 空きPositionの取得', body: '空きPositionを指定した場合、そのPositionに自分のSymbolを置く。その後、そのPositionのDiagonal GateにBuild upを行う。' },
      { heading: '7. 相手Positionの奪取', body: '相手Positionは、そのPositionのDiagonal Gateにおいて自分が優勢である場合に奪取できる。\n\n奪取判定では、対象PositionのDiagonal Gateのうち、最もBuild upされているGateを比較する。そのGateにおける自分のBuild値が相手のBuild値を上回る場合、対象Positionを奪取できる。\n\n最もBuild upされているGateが複数ある場合は、それらすべてを比較する。この場合、自分が優勢なGateの数が相手を上回るときに限り、対象Positionを奪取できる。' },
      { heading: '8. Assetの価値', body: 'Build値：Small = 1 · Middle = 8 · Large = 64' },
      { heading: '9. Build up', body: 'Massive — 指定PositionのDiagonal Gateのうち、1つのGateにLargeを1個置く。\nSelective — 指定PositionのDiagonal Gateのうち、異なる2つのGateにMiddleを1個ずつ置く。\nQuad — 指定Positionの4つのDiagonal GateにSmallを1個ずつ置く。' },
      { heading: '10. Slot不足', body: 'Build up時に置けないSlotがある場合、そのSlotにはAssetを置かない。ただし、置けるSlotがある場合は、置ける分だけAssetを置く。' },
      { heading: '11. 自動P', body: '手番開始時点で、空きPositionの取得・相手Positionの奪取・自分PositionからのBuild upがすべて不可能な場合、合法手がないものとする。この場合、操作を待たずに自動的にターンを終了し、棋譜にはPと記録する。' },
      { heading: '12. ゲーム終了', body: 'これ以上Build upできない状態になった時点で、ゲームは終了する。勝敗は第1条に従って判定する。' },
      { heading: '13. 棋譜', body: '棋譜は、PositionとBuild upの内容で記録する。\nG,m(7)：Position Gを指定し、Gate 7にMassiveを行った手\nM,s(6,8)：Position Mを指定し、Gate 6と8にSelectiveを行った手\nA,q：Position Aを指定し、Quadを行った手\nP：合法手なしによる自動ターン終了\nPosition名およびGate番号は、先手・後手に共通の座標で記録する。' },
    ],
    massive: 'Massive',
    massiveDesc: 'Large Asset Slot — 1回クリック',
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
    modeTraining: 'トレーニング',
    trainingTitle: 'TRAINING',
    trainingRecordeTitle: 'Recorde Training',
    trainingPlaceholderMsg: 'トレーニングモードは開発中です。',
    trainingT1Title: 'Build Basics',
    trainingT1Step1: 'ポジション G を選び、ゲート 7 に Massive Build を行ってください。',
    trainingT1Step3: 'ポジション M を選び、ゲート 6 と 8 に Selective Build を行ってください。',
    trainingT1Step5: 'ポジション A を選び、Quad Build を行ってください。',
    trainingFeedbackWrong: '正解と異なる手です。もう一度試してください。',
    trainingFeedbackCleared: '正解です。',
    trainingCompleteTitle: 'Build Basics 完了',
    trainingT2Title: 'Capture and Build',
    trainingT2Intro: '相手のポジションをCapture して、そのDiagonal GateにBuildする方法を学びます。',
    trainingT2Step1: 'ポジション E はWhiteが所有しています。ゲート 6 にあなたのlarge assetがあります。ポジション E を選び、ゲート 10 に Massive Build を行ってください。',
    trainingT2Complete: 'Capture and Build 完了',
    trainingNextTraining: '次のトレーニングへ',
    trainingRestartStep: 'このステップをやり直す',
    trainingBackToMenu: '戻る',
    trainingBackToIntro: 'トレーニング一覧に戻る',
    trainingIntroSubtitle: 'Recorde Training',
    trainingIntroDesc: 'ONE EIGHT をステップごとに学ぼう。',
    trainingTaskStatusAvailable: 'プレイ可',
    trainingTaskStatusComplete: '完了',
    trainingTaskStatusLocked: '未開放',
    trainingStart: 'スタート',
    trainingReplay: 'やり直す',
    trainingLockedMessage: '前のタスクを完了するとアンロックされます。',
    trainingT1Desc: 'Massive、Selective、Quad の Build を学ぶ。',
    trainingT2Desc: 'Capture して Build する方法を学ぶ。',
    trainingT7Title: 'Diagonal Gate',
    trainingT7Step1: 'ポジション H を選び、接続しているゲート（2, 5, 6, 9）のいずれかに Massive Build を行ってください。',
    trainingT7Complete: 'Diagonal Gate 完了',
    trainingT7Desc: '各ポジションに接続しているゲートを学ぶ。',
    trainingT4Title: 'Partial Build',
    trainingT4Step1: 'ポジション F を選んでください。Quad Build を実行してください。ゲート 8 は満束しているため、空きのあるスロットにのみ Asset が置かれます。',
    trainingT4Complete: 'Partial Build 完了',
    trainingT4Desc: 'Build は空きスロットにのみ Asset を置く。満束スロットはスキップされることを学ぶ。',
    trainingT6Title: 'Asset Values',
    trainingT6Step1: 'ポジション J を選んでください。ゲート 5 に Massive Build を行ってください。Large Asset (64) は Middle (8) や Small (1) のどんな組み合わせよりも強い支配力を持ちます。',
    trainingT6Complete: 'Asset Values 完了',
    trainingT6Desc: 'Small=1、Middle=8、Large=64。Large 1つで Middle 8つ分の価力をもつ。',
    trainingT5Title: 'Capture Tie',
    trainingT5Step1: 'ポジション K は White が所有しています。Gate 4 は Black、Gate 9 は White が同点で支配しているため、今は K を奪取できません。ポジション C を選び、Gate 10 に Massive Build を行って、次に K を奪取できる形を作ってください。',
    trainingT5Complete: 'Capture Tie 完了',
    trainingT5Desc: '同点では奪取できない。Build で優勢を作ることを学ぶ。',
    trainingT5TieExplanation: '同点の Gate があると奪取できません。Build で支配を確立してください。',
    trainingT8Title: 'Capture を準備する',
    trainingT8Step1: 'Step 1 / 2 —— 支配を準備する\n\nPosition D は White の所有です。今すぐ D を奪うことはできません。Gate 3 を White が支配し、Gate 7 を Black が支配していて、1 対 1 で拮抗しているからです。\n\nPosition F を選んで、Gate 11 に Massive Build を実行してください（F,m(11)）。これで D の周りの支配Gateが増え、次にDを奪える形を作れます。',
    trainingT8CpuMsg: 'White は E,m(2) で Position E を取得しました。D 周辺の支配バランスは変わっていません。',
    trainingT8Step2: 'Step 2 / 2 —— CaptureしてBuildする\n\n今なら D を奪えます。Position D を選んで、Gate 1 に Massive Build を実行してください（D,m(1)）。',
    trainingT8Complete: '先にGate支配を作ることで、次の手番でPositionを奪えるようになりました。',
    trainingT8Desc: 'Capture の前にGate支配を準備することを学ぶ。',
    trainingT9Title: '終局と勝敗',
    trainingT9Step1: 'Step 1 / 1 —— 最後の一手で勝つ\n\nあなたは Black です。盤面はほぼすべてが埋まっています。Gate 1 だけが、大駒スロットを 1 つ残しています。\n\n残っている空き Position は D だけです。Black は 6 個、White は 6 個の Position を所有しています。\n\nPosition D を選んで、Gate 1 に Massive Build を実行してください（D,m(1)）。\n\nこのひと手で D を取得し、最後の Gate slot を埋め、Black 7 対 White 6 で勝利します。',
    trainingT9Complete: '全 Gate の slot がすべて埋まり、ゲームが終了しました。\n\n最終 Position 数：Black 7 —— White 6\n\nPosition を 1 つ多く所有している Black の勝ちです。',
    trainingT9WhyEnded: 'ONE EIGHT の終局条件は、12 個すべての Gate の全 slot が埋まったときです。最後の Massive Build が Gate 1 の最後の slot を埋めたため、終局判定が発生しました。',
    trainingT9WhyWinner: '勝敗は所有 Position 数の単純比較で決まります。Gate のアセット価値は勝敗には影響しません。終局時、Black 7、White 6 のため Black の勝利です。',
    trainingT9Desc: 'ONE EIGHT の終局条件と勝者の決め方を学ぶ。',
    trainingT10Title: '守りの一手',
    trainingT10Step1: 'Step 1 / 1 ── あなたの Position を守る\n\n危険です。Position E はあなたの所有ですが、White が Gate 2 に Massive Build を行っているため、このままだと次のWhite手番でEを奪われます。\n\nPosition E を選び直して、Gate 4 に Massive Build を実行してください（E,m(4)）。\n\nEのもう1つのGateにBlackのLargeを置くことで、最強Gateの支配数が1対1で拮抗し、WhiteはEを奪えなくなります。',
    trainingT10Complete: 'Eの周辺で最大のGateが2つになり、Gate 2はWhite、Gate 4はBlackが支配する形になりました。\n\nmost-built支配数：White 1 ── Black 1\n\n数が拮抗しているため、WhiteはEを奪取できません。Eはあなたの所有のまま守られました。',
    trainingT10WhyThreat: 'Capture判定では、対象Positionに接続するGateのうち、最も総額が高いGateだけを見ます。初期局面ではGate 2だけが最大で、Whiteが支配していたため、WhiteはEを奪える状態でした。',
    trainingT10WhyDefended: 'Gate 4にBlackのMassiveを置くことで、Gate 4もGate 2と同じ最大値になりました。Gate 2はWhite、Gate 4はBlackが支配するため、支配数が1対1になり、WhiteはEを奪えなくなります。',
    trainingT10Desc: '接続Gateにbuildして自分のPositionを守ることを学ぶ。',


    selectMode: 'モードを選択',
    cancel: 'キャンセル',
    cpuSettings: 'CPU 設定',
    cpuDifficulty: '強さ',
    cpuDiffNormal: 'アニェージ',
    cpuDiffHard: 'アル・カーシー',
    cpuDiffVeryHard: 'モーペルテュイ',
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
    historySection: '棋譜',
    refresh: '更新',
    refreshing: '更新中…',
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
    onlineTimeoutWin: '時間切れ — あなたの勝利！',
    onlineTimeoutLose: '時間切れ — 敗北。',
    onlineTimeoutDraw: '時間切れ — 引き分け。',
    onlineOpponentTimeout: '相手の時間が切れました！',
    onlineExit: '退出',
    onlineBackToMenu: 'メニューに戻る',
    onlineRoomNotFound: 'ルームが見つからないか、すでに開始済みです。',
    onlineCannotJoinOwn: '自分のルームには入室できません。',
    // Online mode select
    onlineFriendMatch: 'フレンドマッチ',
    onlineFriendMatchDesc: 'ルームコードを使って友達と対戦。',
    onlineRandomMatch: 'ランダムマッチ',
    onlineRandomMatchDesc: 'ランダムに相手とマッチングして対戦。',
    onlineRanked: '公式アリーナ',
    onlineRankedDesc: 'Pro限定の公式競技。ELEPHANT / JAGUAR アリーナ に参加できます。',
    onlineTournament: '大会',
    onlineTournamentDesc: '運営発行のキーで参加する大会。',
    onlineComingSoon: '近日公開',
    officialMatchEnterFromOnlinePlay: 'Online Play の 公式アリーナ / 大会 から入室してください。',
    onlineNoRankedMatches: '公式戦の予定はありません。',
    onlineNoCompetitions: '大会の予定はありません。',
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
    cpuProfiles: 'CPU 成績',
    cpuProfileTitle: (d: string) => `${d}`,
    cpuTotalGames: '総対局数',
    cpuWins: '勝利',
    cpuLosses: '敗北',
    cpuDraws: '引き分け',
    cpuWinRate: '勝率',
    cpuNoGames: 'まだ対局記録がありません。',
    // Official Match Calendar
    omStatusScheduled: '予定',
    omStatusJoinNow: '入室可',
    omStatusLive: '進行中',
    omStatusCompleted: '完了',
    omStatusCancelled: 'キャンセル',
    omStatusForfeited: '不戦',
    omStatusNoContest: '無効試合',
    omTimerTotal: '持ち時間',
    omTimerPerMove: '一手ごと',
    omTimerNoClock: '時計なし',
    omResultDraw: '引き分け',
    omResultWin: '勝利',
    omResultWinNoShow: '不戦勝',
    omResultWinTimeout: '時間切れ勝ち',
    omResultLoss: '敗北',
    omResultLossNoShow: '不戦敗',
    omResultLossTimeout: '時間切れ負け',
    omResultNeutralNoContest: '無効試合',
    omResultNeutralCancelled: 'キャンセル',
    omResultNeutralForfeited: '不戦',
    omStartsIn: (label: string) => `開始まで ${label}`,
    omAvailable15Min: '開始15分前から入室できます',
    omRejoinInProgress: '進行中の対局に再入室できます',

    // Pro status
    proBadge: 'PRO',
    proUpgradeBannerTitle: 'Pro機能を解除',
    proUpgradeBannerDesc: 'Ghost分析、Postmortem候補手表示、その他の機能。',
    proUpgradeBtn: 'Proにアップグレード',
    proAlreadyActive: 'Proプラン加入済み',
    proRenewsOn: (date: string) => `次回更新日: ${date}`,
    proUpgradeGames: '過去の全対局を見る（Pro限定）',
    ghostProBadge: 'Pro',
    ghostProOnlyTitle: 'Ghost（Pro限定）',
    ghostProOnlyText: 'GhostはPro限定機能です。過去の対局データから候補手を確認するには、Proへのアップグレードが必要です。',
    ghostProUpgradeCta: 'Pro機能を見る',
    omEnterMatch: '入室',
    omEntering: '入室中…',
    omUpcomingMatches: '今後の公式戦',
    omRecentResults: '最近の結果',
    omNoUpcomingOfficial: '今後の公式戦はありません',
    omNoMatchesOnDate: 'この日の公式戦はありません',
    omNoUpcomingMatches: '予定の対局はありません',
    omShowAllMatches: 'すべて表示',
    omToday: '今日',
    omMatchesOn: (dateStr: string) => `${dateStr} の公式戦`,
    omLoading: '公式戦を読み込み中…',
    omLoadFailed: '公式戦の読み込みに失敗しました',
    omRetry: '再試行',
    omOfficialMatches: '公式戦',
    omWaitingForBlack: 'Black の初手待ちです。Black の時計が進んでいます。',
    loading: '読み込み中…',
    // Official Arena (Phase E-1)
    arenaOfficialArena: '公式アリーナ',
    arenaElephantArena: 'ELEPHANT アリーナ',
    arenaJaguarArena: 'JAGUAR アリーナ',
    arenaProRequired: 'Proが必要',
    arenaEntrySoon: 'Entry機能は準備中',
    arenaNoMaster: 'Master未定',
    arenaNoInterim: 'Interim Masterなし',
    arenaNextEvent: '次回開催',
    arenaEntryDeadline: 'Entry締切',
    arenaCurrentMaster: '現在のMaster',
    arenaInterimMaster: 'Interim Master',
    arenaPointRanking: 'アリーナ Point Ranking',
    arenaRecentMatchHistory: '最近のMatch履歴',
    arenaTapForDetail: '詳細を開く',
    arenaMyEntry: 'Entry状態',
    arenaNotEntered: '未Entry',
    arenaEntryStatusPending: 'Entry済み・Pairing待ち',
    arenaEntryStatusMatched: 'Match決定済み',
    arenaEntryStatusNoMatch: 'Match不成立',
    arenaDetailBtn: '詳細を開く',
    arenaOpenDetail: '詳細を開く',
    arenaMasterHistory: 'Master履歴',
    // Official Arena (Phase E-2) — Entry confirmation + execution
    arenaConfirmEntryTitle: 'Arena Entryの確認',
    arenaEntryCannotCancel: '確認後、このEntryはキャンセルできません。',
    arenaEventTime: '開催日時',
    arenaNoShowWarning: '開始時刻に割り当てられたMatchへ入室しない場合、no-show敗北になる可能性があります。',
    arenaNoShowPenalty: 'no-show敗北では Arena Point が -3 されます。',
    arenaProOnlyEntry: 'Official ArenaへのEntryはProユーザー限定です。',
    arenaConfirmEntryBtn: 'Entryを確定',
    arenaBackBtn: '戻る',
    arenaEntryConfirmed: 'Entry済み',
    arenaEntryClosed: 'Entry締切済み',
    arenaAlreadyEntered: 'Entry済み',
    arenaLoginRequired: 'ログインが必要',
    arenaNoUpcomingEvent: '次回開催未定',
    arenaEntryFailed: 'Entryに失敗しました',
    arenaEntryBtn: 'ArenaにEntry',
    arenaEntryErrNotAuthenticated: 'Entryにはログインが必要です。',
    arenaEntryErrProRequired: 'Official ArenaへのEntryはProユーザーのみ可能です。',
    arenaEntryErrAlreadyEntered: 'すでにこのArenaにEntry済みです。',
    arenaEntryErrDeadlinePassed: 'Entry締切を過ぎています。',
    arenaEntryErrEventNotFound: 'Eventが見つかりません。',
    arenaEntryErrEventNotOpen: 'このEventはEntry受付中ではありません。',
    arenaEntryErrUnknown: 'Entryに失敗しました。もう一度お試しください。',
    // Official Arena (Phase E-3) — My Arena Match
    arenaMyArenaMatch: 'あなたのArena Match',
    arenaPairingAfterDeadline: 'PairingはEntry締切後に決定されます。',
    arenaMatchWillAppear: 'Pairing生成後、ここにあなたのMatch情報が表示されます。',
    arenaNoMatchEstablished: 'このArena EventではMatchが成立しませんでした。',
    arenaNoArenaPointsChanged: 'Arena Pointの変動はありません。',
    arenaMatchLabel: 'Match',
    arenaMasterMatch: 'Master Match',
    arenaPointMatch: 'Point Match',
    arenaYouAreBlack: 'あなたはBlack',
    arenaYouAreWhite: 'あなたはWhite',
    arenaOpponent: '対戦相手',
    arenaStartTime: '開始時刻',
    arenaEnterMatch: '対局へ入室',
    arenaEnterMatchComingSoon: '入室機能は準備中',
    arenaEnterMatchUnavailable: '入室情報がまだありません',
    arenaMatchCompleted: 'Match終了済み',
    arenaEnterMatchFailed: 'Match入室に失敗しました',
    arenaMatchNotStartedYet: 'Match開始前です',
    arenaMatchNoLongerAvailable: 'Matchは利用できません',
    arenaMatchKindInaugural: '初代戦',
    arenaMatchKindDefend: '防衛戦',
    arenaMatchKindMasterSuccession: 'Master継承戦',
    arenaMatchKindInterimSet: 'Interim Set',
    // E-5: Arena result status
    arenaResultPendingTitle: '対局は終了しました。',
    arenaResultPendingBody: 'Arena結果は確認中です。',
    arenaResultPendingNote: 'Arena PointとMaster状態は確認後に反映されます。',
    arenaResultProcessed: 'Arena結果は反映済みです。',
    // E-6: Arena titles on Profile/UserPage
    arenaArenaTitles: 'アリーナ称号',
    arenaNoArenaTitles: 'アリーナ称号なし',
    arenaTitleMaster: 'マスター',
    arenaTitleCurrentHolder: '現在の称号保持者',

    // Timer
    timerClock: 'タイムクロック',
    timerByoyomi: '秒読み',
    timerModeNone: 'なし',
    timerModeTotal: '持ち時間制',
    timerModePerMove: '1手制限',
    timerNone: 'なし',
    timerMin5: '5分',
    timerMin10: '10分',
    timerSec10: '10秒',
    timerSec30: '30秒',
    timerSec60: '60秒',

    // Result modal
    resultGameFinished: '対局終了',
    resultDraw: '引き分け',
    resultBlackWins: '黒の勝利',
    resultWhiteWins: '白の勝利',
    resultTimeOut: '時間切れ',

    // Modal eyebrow
    newGameEyebrow: 'ニューゲーム',
    vsCpuEyebrow: 'vs CPU',

    // Stats / Move History
    myStats: '自分の戦績',
    copyBtn: 'コピー',
    copiedBtn: 'コピー済み',

    // Postmortem
    postmortemRetry: '再試行',

    // ConfirmModal
    execute: '実行',

    // Tutorial
    tutNext: '次へ →',

    // Prize / UserPage
    prizeSectionTitle: '受賞・報酬',
    prizeNoAwards: '受賞・報酬はありません。',
    prizeSubmitInfo: '受取・税務情報を提出',
    prizeSubmittedMsg: '提出済みです。運営が Winner File を処理します。',
    prizeStatusSubmitted: '提出済み・処理待ち',
    prizeStatusProcessed: '処理済み',
    prizeStatusOnHold: 'この受賞は保留中です。',

    // AuthGate
    authMagicLink: 'マジックリンク',
    authPasswordLogin: 'パスワードログイン',
    authEmailSent: 'メールを送信しました。受信箱のリンクをクリックしてログインしてください。',
    authSendMagicLink: 'マジックリンクを送信',
    authSending: '送信中…',
    authPassword: 'パスワード',
    authLogIn: 'ログイン',
    authLoggingIn: 'ログイン中…',
    authTagline: 'ONE EIGHT は競技性のあるアブストラクト戦略ゲームです。月額メンバーシップあり。',

    // Arena (additional)
    arenaProcessing: '処理中…',
    arenaName: '名前',
    arenaWin: '勝: ',
    arenaCurrent: '(現在)',

    // Label guide captions (Option C: canonical labels, board rotates for white)
    labelGuideBlackText: 'GATE番号は左上から時計周りに1→12。POSITION番号は左から右、上から下の順でA→M。（棋譜には打ち手が番号で記載されます）',
    labelGuideWhiteText: 'GATE番号は右下から時計周りに1→12。POSITION番号は右から左、下から上の順でA→M。（棋譜には打ち手が番号で記載されます）'

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
  buildTypesTitle: string;
  rulesBody: { heading: string; body: string }[];
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
  modeTraining: string;
  trainingTitle: string;
  trainingRecordeTitle: string;
  trainingPlaceholderMsg: string;
  trainingT1Title: string;
  trainingT1Step1: string;
  trainingT1Step3: string;
  trainingT1Step5: string;
  trainingFeedbackWrong: string;
  trainingFeedbackCleared: string;
  trainingCompleteTitle: string;
  trainingT2Title: string;
  trainingT2Intro: string;
  trainingT2Step1: string;
  trainingT2Complete: string;
  trainingNextTraining: string;
  trainingRestartStep: string;
  trainingBackToMenu: string;
  trainingBackToIntro: string;
  trainingIntroSubtitle: string;
  trainingIntroDesc: string;
  trainingTaskStatusAvailable: string;
  trainingTaskStatusComplete: string;
  trainingTaskStatusLocked: string;
  trainingStart: string;
  trainingReplay: string;
  trainingLockedMessage: string;
  trainingT1Desc: string;
  trainingT2Desc: string;
  trainingT7Title: string;
  trainingT7Step1: string;
  trainingT7Complete: string;
  trainingT7Desc: string;
  trainingT5Title: string;
  trainingT5Step1: string;
  trainingT5Complete: string;
  trainingT5Desc: string;
  trainingT5TieExplanation: string;
  trainingT8Title: string;
  trainingT8Step1: string;
  trainingT8CpuMsg: string;
  trainingT8Step2: string;
  trainingT8Complete: string;
  trainingT8Desc: string;
  trainingT9Title: string;
  trainingT9Step1: string;
  trainingT9Complete: string;
  trainingT9WhyEnded: string;
  trainingT9WhyWinner: string;
  trainingT9Desc: string;
  trainingT10Title: string;
  trainingT10Step1: string;
  trainingT10Complete: string;
  trainingT10WhyThreat: string;
  trainingT10WhyDefended: string;
  trainingT10Desc: string;
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
  historySection: string;
  refresh: string;
  refreshing: string;
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
  onlineTimeoutWin: string;
  onlineTimeoutLose: string;
  onlineTimeoutDraw: string;
  onlineOpponentTimeout: string;
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
  officialMatchEnterFromOnlinePlay: string;
  onlineNoRankedMatches: string;
  onlineNoCompetitions: string;
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
  cpuProfiles: string;
  cpuProfileTitle: (d: string) => string;
  cpuTotalGames: string;
  cpuWins: string;
  cpuLosses: string;
  cpuDraws: string;
  cpuWinRate: string;
  cpuNoGames: string;
  // Official Match Calendar
  omStatusScheduled: string;
  omStatusJoinNow: string;
  omStatusLive: string;
  omStatusCompleted: string;
  omStatusCancelled: string;
  omStatusForfeited: string;
  omStatusNoContest: string;
  omTimerTotal: string;
  omTimerPerMove: string;
  omTimerNoClock: string;
  omResultDraw: string;
  omResultWin: string;
  omResultWinNoShow: string;
  omResultWinTimeout: string;
  omResultLoss: string;
  omResultLossNoShow: string;
  omResultLossTimeout: string;
  omResultNeutralNoContest: string;
  omResultNeutralCancelled: string;
  omResultNeutralForfeited: string;
  omStartsIn: (label: string) => string;
  omAvailable15Min: string;
  omRejoinInProgress: string;

  // Pro status
  proBadge: string;
  proUpgradeBannerTitle: string;
  proUpgradeBannerDesc: string;
  proUpgradeBtn: string;
  proAlreadyActive: string;
  proRenewsOn: (date: string) => string;
  proUpgradeGames: string;
  ghostProBadge: string;
  ghostProOnlyTitle: string;
  ghostProOnlyText: string;
  ghostProUpgradeCta: string;
  omEnterMatch: string;
  omEntering: string;
  omUpcomingMatches: string;
  omRecentResults: string;
  omNoUpcomingOfficial: string;
  omNoMatchesOnDate: string;
  omNoUpcomingMatches: string;
  omShowAllMatches: string;
  omToday: string;
  omMatchesOn: (dateStr: string) => string;
  omLoading: string;
  omLoadFailed: string;
  omRetry: string;
  omOfficialMatches: string;
  omWaitingForBlack: string;
  loading: string;
  // Official Arena (Phase E-1)
  arenaOfficialArena: string;
  arenaElephantArena: string;
  arenaJaguarArena: string;
  arenaProRequired: string;
  arenaEntrySoon: string;
  arenaNoMaster: string;
  arenaNoInterim: string;
  arenaNextEvent: string;
  arenaEntryDeadline: string;
  arenaCurrentMaster: string;
  arenaInterimMaster: string;
  arenaPointRanking: string;
  arenaRecentMatchHistory: string;
  arenaTapForDetail: string;
  arenaMyEntry: string;
  arenaNotEntered: string;
  arenaEntryStatusPending: string;
  arenaEntryStatusMatched: string;
  arenaEntryStatusNoMatch: string;
  arenaDetailBtn: string;
  arenaOpenDetail: string;
  arenaMasterHistory: string;
  // Official Arena (Phase E-2)
  arenaConfirmEntryTitle: string;
  arenaEntryCannotCancel: string;
  arenaEventTime: string;
  arenaNoShowWarning: string;
  arenaNoShowPenalty: string;
  arenaProOnlyEntry: string;
  arenaConfirmEntryBtn: string;
  arenaBackBtn: string;
  arenaEntryConfirmed: string;
  arenaEntryClosed: string;
  arenaAlreadyEntered: string;
  arenaLoginRequired: string;
  arenaNoUpcomingEvent: string;
  arenaEntryFailed: string;
  arenaEntryBtn: string;
  arenaEntryErrNotAuthenticated: string;
  arenaEntryErrProRequired: string;
  arenaEntryErrAlreadyEntered: string;
  arenaEntryErrDeadlinePassed: string;
  arenaEntryErrEventNotFound: string;
  arenaEntryErrEventNotOpen: string;
  arenaEntryErrUnknown: string;
  // Official Arena (Phase E-3) — My Arena Match
  arenaMyArenaMatch: string;
  arenaPairingAfterDeadline: string;
  arenaMatchWillAppear: string;
  arenaNoMatchEstablished: string;
  arenaNoArenaPointsChanged: string;
  arenaMatchLabel: string;
  arenaMasterMatch: string;
  arenaPointMatch: string;
  arenaYouAreBlack: string;
  arenaYouAreWhite: string;
  arenaOpponent: string;
  arenaStartTime: string;
  arenaEnterMatch: string;
  arenaEnterMatchComingSoon: string;
  arenaEnterMatchUnavailable: string;
  arenaMatchCompleted: string;
  arenaEnterMatchFailed: string;
  arenaMatchNotStartedYet: string;
  arenaMatchNoLongerAvailable: string;
  arenaMatchKindInaugural: string;
  arenaMatchKindDefend: string;
  arenaMatchKindMasterSuccession: string;
  arenaMatchKindInterimSet: string;
  // E-5: Arena result status
  arenaResultPendingTitle: string;
  arenaResultPendingBody: string;
  arenaResultPendingNote: string;
  arenaResultProcessed: string;
  // E-6: Arena titles on Profile/UserPage
  arenaArenaTitles: string;
  arenaNoArenaTitles: string;
  arenaTitleMaster: string;
  arenaTitleCurrentHolder: string;

  // Timer
  timerClock: string;
  timerByoyomi: string;
  timerModeNone: string;
  timerModeTotal: string;
  timerModePerMove: string;
  timerNone: string;
  timerMin5: string;
  timerMin10: string;
  timerSec10: string;
  timerSec30: string;
  timerSec60: string;

  // Result modal
  resultGameFinished: string;
  resultDraw: string;
  resultBlackWins: string;
  resultWhiteWins: string;
  resultTimeOut: string;

  // Modal eyebrow
  newGameEyebrow: string;
  vsCpuEyebrow: string;

  // Stats / Move History
  myStats: string;
  copyBtn: string;
  copiedBtn: string;

  // Postmortem
  postmortemRetry: string;

  // ConfirmModal
  execute: string;

  // Tutorial
  tutNext: string;

  // Prize / UserPage
  prizeSectionTitle: string;
  prizeNoAwards: string;
  prizeSubmitInfo: string;
  prizeSubmittedMsg: string;
  prizeStatusSubmitted: string;
  prizeStatusProcessed: string;
  prizeStatusOnHold: string;

  // AuthGate
  authMagicLink: string;
  authPasswordLogin: string;
  authEmailSent: string;
  authSendMagicLink: string;
  authSending: string;
  authPassword: string;
  authLogIn: string;
  authLoggingIn: string;
  authTagline: string;

  // Arena (additional)
  arenaProcessing: string;
  arenaName: string;
  arenaWin: string;
  arenaCurrent: string;

  // Label guide captions
  labelGuideBlackText: string;
  labelGuideWhiteText: string;
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

const LANG_LS_KEY = 'one8_lang';
const SUPPORTED_LANGS: Lang[] = ['en', 'ja'];

function readLangFromStorage(): Lang {
  try {
    const stored = localStorage.getItem(LANG_LS_KEY);
    if (stored && (SUPPORTED_LANGS as string[]).includes(stored)) return stored as Lang;
  } catch { /* noop */ }
  return 'en';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLangFromStorage);
  const [userId, setUserId] = useState<string | null>(null);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(LANG_LS_KEY, l); } catch { /* noop */ }
  }, []);

  const setLangWithSync = useCallback((l: Lang) => {
    setLang(l);
    if (userId) {
      upsertProfile(userId, { lang: l }).catch(() => {/* silent */});
    }
  }, [userId, setLang]);

  return (
    <LangContext.Provider value={{ lang, setLang, setLangWithSync, setUserId, t: T[lang] as unknown as Translations }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
