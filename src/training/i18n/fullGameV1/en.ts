import type { FGTrainingText } from './types';

/**
 * English locale bundle for FullGame V1 Training.
 * This is the canonical English text; edit this file directly to update English content.
 */
export const FULL_GAME_V1_EN: FGTrainingText = {
  courseId: 'full-game-v1',

  meta: {
    title: 'ONE EIGHT Guided Game — Think as Black',
    description: 'Play through one guided game as Black. Experience Massive Build, Selective Build, Quad Build, Capture, defense, and endgame judgment.',
    finalSummary: 'You have completed a full game of ONE EIGHT. Remember to use Build up to prepare, to defend, and to capture when the Gate control values meet the required conditions.',
  },

  steps: [
    // moveNumber 0 (M0) intro
    {
      moveNumber: 0,
      learningPoint: 'intro',
      introText: 'A turn is completed by selecting a Position and then performing a Build up.\n\nSelect one of the 13 Positions in the center of the board, then Build up Assets at the Gates accessible from that Position.\nOnce the Build up is complete, the turn passes to your opponent.\n\nLet\'s try it.',
    },

    // moveNumber 1 (M1-1) select_only
    {
      moveNumber: 1,
      learningPoint: 'position_select',
      userText: {
        situation: 'The game proceeds with Black going first and White going second.\nIt is currently Black\'s turn.\nPositions are arranged A through M from left to right, top to bottom.',
        question: 'First, tap Position D to select it.',
        hint: 'Tap Position D on the board.',
        success: 'When Position D is selected, the Gates that can be built up from that Position are highlighted in blue.',
      },
    },

    // moveNumber 2 (M1-2) select_only
    {
      moveNumber: 2,
      learningPoint: 'position_select',
      userText: {
        situation: 'The Gates diagonally connected to a selected Position are called the Diagonal Gates of that Position.\nThe blue-highlighted Diagonal Gates are available for Build up from that Position.',
        question: 'Tap Position D again to deselect it, then select Position G.',
        hint: 'Tap Position G.',
        success: 'The Gates available for Build up differ by Position.\nBy reselecting a Position, the Gates available for Build up change as well.',
      },
    },

    // moveNumber 3 (M1-3) user
    {
      moveNumber: 3,
      learningPoint: 'massive_build',
      userText: {
        situation: 'Build up is performed by placing Assets in the Large Slot, Middle Slot, or Small Slot of a Diagonal Gate.\nDepending on the size of the Slot you select, there are three types of Build up:\nMassive Build\nSelective Build\nQuad Build\nThis time, perform a Massive Build on Gate 4.\nIf there are multiple Slots of the same size, you can tap either one.',
        question: 'Tap the largest Slot at Gate 4 to place an Asset.',
        hint: 'Tap the Large Slot (the largest Slot) at Gate 4.',
        success: 'With Massive Build, you place an Asset in the Large Slot of one Gate.\nLarge Assets hold great value in later Position control.',
      },
    },

    // moveNumber 4 (M2) auto
    {
      moveNumber: 4,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position J and performed a Massive Build on Gate 7.\n\nThe pieces placed through Build up are called Assets. The direction of an Asset\'s arrow indicates which player placed it.\n\nAn Asset pointing toward you was placed by you.',
      },
    },

    // moveNumber 5 (M3) user
    {
      moveNumber: 5,
      learningPoint: 'selective_build',
      userText: {
        situation: 'With Selective Build, you place Assets in the Middle Slots of two different Gates.\nYou cannot place Assets in both Middle Slots of the same Gate in one Selective Build.',
        question: 'Select Position K and perform a Selective Build on Gate 4 and Gate 10.',
        hint: 'Tap Position K, then tap the Middle Slot of Gate 4, then the Middle Slot of Gate 10.',
        success: 'Selective Build distributes Middle Assets across two Gates.\nIt has less influence on any single Gate than Massive Build, but it can affect multiple Gates at once.',
      },
    },

    // moveNumber 6 (M4) auto
    {
      moveNumber: 6,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position E and performed a Selective Build on Gate 6 and Gate 10.\n\nThe opponent\'s most recent move is highlighted in yellow.',
      },
    },

    // moveNumber 7 (M5) user
    {
      moveNumber: 7,
      learningPoint: 'quad_build',
      userText: {
        situation: 'With Quad Build, you place Assets in the Small Slots of all four Diagonal Gates accessible from that Position.',
        question: 'Select Position B and perform a Quad Build.',
        hint: 'Tap Position B, then tap any Small Slot.',
        success: 'Quad Build is a Build up that places Assets broadly across four Gates.\nWhile the value of each Asset is small, it can simultaneously affect multiple Gates.',
      },
    },

    // moveNumber 8 (M6) auto
    {
      moveNumber: 8,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position D and performed a Massive Build on Gate 7.\n\nThis Build up filled the Large Slot of Gate 7.',
      },
    },

    // moveNumber 9 (M7) user
    {
      moveNumber: 9,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Like Gate 6 and Gate 10, both Black and White can Build up on the same Gate.\nOne Gate consists of the following Slots:\nLarge Slots: 2\nMedium Slots: 2\nSmall Slots: 4',
        question: 'Select Position I and perform a Selective Build on Gate 8 and Gate 12.',
        hint: 'Tap Position I, then tap the Middle Slot of Gate 8, then the Middle Slot of Gate 12.',
        success: 'When both Black and White Assets are placed on the same Gate, a contest arises over who controls that Gate.\nWhich player is dominant at that Gate is determined by the value of the Assets placed.',
      },
    },

    // moveNumber 10 (M8) auto
    {
      moveNumber: 10,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position L and performed a Quad Build.\n\nThe game ends once every Slot at every Gate has been filled through alternating turns.\n\nAt the end of the game, the player holding more Positions is the winner.',
      },
    },

    // moveNumber 11 (M9) user
    {
      moveNumber: 11,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Select Position C and perform a Selective Build on Gate 3 and Gate 4.',
        hint: 'Tap Position C, then tap the Middle Slot of Gate 3, then the Middle Slot of Gate 4.',
        success: 'Using Selective Build allows you to simultaneously affect Gates related to multiple Positions.',
      },
    },

    // moveNumber 12 (M10) auto
    {
      moveNumber: 12,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position F and performed a Quad Build.',
      },
    },

    // moveNumber 13 (M11) user
    {
      moveNumber: 13,
      learningPoint: 'massive_build',
      userText: {
        situation: '',
        question: 'Select Position A and perform a Massive Build on Gate 1.',
        hint: 'Tap Position A, then tap the Large Slot of Gate 1.',
        success: 'Massive Build is effective when you want to strongly control a specific Gate.',
      },
    },

    // moveNumber 14 (M12) auto
    {
      moveNumber: 14,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position H and performed a Massive Build on Gate 5.',
      },
    },

    // moveNumber 15 (M13) user
    {
      moveNumber: 15,
      learningPoint: 'revisit_position',
      userText: {
        situation: 'The only remaining open Position is Position M.\nYou can select not only open Positions, but also Positions you already occupy.',
        question: 'Select Position G and perform a Massive Build on Gate 1.',
        hint: 'Tap Position G, then tap the Large Slot of Gate 1.',
        success: 'You can select and Build up from a Position you already occupy.\nBuilding further on an existing Position allows you to prepare for defense or capture.',
      },
    },

    // moveNumber 16 (M14) auto
    {
      moveNumber: 16,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position M and performed a Selective Build on Gate 7 and Gate 8.',
      },
    },

    // moveNumber 17 (M15-1) select_only
    {
      moveNumber: 17,
      learningPoint: 'gate_check',
      userText: {
        situation: '',
        question: 'First, select Position G.',
        hint: 'Tap Position G.',
        success: 'Selecting Position G lets you check the Diagonal Gates of Position G.',
      },
    },

    // moveNumber 18 (M15-3) user
    {
      moveNumber: 18,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Let\'s check the Build up status of Position G\'s four Diagonal Gates.\nThe current state is as follows:\nGate 1: 2 Large Assets\nGate 4: 1 Large Asset, 2 Middle Assets\nGate 7: 2 Large Assets, 1 Middle Asset\nGate 10: 2 Middle Assets',
        question: 'Next, select Position A and perform a Selective Build on Gate 1 and Gate 2.',
        hint: 'Tap Position A, then tap the Middle Slot of Gate 1, then the Middle Slot of Gate 2.',
        success: 'Control over a Position is determined by the Build up status of its Diagonal Gates.\nIt is important to identify which Gate has received the most Build up.',
      },
    },

    // moveNumber 19 (M16) auto
    {
      moveNumber: 19,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position J and performed a Selective Build on Gate 5 and Gate 7.',
      },
    },

    // moveNumber 20 (M17-1) select_only
    {
      moveNumber: 20,
      learningPoint: 'asset_value',
      userText: {
        situation: 'Build up on Gate 1 and Gate 4 has progressed since earlier.',
        question: 'Select Position G.',
        hint: 'Tap Position G.',
        success: 'Even for the same Position, the control situation changes as more Assets are placed on its Diagonal Gates.',
      },
    },

    // moveNumber 21 (M17-3) user
    {
      moveNumber: 21,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Even all available Small and Middle Assets combined are worth less than one Large Asset.\nFour Small Assets are also worth less than one Middle Asset.\nOf Position G\'s four Diagonal Gates, Gate 7 has received the most Build up.',
        question: 'With Position A selected, perform a Selective Build on Gate 1 and Gate 2.',
        hint: 'Tap Position A, then tap the Middle Slot of Gate 1, then the Middle Slot of Gate 2.',
        success: 'The same Gate can affect the control judgment of multiple Positions.\nIt is important to identify Gates that are significant for multiple Positions.',
      },
    },

    // moveNumber 22 (M18) auto
    {
      moveNumber: 22,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position L and performed a Massive Build on Gate 9.',
      },
    },

    // moveNumber 23 (M19) user
    {
      moveNumber: 23,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Select Position B and perform a Selective Build on Gate 3 and Gate 11.',
        hint: 'Tap Position B, then tap the Middle Slot of Gate 3, then the Middle Slot of Gate 11.',
        success: 'Selective Build can be used with both future attack and defense in mind.',
      },
    },

    // moveNumber 24 (M20) auto
    {
      moveNumber: 24,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position F and performed a Massive Build on Gate 8.',
      },
    },

    // moveNumber 25 (M21-1) select_only
    {
      moveNumber: 25,
      learningPoint: 'capture',
      userText: {
        situation: 'There are cases when you can capture an opponent\'s Position.\nCheck the Gate with the most Build up among the Diagonal Gates of the target Position.\nIf your Build up is dominant over the opponent\'s at that Gate, you can capture the opponent\'s Position.\nRight now, there is one White Position that can be captured.',
        question: 'Select that Position.',
        hint: 'Tap Position E.',
        success: 'Capturing a Position is different from simply selecting an open Position.\nEven a Position occupied by the opponent can be captured as your own if the conditions are met.',
      },
    },

    // moveNumber 26 (M21-2) user
    {
      moveNumber: 26,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'With Position E selected, perform a Massive Build on Gate 10.',
        hint: 'Tap the Large Slot of Gate 10.',
        success: 'By Building up from a captured Position, you can advance both attack and deployment at the same time.',
      },
    },

    // moveNumber 27 (M22) auto
    {
      moveNumber: 27,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position F and performed a Massive Build on Gate 11.',
      },
    },

    // moveNumber 28 (M23-1) select_only
    {
      moveNumber: 28,
      learningPoint: 'defense',
      userText: {
        situation: 'At Position A, Gate 1 and Gate 7 have received equal amounts of Build up, tying for the most among its Diagonal Gates.\nWhen multiple Diagonal Gates tie for the most Build up, compare how many of those Gates each player controls.\nAt Position A, Black controls Gate 1 and White controls Gate 7.\nTherefore, White cannot capture Position A.\nBlack is successfully defending Position A.',
        question: 'First, select Position A.',
        hint: 'Tap Position A.',
        success: 'When there are multiple Gates with the most Build up, the number of Gates controlled becomes important.\nIf they are equal, the capture does not succeed.',
      },
    },

    // moveNumber 29 (M23-2) select_only
    {
      moveNumber: 29,
      learningPoint: 'defense',
      userText: {
        situation: 'Among Position B\'s Diagonal Gates, Gate 11 is the Gate with the most Build up.\nOne Large Asset is worth more than two Middle Assets.\nCurrently, White controls Gate 11.\nIf left as is, there is a risk that White will capture Position B on the next turn.',
        question: 'Deselect Position A and select Position B.',
        hint: 'Tap Position B.',
        success: 'Finding the Position that the opponent can capture next is the first step in defense.\nWhen you find a Position in danger, you need to Build up to break the opponent\'s control.',
      },
    },

    // moveNumber 30 (M23-3) user
    {
      moveNumber: 30,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'With Position B selected, perform a Massive Build on Gate 11.',
        hint: 'Tap the Large Slot of Gate 11.',
        success: 'By performing a Massive Build on Gate 11, Black has regained control of Gate 11.\nThis prevents White from capturing Position B.',
      },
    },

    // moveNumber 31 (M24) auto
    {
      moveNumber: 31,
      learningPoint: 'auto',
      autoText: {
        auto: 'Since Black regained control of Gate 11 with a Massive Build, White could not capture Position B.\n\nWhite selected Position L and performed a Quad Build.',
      },
    },

    // moveNumber 32 (M25-1) select_only
    {
      moveNumber: 32,
      learningPoint: 'capture',
      userText: {
        situation: 'Using the advantage at Gate 11, you can capture one of White\'s Positions.',
        question: 'Select the White Position that can be captured.',
        hint: 'Tap Position F.',
        success: 'The Build up used for defense can lead to the next attack.\nThis is because Gate control affects multiple Positions.',
      },
    },

    // moveNumber 33 (M25-2) user
    {
      moveNumber: 33,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Perform a Selective Build on Gate 11 and Gate 12 to further strengthen Gate 11.',
        hint: 'Tap the Middle Slot of Gate 11, then the Middle Slot of Gate 12.',
        success: 'Further strengthening the Diagonal Gates after a capture makes it easier to protect the captured Position.',
      },
    },

    // moveNumber 34 (M26) auto
    {
      moveNumber: 34,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position M and performed a Quad Build.',
      },
    },

    // moveNumber 35 (M27-1) select_only
    {
      moveNumber: 35,
      learningPoint: 'defense',
      userText: {
        situation: 'If left as is, Position I will be captured by White on the next turn.\nEven if Black performs a Massive Build on Gate 8, Black cannot become dominant.\nAt Gate 8, White has built up 1 Large Asset, 1 Middle Asset, and 4 Small Assets.\nEven if Black performs a Massive Build there, Black would have 1 Large Asset, 1 Middle Asset, and 0 Small Assets.\nThe difference in Small Assets means Black cannot overturn White\'s dominance.',
        question: 'Select Position I.',
        hint: 'Tap Position I.',
        success: 'Placing a Large Asset does not always guarantee you will take control.\nThe difference in already-placed Middle and Small Assets may prevent the control from being overturned.',
      },
    },

    // moveNumber 36 (M27-2) user
    {
      moveNumber: 36,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'To temporarily defend Position I, perform a Massive Build on Gate 4.',
        hint: 'Tap the Large Slot of Gate 4.',
        success: 'When you cannot reverse control of one Gate directly, strengthening another Diagonal Gate may temporarily protect the Position.',
      },
    },

    // moveNumber 37 (M28) auto
    {
      moveNumber: 37,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position L and performed a Massive Build on Gate 8.\n\nWhen determining which Gate has received the most Build up, it does not matter which player placed the Assets.\nAdd both players\' Build up together.\n\nPosition I\'s Diagonal Gates are Gate 4, Gate 8, Gate 10, and Gate 12.\nCurrently, the most built-up Gate among these is Gate 8.\n\nThis situation cannot be overturned in one move.',
      },
    },

    // moveNumber 38 (M29) user
    {
      moveNumber: 38,
      learningPoint: 'capture_quad',
      userText: {
        situation: '',
        question: 'Capture Position D and perform a Quad Build.',
        hint: 'Tap Position D, then tap any Small Slot.',
        success: 'By selecting a capturable Position and performing a Quad Build from there, you can broadly influence the entire board.',
      },
    },

    // moveNumber 39 (M30) auto
    {
      moveNumber: 39,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position I and performed a Massive Build on Gate 10.',
      },
    },

    // moveNumber 40 (M31) user
    {
      moveNumber: 40,
      learningPoint: 'quad_build',
      userText: {
        situation: 'As the endgame approaches, fewer Slots remain open.\nKeep track of which Gates still have room for Build up.',
        question: 'Select Position A and perform a Quad Build.',
        hint: 'Tap Position A, then tap any Small Slot.',
        success: '',
      },
    },

    // moveNumber 41 (M32) auto
    {
      moveNumber: 41,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position H and performed a Selective Build on Gate 5 and Gate 6.',
      },
    },

    // moveNumber 42 (M33) user
    {
      moveNumber: 42,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Select Position G and perform a Quad Build.',
        hint: 'Tap Position G, then tap any Small Slot.',
        success: 'By spreading Assets across the remaining Small Slots, Quad Build can affect narrow margins of control in the endgame.',
      },
    },

    // moveNumber 43 (M34) auto
    {
      moveNumber: 43,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position H and performed a Massive Build on Gate 5.',
      },
    },

    // moveNumber 44 (M35) user
    {
      moveNumber: 44,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Select Position K and perform a Quad Build.',
        hint: 'Tap Position K, then tap any Small Slot.',
        success: 'Continuing to select your own Positions and Build up allows you to expand control and strengthen defense.',
      },
    },

    // moveNumber 45 (M36) auto
    {
      moveNumber: 45,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position M and performed a Massive Build on Gate 6.',
      },
    },

    // moveNumber 46 (M37) user
    {
      moveNumber: 46,
      learningPoint: 'partial_quad',
      userText: {
        situation: 'Gate 11 no longer has any Slots available for Small Assets.\nTherefore, you can perform a Quad Build by building up Small Assets on Gate 4, Gate 9, and Gate 10.\nWith Selective Build and Quad Build, if some target Slots are full, the Build up is performed only where space remains.',
        question: 'Select Position K and perform a Quad Build.',
        hint: 'Tap Position K, then tap any Small Slot.',
        success: 'Even when you cannot place Assets on all target Gates, you can Build up on Gates that still have open Slots.\nThis kind of partial Build up naturally occurs in the endgame.',
      },
    },

    // moveNumber 47 (M38) auto
    {
      moveNumber: 47,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position H and performed a Massive Build on Gate 6.',
      },
    },

    // moveNumber 48 (M39) user
    {
      moveNumber: 48,
      learningPoint: 'prepare_capture',
      userText: {
        situation: 'Now, among Position I\'s Diagonal Gates (Gate 4, Gate 8, Gate 10, Gate 12), the three Gates with the most Build up are Gate 4, Gate 8, and Gate 10.\nFurthermore, Black can establish dominance at Gate 4 and Gate 10.\nTherefore, Black will be able to recapture Position I on its next turn because it will control more of the tied Gates.',
        question: 'Select Position C and perform a Build up to set up the recapture of Position I on the next Black turn.',
        hint: 'Tap Position C, then tap any Small Slot.',
        success: 'Even if a Position cannot be captured immediately, preparing one move in advance can create the conditions needed to capture it on your next turn.\nIn ONE EIGHT, this kind of preparatory Build up is important.',
      },
    },

    // moveNumber 49 (M40) auto
    {
      moveNumber: 49,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position H and performed a Quad Build.',
      },
    },

    // moveNumber 50 (M41) user
    {
      moveNumber: 50,
      learningPoint: 'capture_massive',
      userText: {
        situation: '',
        question: 'Select Position I and perform a Massive Build on Gate 12.',
        hint: 'Tap Position I, then tap the Large Slot of Gate 12.',
        success: 'The control you prepared allows you to recapture Position I.\nContinuing to Build up after the capture can increase the number of Positions you control in the endgame.',
      },
    },

    // moveNumber 51 (M42) auto
    {
      moveNumber: 51,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position H and performed a Massive Build on Gate 2.',
      },
    },

    // moveNumber 52 (M43) user
    {
      moveNumber: 52,
      learningPoint: 'massive_build',
      userText: {
        situation: 'In the endgame, which player takes the remaining Large Slots has a significant impact.',
        question: 'Select Position F and perform a Massive Build on Gate 12.',
        hint: 'Tap Position F, then tap the Large Slot of Gate 12.',
        success: '',
      },
    },

    // moveNumber 53 (M44) auto
    {
      moveNumber: 53,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position L and performed a Massive Build on Gate 9.',
      },
    },

    // moveNumber 54 (M45) user
    {
      moveNumber: 54,
      learningPoint: 'massive_build',
      userText: {
        situation: 'As the game nears its end, fewer Gates remain available for Build up.\nIt is important to make sure you secure the remaining Large Slots.',
        question: 'Select Position C and perform a Massive Build on Gate 3.',
        hint: 'Tap Position C, then tap the Large Slot of Gate 3.',
        success: '',
      },
    },

    // moveNumber 55 (M46) auto
    {
      moveNumber: 55,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position J and performed a Selective Build on Gate 9.',
      },
    },

    // moveNumber 56 (M47) user
    {
      moveNumber: 56,
      learningPoint: 'massive_build',
      userText: {
        situation: 'In the endgame, identify Gates your opponent can no longer reach while filling the remaining Slots at Gates you can still access.',
        question: 'Select Position E and perform a Massive Build on Gate 2.',
        hint: 'Tap Position E, then tap the Large Slot of Gate 2.',
        success: '',
      },
    },

    // moveNumber 57 (M48) auto
    {
      moveNumber: 57,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selected Position J and performed a Selective Build on Gate 9.',
      },
    },

    // moveNumber 58 (M49) user
    {
      moveNumber: 58,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Filling in remaining Small Slots brings the game closer to its end.',
        question: 'Select Position B and perform a Quad Build.',
        hint: 'Tap Position B, then tap any Small Slot.',
        success: '',
      },
    },

    // moveNumber 59 (M50) pass
    {
      moveNumber: 59,
      learningPoint: 'auto_pass',
      autoText: {
        auto: 'White had no legal Build up available, so White\'s turn ended automatically.',
      },
    },

    // moveNumber 60 (M51) user + finalText
    {
      moveNumber: 60,
      learningPoint: 'endgame',
      userText: {
        situation: 'White cannot access the final open Large Slot at Gate 3 from any Position it controls.\nTherefore, White\'s turn ended automatically.',
        question: 'Select Position C and perform a Massive Build on Gate 3.',
        hint: 'Tap Position C, then tap the Large Slot of Gate 3.',
        success: 'All remaining Build up is now complete, and the game ends.\n\nIn ONE EIGHT, the game ends once every Slot at every Gate is filled.\nThe player who controls more Positions at that point wins.',
      },
      finalText: 'All Slots are filled, and the game is over.\n\nWell done. Over the course of a full game of ONE EIGHT, you experienced Massive Build, Selective Build, Quad Build, Capture, defense, and endgame decision-making.',
    },
  ],
};
