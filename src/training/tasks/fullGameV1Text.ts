import type { FullGameTrainingText } from '../types';

/**
 * Localized text data for FULL_GAME_V1 (full-game-v1).
 * 61ステップ（moveNumber 0〜60）のテキスト定義。
 * 「ポケット」禁止、「スロット」使用。
 */
export const FULL_GAME_V1_TEXT: FullGameTrainingText = {
  courseId: 'full-game-v1',

  meta: {
    title: {
      en: 'ONE EIGHT Guided Game — Think as Black',
      ja: 'ONE EIGHT 一局指南 — Blackとして考える',
    },
    description: {
      en: 'Play through one guided game as Black. Experience Massive Build, Selective Build, Quad Build, Capture, defense, and endgame judgment.',
      ja: 'Black視点で、1局の流れを通して学びます。Massive Build・Selective Build・Quad Build・Capture・防衛・終盤の判断を体験してください。',
    },
    finalSummary: {
      en: 'You have completed a full game of ONE EIGHT. Remember to use Build up to prepare, to defend, and to capture when the Gate control values meet the required conditions.',
      ja: 'ONE EIGHTの一局を完走しました。準備するBuild、防ぐBuild、そしてGate支配値が条件を満たした時のCaptureを意識してください。',
    },
  },

  steps: [
    // ── moveNumber 0 (M0) intro ────────────────────────────────────────────
    {
      moveNumber: 0,
      learningPoint: 'intro',
      introText: {
        en: 'A turn is completed by selecting a Position and then performing a Build up.\n\nSelect one of the 13 Positions in the center of the board, then Build up Assets at the Gates accessible from that Position.\nOnce the Build up is complete, the turn passes to your opponent.\n\nLet\'s try it.',
        ja: '対局は基本的に、Positionの選択 と Build up によって一手が完了します。\n\n盤面中央の13個のPositionから1つを選択し、そのPositionからアクセス可能なGateにAssetをBuild upします。\nBuild upが完了すると、相手のターンに移ります。\n\nまずは実際にやってみましょう。',
      },
    },

    // ── moveNumber 1 (M1-1) select_only ───────────────────────────────────
    {
      moveNumber: 1,
      learningPoint: 'position_select',
      userText: {
        situation: {
          en: 'The game proceeds with Black going first and White going second.\nIt is currently Black\'s turn.\nPositions are arranged A through M from left to right, top to bottom.',
          ja: '対局は、黒が先攻、白が後攻として進行します。\n現在は黒の手番です。\nPositionは左から右、上から下の順にA〜Mと並んでいます。',
        },
        question: {
          en: 'First, tap Position D to select it.',
          ja: 'まず、Position Dをタップして選択してください。',
        },
        hint: {
          en: 'Tap Position D on the board.',
          ja: '盤面上のPosition Dをタップしてください。',
        },
        success: {
          en: 'When Position D is selected, the Gates that can be built up from that Position are highlighted in blue.',
          ja: 'Position Dが選択されると、そのPositionからBuild upできるGateが青くハイライトされます。',
        },
      },
    },

    // ── moveNumber 2 (M1-2) select_only ───────────────────────────────────
    {
      moveNumber: 2,
      learningPoint: 'position_select',
      userText: {
        situation: {
          en: 'The Gates diagonally connected to a selected Position are called the Diagonal Gates of that Position.\nThe blue-highlighted Diagonal Gates are available for Build up from that Position.',
          ja: '選択したPositionの対角線上にあるGateを、そのPositionのDiagonal Gateと呼びます。\n青くハイライトされているDiagonal Gateが、そのPositionからBuild upできるGateです。',
        },
        question: {
          en: 'Tap Position D again to deselect it, then select Position G.',
          ja: 'Position Dをもう一度タップして選択を解除し、次にPosition Gを選択してください。',
        },
        hint: {
          en: 'Tap Position G.',
          ja: 'Position Gをタップしてください。',
        },
        success: {
          en: 'The Gates available for Build up differ by Position.\nBy reselecting a Position, the Gates available for Build up change as well.',
          ja: 'Positionごとに、Build upできるGateは異なります。\nPositionを選び直すことで、Build upできるGateも変わります。',
        },
      },
    },

    // ── moveNumber 3 (M1-3) user ──────────────────────────────────────────
    {
      moveNumber: 3,
      learningPoint: 'massive_build',
      userText: {
        situation: {
          en: 'Build up is performed by placing Assets in the Large Slot, Middle Slot, or Small Slot of a Diagonal Gate.\nDepending on the size of the Slot you select, there are three types of Build up:\nMassive Build\nSelective Build\nQuad Build\nThis time, perform a Massive Build on Gate 4.\nIf there are multiple Slots of the same size, you can tap either one.',
          ja: 'Build upは、Diagonal GateにあるLarge Slot・Middle Slot・Small SlotにAssetを設置することで行います。\n選択するSlotのサイズによって、Build upには次の3種類があります。\nMassive Build\nSelective Build\nQuad Build\n今回は、Gate 4に対して Massive Build を実行します。\n同じサイズのSlotであれば、どちらをタップしても問題ありません。',
        },
        question: {
          en: 'Tap the largest Slot at Gate 4 to place an Asset.',
          ja: 'Gate 4の一番大きなSlotをタップして、Assetを設置してください。',
        },
        hint: {
          en: 'Tap the Large Slot (the largest Slot) at Gate 4.',
          ja: 'Gate 4のLarge Slot（一番大きなSlot）をタップしてください。',
        },
        success: {
          en: 'With Massive Build, you place an Asset in the Large Slot of one Gate.\nLarge Assets hold great value in later Position control.',
          ja: 'Massive Buildでは、1つのGateのLarge SlotにLarge Assetを設置します。\nLarge Assetは、後のPosition支配で非常に大きな価値を持ちます。',
        },
      },
    },

    // ── moveNumber 4 (M2) auto ────────────────────────────────────────────
    {
      moveNumber: 4,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position J and performed a Massive Build on Gate 7.\n\nThe pieces placed through Build up are called Assets. The direction of an Asset\'s arrow indicates which player placed it.\n\nAn Asset pointing toward you was placed by you.',
          ja: '後攻の白は、Position Jを選択し、Gate 7にMassive Buildを実行しました。\n\nBuild upによって置かれたコマを Asset と呼びます。Assetは、矢印の向きによって、どちらのプレイヤーによるBuild upかを示しています。\n\n自分の方を向いているAssetが、自分のBuild upによるAssetです。',
        },
      },
    },

    // ── moveNumber 5 (M3) user ────────────────────────────────────────────
    {
      moveNumber: 5,
      learningPoint: 'selective_build',
      userText: {
        situation: {
          en: 'With Selective Build, you place Assets in the Middle Slots of two different Gates.\nYou cannot place Assets in both Middle Slots of the same Gate in one Selective Build.',
          ja: 'Selective Buildでは、異なる2つのGateのMiddle Slotに、それぞれAssetを設置します。\n同じGateにある2つのMiddle Slotへ、1回のSelective BuildでAssetを置くことはできません。',
        },
        question: {
          en: 'Select Position K and perform a Selective Build on Gate 4 and Gate 10.',
          ja: 'Position Kを選択し、Gate 4とGate 10に Selective Build を実行しましょう。',
        },
        hint: {
          en: 'Tap Position K, then tap the Middle Slot of Gate 4, then the Middle Slot of Gate 10.',
          ja: 'Position Kをタップし、Gate 4のMiddle Slot、次にGate 10のMiddle Slotをタップしてください。',
        },
        success: {
          en: 'Selective Build distributes Middle Assets across two Gates.\nIt has less influence on any single Gate than Massive Build, but it can affect multiple Gates at once.',
          ja: 'Selective Buildは、2つのGateにMiddle Assetを分散して置くBuild upです。\nMassive Buildほど一点の影響は大きくありませんが、複数のGateに同時に影響を与えられます。',
        },
      },
    },

    // ── moveNumber 6 (M4) auto ────────────────────────────────────────────
    {
      moveNumber: 6,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position E and performed a Selective Build on Gate 6 and Gate 10.\n\nThe opponent\'s most recent move is highlighted in yellow.',
          ja: '白は、Position Eを選択し、Gate 6とGate 10にSelective Buildを実行しました。\n\n直前の相手の手は、黄色くハイライトされています。',
        },
      },
    },

    // ── moveNumber 7 (M5) user ────────────────────────────────────────────
    {
      moveNumber: 7,
      learningPoint: 'quad_build',
      userText: {
        situation: {
          en: 'With Quad Build, you place Assets in the Small Slots of all four Diagonal Gates accessible from that Position.',
          ja: 'Quad Buildでは、そのPositionから選択可能な4つのDiagonal Gateすべてに対して、Small SlotへSmall Assetを設置します。',
        },
        question: {
          en: 'Select Position B and perform a Quad Build.',
          ja: 'Position Bを選択し、Quad Build を実行しましょう。',
        },
        hint: {
          en: 'Tap Position B, then tap any Small Slot.',
          ja: 'Position Bをタップし、いずれかのSmall Slotをタップしてください。',
        },
        success: {
          en: 'Quad Build is a Build up that places Assets broadly across four Gates.\nWhile the value of each Asset is small, it can simultaneously affect multiple Gates.',
          ja: 'Quad Buildは、4つのGateへ広くAssetを置くBuild upです。\n1つずつのAsset価値は小さいですが、多くのGateに同時に影響を与えられます。',
        },
      },
    },

    // ── moveNumber 8 (M6) auto ────────────────────────────────────────────
    {
      moveNumber: 8,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position D and performed a Massive Build on Gate 7.\n\nThis Build up filled the Large Slot of Gate 7.',
          ja: '白はPosition Dを選択し、Gate 7にMassive Buildを実行しました。\n\nこのBuild upにより、Gate 7のLarge Slotが埋まりました。',
        },
      },
    },

    // ── moveNumber 9 (M7) user ────────────────────────────────────────────
    {
      moveNumber: 9,
      learningPoint: 'selective_build',
      userText: {
        situation: {
          en: 'Like Gate 6 and Gate 10, both Black and White can Build up on the same Gate.\nOne Gate consists of the following Slots:\nLarge Slots: 2\nMedium Slots: 2\nSmall Slots: 4',
          ja: 'Gate 6やGate 10のように、1つのGateに対して、黒と白の両方がBuild upすることができます。\n1つのGateは、次のSlotで構成されています。\nLarge Slot：2つ\nMiddle Slot：2つ\nSmall Slot：4つ',
        },
        question: {
          en: 'Select Position I and perform a Selective Build on Gate 8 and Gate 12.',
          ja: 'Position Iを選択し、Gate 8とGate 12にSelective Buildを実行しましょう。',
        },
        hint: {
          en: 'Tap Position I, then tap the Middle Slot of Gate 8, then the Middle Slot of Gate 12.',
          ja: 'Position Iをタップし、Gate 8のMiddle Slot、次にGate 12のMiddle Slotをタップしてください。',
        },
        success: {
          en: 'When both Black and White Assets are placed on the same Gate, a contest arises over who controls that Gate.\nWhich player is dominant at that Gate is determined by the value of the Assets placed.',
          ja: '同じGateに黒と白のAssetが置かれることで、そのGateの支配をめぐる争いが生まれます。\nどちらがそのGateで優勢かは、置かれたAssetの価値によって決まります。',
        },
      },
    },

    // ── moveNumber 10 (M8) auto ───────────────────────────────────────────
    {
      moveNumber: 10,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position L and performed a Quad Build.\n\nThe game ends once every Slot at every Gate has been filled through alternating turns.\n\nAt the end of the game, the player holding more Positions is the winner.',
          ja: '白はPosition Lを選択し、Quad Buildを実行しました。\n\nお互いに手を進め、すべてのGateのすべてのSlotが埋まった時点で終局となります。\n\n終局時に、より多くのPositionを保持しているプレイヤーが勝者です。',
        },
      },
    },

    // ── moveNumber 11 (M9) user ───────────────────────────────────────────
    {
      moveNumber: 11,
      learningPoint: 'selective_build',
      userText: {
        situation: { en: '', ja: '' },
        question: {
          en: 'Select Position C and perform a Selective Build on Gate 3 and Gate 4.',
          ja: 'Position Cを選択し、Gate 3とGate 4にSelective Buildを実行しましょう。',
        },
        hint: {
          en: 'Tap Position C, then tap the Middle Slot of Gate 3, then the Middle Slot of Gate 4.',
          ja: 'Position Cをタップし、Gate 3のMiddle Slot、次にGate 4のMiddle Slotをタップしてください。',
        },
        success: {
          en: 'Using Selective Build allows you to simultaneously affect Gates related to multiple Positions.',
          ja: 'Selective Buildを使うことで、複数のPositionに関係するGateへ同時に影響を与えられます。',
        },
      },
    },

    // ── moveNumber 12 (M10) auto ──────────────────────────────────────────
    {
      moveNumber: 12,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position F and performed a Quad Build.',
          ja: '白はPosition Fを選択し、Quad Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 13 (M11) user ──────────────────────────────────────────
    {
      moveNumber: 13,
      learningPoint: 'massive_build',
      userText: {
        situation: { en: '', ja: '' },
        question: {
          en: 'Select Position A and perform a Massive Build on Gate 1.',
          ja: 'Position Aを選択し、Gate 1にMassive Buildを実行しましょう。',
        },
        hint: {
          en: 'Tap Position A, then tap the Large Slot of Gate 1.',
          ja: 'Position Aをタップし、Gate 1のLarge Slotをタップしてください。',
        },
        success: {
          en: 'Massive Build is effective when you want to strongly control a specific Gate.',
          ja: 'Massive Buildは、特定のGateを強く支配したいときに有効です。',
        },
      },
    },

    // ── moveNumber 14 (M12) auto ──────────────────────────────────────────
    {
      moveNumber: 14,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position H and performed a Massive Build on Gate 5.',
          ja: '白はPosition Hを選択し、Gate 5にMassive Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 15 (M13) user ──────────────────────────────────────────
    {
      moveNumber: 15,
      learningPoint: 'revisit_position',
      userText: {
        situation: {
          en: 'The only remaining open Position is Position M.\nYou can select not only open Positions, but also Positions you already occupy.',
          ja: '空いているPositionは、残りPosition Mだけとなりました。\nPositionの選択は、空いているPositionだけでなく、自分がすでに占有しているPositionに対しても実行できます。',
        },
        question: {
          en: 'Select Position G and perform a Massive Build on Gate 1.',
          ja: 'Position Gを選択し、Gate 1にMassive Buildを実行しましょう。',
        },
        hint: {
          en: 'Tap Position G, then tap the Large Slot of Gate 1.',
          ja: 'Position Gをタップし、Gate 1のLarge Slotをタップしてください。',
        },
        success: {
          en: 'You can select and Build up from a Position you already occupy.\nBuilding further on an existing Position allows you to prepare for defense or capture.',
          ja: '一度占有したPositionも、再び選択してBuild upできます。\n既存のPositionからさらにBuild upすることで、防衛や奪取の準備ができます。',
        },
      },
    },

    // ── moveNumber 16 (M14) auto ──────────────────────────────────────────
    {
      moveNumber: 16,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position M and performed a Selective Build on Gate 7 and Gate 8.',
          ja: '白はPosition Mを選択し、Gate 7とGate 8にSelective Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 17 (M15-1) select_only ─────────────────────────────────
    {
      moveNumber: 17,
      learningPoint: 'gate_check',
      userText: {
        situation: { en: '', ja: '' },
        question: {
          en: 'First, select Position G.',
          ja: 'まず、Position Gを選択してください。',
        },
        hint: {
          en: 'Tap Position G.',
          ja: 'Position Gをタップしてください。',
        },
        success: {
          en: 'Selecting Position G lets you check the Diagonal Gates of Position G.',
          ja: 'Position Gを選択すると、Position GのDiagonal Gateが確認できます。',
        },
      },
    },

    // ── moveNumber 18 (M15-3) user ────────────────────────────────────────
    {
      moveNumber: 18,
      learningPoint: 'selective_build',
      userText: {
        situation: {
          en: 'Let\'s check the Build up status of Position G\'s four Diagonal Gates.\nThe current state is as follows:\nGate 1: 2 Large Assets\nGate 4: 1 Large Asset, 2 Middle Assets\nGate 7: 2 Large Assets, 1 Middle Asset\nGate 10: 2 Middle Assets',
          ja: 'Position Gの4つのDiagonal GateのBuild up状況を確認しましょう。\n現在は次のようになっています。\nGate 1：Large Assetが2つ\nGate 4：Large Assetが1つ、Middle Assetが2つ\nGate 7：Large Assetが2つ、Middle Assetが1つ\nGate 10：Middle Assetが2つ',
        },
        question: {
          en: 'Next, select Position A and perform a Selective Build on Gate 1 and Gate 2.',
          ja: '次にPosition Aを選択し、Gate 1とGate 2にSelective Buildを実行してください。',
        },
        hint: {
          en: 'Tap Position A, then tap the Middle Slot of Gate 1, then the Middle Slot of Gate 2.',
          ja: 'Position Aをタップし、Gate 1のMiddle Slot、次にGate 2のMiddle Slotをタップしてください。',
        },
        success: {
          en: 'Control over a Position is determined by the Build up status of its Diagonal Gates.\nIt is important to identify which Gate has received the most Build up.',
          ja: 'Positionをめぐる支配は、そのPositionのDiagonal GateのBuild up状況によって決まります。\nどのGateが最もBuild upされているかを見ることが重要です。',
        },
      },
    },

    // ── moveNumber 19 (M16) auto ──────────────────────────────────────────
    {
      moveNumber: 19,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position J and performed a Selective Build on Gate 5 and Gate 7.',
          ja: '白はPosition Jを選択し、Gate 5とGate 7にSelective Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 20 (M17-1) select_only ─────────────────────────────────
    {
      moveNumber: 20,
      learningPoint: 'asset_value',
      userText: {
        situation: {
          en: 'Build up on Gate 1 and Gate 4 has progressed since earlier.',
          ja: '先ほどより、Gate 1とGate 4のBuild upが進んでいます。',
        },
        question: {
          en: 'Select Position G.',
          ja: 'Position Gを選択してください。',
        },
        hint: {
          en: 'Tap Position G.',
          ja: 'Position Gをタップしてください。',
        },
        success: {
          en: 'Even for the same Position, the control situation changes as more Assets are placed on its Diagonal Gates.',
          ja: '同じPositionでも、Diagonal GateにAssetが増えることで、支配状況は変化していきます。',
        },
      },
    },

    // ── moveNumber 21 (M17-3) user ────────────────────────────────────────
    {
      moveNumber: 21,
      learningPoint: 'selective_build',
      userText: {
        situation: {
          en: 'Even all available Small and Middle Assets combined are worth less than one Large Asset.\nFour Small Assets are also worth less than one Middle Asset.\nOf Position G\'s four Diagonal Gates, Gate 7 has received the most Build up.',
          ja: 'Small AssetやMiddle Assetをどれだけ重ねても、Large Asset1つの価値には届きません。\nまた、Small Assetを4つ重ねても、Middle Asset1つの価値には届きません。\n現在、Position Gの4つのDiagonal Gateの中では、Gate 7が最もBuild upの進んだGateです。',
        },
        question: {
          en: 'With Position A selected, perform a Selective Build on Gate 1 and Gate 2.',
          ja: 'Position Aを選択したまま、Gate 1とGate 2にSelective Buildを実行してください。',
        },
        hint: {
          en: 'Tap Position A, then tap the Middle Slot of Gate 1, then the Middle Slot of Gate 2.',
          ja: 'Position Aをタップし、Gate 1のMiddle Slot、次にGate 2のMiddle Slotをタップしてください。',
        },
        success: {
          en: 'The same Gate can affect the control judgment of multiple Positions.\nIt is important to identify Gates that are significant for multiple Positions.',
          ja: '同じGateが複数のPositionの支配判定に影響することがあります。\nどのPositionにも関係する重要なGateを見極めることが大切です。',
        },
      },
    },

    // ── moveNumber 22 (M18) auto ──────────────────────────────────────────
    {
      moveNumber: 22,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position L and performed a Massive Build on Gate 9.',
          ja: '白はPosition Lを選択し、Gate 9にMassive Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 23 (M19) user ──────────────────────────────────────────
    {
      moveNumber: 23,
      learningPoint: 'selective_build',
      userText: {
        situation: { en: '', ja: '' },
        question: {
          en: 'Select Position B and perform a Selective Build on Gate 3 and Gate 11.',
          ja: 'Position Bを選択し、Gate 3とGate 11にSelective Buildを実行してください。',
        },
        hint: {
          en: 'Tap Position B, then tap the Middle Slot of Gate 3, then the Middle Slot of Gate 11.',
          ja: 'Position Bをタップし、Gate 3のMiddle Slot、次にGate 11のMiddle Slotをタップしてください。',
        },
        success: {
          en: 'Selective Build can be used with both future attack and defense in mind.',
          ja: 'Selective Buildは、将来の攻撃と防衛の両方を見据えて使うことができます。',
        },
      },
    },

    // ── moveNumber 24 (M20) auto ──────────────────────────────────────────
    {
      moveNumber: 24,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position F and performed a Massive Build on Gate 8.',
          ja: '白はPosition Fを選択し、Gate 8にMassive Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 25 (M21-1) select_only ─────────────────────────────────
    {
      moveNumber: 25,
      learningPoint: 'capture',
      userText: {
        situation: {
          en: 'There are cases when you can capture an opponent\'s Position.\nCheck the Gate with the most Build up among the Diagonal Gates of the target Position.\nIf your Build up is dominant over the opponent\'s at that Gate, you can capture the opponent\'s Position.\nRight now, there is one White Position that can be captured.',
          ja: '相手のPositionを奪取できる場合があります。\n対象PositionのDiagonal Gateのうち、最もBuild upが進んでいるGateを確認します。\nそのGateにおいて、自分のBuild upが相手より優勢であれば、相手のPositionを奪取できます。\n現在、白のPositionから1つ奪取できるPositionがあります。',
        },
        question: {
          en: 'Select that Position.',
          ja: 'そのPositionを選択してください。',
        },
        hint: {
          en: 'Tap Position E.',
          ja: 'Position Eをタップしてください。',
        },
        success: {
          en: 'Capturing a Position is different from simply selecting an open Position.\nEven a Position occupied by the opponent can be captured as your own if the conditions are met.',
          ja: 'Positionの奪取は、単に空いているPositionを選ぶのとは異なります。\n相手が占有しているPositionでも、条件を満たせば自分のPositionとして奪取できます。',
        },
      },
    },

    // ── moveNumber 26 (M21-2) user ────────────────────────────────────────
    {
      moveNumber: 26,
      learningPoint: 'capture',
      userText: {
        situation: { en: '', ja: '' },
        question: {
          en: 'With Position E selected, perform a Massive Build on Gate 10.',
          ja: 'Position Eを選択したまま、Gate 10にMassive Buildを実行してください。',
        },
        hint: {
          en: 'Tap the Large Slot of Gate 10.',
          ja: 'Gate 10のLarge Slotをタップしてください。',
        },
        success: {
          en: 'By Building up from a captured Position, you can advance both attack and deployment at the same time.',
          ja: '奪取したPositionからBuild upを行うことで、攻撃と展開を同時に進めることができます。',
        },
      },
    },

    // ── moveNumber 27 (M22) auto ──────────────────────────────────────────
    {
      moveNumber: 27,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position F and performed a Massive Build on Gate 11.',
          ja: '白はPosition Fを選択し、Gate 11にMassive Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 28 (M23-1) select_only ─────────────────────────────────
    {
      moveNumber: 28,
      learningPoint: 'defense',
      userText: {
        situation: {
          en: 'At Position A, Gate 1 and Gate 7 have received equal amounts of Build up, tying for the most among its Diagonal Gates.\nWhen multiple Diagonal Gates tie for the most Build up, compare how many of those Gates each player controls.\nAt Position A, Black controls Gate 1 and White controls Gate 7.\nTherefore, White cannot capture Position A.\nBlack is successfully defending Position A.',
          ja: 'Position Aでは、Gate 1とGate 7が同じ数だけBuild upされており、どちらも最もBuild upが進んだDiagonal Gateです。\n最もBuild upが進んでいるDiagonal Gateが複数ある場合は、それらのGateの中で、相手より多くのGateを支配しているかを比較します。\nPosition Aでは、Gate 1は黒が支配し、Gate 7は白が支配しています。\nそのため、白はPosition Aを奪取できません。\n黒はPosition Aを適切に防衛できています。',
        },
        question: {
          en: 'First, select Position A.',
          ja: 'まず、Position Aを選択してください。',
        },
        hint: {
          en: 'Tap Position A.',
          ja: 'Position Aをタップしてください。',
        },
        success: {
          en: 'When there are multiple Gates with the most Build up, the number of Gates controlled becomes important.\nIf they are equal, the capture does not succeed.',
          ja: '最もBuild upが進んだDiagonal Gateが複数ある場合、支配しているGateの数が重要になります。\n同数であれば、奪取は成立しません。',
        },
      },
    },

    // ── moveNumber 29 (M23-2) select_only ─────────────────────────────────
    {
      moveNumber: 29,
      learningPoint: 'defense',
      userText: {
        situation: {
          en: 'Among Position B\'s Diagonal Gates, Gate 11 is the Gate with the most Build up.\nOne Large Asset is worth more than two Middle Assets.\nCurrently, White controls Gate 11.\nIf left as is, there is a risk that White will capture Position B on the next turn.',
          ja: 'Position BのDiagonal Gateでは、Gate 11が最もBuild upの進んだGateです。\nLarge Asset1つは、Middle Asset2つよりも価値があります。\nそして現在、Gate 11は白が支配しています。\nこのままでは、次の白手番でPosition Bを奪われる可能性があります。',
        },
        question: {
          en: 'Deselect Position A and select Position B.',
          ja: 'Position Aの選択を解除し、Position Bを選択してください。',
        },
        hint: {
          en: 'Tap Position B.',
          ja: 'Position Bをタップしてください。',
        },
        success: {
          en: 'Finding the Position that the opponent can capture next is the first step in defense.\nWhen you find a Position in danger, you need to Build up to break the opponent\'s control.',
          ja: '相手が次に奪取できるPositionを見つけることは、防衛の第一歩です。\n危険なPositionを見つけたら、相手の支配を崩すBuild upが必要です。',
        },
      },
    },

    // ── moveNumber 30 (M23-3) user ────────────────────────────────────────
    {
      moveNumber: 30,
      learningPoint: 'defense',
      userText: {
        situation: { en: '', ja: '' },
        question: {
          en: 'With Position B selected, perform a Massive Build on Gate 11.',
          ja: 'Position Bを選択したまま、Gate 11にMassive Buildを実行しましょう。',
        },
        hint: {
          en: 'Tap the Large Slot of Gate 11.',
          ja: 'Gate 11のLarge Slotをタップしてください。',
        },
        success: {
          en: 'By performing a Massive Build on Gate 11, Black has regained control of Gate 11.\nThis prevents White from capturing Position B.',
          ja: 'Gate 11にMassive Buildを行うことで、黒はGate 11の支配を取り戻しました。\nこれにより、白によるPosition Bの奪取を防ぐことができます。',
        },
      },
    },

    // ── moveNumber 31 (M24) auto ──────────────────────────────────────────
    {
      moveNumber: 31,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'Since Black regained control of Gate 11 with a Massive Build, White could not capture Position B.\n\nWhite selected Position L and performed a Quad Build.',
          ja: '先ほどGate 11にMassive Buildを実行して支配を取り戻したため、白はPosition Bを奪取できませんでした。\n\n白はPosition Lを選択し、Quad Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 32 (M25-1) select_only ─────────────────────────────────
    {
      moveNumber: 32,
      learningPoint: 'capture',
      userText: {
        situation: {
          en: 'Using the advantage at Gate 11, you can capture one of White\'s Positions.',
          ja: 'Gate 11の優位性を活かして、白のPositionを1つ奪取できます。',
        },
        question: {
          en: 'Select the White Position that can be captured.',
          ja: '奪取できる白のPositionを選択してください。',
        },
        hint: {
          en: 'Tap Position F.',
          ja: 'Position Fをタップしてください。',
        },
        success: {
          en: 'The Build up used for defense can lead to the next attack.\nThis is because Gate control affects multiple Positions.',
          ja: '防衛に使ったBuild upが、次の攻撃につながることがあります。\nGateの支配は、複数のPositionに影響するためです。',
        },
      },
    },

    // ── moveNumber 33 (M25-2) user ────────────────────────────────────────
    {
      moveNumber: 33,
      learningPoint: 'capture',
      userText: {
        situation: { en: '', ja: '' },
        question: {
          en: 'Perform a Selective Build on Gate 11 and Gate 12 to further strengthen Gate 11.',
          ja: 'Gate 11とGate 12にSelective Buildを実行し、さらにGate 11を強化しましょう。',
        },
        hint: {
          en: 'Tap the Middle Slot of Gate 11, then the Middle Slot of Gate 12.',
          ja: 'Gate 11のMiddle Slot、次にGate 12のMiddle Slotをタップしてください。',
        },
        success: {
          en: 'Further strengthening the Diagonal Gates after a capture makes it easier to protect the captured Position.',
          ja: '奪取後にさらにDiagonal Gateを強化することで、奪ったPositionを守りやすくなります。',
        },
      },
    },

    // ── moveNumber 34 (M26) auto ──────────────────────────────────────────
    {
      moveNumber: 34,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position M and performed a Quad Build.',
          ja: '白はPosition Mを選択し、Quad Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 35 (M27-1) select_only ─────────────────────────────────
    {
      moveNumber: 35,
      learningPoint: 'defense',
      userText: {
        situation: {
          en: 'If left as is, Position I will be captured by White on the next turn.\nEven if Black performs a Massive Build on Gate 8, Black cannot become dominant.\nAt Gate 8, White has built up 1 Large Asset, 1 Middle Asset, and 4 Small Assets.\nEven if Black performs a Massive Build there, Black would have 1 Large Asset, 1 Middle Asset, and 0 Small Assets.\nThe difference in Small Assets means Black cannot overturn White\'s dominance.',
          ja: 'このままだと、次の白手番でPosition Iは奪われてしまいます。\nGate 8にMassive Buildをしても、黒は優勢になれません。\nGate 8では、白がLarge Asset1つ、Middle Asset1つ、Small Asset4つをBuild upしています。\nここに黒がMassive Buildをしても、黒はLarge Asset1つ、Middle Asset1つ、Small Asset0個の状態です。\nSmall Assetの差によって、白の優勢を覆すことはできません。',
        },
        question: {
          en: 'Select Position I.',
          ja: 'Position Iを選択してください。',
        },
        hint: {
          en: 'Tap Position I.',
          ja: 'Position Iをタップしてください。',
        },
        success: {
          en: 'Placing a Large Asset does not always guarantee you will take control.\nThe difference in already-placed Middle and Small Assets may prevent the control from being overturned.',
          ja: 'Large Assetを置けば必ず支配を取れるわけではありません。\n既に置かれているMiddle AssetやSmall Assetの差によって、支配が覆らない場合があります。',
        },
      },
    },

    // ── moveNumber 36 (M27-2) user ────────────────────────────────────────
    {
      moveNumber: 36,
      learningPoint: 'defense',
      userText: {
        situation: { en: '', ja: '' },
        question: {
          en: 'To temporarily defend Position I, perform a Massive Build on Gate 4.',
          ja: 'Position Iを一時的に防衛するため、Gate 4にMassive Buildを実行しましょう。',
        },
        hint: {
          en: 'Tap the Large Slot of Gate 4.',
          ja: 'Gate 4のLarge Slotをタップしてください。',
        },
        success: {
          en: 'When you cannot reverse control of one Gate directly, strengthening another Diagonal Gate may temporarily protect the Position.',
          ja: '直接逆転できないGateではなく、別のDiagonal Gateを強化することで、一時的にPositionを守れる場合があります。',
        },
      },
    },

    // ── moveNumber 37 (M28) auto ──────────────────────────────────────────
    {
      moveNumber: 37,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position L and performed a Massive Build on Gate 8.\n\nWhen determining which Gate has received the most Build up, it does not matter which player placed the Assets.\nAdd both players\' Build up together.\n\nPosition I\'s Diagonal Gates are Gate 4, Gate 8, Gate 10, and Gate 12.\nCurrently, the most built-up Gate among these is Gate 8.\n\nThis situation cannot be overturned in one move.',
          ja: '白はPosition Lを選択し、Gate 8にMassive Buildを実行しました。\n\n最もBuild upが進んだGateを判定するときには、それが自分のBuild upか相手のBuild upかは問いません。\n両者のBuild upを合計して判定します。\n\nPosition IのDiagonal Gateは、Gate 4、Gate 8、Gate 10、Gate 12です。\n現在、この中で最もBuild upが進んでいるGateはGate 8です。\n\nこの状況は、次の一手では覆りません。',
        },
      },
    },

    // ── moveNumber 38 (M29) user ──────────────────────────────────────────
    {
      moveNumber: 38,
      learningPoint: 'capture_quad',
      userText: {
        situation: { en: '', ja: '' },
        question: {
          en: 'Capture Position D and perform a Quad Build.',
          ja: 'Position Dを奪取し、Quad Buildを実行してください。',
        },
        hint: {
          en: 'Tap Position D, then tap any Small Slot.',
          ja: 'Position Dをタップし、いずれかのSmall Slotをタップしてください。',
        },
        success: {
          en: 'By selecting a capturable Position and performing a Quad Build from there, you can broadly influence the entire board.',
          ja: '奪取可能なPositionを選び、そこからQuad Buildすることで、盤面全体へ広く影響を与えられます。',
        },
      },
    },

    // ── moveNumber 39 (M30) auto ──────────────────────────────────────────
    {
      moveNumber: 39,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position I and performed a Massive Build on Gate 10.',
          ja: '白はPosition Iを選択し、Gate 10にMassive Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 40 (M31) user ──────────────────────────────────────────
    {
      moveNumber: 40,
      learningPoint: 'quad_build',
      userText: {
        situation: {
          en: 'As the endgame approaches, fewer Slots remain open.\nKeep track of which Gates still have room for Build up.',
          ja: '終盤に近づくほど、空いているSlotは少なくなっていきます。\nどのGateにまだBuild upできるかを確認しながら進めることが重要です。',
        },
        question: {
          en: 'Select Position A and perform a Quad Build.',
          ja: 'Position Aを選択し、Quad Buildを実行してください。',
        },
        hint: {
          en: 'Tap Position A, then tap any Small Slot.',
          ja: 'Position Aをタップし、いずれかのSmall Slotをタップしてください。',
        },
        success: {
          en: '',
          ja: '',
        },
      },
    },

    // ── moveNumber 41 (M32) auto ──────────────────────────────────────────
    {
      moveNumber: 41,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position H and performed a Selective Build on Gate 5 and Gate 6.',
          ja: '白はPosition Hを選択し、Gate 5とGate 6にSelective Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 42 (M33) user ──────────────────────────────────────────
    {
      moveNumber: 42,
      learningPoint: 'quad_build',
      userText: {
        situation: { en: '', ja: '' },
        question: {
          en: 'Select Position G and perform a Quad Build.',
          ja: 'Position Gを選択し、Quad Buildを実行してください。',
        },
        hint: {
          en: 'Tap Position G, then tap any Small Slot.',
          ja: 'Position Gをタップし、いずれかのSmall Slotをタップしてください。',
        },
        success: {
          en: 'By spreading Assets across the remaining Small Slots, Quad Build can affect narrow margins of control in the endgame.',
          ja: 'Quad Buildは、残っているSmall Slotへ広くAssetを置くことで、終盤の細かな支配差に影響します。',
        },
      },
    },

    // ── moveNumber 43 (M34) auto ──────────────────────────────────────────
    {
      moveNumber: 43,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position H and performed a Massive Build on Gate 5.',
          ja: '白はPosition Hを選択し、Gate 5にMassive Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 44 (M35) user ──────────────────────────────────────────
    {
      moveNumber: 44,
      learningPoint: 'quad_build',
      userText: {
        situation: { en: '', ja: '' },
        question: {
          en: 'Select Position K and perform a Quad Build.',
          ja: 'Position Kを選択し、Quad Buildを実行してください。',
        },
        hint: {
          en: 'Tap Position K, then tap any Small Slot.',
          ja: 'Position Kをタップし、いずれかのSmall Slotをタップしてください。',
        },
        success: {
          en: 'Continuing to select your own Positions and Build up allows you to expand control and strengthen defense.',
          ja: '自分のPositionを選択してBuild upを続けることで、支配を広げたり、防衛を固めたりできます。',
        },
      },
    },

    // ── moveNumber 45 (M36) auto ──────────────────────────────────────────
    {
      moveNumber: 45,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position M and performed a Massive Build on Gate 6.',
          ja: '白はPosition Mを選択し、Gate 6にMassive Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 46 (M37) user ──────────────────────────────────────────
    {
      moveNumber: 46,
      learningPoint: 'partial_quad',
      userText: {
        situation: {
          en: 'Gate 11 no longer has any Slots available for Small Assets.\nTherefore, you can perform a Quad Build by building up Small Assets on Gate 4, Gate 9, and Gate 10.\nWith Selective Build and Quad Build, if some target Slots are full, the Build up is performed only where space remains.',
          ja: 'Gate 11には、もうSmall Assetを置けるSlotがありません。\nそのため、Gate 4、Gate 9、Gate 10にSmall AssetをBuild upすれば、Quad Buildを実行できます。\nSelective BuildとQuad Buildでは、対象となるSlotに空きがない場合、可能な範囲だけをBuild upすることがあります。',
        },
        question: {
          en: 'Select Position K and perform a Quad Build.',
          ja: 'Position Kを選択し、Quad Buildを実行してください。',
        },
        hint: {
          en: 'Tap Position K, then tap any Small Slot.',
          ja: 'Position Kをタップし、いずれかのSmall Slotをタップしてください。',
        },
        success: {
          en: 'Even when you cannot place Assets on all target Gates, you can Build up on Gates that still have open Slots.\nThis kind of partial Build up naturally occurs in the endgame.',
          ja: '対象GateのすべてにAssetを置けない場合でも、空きSlotがあるGateにはBuild upできます。\n終盤では、このような部分的なBuild upが自然に発生します。',
        },
      },
    },

    // ── moveNumber 47 (M38) auto ──────────────────────────────────────────
    {
      moveNumber: 47,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position H and performed a Massive Build on Gate 6.',
          ja: '白はPosition Hを選択し、Gate 6にMassive Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 48 (M39) user ──────────────────────────────────────────
    {
      moveNumber: 48,
      learningPoint: 'prepare_capture',
      userText: {
        situation: {
          en: 'Now, among Position I\'s Diagonal Gates (Gate 4, Gate 8, Gate 10, Gate 12), the three Gates with the most Build up are Gate 4, Gate 8, and Gate 10.\nFurthermore, Black can establish dominance at Gate 4 and Gate 10.\nTherefore, Black will be able to recapture Position I on its next turn because it will control more of the tied Gates.',
          ja: 'これで、Position IのDiagonal GateであるGate 4、Gate 8、Gate 10、Gate 12のうち、最もBuild upが進んだGateは、Gate 4、Gate 8、Gate 10の3つになります。\nさらに、Gate 4とGate 10では黒が支配的な状況を作ることができます。\nそのため、次の黒手番では、支配しているGateの数の差によってPosition Iを奪取できます。',
        },
        question: {
          en: 'Select Position C and perform a Build up to set up the recapture of Position I on the next Black turn.',
          ja: 'Position Cを選択し、次の黒手番でPosition Iを奪還するためのBuild upを実行してください。',
        },
        hint: {
          en: 'Tap Position C, then tap any Small Slot.',
          ja: 'Position Cをタップし、いずれかのSmall Slotをタップしてください。',
        },
        success: {
          en: 'Even if a Position cannot be captured immediately, preparing one move in advance can create the conditions needed to capture it on your next turn.\nIn ONE EIGHT, this kind of preparatory Build up is important.',
          ja: 'すぐに奪取できないPositionでも、1手前に準備することで、次のターンに奪取可能な形を作れます。\nONE EIGHTでは、このような準備のBuild upが重要です。',
        },
      },
    },

    // ── moveNumber 49 (M40) auto ──────────────────────────────────────────
    {
      moveNumber: 49,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position H and performed a Quad Build.',
          ja: '白はPosition Hを選択し、Quad Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 50 (M41) user ──────────────────────────────────────────
    {
      moveNumber: 50,
      learningPoint: 'capture_massive',
      userText: {
        situation: { en: '', ja: '' },
        question: {
          en: 'Select Position I and perform a Massive Build on Gate 12.',
          ja: 'Position Iを選択し、Gate 12にMassive Buildを実行してください。',
        },
        hint: {
          en: 'Tap Position I, then tap the Large Slot of Gate 12.',
          ja: 'Position Iをタップし、Gate 12のLarge Slotをタップしてください。',
        },
        success: {
          en: 'The control you prepared allows you to recapture Position I.\nContinuing to Build up after the capture can increase the number of Positions you control in the endgame.',
          ja: '準備した支配状況を活かして、Position Iを奪還します。\n奪取後もBuild upを続けることで、終盤のPosition数を伸ばすことができます。',
        },
      },
    },

    // ── moveNumber 51 (M42) auto ──────────────────────────────────────────
    {
      moveNumber: 51,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position H and performed a Massive Build on Gate 2.',
          ja: '白はPosition Hを選択し、Gate 2にMassive Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 52 (M43) user ──────────────────────────────────────────
    {
      moveNumber: 52,
      learningPoint: 'massive_build',
      userText: {
        situation: {
          en: 'In the endgame, which player takes the remaining Large Slots has a significant impact.',
          ja: '終盤では、残っているLarge Slotをどちらが取るかが大きく影響します。',
        },
        question: {
          en: 'Select Position F and perform a Massive Build on Gate 12.',
          ja: 'Position Fを選択し、Gate 12にMassive Buildを実行してください。',
        },
        hint: {
          en: 'Tap Position F, then tap the Large Slot of Gate 12.',
          ja: 'Position Fをタップし、Gate 12のLarge Slotをタップしてください。',
        },
        success: {
          en: '',
          ja: '',
        },
      },
    },

    // ── moveNumber 53 (M44) auto ──────────────────────────────────────────
    {
      moveNumber: 53,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position L and performed a Massive Build on Gate 9.',
          ja: '白はPosition Lを選択し、Gate 9にMassive Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 54 (M45) user ──────────────────────────────────────────
    {
      moveNumber: 54,
      learningPoint: 'massive_build',
      userText: {
        situation: {
          en: 'As the game nears its end, fewer Gates remain available for Build up.\nIt is important to make sure you secure the remaining Large Slots.',
          ja: '終局が近づくと、Build up可能なGateは限られていきます。\n残っているLarge Slotを確実に押さえることが重要です。',
        },
        question: {
          en: 'Select Position C and perform a Massive Build on Gate 3.',
          ja: 'Position Cを選択し、Gate 3にMassive Buildを実行してください。',
        },
        hint: {
          en: 'Tap Position C, then tap the Large Slot of Gate 3.',
          ja: 'Position Cをタップし、Gate 3のLarge Slotをタップしてください。',
        },
        success: {
          en: '',
          ja: '',
        },
      },
    },

    // ── moveNumber 55 (M46) auto ──────────────────────────────────────────
    {
      moveNumber: 55,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position J and performed a Selective Build on Gate 9.',
          ja: '白はPosition Jを選択し、Gate 9にSelective Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 56 (M47) user ──────────────────────────────────────────
    {
      moveNumber: 56,
      learningPoint: 'massive_build',
      userText: {
        situation: {
          en: 'In the endgame, identify Gates your opponent can no longer reach while filling the remaining Slots at Gates you can still access.',
          ja: '終盤では、相手がBuild upできないGateを見極めながら、自分が届くGateを埋めていきます。',
        },
        question: {
          en: 'Select Position E and perform a Massive Build on Gate 2.',
          ja: 'Position Eを選択し、Gate 2にMassive Buildを実行してください。',
        },
        hint: {
          en: 'Tap Position E, then tap the Large Slot of Gate 2.',
          ja: 'Position Eをタップし、Gate 2のLarge Slotをタップしてください。',
        },
        success: {
          en: '',
          ja: '',
        },
      },
    },

    // ── moveNumber 57 (M48) auto ──────────────────────────────────────────
    {
      moveNumber: 57,
      learningPoint: 'auto',
      autoText: {
        auto: {
          en: 'White selected Position J and performed a Selective Build on Gate 9.',
          ja: '白はPosition Jを選択し、Gate 9にSelective Buildを実行しました。',
        },
      },
    },

    // ── moveNumber 58 (M49) user ──────────────────────────────────────────
    {
      moveNumber: 58,
      learningPoint: 'quad_build',
      userText: {
        situation: {
          en: 'Filling in remaining Small Slots brings the game closer to its end.',
          ja: '残っているSmall Slotを埋めることで、終局へ近づいていきます。',
        },
        question: {
          en: 'Select Position B and perform a Quad Build.',
          ja: 'Position Bを選択し、Quad Buildを実行してください。',
        },
        hint: {
          en: 'Tap Position B, then tap any Small Slot.',
          ja: 'Position Bをタップし、いずれかのSmall Slotをタップしてください。',
        },
        success: {
          en: '',
          ja: '',
        },
      },
    },

    // ── moveNumber 59 (M50) pass ──────────────────────────────────────────
    {
      moveNumber: 59,
      learningPoint: 'auto_pass',
      autoText: {
        auto: {
          en: 'White had no legal Build up available, so White\'s turn ended automatically.',
          ja: '白はBuild up可能な手がないため、自動でターンエンドしました。',
        },
      },
    },

    // ── moveNumber 60 (M51) user + finalText ──────────────────────────────
    {
      moveNumber: 60,
      learningPoint: 'endgame',
      userText: {
        situation: {
          en: 'White cannot access the final open Large Slot at Gate 3 from any Position it controls.\nTherefore, White\'s turn ended automatically.',
          ja: '最後に残ったGate 3のLarge Slotには、白のPositionからBuild upすることができません。\nそのため、白手番は自動でターンエンドしました。',
        },
        question: {
          en: 'Select Position C and perform a Massive Build on Gate 3.',
          ja: 'Position Cを選択し、Gate 3にMassive Buildを実行してください。',
        },
        hint: {
          en: 'Tap Position C, then tap the Large Slot of Gate 3.',
          ja: 'Position Cをタップし、Gate 3のLarge Slotをタップしてください。',
        },
        success: {
          en: 'All remaining Build up is now complete, and the game ends.\n\nIn ONE EIGHT, the game ends once every Slot at every Gate is filled.\nThe player who controls more Positions at that point wins.',
          ja: 'これですべてのBuild upが完了し、終局となります。\n\nONE EIGHTでは、すべてのGateのすべてのSlotが埋まった時点で対局が終了します。\n最後に、より多くのPositionを保持しているプレイヤーが勝者です。',
        },
      },
      finalText: {
        en: 'All Slots are filled, and the game is over.\n\nWell done. Over the course of a full game of ONE EIGHT, you experienced Massive Build, Selective Build, Quad Build, Capture, defense, and endgame decision-making.',
        ja: 'すべてのSlotが埋まり、終局となりました。\n\nお疲れさまでした。ONE EIGHTの一局を通して、Massive Build・Selective Build・Quad Build・Capture・防衛・終盤の判断を体験しました。',
      },
    },
  ],
};
