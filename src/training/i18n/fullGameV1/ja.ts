import type { FGTrainingText } from './types';

/**
 * Japanese — extracted verbatim from fullGameV1Text.ts (ja fields).
 * DO NOT modify text content here; fix the source in fullGameV1Text.ts first.
 */
export const FULL_GAME_V1_JA: FGTrainingText = {
  courseId: 'full-game-v1',

  meta: {
    title: 'ONE EIGHT 一局指南 — Blackとして考える',
    description: 'Black視点で、1局の流れを通して学びます。Massive Build・Selective Build・Quad Build・Capture・防衛・終盤の判断を体験してください。',
    finalSummary: 'ONE EIGHTの一局を完走しました。準備するBuild、防ぐBuild、そしてGate支配値が条件を満たした時のCaptureを意識してください。',
  },

  steps: [
    // moveNumber 0 (M0) intro
    {
      moveNumber: 0,
      learningPoint: 'intro',
      introText: '対局は基本的に、Positionの選択 と Build up によって一手が完了します。\n\n盤面中央の13個のPositionから1つを選択し、そのPositionからアクセス可能なGateにAssetをBuild upします。\nBuild upが完了すると、相手のターンに移ります。\n\nまずは実際にやってみましょう。',
    },

    // moveNumber 1 (M1-1) select_only
    {
      moveNumber: 1,
      learningPoint: 'position_select',
      userText: {
        situation: '対局は、黒が先攻、白が後攻として進行します。\n現在は黒の手番です。\nPositionは左から右、上から下の順にA〜Mと並んでいます。',
        question: 'まず、Position Dをタップして選択してください。',
        hint: '盤面上のPosition Dをタップしてください。',
        success: 'Position Dが選択されると、そのPositionからBuild upできるGateが青くハイライトされます。',
      },
    },

    // moveNumber 2 (M1-2) select_only
    {
      moveNumber: 2,
      learningPoint: 'position_select',
      userText: {
        situation: '選択したPositionの対角線上にあるGateを、そのPositionのDiagonal Gateと呼びます。\n青くハイライトされているDiagonal Gateが、そのPositionからBuild upできるGateです。',
        question: 'Position Dをもう一度タップして選択を解除し、次にPosition Gを選択してください。',
        hint: 'Position Gをタップしてください。',
        success: 'Positionごとに、Build upできるGateは異なります。\nPositionを選び直すことで、Build upできるGateも変わります。',
      },
    },

    // moveNumber 3 (M1-3) user
    {
      moveNumber: 3,
      learningPoint: 'massive_build',
      userText: {
        situation: 'Build upは、Diagonal GateにあるLarge Slot・Middle Slot・Small SlotにAssetを設置することで行います。\n選択するSlotのサイズによって、Build upには次の3種類があります。\nMassive Build\nSelective Build\nQuad Build\n今回は、Gate 4に対して Massive Build を実行します。\n同じサイズのSlotであれば、どちらをタップしても問題ありません。',
        question: 'Gate 4の一番大きなSlotをタップして、Assetを設置してください。',
        hint: 'Gate 4のLarge Slot（一番大きなSlot）をタップしてください。',
        success: 'Massive Buildでは、1つのGateのLarge SlotにLarge Assetを設置します。\nLarge Assetは、後のPosition支配で非常に大きな価値を持ちます。',
      },
    },

    // moveNumber 4 (M2) auto
    {
      moveNumber: 4,
      learningPoint: 'auto',
      autoText: {
        auto: '後攻の白は、Position Jを選択し、Gate 7にMassive Buildを実行しました。\n\nBuild upによって置かれたコマを Asset と呼びます。Assetは、矢印の向きによって、どちらのプレイヤーによるBuild upかを示しています。\n\n自分の方を向いているAssetが、自分のBuild upによるAssetです。',
      },
    },

    // moveNumber 5 (M3) user
    {
      moveNumber: 5,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Selective Buildでは、異なる2つのGateのMiddle Slotに、それぞれAssetを設置します。\n同じGateにある2つのMiddle Slotへ、1回のSelective BuildでAssetを置くことはできません。',
        question: 'Position Kを選択し、Gate 4とGate 10に Selective Build を実行しましょう。',
        hint: 'Position Kをタップし、Gate 4のMiddle Slot、次にGate 10のMiddle Slotをタップしてください。',
        success: 'Selective Buildは、2つのGateにMiddle Assetを分散して置くBuild upです。\nMassive Buildほど一点の影響は大きくありませんが、複数のGateに同時に影響を与えられます。',
      },
    },

    // moveNumber 6 (M4) auto
    {
      moveNumber: 6,
      learningPoint: 'auto',
      autoText: {
        auto: '白は、Position Eを選択し、Gate 6とGate 10にSelective Buildを実行しました。\n\n直前の相手の手は、黄色くハイライトされています。',
      },
    },

    // moveNumber 7 (M5) user
    {
      moveNumber: 7,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Quad Buildでは、そのPositionから選択可能な4つのDiagonal Gateすべてに対して、Small SlotへSmall Assetを設置します。',
        question: 'Position Bを選択し、Quad Build を実行しましょう。',
        hint: 'Position Bをタップし、いずれかのSmall Slotをタップしてください。',
        success: 'Quad Buildは、4つのGateへ広くAssetを置くBuild upです。\n1つずつのAsset価値は小さいですが、多くのGateに同時に影響を与えられます。',
      },
    },

    // moveNumber 8 (M6) auto
    {
      moveNumber: 8,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Dを選択し、Gate 7にMassive Buildを実行しました。\n\nこのBuild upにより、Gate 7のLarge Slotが埋まりました。',
      },
    },

    // moveNumber 9 (M7) user
    {
      moveNumber: 9,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Gate 6やGate 10のように、1つのGateに対して、黒と白の両方がBuild upすることができます。\n1つのGateは、次のSlotで構成されています。\nLarge Slot：2つ\nMiddle Slot：2つ\nSmall Slot：4つ',
        question: 'Position Iを選択し、Gate 8とGate 12にSelective Buildを実行しましょう。',
        hint: 'Position Iをタップし、Gate 8のMiddle Slot、次にGate 12のMiddle Slotをタップしてください。',
        success: '同じGateに黒と白のAssetが置かれることで、そのGateの支配をめぐる争いが生まれます。\nどちらがそのGateで優勢かは、置かれたAssetの価値によって決まります。',
      },
    },

    // moveNumber 10 (M8) auto
    {
      moveNumber: 10,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Lを選択し、Quad Buildを実行しました。\n\nお互いに手を進め、すべてのGateのすべてのSlotが埋まった時点で終局となります。\n\n終局時に、より多くのPositionを保持しているプレイヤーが勝者です。',
      },
    },

    // moveNumber 11 (M9) user
    {
      moveNumber: 11,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Position Cを選択し、Gate 3とGate 4にSelective Buildを実行しましょう。',
        hint: 'Position Cをタップし、Gate 3のMiddle Slot、次にGate 4のMiddle Slotをタップしてください。',
        success: 'Selective Buildを使うことで、複数のPositionに関係するGateへ同時に影響を与えられます。',
      },
    },

    // moveNumber 12 (M10) auto
    {
      moveNumber: 12,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Fを選択し、Quad Buildを実行しました。',
      },
    },

    // moveNumber 13 (M11) user
    {
      moveNumber: 13,
      learningPoint: 'massive_build',
      userText: {
        situation: '',
        question: 'Position Aを選択し、Gate 1にMassive Buildを実行しましょう。',
        hint: 'Position Aをタップし、Gate 1のLarge Slotをタップしてください。',
        success: 'Massive Buildは、特定のGateを強く支配したいときに有効です。',
      },
    },

    // moveNumber 14 (M12) auto
    {
      moveNumber: 14,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Hを選択し、Gate 5にMassive Buildを実行しました。',
      },
    },

    // moveNumber 15 (M13) user
    {
      moveNumber: 15,
      learningPoint: 'revisit_position',
      userText: {
        situation: '空いているPositionは、残りPosition Mだけとなりました。\nPositionの選択は、空いているPositionだけでなく、自分がすでに占有しているPositionに対しても実行できます。',
        question: 'Position Gを選択し、Gate 1にMassive Buildを実行しましょう。',
        hint: 'Position Gをタップし、Gate 1のLarge Slotをタップしてください。',
        success: '一度占有したPositionも、再び選択してBuild upできます。\n既存のPositionからさらにBuild upすることで、防衛や奪取の準備ができます。',
      },
    },

    // moveNumber 16 (M14) auto
    {
      moveNumber: 16,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Mを選択し、Gate 7とGate 8にSelective Buildを実行しました。',
      },
    },

    // moveNumber 17 (M15-1) select_only
    {
      moveNumber: 17,
      learningPoint: 'gate_check',
      userText: {
        situation: '',
        question: 'まず、Position Gを選択してください。',
        hint: 'Position Gをタップしてください。',
        success: 'Position Gを選択すると、Position GのDiagonal Gateが確認できます。',
      },
    },

    // moveNumber 18 (M15-3) user
    {
      moveNumber: 18,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Position Gの4つのDiagonal GateのBuild up状況を確認しましょう。\n現在は次のようになっています。\nGate 1：Large Assetが2つ\nGate 4：Large Assetが1つ、Middle Assetが2つ\nGate 7：Large Assetが2つ、Middle Assetが1つ\nGate 10：Middle Assetが2つ',
        question: '次にPosition Aを選択し、Gate 1とGate 2にSelective Buildを実行してください。',
        hint: 'Position Aをタップし、Gate 1のMiddle Slot、次にGate 2のMiddle Slotをタップしてください。',
        success: 'Positionをめぐる支配は、そのPositionのDiagonal GateのBuild up状況によって決まります。\nどのGateが最もBuild upされているかを見ることが重要です。',
      },
    },

    // moveNumber 19 (M16) auto
    {
      moveNumber: 19,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Jを選択し、Gate 5とGate 7にSelective Buildを実行しました。',
      },
    },

    // moveNumber 20 (M17-1) select_only
    {
      moveNumber: 20,
      learningPoint: 'asset_value',
      userText: {
        situation: '先ほどより、Gate 1とGate 4のBuild upが進んでいます。',
        question: 'Position Gを選択してください。',
        hint: 'Position Gをタップしてください。',
        success: '同じPositionでも、Diagonal GateにAssetが増えることで、支配状況は変化していきます。',
      },
    },

    // moveNumber 21 (M17-3) user
    {
      moveNumber: 21,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Small AssetやMiddle Assetをどれだけ重ねても、Large Asset1つの価値には届きません。\nまた、Small Assetを4つ重ねても、Middle Asset1つの価値には届きません。\n現在、Position Gの4つのDiagonal Gateの中では、Gate 7が最もBuild upの進んだGateです。',
        question: 'Position Aを選択したまま、Gate 1とGate 2にSelective Buildを実行してください。',
        hint: 'Position Aをタップし、Gate 1のMiddle Slot、次にGate 2のMiddle Slotをタップしてください。',
        success: '同じGateが複数のPositionの支配判定に影響することがあります。\nどのPositionにも関係する重要なGateを見極めることが大切です。',
      },
    },

    // moveNumber 22 (M18) auto
    {
      moveNumber: 22,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Lを選択し、Gate 9にMassive Buildを実行しました。',
      },
    },

    // moveNumber 23 (M19) user
    {
      moveNumber: 23,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Position Bを選択し、Gate 3とGate 11にSelective Buildを実行してください。',
        hint: 'Position Bをタップし、Gate 3のMiddle Slot、次にGate 11のMiddle Slotをタップしてください。',
        success: 'Selective Buildは、将来の攻撃と防衛の両方を見据えて使うことができます。',
      },
    },

    // moveNumber 24 (M20) auto
    {
      moveNumber: 24,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Fを選択し、Gate 8にMassive Buildを実行しました。',
      },
    },

    // moveNumber 25 (M21-1) select_only
    {
      moveNumber: 25,
      learningPoint: 'capture',
      userText: {
        situation: '相手のPositionを奪取できる場合があります。\n対象PositionのDiagonal Gateのうち、最もBuild upが進んでいるGateを確認します。\nそのGateにおいて、自分のBuild upが相手より優勢であれば、相手のPositionを奪取できます。\n現在、白のPositionから1つ奪取できるPositionがあります。',
        question: 'そのPositionを選択してください。',
        hint: 'Position Eをタップしてください。',
        success: 'Positionの奪取は、単に空いているPositionを選ぶのとは異なります。\n相手が占有しているPositionでも、条件を満たせば自分のPositionとして奪取できます。',
      },
    },

    // moveNumber 26 (M21-2) user
    {
      moveNumber: 26,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Position Eを選択したまま、Gate 10にMassive Buildを実行してください。',
        hint: 'Gate 10のLarge Slotをタップしてください。',
        success: '奪取したPositionからBuild upを行うことで、攻撃と展開を同時に進めることができます。',
      },
    },

    // moveNumber 27 (M22) auto
    {
      moveNumber: 27,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Fを選択し、Gate 11にMassive Buildを実行しました。',
      },
    },

    // moveNumber 28 (M23-1) select_only
    {
      moveNumber: 28,
      learningPoint: 'defense',
      userText: {
        situation: 'Position Aでは、Gate 1とGate 7が同じ数だけBuild upされており、どちらも最もBuild upが進んだDiagonal Gateです。\n最もBuild upが進んでいるDiagonal Gateが複数ある場合は、それらのGateの中で、相手より多くのGateを支配しているかを比較します。\nPosition Aでは、Gate 1は黒が支配し、Gate 7は白が支配しています。\nそのため、白はPosition Aを奪取できません。\n黒はPosition Aを適切に防衛できています。',
        question: 'まず、Position Aを選択してください。',
        hint: 'Position Aをタップしてください。',
        success: '最もBuild upが進んだDiagonal Gateが複数ある場合、支配しているGateの数が重要になります。\n同数であれば、奪取は成立しません。',
      },
    },

    // moveNumber 29 (M23-2) select_only
    {
      moveNumber: 29,
      learningPoint: 'defense',
      userText: {
        situation: 'Position BのDiagonal Gateでは、Gate 11が最もBuild upの進んだGateです。\nLarge Asset1つは、Middle Asset2つよりも価値があります。\nそして現在、Gate 11は白が支配しています。\nこのままでは、次の白手番でPosition Bを奪われる可能性があります。',
        question: 'Position Aの選択を解除し、Position Bを選択してください。',
        hint: 'Position Bをタップしてください。',
        success: '相手が次に奪取できるPositionを見つけることは、防衛の第一歩です。\n危険なPositionを見つけたら、相手の支配を崩すBuild upが必要です。',
      },
    },

    // moveNumber 30 (M23-3) user
    {
      moveNumber: 30,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'Position Bを選択したまま、Gate 11にMassive Buildを実行しましょう。',
        hint: 'Gate 11のLarge Slotをタップしてください。',
        success: 'Gate 11にMassive Buildを行うことで、黒はGate 11の支配を取り戻しました。\nこれにより、白によるPosition Bの奪取を防ぐことができます。',
      },
    },

    // moveNumber 31 (M24) auto
    {
      moveNumber: 31,
      learningPoint: 'auto',
      autoText: {
        auto: '先ほどGate 11にMassive Buildを実行して支配を取り戻したため、白はPosition Bを奪取できませんでした。\n\n白はPosition Lを選択し、Quad Buildを実行しました。',
      },
    },

    // moveNumber 32 (M25-1) select_only
    {
      moveNumber: 32,
      learningPoint: 'capture',
      userText: {
        situation: 'Gate 11の優位性を活かして、白のPositionを1つ奪取できます。',
        question: '奪取できる白のPositionを選択してください。',
        hint: 'Position Fをタップしてください。',
        success: '防衛に使ったBuild upが、次の攻撃につながることがあります。\nGateの支配は、複数のPositionに影響するためです。',
      },
    },

    // moveNumber 33 (M25-2) user
    {
      moveNumber: 33,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Gate 11とGate 12にSelective Buildを実行し、さらにGate 11を強化しましょう。',
        hint: 'Gate 11のMiddle Slot、次にGate 12のMiddle Slotをタップしてください。',
        success: '奪取後にさらにDiagonal Gateを強化することで、奪ったPositionを守りやすくなります。',
      },
    },

    // moveNumber 34 (M26) auto
    {
      moveNumber: 34,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Mを選択し、Quad Buildを実行しました。',
      },
    },

    // moveNumber 35 (M27-1) select_only
    {
      moveNumber: 35,
      learningPoint: 'defense',
      userText: {
        situation: 'このままだと、次の白手番でPosition Iは奪われてしまいます。\nGate 8にMassive Buildをしても、黒は優勢になれません。\nGate 8では、白がLarge Asset1つ、Middle Asset1つ、Small Asset4つをBuild upしています。\nここに黒がMassive Buildをしても、黒はLarge Asset1つ、Middle Asset1つ、Small Asset0個の状態です。\nSmall Assetの差によって、白の優勢を覆すことはできません。',
        question: 'Position Iを選択してください。',
        hint: 'Position Iをタップしてください。',
        success: 'Large Assetを置けば必ず支配を取れるわけではありません。\n既に置かれているMiddle AssetやSmall Assetの差によって、支配が覆らない場合があります。',
      },
    },

    // moveNumber 36 (M27-2) user
    {
      moveNumber: 36,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'Position Iを一時的に防衛するため、Gate 4にMassive Buildを実行しましょう。',
        hint: 'Gate 4のLarge Slotをタップしてください。',
        success: '直接逆転できないGateではなく、別のDiagonal Gateを強化することで、一時的にPositionを守れる場合があります。',
      },
    },

    // moveNumber 37 (M28) auto
    {
      moveNumber: 37,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Lを選択し、Gate 8にMassive Buildを実行しました。\n\n最もBuild upが進んだGateを判定するときには、それが自分のBuild upか相手のBuild upかは問いません。\n両者のBuild upを合計して判定します。\n\nPosition IのDiagonal Gateは、Gate 4、Gate 8、Gate 10、Gate 12です。\n現在、この中で最もBuild upが進んでいるGateはGate 8です。\n\nこの状況は、次の一手では覆りません。',
      },
    },

    // moveNumber 38 (M29) user
    {
      moveNumber: 38,
      learningPoint: 'capture_quad',
      userText: {
        situation: '',
        question: 'Position Dを奪取し、Quad Buildを実行してください。',
        hint: 'Position Dをタップし、いずれかのSmall Slotをタップしてください。',
        success: '奪取可能なPositionを選び、そこからQuad Buildすることで、盤面全体へ広く影響を与えられます。',
      },
    },

    // moveNumber 39 (M30) auto
    {
      moveNumber: 39,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Iを選択し、Gate 10にMassive Buildを実行しました。',
      },
    },

    // moveNumber 40 (M31) user
    {
      moveNumber: 40,
      learningPoint: 'quad_build',
      userText: {
        situation: '終盤に近づくほど、空いているSlotは少なくなっていきます。\nどのGateにまだBuild upできるかを確認しながら進めることが重要です。',
        question: 'Position Aを選択し、Quad Buildを実行してください。',
        hint: 'Position Aをタップし、いずれかのSmall Slotをタップしてください。',
        success: '',
      },
    },

    // moveNumber 41 (M32) auto
    {
      moveNumber: 41,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Hを選択し、Gate 5とGate 6にSelective Buildを実行しました。',
      },
    },

    // moveNumber 42 (M33) user
    {
      moveNumber: 42,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Position Gを選択し、Quad Buildを実行してください。',
        hint: 'Position Gをタップし、いずれかのSmall Slotをタップしてください。',
        success: 'Quad Buildは、残っているSmall Slotへ広くAssetを置くことで、終盤の細かな支配差に影響します。',
      },
    },

    // moveNumber 43 (M34) auto
    {
      moveNumber: 43,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Hを選択し、Gate 5にMassive Buildを実行しました。',
      },
    },

    // moveNumber 44 (M35) user
    {
      moveNumber: 44,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Position Kを選択し、Quad Buildを実行してください。',
        hint: 'Position Kをタップし、いずれかのSmall Slotをタップしてください。',
        success: '自分のPositionを選択してBuild upを続けることで、支配を広げたり、防衛を固めたりできます。',
      },
    },

    // moveNumber 45 (M36) auto
    {
      moveNumber: 45,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Mを選択し、Gate 6にMassive Buildを実行しました。',
      },
    },

    // moveNumber 46 (M37) user
    {
      moveNumber: 46,
      learningPoint: 'partial_quad',
      userText: {
        situation: 'Gate 11には、もうSmall Assetを置けるSlotがありません。\nそのため、Gate 4、Gate 9、Gate 10にSmall AssetをBuild upすれば、Quad Buildを実行できます。\nSelective BuildとQuad Buildでは、対象となるSlotに空きがない場合、可能な範囲だけをBuild upすることがあります。',
        question: 'Position Kを選択し、Quad Buildを実行してください。',
        hint: 'Position Kをタップし、いずれかのSmall Slotをタップしてください。',
        success: '対象GateのすべてにAssetを置けない場合でも、空きSlotがあるGateにはBuild upできます。\n終盤では、このような部分的なBuild upが自然に発生します。',
      },
    },

    // moveNumber 47 (M38) auto
    {
      moveNumber: 47,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Hを選択し、Gate 6にMassive Buildを実行しました。',
      },
    },

    // moveNumber 48 (M39) user
    {
      moveNumber: 48,
      learningPoint: 'prepare_capture',
      userText: {
        situation: 'これで、Position IのDiagonal GateであるGate 4、Gate 8、Gate 10、Gate 12のうち、最もBuild upが進んだGateは、Gate 4、Gate 8、Gate 10の3つになります。\nさらに、Gate 4とGate 10では黒が支配的な状況を作ることができます。\nそのため、次の黒手番では、支配しているGateの数の差によってPosition Iを奪取できます。',
        question: 'Position Cを選択し、次の黒手番でPosition Iを奪還するためのBuild upを実行してください。',
        hint: 'Position Cをタップし、いずれかのSmall Slotをタップしてください。',
        success: 'すぐに奪取できないPositionでも、1手前に準備することで、次のターンに奪取可能な形を作れます。\nONE EIGHTでは、このような準備のBuild upが重要です。',
      },
    },

    // moveNumber 49 (M40) auto
    {
      moveNumber: 49,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Hを選択し、Quad Buildを実行しました。',
      },
    },

    // moveNumber 50 (M41) user
    {
      moveNumber: 50,
      learningPoint: 'capture_massive',
      userText: {
        situation: '',
        question: 'Position Iを選択し、Gate 12にMassive Buildを実行してください。',
        hint: 'Position Iをタップし、Gate 12のLarge Slotをタップしてください。',
        success: '準備した支配状況を活かして、Position Iを奪還します。\n奪取後もBuild upを続けることで、終盤のPosition数を伸ばすことができます。',
      },
    },

    // moveNumber 51 (M42) auto
    {
      moveNumber: 51,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Hを選択し、Gate 2にMassive Buildを実行しました。',
      },
    },

    // moveNumber 52 (M43) user
    {
      moveNumber: 52,
      learningPoint: 'massive_build',
      userText: {
        situation: '終盤では、残っているLarge Slotをどちらが取るかが大きく影響します。',
        question: 'Position Fを選択し、Gate 12にMassive Buildを実行してください。',
        hint: 'Position Fをタップし、Gate 12のLarge Slotをタップしてください。',
        success: '',
      },
    },

    // moveNumber 53 (M44) auto
    {
      moveNumber: 53,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Lを選択し、Gate 9にMassive Buildを実行しました。',
      },
    },

    // moveNumber 54 (M45) user
    {
      moveNumber: 54,
      learningPoint: 'massive_build',
      userText: {
        situation: '終局が近づくと、Build up可能なGateは限られていきます。\n残っているLarge Slotを確実に押さえることが重要です。',
        question: 'Position Cを選択し、Gate 3にMassive Buildを実行してください。',
        hint: 'Position Cをタップし、Gate 3のLarge Slotをタップしてください。',
        success: '',
      },
    },

    // moveNumber 55 (M46) auto
    {
      moveNumber: 55,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Jを選択し、Gate 9にSelective Buildを実行しました。',
      },
    },

    // moveNumber 56 (M47) user
    {
      moveNumber: 56,
      learningPoint: 'massive_build',
      userText: {
        situation: '終盤では、相手がBuild upできないGateを見極めながら、自分が届くGateを埋めていきます。',
        question: 'Position Eを選択し、Gate 2にMassive Buildを実行してください。',
        hint: 'Position Eをタップし、Gate 2のLarge Slotをタップしてください。',
        success: '',
      },
    },

    // moveNumber 57 (M48) auto
    {
      moveNumber: 57,
      learningPoint: 'auto',
      autoText: {
        auto: '白はPosition Jを選択し、Gate 9にSelective Buildを実行しました。',
      },
    },

    // moveNumber 58 (M49) user
    {
      moveNumber: 58,
      learningPoint: 'quad_build',
      userText: {
        situation: '残っているSmall Slotを埋めることで、終局へ近づいていきます。',
        question: 'Position Bを選択し、Quad Buildを実行してください。',
        hint: 'Position Bをタップし、いずれかのSmall Slotをタップしてください。',
        success: '',
      },
    },

    // moveNumber 59 (M50) pass
    {
      moveNumber: 59,
      learningPoint: 'auto_pass',
      autoText: {
        auto: '白はBuild up可能な手がないため、自動でターンエンドしました。',
      },
    },

    // moveNumber 60 (M51) user + finalText
    {
      moveNumber: 60,
      learningPoint: 'endgame',
      userText: {
        situation: '最後に残ったGate 3のLarge Slotには、白のPositionからBuild upすることができません。\nそのため、白手番は自動でターンエンドしました。',
        question: 'Position Cを選択し、Gate 3にMassive Buildを実行してください。',
        hint: 'Position Cをタップし、Gate 3のLarge Slotをタップしてください。',
        success: 'これですべてのBuild upが完了し、終局となります。\n\nONE EIGHTでは、すべてのGateのすべてのSlotが埋まった時点で対局が終了します。\n最後に、より多くのPositionを保持しているプレイヤーが勝者です。',
      },
      finalText: 'すべてのSlotが埋まり、終局となりました。\n\nお疲れさまでした。ONE EIGHTの一局を通して、Massive Build・Selective Build・Quad Build・Capture・防衛・終盤の判断を体験しました。',
    },
  ],
};
