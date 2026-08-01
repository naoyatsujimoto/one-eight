import type { FGTrainingText } from './types';

/**
 * Traditional Chinese (繁體中文) — translated from English canonical source.
 * GAME-specific terms kept in English: ONE EIGHT, Position, Gate, Diagonal Gate,
 * Build up, Asset, Slot, Large Slot, Middle Slot, Small Slot, Massive Build,
 * Selective Build, Quad Build, Capture, Black, White, Move, CPU, Pro, Ghost,
 * Postmortem, Official Arena.
 */
export const FULL_GAME_V1_ZH_HANT: FGTrainingText = {
  courseId: 'full-game-v1',

  meta: {
    title: 'ONE EIGHT 全局導引 — 以 Black 身份思考',
    description: '以 Black 視角進行一局完整的導引對局。體驗 Massive Build、Selective Build、Quad Build、Capture、防守與終局判斷。',
    finalSummary: '您已完成一局完整的 ONE EIGHT 對局。請記得：用 Build up 做準備、用 Build up 防守，以及在 Gate 控制值滿足條件時執行 Capture。',
  },

  steps: [
    {
      moveNumber: 0,
      learningPoint: 'intro',
      introText: '每一手棋由選擇 Position 和執行 Build up 兩個動作組成。\n\n從棋盤中央的 13 個 Position 中選擇一個，然後在該 Position 可連接的 Gate 上 Build up Asset。\nBuild up 完成後，輪到對手行棋。\n\n讓我們實際試試看。',
    },
    {
      moveNumber: 1,
      learningPoint: 'position_select',
      userText: {
        situation: '對局以 Black 先手、White 後手的方式進行。\n現在輪到 Black 行棋。\nPosition 從左到右、從上到下排列為 A 到 M。',
        question: '首先，點擊 Position D 來選擇它。',
        hint: '點擊棋盤上的 Position D。',
        success: '選擇 Position D 後，從該 Position 可以 Build up 的 Gate 會以藍色高亮顯示。',
      },
    },
    {
      moveNumber: 2,
      learningPoint: 'position_select',
      userText: {
        situation: '與選定 Position 對角線相連的 Gate，稱為該 Position 的 Diagonal Gate。\n藍色高亮顯示的 Diagonal Gate 是可以從該 Position 進行 Build up 的 Gate。',
        question: '再次點擊 Position D 取消選擇，然後選擇 Position G。',
        hint: '點擊 Position G。',
        success: '每個 Position 可 Build up 的 Gate 都不相同。\n重新選擇 Position 後，可 Build up 的 Gate 也會跟著改變。',
      },
    },
    {
      moveNumber: 3,
      learningPoint: 'massive_build',
      userText: {
        situation: 'Build up 是將 Asset 放入 Diagonal Gate 的 Large Slot、Middle Slot 或 Small Slot 來執行。\n根據所選 Slot 的大小，Build up 分為三種類型：\nMassive Build\nSelective Build\nQuad Build\n這次，請對 Gate 4 執行 Massive Build。\n如果有多個相同大小的 Slot，點擊任意一個即可。',
        question: '點擊 Gate 4 最大的 Slot 來放置 Asset。',
        hint: '點擊 Gate 4 的 Large Slot（最大的 Slot）。',
        success: 'Massive Build 是將 Asset 放入一個 Gate 的 Large Slot。\nLarge Asset 在後期的 Position 控制中具有極高的價值。',
      },
    },
    {
      moveNumber: 4,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position J，並對 Gate 7 執行了 Massive Build。\n\n透過 Build up 放置的棋子稱為 Asset。Asset 箭頭的方向表示是哪位玩家放置的。\n\n箭頭朝向自己的 Asset，就是自己的 Build up。',
      },
    },
    {
      moveNumber: 5,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Selective Build 是在兩個不同 Gate 的 Middle Slot 各放置一個 Asset。\n不能在同一個 Gate 的兩個 Middle Slot 上，用一次 Selective Build 放置 Asset。',
        question: '選擇 Position K，並對 Gate 4 和 Gate 10 執行 Selective Build。',
        hint: '點擊 Position K，然後點擊 Gate 4 的 Middle Slot，再點擊 Gate 10 的 Middle Slot。',
        success: 'Selective Build 是將 Middle Asset 分散到兩個 Gate 的 Build up。\n雖然對單一 Gate 的影響不如 Massive Build，但可以同時影響多個 Gate。',
      },
    },
    {
      moveNumber: 6,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position E，並對 Gate 6 和 Gate 10 執行了 Selective Build。\n\n對手最近一手棋會以黃色高亮顯示。',
      },
    },
    {
      moveNumber: 7,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Quad Build 是在該 Position 可連接的所有四個 Diagonal Gate 的 Small Slot 上各放置一個 Asset。',
        question: '選擇 Position B，並執行 Quad Build。',
        hint: '點擊 Position B，然後點擊任意 Small Slot。',
        success: 'Quad Build 是廣泛地在四個 Gate 上放置 Asset 的 Build up。\n雖然每個 Asset 的價值較小，但可以同時影響多個 Gate。',
      },
    },
    {
      moveNumber: 8,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position D，並對 Gate 7 執行了 Massive Build。\n\n這次 Build up 填滿了 Gate 7 的 Large Slot。',
      },
    },
    {
      moveNumber: 9,
      learningPoint: 'selective_build',
      userText: {
        situation: '就像 Gate 6 和 Gate 10 一樣，Black 和 White 都可以在同一個 Gate 上 Build up。\n一個 Gate 由以下 Slot 組成：\nLarge Slot：2 個\nMiddle Slot：2 個\nSmall Slot：4 個',
        question: '選擇 Position I，並對 Gate 8 和 Gate 12 執行 Selective Build。',
        hint: '點擊 Position I，然後點擊 Gate 8 的 Middle Slot，再點擊 Gate 12 的 Middle Slot。',
        success: '當 Black 和 White 的 Asset 都放在同一個 Gate 上時，就會產生爭奪該 Gate 控制權的競爭。\n哪位玩家在該 Gate 佔優勢，取決於放置的 Asset 的價值。',
      },
    },
    {
      moveNumber: 10,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position L，並執行了 Quad Build。\n\n雙方交替行棋，直到所有 Gate 的所有 Slot 都被填滿時，對局結束。\n\n對局結束時，持有更多 Position 的玩家獲勝。',
      },
    },
    {
      moveNumber: 11,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: '選擇 Position C，並對 Gate 3 和 Gate 4 執行 Selective Build。',
        hint: '點擊 Position C，然後點擊 Gate 3 的 Middle Slot，再點擊 Gate 4 的 Middle Slot。',
        success: '使用 Selective Build 可以同時影響與多個 Position 相關的 Gate。',
      },
    },
    {
      moveNumber: 12,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position F，並執行了 Quad Build。',
      },
    },
    {
      moveNumber: 13,
      learningPoint: 'massive_build',
      userText: {
        situation: '',
        question: '選擇 Position A，並對 Gate 1 執行 Massive Build。',
        hint: '點擊 Position A，然後點擊 Gate 1 的 Large Slot。',
        success: '當您想要強力控制特定 Gate 時，Massive Build 非常有效。',
      },
    },
    {
      moveNumber: 14,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position H，並對 Gate 5 執行了 Massive Build。',
      },
    },
    {
      moveNumber: 15,
      learningPoint: 'revisit_position',
      userText: {
        situation: '剩下的空 Position 只有 Position M 了。\n除了空 Position 之外，您也可以選擇自己已經佔據的 Position。',
        question: '選擇 Position G，並對 Gate 1 執行 Massive Build。',
        hint: '點擊 Position G，然後點擊 Gate 1 的 Large Slot。',
        success: '您可以選擇並從已佔據的 Position 進行 Build up。\n在現有 Position 上繼續 Build up，可以為防守或 Capture 做準備。',
      },
    },
    {
      moveNumber: 16,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position M，並對 Gate 7 和 Gate 8 執行了 Selective Build。',
      },
    },
    {
      moveNumber: 17,
      learningPoint: 'gate_check',
      userText: {
        situation: '',
        question: '首先，選擇 Position G。',
        hint: '點擊 Position G。',
        success: '選擇 Position G 後，您可以確認 Position G 的 Diagonal Gate。',
      },
    },
    {
      moveNumber: 18,
      learningPoint: 'selective_build',
      userText: {
        situation: '讓我們確認 Position G 四個 Diagonal Gate 的 Build up 狀況。\n目前狀況如下：\nGate 1：2 個 Large Asset\nGate 4：1 個 Large Asset、2 個 Middle Asset\nGate 7：2 個 Large Asset、1 個 Middle Asset\nGate 10：2 個 Middle Asset',
        question: '接下來，選擇 Position A，並對 Gate 1 和 Gate 2 執行 Selective Build。',
        hint: '點擊 Position A，然後點擊 Gate 1 的 Middle Slot，再點擊 Gate 2 的 Middle Slot。',
        success: 'Position 的控制取決於其 Diagonal Gate 的 Build up 狀況。\n識別哪個 Gate 受到最多 Build up 非常重要。',
      },
    },
    {
      moveNumber: 19,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position J，並對 Gate 5 和 Gate 7 執行了 Selective Build。',
      },
    },
    {
      moveNumber: 20,
      learningPoint: 'asset_value',
      userText: {
        situation: '與之前相比，Gate 1 和 Gate 4 的 Build up 有所進展。',
        question: '選擇 Position G。',
        hint: '點擊 Position G。',
        success: '即使是同一個 Position，隨著更多 Asset 放置在其 Diagonal Gate 上，控制狀況也會改變。',
      },
    },
    {
      moveNumber: 21,
      learningPoint: 'selective_build',
      userText: {
        situation: '即使把所有可用的 Small Asset 和 Middle Asset 加起來，也比不上一個 Large Asset 的價值。\n四個 Small Asset 也比不上一個 Middle Asset。\n在 Position G 的四個 Diagonal Gate 中，Gate 7 目前受到最多 Build up。',
        question: '保持 Position A 選中的狀態，對 Gate 1 和 Gate 2 執行 Selective Build。',
        hint: '點擊 Position A，然後點擊 Gate 1 的 Middle Slot，再點擊 Gate 2 的 Middle Slot。',
        success: '同一個 Gate 可能影響多個 Position 的控制判定。\n識別對多個 Position 都有重要意義的 Gate 至關重要。',
      },
    },
    {
      moveNumber: 22,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position L，並對 Gate 9 執行了 Massive Build。',
      },
    },
    {
      moveNumber: 23,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: '選擇 Position B，並對 Gate 3 和 Gate 11 執行 Selective Build。',
        hint: '點擊 Position B，然後點擊 Gate 3 的 Middle Slot，再點擊 Gate 11 的 Middle Slot。',
        success: 'Selective Build 可以兼顧未來的攻擊和防守。',
      },
    },
    {
      moveNumber: 24,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position F，並對 Gate 8 執行了 Massive Build。',
      },
    },
    {
      moveNumber: 25,
      learningPoint: 'capture',
      userText: {
        situation: '有時候您可以 Capture 對手的 Position。\n確認目標 Position 的 Diagonal Gate 中 Build up 最多的 Gate。\n如果您在該 Gate 的 Build up 優於對手，您就可以 Capture 對手的 Position。\n現在，有一個 White 的 Position 可以被 Capture。',
        question: '選擇那個 Position。',
        hint: '點擊 Position E。',
        success: 'Capture 一個 Position 與單純選擇空 Position 不同。\n只要條件滿足，即使是對手佔據的 Position 也可以 Capture 成自己的。',
      },
    },
    {
      moveNumber: 26,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: '保持 Position E 選中的狀態，對 Gate 10 執行 Massive Build。',
        hint: '點擊 Gate 10 的 Large Slot。',
        success: '從已 Capture 的 Position 進行 Build up，可以同時推進攻擊和部署。',
      },
    },
    {
      moveNumber: 27,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position F，並對 Gate 11 執行了 Massive Build。',
      },
    },
    {
      moveNumber: 28,
      learningPoint: 'defense',
      userText: {
        situation: '在 Position A，Gate 1 和 Gate 7 的 Build up 數量相同，並列為 Diagonal Gate 中 Build up 最多的。\n當多個 Diagonal Gate 並列為 Build up 最多時，要比較每位玩家控制了其中幾個 Gate。\n在 Position A，Black 控制 Gate 1，White 控制 Gate 7。\n因此，White 無法 Capture Position A。\nBlack 正在成功防守 Position A。',
        question: '首先，選擇 Position A。',
        hint: '點擊 Position A。',
        success: '當有多個 Build up 最多的 Gate 時，控制的 Gate 數量就變得重要了。\n如果數量相同，Capture 則無法成立。',
      },
    },
    {
      moveNumber: 29,
      learningPoint: 'defense',
      userText: {
        situation: '在 Position B 的 Diagonal Gate 中，Gate 11 是 Build up 最多的 Gate。\n一個 Large Asset 比兩個 Middle Asset 更有價值。\n目前，White 控制 Gate 11。\n如果就此不管，下一個 White 的回合可能會 Capture Position B。',
        question: '取消選擇 Position A，然後選擇 Position B。',
        hint: '點擊 Position B。',
        success: '找到對手下一步可以 Capture 的 Position 是防守的第一步。\n發現危險的 Position 後，需要用 Build up 來打破對手的控制。',
      },
    },
    {
      moveNumber: 30,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: '保持 Position B 選中的狀態，對 Gate 11 執行 Massive Build。',
        hint: '點擊 Gate 11 的 Large Slot。',
        success: '對 Gate 11 執行 Massive Build 後，Black 重新獲得了 Gate 11 的控制。\n這樣可以防止 White Capture Position B。',
      },
    },
    {
      moveNumber: 31,
      learningPoint: 'auto',
      autoText: {
        auto: '由於 Black 用 Massive Build 重新獲得了 Gate 11 的控制，White 無法 Capture Position B。\n\nWhite 選擇了 Position L，並執行了 Quad Build。',
      },
    },
    {
      moveNumber: 32,
      learningPoint: 'capture',
      userText: {
        situation: '利用 Gate 11 的優勢，您可以 Capture White 的一個 Position。',
        question: '選擇可以被 Capture 的 White Position。',
        hint: '點擊 Position F。',
        success: '用於防守的 Build up 可以帶來下一次攻擊的機會。\n這是因為 Gate 的控制會影響多個 Position。',
      },
    },
    {
      moveNumber: 33,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: '對 Gate 11 和 Gate 12 執行 Selective Build，進一步強化 Gate 11。',
        hint: '點擊 Gate 11 的 Middle Slot，然後點擊 Gate 12 的 Middle Slot。',
        success: 'Capture 後進一步強化 Diagonal Gate，可以更容易守住已 Capture 的 Position。',
      },
    },
    {
      moveNumber: 34,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position M，並執行了 Quad Build。',
      },
    },
    {
      moveNumber: 35,
      learningPoint: 'defense',
      userText: {
        situation: '如果就此不管，White 在下一個回合就會 Capture Position I。\n即使 Black 對 Gate 8 執行 Massive Build，Black 也無法佔優勢。\n在 Gate 8，White 已 Build up 了 1 個 Large Asset、1 個 Middle Asset 和 4 個 Small Asset。\n即使 Black 在那裡執行 Massive Build，Black 也只有 1 個 Large Asset、1 個 Middle Asset 和 0 個 Small Asset。\nSmall Asset 的差距使 Black 無法推翻 White 的優勢。',
        question: '選擇 Position I。',
        hint: '點擊 Position I。',
        success: '放置 Large Asset 並不總能保證您能取得控制。\n已放置的 Middle Asset 和 Small Asset 的差距，可能會阻止控制被推翻。',
      },
    },
    {
      moveNumber: 36,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: '為了暫時防守 Position I，對 Gate 4 執行 Massive Build。',
        hint: '點擊 Gate 4 的 Large Slot。',
        success: '當您無法直接推翻某個 Gate 的控制時，強化另一個 Diagonal Gate 可能暫時保護該 Position。',
      },
    },
    {
      moveNumber: 37,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position L，並對 Gate 8 執行了 Massive Build。\n\n判斷哪個 Gate Build up 最多時，不論是哪位玩家放置的 Asset 都不重要。\n將雙方的 Build up 加總後判斷。\n\nPosition I 的 Diagonal Gate 是 Gate 4、Gate 8、Gate 10 和 Gate 12。\n目前，其中 Build up 最多的 Gate 是 Gate 8。\n\n這種情況無法在一步棋內推翻。',
      },
    },
    {
      moveNumber: 38,
      learningPoint: 'capture_quad',
      userText: {
        situation: '',
        question: 'Capture Position D，並執行 Quad Build。',
        hint: '點擊 Position D，然後點擊任意 Small Slot。',
        success: '選擇可 Capture 的 Position 並從那裡執行 Quad Build，可以廣泛地影響整個棋盤。',
      },
    },
    {
      moveNumber: 39,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position I，並對 Gate 10 執行了 Massive Build。',
      },
    },
    {
      moveNumber: 40,
      learningPoint: 'quad_build',
      userText: {
        situation: '隨著終局臨近，剩餘的開放 Slot 越來越少。\n請注意哪些 Gate 仍有 Build up 的空間。',
        question: '選擇 Position A，並執行 Quad Build。',
        hint: '點擊 Position A，然後點擊任意 Small Slot。',
        success: '',
      },
    },
    {
      moveNumber: 41,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position H，並對 Gate 5 和 Gate 6 執行了 Selective Build。',
      },
    },
    {
      moveNumber: 42,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: '選擇 Position G，並執行 Quad Build。',
        hint: '點擊 Position G，然後點擊任意 Small Slot。',
        success: '透過在剩餘的 Small Slot 上廣泛放置 Asset，Quad Build 可以影響終局中細微的控制差距。',
      },
    },
    {
      moveNumber: 43,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position H，並對 Gate 5 執行了 Massive Build。',
      },
    },
    {
      moveNumber: 44,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: '選擇 Position K，並執行 Quad Build。',
        hint: '點擊 Position K，然後點擊任意 Small Slot。',
        success: '持續選擇自己的 Position 並 Build up，可以擴大控制範圍並鞏固防守。',
      },
    },
    {
      moveNumber: 45,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position M，並對 Gate 6 執行了 Massive Build。',
      },
    },
    {
      moveNumber: 46,
      learningPoint: 'partial_quad',
      userText: {
        situation: 'Gate 11 已沒有可放置 Small Asset 的 Slot 了。\n因此，您可以在 Gate 4、Gate 9 和 Gate 10 上 Build up Small Asset 來執行 Quad Build。\n在 Selective Build 和 Quad Build 中，如果目標 Slot 已滿，則只在有空間的地方執行 Build up。',
        question: '選擇 Position K，並執行 Quad Build。',
        hint: '點擊 Position K，然後點擊任意 Small Slot。',
        success: '即使無法在所有目標 Gate 上放置 Asset，也可以在仍有開放 Slot 的 Gate 上 Build up。\n這種部分 Build up 在終局中自然會發生。',
      },
    },
    {
      moveNumber: 47,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position H，並對 Gate 6 執行了 Massive Build。',
      },
    },
    {
      moveNumber: 48,
      learningPoint: 'prepare_capture',
      userText: {
        situation: '現在，在 Position I 的 Diagonal Gate（Gate 4、Gate 8、Gate 10、Gate 12）中，Build up 最多的三個 Gate 是 Gate 4、Gate 8 和 Gate 10。\n此外，Black 可以在 Gate 4 和 Gate 10 建立優勢。\n因此，Black 在下一個回合將能夠重新 Capture Position I，因為它控制了更多並列的 Gate。',
        question: '選擇 Position C，並執行 Build up，為 Black 下一個回合重新 Capture Position I 做準備。',
        hint: '點擊 Position C，然後點擊任意 Small Slot。',
        success: '即使無法立即 Capture 一個 Position，提前一步做準備可以在下一個回合創造 Capture 所需的條件。\n在 ONE EIGHT 中，這種準備性的 Build up 非常重要。',
      },
    },
    {
      moveNumber: 49,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position H，並執行了 Quad Build。',
      },
    },
    {
      moveNumber: 50,
      learningPoint: 'capture_massive',
      userText: {
        situation: '',
        question: '選擇 Position I，並對 Gate 12 執行 Massive Build。',
        hint: '點擊 Position I，然後點擊 Gate 12 的 Large Slot。',
        success: '您準備的控制條件使您能夠重新 Capture Position I。\nCapture 後繼續 Build up 可以在終局增加您控制的 Position 數量。',
      },
    },
    {
      moveNumber: 51,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position H，並對 Gate 2 執行了 Massive Build。',
      },
    },
    {
      moveNumber: 52,
      learningPoint: 'massive_build',
      userText: {
        situation: '在終局中，哪位玩家佔據剩餘的 Large Slot 有重大影響。',
        question: '選擇 Position F，並對 Gate 12 執行 Massive Build。',
        hint: '點擊 Position F，然後點擊 Gate 12 的 Large Slot。',
        success: '',
      },
    },
    {
      moveNumber: 53,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position L，並對 Gate 9 執行了 Massive Build。',
      },
    },
    {
      moveNumber: 54,
      learningPoint: 'massive_build',
      userText: {
        situation: '隨著對局接近尾聲，可供 Build up 的 Gate 越來越少。\n確保佔據剩餘的 Large Slot 非常重要。',
        question: '選擇 Position C，並對 Gate 3 執行 Massive Build。',
        hint: '點擊 Position C，然後點擊 Gate 3 的 Large Slot。',
        success: '',
      },
    },
    {
      moveNumber: 55,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position J，並對 Gate 9 執行了 Selective Build。',
      },
    },
    {
      moveNumber: 56,
      learningPoint: 'massive_build',
      userText: {
        situation: '在終局中，要識別對手無法再到達的 Gate，同時填滿您仍然可以到達的 Gate 的剩餘 Slot。',
        question: '選擇 Position E，並對 Gate 2 執行 Massive Build。',
        hint: '點擊 Position E，然後點擊 Gate 2 的 Large Slot。',
        success: '',
      },
    },
    {
      moveNumber: 57,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 選擇了 Position J，並對 Gate 9 執行了 Selective Build。',
      },
    },
    {
      moveNumber: 58,
      learningPoint: 'quad_build',
      userText: {
        situation: '填滿剩餘的 Small Slot 使對局更接近結束。',
        question: '選擇 Position B，並執行 Quad Build。',
        hint: '點擊 Position B，然後點擊任意 Small Slot。',
        success: '',
      },
    },
    {
      moveNumber: 59,
      learningPoint: 'auto_pass',
      autoText: {
        auto: 'White 沒有合法的 Build up 可用，因此 White 的回合自動結束。',
      },
    },
    {
      moveNumber: 60,
      learningPoint: 'endgame',
      userText: {
        situation: 'White 無法從任何它控制的 Position 到達 Gate 3 最後開放的 Large Slot。\n因此，White 的回合自動結束。',
        question: '選擇 Position C，並對 Gate 3 執行 Massive Build。',
        hint: '點擊 Position C，然後點擊 Gate 3 的 Large Slot。',
        success: '所有剩餘的 Build up 現在完成，對局結束。\n\n在 ONE EIGHT 中，當每個 Gate 的每個 Slot 都被填滿時，對局結束。\n此時控制更多 Position 的玩家獲勝。',
      },
      finalText: '所有 Slot 都已填滿，對局結束。\n\n做得很好。在這一局完整的 ONE EIGHT 對局中，您體驗了 Massive Build、Selective Build、Quad Build、Capture、防守和終局決策。',
    },
  ],
};
