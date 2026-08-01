import type { FGTrainingText } from './types';

/**
 * Korean (한국어) — translated from English canonical source.
 * GAME-specific terms kept in English: ONE EIGHT, Position, Gate, Diagonal Gate,
 * Build up, Asset, Slot, Large Slot, Middle Slot, Small Slot, Massive Build,
 * Selective Build, Quad Build, Capture, Black, White, Move, CPU, Pro, Ghost,
 * Postmortem, Official Arena.
 * 경칭: 합쇼체(존댓말) 통일.
 */
export const FULL_GAME_V1_KO: FGTrainingText = {
  courseId: 'full-game-v1',

  meta: {
    title: 'ONE EIGHT 전국 가이드 — Black으로 생각하기',
    description: 'Black 시점으로 한 판 전체를 플레이합니다. Massive Build, Selective Build, Quad Build, Capture, 방어, 종반 판단을 경험하세요.',
    finalSummary: 'ONE EIGHT 한 판을 완주했습니다. 준비하는 Build up, 방어하는 Build up, 그리고 Gate 지배값 조건이 충족될 때 Capture를 활용하세요.',
  },

  steps: [
    {
      moveNumber: 0,
      learningPoint: 'intro',
      introText: '한 수는 Position을 선택한 뒤 Build up을 실행함으로써 완성됩니다.\n\n보드 중앙의 13개 Position 중 하나를 선택하고, 해당 Position에서 접근 가능한 Gate에 Asset을 Build up합니다.\nBuild up이 완료되면 상대방의 차례로 넘어갑니다.\n\n직접 해 보겠습니다.',
    },
    {
      moveNumber: 1,
      learningPoint: 'position_select',
      userText: {
        situation: '대국은 Black이 선수, White가 후수로 진행됩니다.\n지금은 Black의 차례입니다.\nPosition은 왼쪽에서 오른쪽, 위에서 아래 순으로 A부터 M까지 배열되어 있습니다.',
        question: '먼저 Position D를 탭하여 선택하세요.',
        hint: '보드 위의 Position D를 탭하세요.',
        success: 'Position D를 선택하면 그 Position에서 Build up할 수 있는 Gate가 파란색으로 강조 표시됩니다.',
      },
    },
    {
      moveNumber: 2,
      learningPoint: 'position_select',
      userText: {
        situation: '선택한 Position의 대각선으로 연결된 Gate를 해당 Position의 Diagonal Gate라고 합니다.\n파란색으로 강조된 Diagonal Gate가 해당 Position에서 Build up할 수 있는 Gate입니다.',
        question: 'Position D를 다시 탭하여 선택을 해제한 뒤, Position G를 선택하세요.',
        hint: 'Position G를 탭하세요.',
        success: 'Position마다 Build up할 수 있는 Gate가 다릅니다.\nPosition을 다시 선택하면 Build up할 수 있는 Gate도 바뀝니다.',
      },
    },
    {
      moveNumber: 3,
      learningPoint: 'massive_build',
      userText: {
        situation: 'Build up은 Diagonal Gate의 Large Slot, Middle Slot, Small Slot에 Asset을 배치하여 실행합니다.\n선택하는 Slot의 크기에 따라 Build up의 종류가 세 가지로 나뉩니다:\nMassive Build\nSelective Build\nQuad Build\n이번에는 Gate 4에 Massive Build를 실행합니다.\n같은 크기의 Slot이 여러 개 있는 경우 어느 것을 탭해도 됩니다.',
        question: 'Gate 4에서 가장 큰 Slot을 탭하여 Asset을 배치하세요.',
        hint: 'Gate 4의 Large Slot(가장 큰 Slot)을 탭하세요.',
        success: 'Massive Build는 하나의 Gate Large Slot에 Asset을 배치합니다.\nLarge Asset은 이후 Position 지배에서 매우 큰 가치를 가집니다.',
      },
    },
    {
      moveNumber: 4,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position J를 선택하고 Gate 7에 Massive Build를 실행했습니다.\n\nBuild up으로 배치된 말을 Asset이라고 합니다. Asset의 화살표 방향은 어느 플레이어가 배치했는지를 나타냅니다.\n\n나를 향하고 있는 Asset이 내가 Build up한 Asset입니다.',
      },
    },
    {
      moveNumber: 5,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Selective Build는 서로 다른 두 Gate의 Middle Slot에 각각 Asset을 배치합니다.\n한 번의 Selective Build로 같은 Gate의 두 Middle Slot에 Asset을 배치할 수 없습니다.',
        question: 'Position K를 선택하고 Gate 4와 Gate 10에 Selective Build를 실행하세요.',
        hint: 'Position K를 탭한 뒤 Gate 4의 Middle Slot, 그다음 Gate 10의 Middle Slot을 탭하세요.',
        success: 'Selective Build는 두 Gate에 Middle Asset을 분산 배치하는 Build up입니다.\nMassive Build보다 단일 Gate에 대한 영향은 작지만, 여러 Gate에 동시에 영향을 줄 수 있습니다.',
      },
    },
    {
      moveNumber: 6,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position E를 선택하고 Gate 6과 Gate 10에 Selective Build를 실행했습니다.\n\n상대방의 가장 최근 수는 노란색으로 강조 표시됩니다.',
      },
    },
    {
      moveNumber: 7,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Quad Build는 해당 Position에서 접근 가능한 네 개의 Diagonal Gate 모두의 Small Slot에 각각 Asset을 배치합니다.',
        question: 'Position B를 선택하고 Quad Build를 실행하세요.',
        hint: 'Position B를 탭한 뒤 Small Slot 중 하나를 탭하세요.',
        success: 'Quad Build는 네 개의 Gate에 Asset을 넓게 배치하는 Build up입니다.\n각 Asset의 가치는 작지만 여러 Gate에 동시에 영향을 줄 수 있습니다.',
      },
    },
    {
      moveNumber: 8,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position D를 선택하고 Gate 7에 Massive Build를 실행했습니다.\n\n이 Build up으로 Gate 7의 Large Slot이 채워졌습니다.',
      },
    },
    {
      moveNumber: 9,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Gate 6과 Gate 10처럼 하나의 Gate에 Black과 White 모두 Build up할 수 있습니다.\n하나의 Gate는 다음 Slot으로 구성됩니다:\nLarge Slot: 2개\nMiddle Slot: 2개\nSmall Slot: 4개',
        question: 'Position I를 선택하고 Gate 8과 Gate 12에 Selective Build를 실행하세요.',
        hint: 'Position I를 탭한 뒤 Gate 8의 Middle Slot, 그다음 Gate 12의 Middle Slot을 탭하세요.',
        success: '같은 Gate에 Black과 White의 Asset이 모두 배치되면 해당 Gate의 지배권을 두고 경쟁이 발생합니다.\n어느 플레이어가 해당 Gate에서 우세한지는 배치된 Asset의 가치에 따라 결정됩니다.',
      },
    },
    {
      moveNumber: 10,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position L을 선택하고 Quad Build를 실행했습니다.\n\n서로 번갈아 가며 진행하여 모든 Gate의 모든 Slot이 채워지면 대국이 종료됩니다.\n\n종료 시 더 많은 Position을 보유한 플레이어가 승자입니다.',
      },
    },
    {
      moveNumber: 11,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Position C를 선택하고 Gate 3과 Gate 4에 Selective Build를 실행하세요.',
        hint: 'Position C를 탭한 뒤 Gate 3의 Middle Slot, 그다음 Gate 4의 Middle Slot을 탭하세요.',
        success: 'Selective Build를 사용하면 여러 Position과 관련된 Gate에 동시에 영향을 줄 수 있습니다.',
      },
    },
    {
      moveNumber: 12,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position F를 선택하고 Quad Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 13,
      learningPoint: 'massive_build',
      userText: {
        situation: '',
        question: 'Position A를 선택하고 Gate 1에 Massive Build를 실행하세요.',
        hint: 'Position A를 탭한 뒤 Gate 1의 Large Slot을 탭하세요.',
        success: '특정 Gate를 강하게 지배하고 싶을 때 Massive Build가 효과적입니다.',
      },
    },
    {
      moveNumber: 14,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position H를 선택하고 Gate 5에 Massive Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 15,
      learningPoint: 'revisit_position',
      userText: {
        situation: '남은 빈 Position은 Position M뿐입니다.\n빈 Position뿐만 아니라 이미 점유한 Position도 선택할 수 있습니다.',
        question: 'Position G를 선택하고 Gate 1에 Massive Build를 실행하세요.',
        hint: 'Position G를 탭한 뒤 Gate 1의 Large Slot을 탭하세요.',
        success: '이미 점유한 Position을 다시 선택하여 Build up할 수 있습니다.\n기존 Position에서 계속 Build up하면 방어나 Capture를 준비할 수 있습니다.',
      },
    },
    {
      moveNumber: 16,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position M을 선택하고 Gate 7과 Gate 8에 Selective Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 17,
      learningPoint: 'gate_check',
      userText: {
        situation: '',
        question: '먼저 Position G를 선택하세요.',
        hint: 'Position G를 탭하세요.',
        success: 'Position G를 선택하면 Position G의 Diagonal Gate를 확인할 수 있습니다.',
      },
    },
    {
      moveNumber: 18,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Position G의 네 Diagonal Gate의 Build up 상황을 확인해 보겠습니다.\n현재 상태는 다음과 같습니다:\nGate 1: Large Asset 2개\nGate 4: Large Asset 1개, Middle Asset 2개\nGate 7: Large Asset 2개, Middle Asset 1개\nGate 10: Middle Asset 2개',
        question: '다음으로 Position A를 선택하고 Gate 1과 Gate 2에 Selective Build를 실행하세요.',
        hint: 'Position A를 탭한 뒤 Gate 1의 Middle Slot, 그다음 Gate 2의 Middle Slot을 탭하세요.',
        success: 'Position의 지배는 해당 Position의 Diagonal Gate Build up 상황에 따라 결정됩니다.\n어느 Gate에 Build up이 가장 많이 이루어졌는지 파악하는 것이 중요합니다.',
      },
    },
    {
      moveNumber: 19,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position J를 선택하고 Gate 5와 Gate 7에 Selective Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 20,
      learningPoint: 'asset_value',
      userText: {
        situation: '이전보다 Gate 1과 Gate 4의 Build up이 진행되었습니다.',
        question: 'Position G를 선택하세요.',
        hint: 'Position G를 탭하세요.',
        success: '같은 Position이라도 Diagonal Gate에 Asset이 추가되면 지배 상황이 변화합니다.',
      },
    },
    {
      moveNumber: 21,
      learningPoint: 'selective_build',
      userText: {
        situation: '가능한 모든 Small Asset과 Middle Asset을 합해도 Large Asset 하나의 가치에 미치지 못합니다.\nSmall Asset 네 개도 Middle Asset 하나의 가치에 미치지 못합니다.\nPosition G의 네 Diagonal Gate 중에서 Gate 7이 현재 Build up이 가장 많이 이루어진 Gate입니다.',
        question: 'Position A를 선택한 상태에서 Gate 1과 Gate 2에 Selective Build를 실행하세요.',
        hint: 'Position A를 탭한 뒤 Gate 1의 Middle Slot, 그다음 Gate 2의 Middle Slot을 탭하세요.',
        success: '같은 Gate가 여러 Position의 지배 판정에 영향을 줄 수 있습니다.\n여러 Position에 중요한 Gate를 파악하는 것이 핵심입니다.',
      },
    },
    {
      moveNumber: 22,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position L을 선택하고 Gate 9에 Massive Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 23,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Position B를 선택하고 Gate 3과 Gate 11에 Selective Build를 실행하세요.',
        hint: 'Position B를 탭한 뒤 Gate 3의 Middle Slot, 그다음 Gate 11의 Middle Slot을 탭하세요.',
        success: 'Selective Build는 미래의 공격과 방어 모두를 고려하여 사용할 수 있습니다.',
      },
    },
    {
      moveNumber: 24,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position F를 선택하고 Gate 8에 Massive Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 25,
      learningPoint: 'capture',
      userText: {
        situation: '때로는 상대방의 Position을 Capture할 수 있습니다.\n대상 Position의 Diagonal Gate 중 Build up이 가장 많은 Gate를 확인하세요.\n그 Gate에서 내 Build up이 상대방보다 우세하면 상대방의 Position을 Capture할 수 있습니다.\n지금 White의 Position 중 하나를 Capture할 수 있습니다.',
        question: '그 Position을 선택하세요.',
        hint: 'Position E를 탭하세요.',
        success: 'Position을 Capture하는 것은 단순히 빈 Position을 선택하는 것과 다릅니다.\n조건이 충족되면 상대방이 점유한 Position도 내 것으로 Capture할 수 있습니다.',
      },
    },
    {
      moveNumber: 26,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Position E를 선택한 상태에서 Gate 10에 Massive Build를 실행하세요.',
        hint: 'Gate 10의 Large Slot을 탭하세요.',
        success: 'Capture한 Position에서 Build up을 하면 공격과 전개를 동시에 진행할 수 있습니다.',
      },
    },
    {
      moveNumber: 27,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position F를 선택하고 Gate 11에 Massive Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 28,
      learningPoint: 'defense',
      userText: {
        situation: 'Position A에서 Gate 1과 Gate 7은 Build up 양이 같아 Diagonal Gate 중 공동으로 Build up이 가장 많습니다.\n여러 Diagonal Gate가 Build up 최다로 동률일 때는 각 플레이어가 그 중 몇 개의 Gate를 지배하는지 비교합니다.\nPosition A에서 Black은 Gate 1을 지배하고 White는 Gate 7을 지배합니다.\n따라서 White는 Position A를 Capture할 수 없습니다.\nBlack이 Position A를 성공적으로 방어하고 있습니다.',
        question: '먼저 Position A를 선택하세요.',
        hint: 'Position A를 탭하세요.',
        success: 'Build up이 가장 많은 Gate가 여러 개 있을 때는 지배하는 Gate 수가 중요합니다.\n수가 같으면 Capture가 성립되지 않습니다.',
      },
    },
    {
      moveNumber: 29,
      learningPoint: 'defense',
      userText: {
        situation: 'Position B의 Diagonal Gate 중 Gate 11이 Build up이 가장 많은 Gate입니다.\nLarge Asset 하나는 Middle Asset 두 개보다 가치가 높습니다.\n현재 White가 Gate 11을 지배하고 있습니다.\n이대로 두면 다음 White 차례에 Position B를 빼앗길 위험이 있습니다.',
        question: 'Position A 선택을 해제하고 Position B를 선택하세요.',
        hint: 'Position B를 탭하세요.',
        success: '상대방이 다음에 Capture할 수 있는 Position을 찾는 것이 방어의 첫 번째 단계입니다.\n위험한 Position을 발견했다면 상대방의 지배를 무너뜨리는 Build up이 필요합니다.',
      },
    },
    {
      moveNumber: 30,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'Position B를 선택한 상태에서 Gate 11에 Massive Build를 실행하세요.',
        hint: 'Gate 11의 Large Slot을 탭하세요.',
        success: 'Gate 11에 Massive Build를 실행하여 Black이 Gate 11의 지배권을 되찾았습니다.\n이로써 White가 Position B를 Capture하는 것을 막을 수 있습니다.',
      },
    },
    {
      moveNumber: 31,
      learningPoint: 'auto',
      autoText: {
        auto: 'Black이 Massive Build로 Gate 11의 지배권을 되찾았기 때문에 White는 Position B를 Capture할 수 없었습니다.\n\nWhite가 Position L을 선택하고 Quad Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 32,
      learningPoint: 'capture',
      userText: {
        situation: 'Gate 11의 우위를 활용하여 White의 Position 중 하나를 Capture할 수 있습니다.',
        question: 'Capture할 수 있는 White Position을 선택하세요.',
        hint: 'Position F를 탭하세요.',
        success: '방어에 사용한 Build up이 다음 공격으로 이어질 수 있습니다.\nGate의 지배가 여러 Position에 영향을 주기 때문입니다.',
      },
    },
    {
      moveNumber: 33,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Gate 11과 Gate 12에 Selective Build를 실행하여 Gate 11을 더욱 강화하세요.',
        hint: 'Gate 11의 Middle Slot, 그다음 Gate 12의 Middle Slot을 탭하세요.',
        success: 'Capture 후 Diagonal Gate를 더욱 강화하면 Capture한 Position을 지키기 더 쉬워집니다.',
      },
    },
    {
      moveNumber: 34,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position M을 선택하고 Quad Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 35,
      learningPoint: 'defense',
      userText: {
        situation: '이대로 두면 다음 White 차례에 Position I를 빼앗깁니다.\nBlack이 Gate 8에 Massive Build를 해도 우세해질 수 없습니다.\nGate 8에 White는 Large Asset 1개, Middle Asset 1개, Small Asset 4개를 Build up했습니다.\nBlack이 그곳에 Massive Build를 해도 Black은 Large Asset 1개, Middle Asset 1개, Small Asset 0개 상태입니다.\nSmall Asset의 차이로 인해 White의 우세를 뒤집을 수 없습니다.',
        question: 'Position I를 선택하세요.',
        hint: 'Position I를 탭하세요.',
        success: 'Large Asset을 배치한다고 해서 반드시 지배권을 가져올 수 있는 것은 아닙니다.\n이미 배치된 Middle Asset과 Small Asset의 차이가 지배권 역전을 막을 수 있습니다.',
      },
    },
    {
      moveNumber: 36,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'Position I를 일시적으로 방어하기 위해 Gate 4에 Massive Build를 실행하세요.',
        hint: 'Gate 4의 Large Slot을 탭하세요.',
        success: '하나의 Gate를 직접 역전시킬 수 없을 때, 다른 Diagonal Gate를 강화하면 일시적으로 Position을 지킬 수 있습니다.',
      },
    },
    {
      moveNumber: 37,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position L을 선택하고 Gate 8에 Massive Build를 실행했습니다.\n\nBuild up이 가장 많은 Gate를 판정할 때는 어느 플레이어가 배치했는지는 중요하지 않습니다.\n양측의 Build up을 합산하여 판정합니다.\n\nPosition I의 Diagonal Gate는 Gate 4, Gate 8, Gate 10, Gate 12입니다.\n현재 이 중 Build up이 가장 많은 Gate는 Gate 8입니다.\n\n이 상황은 한 수로 뒤집을 수 없습니다.',
      },
    },
    {
      moveNumber: 38,
      learningPoint: 'capture_quad',
      userText: {
        situation: '',
        question: 'Position D를 Capture하고 Quad Build를 실행하세요.',
        hint: 'Position D를 탭한 뒤 Small Slot 중 하나를 탭하세요.',
        success: 'Capture 가능한 Position을 선택하고 그곳에서 Quad Build를 실행하면 보드 전체에 폭넓게 영향을 줄 수 있습니다.',
      },
    },
    {
      moveNumber: 39,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position I를 선택하고 Gate 10에 Massive Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 40,
      learningPoint: 'quad_build',
      userText: {
        situation: '종반에 가까워질수록 남은 빈 Slot이 줄어듭니다.\n어느 Gate에 아직 Build up할 수 있는지 확인하면서 진행하는 것이 중요합니다.',
        question: 'Position A를 선택하고 Quad Build를 실행하세요.',
        hint: 'Position A를 탭한 뒤 Small Slot 중 하나를 탭하세요.',
        success: '',
      },
    },
    {
      moveNumber: 41,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position H를 선택하고 Gate 5와 Gate 6에 Selective Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 42,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Position G를 선택하고 Quad Build를 실행하세요.',
        hint: 'Position G를 탭한 뒤 Small Slot 중 하나를 탭하세요.',
        success: '남은 Small Slot에 Asset을 넓게 배치함으로써 Quad Build는 종반의 미세한 지배 차이에 영향을 줄 수 있습니다.',
      },
    },
    {
      moveNumber: 43,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position H를 선택하고 Gate 5에 Massive Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 44,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Position K를 선택하고 Quad Build를 실행하세요.',
        hint: 'Position K를 탭한 뒤 Small Slot 중 하나를 탭하세요.',
        success: '자신의 Position을 계속 선택하여 Build up하면 지배 범위를 넓히고 방어를 강화할 수 있습니다.',
      },
    },
    {
      moveNumber: 45,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position M을 선택하고 Gate 6에 Massive Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 46,
      learningPoint: 'partial_quad',
      userText: {
        situation: 'Gate 11에는 더 이상 Small Asset을 배치할 수 있는 Slot이 없습니다.\n따라서 Gate 4, Gate 9, Gate 10에 Small Asset을 Build up하면 Quad Build를 실행할 수 있습니다.\nSelective Build와 Quad Build에서는 대상 Slot이 가득 찬 경우 가능한 범위에서만 Build up합니다.',
        question: 'Position K를 선택하고 Quad Build를 실행하세요.',
        hint: 'Position K를 탭한 뒤 Small Slot 중 하나를 탭하세요.',
        success: '모든 대상 Gate에 Asset을 배치할 수 없더라도 아직 빈 Slot이 있는 Gate에는 Build up할 수 있습니다.\n이런 부분적인 Build up은 종반에 자연스럽게 발생합니다.',
      },
    },
    {
      moveNumber: 47,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position H를 선택하고 Gate 6에 Massive Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 48,
      learningPoint: 'prepare_capture',
      userText: {
        situation: '이제 Position I의 Diagonal Gate(Gate 4, Gate 8, Gate 10, Gate 12) 중에서 Build up이 가장 많은 세 개의 Gate는 Gate 4, Gate 8, Gate 10입니다.\n또한 Black은 Gate 4와 Gate 10에서 우세한 상황을 만들 수 있습니다.\n따라서 Black은 다음 차례에 동률 Gate 중 더 많은 수를 지배하기 때문에 Position I를 다시 Capture할 수 있습니다.',
        question: 'Position C를 선택하고 다음 Black 차례에 Position I를 재탈환하기 위한 Build up을 실행하세요.',
        hint: 'Position C를 탭한 뒤 Small Slot 중 하나를 탭하세요.',
        success: '즉시 Capture할 수 없는 Position이라도 한 수 전에 준비하면 다음 차례에 Capture 가능한 상황을 만들 수 있습니다.\nONE EIGHT에서는 이런 준비성 Build up이 중요합니다.',
      },
    },
    {
      moveNumber: 49,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position H를 선택하고 Quad Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 50,
      learningPoint: 'capture_massive',
      userText: {
        situation: '',
        question: 'Position I를 선택하고 Gate 12에 Massive Build를 실행하세요.',
        hint: 'Position I를 탭한 뒤 Gate 12의 Large Slot을 탭하세요.',
        success: '준비한 지배 상황을 활용하여 Position I를 재탈환합니다.\nCapture 후에도 Build up을 계속하면 종반에 보유하는 Position 수를 늘릴 수 있습니다.',
      },
    },
    {
      moveNumber: 51,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position H를 선택하고 Gate 2에 Massive Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 52,
      learningPoint: 'massive_build',
      userText: {
        situation: '종반에서는 어느 플레이어가 남은 Large Slot을 차지하느냐가 큰 영향을 미칩니다.',
        question: 'Position F를 선택하고 Gate 12에 Massive Build를 실행하세요.',
        hint: 'Position F를 탭한 뒤 Gate 12의 Large Slot을 탭하세요.',
        success: '',
      },
    },
    {
      moveNumber: 53,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position L을 선택하고 Gate 9에 Massive Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 54,
      learningPoint: 'massive_build',
      userText: {
        situation: '대국 종료가 가까워지면 Build up 가능한 Gate가 점점 줄어듭니다.\n남은 Large Slot을 확실히 확보하는 것이 중요합니다.',
        question: 'Position C를 선택하고 Gate 3에 Massive Build를 실행하세요.',
        hint: 'Position C를 탭한 뒤 Gate 3의 Large Slot을 탭하세요.',
        success: '',
      },
    },
    {
      moveNumber: 55,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position J를 선택하고 Gate 9에 Selective Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 56,
      learningPoint: 'massive_build',
      userText: {
        situation: '종반에서는 상대방이 더 이상 도달할 수 없는 Gate를 파악하면서 자신이 접근 가능한 Gate의 남은 Slot을 채워갑니다.',
        question: 'Position E를 선택하고 Gate 2에 Massive Build를 실행하세요.',
        hint: 'Position E를 탭한 뒤 Gate 2의 Large Slot을 탭하세요.',
        success: '',
      },
    },
    {
      moveNumber: 57,
      learningPoint: 'auto',
      autoText: {
        auto: 'White가 Position J를 선택하고 Gate 9에 Selective Build를 실행했습니다.',
      },
    },
    {
      moveNumber: 58,
      learningPoint: 'quad_build',
      userText: {
        situation: '남은 Small Slot을 채워가면 대국 종료에 가까워집니다.',
        question: 'Position B를 선택하고 Quad Build를 실행하세요.',
        hint: 'Position B를 탭한 뒤 Small Slot 중 하나를 탭하세요.',
        success: '',
      },
    },
    {
      moveNumber: 59,
      learningPoint: 'auto_pass',
      autoText: {
        auto: 'White는 합법적인 Build up이 없어 White의 차례가 자동으로 종료되었습니다.',
      },
    },
    {
      moveNumber: 60,
      learningPoint: 'endgame',
      userText: {
        situation: 'White는 자신이 지배하는 어느 Position에서도 Gate 3의 마지막 Large Slot에 접근할 수 없습니다.\n따라서 White의 차례가 자동으로 종료되었습니다.',
        question: 'Position C를 선택하고 Gate 3에 Massive Build를 실행하세요.',
        hint: 'Position C를 탭한 뒤 Gate 3의 Large Slot을 탭하세요.',
        success: '모든 남은 Build up이 완료되어 대국이 종료됩니다.\n\nONE EIGHT에서는 모든 Gate의 모든 Slot이 채워지면 대국이 종료됩니다.\n이 시점에서 더 많은 Position을 지배하는 플레이어가 승자입니다.',
      },
      finalText: '모든 Slot이 채워져 대국이 종료되었습니다.\n\n수고하셨습니다. ONE EIGHT 한 판을 통해 Massive Build, Selective Build, Quad Build, Capture, 방어, 종반 결정을 경험했습니다.',
    },
  ],
};
