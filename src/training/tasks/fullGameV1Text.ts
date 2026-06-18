import type { FullGameTrainingText } from '../types';

/**
 * Localized text data for FULL_GAME_V1 (full-game-v1).
 *
 * Phase 2a: 文言メタ情報追加。UI未実装・一覧未登録・lang.tsx 未変更。
 *
 * - 22手の棋譜データ (fullGameV1.ts) は変更しない。
 * - このファイルは fullGameV1.ts と同階層に置き、Phase 3 の UI 実装で import する想定。
 * - stepText は moveNumber をキーにして FullGameTrainingStep と突き合わせる。
 */
export const FULL_GAME_V1_TEXT: FullGameTrainingText = {
  courseId: 'full-game-v1',

  meta: {
    title: {
      en: 'ONE EIGHT Guided Game — Think as Black',
      ja: 'ONE EIGHT 一局指南 — Blackとして考える',
    },
    description: {
      en: "Play through one guided game as Black. White's moves are fixed. At key moments, you will decide how Black should build, defend, and capture.",
      ja: 'Black視点で、1局の流れを通して学びます。Whiteの手は固定です。重要な局面で、BlackとしてBuild、防衛、Captureを判断してください。',
    },
    finalSummary: {
      en: 'You have seen how a game can be shaped before the capture happens. Strong assets matter, but timing matters more. Build to prepare, build to defend, and capture when the gate values give you the right to do so.',
      ja: 'Captureは突然起きるのではなく、その前のBuildで準備されます。強いAssetも重要ですが、それ以上にタイミングが重要です。準備するBuild、防ぐBuild、そしてGate支配値が条件を満たした時のCaptureを意識してください。',
    },
  },

  steps: [
    // ── Move 1 — USER (Black) ────────────────────────────────────────────
    {
      moveNumber: 1,
      learningPoint: 'massive, large_asset, first_gate',
      userText: {
        situation: {
          en: 'You begin as Black. Start by creating one strong point near the center.',
          ja: 'あなたはBlackです。まずは中央寄りに強い支点を作ります。',
        },
        question: {
          en: 'Select Position E and place a Massive Build on Gate 6.',
          ja: 'Position Eを選び、Gate 6にMassive Buildを置いてください。',
        },
        hint: {
          en: 'Choose E first, then choose Massive, then Gate 6.',
          ja: 'まずEを選び、Massiveを選択してからGate 6を選んでください。',
        },
        success: {
          en: 'Massive places one Large asset. A Large is worth 64, so Gate 6 is now a strong base for Black.',
          ja: 'MassiveはLargeを1つ置きます。Largeは64の価値を持つため、Gate 6はBlackの強い支点になります。',
        },
      },
    },

    // ── Move 2 — AUTO (White) ────────────────────────────────────────────
    {
      moveNumber: 2,
      learningPoint: 'white_base',
      autoText: {
        auto: {
          en: 'White answers by placing a Large asset on Gate 9. Both sides now have one strong gate to build around.',
          ja: 'WhiteはGate 9にLargeを置きました。これで両者が、それぞれ強いGateを1つ持った状態になります。',
        },
      },
    },

    // ── Move 3 — USER (Black) ────────────────────────────────────────────
    {
      moveNumber: 3,
      learningPoint: 'quad, wide_build, small_asset',
      userText: {
        situation: {
          en: 'Now try a different kind of Build. Instead of focusing on one gate, spread small assets across several gates.',
          ja: '次は別のBuildを使います。1つのGateに集中するのではなく、複数のGateへ広く置きます。',
        },
        question: {
          en: 'Select Position A and make a Quad Build.',
          ja: 'Position Aを選び、Quad Buildを実行してください。',
        },
        hint: {
          en: 'Choose A, then select Quad. The connected gates will each receive a Small asset if space is available.',
          ja: 'Aを選び、Quadを選択してください。接続されたGateに、置ける範囲でSmallが配置されます。',
        },
        success: {
          en: 'Quad spreads Small assets across four gates. Each Small is only worth 1, but wide placement can prepare future control.',
          ja: 'Quadは4つのGateへSmallを広く配置します。Smallの価値は1ですが、広い配置は後の支配につながります。',
        },
      },
    },

    // ── Move 4 — AUTO (White) ────────────────────────────────────────────
    {
      moveNumber: 4,
      learningPoint: 'white_selective',
      autoText: {
        auto: {
          en: 'White uses Selective from Position K, strengthening Gate 9 while also adding pressure on Gate 4.',
          ja: 'WhiteはPosition KからSelectiveを使い、Gate 9を強化しつつ、Gate 4にも圧力をかけました。',
        },
      },
    },

    // ── Move 5 — USER (Black) ────────────────────────────────────────────
    {
      moveNumber: 5,
      learningPoint: 'selective, middle_asset, strengthen_and_expand',
      userText: {
        situation: {
          en: 'Gate 6 is already important for Black. Selective lets you strengthen it while also preparing another gate.',
          ja: 'Gate 6はすでにBlackにとって重要です。Selectiveを使うと、そこを強化しながら別のGateにも準備できます。',
        },
        question: {
          en: 'Select Position M and place Middle assets on Gate 6 and Gate 8.',
          ja: 'Position Mを選び、Gate 6とGate 8にMiddleを置いてください。',
        },
        hint: {
          en: 'Choose M, then Selective. Select Gate 6 first, then Gate 8.',
          ja: 'Mを選び、Selectiveを選択します。Gate 6、次にGate 8を選んでください。',
        },
        success: {
          en: 'Selective places two Middle assets. Gate 6 becomes stronger, and Gate 8 becomes a new point for Black.',
          ja: 'SelectiveはMiddleを2つ置きます。Gate 6をさらに強化しながら、Gate 8にもBlackの足場を作りました。',
        },
      },
    },

    // ── Move 6 — AUTO (White) ────────────────────────────────────────────
    {
      moveNumber: 6,
      learningPoint: 'future_threat',
      autoText: {
        auto: {
          en: 'White places a Large asset on Gate 2. This is not an immediate capture, but it creates a line that Black must watch.',
          ja: 'WhiteはGate 2にLargeを置きました。今すぐCaptureされるわけではありませんが、Blackが注意すべきラインが生まれました。',
        },
      },
    },

    // ── Move 7 — USER (Black) ────────────────────────────────────────────
    {
      moveNumber: 7,
      learningPoint: 'defense, preparation, gate_control',
      userText: {
        situation: {
          en: "White has a Large asset on Gate 2. If White strengthens this line again, Black's center may become vulnerable.",
          ja: 'WhiteはGate 2にLargeを置いています。このラインをさらに強化されると、Blackの中央が危険になります。',
        },
        question: {
          en: 'Use Position A to place a Massive Build on Gate 2 before White can build on it again.',
          ja: 'Whiteがもう一度このGateを強化する前に、Position AからGate 2へMassiveを置いてください。',
        },
        hint: {
          en: 'You can select the same Position again. Choose A, then Massive, then Gate 2.',
          ja: '同じPositionは再選択できます。Aを選び、Massive、Gate 2の順に選んでください。',
        },
        success: {
          en: 'Black now also has a Large asset on Gate 2. White can no longer freely turn this gate into a one-sided threat.',
          ja: 'BlackもGate 2にLargeを置きました。これでWhiteは、このGateを一方的な脅威にはしにくくなります。',
        },
      },
    },

    // ── Move 8 — AUTO (White) ────────────────────────────────────────────
    {
      moveNumber: 8,
      learningPoint: 'white_redirect',
      autoText: {
        auto: {
          en: 'White changes direction and adds Middle assets to Gate 3 and Gate 7. The pressure is spreading.',
          ja: 'Whiteは方針を変え、Gate 3とGate 7にMiddleを置きました。圧力が別方向へ広がっています。',
        },
      },
    },

    // ── Move 9 — USER (Black) ────────────────────────────────────────────
    {
      moveNumber: 9,
      learningPoint: 'large_timing, strategic_build',
      userText: {
        situation: {
          en: 'Black now has a chance to secure the right side with another strong gate.',
          ja: 'ここでBlackは、右側にもう1つ強いGateを作れます。',
        },
        question: {
          en: 'Select Position J and place a Massive Build on Gate 5.',
          ja: 'Position Jを選び、Gate 5にMassive Buildを置いてください。',
        },
        hint: {
          en: 'Choose J, then Massive, then Gate 5.',
          ja: 'Jを選び、Massive、Gate 5の順に選んでください。',
        },
        success: {
          en: 'Gate 5 is now a strong Black gate. Large assets are powerful, but they matter most when they support future control.',
          ja: 'Gate 5はBlackの強いGateになりました。Largeは強力ですが、将来の支配につながる場所に置くことが重要です。',
        },
      },
    },

    // ── Move 10 — AUTO (White) ───────────────────────────────────────────
    {
      moveNumber: 10,
      learningPoint: 'white_counterweight',
      autoText: {
        auto: {
          en: 'White places a Large asset on Gate 4. This gives White a strong counterweight on the upper right side.',
          ja: 'WhiteはGate 4にLargeを置きました。右上側に、Whiteの強い対抗点ができました。',
        },
      },
    },

    // ── Move 11 — AUTO (Black) ───────────────────────────────────────────
    {
      moveNumber: 11,
      learningPoint: 'wide_connection',
      autoText: {
        auto: {
          en: 'Black spreads Small assets from Position G. This keeps Black connected across several gates without spending another Large asset.',
          ja: 'BlackはPosition GからSmallを広く配置しました。Largeを使わずに、複数のGateへつながりを作ります。',
        },
      },
    },

    // ── Move 12 — AUTO (White) ───────────────────────────────────────────
    {
      moveNumber: 12,
      learningPoint: 'white_expansion',
      autoText: {
        auto: {
          en: 'White uses Quad from Position K, spreading Small assets around its existing structure.',
          ja: 'WhiteはPosition KからQuadを使い、既存の構えの周囲へSmallを広げました。',
        },
      },
    },

    // ── Move 13 — USER (Black) · Capture B ──────────────────────────────
    {
      moveNumber: 13,
      learningPoint: 'capture, gate_value, opponent_position',
      userText: {
        situation: {
          en: 'Position B belongs to White. Look at the gates connected to B. The strongest connected gate is Gate 2, and Black controls it.',
          ja: 'Position BはWhiteのものです。BにつながるGateを見てください。最も強い接続GateはGate 2で、そこはBlackが支配しています。',
        },
        question: {
          en: 'Capture Position B. Select B and place a Massive Build on Gate 3.',
          ja: 'Position BをCaptureしてください。Bを選び、Gate 3にMassive Buildを置いてください。',
        },
        hint: {
          en: 'Capture is possible when the strongest connected gate favors you. Gate 2 is the key here.',
          ja: 'Captureは、接続Gateのうち最も強いGateで自分が優勢な時に成立します。ここではGate 2が鍵です。',
        },
        success: {
          en: "Black captures B. Capture does not happen just because you choose an enemy Position; it happens because the gate values support your claim.",
          ja: 'BlackはBをCaptureしました。相手Positionを選ぶだけでは奪えません。Gate支配値が条件を満たしているから、Captureが成立します。',
        },
      },
    },

    // ── Move 14 — AUTO (White) ───────────────────────────────────────────
    {
      moveNumber: 14,
      learningPoint: 'white_resistance',
      autoText: {
        auto: {
          en: "White strengthens H through Gate 5 and Gate 6. This is an attempt to resist Black's growing control.",
          ja: 'WhiteはGate 5とGate 6を使ってHを強化しました。Blackの支配拡大に対抗しようとしています。',
        },
      },
    },

    // ── Move 15 — USER (Black) · Capture H ──────────────────────────────
    {
      moveNumber: 15,
      learningPoint: 'capture_reinforcement, reading_connected_gates',
      userText: {
        situation: {
          en: 'Position H belongs to White, but Black now has strong control around it. The same capture principle applies again.',
          ja: 'Position HはWhiteのものですが、周囲のGateではBlackが強くなっています。ここでも同じCaptureの原則を使います。',
        },
        question: {
          en: 'Capture Position H. Select H and place a Massive Build on Gate 5.',
          ja: 'Position HをCaptureしてください。Hを選び、Gate 5にMassive Buildを置いてください。',
        },
        hint: {
          en: 'Do not only look at who owns H. Look at the connected gates and ask which side controls the strongest one.',
          ja: 'Hの所有者だけを見ないでください。接続Gateを見て、最も強いGateをどちらが支配しているかを確認します。',
        },
        success: {
          en: 'Black captures H. Once you understand the gate values, capture becomes something you can prepare, not something you only notice after it happens.',
          ja: 'BlackはHをCaptureしました。Gate支配値を読めるようになると、Captureは偶然ではなく、準備して起こすものになります。',
        },
      },
    },

    // ── Move 16 — AUTO (White) ───────────────────────────────────────────
    {
      moveNumber: 16,
      learningPoint: 'white_counterplay',
      autoText: {
        auto: {
          en: 'White places a Large asset on Gate 3, trying to turn this area back into a contest.',
          ja: 'WhiteはGate 3にLargeを置き、この周辺を再び争点にしようとしています。',
        },
      },
    },

    // ── Move 17 — AUTO (Black) ───────────────────────────────────────────
    {
      moveNumber: 17,
      learningPoint: 'black_left_side',
      autoText: {
        auto: {
          en: 'Black places a Large asset from Position F onto Gate 11. This strengthens the left side without asking for another decision yet.',
          ja: 'BlackはPosition FからGate 11にLargeを置きました。ここでは判断を挟まず、左側の支配を固めます。',
        },
      },
    },

    // ── Move 18 — AUTO (White) ───────────────────────────────────────────
    {
      moveNumber: 18,
      learningPoint: 'white_foothold',
      autoText: {
        auto: {
          en: 'White reinforces Gate 3 and Gate 10 from Position C. White is trying to keep a foothold.',
          ja: 'WhiteはPosition CからGate 3とGate 10を強化しました。Whiteは足場を残そうとしています。',
        },
      },
    },

    // ── Move 19 — AUTO (Black) ───────────────────────────────────────────
    {
      moveNumber: 19,
      learningPoint: 'black_structure',
      autoText: {
        auto: {
          en: 'Black adds a Large asset to Gate 8 from Position M. The earlier Middle on Gate 8 now becomes part of a stronger structure.',
          ja: 'BlackはPosition MからGate 8にLargeを置きました。以前置いたMiddleが、より強い構えの一部になります。',
        },
      },
    },

    // ── Move 20 — AUTO (White) ───────────────────────────────────────────
    {
      moveNumber: 20,
      learningPoint: 'white_late_large',
      autoText: {
        auto: {
          en: 'White places a Large asset on Gate 10. White is still building, but Black already controls more Positions.',
          ja: 'WhiteはGate 10にLargeを置きました。WhiteもBuildを続けていますが、Position数ではBlackが大きく先行しています。',
        },
      },
    },

    // ── Move 21 — USER (Black) + post-step question ──────────────────────
    {
      moveNumber: 21,
      learningPoint: 'position_count, winning_judgment, endgame_awareness',
      userText: {
        situation: {
          en: 'The board is now strongly tilted toward Black. Before the final auto move, make one more build and then judge the position count.',
          ja: '盤面は大きくBlackに傾いています。最後の自動進行の前に、もう一手Buildし、その後でPosition数を判断します。',
        },
        question: {
          en: 'Select Position F and place a Massive Build on Gate 12.',
          ja: 'Position Fを選び、Gate 12にMassive Buildを置いてください。',
        },
        hint: {
          en: 'Choose F, then Massive, then Gate 12.',
          ja: 'Fを選び、Massive、Gate 12の順に選んでください。',
        },
        success: {
          en: 'Black has strengthened the left side again. Now look at the board as a whole, not only the gates.',
          ja: 'Blackは左側をさらに強化しました。ここからはGateだけでなく、盤面全体のPosition数を見ます。',
        },
      },
      postQuestion: {
        question: {
          en: 'Who is in a winning position now?',
          ja: 'この局面で勝勢なのはどちらですか？',
        },
        options: [
          { en: 'Black is clearly ahead.', ja: 'Blackが明確に優勢' },
          { en: 'White is clearly ahead.', ja: 'Whiteが明確に優勢' },
          { en: 'The game is still even.', ja: 'まだ互角' },
        ],
        correctOptionIndex: 0,
        hint: {
          en: 'Count the owned Positions, not the asset values on the gates.',
          ja: 'Gate上のAsset価値ではなく、所有しているPositionの数を数えてください。',
        },
        explanation: {
          en: 'Black controls far more Positions. Gate values decide capture, but the final result is about Position ownership.',
          ja: 'BlackはPosition数で大きく先行しています。Gate支配値はCaptureを決めますが、最終的な勝敗ではPosition所有数が重要になります。',
        },
      },
    },

    // ── Move 22 — AUTO (White) + final text ──────────────────────────────
    {
      moveNumber: 22,
      learningPoint: 'final_auto_summary',
      autoText: {
        auto: {
          en: "White makes one final build, but the position count remains heavily in Black's favor.",
          ja: 'Whiteは最後にもう一手Buildしました。しかし、Position数ではBlackの優勢は大きく変わりません。',
        },
      },
      finalText: {
        en: 'This guided game ends before a full board exhaustion. The point is not to fill every slot, but to see how early builds create later captures and how Position ownership becomes the final measure.',
        ja: 'このTrainingは完全終局までは進めません。目的はすべてのSlotを埋めることではなく、序盤のBuildが後のCaptureを作り、最終的にPosition所有数が勝敗を決めることを理解することです。',
      },
    },
  ],
};
