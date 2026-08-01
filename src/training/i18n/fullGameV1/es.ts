import type { FGTrainingText } from './types';

/**
 * Spanish (Español) — translated from English canonical source.
 * International Spanish, neutral gender. Concise instructional style.
 * GAME-specific terms kept in English: ONE EIGHT, Position, Gate, Diagonal Gate,
 * Build up, Asset, Slot, Large Slot, Middle Slot, Small Slot, Massive Build,
 * Selective Build, Quad Build, Capture, Black, White, Move, CPU, Pro, Ghost,
 * Postmortem, Official Arena.
 */
export const FULL_GAME_V1_ES: FGTrainingText = {
  courseId: 'full-game-v1',

  meta: {
    title: 'ONE EIGHT Partida guiada — Piensa como Black',
    description: 'Juega una partida completa guiada como Black. Experimenta Massive Build, Selective Build, Quad Build, Capture, defensa y juicio de final de partida.',
    finalSummary: 'Has completado una partida completa de ONE EIGHT. Recuerda usar Build up para preparar, defender y capturar cuando los valores de control de Gate cumplan las condiciones requeridas.',
  },

  steps: [
    {
      moveNumber: 0,
      learningPoint: 'intro',
      introText: 'Un turno se completa seleccionando un Position y realizando un Build up.\n\nSelecciona uno de los 13 Position en el centro del tablero, luego realiza Build up de Assets en los Gates accesibles desde ese Position.\nUna vez completado el Build up, el turno pasa al oponente.\n\nVamos a intentarlo.',
    },
    {
      moveNumber: 1,
      learningPoint: 'position_select',
      userText: {
        situation: 'La partida avanza con Black primero y White segundo.\nEs el turno de Black.\nLos Position se ordenan de A a M de izquierda a derecha, de arriba a abajo.',
        question: 'Primero, toca Position D para seleccionarlo.',
        hint: 'Toca Position D en el tablero.',
        success: 'Al seleccionar Position D, los Gates desde los que se puede realizar Build up se resaltan en azul.',
      },
    },
    {
      moveNumber: 2,
      learningPoint: 'position_select',
      userText: {
        situation: 'Los Gates conectados diagonalmente a un Position seleccionado se llaman Diagonal Gates de ese Position.\nLos Diagonal Gates resaltados en azul están disponibles para Build up desde ese Position.',
        question: 'Toca Position D de nuevo para deseleccionarlo, luego selecciona Position G.',
        hint: 'Toca Position G.',
        success: 'Los Gates disponibles para Build up varían según el Position.\nAl volver a seleccionar un Position, los Gates disponibles también cambian.',
      },
    },
    {
      moveNumber: 3,
      learningPoint: 'massive_build',
      userText: {
        situation: 'El Build up se realiza colocando Assets en el Large Slot, Middle Slot o Small Slot de un Diagonal Gate.\nSegún el tamaño del Slot seleccionado, hay tres tipos de Build up:\nMassive Build\nSelective Build\nQuad Build\nEsta vez, realiza un Massive Build en Gate 4.\nSi hay varios Slots del mismo tamaño, puedes tocar cualquiera.',
        question: 'Toca el Slot más grande de Gate 4 para colocar un Asset.',
        hint: 'Toca el Large Slot (el Slot más grande) de Gate 4.',
        success: 'Con Massive Build, colocas un Asset en el Large Slot de un Gate.\nLos Large Assets tienen gran valor en el control de Position más adelante.',
      },
    },
    {
      moveNumber: 4,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position J y realizó un Massive Build en Gate 7.\n\nLas piezas colocadas mediante Build up se llaman Assets. La dirección de la flecha de un Asset indica qué jugador lo colocó.\n\nUn Asset cuya flecha apunta hacia ti fue colocado por ti.',
      },
    },
    {
      moveNumber: 5,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Con Selective Build, colocas Assets en los Middle Slots de dos Gates diferentes.\nNo puedes colocar Assets en ambos Middle Slots del mismo Gate en un solo Selective Build.',
        question: 'Selecciona Position K y realiza un Selective Build en Gate 4 y Gate 10.',
        hint: 'Toca Position K, luego el Middle Slot de Gate 4, luego el Middle Slot de Gate 10.',
        success: 'Selective Build distribuye Middle Assets en dos Gates.\nTiene menos influencia en un Gate individual que Massive Build, pero puede afectar múltiples Gates a la vez.',
      },
    },
    {
      moveNumber: 6,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position E y realizó un Selective Build en Gate 6 y Gate 10.\n\nEl último movimiento del oponente se resalta en amarillo.',
      },
    },
    {
      moveNumber: 7,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Con Quad Build, colocas Assets en los Small Slots de los cuatro Diagonal Gates accesibles desde ese Position.',
        question: 'Selecciona Position B y realiza un Quad Build.',
        hint: 'Toca Position B, luego toca cualquier Small Slot.',
        success: 'Quad Build coloca Assets ampliamente en cuatro Gates.\nAunque el valor de cada Asset es pequeño, puede afectar múltiples Gates simultáneamente.',
      },
    },
    {
      moveNumber: 8,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position D y realizó un Massive Build en Gate 7.\n\nEste Build up llenó el Large Slot de Gate 7.',
      },
    },
    {
      moveNumber: 9,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Al igual que Gate 6 y Gate 10, tanto Black como White pueden realizar Build up en el mismo Gate.\nUn Gate tiene los siguientes Slots:\nLarge Slots: 2\nMiddle Slots: 2\nSmall Slots: 4',
        question: 'Selecciona Position I y realiza un Selective Build en Gate 8 y Gate 12.',
        hint: 'Toca Position I, luego el Middle Slot de Gate 8, luego el Middle Slot de Gate 12.',
        success: 'Cuando hay Assets de Black y White en el mismo Gate, surge una disputa por el control.\nQuién domina ese Gate se determina por el valor de los Assets colocados.',
      },
    },
    {
      moveNumber: 10,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position L y realizó un Quad Build.\n\nLa partida termina cuando todos los Slots de todos los Gates se han llenado en turnos alternos.\n\nAl final de la partida, gana el jugador con más Position.',
      },
    },
    {
      moveNumber: 11,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Selecciona Position C y realiza un Selective Build en Gate 3 y Gate 4.',
        hint: 'Toca Position C, luego el Middle Slot de Gate 3, luego el Middle Slot de Gate 4.',
        success: 'Usar Selective Build te permite afectar simultáneamente Gates relacionados con múltiples Position.',
      },
    },
    {
      moveNumber: 12,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position F y realizó un Quad Build.',
      },
    },
    {
      moveNumber: 13,
      learningPoint: 'massive_build',
      userText: {
        situation: '',
        question: 'Selecciona Position A y realiza un Massive Build en Gate 1.',
        hint: 'Toca Position A, luego el Large Slot de Gate 1.',
        success: 'Massive Build es efectivo cuando quieres controlar fuertemente un Gate específico.',
      },
    },
    {
      moveNumber: 14,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position H y realizó un Massive Build en Gate 5.',
      },
    },
    {
      moveNumber: 15,
      learningPoint: 'revisit_position',
      userText: {
        situation: 'El único Position libre restante es Position M.\nPuedes seleccionar no solo los Position libres, sino también los que ya ocupas.',
        question: 'Selecciona Position G y realiza un Massive Build en Gate 1.',
        hint: 'Toca Position G, luego el Large Slot de Gate 1.',
        success: 'Puedes seleccionar y realizar Build up desde un Position que ya ocupas.\nSeguir construyendo en un Position existente permite preparar defensa o Capture.',
      },
    },
    {
      moveNumber: 16,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position M y realizó un Selective Build en Gate 7 y Gate 8.',
      },
    },
    {
      moveNumber: 17,
      learningPoint: 'gate_check',
      userText: {
        situation: '',
        question: 'Primero, selecciona Position G.',
        hint: 'Toca Position G.',
        success: 'Al seleccionar Position G puedes verificar los Diagonal Gates de Position G.',
      },
    },
    {
      moveNumber: 18,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Revisemos el estado de Build up de los cuatro Diagonal Gates de Position G.\nEl estado actual es:\nGate 1: 2 Large Assets\nGate 4: 1 Large Asset, 2 Middle Assets\nGate 7: 2 Large Assets, 1 Middle Asset\nGate 10: 2 Middle Assets',
        question: 'Ahora selecciona Position A y realiza un Selective Build en Gate 1 y Gate 2.',
        hint: 'Toca Position A, luego el Middle Slot de Gate 1, luego el Middle Slot de Gate 2.',
        success: 'El control sobre un Position se determina por el estado de Build up de sus Diagonal Gates.\nEs importante identificar qué Gate ha recibido más Build up.',
      },
    },
    {
      moveNumber: 19,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position J y realizó un Selective Build en Gate 5 y Gate 7.',
      },
    },
    {
      moveNumber: 20,
      learningPoint: 'asset_value',
      userText: {
        situation: 'El Build up en Gate 1 y Gate 4 ha progresado desde antes.',
        question: 'Selecciona Position G.',
        hint: 'Toca Position G.',
        success: 'Incluso para el mismo Position, la situación de control cambia a medida que se colocan más Assets en sus Diagonal Gates.',
      },
    },
    {
      moveNumber: 21,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Incluso todos los Small y Middle Assets disponibles juntos valen menos que un Large Asset.\nCuatro Small Assets también valen menos que un Middle Asset.\nDe los cuatro Diagonal Gates de Position G, Gate 7 es el que ha recibido más Build up.',
        question: 'Con Position A seleccionado, realiza un Selective Build en Gate 1 y Gate 2.',
        hint: 'Toca Position A, luego el Middle Slot de Gate 1, luego el Middle Slot de Gate 2.',
        success: 'El mismo Gate puede afectar el juicio de control de múltiples Position.\nEs importante identificar los Gates significativos para múltiples Position.',
      },
    },
    {
      moveNumber: 22,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position L y realizó un Massive Build en Gate 9.',
      },
    },
    {
      moveNumber: 23,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Selecciona Position B y realiza un Selective Build en Gate 3 y Gate 11.',
        hint: 'Toca Position B, luego el Middle Slot de Gate 3, luego el Middle Slot de Gate 11.',
        success: 'Selective Build puede usarse pensando tanto en el ataque como en la defensa futura.',
      },
    },
    {
      moveNumber: 24,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position F y realizó un Massive Build en Gate 8.',
      },
    },
    {
      moveNumber: 25,
      learningPoint: 'capture',
      userText: {
        situation: 'Hay casos en que puedes capturar un Position del oponente.\nVerifica el Gate con más Build up entre los Diagonal Gates del Position objetivo.\nSi tu Build up domina al del oponente en ese Gate, puedes capturar el Position del oponente.\nEn este momento, hay un Position de White que puede ser capturado.',
        question: 'Selecciona ese Position.',
        hint: 'Toca Position E.',
        success: 'Capturar un Position es diferente a seleccionar simplemente un Position libre.\nIncluso un Position ocupado por el oponente puede capturarse si se cumplen las condiciones.',
      },
    },
    {
      moveNumber: 26,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Con Position E seleccionado, realiza un Massive Build en Gate 10.',
        hint: 'Toca el Large Slot de Gate 10.',
        success: 'Al realizar Build up desde un Position capturado, puedes avanzar en ataque y despliegue al mismo tiempo.',
      },
    },
    {
      moveNumber: 27,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position F y realizó un Massive Build en Gate 11.',
      },
    },
    {
      moveNumber: 28,
      learningPoint: 'defense',
      userText: {
        situation: 'En Position A, Gate 1 y Gate 7 han recibido cantidades iguales de Build up, empatando como los más construidos entre sus Diagonal Gates.\nCuando varios Diagonal Gates empatan como los más construidos, se compara cuántos de esos Gates controla cada jugador.\nEn Position A, Black controla Gate 1 y White controla Gate 7.\nPor lo tanto, White no puede capturar Position A.\nBlack está defendiendo con éxito Position A.',
        question: 'Primero, selecciona Position A.',
        hint: 'Toca Position A.',
        success: 'Cuando hay varios Gates con más Build up, el número de Gates controlados se vuelve importante.\nSi son iguales, la captura no tiene éxito.',
      },
    },
    {
      moveNumber: 29,
      learningPoint: 'defense',
      userText: {
        situation: 'Entre los Diagonal Gates de Position B, Gate 11 es el Gate con más Build up.\nUn Large Asset vale más que dos Middle Assets.\nActualmente, White controla Gate 11.\nSi se deja así, hay riesgo de que White capture Position B en el siguiente turno.',
        question: 'Deselecciona Position A y selecciona Position B.',
        hint: 'Toca Position B.',
        success: 'Encontrar el Position que el oponente puede capturar a continuación es el primer paso en la defensa.\nCuando encuentres un Position en peligro, necesitas realizar Build up para romper el control del oponente.',
      },
    },
    {
      moveNumber: 30,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'Con Position B seleccionado, realiza un Massive Build en Gate 11.',
        hint: 'Toca el Large Slot de Gate 11.',
        success: 'Al realizar Massive Build en Gate 11, Black recuperó el control de Gate 11.\nEsto evita que White capture Position B.',
      },
    },
    {
      moveNumber: 31,
      learningPoint: 'auto',
      autoText: {
        auto: 'Ya que Black recuperó el control de Gate 11 con un Massive Build, White no pudo capturar Position B.\n\nWhite seleccionó Position L y realizó un Quad Build.',
      },
    },
    {
      moveNumber: 32,
      learningPoint: 'capture',
      userText: {
        situation: 'Usando la ventaja en Gate 11, puedes capturar uno de los Position de White.',
        question: 'Selecciona el Position de White que puede ser capturado.',
        hint: 'Toca Position F.',
        success: 'El Build up usado para defensa puede llevar al siguiente ataque.\nEsto es porque el control de Gate afecta múltiples Position.',
      },
    },
    {
      moveNumber: 33,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Realiza un Selective Build en Gate 11 y Gate 12 para fortalecer más Gate 11.',
        hint: 'Toca el Middle Slot de Gate 11, luego el Middle Slot de Gate 12.',
        success: 'Fortalecer más los Diagonal Gates después de una captura facilita proteger el Position capturado.',
      },
    },
    {
      moveNumber: 34,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position M y realizó un Quad Build.',
      },
    },
    {
      moveNumber: 35,
      learningPoint: 'defense',
      userText: {
        situation: 'Si se deja así, White capturará Position I en el siguiente turno.\nIncluso si Black realiza Massive Build en Gate 8, Black no puede dominar.\nEn Gate 8, White ha construido 1 Large Asset, 1 Middle Asset y 4 Small Assets.\nIncluso si Black realiza Massive Build allí, Black tendría 1 Large Asset, 1 Middle Asset y 0 Small Assets.\nLa diferencia en Small Assets significa que Black no puede revertir el dominio de White.',
        question: 'Selecciona Position I.',
        hint: 'Toca Position I.',
        success: 'Colocar un Large Asset no siempre garantiza que tomarás el control.\nLa diferencia en Middle y Small Assets ya colocados puede impedir que el control sea revertido.',
      },
    },
    {
      moveNumber: 36,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'Para defender temporalmente Position I, realiza un Massive Build en Gate 4.',
        hint: 'Toca el Large Slot de Gate 4.',
        success: 'Cuando no puedes revertir directamente el control de un Gate, fortalecer otro Diagonal Gate puede proteger temporalmente el Position.',
      },
    },
    {
      moveNumber: 37,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position L y realizó un Massive Build en Gate 8.\n\nAl determinar qué Gate ha recibido más Build up, no importa qué jugador colocó los Assets.\nSe suman los Build up de ambos jugadores.\n\nLos Diagonal Gates de Position I son Gate 4, Gate 8, Gate 10 y Gate 12.\nActualmente, el Gate con más Build up entre estos es Gate 8.\n\nEsta situación no puede revertirse en un movimiento.',
      },
    },
    {
      moveNumber: 38,
      learningPoint: 'capture_quad',
      userText: {
        situation: '',
        question: 'Captura Position D y realiza un Quad Build.',
        hint: 'Toca Position D, luego toca cualquier Small Slot.',
        success: 'Al seleccionar un Position capturable y realizar Quad Build desde allí, puedes influir ampliamente en todo el tablero.',
      },
    },
    {
      moveNumber: 39,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position I y realizó un Massive Build en Gate 10.',
      },
    },
    {
      moveNumber: 40,
      learningPoint: 'quad_build',
      userText: {
        situation: 'A medida que se acerca el final de la partida, quedan menos Slots abiertos.\nMantén un registro de qué Gates aún tienen espacio para Build up.',
        question: 'Selecciona Position A y realiza un Quad Build.',
        hint: 'Toca Position A, luego toca cualquier Small Slot.',
        success: '',
      },
    },
    {
      moveNumber: 41,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position H y realizó un Selective Build en Gate 5 y Gate 6.',
      },
    },
    {
      moveNumber: 42,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Selecciona Position G y realiza un Quad Build.',
        hint: 'Toca Position G, luego toca cualquier Small Slot.',
        success: 'Al distribuir Assets en los Small Slots restantes, Quad Build puede afectar márgenes estrechos de control en el final de la partida.',
      },
    },
    {
      moveNumber: 43,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position H y realizó un Massive Build en Gate 5.',
      },
    },
    {
      moveNumber: 44,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Selecciona Position K y realiza un Quad Build.',
        hint: 'Toca Position K, luego toca cualquier Small Slot.',
        success: 'Continuar seleccionando tus Position y realizando Build up te permite expandir el control y fortalecer la defensa.',
      },
    },
    {
      moveNumber: 45,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position M y realizó un Massive Build en Gate 6.',
      },
    },
    {
      moveNumber: 46,
      learningPoint: 'partial_quad',
      userText: {
        situation: 'Gate 11 ya no tiene Slots disponibles para Small Assets.\nPor lo tanto, puedes realizar un Quad Build construyendo Small Assets en Gate 4, Gate 9 y Gate 10.\nCon Selective Build y Quad Build, si algunos Slots objetivo están llenos, el Build up se realiza solo donde queda espacio.',
        question: 'Selecciona Position K y realiza un Quad Build.',
        hint: 'Toca Position K, luego toca cualquier Small Slot.',
        success: 'Incluso cuando no puedes colocar Assets en todos los Gates objetivo, puedes realizar Build up en Gates que aún tengan Slots abiertos.\nEste tipo de Build up parcial ocurre naturalmente en el final de la partida.',
      },
    },
    {
      moveNumber: 47,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position H y realizó un Massive Build en Gate 6.',
      },
    },
    {
      moveNumber: 48,
      learningPoint: 'prepare_capture',
      userText: {
        situation: 'Ahora, entre los Diagonal Gates de Position I (Gate 4, Gate 8, Gate 10, Gate 12), los tres Gates con más Build up son Gate 4, Gate 8 y Gate 10.\nAdemás, Black puede establecer dominio en Gate 4 y Gate 10.\nPor lo tanto, Black podrá volver a capturar Position I en su siguiente turno porque controlará más de los Gates empatados.',
        question: 'Selecciona Position C y realiza un Build up para preparar la recaptura de Position I en el siguiente turno de Black.',
        hint: 'Toca Position C, luego toca cualquier Small Slot.',
        success: 'Incluso si un Position no puede capturarse inmediatamente, prepararse con un movimiento de anticipación puede crear las condiciones necesarias para capturarlo en tu siguiente turno.\nEn ONE EIGHT, este tipo de Build up preparatorio es importante.',
      },
    },
    {
      moveNumber: 49,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position H y realizó un Quad Build.',
      },
    },
    {
      moveNumber: 50,
      learningPoint: 'capture_massive',
      userText: {
        situation: '',
        question: 'Selecciona Position I y realiza un Massive Build en Gate 12.',
        hint: 'Toca Position I, luego el Large Slot de Gate 12.',
        success: 'El control que preparaste te permite recapturar Position I.\nContinuar realizando Build up después de la captura puede aumentar el número de Position que controlas en el final.',
      },
    },
    {
      moveNumber: 51,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position H y realizó un Massive Build en Gate 2.',
      },
    },
    {
      moveNumber: 52,
      learningPoint: 'massive_build',
      userText: {
        situation: 'En el final de la partida, qué jugador toma los Large Slots restantes tiene un impacto significativo.',
        question: 'Selecciona Position F y realiza un Massive Build en Gate 12.',
        hint: 'Toca Position F, luego el Large Slot de Gate 12.',
        success: '',
      },
    },
    {
      moveNumber: 53,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position L y realizó un Massive Build en Gate 9.',
      },
    },
    {
      moveNumber: 54,
      learningPoint: 'massive_build',
      userText: {
        situation: 'A medida que la partida se acerca al final, quedan menos Gates disponibles para Build up.\nEs importante asegurarse de obtener los Large Slots restantes.',
        question: 'Selecciona Position C y realiza un Massive Build en Gate 3.',
        hint: 'Toca Position C, luego el Large Slot de Gate 3.',
        success: '',
      },
    },
    {
      moveNumber: 55,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position J y realizó un Selective Build en Gate 9.',
      },
    },
    {
      moveNumber: 56,
      learningPoint: 'massive_build',
      userText: {
        situation: 'En el final, identifica Gates a los que tu oponente ya no puede llegar mientras llenas los Slots restantes en Gates a los que aún puedes acceder.',
        question: 'Selecciona Position E y realiza un Massive Build en Gate 2.',
        hint: 'Toca Position E, luego el Large Slot de Gate 2.',
        success: '',
      },
    },
    {
      moveNumber: 57,
      learningPoint: 'auto',
      autoText: {
        auto: 'White seleccionó Position J y realizó un Selective Build en Gate 9.',
      },
    },
    {
      moveNumber: 58,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Llenar los Small Slots restantes acerca la partida a su fin.',
        question: 'Selecciona Position B y realiza un Quad Build.',
        hint: 'Toca Position B, luego toca cualquier Small Slot.',
        success: '',
      },
    },
    {
      moveNumber: 59,
      learningPoint: 'auto_pass',
      autoText: {
        auto: 'White no tenía Build up legal disponible, por lo que el turno de White terminó automáticamente.',
      },
    },
    {
      moveNumber: 60,
      learningPoint: 'endgame',
      userText: {
        situation: 'White no puede acceder al último Large Slot abierto en Gate 3 desde ningún Position que controla.\nPor lo tanto, el turno de White terminó automáticamente.',
        question: 'Selecciona Position C y realiza un Massive Build en Gate 3.',
        hint: 'Toca Position C, luego el Large Slot de Gate 3.',
        success: 'Todo el Build up restante está ahora completo y la partida termina.\n\nEn ONE EIGHT, la partida termina cuando todos los Slots de todos los Gates están llenos.\nEl jugador que controla más Position en ese momento gana.',
      },
      finalText: 'Todos los Slots están llenos y la partida ha terminado.\n\nMuy bien. A lo largo de una partida completa de ONE EIGHT, experimentaste Massive Build, Selective Build, Quad Build, Capture, defensa y toma de decisiones en el final de la partida.',
    },
  ],
};
