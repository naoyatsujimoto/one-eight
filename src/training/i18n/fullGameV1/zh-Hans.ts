import type { FGTrainingText } from './types';

/**
 * Simplified Chinese (简体中文) — translated from English canonical source.
 * GAME-specific terms kept in English: ONE EIGHT, Position, Gate, Diagonal Gate,
 * Build up, Asset, Slot, Large Slot, Middle Slot, Small Slot, Massive Build,
 * Selective Build, Quad Build, Capture, Black, White, Move, CPU, Pro, Ghost,
 * Postmortem, Official Arena.
 *
 * NOTE: zh-Hans covers simplified-literate speakers globally.
 * Do NOT annotate as "Mainland China only".
 */
export const FULL_GAME_V1_ZH_HANS: FGTrainingText = {
  courseId: 'full-game-v1',

  meta: {
    title: 'ONE EIGHT 全局引导 — 以 Black 身份思考',
    description: '以 Black 视角进行一局完整的引导对局。体验 Massive Build、Selective Build、Quad Build、Capture、防守与终局判断。',
    finalSummary: '您已完成一局完整的 ONE EIGHT 对局。请记得：用 Build up 做准备、用 Build up 防守，以及在 Gate 控制值满足条件时执行 Capture。',
  },

  steps: [
    {
      moveNumber: 0,
      learningPoint: 'intro',
      introText: '每一手棋由选择 Position 和执行 Build up 两个动作组成。\n\n从棋盘中央的 13 个 Position 中选择一个，然后在该 Position 可连接的 Gate 上 Build up Asset。\nBuild up 完成后，轮到对手行棋。\n\n让我们实际试试看。',
    },
    {
      moveNumber: 1,
      learningPoint: 'position_select',
      userText: {
        situation: '对局以 Black 先手、White 后手的方式进行。\n现在轮到 Black 行棋。\nPosition 从左到右、从上到下排列为 A 到 M。',
        question: '首先，点击 Position D 来选择它。',
        hint: '点击棋盘上的 Position D。',
        success: '选择 Position D 后，从该 Position 可以 Build up 的 Gate 会以蓝色高亮显示。',
      },
    },
    {
      moveNumber: 2,
      learningPoint: 'position_select',
      userText: {
        situation: '与选定 Position 对角线相连的 Gate，称为该 Position 的 Diagonal Gate。\n蓝色高亮显示的 Diagonal Gate 是可以从该 Position 进行 Build up 的 Gate。',
        question: '再次点击 Position D 取消选择，然后选择 Position G。',
        hint: '点击 Position G。',
        success: '每个 Position 可 Build up 的 Gate 都不相同。\n重新选择 Position 后，可 Build up 的 Gate 也会随之改变。',
      },
    },
    {
      moveNumber: 3,
      learningPoint: 'massive_build',
      userText: {
        situation: 'Build up 是将 Asset 放入 Diagonal Gate 的 Large Slot、Middle Slot 或 Small Slot 来执行。\n根据所选 Slot 的大小，Build up 分为三种类型：\nMassive Build\nSelective Build\nQuad Build\n这次，请对 Gate 4 执行 Massive Build。\n如果有多个相同大小的 Slot，点击任意一个即可。',
        question: '点击 Gate 4 最大的 Slot 来放置 Asset。',
        hint: '点击 Gate 4 的 Large Slot（最大的 Slot）。',
        success: 'Massive Build 是将 Asset 放入一个 Gate 的 Large Slot。\nLarge Asset 在后期的 Position 控制中具有极高的价值。',
      },
    },
    {
      moveNumber: 4,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position J，并对 Gate 7 执行了 Massive Build。\n\n通过 Build up 放置的棋子称为 Asset。Asset 箭头的方向表示是哪位玩家放置的。\n\n箭头朝向自己的 Asset，就是自己的 Build up。',
      },
    },
    {
      moveNumber: 5,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Selective Build 是在两个不同 Gate 的 Middle Slot 各放置一个 Asset。\n不能在同一个 Gate 的两个 Middle Slot 上，用一次 Selective Build 放置 Asset。',
        question: '选择 Position K，并对 Gate 4 和 Gate 10 执行 Selective Build。',
        hint: '点击 Position K，然后点击 Gate 4 的 Middle Slot，再点击 Gate 10 的 Middle Slot。',
        success: 'Selective Build 是将 Middle Asset 分散到两个 Gate 的 Build up。\n虽然对单一 Gate 的影响不如 Massive Build，但可以同时影响多个 Gate。',
      },
    },
    {
      moveNumber: 6,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position E，并对 Gate 6 和 Gate 10 执行了 Selective Build。\n\n对手最近一手棋会以黄色高亮显示。',
      },
    },
    {
      moveNumber: 7,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Quad Build 是在该 Position 可连接的所有四个 Diagonal Gate 的 Small Slot 上各放置一个 Asset。',
        question: '选择 Position B，并执行 Quad Build。',
        hint: '点击 Position B，然后点击任意 Small Slot。',
        success: 'Quad Build 是广泛地在四个 Gate 上放置 Asset 的 Build up。\n虽然每个 Asset 的价值较小，但可以同时影响多个 Gate。',
      },
    },
    {
      moveNumber: 8,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position D，并对 Gate 7 执行了 Massive Build。\n\n这次 Build up 填满了 Gate 7 的 Large Slot。',
      },
    },
    {
      moveNumber: 9,
      learningPoint: 'selective_build',
      userText: {
        situation: '就像 Gate 6 和 Gate 10 一样，Black 和 White 都可以在同一个 Gate 上 Build up。\n一个 Gate 由以下 Slot 组成：\nLarge Slot：2 个\nMiddle Slot：2 个\nSmall Slot：4 个',
        question: '选择 Position I，并对 Gate 8 和 Gate 12 执行 Selective Build。',
        hint: '点击 Position I，然后点击 Gate 8 的 Middle Slot，再点击 Gate 12 的 Middle Slot。',
        success: '当 Black 和 White 的 Asset 都放在同一个 Gate 上时，就会产生争夺该 Gate 控制权的竞争。\n哪位玩家在该 Gate 占优势，取决于放置的 Asset 的价值。',
      },
    },
    {
      moveNumber: 10,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position L，并执行了 Quad Build。\n\n双方交替行棋，直到所有 Gate 的所有 Slot 都被填满时，对局结束。\n\n对局结束时，持有更多 Position 的玩家获胜。',
      },
    },
    {
      moveNumber: 11,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: '选择 Position C，并对 Gate 3 和 Gate 4 执行 Selective Build。',
        hint: '点击 Position C，然后点击 Gate 3 的 Middle Slot，再点击 Gate 4 的 Middle Slot。',
        success: '使用 Selective Build 可以同时影响与多个 Position 相关的 Gate。',
      },
    },
    {
      moveNumber: 12,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position F，并执行了 Quad Build。',
      },
    },
    {
      moveNumber: 13,
      learningPoint: 'massive_build',
      userText: {
        situation: '',
        question: '选择 Position A，并对 Gate 1 执行 Massive Build。',
        hint: '点击 Position A，然后点击 Gate 1 的 Large Slot。',
        success: '当您想要强力控制特定 Gate 时，Massive Build 非常有效。',
      },
    },
    {
      moveNumber: 14,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position H，并对 Gate 5 执行了 Massive Build。',
      },
    },
    {
      moveNumber: 15,
      learningPoint: 'revisit_position',
      userText: {
        situation: '剩下的空 Position 只有 Position M 了。\n除了空 Position 之外，您也可以选择自己已经占据的 Position。',
        question: '选择 Position G，并对 Gate 1 执行 Massive Build。',
        hint: '点击 Position G，然后点击 Gate 1 的 Large Slot。',
        success: '您可以选择并从已占据的 Position 进行 Build up。\n在现有 Position 上继续 Build up，可以为防守或 Capture 做准备。',
      },
    },
    {
      moveNumber: 16,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position M，并对 Gate 7 和 Gate 8 执行了 Selective Build。',
      },
    },
    {
      moveNumber: 17,
      learningPoint: 'gate_check',
      userText: {
        situation: '',
        question: '首先，选择 Position G。',
        hint: '点击 Position G。',
        success: '选择 Position G 后，您可以确认 Position G 的 Diagonal Gate。',
      },
    },
    {
      moveNumber: 18,
      learningPoint: 'selective_build',
      userText: {
        situation: '让我们确认 Position G 四个 Diagonal Gate 的 Build up 状况。\n目前状况如下：\nGate 1：2 个 Large Asset\nGate 4：1 个 Large Asset、2 个 Middle Asset\nGate 7：2 个 Large Asset、1 个 Middle Asset\nGate 10：2 个 Middle Asset',
        question: '接下来，选择 Position A，并对 Gate 1 和 Gate 2 执行 Selective Build。',
        hint: '点击 Position A，然后点击 Gate 1 的 Middle Slot，再点击 Gate 2 的 Middle Slot。',
        success: 'Position 的控制取决于其 Diagonal Gate 的 Build up 状况。\n识别哪个 Gate 受到最多 Build up 非常重要。',
      },
    },
    {
      moveNumber: 19,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position J，并对 Gate 5 和 Gate 7 执行了 Selective Build。',
      },
    },
    {
      moveNumber: 20,
      learningPoint: 'asset_value',
      userText: {
        situation: '与之前相比，Gate 1 和 Gate 4 的 Build up 有所进展。',
        question: '选择 Position G。',
        hint: '点击 Position G。',
        success: '即使是同一个 Position，随着更多 Asset 放置在其 Diagonal Gate 上，控制状况也会改变。',
      },
    },
    {
      moveNumber: 21,
      learningPoint: 'selective_build',
      userText: {
        situation: '即使把所有可用的 Small Asset 和 Middle Asset 加起来，也比不上一个 Large Asset 的价值。\n四个 Small Asset 也比不上一个 Middle Asset。\n在 Position G 的四个 Diagonal Gate 中，Gate 7 目前受到最多 Build up。',
        question: '保持 Position A 选中的状态，对 Gate 1 和 Gate 2 执行 Selective Build。',
        hint: '点击 Position A，然后点击 Gate 1 的 Middle Slot，再点击 Gate 2 的 Middle Slot。',
        success: '同一个 Gate 可能影响多个 Position 的控制判定。\n识别对多个 Position 都有重要意义的 Gate 至关重要。',
      },
    },
    {
      moveNumber: 22,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position L，并对 Gate 9 执行了 Massive Build。',
      },
    },
    {
      moveNumber: 23,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: '选择 Position B，并对 Gate 3 和 Gate 11 执行 Selective Build。',
        hint: '点击 Position B，然后点击 Gate 3 的 Middle Slot，再点击 Gate 11 的 Middle Slot。',
        success: 'Selective Build 可以兼顾未来的攻击和防守。',
      },
    },
    {
      moveNumber: 24,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position F，并对 Gate 8 执行了 Massive Build。',
      },
    },
    {
      moveNumber: 25,
      learningPoint: 'capture',
      userText: {
        situation: '有时候您可以 Capture 对手的 Position。\n确认目标 Position 的 Diagonal Gate 中 Build up 最多的 Gate。\n如果您在该 Gate 的 Build up 优于对手，您就可以 Capture 对手的 Position。\n现在，有一个 White 的 Position 可以被 Capture。',
        question: '选择那个 Position。',
        hint: '点击 Position E。',
        success: 'Capture 一个 Position 与单纯选择空 Position 不同。\n只要条件满足，即使是对手占据的 Position 也可以 Capture 成自己的。',
      },
    },
    {
      moveNumber: 26,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: '保持 Position E 选中的状态，对 Gate 10 执行 Massive Build。',
        hint: '点击 Gate 10 的 Large Slot。',
        success: '从已 Capture 的 Position 进行 Build up，可以同时推进攻击和部署。',
      },
    },
    {
      moveNumber: 27,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position F，并对 Gate 11 执行了 Massive Build。',
      },
    },
    {
      moveNumber: 28,
      learningPoint: 'defense',
      userText: {
        situation: '在 Position A，Gate 1 和 Gate 7 的 Build up 数量相同，并列为 Diagonal Gate 中 Build up 最多的。\n当多个 Diagonal Gate 并列为 Build up 最多时，要比较每位玩家控制了其中几个 Gate。\n在 Position A，Black 控制 Gate 1，White 控制 Gate 7。\n因此，White 无法 Capture Position A。\nBlack 正在成功防守 Position A。',
        question: '首先，选择 Position A。',
        hint: '点击 Position A。',
        success: '当有多个 Build up 最多的 Gate 时，控制的 Gate 数量就变得重要了。\n如果数量相同，Capture 则无法成立。',
      },
    },
    {
      moveNumber: 29,
      learningPoint: 'defense',
      userText: {
        situation: '在 Position B 的 Diagonal Gate 中，Gate 11 是 Build up 最多的 Gate。\n一个 Large Asset 比两个 Middle Asset 更有价值。\n目前，White 控制 Gate 11。\n如果就此不管，下一个 White 的回合可能会 Capture Position B。',
        question: '取消选择 Position A，然后选择 Position B。',
        hint: '点击 Position B。',
        success: '找到对手下一步可以 Capture 的 Position 是防守的第一步。\n发现危险的 Position 后，需要用 Build up 来打破对手的控制。',
      },
    },
    {
      moveNumber: 30,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: '保持 Position B 选中的状态，对 Gate 11 执行 Massive Build。',
        hint: '点击 Gate 11 的 Large Slot。',
        success: '对 Gate 11 执行 Massive Build 后，Black 重新获得了 Gate 11 的控制。\n这样可以防止 White Capture Position B。',
      },
    },
    {
      moveNumber: 31,
      learningPoint: 'auto',
      autoText: {
        auto: '由于 Black 用 Massive Build 重新获得了 Gate 11 的控制，White 无法 Capture Position B。\n\nWhite 选择了 Position L，并执行了 Quad Build。',
      },
    },
    {
      moveNumber: 32,
      learningPoint: 'capture',
      userText: {
        situation: '利用 Gate 11 的优势，您可以 Capture White 的一个 Position。',
        question: '选择可以被 Capture 的 White Position。',
        hint: '点击 Position F。',
        success: '用于防守的 Build up 可以带来下一次攻击的机会。\n这是因为 Gate 的控制会影响多个 Position。',
      },
    },
    {
      moveNumber: 33,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: '对 Gate 11 和 Gate 12 执行 Selective Build，进一步强化 Gate 11。',
        hint: '点击 Gate 11 的 Middle Slot，然后点击 Gate 12 的 Middle Slot。',
        success: 'Capture 后进一步强化 Diagonal Gate，可以更容易守住已 Capture 的 Position。',
      },
    },
    {
      moveNumber: 34,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position M，并执行了 Quad Build。',
      },
    },
    {
      moveNumber: 35,
      learningPoint: 'defense',
      userText: {
        situation: '如果就此不管，White 在下一个回合就会 Capture Position I。\n即使 Black 对 Gate 8 执行 Massive Build，Black 也无法占优势。\n在 Gate 8，White 已 Build up 了 1 个 Large Asset、1 个 Middle Asset 和 4 个 Small Asset。\n即使 Black 在那里执行 Massive Build，Black 也只有 1 个 Large Asset、1 个 Middle Asset 和 0 个 Small Asset。\nSmall Asset 的差距使 Black 无法推翻 White 的优势。',
        question: '选择 Position I。',
        hint: '点击 Position I。',
        success: '放置 Large Asset 并不总能保证您能取得控制。\n已放置的 Middle Asset 和 Small Asset 的差距，可能会阻止控制被推翻。',
      },
    },
    {
      moveNumber: 36,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: '为了暂时防守 Position I，对 Gate 4 执行 Massive Build。',
        hint: '点击 Gate 4 的 Large Slot。',
        success: '当您无法直接推翻某个 Gate 的控制时，强化另一个 Diagonal Gate 可能暂时保护该 Position。',
      },
    },
    {
      moveNumber: 37,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position L，并对 Gate 8 执行了 Massive Build。\n\n判断哪个 Gate Build up 最多时，不论是哪位玩家放置的 Asset 都不重要。\n将双方的 Build up 加总后判断。\n\nPosition I 的 Diagonal Gate 是 Gate 4、Gate 8、Gate 10 和 Gate 12。\n目前，其中 Build up 最多的 Gate 是 Gate 8。\n\n这种情况无法在一步棋内推翻。',
      },
    },
    {
      moveNumber: 38,
      learningPoint: 'capture_quad',
      userText: {
        situation: '',
        question: 'Capture Position D，并执行 Quad Build。',
        hint: '点击 Position D，然后点击任意 Small Slot。',
        success: '选择可 Capture 的 Position 并从那里执行 Quad Build，可以广泛地影响整个棋盘。',
      },
    },
    {
      moveNumber: 39,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position I，并对 Gate 10 执行了 Massive Build。',
      },
    },
    {
      moveNumber: 40,
      learningPoint: 'quad_build',
      userText: {
        situation: '随着终局临近，剩余的开放 Slot 越来越少。\n请注意哪些 Gate 仍有 Build up 的空间。',
        question: '选择 Position A，并执行 Quad Build。',
        hint: '点击 Position A，然后点击任意 Small Slot。',
        success: '',
      },
    },
    {
      moveNumber: 41,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position H，并对 Gate 5 和 Gate 6 执行了 Selective Build。',
      },
    },
    {
      moveNumber: 42,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: '选择 Position G，并执行 Quad Build。',
        hint: '点击 Position G，然后点击任意 Small Slot。',
        success: '通过在剩余的 Small Slot 上广泛放置 Asset，Quad Build 可以影响终局中细微的控制差距。',
      },
    },
    {
      moveNumber: 43,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position H，并对 Gate 5 执行了 Massive Build。',
      },
    },
    {
      moveNumber: 44,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: '选择 Position K，并执行 Quad Build。',
        hint: '点击 Position K，然后点击任意 Small Slot。',
        success: '持续选择自己的 Position 并 Build up，可以扩大控制范围并巩固防守。',
      },
    },
    {
      moveNumber: 45,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position M，并对 Gate 6 执行了 Massive Build。',
      },
    },
    {
      moveNumber: 46,
      learningPoint: 'partial_quad',
      userText: {
        situation: 'Gate 11 已没有可放置 Small Asset 的 Slot 了。\n因此，您可以在 Gate 4、Gate 9 和 Gate 10 上 Build up Small Asset 来执行 Quad Build。\n在 Selective Build 和 Quad Build 中，如果目标 Slot 已满，则只在有空间的地方执行 Build up。',
        question: '选择 Position K，并执行 Quad Build。',
        hint: '点击 Position K，然后点击任意 Small Slot。',
        success: '即使无法在所有目标 Gate 上放置 Asset，也可以在仍有开放 Slot 的 Gate 上 Build up。\n这种部分 Build up 在终局中自然会发生。',
      },
    },
    {
      moveNumber: 47,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position H，并对 Gate 6 执行了 Massive Build。',
      },
    },
    {
      moveNumber: 48,
      learningPoint: 'prepare_capture',
      userText: {
        situation: '现在，在 Position I 的 Diagonal Gate（Gate 4、Gate 8、Gate 10、Gate 12）中，Build up 最多的三个 Gate 是 Gate 4、Gate 8 和 Gate 10。\n此外，Black 可以在 Gate 4 和 Gate 10 建立优势。\n因此，Black 在下一个回合将能够重新 Capture Position I，因为它控制了更多并列的 Gate。',
        question: '选择 Position C，并执行 Build up，为 Black 下一个回合重新 Capture Position I 做准备。',
        hint: '点击 Position C，然后点击任意 Small Slot。',
        success: '即使无法立即 Capture 一个 Position，提前一步做准备可以在下一个回合创造 Capture 所需的条件。\n在 ONE EIGHT 中，这种准备性的 Build up 非常重要。',
      },
    },
    {
      moveNumber: 49,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position H，并执行了 Quad Build。',
      },
    },
    {
      moveNumber: 50,
      learningPoint: 'capture_massive',
      userText: {
        situation: '',
        question: '选择 Position I，并对 Gate 12 执行 Massive Build。',
        hint: '点击 Position I，然后点击 Gate 12 的 Large Slot。',
        success: '您准备的控制条件使您能够重新 Capture Position I。\nCapture 后继续 Build up 可以在终局增加您控制的 Position 数量。',
      },
    },
    {
      moveNumber: 51,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position H，并对 Gate 2 执行了 Massive Build。',
      },
    },
    {
      moveNumber: 52,
      learningPoint: 'massive_build',
      userText: {
        situation: '在终局中，哪位玩家占据剩余的 Large Slot 有重大影响。',
        question: '选择 Position F，并对 Gate 12 执行 Massive Build。',
        hint: '点击 Position F，然后点击 Gate 12 的 Large Slot。',
        success: '',
      },
    },
    {
      moveNumber: 53,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position L，并对 Gate 9 执行了 Massive Build。',
      },
    },
    {
      moveNumber: 54,
      learningPoint: 'massive_build',
      userText: {
        situation: '随着对局接近尾声，可供 Build up 的 Gate 越来越少。\n确保占据剩余的 Large Slot 非常重要。',
        question: '选择 Position C，并对 Gate 3 执行 Massive Build。',
        hint: '点击 Position C，然后点击 Gate 3 的 Large Slot。',
        success: '',
      },
    },
    {
      moveNumber: 55,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position J，并对 Gate 9 执行了 Selective Build。',
      },
    },
    {
      moveNumber: 56,
      learningPoint: 'massive_build',
      userText: {
        situation: '在终局中，要识别对手无法再到达的 Gate，同时填满您仍然可以到达的 Gate 的剩余 Slot。',
        question: '选择 Position E，并对 Gate 2 执行 Massive Build。',
        hint: '点击 Position E，然后点击 Gate 2 的 Large Slot。',
        success: '',
      },
    },
    {
      moveNumber: 57,
      learningPoint: 'auto',
      autoText: {
        auto: 'White 选择了 Position J，并对 Gate 9 执行了 Selective Build。',
      },
    },
    {
      moveNumber: 58,
      learningPoint: 'quad_build',
      userText: {
        situation: '填满剩余的 Small Slot 使对局更接近结束。',
        question: '选择 Position B，并执行 Quad Build。',
        hint: '点击 Position B，然后点击任意 Small Slot。',
        success: '',
      },
    },
    {
      moveNumber: 59,
      learningPoint: 'auto_pass',
      autoText: {
        auto: 'White 没有合法的 Build up 可用，因此 White 的回合自动结束。',
      },
    },
    {
      moveNumber: 60,
      learningPoint: 'endgame',
      userText: {
        situation: 'White 无法从任何它控制的 Position 到达 Gate 3 最后开放的 Large Slot。\n因此，White 的回合自动结束。',
        question: '选择 Position C，并对 Gate 3 执行 Massive Build。',
        hint: '点击 Position C，然后点击 Gate 3 的 Large Slot。',
        success: '所有剩余的 Build up 现在完成，对局结束。\n\n在 ONE EIGHT 中，当每个 Gate 的每个 Slot 都被填满时，对局结束。\n此时控制更多 Position 的玩家获胜。',
      },
      finalText: '所有 Slot 都已填满，对局结束。\n\n做得很好。在这一局完整的 ONE EIGHT 对局中，您体验了 Massive Build、Selective Build、Quad Build、Capture、防守和终局决策。',
    },
  ],
};
