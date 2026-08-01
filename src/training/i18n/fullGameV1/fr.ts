import type { FGTrainingText } from './types';

/**
 * French (Français) — translated from English canonical source.
 * vous-form. Correct accents, apostrophes, and punctuation.
 * GAME-specific terms kept in English: ONE EIGHT, Position, Gate, Diagonal Gate,
 * Build up, Asset, Slot, Large Slot, Middle Slot, Small Slot, Massive Build,
 * Selective Build, Quad Build, Capture, Black, White, Move, CPU, Pro, Ghost,
 * Postmortem, Official Arena.
 */
export const FULL_GAME_V1_FR: FGTrainingText = {
  courseId: 'full-game-v1',

  meta: {
    title: 'ONE EIGHT Partie guidée — Pensez comme Black',
    description: 'Jouez une partie guidée complète en tant que Black. Découvrez le Massive Build, le Selective Build, le Quad Build, le Capture, la défense et le jugement en fin de partie.',
    finalSummary: 'Vous avez terminé une partie complète de ONE EIGHT. N\'oubliez pas d\'utiliser le Build up pour préparer, défendre et capturer lorsque les valeurs de contrôle des Gates remplissent les conditions requises.',
  },

  steps: [
    {
      moveNumber: 0,
      learningPoint: 'intro',
      introText: 'Un tour se termine en sélectionnant un Position puis en effectuant un Build up.\n\nSélectionnez l\'un des 13 Position au centre du plateau, puis effectuez un Build up d\'Assets sur les Gates accessibles depuis ce Position.\nUne fois le Build up terminé, le tour passe à l\'adversaire.\n\nEssayons.',
    },
    {
      moveNumber: 1,
      learningPoint: 'position_select',
      userText: {
        situation: 'La partie se joue avec Black en premier et White en second.\nC\'est le tour de Black.\nLes Position sont ordonnés de A à M de gauche à droite, de haut en bas.',
        question: 'Tout d\'abord, touchez Position D pour le sélectionner.',
        hint: 'Touchez Position D sur le plateau.',
        success: 'Quand Position D est sélectionné, les Gates depuis lesquels un Build up est possible sont mis en évidence en bleu.',
      },
    },
    {
      moveNumber: 2,
      learningPoint: 'position_select',
      userText: {
        situation: 'Les Gates reliés diagonalement à un Position sélectionné s\'appellent les Diagonal Gates de ce Position.\nLes Diagonal Gates mis en évidence en bleu sont disponibles pour le Build up depuis ce Position.',
        question: 'Touchez Position D à nouveau pour le désélectionner, puis sélectionnez Position G.',
        hint: 'Touchez Position G.',
        success: 'Les Gates disponibles pour le Build up varient selon le Position.\nEn resélectionnant un Position, les Gates disponibles changent également.',
      },
    },
    {
      moveNumber: 3,
      learningPoint: 'massive_build',
      userText: {
        situation: 'Le Build up s\'effectue en plaçant des Assets dans le Large Slot, le Middle Slot ou le Small Slot d\'un Diagonal Gate.\nSelon la taille du Slot sélectionné, il existe trois types de Build up :\nMassive Build\nSelective Build\nQuad Build\nCette fois, effectuez un Massive Build sur Gate 4.\nS\'il y a plusieurs Slots de même taille, vous pouvez toucher l\'un ou l\'autre.',
        question: 'Touchez le plus grand Slot de Gate 4 pour placer un Asset.',
        hint: 'Touchez le Large Slot (le plus grand Slot) de Gate 4.',
        success: 'Avec un Massive Build, vous placez un Asset dans le Large Slot d\'un Gate.\nLes Large Assets ont une grande valeur dans le contrôle des Position plus tard.',
      },
    },
    {
      moveNumber: 4,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position J et effectué un Massive Build sur Gate 7.\n\nLes pièces placées par Build up s\'appellent des Assets. La direction de la flèche d\'un Asset indique quel joueur l\'a placé.\n\nUn Asset dont la flèche pointe vers vous a été placé par vous.',
      },
    },
    {
      moveNumber: 5,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Avec un Selective Build, vous placez des Assets dans les Middle Slots de deux Gates différents.\nVous ne pouvez pas placer des Assets dans les deux Middle Slots du même Gate en un seul Selective Build.',
        question: 'Sélectionnez Position K et effectuez un Selective Build sur Gate 4 et Gate 10.',
        hint: 'Touchez Position K, puis le Middle Slot de Gate 4, puis le Middle Slot de Gate 10.',
        success: 'Le Selective Build répartit les Middle Assets sur deux Gates.\nIl a moins d\'influence sur un Gate individuel que le Massive Build, mais peut affecter plusieurs Gates à la fois.',
      },
    },
    {
      moveNumber: 6,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position E et effectué un Selective Build sur Gate 6 et Gate 10.\n\nLe dernier mouvement de l\'adversaire est mis en évidence en jaune.',
      },
    },
    {
      moveNumber: 7,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Avec un Quad Build, vous placez des Assets dans les Small Slots des quatre Diagonal Gates accessibles depuis ce Position.',
        question: 'Sélectionnez Position B et effectuez un Quad Build.',
        hint: 'Touchez Position B, puis touchez n\'importe quel Small Slot.',
        success: 'Le Quad Build place des Assets sur quatre Gates de manière étendue.\nBien que la valeur de chaque Asset soit faible, il peut affecter plusieurs Gates simultanément.',
      },
    },
    {
      moveNumber: 8,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position D et effectué un Massive Build sur Gate 7.\n\nCe Build up a rempli le Large Slot de Gate 7.',
      },
    },
    {
      moveNumber: 9,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Comme Gate 6 et Gate 10, Black et White peuvent tous deux faire un Build up sur le même Gate.\nUn Gate est composé des Slots suivants :\nLarge Slots : 2\nMiddle Slots : 2\nSmall Slots : 4',
        question: 'Sélectionnez Position I et effectuez un Selective Build sur Gate 8 et Gate 12.',
        hint: 'Touchez Position I, puis le Middle Slot de Gate 8, puis le Middle Slot de Gate 12.',
        success: 'Quand des Assets de Black et White sont placés sur le même Gate, une dispute pour le contrôle s\'engage.\nQuel joueur domine ce Gate est déterminé par la valeur des Assets placés.',
      },
    },
    {
      moveNumber: 10,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position L et effectué un Quad Build.\n\nLa partie se termine quand tous les Slots de tous les Gates ont été remplis en tours alternés.\n\nÀ la fin de la partie, le joueur possédant le plus de Position gagne.',
      },
    },
    {
      moveNumber: 11,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Sélectionnez Position C et effectuez un Selective Build sur Gate 3 et Gate 4.',
        hint: 'Touchez Position C, puis le Middle Slot de Gate 3, puis le Middle Slot de Gate 4.',
        success: 'L\'utilisation du Selective Build vous permet d\'affecter simultanément des Gates liés à plusieurs Position.',
      },
    },
    {
      moveNumber: 12,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position F et effectué un Quad Build.',
      },
    },
    {
      moveNumber: 13,
      learningPoint: 'massive_build',
      userText: {
        situation: '',
        question: 'Sélectionnez Position A et effectuez un Massive Build sur Gate 1.',
        hint: 'Touchez Position A, puis le Large Slot de Gate 1.',
        success: 'Le Massive Build est efficace quand vous voulez contrôler fortement un Gate spécifique.',
      },
    },
    {
      moveNumber: 14,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position H et effectué un Massive Build sur Gate 5.',
      },
    },
    {
      moveNumber: 15,
      learningPoint: 'revisit_position',
      userText: {
        situation: 'Le seul Position libre restant est Position M.\nVous pouvez sélectionner non seulement les Position libres, mais aussi les Position que vous occupez déjà.',
        question: 'Sélectionnez Position G et effectuez un Massive Build sur Gate 1.',
        hint: 'Touchez Position G, puis le Large Slot de Gate 1.',
        success: 'Vous pouvez sélectionner et effectuer un Build up depuis un Position que vous occupez déjà.\nContinuer à construire sur un Position existant permet de préparer la défense ou le Capture.',
      },
    },
    {
      moveNumber: 16,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position M et effectué un Selective Build sur Gate 7 et Gate 8.',
      },
    },
    {
      moveNumber: 17,
      learningPoint: 'gate_check',
      userText: {
        situation: '',
        question: 'Tout d\'abord, sélectionnez Position G.',
        hint: 'Touchez Position G.',
        success: 'Sélectionner Position G vous permet de vérifier les Diagonal Gates de Position G.',
      },
    },
    {
      moveNumber: 18,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Vérifions l\'état du Build up des quatre Diagonal Gates de Position G.\nL\'état actuel est le suivant :\nGate 1 : 2 Large Assets\nGate 4 : 1 Large Asset, 2 Middle Assets\nGate 7 : 2 Large Assets, 1 Middle Asset\nGate 10 : 2 Middle Assets',
        question: 'Sélectionnez ensuite Position A et effectuez un Selective Build sur Gate 1 et Gate 2.',
        hint: 'Touchez Position A, puis le Middle Slot de Gate 1, puis le Middle Slot de Gate 2.',
        success: 'Le contrôle d\'un Position est déterminé par l\'état du Build up de ses Diagonal Gates.\nIl est important d\'identifier quel Gate a reçu le plus de Build up.',
      },
    },
    {
      moveNumber: 19,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position J et effectué un Selective Build sur Gate 5 et Gate 7.',
      },
    },
    {
      moveNumber: 20,
      learningPoint: 'asset_value',
      userText: {
        situation: 'Le Build up sur Gate 1 et Gate 4 a progressé depuis tout à l\'heure.',
        question: 'Sélectionnez Position G.',
        hint: 'Touchez Position G.',
        success: 'Même pour le même Position, la situation de contrôle change à mesure que plus d\'Assets sont placés sur ses Diagonal Gates.',
      },
    },
    {
      moveNumber: 21,
      learningPoint: 'selective_build',
      userText: {
        situation: 'Même tous les Small et Middle Assets disponibles combinés valent moins qu\'un Large Asset.\nQuatre Small Assets valent également moins qu\'un Middle Asset.\nParmi les quatre Diagonal Gates de Position G, Gate 7 est celui qui a reçu le plus de Build up.',
        question: 'Avec Position A sélectionné, effectuez un Selective Build sur Gate 1 et Gate 2.',
        hint: 'Touchez Position A, puis le Middle Slot de Gate 1, puis le Middle Slot de Gate 2.',
        success: 'Le même Gate peut affecter le jugement de contrôle de plusieurs Position.\nIl est important d\'identifier les Gates significatifs pour plusieurs Position.',
      },
    },
    {
      moveNumber: 22,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position L et effectué un Massive Build sur Gate 9.',
      },
    },
    {
      moveNumber: 23,
      learningPoint: 'selective_build',
      userText: {
        situation: '',
        question: 'Sélectionnez Position B et effectuez un Selective Build sur Gate 3 et Gate 11.',
        hint: 'Touchez Position B, puis le Middle Slot de Gate 3, puis le Middle Slot de Gate 11.',
        success: 'Le Selective Build peut être utilisé en pensant à la fois à l\'attaque et à la défense futures.',
      },
    },
    {
      moveNumber: 24,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position F et effectué un Massive Build sur Gate 8.',
      },
    },
    {
      moveNumber: 25,
      learningPoint: 'capture',
      userText: {
        situation: 'Il y a des cas où vous pouvez capturer un Position de l\'adversaire.\nVérifiez le Gate avec le plus de Build up parmi les Diagonal Gates du Position cible.\nSi votre Build up domine celui de l\'adversaire sur ce Gate, vous pouvez capturer le Position de l\'adversaire.\nEn ce moment, il y a un Position de White qui peut être capturé.',
        question: 'Sélectionnez ce Position.',
        hint: 'Touchez Position E.',
        success: 'Capturer un Position est différent de simplement sélectionner un Position libre.\nMême un Position occupé par l\'adversaire peut être capturé si les conditions sont remplies.',
      },
    },
    {
      moveNumber: 26,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Avec Position E sélectionné, effectuez un Massive Build sur Gate 10.',
        hint: 'Touchez le Large Slot de Gate 10.',
        success: 'En effectuant un Build up depuis un Position capturé, vous pouvez avancer à la fois dans l\'attaque et le déploiement.',
      },
    },
    {
      moveNumber: 27,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position F et effectué un Massive Build sur Gate 11.',
      },
    },
    {
      moveNumber: 28,
      learningPoint: 'defense',
      userText: {
        situation: 'Sur Position A, Gate 1 et Gate 7 ont reçu des quantités égales de Build up, ex æquo comme les plus construits parmi ses Diagonal Gates.\nQuand plusieurs Diagonal Gates sont ex æquo comme les plus construits, on compare combien de ces Gates chaque joueur contrôle.\nSur Position A, Black contrôle Gate 1 et White contrôle Gate 7.\nDonc, White ne peut pas capturer Position A.\nBlack défend avec succès Position A.',
        question: 'Tout d\'abord, sélectionnez Position A.',
        hint: 'Touchez Position A.',
        success: 'Quand il y a plusieurs Gates avec le plus de Build up, le nombre de Gates contrôlés devient important.\nS\'ils sont égaux, le Capture ne réussit pas.',
      },
    },
    {
      moveNumber: 29,
      learningPoint: 'defense',
      userText: {
        situation: 'Parmi les Diagonal Gates de Position B, Gate 11 est le Gate avec le plus de Build up.\nUn Large Asset vaut plus que deux Middle Assets.\nActuellement, White contrôle Gate 11.\nSi on laisse les choses ainsi, il y a un risque que White capture Position B au prochain tour.',
        question: 'Désélectionnez Position A et sélectionnez Position B.',
        hint: 'Touchez Position B.',
        success: 'Trouver le Position que l\'adversaire peut capturer ensuite est la première étape de la défense.\nQuand vous trouvez un Position en danger, vous devez effectuer un Build up pour briser le contrôle de l\'adversaire.',
      },
    },
    {
      moveNumber: 30,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'Avec Position B sélectionné, effectuez un Massive Build sur Gate 11.',
        hint: 'Touchez le Large Slot de Gate 11.',
        success: 'En effectuant un Massive Build sur Gate 11, Black a repris le contrôle de Gate 11.\nCela empêche White de capturer Position B.',
      },
    },
    {
      moveNumber: 31,
      learningPoint: 'auto',
      autoText: {
        auto: 'Comme Black a repris le contrôle de Gate 11 avec un Massive Build, White n\'a pas pu capturer Position B.\n\nWhite a sélectionné Position L et effectué un Quad Build.',
      },
    },
    {
      moveNumber: 32,
      learningPoint: 'capture',
      userText: {
        situation: 'En utilisant l\'avantage sur Gate 11, vous pouvez capturer un des Position de White.',
        question: 'Sélectionnez le Position de White qui peut être capturé.',
        hint: 'Touchez Position F.',
        success: 'Le Build up utilisé pour la défense peut mener à la prochaine attaque.\nC\'est parce que le contrôle des Gates affecte plusieurs Position.',
      },
    },
    {
      moveNumber: 33,
      learningPoint: 'capture',
      userText: {
        situation: '',
        question: 'Effectuez un Selective Build sur Gate 11 et Gate 12 pour renforcer davantage Gate 11.',
        hint: 'Touchez le Middle Slot de Gate 11, puis le Middle Slot de Gate 12.',
        success: 'Renforcer davantage les Diagonal Gates après un Capture facilite la protection du Position capturé.',
      },
    },
    {
      moveNumber: 34,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position M et effectué un Quad Build.',
      },
    },
    {
      moveNumber: 35,
      learningPoint: 'defense',
      userText: {
        situation: 'Si on laisse les choses ainsi, White capturera Position I au prochain tour.\nMême si Black effectue un Massive Build sur Gate 8, Black ne peut pas dominer.\nSur Gate 8, White a construit 1 Large Asset, 1 Middle Asset et 4 Small Assets.\nMême si Black effectue un Massive Build là, Black aurait 1 Large Asset, 1 Middle Asset et 0 Small Assets.\nLa différence de Small Assets signifie que Black ne peut pas renverser la domination de White.',
        question: 'Sélectionnez Position I.',
        hint: 'Touchez Position I.',
        success: 'Placer un Large Asset ne garantit pas toujours que vous prendrez le contrôle.\nLa différence dans les Middle et Small Assets déjà placés peut empêcher le contrôle d\'être renversé.',
      },
    },
    {
      moveNumber: 36,
      learningPoint: 'defense',
      userText: {
        situation: '',
        question: 'Pour défendre temporairement Position I, effectuez un Massive Build sur Gate 4.',
        hint: 'Touchez le Large Slot de Gate 4.',
        success: 'Quand vous ne pouvez pas renverser directement le contrôle d\'un Gate, renforcer un autre Diagonal Gate peut temporairement protéger le Position.',
      },
    },
    {
      moveNumber: 37,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position L et effectué un Massive Build sur Gate 8.\n\nPour déterminer quel Gate a reçu le plus de Build up, peu importe quel joueur a placé les Assets.\nOn additionne le Build up des deux joueurs.\n\nLes Diagonal Gates de Position I sont Gate 4, Gate 8, Gate 10 et Gate 12.\nActuellement, le Gate avec le plus de Build up parmi eux est Gate 8.\n\nCette situation ne peut pas être renversée en un mouvement.',
      },
    },
    {
      moveNumber: 38,
      learningPoint: 'capture_quad',
      userText: {
        situation: '',
        question: 'Capturez Position D et effectuez un Quad Build.',
        hint: 'Touchez Position D, puis touchez n\'importe quel Small Slot.',
        success: 'En sélectionnant un Position capturable et en effectuant un Quad Build depuis là, vous pouvez influencer largement tout le plateau.',
      },
    },
    {
      moveNumber: 39,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position I et effectué un Massive Build sur Gate 10.',
      },
    },
    {
      moveNumber: 40,
      learningPoint: 'quad_build',
      userText: {
        situation: 'À l\'approche de la fin de partie, de moins en moins de Slots restent ouverts.\nSuivez quels Gates ont encore de la place pour le Build up.',
        question: 'Sélectionnez Position A et effectuez un Quad Build.',
        hint: 'Touchez Position A, puis touchez n\'importe quel Small Slot.',
        success: '',
      },
    },
    {
      moveNumber: 41,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position H et effectué un Selective Build sur Gate 5 et Gate 6.',
      },
    },
    {
      moveNumber: 42,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Sélectionnez Position G et effectuez un Quad Build.',
        hint: 'Touchez Position G, puis touchez n\'importe quel Small Slot.',
        success: 'En répartissant les Assets sur les Small Slots restants, le Quad Build peut affecter des marges étroites de contrôle en fin de partie.',
      },
    },
    {
      moveNumber: 43,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position H et effectué un Massive Build sur Gate 5.',
      },
    },
    {
      moveNumber: 44,
      learningPoint: 'quad_build',
      userText: {
        situation: '',
        question: 'Sélectionnez Position K et effectuez un Quad Build.',
        hint: 'Touchez Position K, puis touchez n\'importe quel Small Slot.',
        success: 'Continuer à sélectionner vos Position et effectuer des Build up vous permet d\'élargir le contrôle et de renforcer la défense.',
      },
    },
    {
      moveNumber: 45,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position M et effectué un Massive Build sur Gate 6.',
      },
    },
    {
      moveNumber: 46,
      learningPoint: 'partial_quad',
      userText: {
        situation: 'Gate 11 n\'a plus de Slots disponibles pour les Small Assets.\nVous pouvez donc effectuer un Quad Build en construisant des Small Assets sur Gate 4, Gate 9 et Gate 10.\nAvec Selective Build et Quad Build, si certains Slots cibles sont pleins, le Build up n\'est effectué que là où il reste de la place.',
        question: 'Sélectionnez Position K et effectuez un Quad Build.',
        hint: 'Touchez Position K, puis touchez n\'importe quel Small Slot.',
        success: 'Même quand vous ne pouvez pas placer des Assets sur tous les Gates cibles, vous pouvez effectuer un Build up sur les Gates qui ont encore des Slots ouverts.\nCe type de Build up partiel se produit naturellement en fin de partie.',
      },
    },
    {
      moveNumber: 47,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position H et effectué un Massive Build sur Gate 6.',
      },
    },
    {
      moveNumber: 48,
      learningPoint: 'prepare_capture',
      userText: {
        situation: 'Maintenant, parmi les Diagonal Gates de Position I (Gate 4, Gate 8, Gate 10, Gate 12), les trois Gates avec le plus de Build up sont Gate 4, Gate 8 et Gate 10.\nDe plus, Black peut établir une dominance sur Gate 4 et Gate 10.\nPar conséquent, Black pourra recapturer Position I à son prochain tour car il contrôlera plus des Gates ex æquo.',
        question: 'Sélectionnez Position C et effectuez un Build up pour préparer la recapture de Position I au prochain tour de Black.',
        hint: 'Touchez Position C, puis touchez n\'importe quel Small Slot.',
        success: 'Même si un Position ne peut pas être capturé immédiatement, se préparer un tour à l\'avance peut créer les conditions nécessaires pour le capturer à votre prochain tour.\nDans ONE EIGHT, ce type de Build up préparatoire est important.',
      },
    },
    {
      moveNumber: 49,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position H et effectué un Quad Build.',
      },
    },
    {
      moveNumber: 50,
      learningPoint: 'capture_massive',
      userText: {
        situation: '',
        question: 'Sélectionnez Position I et effectuez un Massive Build sur Gate 12.',
        hint: 'Touchez Position I, puis le Large Slot de Gate 12.',
        success: 'Le contrôle que vous avez préparé vous permet de recapturer Position I.\nContinuer le Build up après le Capture peut augmenter le nombre de Position que vous contrôlez en fin de partie.',
      },
    },
    {
      moveNumber: 51,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position H et effectué un Massive Build sur Gate 2.',
      },
    },
    {
      moveNumber: 52,
      learningPoint: 'massive_build',
      userText: {
        situation: 'En fin de partie, quel joueur prend les Large Slots restants a un impact significatif.',
        question: 'Sélectionnez Position F et effectuez un Massive Build sur Gate 12.',
        hint: 'Touchez Position F, puis le Large Slot de Gate 12.',
        success: '',
      },
    },
    {
      moveNumber: 53,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position L et effectué un Massive Build sur Gate 9.',
      },
    },
    {
      moveNumber: 54,
      learningPoint: 'massive_build',
      userText: {
        situation: 'À mesure que la partie approche de sa fin, moins de Gates restent disponibles pour le Build up.\nIl est important de s\'assurer d\'obtenir les Large Slots restants.',
        question: 'Sélectionnez Position C et effectuez un Massive Build sur Gate 3.',
        hint: 'Touchez Position C, puis le Large Slot de Gate 3.',
        success: '',
      },
    },
    {
      moveNumber: 55,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position J et effectué un Selective Build sur Gate 9.',
      },
    },
    {
      moveNumber: 56,
      learningPoint: 'massive_build',
      userText: {
        situation: 'En fin de partie, identifiez les Gates que votre adversaire ne peut plus atteindre tout en remplissant les Slots restants des Gates que vous pouvez encore atteindre.',
        question: 'Sélectionnez Position E et effectuez un Massive Build sur Gate 2.',
        hint: 'Touchez Position E, puis le Large Slot de Gate 2.',
        success: '',
      },
    },
    {
      moveNumber: 57,
      learningPoint: 'auto',
      autoText: {
        auto: 'White a sélectionné Position J et effectué un Selective Build sur Gate 9.',
      },
    },
    {
      moveNumber: 58,
      learningPoint: 'quad_build',
      userText: {
        situation: 'Remplir les Small Slots restants rapproche la partie de sa fin.',
        question: 'Sélectionnez Position B et effectuez un Quad Build.',
        hint: 'Touchez Position B, puis touchez n\'importe quel Small Slot.',
        success: '',
      },
    },
    {
      moveNumber: 59,
      learningPoint: 'auto_pass',
      autoText: {
        auto: 'White n\'avait pas de Build up légal disponible, donc le tour de White s\'est terminé automatiquement.',
      },
    },
    {
      moveNumber: 60,
      learningPoint: 'endgame',
      userText: {
        situation: 'White ne peut pas accéder au dernier Large Slot ouvert sur Gate 3 depuis aucun Position qu\'il contrôle.\nPar conséquent, le tour de White s\'est terminé automatiquement.',
        question: 'Sélectionnez Position C et effectuez un Massive Build sur Gate 3.',
        hint: 'Touchez Position C, puis le Large Slot de Gate 3.',
        success: 'Tout le Build up restant est maintenant terminé et la partie se termine.\n\nDans ONE EIGHT, la partie se termine quand tous les Slots de tous les Gates sont remplis.\nLe joueur qui contrôle le plus de Position à ce moment-là gagne.',
      },
      finalText: 'Tous les Slots sont remplis et la partie est terminée.\n\nBravo. Au cours d\'une partie complète de ONE EIGHT, vous avez découvert le Massive Build, le Selective Build, le Quad Build, le Capture, la défense et la prise de décisions en fin de partie.',
    },
  ],
};
