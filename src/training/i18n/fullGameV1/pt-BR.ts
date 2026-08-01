import type { FGTrainingText } from './types';

/**
 * Brazilian Portuguese (Português do Brasil) — translated from English canonical source.
 * GAME-specific terms kept in English: ONE EIGHT, Position, Gate, Diagonal Gate,
 * Build up, Asset, Slot, Large Slot, Middle Slot, Small Slot, Massive Build,
 * Selective Build, Quad Build, Capture, Black, White, Move, CPU, Pro, Ghost,
 * Postmortem, Official Arena.
 */
export const FULL_GAME_V1_PT_BR: FGTrainingText = {
  courseId: 'full-game-v1',

  meta: {
    title: 'ONE EIGHT Partida guiada — Pense como Black',
    description: 'Jogue uma partida completa guiada como Black. Experimente Massive Build, Selective Build, Quad Build, Capture, defesa e julgamento de final de partida.',
    finalSummary: 'Você completou uma partida completa de ONE EIGHT. Lembre-se de usar Build up para preparar, defender e capturar quando os valores de controle do Gate atenderem às condições necessárias.',
  },

  steps: [
    {
      moveNumber: 0,
      learningPoint: 'intro',
      introText: 'Um turno é concluído selecionando um Position e realizando um Build up.\n\nSelecione um dos 13 Position no centro do tabuleiro, depois realize Build up de Assets nos Gates acessíveis a partir desse Position.\nApós o Build up ser concluído, o turno passa para o oponente.\n\nVamos tentar.',
    },
    {
      moveNumber: 1,
      learningPoint: 'position_select',
      userText: {
        situation: 'A partida avança com Black primeiro e White segundo.\nÉ o turno de Black.\nOs Position são ordenados de A a M da esquerda para a direita, de cima para baixo.',
        question: 'Primeiro, toque em Position D para selecioná-lo.',
        hint: 'Toque em Position D no tabuleiro.',
        success: 'Ao selecionar Position D, os Gates nos quais é possível realizar Build up a partir desse Position ficam destacados em azul.',
      },
    },
    {
      moveNumber: 2,
      learningPoint: 'position_select',
      userText: {
        situation: 'Os Gates conectados diagonalmente a um Position selecionado são chamados de Diagonal Gates desse Position.\nOs Diagonal Gates destacados em azul estão disponíveis para Build up a partir desse Position.',
        question: 'Toque em Position D novamente para deselecioná-lo, depois selecione Position G.',
        hint: 'Toque em Position G.',
        success: 'Os Gates disponíveis para Build up variam por Position.\nAo reselecionar um Position, os Gates disponíveis também mudam.',
      },
    },
    {
      moveNumber: 3,
      learningPoint: 'massive_build',
      userText: {
        situation: 'O Build up é realizado colocando Assets no Large Slot, Middle Slot ou Small Slot de um Diagonal Gate.\nDe acordo com o tamanho do Slot selecionado, há três tipos de Build up:\nMassive Build\nSelective Build\nQuad Build\nDesta vez, realize um Massive Build no Gate 4.\nSe houver vários Slots do mesmo tamanho, você pode tocar em qualquer um.',
        question: 'Toque no maior Slot do Gate 4 para colocar um Asset.',
        hint: 'Toque no Large Slot (o maior Slot) do Gate 4.',
        success: 'Com Massive Build, você coloca um Asset no Large Slot de um Gate.\nLarge Assets têm grande valor no controle de Position mais tarde.',
      },
    },
    {
      moveNumber: 4,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position J e realizou um Massive Build no Gate 7.\n\nAs peças colocadas por meio do Build up são chamadas de Assets. A direção da seta de um Asset indica qual jogador o colocou.\n\nUm Asset com a seta apontando para você foi colocado por você.',
      },
    },
    {
      moveNumber: 5,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Com Selective Build, você coloca Assets nos Middle Slots de dois Gates diferentes.\nVocê não pode colocar Assets em ambos os Middle Slots do mesmo Gate em um único Selective Build.',
        question: 'Selecione Position K e realize um Selective Build no Gate 4 e Gate 10.',
        hint: 'Toque em Position K, depois no Middle Slot do Gate 4, depois no Middle Slot do Gate 10.',
        success: 'Selective Build distribui Middle Assets em dois Gates.\nTem menos influência em um único Gate do que Massive Build, mas pode afetar vários Gates de uma vez.',
      },
    },
    {
      moveNumber: 6,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position E e realizou um Selective Build no Gate 6 e Gate 10.\n\nO último movimento do oponente fica destacado em amarelo.',
      },
    },
    {
      moveNumber: 7,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Com Quad Build, você coloca Assets nos Small Slots de todos os quatro Diagonal Gates acessíveis a partir desse Position.',
        question: 'Selecione Position B e realize um Quad Build.',
        hint: 'Toque em Position B, depois toque em qualquer Small Slot.',
        success: 'Quad Build coloca Assets amplamente em quatro Gates.\nEmbora o valor de cada Asset seja pequeno, pode afetar vários Gates simultaneamente.',
      },
    },
    {
      moveNumber: 8,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position D e realizou um Massive Build no Gate 7.\n\nEste Build up preencheu o Large Slot do Gate 7.',
      },
    },
    {
      moveNumber: 9,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Assim como Gate 6 e Gate 10, tanto Black quanto White podem realizar Build up no mesmo Gate.\nUm Gate consiste nos seguintes Slots:\nLarge Slots: 2\nMiddle Slots: 2\nSmall Slots: 4',
        question: 'Selecione Position I e realize um Selective Build no Gate 8 e Gate 12.',
        hint: 'Toque em Position I, depois no Middle Slot do Gate 8, depois no Middle Slot do Gate 12.',
        success: 'Quando Assets de Black e White estão no mesmo Gate, surge uma disputa pelo controle.\nQual jogador domina esse Gate é determinado pelo valor dos Assets colocados.',
      },
    },
    {
      moveNumber: 10,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position L e realizou um Quad Build.\n\nA partida termina quando todos os Slots de todos os Gates forem preenchidos em turnos alternados.\n\nNo final da partida, o jogador com mais Position vence.',
      },
    },
    {
      moveNumber: 11,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Selecione Position C e realize um Selective Build no Gate 3 e Gate 4.',
        hint: 'Toque em Position C, depois no Middle Slot do Gate 3, depois no Middle Slot do Gate 4.',
        success: 'Usar Selective Build permite que você afete simultaneamente Gates relacionados a vários Position.',
      },
    },
    {
      moveNumber: 12,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position F e realizou um Quad Build.',
      },
    },
    {
      moveNumber: 13,
      learningPoint: 'massive_build',
      userText: {
        situation: '',
        question: 'Selecione Position A e realize um Massive Build no Gate 1.',
        hint: 'Toque em Position A, depois no Large Slot do Gate 1.',
        success: 'Massive Build é eficaz quando você quer controlar fortemente um Gate específico.',
      },
    },
    {
      moveNumber: 14,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position H e realizou um Massive Build no Gate 5.',
      },
    },
    {
      moveNumber: 15,
      learningPoint: 'revisit_position',
      userText: {
        situation: 'O único Position livre restante é Position M.\nVocê pode selecionar não apenas Position livres, mas também Position que já ocupa.',
        question: 'Selecione Position G e realize um Massive Build no Gate 1.',
        hint: 'Toque em Position G, depois no Large Slot do Gate 1.',
        success: 'Você pode selecionar e realizar Build up a partir de um Position que já ocupa.\nContinuar construindo em um Position existente permite preparar defesa ou Capture.',
      },
    },
    {
      moveNumber: 16,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position M e realizou um Selective Build no Gate 7 e Gate 8.',
      },
    },
    {
      moveNumber: 17,
      learningPoint: 'gate_check',
      userText: {
        situation: '',
        question: 'Primeiro, selecione Position G.',
        hint: 'Toque em Position G.',
        success: 'Selecionar Position G permite verificar os Diagonal Gates de Position G.',
      },
    },
    {
      moveNumber: 18,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Vamos verificar o status de Build up dos quatro Diagonal Gates de Position G.\nO estado atual é:\nGate 1: 2 Large Assets\nGate 4: 1 Large Asset, 2 Middle Assets\nGate 7: 2 Large Assets, 1 Middle Asset\nGate 10: 2 Middle Assets',
        question: 'Agora selecione Position A e realize um Selective Build no Gate 1 e Gate 2.',
        hint: 'Toque em Position A, depois no Middle Slot do Gate 1, depois no Middle Slot do Gate 2.',
        success: 'O controle sobre um Position é determinado pelo status de Build up de seus Diagonal Gates.\nÉ importante identificar qual Gate recebeu mais Build up.',
      },
    },
    {
      moveNumber: 19,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position J e realizou um Selective Build no Gate 5 e Gate 7.',
      },
    },
    {
      moveNumber: 20,
      learningPoint: 'asset_value',
      userText: {
        situation: 'O Build up no Gate 1 e Gate 4 progrediu desde antes.',
        question: 'Selecione Position G.',
        hint: 'Toque em Position G.',
        success: 'Mesmo para o mesmo Position, a situação de controle muda à medida que mais Assets são colocados em seus Diagonal Gates.',
      },
    },
    {
      moveNumber: 21,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Mesmo todos os Small e Middle Assets disponíveis combinados valem menos do que um Large Asset.\nQuatro Small Assets também valem menos do que um Middle Asset.\nDos quatro Diagonal Gates de Position G, Gate 7 é o que recebeu mais Build up.',
        question: 'Com Position A selecionado, realize um Selective Build no Gate 1 e Gate 2.',
        hint: 'Toque em Position A, depois no Middle Slot do Gate 1, depois no Middle Slot do Gate 2.',
        success: 'O mesmo Gate pode afetar o julgamento de controle de vários Position.\nÉ importante identificar Gates significativos para vários Position.',
      },
    },
    {
      moveNumber: 22,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position L e realizou um Massive Build no Gate 9.',
      },
    },
    {
      moveNumber: 23,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Selecione Position B e realize um Selective Build no Gate 3 e Gate 11.',
        hint: 'Toque em Position B, depois no Middle Slot do Gate 3, depois no Middle Slot do Gate 11.',
        success: 'Selective Build pode ser usado pensando tanto no ataque quanto na defesa futura.',
      },
    },
    {
      moveNumber: 24,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position F e realizou um Massive Build no Gate 8.',
      },
    },
    {
      moveNumber: 25,
      learningPoint: 'capture',
      userText: {
        situation: 'Há casos em que você pode capturar um Position do oponente.\nVerifique o Gate com mais Build up entre os Diagonal Gates do Position alvo.\nSe seu Build up dominar o do oponente nesse Gate, você pode capturar o Position do oponente.\nAgora, há um Position de White que pode ser capturado.',
        question: 'Selecione esse Position.',
        hint: 'Toque em Position E.',
        success: 'Capturar um Position é diferente de simplesmente selecionar um Position livre.\nMesmo um Position ocupado pelo oponente pode ser capturado se as condições forem atendidas.',
      },
    },
    {
      moveNumber: 26,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Com Position E selecionado, realize um Massive Build no Gate 10.',
        hint: 'Toque no Large Slot do Gate 10.',
        success: 'Ao realizar Build up a partir de um Position capturado, você pode avançar tanto em ataque quanto em implantação ao mesmo tempo.',
      },
    },
    {
      moveNumber: 27,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position F e realizou um Massive Build no Gate 11.',
      },
    },
    {
      moveNumber: 28,
      learningPoint: 'defense',
      userText: {
        situation: 'Em Position A, Gate 1 e Gate 7 receberam quantidades iguais de Build up, empatando como os mais construídos entre seus Diagonal Gates.\nQuando vários Diagonal Gates empatam como os mais construídos, compara-se quantos desses Gates cada jogador controla.\nEm Position A, Black controla Gate 1 e White controla Gate 7.\nPortanto, White não pode capturar Position A.\nBlack está defendendo Position A com sucesso.',
        question: 'Primeiro, selecione Position A.',
        hint: 'Toque em Position A.',
        success: 'Quando há vários Gates com mais Build up, o número de Gates controlados se torna importante.\nSe forem iguais, a captura não tem êxito.',
      },
    },
    {
      moveNumber: 29,
      learningPoint: 'defense',
      userText: {
        situation: 'Entre os Diagonal Gates de Position B, Gate 11 é o Gate com mais Build up.\nUm Large Asset vale mais do que dois Middle Assets.\nAtualmente, White controla Gate 11.\nSe deixado assim, há risco de White capturar Position B no próximo turno.',
        question: 'Deselecione Position A e selecione Position B.',
        hint: 'Toque em Position B.',
        success: 'Encontrar o Position que o oponente pode capturar a seguir é o primeiro passo na defesa.\nQuando encontrar um Position em perigo, você precisa realizar Build up para romper o controle do oponente.',
      },
    },
    {
      moveNumber: 30,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'Com Position B selecionado, realize um Massive Build no Gate 11.',
        hint: 'Toque no Large Slot do Gate 11.',
        success: 'Ao realizar Massive Build no Gate 11, Black recuperou o controle do Gate 11.\nIsso evita que White capture Position B.',
      },
    },
    {
      moveNumber: 31,
      learningPoint: 'auto',
      autoText: {
        auto: 'Como Black recuperou o controle do Gate 11 com um Massive Build, White não pôde capturar Position B.\n\nWhite selecionou Position L e realizou um Quad Build.',
      },
    },
    {
      moveNumber: 32,
      learningPoint: 'capture',
      userText: {
        situation: 'Usando a vantagem no Gate 11, você pode capturar um dos Position de White.',
        question: 'Selecione o Position de White que pode ser capturado.',
        hint: 'Toque em Position F.',
        success: 'O Build up usado para defesa pode levar ao próximo ataque.\nIsso ocorre porque o controle do Gate afeta vários Position.',
      },
    },
    {
      moveNumber: 33,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Realize um Selective Build no Gate 11 e Gate 12 para fortalecer mais o Gate 11.',
        hint: 'Toque no Middle Slot do Gate 11, depois no Middle Slot do Gate 12.',
        success: 'Fortalecer mais os Diagonal Gates após uma captura facilita proteger o Position capturado.',
      },
    },
    {
      moveNumber: 34,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position M e realizou um Quad Build.',
      },
    },
    {
      moveNumber: 35,
      learningPoint: 'defense',
      userText: {
        situation: 'Se deixado assim, White capturará Position I no próximo turno.\nMesmo que Black realize Massive Build no Gate 8, Black não pode dominar.\nNo Gate 8, White construiu 1 Large Asset, 1 Middle Asset e 4 Small Assets.\nMesmo que Black realize Massive Build ali, Black teria 1 Large Asset, 1 Middle Asset e 0 Small Assets.\nA diferença nos Small Assets significa que Black não pode reverter o domínio de White.',
        question: 'Selecione Position I.',
        hint: 'Toque em Position I.',
        success: 'Colocar um Large Asset nem sempre garante que você obterá o controle.\nA diferença em Middle e Small Assets já colocados pode impedir que o controle seja revertido.',
      },
    },
    {
      moveNumber: 36,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'Para defender temporariamente Position I, realize um Massive Build no Gate 4.',
        hint: 'Toque no Large Slot do Gate 4.',
        success: 'Quando você não pode reverter diretamente o controle de um Gate, fortalecer outro Diagonal Gate pode proteger temporariamente o Position.',
      },
    },
    {
      moveNumber: 37,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position L e realizou um Massive Build no Gate 8.\n\nAo determinar qual Gate recebeu mais Build up, não importa qual jogador colocou os Assets.\nSoma-se o Build up de ambos os jogadores.\n\nOs Diagonal Gates de Position I são Gate 4, Gate 8, Gate 10 e Gate 12.\nAtualmente, o Gate com mais Build up entre esses é Gate 8.\n\nEssa situação não pode ser revertida em um movimento.',
      },
    },
    {
      moveNumber: 38,
      learningPoint: 'capture_quad',
      userText: {
        situation: '',
        question: 'Capture Position D e realize um Quad Build.',
        hint: 'Toque em Position D, depois toque em qualquer Small Slot.',
        success: 'Ao selecionar um Position capturável e realizar Quad Build a partir dele, você pode influenciar amplamente todo o tabuleiro.',
      },
    },
    {
      moveNumber: 39,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position I e realizou um Massive Build no Gate 10.',
      },
    },
    {
      moveNumber: 40,
      learningPoint: 'quad_build',
      userText: {
        situation: 'À medida que o final da partida se aproxima, menos Slots permanecem abertos.\nAcompanhe quais Gates ainda têm espaço para Build up.',
        question: 'Selecione Position A e realize um Quad Build.',
        hint: 'Toque em Position A, depois toque em qualquer Small Slot.',
        success: '',
      },
    },
    {
      moveNumber: 41,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position H e realizou um Selective Build no Gate 5 e Gate 6.',
      },
    },
    {
      moveNumber: 42,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Selecione Position G e realize um Quad Build.',
        hint: 'Toque em Position G, depois toque em qualquer Small Slot.',
        success: 'Ao distribuir Assets pelos Small Slots restantes, Quad Build pode afetar margens estreitas de controle no final da partida.',
      },
    },
    {
      moveNumber: 43,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position H e realizou um Massive Build no Gate 5.',
      },
    },
    {
      moveNumber: 44,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Selecione Position K e realize um Quad Build.',
        hint: 'Toque em Position K, depois toque em qualquer Small Slot.',
        success: 'Continuar selecionando seus Position e realizando Build up permite expandir o controle e fortalecer a defesa.',
      },
    },
    {
      moveNumber: 45,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position M e realizou um Massive Build no Gate 6.',
      },
    },
    {
      moveNumber: 46,
      learningPoint: 'partial_quad',
      userText: {
        situation: 'Gate 11 não tem mais Slots disponíveis para Small Assets.\nPortanto, você pode realizar um Quad Build construindo Small Assets no Gate 4, Gate 9 e Gate 10.\nCom Selective Build e Quad Build, se alguns Slots alvo estiverem cheios, o Build up é realizado apenas onde há espaço.',
        question: 'Selecione Position K e realize um Quad Build.',
        hint: 'Toque em Position K, depois toque em qualquer Small Slot.',
        success: 'Mesmo quando você não pode colocar Assets em todos os Gates alvo, pode realizar Build up em Gates que ainda tenham Slots abertos.\nEsse tipo de Build up parcial ocorre naturalmente no final da partida.',
      },
    },
    {
      moveNumber: 47,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position H e realizou um Massive Build no Gate 6.',
      },
    },
    {
      moveNumber: 48,
      learningPoint: 'prepare_capture',
      userText: {
        situation: 'Agora, entre os Diagonal Gates de Position I (Gate 4, Gate 8, Gate 10, Gate 12), os três Gates com mais Build up são Gate 4, Gate 8 e Gate 10.\nAlém disso, Black pode estabelecer domínio em Gate 4 e Gate 10.\nPortanto, Black poderá recapturar Position I em seu próximo turno porque controlará mais dos Gates empatados.',
        question: 'Selecione Position C e realize um Build up para preparar a recaptura de Position I no próximo turno de Black.',
        hint: 'Toque em Position C, depois toque em qualquer Small Slot.',
        success: 'Mesmo que um Position não possa ser capturado imediatamente, preparar-se com um movimento de antecipação pode criar as condições necessárias para capturá-lo no seu próximo turno.\nEm ONE EIGHT, esse tipo de Build up preparatório é importante.',
      },
    },
    {
      moveNumber: 49,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position H e realizou um Quad Build.',
      },
    },
    {
      moveNumber: 50,
      learningPoint: 'capture_massive',
      userText: {
        situation: '',
        question: 'Selecione Position I e realize um Massive Build no Gate 12.',
        hint: 'Toque em Position I, depois no Large Slot do Gate 12.',
        success: 'O controle que você preparou permite recapturar Position I.\nContinuar realizando Build up após a captura pode aumentar o número de Position que você controla no final.',
      },
    },
    {
      moveNumber: 51,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position H e realizou um Massive Build no Gate 2.',
      },
    },
    {
      moveNumber: 52,
      learningPoint: 'massive_build',
      userText: {
        situation: 'No final da partida, qual jogador obtém os Large Slots restantes tem um impacto significativo.',
        question: 'Selecione Position F e realize um Massive Build no Gate 12.',
        hint: 'Toque em Position F, depois no Large Slot do Gate 12.',
        success: '',
      },
    },
    {
      moveNumber: 53,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position L e realizou um Massive Build no Gate 9.',
      },
    },
    {
      moveNumber: 54,
      learningPoint: 'massive_build',
      userText: {
        situation: 'À medida que a partida se aproxima do fim, menos Gates permanecem disponíveis para Build up.\nÉ importante garantir que você obtenha os Large Slots restantes.',
        question: 'Selecione Position C e realize um Massive Build no Gate 3.',
        hint: 'Toque em Position C, depois no Large Slot do Gate 3.',
        success: '',
      },
    },
    {
      moveNumber: 55,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position J e realizou um Selective Build no Gate 9.',
      },
    },
    {
      moveNumber: 56,
      learningPoint: 'massive_build',
      userText: {
        situation: 'No final, identifique Gates que seu oponente não pode mais alcançar enquanto preenche os Slots restantes em Gates que você ainda pode acessar.',
        question: 'Selecione Position E e realize um Massive Build no Gate 2.',
        hint: 'Toque em Position E, depois no Large Slot do Gate 2.',
        success: '',
      },
    },
    {
      moveNumber: 57,
      learningPoint: 'auto',
      autoText: {
        auto: 'White selecionou Position J e realizou um Selective Build no Gate 9.',
      },
    },
    {
      moveNumber: 58,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Preencher os Small Slots restantes aproxima a partida do fim.',
        question: 'Selecione Position B e realize um Quad Build.',
        hint: 'Toque em Position B, depois toque em qualquer Small Slot.',
        success: '',
      },
    },
    {
      moveNumber: 59,
      learningPoint: 'auto_pass',
      autoText: {
        auto: 'White não tinha Build up legal disponível, então o turno de White terminou automaticamente.',
      },
    },
    {
      moveNumber: 60,
      learningPoint: 'endgame',
      userText: {
        situation: 'White não pode acessar o último Large Slot aberto no Gate 3 a partir de nenhum Position que controla.\nPortanto, o turno de White terminou automaticamente.',
        question: 'Selecione Position C e realize um Massive Build no Gate 3.',
        hint: 'Toque em Position C, depois no Large Slot do Gate 3.',
        success: 'Todo o Build up restante está agora completo e a partida termina.\n\nEm ONE EIGHT, a partida termina quando todos os Slots de todos os Gates estão preenchidos.\nO jogador que controla mais Position naquele momento vence.',
      },
      finalText: 'Todos os Slots estão preenchidos e a partida acabou.\n\nMuito bem. Ao longo de uma partida completa de ONE EIGHT, você experimentou Massive Build, Selective Build, Quad Build, Capture, defesa e tomada de decisões no final da partida.',
    },
  ],
};
