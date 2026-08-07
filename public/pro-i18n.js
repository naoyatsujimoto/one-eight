/**
 * pro-i18n.js
 * ONE EIGHT — Pro page i18n dictionary
 * Phase 5-1F1: EN/JA/zh-Hant/zh-Hans. English is the canonical source.
 * Phase 3 (Master Reward): arenaDesc updated (EN/JA canonical); arenaEntryNote, proFeeNote added.
 *   Remaining 8 locales use EN fallback with TODO comments.
 */
(function () {
  'use strict';

  var dict = {
    en: {
      title:          'Pro Membership — ONE EIGHT',
      eyebrow:        'Pro Membership',
      heroTitle:      'Play deeper.',
      heroLead:       'ONE EIGHT Pro unlocks analytical tools and competitive features built for players who want to improve.',

      iconGhost:      'Ghost',
      ghostName:      'Ghost Analysis',
      ghostDesc:      'See the strongest moves the engine considered at each point in the game. Available during CPU matches and online play.',

      iconPostmortem: 'Postmortem',
      postmortemName: 'Postmortem Candidate Moves',
      postmortemDesc: 'After any game, review the engine\'s top candidate moves at every turn. Understand where your choices diverged from optimal play.',

      iconHistory:    'History',
      historyName:    'Full Game History',
      historyDesc:    'Access your complete game archive. Free accounts see the most recent games only.',

      iconMore:       'More',
      arenaName:      'Official Arena',
      arenaDesc:      'Join Official Arena during the initial launch period — currently open to Pro members. Official Arenas are planned to be progressively opened to Free members after operations have stabilized.',
      arenaEntryNote: 'Pro members can enter Official Arenas during the initial launch period. Official Arenas will be progressively opened to Free members after operations have stabilized. The timing of this expansion will be determined based on arena conditions.',
      proFeeNote:     'The Pro membership fee is a service usage fee and does not guarantee Master Reward eligibility.',

      perMo:          '/mo',
      ctaNote:        'Billed monthly · Cancel anytime',
      ctaBtn:         'See Pricing & Subscribe →',

      navPricing:     'Pricing',
      navTerms:       'Terms',
      navPrivacy:     'Privacy',

      footerHome:     'Home',
      footerPricing:  'Pricing',
      footerTerms:    'Terms of Service',
      footerPrivacy:  'Privacy Policy',
      footerRefund:   'Refund Policy',
      footerContact:  'Contact',
      languageSelectorLabel: 'Select language',
    },

    ja: {
      title:          'Pro メンバーシップ — ONE EIGHT',
      eyebrow:        'Pro メンバーシップ',
      heroTitle:      'ONE EIGHT Pro',
      heroLead:       'Proでは、Ghost、Postmortem、公式アリーナなど、対局をより深く楽しむための機能を利用できます。',

      iconGhost:      'Ghost',
      ghostName:      'Ghost Analysis',
      ghostDesc:      '過去の対局データにもとづいて、候補手を確認できます。CPU対局・オンライン対局で利用可能です。',

      iconPostmortem: 'Postmortem',
      postmortemName: 'Postmortem Candidate Moves',
      postmortemDesc: '対局後に局面を振り返り、次の一手を検討できます。各手番でのエンジン最善候補を確認できます。',

      iconHistory:    '履歴',
      historyName:    '全対局履歴',
      historyDesc:    '過去の全対局を閲覧できます。無料アカウントでは直近の対局のみ表示されます。',

      iconMore:       'その他',
      arenaName:      '公式Arena',
      arenaDesc:      'Official Arenaの初期運営期間中に参加できます（現在Pro会員限定）。運営体制の安定後、Free会員にも段階的に解放予定。',
      arenaEntryNote: 'Pro会員はOfficial Arenaの初期運営期間中からEntryできます。Official Arenaは、運営体制の安定後、Free会員にも段階的に解放する予定です。解放時期はArenaの運営状況により決定します。',
      proFeeNote:     'Pro会費はサービス利用料です。Master報酬の受給を保証するものではありません。',

      perMo:          '/ 月',
      ctaNote:        '月額払い・いつでもキャンセル可',
      ctaBtn:         'Proを開始する →',

      navPricing:     '料金',
      navTerms:       '利用規約',
      navPrivacy:     'プライバシー',

      footerHome:     'ホーム',
      footerPricing:  '料金',
      footerTerms:    '利用規約',
      footerPrivacy:  'プライバシーポリシー',
      footerRefund:   '返金ポリシー',
      footerContact:  'お問い合わせ',
      languageSelectorLabel: '言語を選択',
    },

    'zh-Hant': {
      title:          'Pro 會員資格 — ONE EIGHT',
      eyebrow:        'Pro 會員資格',
      heroTitle:      '更深入地下棋。',
      heroLead:       'ONE EIGHT Pro 解鎖分析工具與競技功能，為希望不斷進步的玩家而打造。',

      iconGhost:      'Ghost',
      ghostName:      'Ghost Analysis',
      ghostDesc:      '查看引擎在局中每個時點最強候選手。支援 CPU 對局與線上對局。',

      iconPostmortem: 'Postmortem',
      postmortemName: 'Postmortem Candidate Moves',
      postmortemDesc: '對局結束後，回顾引擎在每個回合的最佳候選手。了解你的選擇在哪裡偏離了最優解。',

      iconHistory:    '對局紀錄',
      historyName:    '完整對局歷史',
      historyDesc:    '檢視所有對局紀錄。免費記事僅顯示最近的對局。',

      iconMore:       '更多',
      arenaName:      'Official Arena',
      arenaDesc:      '加入 Pro 會員專屬的 Official Arena。參賽並獲得您的排名。',

      arenaEntryNote: 'Pro會員可在初期運營期間報名參加Official Arena。Official Arena計劃在運營穩定後，逐步向Free會員開放。開放時機將依Arena的運營狀況而定。',
      proFeeNote:     'Pro會費為服務使用費，不保證Master報酬的受領資格。',

      perMo:          '/月',
      ctaNote:        '按月計費·隨時可取消',
      ctaBtn:         '查看方案與訂閱 →',

      navPricing:     '定價',
      navTerms:       '服務條款',
      navPrivacy:     '隱私權',

      footerHome:     '首頁',
      footerPricing:  '定價',
      footerTerms:    '服務條款',
      footerPrivacy:  '隱私權政策',
      footerRefund:   '退款政策',
      footerContact:  '聯絡我們',
      languageSelectorLabel: '選擇語言',
    },

    ko: {
      title:          'Pro 멤버십 — ONE EIGHT',
      eyebrow:        'Pro 멤버십',
      heroTitle:      '더 깊이 두세요.',
      heroLead:       'ONE EIGHT Pro는 실력을 키우려는 플레이어를 위한 분석 도구와 경쟁 기능을 제공합니다.',

      iconGhost:      'Ghost',
      ghostName:      'Ghost Analysis',
      ghostDesc:      '각 수순에서 엔진이 고려한 최강 후보수를 확인하세요. CPU 대국과 온라인 대국에서 이용 가능합니다.',

      iconPostmortem: 'Postmortem',
      postmortemName: 'Postmortem Candidate Moves',
      postmortemDesc: '대국 후 매 차례 엔진의 최우선 후보수를 검토하세요. 내 선택이 최적 수순과 어디서 달라졌는지 파악할 수 있습니다.',

      iconHistory:    '기록',
      historyName:    '전체 대국 기록',
      historyDesc:    '모든 대국 기록에 접근할 수 있습니다. 무료 계정은 최근 대국만 표시됩니다.',

      iconMore:       '더 보기',
      arenaName:      'Official Arena',
      arenaDesc:      'Pro 회원 전용 Official Arena에 참가하세요. 경쟁을 통해 랭킹을 획득하세요.',

      arenaEntryNote: 'Pro 회원은 초기 운영 기간 중 Official Arena에 참가 신청할 수 있습니다. Official Arena는 운영이 안정된 후 Free 회원에게도 단계적으로 개방될 예정입니다. 개방 시기는 Arena 운영 상황에 따라 결정됩니다.',
      proFeeNote:     'Pro 회비는 서비스 이용료이며, Master 보상 수령 자격을 보장하지 않습니다.',

      perMo:          '/월',
      ctaNote:        '월별 청구 · 언제든지 취소 가능',
      ctaBtn:         '요금제 확인 및 구독 →',

      navPricing:     '요금',
      navTerms:       '이용약관',
      navPrivacy:     '개인정보처리방침',

      footerHome:     '홈',
      footerPricing:  '요금',
      footerTerms:    '이용약관',
      footerPrivacy:  '개인정보처리방침',
      footerRefund:   '환불 정책',
      footerContact:  '문의하기',
      languageSelectorLabel: '언어 선택',
    },

    es: {
      title:          'Membresía Pro — ONE EIGHT',
      eyebrow:        'Membresía Pro',
      heroTitle:      'Juega con más profundidad.',
      heroLead:       'ONE EIGHT Pro desbloquea herramientas de análisis y funciones competitivas diseñadas para jugadores que quieren mejorar.',

      iconGhost:      'Ghost',
      ghostName:      'Ghost Analysis',
      ghostDesc:      'Observa los movimientos más fuertes que el motor consideró en cada momento de la partida. Disponible en partidas contra CPU y en línea.',

      iconPostmortem: 'Postmortem',
      postmortemName: 'Postmortem Candidate Moves',
      postmortemDesc: 'Tras cada partida, revisa los principales movimientos candidatos del motor en cada turno. Entiende en qué momento tus decisiones se apartaron del juego óptimo.',

      iconHistory:    'Historial',
      historyName:    'Historial completo de partidas',
      historyDesc:    'Accede a tu archivo completo de partidas. Las cuentas gratuitas solo ven las partidas más recientes.',

      iconMore:       'Más',
      arenaName:      'Official Arena',
      arenaDesc:      'Únete al Official Arena exclusivo para miembros Pro. Compite y consigue tu clasificación.',

      arenaEntryNote: 'Los miembros Pro pueden inscribirse en Official Arenas durante el período de lanzamiento inicial. Las Official Arenas se abrirán progresivamente a los miembros Free una vez que las operaciones se hayan estabilizado. El momento de esta apertura se determinará en función de las condiciones de la Arena.',
      proFeeNote:     'La cuota de membresía Pro es una tarifa por uso del servicio y no garantiza la elegibilidad para la Master Reward.',

      perMo:          '/mes',
      ctaNote:        'Facturación mensual · Cancela cuando quieras',
      ctaBtn:         'Ver precios y suscribirse →',

      navPricing:     'Precios',
      navTerms:       'Términos',
      navPrivacy:     'Privacidad',

      footerHome:     'Inicio',
      footerPricing:  'Precios',
      footerTerms:    'Términos de servicio',
      footerPrivacy:  'Política de privacidad',
      footerRefund:   'Política de reembolso',
      footerContact:  'Contacto',
      languageSelectorLabel: 'Seleccionar idioma',
    },

    'pt-BR': {
      title:          'Assinatura Pro — ONE EIGHT',
      eyebrow:        'Assinatura Pro',
      heroTitle:      'Jogue com mais profundidade.',
      heroLead:       'O ONE EIGHT Pro desbloqueia ferramentas de análise e recursos competitivos criados para jogadores que querem evoluir.',

      iconGhost:      'Ghost',
      ghostName:      'Ghost Analysis',
      ghostDesc:      'Veja os movimentos mais fortes que o motor considerou em cada momento da partida. Disponível em partidas contra CPU e online.',

      iconPostmortem: 'Postmortem',
      postmortemName: 'Postmortem Candidate Moves',
      postmortemDesc: 'Após cada partida, revise os principais movimentos candidatos do motor em cada turno. Entenda onde suas escolhas divergiram do jogo ideal.',

      iconHistory:    'Histórico',
      historyName:    'Histórico completo de partidas',
      historyDesc:    'Acesse seu arquivo completo de partidas. Contas gratuitas exibem apenas as partidas mais recentes.',

      iconMore:       'Mais',
      arenaName:      'Official Arena',
      arenaDesc:      'Participe do Official Arena exclusivo para membros Pro. Compita e conquiste sua classificação.',

      arenaEntryNote: 'Os membros Pro podem se inscrever em Official Arenas durante o período inicial de lançamento. As Official Arenas serão progressivamente abertas aos membros Free após a estabilização das operações. O momento dessa abertura será determinado com base nas condições da Arena.',
      proFeeNote:     'A taxa de assinatura Pro é uma taxa de uso do serviço e não garante elegibilidade para a Master Reward.',

      perMo:          '/mês',
      ctaNote:        'Cobrado mensalmente · Cancele quando quiser',
      ctaBtn:         'Ver planos e assinar →',

      navPricing:     'Preços',
      navTerms:       'Termos',
      navPrivacy:     'Privacidade',

      footerHome:     'Início',
      footerPricing:  'Preços',
      footerTerms:    'Termos de Serviço',
      footerPrivacy:  'Política de Privacidade',
      footerRefund:   'Política de Reembolso',
      footerContact:  'Contato',
      languageSelectorLabel: 'Selecionar idioma',
    },

    de: {
      title:          'Pro-Mitgliedschaft — ONE EIGHT',
      eyebrow:        'Pro-Mitgliedschaft',
      heroTitle:      'Spiele auf höherem Niveau.',
      heroLead:       'ONE EIGHT Pro schaltet Analysetools und Wettbewerbsfunktionen frei – entwickelt für Spieler, die sich verbessern wollen.',

      iconGhost:      'Ghost',
      ghostName:      'Ghost Analysis',
      ghostDesc:      'Sieh die stärksten Züge, die die Engine in jeder Spielphase in Betracht gezogen hat. Verfügbar in CPU-Partien und Online-Spielen.',

      iconPostmortem: 'Postmortem',
      postmortemName: 'Postmortem Candidate Moves',
      postmortemDesc: 'Überprüfe nach jeder Partie die besten Kandidatenzüge der Engine für jeden Zug. Erkenne, wo deine Entscheidungen vom optimalen Spiel abgewichen sind.',

      iconHistory:    'Verlauf',
      historyName:    'Vollständiger Partieverlauf',
      historyDesc:    'Greife auf dein gesamtes Partiearchiv zu. Kostenlose Konten sehen nur die neuesten Partien.',

      iconMore:       'Mehr',
      arenaName:      'Official Arena',
      arenaDesc:      'Nimm an der offiziellen Arena teil, exklusiv für Pro-Mitglieder. Tritt an und erarbeite dir dein Ranking.',

      arenaEntryNote: 'Pro-Mitglieder können sich während des anfänglichen Einführungszeitraums für Official Arenas anmelden. Official Arenas sind geplant, nach der Stabilisierung des Betriebs schrittweise für Free-Mitglieder geöffnet zu werden. Der Zeitpunkt dieser Erweiterung wird anhand der Arena-Bedingungen festgelegt.',
      proFeeNote:     'Der Pro-Mitgliedsbeitrag ist eine Servicegebühr und garantiert keine Berechtigung zur Master Reward.',

      perMo:          '/Monat',
      ctaNote:        'Monatliche Abrechnung · Jederzeit kündbar',
      ctaBtn:         'Preise ansehen & abonnieren →',

      navPricing:     'Preise',
      navTerms:       'Nutzungsbedingungen',
      navPrivacy:     'Datenschutz',

      footerHome:     'Startseite',
      footerPricing:  'Preise',
      footerTerms:    'Nutzungsbedingungen',
      footerPrivacy:  'Datenschutzrichtlinie',
      footerRefund:   'Rückgaberichtlinie',
      footerContact:  'Kontakt',
      languageSelectorLabel: 'Sprache auswählen',
    },

    fr: {
      title:          'Abonnement Pro — ONE EIGHT',
      eyebrow:        'Abonnement Pro',
      heroTitle:      'Jouez avec plus de profondeur.',
      heroLead:       'ONE EIGHT Pro déverrouille des outils d’analyse et des fonctions compétitives conçus pour les joueurs qui veulent progresser.',

      iconGhost:      'Ghost',
      ghostName:      'Ghost Analysis',
      ghostDesc:      'Visualisez les coups les plus forts que le moteur a envisagés à chaque moment de la partie. Disponible lors des parties contre le CPU et en ligne.',

      iconPostmortem: 'Postmortem',
      postmortemName: 'Postmortem Candidate Moves',
      postmortemDesc: 'Après chaque partie, passez en revue les principaux coups candidats du moteur à chaque tour. Comprenez où vos choix ont différé du jeu optimal.',

      iconHistory:    'Historique',
      historyName:    'Historique complet des parties',
      historyDesc:    'Accédez à l’intégralité de vos parties. Les comptes gratuits n’affichent que les parties les plus récentes.',

      iconMore:       'Plus',
      arenaName:      'Official Arena',
      arenaDesc:      'Rejoignez l’Official Arena, réservée aux membres Pro. Participez et obtenez votre classement.',

      arenaEntryNote: 'Les membres Pro peuvent s’inscrire aux Official Arenas pendant la période de lancement initiale. Les Official Arenas sont prévues pour être progressivement ouvertes aux membres Free une fois les opérations stabilisées. Le calendrier de cette ouverture sera déterminé en fonction des conditions de l’Arena.',
      proFeeNote:     'La cotisation Pro est une redevance d’utilisation du service et ne garantit pas l’éligibilité à la Master Reward.',

      perMo:          '/mois',
      ctaNote:        'Facturation mensuelle · Annulez à tout moment',
      ctaBtn:         'Voir les tarifs et s’abonner →',

      navPricing:     'Tarifs',
      navTerms:       'Conditions',
      navPrivacy:     'Confidentialité',

      footerHome:     'Accueil',
      footerPricing:  'Tarifs',
      footerTerms:    'Conditions d’utilisation',
      footerPrivacy:  'Politique de confidentialité',
      footerRefund:   'Politique de remboursement',
      footerContact:  'Contact',
      languageSelectorLabel: 'Choisir la langue',
    },

    it: {
      title:          'Abbonamento Pro — ONE EIGHT',
      eyebrow:        'Abbonamento Pro',
      heroTitle:      'Gioca con più profondità.',
      heroLead:       'ONE EIGHT Pro sblocca strumenti di analisi e funzionalità competitive pensate per i giocatori che vogliono migliorare.',

      iconGhost:      'Ghost',
      ghostName:      'Ghost Analysis',
      ghostDesc:      'Visualizza le mosse più forti considerate dal motore in ogni momento della partita. Disponibile nelle partite contro CPU e online.',

      iconPostmortem: 'Postmortem',
      postmortemName: 'Postmortem Candidate Moves',
      postmortemDesc: 'Dopo ogni partita, esamina le principali mosse candidate del motore a ogni turno. Scopri dove le tue scelte si sono discostate dal gioco ottimale.',

      iconHistory:    'Cronologia',
      historyName:    'Cronologia completa delle partite',
      historyDesc:    'Accedi all’archivio completo delle tue partite. Gli account gratuiti vedono solo le partite più recenti.',

      iconMore:       'Altro',
      arenaName:      'Official Arena',
      arenaDesc:      'Unisciti all’Official Arena, esclusiva per i membri Pro. Gareggia e ottieni il tuo ranking.',

      arenaEntryNote: 'I membri Pro possono iscriversi alle Official Arenas durante il periodo di lancio iniziale. Le Official Arenas sono pianificate per essere progressivamente aperte ai membri Free dopo la stabilizzazione delle operazioni. I tempi di questa apertura saranno determinati in base alle condizioni dell’Arena.',
      proFeeNote:     'La quota di abbonamento Pro è una commissione per l’utilizzo del servizio e non garantisce l’idoneità alla Master Reward.',

      perMo:          '/mese',
      ctaNote:        'Fatturazione mensile · Disdici quando vuoi',
      ctaBtn:         'Vedi i prezzi e abbonati →',

      navPricing:     'Prezzi',
      navTerms:       'Termini',
      navPrivacy:     'Privacy',

      footerHome:     'Home',
      footerPricing:  'Prezzi',
      footerTerms:    'Termini di servizio',
      footerPrivacy:  'Informativa sulla privacy',
      footerRefund:   'Politica di rimborso',
      footerContact:  'Contatti',
      languageSelectorLabel: 'Seleziona la lingua',
    },

    'zh-Hans': {
      title:          'Pro 会员资格 — ONE EIGHT',
      eyebrow:        'Pro 会员资格',
      heroTitle:      '更深入地下棋。',
      heroLead:       'ONE EIGHT Pro 解锁分析工具与竞技功能，专为希望不断进步的玩家打造。',

      iconGhost:      'Ghost',
      ghostName:      'Ghost Analysis',
      ghostDesc:      '查看引擎在局中每个时刻考虑的最强候选手。支持 CPU 对局与在线对局。',

      iconPostmortem: 'Postmortem',
      postmortemName: 'Postmortem Candidate Moves',
      postmortemDesc: '对局结束后，回顾引擎在每个回合的最佳候选手。了解你的选择在哪里偏离了最优解。',

      iconHistory:    '对局记录',
      historyName:    '完整对局历史',
      historyDesc:    '查看所有对局记录。免费账户仅显示最近的对局。',

      iconMore:       '更多',
      arenaName:      'Official Arena',
      arenaDesc:      '加入 Pro 会员专属的 Official Arena。参赛并获得您的排名。',

      arenaEntryNote: 'Pro会员可在初期运营期间报名參加Official Arena。Official Arena计划在运营稳定后，逐步向Free会员开放。开放时机将根据Arena的运营状况决定。',
      proFeeNote:     'Pro会费为服务使用费，不保证Master报酬的受领资格。',

      perMo:          '/月',
      ctaNote:        '按月计费·随时可取消',
      ctaBtn:         '查看方案与订阅 →',

      navPricing:     '定价',
      navTerms:       '服务条款',
      navPrivacy:     '隐私',

      footerHome:     '首页',
      footerPricing:  '定价',
      footerTerms:    '服务条款',
      footerPrivacy:  '隐私政策',
      footerRefund:   '退款政策',
      footerContact:  '联系我们',
      languageSelectorLabel: '选择语言',
    },
  };

  if (typeof window !== 'undefined' && window.ONE_EIGHT_STATIC_I18N) {
    window.ONE_EIGHT_STATIC_I18N.registerPage(dict);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        window.ONE_EIGHT_STATIC_I18N.apply();
      });
    } else {
      window.ONE_EIGHT_STATIC_I18N.apply();
    }
  }
})();
