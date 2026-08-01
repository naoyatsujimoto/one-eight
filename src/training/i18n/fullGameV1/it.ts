import type { FGTrainingText } from './types';

/**
 * Italian (Italiano) — translated from English canonical source.
 * tu-form. Concise imperative/guide expressions.
 * GAME-specific terms kept in English: ONE EIGHT, Position, Gate, Diagonal Gate,
 * Build up, Asset, Slot, Large Slot, Middle Slot, Small Slot, Massive Build,
 * Selective Build, Quad Build, Capture, Black, White, Move, CPU, Pro, Ghost,
 * Postmortem, Official Arena.
 */
export const FULL_GAME_V1_IT: FGTrainingText = {
  courseId: 'full-game-v1',

  meta: {
    title: 'ONE EIGHT Partita guidata — Pensa come Black',
    description: 'Gioca una partita guidata completa come Black. Sperimenta Massive Build, Selective Build, Quad Build, Capture, difesa e giudizio di finale.',
    finalSummary: 'Hai completato una partita intera di ONE EIGHT. Ricorda di usare il Build up per prepararti, difenderti e catturare quando i valori di controllo dei Gate soddisfano le condizioni richieste.',
  },

  steps: [
    {
      moveNumber: 0,
      learningPoint: 'intro',
      introText: 'Un turno si completa selezionando un Position e poi eseguendo un Build up.\n\nSeleziona uno dei 13 Position al centro del tabellone, poi esegui il Build up degli Assets sui Gate accessibili da quel Position.\nUna volta completato il Build up, il turno passa all\'avversario.\n\nProviamo.',
    },
    {
      moveNumber: 1,
      learningPoint: 'position_select',
      userText: {
        situation: 'La partita si svolge con Black che va per primo e White per secondo.\nOra è il turno di Black.\nI Position sono ordinati da A a M da sinistra a destra, dall\'alto verso il basso.',
        question: 'Per prima cosa, tocca Position D per selezionarlo.',
        hint: 'Tocca Position D sul tabellone.',
        success: 'Quando Position D è selezionato, i Gate da cui è possibile eseguire il Build up vengono evidenziati in blu.',
      },
    },
    {
      moveNumber: 2,
      learningPoint: 'position_select',
      userText: {
        situation: 'I Gate collegati diagonalmente a un Position selezionato si chiamano Diagonal Gates di quel Position.\nI Diagonal Gates evidenziati in blu sono disponibili per il Build up da quel Position.',
        question: 'Tocca di nuovo Position D per deselezionarlo, poi seleziona Position G.',
        hint: 'Tocca Position G.',
        success: 'I Gate disponibili per il Build up variano in base al Position.\nRiselezionando un Position, cambiano anche i Gate disponibili.',
      },
    },
    {
      moveNumber: 3,
      learningPoint: 'massive_build',
      userText: {
        situation: 'Il Build up si esegue posizionando gli Assets nel Large Slot, Middle Slot o Small Slot di un Diagonal Gate.\nIn base alla dimensione dello Slot selezionato, ci sono tre tipi di Build up:\nMassive Build\nSelective Build\nQuad Build\nQuesta volta, esegui un Massive Build su Gate 4.\nSe ci sono più Slot della stessa dimensione, puoi toccare qualsiasi.',
        question: 'Tocca il Slot più grande di Gate 4 per posizionare un Asset.',
        hint: 'Tocca il Large Slot (il Slot più grande) di Gate 4.',
        success: 'Con il Massive Build, posizioni un Asset nel Large Slot di un Gate.\nI Large Assets hanno grande valore nel controllo dei Position in seguito.',
      },
    },
    {
      moveNumber: 4,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position J ed eseguito un Massive Build su Gate 7.\n\nLe pedine posizionate tramite Build up si chiamano Assets. La direzione della freccia di un Asset indica quale giocatore lo ha posizionato.\n\nUn Asset con la freccia rivolta verso di te è stato posizionato da te.',
      },
    },
    {
      moveNumber: 5,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Con il Selective Build, posizioni gli Assets nei Middle Slots di due Gate diversi.\nNon puoi posizionare Assets in entrambi i Middle Slots dello stesso Gate in un singolo Selective Build.',
        question: 'Seleziona Position K ed esegui un Selective Build su Gate 4 e Gate 10.',
        hint: 'Tocca Position K, poi il Middle Slot di Gate 4, poi il Middle Slot di Gate 10.',
        success: 'Il Selective Build distribuisce i Middle Assets su due Gate.\nHa meno influenza su un singolo Gate rispetto al Massive Build, ma può influenzare più Gate contemporaneamente.',
      },
    },
    {
      moveNumber: 6,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position E ed eseguito un Selective Build su Gate 6 e Gate 10.\n\nL\'ultima mossa dell\'avversario viene evidenziata in giallo.',
      },
    },
    {
      moveNumber: 7,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Con il Quad Build, posizioni gli Assets nei Small Slots di tutti e quattro i Diagonal Gates accessibili da quel Position.',
        question: 'Seleziona Position B ed esegui un Quad Build.',
        hint: 'Tocca Position B, poi tocca qualsiasi Small Slot.',
        success: 'Il Quad Build posiziona Assets ampiamente su quattro Gate.\nSebbene il valore di ogni Asset sia piccolo, può influenzare più Gate contemporaneamente.',
      },
    },
    {
      moveNumber: 8,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position D ed eseguito un Massive Build su Gate 7.\n\nQuesto Build up ha riempito il Large Slot di Gate 7.',
      },
    },
    {
      moveNumber: 9,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Come Gate 6 e Gate 10, sia Black che White possono eseguire Build up sullo stesso Gate.\nUn Gate è composto dai seguenti Slot:\nLarge Slots: 2\nMiddle Slots: 2\nSmall Slots: 4',
        question: 'Seleziona Position I ed esegui un Selective Build su Gate 8 e Gate 12.',
        hint: 'Tocca Position I, poi il Middle Slot di Gate 8, poi il Middle Slot di Gate 12.',
        success: 'Quando gli Assets di Black e White sono posizionati sullo stesso Gate, si crea una disputa per il controllo.\nQuale giocatore domina quel Gate è determinato dal valore degli Assets posizionati.',
      },
    },
    {
      moveNumber: 10,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position L ed eseguito un Quad Build.\n\nLa partita termina quando tutti gli Slots di tutti i Gate sono stati riempiti in turni alternati.\n\nAlla fine della partita, vince il giocatore con più Position.',
      },
    },
    {
      moveNumber: 11,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Seleziona Position C ed esegui un Selective Build su Gate 3 e Gate 4.',
        hint: 'Tocca Position C, poi il Middle Slot di Gate 3, poi il Middle Slot di Gate 4.',
        success: 'Usare il Selective Build ti permette di influenzare contemporaneamente Gate collegati a più Position.',
      },
    },
    {
      moveNumber: 12,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position F ed eseguito un Quad Build.',
      },
    },
    {
      moveNumber: 13,
      learningPoint: 'massive_build',
      userText: {
        situation: '',
        question: 'Seleziona Position A ed esegui un Massive Build su Gate 1.',
        hint: 'Tocca Position A, poi il Large Slot di Gate 1.',
        success: 'Il Massive Build è efficace quando vuoi controllare fortemente un Gate specifico.',
      },
    },
    {
      moveNumber: 14,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position H ed eseguito un Massive Build su Gate 5.',
      },
    },
    {
      moveNumber: 15,
      learningPoint: 'revisit_position',
      userText: {
        situation: 'L\'unico Position libero rimanente è Position M.\nPuoi selezionare non solo i Position liberi, ma anche i Position che già occupi.',
        question: 'Seleziona Position G ed esegui un Massive Build su Gate 1.',
        hint: 'Tocca Position G, poi il Large Slot di Gate 1.',
        success: 'Puoi selezionare ed eseguire il Build up da un Position che già occupi.\nContinuare a costruire su un Position esistente permette di prepararsi per la difesa o il Capture.',
      },
    },
    {
      moveNumber: 16,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position M ed eseguito un Selective Build su Gate 7 e Gate 8.',
      },
    },
    {
      moveNumber: 17,
      learningPoint: 'gate_check',
      userText: {
        situation: '',
        question: 'Prima, seleziona Position G.',
        hint: 'Tocca Position G.',
        success: 'Selezionando Position G puoi verificare i Diagonal Gates di Position G.',
      },
    },
    {
      moveNumber: 18,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Verifichiamo lo stato del Build up dei quattro Diagonal Gates di Position G.\nLo stato attuale è:\nGate 1: 2 Large Assets\nGate 4: 1 Large Asset, 2 Middle Assets\nGate 7: 2 Large Assets, 1 Middle Asset\nGate 10: 2 Middle Assets',
        question: 'Ora seleziona Position A ed esegui un Selective Build su Gate 1 e Gate 2.',
        hint: 'Tocca Position A, poi il Middle Slot di Gate 1, poi il Middle Slot di Gate 2.',
        success: 'Il controllo su un Position è determinato dallo stato del Build up dei suoi Diagonal Gates.\nÈ importante identificare quale Gate ha ricevuto più Build up.',
      },
    },
    {
      moveNumber: 19,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position J ed eseguito un Selective Build su Gate 5 e Gate 7.',
      },
    },
    {
      moveNumber: 20,
      learningPoint: 'asset_value',
      userText: {
        situation: 'Il Build up su Gate 1 e Gate 4 è progredito rispetto a prima.',
        question: 'Seleziona Position G.',
        hint: 'Tocca Position G.',
        success: 'Anche per lo stesso Position, la situazione di controllo cambia man mano che più Assets vengono posizionati sui suoi Diagonal Gates.',
      },
    },
    {
      moveNumber: 21,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Anche tutti i Small e Middle Assets disponibili messi insieme valgono meno di un Large Asset.\nAnche quattro Small Assets valgono meno di un Middle Asset.\nDei quattro Diagonal Gates di Position G, Gate 7 è quello che ha ricevuto più Build up.',
        question: 'Con Position A selezionato, esegui un Selective Build su Gate 1 e Gate 2.',
        hint: 'Tocca Position A, poi il Middle Slot di Gate 1, poi il Middle Slot di Gate 2.',
        success: 'Lo stesso Gate può influenzare il giudizio di controllo di più Position.\nÈ importante identificare i Gate significativi per più Position.',
      },
    },
    {
      moveNumber: 22,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position L ed eseguito un Massive Build su Gate 9.',
      },
    },
    {
      moveNumber: 23,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Seleziona Position B ed esegui un Selective Build su Gate 3 e Gate 11.',
        hint: 'Tocca Position B, poi il Middle Slot di Gate 3, poi il Middle Slot di Gate 11.',
        success: 'Il Selective Build può essere usato pensando sia all\'attacco futuro che alla difesa.',
      },
    },
    {
      moveNumber: 24,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position F ed eseguito un Massive Build su Gate 8.',
      },
    },
    {
      moveNumber: 25,
      learningPoint: 'capture',
      userText: {
        situation: 'Ci sono casi in cui puoi catturare un Position dell\'avversario.\nVerifica il Gate con più Build up tra i Diagonal Gates del Position target.\nSe il tuo Build up domina quello dell\'avversario su quel Gate, puoi catturare il Position dell\'avversario.\nIn questo momento, c\'è un Position di White che può essere catturato.',
        question: 'Seleziona quel Position.',
        hint: 'Tocca Position E.',
        success: 'Catturare un Position è diverso dal semplicemente selezionare un Position libero.\nAnche un Position occupato dall\'avversario può essere catturato se le condizioni sono soddisfatte.',
      },
    },
    {
      moveNumber: 26,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Con Position E selezionato, esegui un Massive Build su Gate 10.',
        hint: 'Tocca il Large Slot di Gate 10.',
        success: 'Eseguendo il Build up da un Position catturato, puoi avanzare contemporaneamente nell\'attacco e nel dispiegamento.',
      },
    },
    {
      moveNumber: 27,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position F ed eseguito un Massive Build su Gate 11.',
      },
    },
    {
      moveNumber: 28,
      learningPoint: 'defense',
      userText: {
        situation: 'Su Position A, Gate 1 e Gate 7 hanno ricevuto quantità uguali di Build up, in parità come i più costruiti tra i suoi Diagonal Gates.\nQuando più Diagonal Gates sono in parità come i più costruiti, si confronta quanti di quei Gate controlla ciascun giocatore.\nSu Position A, Black controlla Gate 1 e White controlla Gate 7.\nQuindi, White non può catturare Position A.\nBlack sta difendendo con successo Position A.',
        question: 'Prima, seleziona Position A.',
        hint: 'Tocca Position A.',
        success: 'Quando ci sono più Gate con più Build up, il numero di Gate controllati diventa importante.\nSe sono uguali, il Capture non ha successo.',
      },
    },
    {
      moveNumber: 29,
      learningPoint: 'defense',
      userText: {
        situation: 'Tra i Diagonal Gates di Position B, Gate 11 è il Gate con più Build up.\nUn Large Asset vale più di due Middle Assets.\nAttualmente, White controlla Gate 11.\nSe lasciato così, c\'è il rischio che White catturi Position B al prossimo turno.',
        question: 'Deseleziona Position A e seleziona Position B.',
        hint: 'Tocca Position B.',
        success: 'Trovare il Position che l\'avversario può catturare dopo è il primo passo nella difesa.\nQuando trovi un Position in pericolo, devi eseguire il Build up per rompere il controllo dell\'avversario.',
      },
    },
    {
      moveNumber: 30,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'Con Position B selezionato, esegui un Massive Build su Gate 11.',
        hint: 'Tocca il Large Slot di Gate 11.',
        success: 'Eseguendo un Massive Build su Gate 11, Black ha ripreso il controllo di Gate 11.\nQuesto impedisce a White di catturare Position B.',
      },
    },
    {
      moveNumber: 31,
      learningPoint: 'auto',
      autoText: {
        auto: 'Poiché Black ha ripreso il controllo di Gate 11 con un Massive Build, White non ha potuto catturare Position B.\n\nWhite ha selezionato Position L ed eseguito un Quad Build.',
      },
    },
    {
      moveNumber: 32,
      learningPoint: 'capture',
      userText: {
        situation: 'Usando il vantaggio su Gate 11, puoi catturare uno dei Position di White.',
        question: 'Seleziona il Position di White che può essere catturato.',
        hint: 'Tocca Position F.',
        success: 'Il Build up usato per la difesa può portare al prossimo attacco.\nQuesto perché il controllo dei Gate influenza più Position.',
      },
    },
    {
      moveNumber: 33,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Esegui un Selective Build su Gate 11 e Gate 12 per rafforzare ulteriormente Gate 11.',
        hint: 'Tocca il Middle Slot di Gate 11, poi il Middle Slot di Gate 12.',
        success: 'Rafforzare ulteriormente i Diagonal Gates dopo un Capture rende più facile proteggere il Position catturato.',
      },
    },
    {
      moveNumber: 34,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position M ed eseguito un Quad Build.',
      },
    },
    {
      moveNumber: 35,
      learningPoint: 'defense',
      userText: {
        situation: 'Se lasciato così, White catturerà Position I al prossimo turno.\nAnche se Black esegue un Massive Build su Gate 8, Black non può dominare.\nSu Gate 8, White ha costruito 1 Large Asset, 1 Middle Asset e 4 Small Assets.\nAnche se Black esegue un Massive Build lì, Black avrebbe 1 Large Asset, 1 Middle Asset e 0 Small Assets.\nLa differenza negli Small Assets significa che Black non può rovesciare il dominio di White.',
        question: 'Seleziona Position I.',
        hint: 'Tocca Position I.',
        success: 'Posizionare un Large Asset non garantisce sempre che prenderai il controllo.\nLa differenza nei Middle e Small Assets già posizionati può impedire che il controllo venga rovesciato.',
      },
    },
    {
      moveNumber: 36,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'Per difendere temporaneamente Position I, esegui un Massive Build su Gate 4.',
        hint: 'Tocca il Large Slot di Gate 4.',
        success: 'Quando non puoi rovesciare direttamente il controllo di un Gate, rafforzare un altro Diagonal Gate può proteggere temporaneamente il Position.',
      },
    },
    {
      moveNumber: 37,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position L ed eseguito un Massive Build su Gate 8.\n\nNel determinare quale Gate ha ricevuto più Build up, non importa quale giocatore ha posizionato gli Assets.\nSi sommano i Build up di entrambi i giocatori.\n\nI Diagonal Gates di Position I sono Gate 4, Gate 8, Gate 10 e Gate 12.\nAttualmente, il Gate con più Build up tra questi è Gate 8.\n\nQuesta situazione non può essere rovesciata in una mossa.',
      },
    },
    {
      moveNumber: 38,
      learningPoint: 'capture_quad',
      userText: {
        situation: '',
        question: 'Cattura Position D ed esegui un Quad Build.',
        hint: 'Tocca Position D, poi tocca qualsiasi Small Slot.',
        success: 'Selezionando un Position catturabile ed eseguendo il Quad Build da lì, puoi influenzare ampiamente tutto il tabellone.',
      },
    },
    {
      moveNumber: 39,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position I ed eseguito un Massive Build su Gate 10.',
      },
    },
    {
      moveNumber: 40,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Man mano che si avvicina il finale, rimangono sempre meno Slot aperti.\nTieni traccia di quali Gate hanno ancora spazio per il Build up.',
        question: 'Seleziona Position A ed esegui un Quad Build.',
        hint: 'Tocca Position A, poi tocca qualsiasi Small Slot.',
        success: '',
      },
    },
    {
      moveNumber: 41,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position H ed eseguito un Selective Build su Gate 5 e Gate 6.',
      },
    },
    {
      moveNumber: 42,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Seleziona Position G ed esegui un Quad Build.',
        hint: 'Tocca Position G, poi tocca qualsiasi Small Slot.',
        success: 'Distribuendo Assets sui Small Slots rimanenti, il Quad Build può influenzare margini stretti di controllo nel finale.',
      },
    },
    {
      moveNumber: 43,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position H ed eseguito un Massive Build su Gate 5.',
      },
    },
    {
      moveNumber: 44,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Seleziona Position K ed esegui un Quad Build.',
        hint: 'Tocca Position K, poi tocca qualsiasi Small Slot.',
        success: 'Continuare a selezionare i tuoi Position ed eseguire Build up ti permette di espandere il controllo e rafforzare la difesa.',
      },
    },
    {
      moveNumber: 45,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position M ed eseguito un Massive Build su Gate 6.',
      },
    },
    {
      moveNumber: 46,
      learningPoint: 'partial_quad',
      userText: {
        situation: 'Gate 11 non ha più Slot disponibili per gli Small Assets.\nQuindi, puoi eseguire un Quad Build costruendo Small Assets su Gate 4, Gate 9 e Gate 10.\nCon Selective Build e Quad Build, se alcuni Slot target sono pieni, il Build up viene eseguito solo dove c\'è spazio.',
        question: 'Seleziona Position K ed esegui un Quad Build.',
        hint: 'Tocca Position K, poi tocca qualsiasi Small Slot.',
        success: 'Anche quando non puoi posizionare Assets su tutti i Gate target, puoi eseguire il Build up su Gate che hanno ancora Slot aperti.\nQuesto tipo di Build up parziale si verifica naturalmente nel finale.',
      },
    },
    {
      moveNumber: 47,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position H ed eseguito un Massive Build su Gate 6.',
      },
    },
    {
      moveNumber: 48,
      learningPoint: 'prepare_capture',
      userText: {
        situation: 'Ora, tra i Diagonal Gates di Position I (Gate 4, Gate 8, Gate 10, Gate 12), i tre Gate con più Build up sono Gate 4, Gate 8 e Gate 10.\nInoltre, Black può stabilire dominanza su Gate 4 e Gate 10.\nQuindi, Black potrà ricatturare Position I al suo prossimo turno perché controllerà più dei Gate in parità.',
        question: 'Seleziona Position C ed esegui un Build up per preparare la ricattura di Position I al prossimo turno di Black.',
        hint: 'Tocca Position C, poi tocca qualsiasi Small Slot.',
        success: 'Anche se un Position non può essere catturato immediatamente, prepararsi una mossa prima può creare le condizioni necessarie per catturarlo al tuo prossimo turno.\nIn ONE EIGHT, questo tipo di Build up preparatorio è importante.',
      },
    },
    {
      moveNumber: 49,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position H ed eseguito un Quad Build.',
      },
    },
    {
      moveNumber: 50,
      learningPoint: 'capture_massive',
      userText: {
        situation: '',
        question: 'Seleziona Position I ed esegui un Massive Build su Gate 12.',
        hint: 'Tocca Position I, poi il Large Slot di Gate 12.',
        success: 'Il controllo che hai preparato ti permette di ricatturare Position I.\nContinuare il Build up dopo il Capture può aumentare il numero di Position che controlli nel finale.',
      },
    },
    {
      moveNumber: 51,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position H ed eseguito un Massive Build su Gate 2.',
      },
    },
    {
      moveNumber: 52,
      learningPoint: 'massive_build',
      userText: {
        situation: 'Nel finale, quale giocatore prende i Large Slots rimanenti ha un impatto significativo.',
        question: 'Seleziona Position F ed esegui un Massive Build su Gate 12.',
        hint: 'Tocca Position F, poi il Large Slot di Gate 12.',
        success: '',
      },
    },
    {
      moveNumber: 53,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position L ed eseguito un Massive Build su Gate 9.',
      },
    },
    {
      moveNumber: 54,
      learningPoint: 'massive_build',
      userText: {
        situation: 'Man mano che la partita si avvicina alla fine, rimangono meno Gate disponibili per il Build up.\nÈ importante assicurarsi di ottenere i Large Slots rimanenti.',
        question: 'Seleziona Position C ed esegui un Massive Build su Gate 3.',
        hint: 'Tocca Position C, poi il Large Slot di Gate 3.',
        success: '',
      },
    },
    {
      moveNumber: 55,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position J ed eseguito un Selective Build su Gate 9.',
      },
    },
    {
      moveNumber: 56,
      learningPoint: 'massive_build',
      userText: {
        situation: 'Nel finale, identifica i Gate che il tuo avversario non può più raggiungere mentre riempi i Slot rimanenti nei Gate che puoi ancora raggiungere.',
        question: 'Seleziona Position E ed esegui un Massive Build su Gate 2.',
        hint: 'Tocca Position E, poi il Large Slot di Gate 2.',
        success: '',
      },
    },
    {
      moveNumber: 57,
      learningPoint: 'auto',
      autoText: {
        auto: 'White ha selezionato Position J ed eseguito un Selective Build su Gate 9.',
      },
    },
    {
      moveNumber: 58,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Riempire i Small Slots rimanenti avvicina la partita alla fine.',
        question: 'Seleziona Position B ed esegui un Quad Build.',
        hint: 'Tocca Position B, poi tocca qualsiasi Small Slot.',
        success: '',
      },
    },
    {
      moveNumber: 59,
      learningPoint: 'auto_pass',
      autoText: {
        auto: 'White non aveva Build up legale disponibile, quindi il turno di White è terminato automaticamente.',
      },
    },
    {
      moveNumber: 60,
      learningPoint: 'endgame',
      userText: {
        situation: 'White non può accedere all\'ultimo Large Slot aperto su Gate 3 da nessun Position che controlla.\nQuindi, il turno di White è terminato automaticamente.',
        question: 'Seleziona Position C ed esegui un Massive Build su Gate 3.',
        hint: 'Tocca Position C, poi il Large Slot di Gate 3.',
        success: 'Tutto il Build up rimanente è ora completato e la partita termina.\n\nIn ONE EIGHT, la partita termina quando tutti gli Slot di tutti i Gate sono pieni.\nIl giocatore che controlla più Position in quel momento vince.',
      },
      finalText: 'Tutti gli Slot sono pieni e la partita è finita.\n\nBen fatto. Nel corso di una partita intera di ONE EIGHT, hai sperimentato Massive Build, Selective Build, Quad Build, Capture, difesa e presa di decisioni nel finale.',
    },
  ],
};
