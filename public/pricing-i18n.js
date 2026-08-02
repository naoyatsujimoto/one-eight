/**
 * pricing-i18n.js
 * ONE EIGHT — Pricing page i18n dictionary
 * Phase 5-1D2: EN/JA/zh-Hant/zh-Hans/ko/es/pt-BR/de/fr/it. English is the canonical source.
 */
(function () {
  'use strict';

  var dict = {
    en: {
      title:        'Pricing — ONE EIGHT',
      eyebrow:      'Plans & Pricing',
      h1:           'Simple, honest pricing.',
      lead:         'ONE EIGHT is free to play. A membership unlocks competitive features — ranked games, tournament entry, and more as we grow.',

      freeTag:      'Free',
      freePriceNote:'No credit card required',
      freeFeature1: 'Full access to local play (Human vs Human)',
      freeFeature2: 'Play against the CPU at all difficulty levels',
      freeFeature3: 'Online friend matches via private room codes',
      freeFeature4: 'Game history and basic stats',
      freeFeature5: 'Tutorial and in-game rules',

      perMo:        '/mo',
      proPriceNote: 'Billed monthly · Cancel anytime',
      proFeature1:  'Everything in Free',
      proFeature2:  'Ranked matches with rating system',
      proFeature3:  'Domestic and season leaderboards',
      proFeature4:  'Competition entry (with official key)',
      proFeature5:  'Priority access to new competitive features',

      btnSubscribe: 'Subscribe — $14.99 / mo',
      cancelText:   'Manage or cancel your subscription through Paddle, our payment provider and merchant of record.',
      cancelLink:   'Manage Subscription at Paddle',

      note:         'Prices are in USD. Competitive features are under active development and may be expanded or adjusted as the service evolves. Any changes to paid plan pricing will be communicated in advance.',

      navPricing:    'Pricing',
      navTerms:      'Terms',
      navPrivacy:    'Privacy',
      navRefund:     'Refund',

      footerHome:    'Home',
      footerPricing: 'Pricing',
      footerTerms:   'Terms of Service',
      footerPrivacy: 'Privacy Policy',
      footerRefund:  'Refund Policy',
      footerContact: 'Contact',

      alreadyPro: 'You are already Pro.',
      alreadyProRenews: function (date) {
        return 'You are already Pro — renews ' + date;
      },
      languageSelectorLabel: 'Select language',
    },

    ja: {
      title:        '料金 — ONE EIGHT',
      eyebrow:      'プラン・料金',
      h1:           'シンプルで明確な料金体系。',
      lead:         'ONE EIGHT は無料でプレイできます。メンバーシップに登録すると、ランク戦、大会エントリーなど、競技機能がアンロックされます。',

      freeTag:      '無料',
      freePriceNote:'クレジットカード不要',
      freeFeature1: 'ローカル対戦（人間 vs 人間）フルアクセス',
      freeFeature2: '全難易度で CPU 対戦可能',
      freeFeature3: 'プライベートコードでオンライン友人対戦',
      freeFeature4: '対局履歴と基本統計',
      freeFeature5: 'チュートリアルとゲーム内ルール',

      perMo:        '/ 月',
      proPriceNote: '月額請求・いつでもキャンセル可',
      proFeature1:  'Free の全機能',
      proFeature2:  'レーティングシステム付きランク戦',
      proFeature3:  '国内・シーズンリーダーボード',
      proFeature4:  '大会エントリー（公式キーが必要）',
      proFeature5:  '新競技機能への優先アクセス',

      btnSubscribe: '登録する — $14.99 / 月',
      cancelText:   'Paddle（当サービスの決済代行・merchant of record）でサブスクリプションを管理・キャンセルできます。',
      cancelLink:   'Paddle でサブスクリプションを管理',

      note:         '価格は米ドル表示です。競技機能は開発中のため、今後追加・変更される場合があります。有料プランの価格変更は事前にお知らせします。',

      navPricing:    '料金',
      navTerms:      '利用規約',
      navPrivacy:    'プライバシー',
      navRefund:     '返金',

      footerHome:    'ホーム',
      footerPricing: '料金',
      footerTerms:   '利用規約',
      footerPrivacy: 'プライバシーポリシー',
      footerRefund:  '返金ポリシー',
      footerContact: 'お問い合わせ',

      alreadyPro: 'すでに Pro です。',
      alreadyProRenews: function (date) {
        return 'すでに Pro です — 更新日: ' + date;
      },
      languageSelectorLabel: '言語を選択',
    },

    'zh-Hant': {
      title:        '方案定價 — ONE EIGHT',
      eyebrow:      '方案與定價',
      h1:           '簡單、誠實的定價。',
      lead:         'ONE EIGHT 免費遊玩。訂閱會員後可解鎖競技功能——排名對局、賽事報名，以及更多即將推出的功能。',

      freeTag:      'Free',
      freePriceNote:'無需信用卡',
      freeFeature1: '本機對局（人類 vs 人類）完整存取',
      freeFeature2: '可挑戰所有難度的 CPU',
      freeFeature3: '透過私人房間碼進行線上好友對局',
      freeFeature4: '對局紀錄與基本統計',
      freeFeature5: '教學關卡與遊戲內規則說明',

      perMo:        '/月',
      proPriceNote: '按月計費・隨時可取消',
      proFeature1:  'Free 方案的所有功能',
      proFeature2:  '含評分系統的排名對局',
      proFeature3:  '國內及賽季排行榜',
      proFeature4:  '賽事報名（需官方金鑰）',
      proFeature5:  '新競技功能搶先體驗',

      btnSubscribe: '訂閱 — $14.99 / 月',
      cancelText:   '透過 Paddle（本服務的金流服務商及交易代理商）管理或取消訂閱。',
      cancelLink:   '前往 Paddle 管理訂閱',

      note:         '價格以 USD 計算。競技功能仍在積極開發中，服務演進過程中可能新增或調整。付費方案價格如有變動，將提前告知。',

      navPricing:    '定價',
      navTerms:      '服務條款',
      navPrivacy:    '隱私權',
      navRefund:     '退款',

      footerHome:    '首頁',
      footerPricing: '定價',
      footerTerms:   '服務條款',
      footerPrivacy: '隱私權政策',
      footerRefund:  '退款政策',
      footerContact: '聯絡我們',

      alreadyPro: '您已是 Pro 會員。',
      alreadyProRenews: function (date) {
        return '您已是 Pro 會員 — 續訂日期：' + date;
      },
      languageSelectorLabel: '選擇語言',
    },

    'zh-Hans': {
      title:        '价格方案 — ONE EIGHT',
      eyebrow:      '方案与定价',
      h1:           '简单、透明的定价。',
      lead:         'ONE EIGHT 免费畅玩。订阅会员后可解锁竞技功能——排名对局、赛事报名，以及更多即将推出的功能。',

      freeTag:      'Free',
      freePriceNote:'无需信用卡',
      freeFeature1: '本地对局（人类 vs 人类）完整访问',
      freeFeature2: '可挑战所有难度的 CPU',
      freeFeature3: '通过私人房间码进行在线好友对局',
      freeFeature4: '对局记录与基本统计',
      freeFeature5: '教程与游戏内规则说明',

      perMo:        '/月',
      proPriceNote: '按月计费・随时可取消',
      proFeature1:  'Free 方案的所有功能',
      proFeature2:  '含评分系统的排名对局',
      proFeature3:  '国内及赛季排行榜',
      proFeature4:  '赛事报名（需官方密钥）',
      proFeature5:  '新竞技功能优先体验',

      btnSubscribe: '订阅 — $14.99 / 月',
      cancelText:   '通过 Paddle（本服务的收款服务商及交易代理商）管理或取消订阅。',
      cancelLink:   '前往 Paddle 管理订阅',

      note:         '价格以 USD 计算。竞技功能仍在积极开发中，服务演进过程中可能新增或调整。付费方案价格如有变动，将提前告知。',

      navPricing:    '定价',
      navTerms:      '服务条款',
      navPrivacy:    '隐私',
      navRefund:     '退款',

      footerHome:    '首页',
      footerPricing: '定价',
      footerTerms:   '服务条款',
      footerPrivacy: '隐私政策',
      footerRefund:  '退款政策',
      footerContact: '联系我们',

      alreadyPro: '您已是 Pro 会员。',
      alreadyProRenews: function (date) {
        return '您已是 Pro 会员 — 续订日期：' + date;
      },
      languageSelectorLabel: '选择语言',
    },

    ko: {
      title:        '요금제 — ONE EIGHT',
      eyebrow:      '플랜 및 요금',
      h1:           '간단하고 투명한 요금제.',
      lead:         'ONE EIGHT는 무료로 플레이할 수 있습니다. 멤버십에 가입하면 랭크 대국, 대회 참가 등 경쟁 기능이 열립니다.',

      freeTag:      'Free',
      freePriceNote:'신용카드 불필요',
      freeFeature1: '로컬 대국(인간 vs 인간) 전체 이용',
      freeFeature2: '모든 난이도의 CPU 대전',
      freeFeature3: '비공개 방 코드로 온라인 친구 대국',
      freeFeature4: '대국 기록 및 기본 통계',
      freeFeature5: '튜토리얼 및 게임 내 규칙 안내',

      perMo:        '/월',
      proPriceNote: '월 단위 청구 · 언제든지 취소 가능',
      proFeature1:  'Free 플랜의 모든 기능',
      proFeature2:  '레이팅 시스템이 적용된 랭크 대국',
      proFeature3:  '국내 및 시즌 리더보드',
      proFeature4:  '대회 참가 (공식 키 필요)',
      proFeature5:  '새로운 경쟁 기능 우선 이용',

      btnSubscribe: '구독하기 — $14.99 / 월',
      cancelText:   'Paddle(본 서비스의 결제 대행사 및 판매 대리인)을 통해 구독을 관리하거나 취소할 수 있습니다.',
      cancelLink:   'Paddle에서 구독 관리',

      note:         '가격은 USD 기준입니다. 경쟁 기능은 현재 개발 중이며, 서비스가 성장함에 따라 추가되거나 변경될 수 있습니다. 유료 플랜 가격 변경 시 사전에 안내드립니다.',

      navPricing:    '요금제',
      navTerms:      '이용약관',
      navPrivacy:    '개인정보',
      navRefund:     '환불',

      footerHome:    '홈',
      footerPricing: '요금제',
      footerTerms:   '이용약관',
      footerPrivacy: '개인정보처리방침',
      footerRefund:  '환불 정책',
      footerContact: '문의하기',

      alreadyPro: '이미 Pro 회원입니다.',
      alreadyProRenews: function (date) {
        return '이미 Pro 회원입니다 — 갱신일: ' + date;
      },
      languageSelectorLabel: '언어 선택',
    },

    es: {
      title:        'Precios — ONE EIGHT',
      eyebrow:      'Planes y precios',
      h1:           'Precios simples y transparentes.',
      lead:         'ONE EIGHT es gratuito. Una membresía desbloquea funciones competitivas: partidas clasificatorias, inscripción en torneos y más a medida que crecemos.',

      freeTag:      'Free',
      freePriceNote:'No se requiere tarjeta de crédito',
      freeFeature1: 'Acceso completo al juego local (humano vs humano)',
      freeFeature2: 'Jugar contra la CPU en todos los niveles de dificultad',
      freeFeature3: 'Partidas en línea con amigos mediante códigos de sala privados',
      freeFeature4: 'Historial de partidas y estadísticas básicas',
      freeFeature5: 'Tutorial y reglas del juego',

      perMo:        '/mes',
      proPriceNote: 'Facturación mensual · Cancela en cualquier momento',
      proFeature1:  'Todo lo incluido en Free',
      proFeature2:  'Partidas clasificatorias con sistema de puntuación',
      proFeature3:  'Clasificaciones nacionales y de temporada',
      proFeature4:  'Inscripción en competiciones (con clave oficial)',
      proFeature5:  'Acceso prioritario a nuevas funciones competitivas',

      btnSubscribe: 'Suscribirse — $14.99 / mes',
      cancelText:   'Gestiona o cancela tu suscripción a través de Paddle, nuestro proveedor de pagos y comerciante registrado.',
      cancelLink:   'Gestionar suscripción en Paddle',

      note:         'Los precios están en USD. Las funciones competitivas están en desarrollo activo y pueden ampliarse o ajustarse a medida que el servicio evoluciona. Cualquier cambio en los precios de los planes de pago se comunicará con antelación.',

      navPricing:    'Precios',
      navTerms:      'Términos',
      navPrivacy:    'Privacidad',
      navRefund:     'Reembolso',

      footerHome:    'Inicio',
      footerPricing: 'Precios',
      footerTerms:   'Términos de servicio',
      footerPrivacy: 'Política de privacidad',
      footerRefund:  'Política de reembolso',
      footerContact: 'Contacto',

      alreadyPro: 'Ya eres Pro.',
      alreadyProRenews: function (date) {
        return 'Ya eres Pro — se renueva el ' + date;
      },
      languageSelectorLabel: 'Seleccionar idioma',
    },

    'pt-BR': {
      title:        'Planos e Preços — ONE EIGHT',
      eyebrow:      'Planos e Preços',
      h1:           'Preços simples e transparentes.',
      lead:         'ONE EIGHT é gratuito. Uma assinatura desbloqueia recursos competitivos — partidas ranqueadas, inscrição em torneios e muito mais.',

      freeTag:      'Free',
      freePriceNote:'Não é necessário cartão de crédito',
      freeFeature1: 'Acesso completo ao jogo local (Humano vs Humano)',
      freeFeature2: 'Jogar contra a CPU em todos os níveis de dificuldade',
      freeFeature3: 'Partidas online com amigos via códigos de sala privados',
      freeFeature4: 'Histórico de partidas e estatísticas básicas',
      freeFeature5: 'Tutorial e regras do jogo',

      perMo:        '/mês',
      proPriceNote: 'Cobrança mensal · Cancele quando quiser',
      proFeature1:  'Tudo do plano Free',
      proFeature2:  'Partidas ranqueadas com sistema de rating',
      proFeature3:  'Classificações nacionais e de temporada',
      proFeature4:  'Inscrição em competições (com chave oficial)',
      proFeature5:  'Acesso prioritário a novos recursos competitivos',

      btnSubscribe: 'Assinar — $14.99 / mês',
      cancelText:   'Gerencie ou cancele sua assinatura pelo Paddle, nosso provedor de pagamentos e comerciante oficial.',
      cancelLink:   'Gerenciar Assinatura no Paddle',

      note:         'Preços em USD. Os recursos competitivos estão em desenvolvimento ativo e podem ser expandidos ou ajustados conforme o serviço evolui. Qualquer alteração nos preços dos planos pagos será comunicada com antecedência.',

      navPricing:    'Preços',
      navTerms:      'Termos',
      navPrivacy:    'Privacidade',
      navRefund:     'Reembolso',

      footerHome:    'Início',
      footerPricing: 'Preços',
      footerTerms:   'Termos de Uso',
      footerPrivacy: 'Política de Privacidade',
      footerRefund:  'Política de Reembolso',
      footerContact: 'Contato',

      alreadyPro: 'Você já é Pro.',
      alreadyProRenews: function (date) {
        return 'Você já é Pro — renova em ' + date;
      },
      languageSelectorLabel: 'Selecionar idioma',
    },

    de: {
      title:        'Preise — ONE EIGHT',
      eyebrow:      'Pläne & Preise',
      h1:           'Einfache, faire Preise.',
      lead:         'ONE EIGHT ist kostenlos. Mit einer Mitgliedschaft schaltest du Wettbewerbsfunktionen frei — Ranglistenpartien, Turnierteilnahme und mehr.',

      freeTag:      'Free',
      freePriceNote:'Keine Kreditkarte erforderlich',
      freeFeature1: 'Vollzugriff auf lokale Partien (Mensch vs. Mensch)',
      freeFeature2: 'Gegen die CPU auf allen Schwierigkeitsgraden spielen',
      freeFeature3: 'Online-Freundschaftspartien über private Raumcodes',
      freeFeature4: 'Partieverlauf und grundlegende Statistiken',
      freeFeature5: 'Tutorial und Spielregeln',

      perMo:        '/Monat',
      proPriceNote: 'Monatliche Abrechnung · Jederzeit kündbar',
      proFeature1:  'Alles aus dem Free-Plan',
      proFeature2:  'Ranglistenpartien mit Bewertungssystem',
      proFeature3:  'Nationale und saisonale Ranglisten',
      proFeature4:  'Turnierteilnahme (mit offiziellem Schlüssel)',
      proFeature5:  'Priorisierter Zugang zu neuen Wettbewerbsfunktionen',

      btnSubscribe: 'Abonnieren — $14.99 / Monat',
      cancelText:   'Verwalte oder kündige dein Abonnement über Paddle, unseren Zahlungsanbieter und Merchant of Record.',
      cancelLink:   'Abonnement bei Paddle verwalten',

      note:         'Preise in USD. Wettbewerbsfunktionen befinden sich in aktiver Entwicklung und können im Laufe der Zeit erweitert oder angepasst werden. Änderungen an den Preisen kostenpflichtiger Pläne werden im Voraus kommuniziert.',

      navPricing:    'Preise',
      navTerms:      'Nutzungsbedingungen',
      navPrivacy:    'Datenschutz',
      navRefund:     'Rückerstattung',

      footerHome:    'Startseite',
      footerPricing: 'Preise',
      footerTerms:   'Nutzungsbedingungen',
      footerPrivacy: 'Datenschutzrichtlinie',
      footerRefund:  'Rückerstattungsrichtlinie',
      footerContact: 'Kontakt',

      alreadyPro: 'Du bist bereits Pro.',
      alreadyProRenews: function (date) {
        return 'Du bist bereits Pro — verlängert sich am ' + date;
      },
      languageSelectorLabel: 'Sprache auswählen',
    },

    fr: {
      title:        'Tarifs — ONE EIGHT',
      eyebrow:      'Formules et tarifs',
      h1:           'Des tarifs simples et transparents.',
      lead:         'ONE EIGHT est gratuit. Un abonnement déverrouille les fonctionnalités compétitives — parties classées, inscription aux tournois et bien plus encore.',

      freeTag:      'Free',
      freePriceNote:'Aucune carte bancaire requise',
      freeFeature1: 'Accès complet au jeu local (Humain vs Humain)',
      freeFeature2: 'Jouer contre la CPU à tous les niveaux de difficulté',
      freeFeature3: 'Parties en ligne avec des amis via des codes de salle privés',
      freeFeature4: 'Historique des parties et statistiques de base',
      freeFeature5: 'Tutoriel et règles du jeu',

      perMo:        '/mois',
      proPriceNote: 'Facturation mensuelle · Annulation à tout moment',
      proFeature1:  'Tout ce qui est inclus dans Free',
      proFeature2:  'Parties classées avec système de classement',
      proFeature3:  'Classements nationaux et saisonniers',
      proFeature4:  'Inscription aux compétitions (avec clé officielle)',
      proFeature5:  'Accès prioritaire aux nouvelles fonctionnalités compétitives',

      btnSubscribe: 'S’abonner — $14.99 / mois',
      cancelText:   'Gérez ou annulez votre abonnement via Paddle, notre prestataire de paiement et marchand officiel.',
      cancelLink:   'Gérer l’abonnement sur Paddle',

      note:         'Les prix sont en USD. Les fonctionnalités compétitives sont en cours de développement et peuvent être étendues ou ajustées au fil de l’évolution du service. Toute modification des tarifs des formules payantes sera communiquée à l’avance.',

      navPricing:    'Tarifs',
      navTerms:      'Conditions',
      navPrivacy:    'Confidentialité',
      navRefund:     'Remboursement',

      footerHome:    'Accueil',
      footerPricing: 'Tarifs',
      footerTerms:   'Conditions d’utilisation',
      footerPrivacy: 'Politique de confidentialité',
      footerRefund:  'Politique de remboursement',
      footerContact: 'Contact',

      alreadyPro: 'Vous êtes déjà Pro.',
      alreadyProRenews: function (date) {
        return 'Vous êtes déjà Pro — renouvellement le ' + date;
      },
      languageSelectorLabel: 'Choisir la langue',
    },

    it: {
      title:        'Prezzi — ONE EIGHT',
      eyebrow:      'Piani e prezzi',
      h1:           'Prezzi semplici e trasparenti.',
      lead:         'ONE EIGHT è gratuito. Un abbonamento sblocca le funzionalità competitive — partite classificate, iscrizione ai tornei e molto altro.',

      freeTag:      'Free',
      freePriceNote:'Nessuna carta di credito richiesta',
      freeFeature1: 'Accesso completo al gioco locale (Umano vs Umano)',
      freeFeature2: 'Gioca contro la CPU a tutti i livelli di difficoltà',
      freeFeature3: 'Partite online con amici tramite codici stanza privati',
      freeFeature4: 'Cronologia delle partite e statistiche di base',
      freeFeature5: 'Tutorial e regole del gioco',

      perMo:        '/mese',
      proPriceNote: 'Fatturazione mensile · Disdici in qualsiasi momento',
      proFeature1:  'Tutto ciò che è incluso in Free',
      proFeature2:  'Partite classificate con sistema di rating',
      proFeature3:  'Classifiche nazionali e stagionali',
      proFeature4:  'Iscrizione alle competizioni (con chiave ufficiale)',
      proFeature5:  'Accesso prioritario alle nuove funzionalità competitive',

      btnSubscribe: 'Abbonati — $14.99 / mese',
      cancelText:   'Gestisci o annulla il tuo abbonamento tramite Paddle, il nostro provider di pagamento e merchant of record.',
      cancelLink:   'Gestisci abbonamento su Paddle',

      note:         'I prezzi sono in USD. Le funzionalità competitive sono in fase di sviluppo attivo e potrebbero essere ampliate o modificate con l’evolversi del servizio. Eventuali variazioni ai prezzi dei piani a pagamento saranno comunicate in anticipo.',

      navPricing:    'Prezzi',
      navTerms:      'Termini',
      navPrivacy:    'Privacy',
      navRefund:     'Rimborso',

      footerHome:    'Home',
      footerPricing: 'Prezzi',
      footerTerms:   'Termini di servizio',
      footerPrivacy: 'Informativa sulla privacy',
      footerRefund:  'Politica di rimborso',
      footerContact: 'Contatti',

      alreadyPro: 'Sei già Pro.',
      alreadyProRenews: function (date) {
        return 'Sei già Pro — rinnovo il ' + date;
      },
      languageSelectorLabel: 'Seleziona la lingua',
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
