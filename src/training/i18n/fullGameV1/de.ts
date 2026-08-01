import type { FGTrainingText } from './types';

/**
 * German (Deutsch) — translated from English canonical source.
 * du-Form. Compound words kept reasonable in length.
 * GAME-specific terms kept in English: ONE EIGHT, Position, Gate, Diagonal Gate,
 * Build up, Asset, Slot, Large Slot, Middle Slot, Small Slot, Massive Build,
 * Selective Build, Quad Build, Capture, Black, White, Move, CPU, Pro, Ghost,
 * Postmortem, Official Arena.
 */
export const FULL_GAME_V1_DE: FGTrainingText = {
  courseId: 'full-game-v1',

  meta: {
    title: 'ONE EIGHT Geführte Partie — Denk als Black',
    description: 'Spiele eine vollständige geführte Partie als Black. Erlebe Massive Build, Selective Build, Quad Build, Capture, Verteidigung und Endspielurteil.',
    finalSummary: 'Du hast eine vollständige ONE EIGHT-Partie abgeschlossen. Denk daran, Build up zu nutzen, um dich vorzubereiten, zu verteidigen und zu Capture, wenn die Gate-Kontrollwerte die erforderlichen Bedingungen erfüllen.',
  },

  steps: [
    {
      moveNumber: 0,
      learningPoint: 'intro',
      introText: 'Ein Zug wird abgeschlossen, indem du ein Position auswählst und dann ein Build up durchführst.\n\nWähle eines der 13 Position in der Mitte des Spielfelds und baue dann Assets an den Gates auf, die von diesem Position aus zugänglich sind.\nSobald das Build up abgeschlossen ist, wechselt der Zug zum Gegner.\n\nLass es uns versuchen.',
    },
    {
      moveNumber: 1,
      learningPoint: 'position_select',
      userText: {
        situation: 'Die Partie wird mit Black zuerst und White danach gespielt.\nGerade ist Black dran.\nDie Position sind von links nach rechts, von oben nach unten als A bis M angeordnet.',
        question: 'Tippe zuerst auf Position D, um es auszuwählen.',
        hint: 'Tippe auf Position D auf dem Spielfeld.',
        success: 'Wenn Position D ausgewählt ist, werden die Gates, von denen aus Build up möglich ist, blau hervorgehoben.',
      },
    },
    {
      moveNumber: 2,
      learningPoint: 'position_select',
      userText: {
        situation: 'Die Gates, die diagonal mit einem ausgewählten Position verbunden sind, heißen Diagonal Gates dieses Position.\nDie blau hervorgehobenen Diagonal Gates sind für Build up von diesem Position aus verfügbar.',
        question: 'Tippe erneut auf Position D, um die Auswahl aufzuheben, und wähle dann Position G.',
        hint: 'Tippe auf Position G.',
        success: 'Die für Build up verfügbaren Gates variieren je nach Position.\nBei erneuter Auswahl eines Position ändern sich auch die verfügbaren Gates.',
      },
    },
    {
      moveNumber: 3,
      learningPoint: 'massive_build',
      userText: {
        situation: 'Build up wird durchgeführt, indem Assets in den Large Slot, Middle Slot oder Small Slot eines Diagonal Gate platziert werden.\nJe nach Größe des gewählten Slots gibt es drei Arten von Build up:\nMassive Build\nSelective Build\nQuad Build\nFühre diesmal einen Massive Build an Gate 4 durch.\nWenn es mehrere Slots gleicher Größe gibt, kannst du beliebige antippen.',
        question: 'Tippe auf den größten Slot bei Gate 4, um ein Asset zu platzieren.',
        hint: 'Tippe auf den Large Slot (den größten Slot) bei Gate 4.',
        success: 'Mit Massive Build platzierst du ein Asset im Large Slot eines Gates.\nLarge Assets haben großen Wert bei der späteren Position-Kontrolle.',
      },
    },
    {
      moveNumber: 4,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position J und führte einen Massive Build an Gate 7 durch.\n\nDie durch Build up platzierten Spielsteine heißen Assets. Die Pfeilrichtung eines Assets zeigt an, welcher Spieler es platziert hat.\n\nEin Asset, dessen Pfeil auf dich zeigt, wurde von dir platziert.',
      },
    },
    {
      moveNumber: 5,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Mit Selective Build platzierst du Assets in den Middle Slots zweier verschiedener Gates.\nDu kannst in einem einzigen Selective Build keine Assets in beide Middle Slots desselben Gates platzieren.',
        question: 'Wähle Position K und führe einen Selective Build an Gate 4 und Gate 10 durch.',
        hint: 'Tippe auf Position K, dann auf den Middle Slot von Gate 4, dann auf den Middle Slot von Gate 10.',
        success: 'Selective Build verteilt Middle Assets über zwei Gates.\nEs hat weniger Einfluss auf ein einzelnes Gate als Massive Build, kann aber mehrere Gates gleichzeitig beeinflussen.',
      },
    },
    {
      moveNumber: 6,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position E und führte einen Selective Build an Gate 6 und Gate 10 durch.\n\nDer letzte Zug des Gegners wird gelb hervorgehoben.',
      },
    },
    {
      moveNumber: 7,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Mit Quad Build platzierst du Assets in den Small Slots aller vier Diagonal Gates, die von diesem Position aus zugänglich sind.',
        question: 'Wähle Position B und führe einen Quad Build durch.',
        hint: 'Tippe auf Position B, dann auf einen beliebigen Small Slot.',
        success: 'Quad Build platziert Assets breit über vier Gates.\nObwohl der Wert jedes Assets gering ist, kann es mehrere Gates gleichzeitig beeinflussen.',
      },
    },
    {
      moveNumber: 8,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position D und führte einen Massive Build an Gate 7 durch.\n\nDieses Build up füllte den Large Slot von Gate 7.',
      },
    },
    {
      moveNumber: 9,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Wie bei Gate 6 und Gate 10 können sowohl Black als auch White am selben Gate bauen.\nEin Gate besteht aus folgenden Slots:\nLarge Slots: 2\nMiddle Slots: 2\nSmall Slots: 4',
        question: 'Wähle Position I und führe einen Selective Build an Gate 8 und Gate 12 durch.',
        hint: 'Tippe auf Position I, dann auf den Middle Slot von Gate 8, dann auf den Middle Slot von Gate 12.',
        success: 'Wenn sowohl Black- als auch White-Assets am selben Gate platziert sind, entsteht ein Wettbewerb um die Kontrolle.\nWelcher Spieler dieses Gate dominiert, wird durch den Wert der platzierten Assets bestimmt.',
      },
    },
    {
      moveNumber: 10,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position L und führte einen Quad Build durch.\n\nDie Partie endet, sobald in abwechselnden Zügen alle Slots an allen Gates gefüllt wurden.\n\nAm Ende der Partie gewinnt der Spieler mit mehr Position.',
      },
    },
    {
      moveNumber: 11,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Wähle Position C und führe einen Selective Build an Gate 3 und Gate 4 durch.',
        hint: 'Tippe auf Position C, dann auf den Middle Slot von Gate 3, dann auf den Middle Slot von Gate 4.',
        success: 'Mit Selective Build kannst du Gates, die mit mehreren Position zusammenhängen, gleichzeitig beeinflussen.',
      },
    },
    {
      moveNumber: 12,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position F und führte einen Quad Build durch.',
      },
    },
    {
      moveNumber: 13,
      learningPoint: 'massive_build',
      userText: {
        situation: '',
        question: 'Wähle Position A und führe einen Massive Build an Gate 1 durch.',
        hint: 'Tippe auf Position A, dann auf den Large Slot von Gate 1.',
        success: 'Massive Build ist effektiv, wenn du ein bestimmtes Gate stark kontrollieren möchtest.',
      },
    },
    {
      moveNumber: 14,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position H und führte einen Massive Build an Gate 5 durch.',
      },
    },
    {
      moveNumber: 15,
      learningPoint: 'revisit_position',
      userText: {
        situation: 'Das einzige verbleibende freie Position ist Position M.\nDu kannst nicht nur freie Position, sondern auch bereits besetzte Position auswählen.',
        question: 'Wähle Position G und führe einen Massive Build an Gate 1 durch.',
        hint: 'Tippe auf Position G, dann auf den Large Slot von Gate 1.',
        success: 'Du kannst ein bereits besetztes Position auswählen und von dort Build up durchführen.\nWeiteres Bauen an einem bestehenden Position ermöglicht die Vorbereitung auf Verteidigung oder Capture.',
      },
    },
    {
      moveNumber: 16,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position M und führte einen Selective Build an Gate 7 und Gate 8 durch.',
      },
    },
    {
      moveNumber: 17,
      learningPoint: 'gate_check',
      userText: {
        situation: '',
        question: 'Wähle zuerst Position G.',
        hint: 'Tippe auf Position G.',
        success: 'Durch Auswahl von Position G kannst du die Diagonal Gates von Position G überprüfen.',
      },
    },
    {
      moveNumber: 18,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Schauen wir uns den Build up-Status der vier Diagonal Gates von Position G an.\nDer aktuelle Zustand ist:\nGate 1: 2 Large Assets\nGate 4: 1 Large Asset, 2 Middle Assets\nGate 7: 2 Large Assets, 1 Middle Asset\nGate 10: 2 Middle Assets',
        question: 'Wähle als Nächstes Position A und führe einen Selective Build an Gate 1 und Gate 2 durch.',
        hint: 'Tippe auf Position A, dann auf den Middle Slot von Gate 1, dann auf den Middle Slot von Gate 2.',
        success: 'Die Kontrolle über ein Position wird durch den Build up-Status seiner Diagonal Gates bestimmt.\nEs ist wichtig zu erkennen, welches Gate das meiste Build up erhalten hat.',
      },
    },
    {
      moveNumber: 19,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position J und führte einen Selective Build an Gate 5 und Gate 7 durch.',
      },
    },
    {
      moveNumber: 20,
      learningPoint: 'asset_value',
      userText: {
        situation: 'Das Build up an Gate 1 und Gate 4 hat sich gegenüber vorhin weiterentwickelt.',
        question: 'Wähle Position G.',
        hint: 'Tippe auf Position G.',
        success: 'Auch für dasselbe Position ändert sich die Kontrollsituation, wenn mehr Assets an seinen Diagonal Gates platziert werden.',
      },
    },
    {
      moveNumber: 21,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Selbst alle verfügbaren Small und Middle Assets zusammen sind weniger wert als ein Large Asset.\nAuch vier Small Assets sind weniger wert als ein Middle Asset.\nVon den vier Diagonal Gates von Position G hat Gate 7 das meiste Build up erhalten.',
        question: 'Führe mit ausgewähltem Position A einen Selective Build an Gate 1 und Gate 2 durch.',
        hint: 'Tippe auf Position A, dann auf den Middle Slot von Gate 1, dann auf den Middle Slot von Gate 2.',
        success: 'Dasselbe Gate kann das Kontrollurteil mehrerer Position beeinflussen.\nEs ist wichtig, Gates zu erkennen, die für mehrere Position bedeutsam sind.',
      },
    },
    {
      moveNumber: 22,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position L und führte einen Massive Build an Gate 9 durch.',
      },
    },
    {
      moveNumber: 23,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Wähle Position B und führe einen Selective Build an Gate 3 und Gate 11 durch.',
        hint: 'Tippe auf Position B, dann auf den Middle Slot von Gate 3, dann auf den Middle Slot von Gate 11.',
        success: 'Selective Build kann sowohl für zukünftige Angriffe als auch für Verteidigung eingesetzt werden.',
      },
    },
    {
      moveNumber: 24,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position F und führte einen Massive Build an Gate 8 durch.',
      },
    },
    {
      moveNumber: 25,
      learningPoint: 'capture',
      userText: {
        situation: 'Es gibt Fälle, in denen du ein Position des Gegners Capture kannst.\nÜberprüfe das Gate mit dem meisten Build up unter den Diagonal Gates des Ziel-Position.\nWenn dein Build up das des Gegners an diesem Gate dominiert, kannst du das Position des Gegners Capture.\nGerade gibt es ein White-Position, das Capture werden kann.',
        question: 'Wähle dieses Position.',
        hint: 'Tippe auf Position E.',
        success: 'Ein Position zu Capture ist anders als einfach ein freies Position auszuwählen.\nSelbst ein vom Gegner besetztes Position kann Capture werden, wenn die Bedingungen erfüllt sind.',
      },
    },
    {
      moveNumber: 26,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Mit ausgewähltem Position E führe einen Massive Build an Gate 10 durch.',
        hint: 'Tippe auf den Large Slot von Gate 10.',
        success: 'Durch Build up von einem Captured Position aus kannst du Angriff und Entwicklung gleichzeitig vorantreiben.',
      },
    },
    {
      moveNumber: 27,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position F und führte einen Massive Build an Gate 11 durch.',
      },
    },
    {
      moveNumber: 28,
      learningPoint: 'defense',
      userText: {
        situation: 'Bei Position A haben Gate 1 und Gate 7 gleiche Mengen an Build up erhalten und liegen gleichauf als die am meisten gebauten Diagonal Gates.\nWenn mehrere Diagonal Gates gleichauf als die am meisten gebauten liegen, vergleicht man, wie viele dieser Gates jeder Spieler kontrolliert.\nBei Position A kontrolliert Black Gate 1 und White Gate 7.\nDaher kann White Position A nicht Capture.\nBlack verteidigt Position A erfolgreich.',
        question: 'Wähle zuerst Position A.',
        hint: 'Tippe auf Position A.',
        success: 'Wenn es mehrere Gates mit dem meisten Build up gibt, wird die Anzahl der kontrollierten Gates wichtig.\nBei Gleichstand gelingt das Capture nicht.',
      },
    },
    {
      moveNumber: 29,
      learningPoint: 'defense',
      userText: {
        situation: 'Unter den Diagonal Gates von Position B ist Gate 11 das Gate mit dem meisten Build up.\nEin Large Asset ist mehr wert als zwei Middle Assets.\nDerzeit kontrolliert White Gate 11.\nWenn es so bleibt, besteht das Risiko, dass White Position B im nächsten Zug Capture.',
        question: 'Hebe die Auswahl von Position A auf und wähle Position B.',
        hint: 'Tippe auf Position B.',
        success: 'Das Position zu finden, das der Gegner als Nächstes Capture kann, ist der erste Schritt der Verteidigung.\nWenn du ein gefährdetes Position findest, musst du Build up durchführen, um die Kontrolle des Gegners zu brechen.',
      },
    },
    {
      moveNumber: 30,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'Mit ausgewähltem Position B führe einen Massive Build an Gate 11 durch.',
        hint: 'Tippe auf den Large Slot von Gate 11.',
        success: 'Durch Massive Build an Gate 11 hat Black die Kontrolle über Gate 11 zurückgewonnen.\nDas verhindert, dass White Position B Capture.',
      },
    },
    {
      moveNumber: 31,
      learningPoint: 'auto',
      autoText: {
        auto: 'Da Black mit einem Massive Build die Kontrolle über Gate 11 zurückgewann, konnte White Position B nicht Capture.\n\nWhite wählte Position L und führte einen Quad Build durch.',
      },
    },
    {
      moveNumber: 32,
      learningPoint: 'capture',
      userText: {
        situation: 'Mit dem Vorteil bei Gate 11 kannst du eines der White-Position Capture.',
        question: 'Wähle das White-Position, das Capture werden kann.',
        hint: 'Tippe auf Position F.',
        success: 'Das für die Verteidigung verwendete Build up kann zum nächsten Angriff führen.\nDas liegt daran, dass die Gate-Kontrolle mehrere Position beeinflusst.',
      },
    },
    {
      moveNumber: 33,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Führe einen Selective Build an Gate 11 und Gate 12 durch, um Gate 11 weiter zu stärken.',
        hint: 'Tippe auf den Middle Slot von Gate 11, dann auf den Middle Slot von Gate 12.',
        success: 'Das weitere Stärken der Diagonal Gates nach einem Capture erleichtert den Schutz des Captured Position.',
      },
    },
    {
      moveNumber: 34,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position M und führte einen Quad Build durch.',
      },
    },
    {
      moveNumber: 35,
      learningPoint: 'defense',
      userText: {
        situation: 'Wenn es so bleibt, wird White Position I im nächsten Zug Capture.\nSelbst wenn Black einen Massive Build an Gate 8 durchführt, kann Black nicht dominieren.\nBei Gate 8 hat White 1 Large Asset, 1 Middle Asset und 4 Small Assets aufgebaut.\nSelbst wenn Black dort Massive Build durchführt, hätte Black 1 Large Asset, 1 Middle Asset und 0 Small Assets.\nDer Unterschied in Small Assets bedeutet, dass Black Whites Dominanz nicht umkehren kann.',
        question: 'Wähle Position I.',
        hint: 'Tippe auf Position I.',
        success: 'Ein Large Asset zu platzieren garantiert nicht immer, dass du die Kontrolle übernimmst.\nDer Unterschied in bereits platzierten Middle und Small Assets kann die Kontrollumkehr verhindern.',
      },
    },
    {
      moveNumber: 36,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'Um Position I vorübergehend zu verteidigen, führe einen Massive Build an Gate 4 durch.',
        hint: 'Tippe auf den Large Slot von Gate 4.',
        success: 'Wenn du die Kontrolle eines Gates nicht direkt umkehren kannst, kann das Stärken eines anderen Diagonal Gate das Position vorübergehend schützen.',
      },
    },
    {
      moveNumber: 37,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position L und führte einen Massive Build an Gate 8 durch.\n\nBei der Bestimmung, welches Gate das meiste Build up erhalten hat, spielt es keine Rolle, welcher Spieler die Assets platziert hat.\nDie Build up beider Spieler werden addiert.\n\nDie Diagonal Gates von Position I sind Gate 4, Gate 8, Gate 10 und Gate 12.\nDerzeit ist das am meisten gebaute Gate darunter Gate 8.\n\nDiese Situation kann nicht in einem Zug umgekehrt werden.',
      },
    },
    {
      moveNumber: 38,
      learningPoint: 'capture_quad',
      userText: {
        situation: '',
        question: 'Capture Position D und führe einen Quad Build durch.',
        hint: 'Tippe auf Position D, dann auf einen beliebigen Small Slot.',
        success: 'Durch Auswahl eines Capture-fähigen Position und Quad Build von dort aus kannst du das gesamte Spielfeld weitreichend beeinflussen.',
      },
    },
    {
      moveNumber: 39,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position I und führte einen Massive Build an Gate 10 durch.',
      },
    },
    {
      moveNumber: 40,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Mit Annäherung ans Endspiel bleiben immer weniger Slots offen.\nBehalte im Blick, welche Gates noch Platz für Build up haben.',
        question: 'Wähle Position A und führe einen Quad Build durch.',
        hint: 'Tippe auf Position A, dann auf einen beliebigen Small Slot.',
        success: '',
      },
    },
    {
      moveNumber: 41,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position H und führte einen Selective Build an Gate 5 und Gate 6 durch.',
      },
    },
    {
      moveNumber: 42,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Wähle Position G und führe einen Quad Build durch.',
        hint: 'Tippe auf Position G, dann auf einen beliebigen Small Slot.',
        success: 'Durch Verteilen von Assets über die verbleibenden Small Slots kann Quad Build knappe Kontrollvorteile im Endspiel beeinflussen.',
      },
    },
    {
      moveNumber: 43,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position H und führte einen Massive Build an Gate 5 durch.',
      },
    },
    {
      moveNumber: 44,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Wähle Position K und führe einen Quad Build durch.',
        hint: 'Tippe auf Position K, dann auf einen beliebigen Small Slot.',
        success: 'Das kontinuierliche Auswählen eigener Position und Build up ermöglicht es, die Kontrolle zu erweitern und die Verteidigung zu stärken.',
      },
    },
    {
      moveNumber: 45,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position M und führte einen Massive Build an Gate 6 durch.',
      },
    },
    {
      moveNumber: 46,
      learningPoint: 'partial_quad',
      userText: {
        situation: 'Gate 11 hat keine Slots mehr für Small Assets.\nDaher kannst du einen Quad Build durchführen, indem du Small Assets an Gate 4, Gate 9 und Gate 10 aufbaust.\nBei Selective Build und Quad Build, wenn einige Ziel-Slots voll sind, wird Build up nur dort durchgeführt, wo noch Platz ist.',
        question: 'Wähle Position K und führe einen Quad Build durch.',
        hint: 'Tippe auf Position K, dann auf einen beliebigen Small Slot.',
        success: 'Auch wenn du nicht an allen Ziel-Gates Assets platzieren kannst, kannst du Build up an Gates durchführen, die noch offene Slots haben.\nDiese Art von partiellem Build up tritt im Endspiel natürlich auf.',
      },
    },
    {
      moveNumber: 47,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position H und führte einen Massive Build an Gate 6 durch.',
      },
    },
    {
      moveNumber: 48,
      learningPoint: 'prepare_capture',
      userText: {
        situation: 'Jetzt sind von den Diagonal Gates von Position I (Gate 4, Gate 8, Gate 10, Gate 12) die drei Gates mit dem meisten Build up Gate 4, Gate 8 und Gate 10.\nAußerdem kann Black Dominanz bei Gate 4 und Gate 10 aufbauen.\nDaher kann Black Position I in seinem nächsten Zug zurückerobern, weil es mehr der gleichstehenden Gates kontrollieren wird.',
        question: 'Wähle Position C und führe ein Build up durch, um die Rückeroberung von Position I im nächsten Black-Zug vorzubereiten.',
        hint: 'Tippe auf Position C, dann auf einen beliebigen Small Slot.',
        success: 'Auch wenn ein Position nicht sofort Capture werden kann, kann ein vorbereitender Zug die notwendigen Bedingungen für einen Capture im nächsten Zug schaffen.\nIn ONE EIGHT ist diese Art von vorbereitendem Build up wichtig.',
      },
    },
    {
      moveNumber: 49,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position H und führte einen Quad Build durch.',
      },
    },
    {
      moveNumber: 50,
      learningPoint: 'capture_massive',
      userText: {
        situation: '',
        question: 'Wähle Position I und führe einen Massive Build an Gate 12 durch.',
        hint: 'Tippe auf Position I, dann auf den Large Slot von Gate 12.',
        success: 'Die vorbereitete Kontrolle ermöglicht dir, Position I zurückzuerobern.\nWeiteres Build up nach dem Capture kann die Anzahl der von dir kontrollierten Position im Endspiel erhöhen.',
      },
    },
    {
      moveNumber: 51,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position H und führte einen Massive Build an Gate 2 durch.',
      },
    },
    {
      moveNumber: 52,
      learningPoint: 'massive_build',
      userText: {
        situation: 'Im Endspiel hat es großen Einfluss, welcher Spieler die verbleibenden Large Slots übernimmt.',
        question: 'Wähle Position F und führe einen Massive Build an Gate 12 durch.',
        hint: 'Tippe auf Position F, dann auf den Large Slot von Gate 12.',
        success: '',
      },
    },
    {
      moveNumber: 53,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position L und führte einen Massive Build an Gate 9 durch.',
      },
    },
    {
      moveNumber: 54,
      learningPoint: 'massive_build',
      userText: {
        situation: 'Je näher das Spielende rückt, desto weniger Gates stehen für Build up zur Verfügung.\nEs ist wichtig, die verbleibenden Large Slots zu sichern.',
        question: 'Wähle Position C und führe einen Massive Build an Gate 3 durch.',
        hint: 'Tippe auf Position C, dann auf den Large Slot von Gate 3.',
        success: '',
      },
    },
    {
      moveNumber: 55,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position J und führte einen Selective Build an Gate 9 durch.',
      },
    },
    {
      moveNumber: 56,
      learningPoint: 'massive_build',
      userText: {
        situation: 'Im Endspiel erkennst du Gates, die dein Gegner nicht mehr erreichen kann, und füllst die verbleibenden Slots an Gates, die du noch erreichen kannst.',
        question: 'Wähle Position E und führe einen Massive Build an Gate 2 durch.',
        hint: 'Tippe auf Position E, dann auf den Large Slot von Gate 2.',
        success: '',
      },
    },
    {
      moveNumber: 57,
      learningPoint: 'auto',
      autoText: {
        auto: 'White wählte Position J und führte einen Selective Build an Gate 9 durch.',
      },
    },
    {
      moveNumber: 58,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Das Füllen der verbleibenden Small Slots bringt die Partie dem Ende näher.',
        question: 'Wähle Position B und führe einen Quad Build durch.',
        hint: 'Tippe auf Position B, dann auf einen beliebigen Small Slot.',
        success: '',
      },
    },
    {
      moveNumber: 59,
      learningPoint: 'auto_pass',
      autoText: {
        auto: 'White hatte kein legales Build up mehr verfügbar, daher endete Whites Zug automatisch.',
      },
    },
    {
      moveNumber: 60,
      learningPoint: 'endgame',
      userText: {
        situation: 'White kann den letzten offenen Large Slot bei Gate 3 von keinem seiner kontrollierten Position erreichen.\nDaher endete Whites Zug automatisch.',
        question: 'Wähle Position C und führe einen Massive Build an Gate 3 durch.',
        hint: 'Tippe auf Position C, dann auf den Large Slot von Gate 3.',
        success: 'Alle verbleibenden Build ups sind nun abgeschlossen und die Partie endet.\n\nIn ONE EIGHT endet die Partie, wenn alle Slots an allen Gates gefüllt sind.\nDer Spieler, der zu diesem Zeitpunkt mehr Position kontrolliert, gewinnt.',
      },
      finalText: 'Alle Slots sind gefüllt und die Partie ist vorbei.\n\nGut gemacht. Im Verlauf einer vollständigen ONE EIGHT-Partie hast du Massive Build, Selective Build, Quad Build, Capture, Verteidigung und Endspielentscheidungen erlebt.',
    },
  ],
};
