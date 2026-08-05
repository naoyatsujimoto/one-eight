-- Migration: Backfill legacy manual admin_messages with 10-language translations
-- Target: 5 manual messages (message_key IS NULL) that lack full 10-locale translations
-- Protected columns: id, target, read_by, created_at, source_id (unchanged)
-- Idempotent: skips rows that already have all 10 locales

-- ─── Message 1: fa73cc0e — テスト送信 (Inbox test) ─────────────────────────────

UPDATE admin_messages
SET
  title = 'Test Message',
  body  = 'This is a test of the inbox. If you received this message, the system is working correctly.',
  translations = jsonb_build_object(
    'en', jsonb_build_object(
      'title', 'Test Message',
      'body',  'This is a test of the inbox. If you received this message, the system is working correctly.'
    ),
    'ja', jsonb_build_object(
      'title', 'テスト送信',
      'body',  '受信箱の動作確認です。このメッセージが届いていれば正常に機能しています。'
    ),
    'zh-Hans', jsonb_build_object(
      'title', '测试消息',
      'body',  '这是收件箱的功能测试。如果您收到此消息，说明系统正常运行。'
    ),
    'zh-Hant', jsonb_build_object(
      'title', '測試訊息',
      'body',  '這是收件箱的功能測試。如果您收到此訊息，表示系統正常運作。'
    ),
    'ko', jsonb_build_object(
      'title', '테스트 메시지',
      'body',  '받은 편지함 동작 확인입니다. 이 메시지를 받으셨다면 정상적으로 작동하고 있는 것입니다.'
    ),
    'es', jsonb_build_object(
      'title', 'Mensaje de prueba',
      'body',  'Esta es una prueba del buzón de entrada. Si recibiste este mensaje, el sistema funciona correctamente.'
    ),
    'pt-BR', jsonb_build_object(
      'title', 'Mensagem de teste',
      'body',  'Este é um teste da caixa de entrada. Se você recebeu esta mensagem, o sistema está funcionando corretamente.'
    ),
    'de', jsonb_build_object(
      'title', 'Testnachricht',
      'body',  'Dies ist ein Test des Posteingangs. Wenn Sie diese Nachricht erhalten haben, funktioniert das System korrekt.'
    ),
    'fr', jsonb_build_object(
      'title', 'Message de test',
      'body',  'Ceci est un test de la boîte de réception. Si vous avez reçu ce message, le système fonctionne correctement.'
    ),
    'it', jsonb_build_object(
      'title', 'Messaggio di test',
      'body',  'Questo è un test della casella di posta in arrivo. Se hai ricevuto questo messaggio, il sistema funziona correttamente.'
    )
  )
WHERE id = 'fa73cc0e-5a85-4f82-9c28-cae74097fa7c'
  AND message_key IS NULL
  AND (
    translations IS NULL
    OR NOT (
      translations ? 'en' AND translations ? 'ja' AND translations ? 'zh-Hans' AND
      translations ? 'zh-Hant' AND translations ? 'ko' AND translations ? 'es' AND
      translations ? 'pt-BR' AND translations ? 'de' AND translations ? 'fr' AND translations ? 'it'
    )
  );

-- ─── Message 2: f113ae40 — テスト2 ────────────────────────────────────────────

UPDATE admin_messages
SET
  title = 'Test 2',
  body  = 'This is the message for Test 2.',
  translations = jsonb_build_object(
    'en', jsonb_build_object(
      'title', 'Test 2',
      'body',  'This is the message for Test 2.'
    ),
    'ja', jsonb_build_object(
      'title', 'テスト2',
      'body',  'テスト2のメッセージです。'
    ),
    'zh-Hans', jsonb_build_object(
      'title', '测试2',
      'body',  '这是测试2的消息。'
    ),
    'zh-Hant', jsonb_build_object(
      'title', '測試2',
      'body',  '這是測試2的訊息。'
    ),
    'ko', jsonb_build_object(
      'title', '테스트 2',
      'body',  '테스트 2 메시지입니다.'
    ),
    'es', jsonb_build_object(
      'title', 'Prueba 2',
      'body',  'Este es el mensaje de Prueba 2.'
    ),
    'pt-BR', jsonb_build_object(
      'title', 'Teste 2',
      'body',  'Esta é a mensagem do Teste 2.'
    ),
    'de', jsonb_build_object(
      'title', 'Test 2',
      'body',  'Dies ist die Nachricht für Test 2.'
    ),
    'fr', jsonb_build_object(
      'title', 'Test 2',
      'body',  'Ceci est le message du Test 2.'
    ),
    'it', jsonb_build_object(
      'title', 'Test 2',
      'body',  'Questo è il messaggio del Test 2.'
    )
  )
WHERE id = 'f113ae40-54a4-4d42-8048-ddbb684caabe'
  AND message_key IS NULL
  AND (
    translations IS NULL
    OR NOT (
      translations ? 'en' AND translations ? 'ja' AND translations ? 'zh-Hans' AND
      translations ? 'zh-Hant' AND translations ? 'ko' AND translations ? 'es' AND
      translations ? 'pt-BR' AND translations ? 'de' AND translations ? 'fr' AND translations ? 'it'
    )
  );

-- ─── Message 3: 3e565d90 — テスト3 ────────────────────────────────────────────

UPDATE admin_messages
SET
  title = 'Test 3',
  body  = 'This is the message for Test 3.',
  translations = jsonb_build_object(
    'en', jsonb_build_object(
      'title', 'Test 3',
      'body',  'This is the message for Test 3.'
    ),
    'ja', jsonb_build_object(
      'title', 'テスト3',
      'body',  'テスト3のメッセージです。'
    ),
    'zh-Hans', jsonb_build_object(
      'title', '测试3',
      'body',  '这是测试3的消息。'
    ),
    'zh-Hant', jsonb_build_object(
      'title', '測試3',
      'body',  '這是測試3的訊息。'
    ),
    'ko', jsonb_build_object(
      'title', '테스트 3',
      'body',  '테스트 3 메시지입니다.'
    ),
    'es', jsonb_build_object(
      'title', 'Prueba 3',
      'body',  'Este es el mensaje de Prueba 3.'
    ),
    'pt-BR', jsonb_build_object(
      'title', 'Teste 3',
      'body',  'Esta é a mensagem do Teste 3.'
    ),
    'de', jsonb_build_object(
      'title', 'Test 3',
      'body',  'Dies ist die Nachricht für Test 3.'
    ),
    'fr', jsonb_build_object(
      'title', 'Test 3',
      'body',  'Ceci est le message du Test 3.'
    ),
    'it', jsonb_build_object(
      'title', 'Test 3',
      'body',  'Questo è il messaggio del Test 3.'
    )
  )
WHERE id = '3e565d90-40f0-45f8-9536-6aaf084a820e'
  AND message_key IS NULL
  AND (
    translations IS NULL
    OR NOT (
      translations ? 'en' AND translations ? 'ja' AND translations ? 'zh-Hans' AND
      translations ? 'zh-Hant' AND translations ? 'ko' AND translations ? 'es' AND
      translations ? 'pt-BR' AND translations ? 'de' AND translations ? 'fr' AND translations ? 'it'
    )
  );

-- ─── Message 4: bc93ab12 — vs CPU アップデート ─────────────────────────────────

UPDATE admin_messages
SET
  title = 'vs CPU Update',
  body  = 'When starting a game in vs CPU mode, you can now choose your side (Black / White) and the CPU difficulty level (Normal / Hard / Very Hard).' || E'\n\n' || 'Give it a try!',
  translations = jsonb_build_object(
    'en', jsonb_build_object(
      'title', 'vs CPU Update',
      'body',  'When starting a game in vs CPU mode, you can now choose your side (Black / White) and the CPU difficulty level (Normal / Hard / Very Hard).' || E'\n\n' || 'Give it a try!'
    ),
    'ja', jsonb_build_object(
      'title', 'vs CPU アップデート',
      'body',  'vs CPU でゲームを開始する際に、先手（黒）／後手（白）と CPU の強さ（Normal／Hard／Very Hard）を選べるようになりました。' || E'\n\n' || 'ぜひお試しください。'
    ),
    'zh-Hans', jsonb_build_object(
      'title', 'vs CPU 更新',
      'body',  '在 vs CPU 模式下开始游戏时，您现在可以选择先手（黑）/后手（白）以及 CPU 难度（普通/困难/非常困难）。' || E'\n\n' || '快来试试吧！'
    ),
    'zh-Hant', jsonb_build_object(
      'title', 'vs CPU 更新',
      'body',  '在 vs CPU 模式下開始遊戲時，您現在可以選擇先手（黑）/後手（白）以及 CPU 難度（普通/困難/非常困難）。' || E'\n\n' || '歡迎嘗試！'
    ),
    'ko', jsonb_build_object(
      'title', 'vs CPU 업데이트',
      'body',  'vs CPU 모드에서 게임을 시작할 때 선수（흑）/후수（백）와 CPU 난이도（보통/어려움/매우 어려움）를 선택할 수 있게 되었습니다。' || E'\n\n' || '꼭 한번 해보세요！'
    ),
    'es', jsonb_build_object(
      'title', 'Actualización de vs CPU',
      'body',  'Al iniciar una partida en modo vs CPU, ahora puedes elegir tu lado (Negro / Blanco) y el nivel de dificultad de la CPU (Normal / Difícil / Muy Difícil).' || E'\n\n' || '¡Pruébalo!'
    ),
    'pt-BR', jsonb_build_object(
      'title', 'Atualização do vs CPU',
      'body',  'Ao iniciar uma partida no modo vs CPU, agora você pode escolher seu lado (Preto / Branco) e o nível de dificuldade da CPU (Normal / Difícil / Muito Difícil).' || E'\n\n' || 'Experimente!'
    ),
    'de', jsonb_build_object(
      'title', 'vs CPU-Update',
      'body',  'Beim Starten eines Spiels im vs CPU-Modus kannst du jetzt deine Seite (Schwarz / Weiß) und den CPU-Schwierigkeitsgrad (Normal / Schwer / Sehr Schwer) wählen.' || E'\n\n' || 'Probiere es aus!'
    ),
    'fr', jsonb_build_object(
      'title', 'Mise à jour vs CPU',
      'body',  'Lors du démarrage d''une partie en mode vs CPU, vous pouvez maintenant choisir votre camp (Noir / Blanc) et le niveau de difficulté de la CPU (Normal / Difficile / Très Difficile).' || E'\n\n' || 'Essayez-le !'
    ),
    'it', jsonb_build_object(
      'title', 'Aggiornamento vs CPU',
      'body',  'Quando si avvia una partita in modalità vs CPU, ora è possibile scegliere il proprio lato (Nero / Bianco) e il livello di difficoltà della CPU (Normale / Difficile / Molto Difficile).' || E'\n\n' || 'Prova subito!'
    )
  )
WHERE id = 'bc93ab12-95b8-46ce-9474-635d51b3ef4e'
  AND message_key IS NULL
  AND (
    translations IS NULL
    OR NOT (
      translations ? 'en' AND translations ? 'ja' AND translations ? 'zh-Hans' AND
      translations ? 'zh-Hant' AND translations ? 'ko' AND translations ? 'es' AND
      translations ? 'pt-BR' AND translations ? 'de' AND translations ? 'fr' AND translations ? 'it'
    )
  );

-- ─── Message 5: d3395a1c — CPU Battle Updated (en+ja → 10 locales) ───────────

UPDATE admin_messages
SET
  title = 'CPU Battle Updated',
  body  = 'CPU opponents now have names — Agnesi, al-Kashi, and Maupertuis. Tap the opponent''s name during a game to view their stats.',
  translations = jsonb_build_object(
    'en', jsonb_build_object(
      'title', 'CPU Battle Updated',
      'body',  'CPU opponents now have names — Agnesi, al-Kashi, and Maupertuis. Tap the opponent''s name during a game to view their stats.'
    ),
    'ja', jsonb_build_object(
      'title', 'CPU対戦をアップデートしました',
      'body',  'CPUに名前がつきました。アニェージ、アル・カーシー、モーペルテュイの3名です。対局中に相手の名前をタップすると、彼らの戦績を確認できます。'
    ),
    'zh-Hans', jsonb_build_object(
      'title', 'CPU对战已更新',
      'body',  'CPU 对手现在有了名字——Agnesi、al-Kashi 和 Maupertuis。在对局中点击对手的名字即可查看他们的战绩。'
    ),
    'zh-Hant', jsonb_build_object(
      'title', 'CPU 對戰已更新',
      'body',  'CPU 對手現在有了名字——Agnesi、al-Kashi 和 Maupertuis。在對局中點擊對手的名字即可查看他們的戰績。'
    ),
    'ko', jsonb_build_object(
      'title', 'CPU 대전 업데이트',
      'body',  'CPU 상대에게 이제 이름이 생겼습니다 — Agnesi, al-Kashi, Maupertuis. 대국 중 상대의 이름을 탭하면 그들의 전적을 확인할 수 있습니다.'
    ),
    'es', jsonb_build_object(
      'title', 'Actualización de la batalla CPU',
      'body',  'Los oponentes de CPU ahora tienen nombres: Agnesi, al-Kashi y Maupertuis. Toca el nombre del oponente durante una partida para ver sus estadísticas.'
    ),
    'pt-BR', jsonb_build_object(
      'title', 'Atualização da batalha CPU',
      'body',  'Os oponentes da CPU agora têm nomes — Agnesi, al-Kashi e Maupertuis. Toque no nome do oponente durante uma partida para ver suas estatísticas.'
    ),
    'de', jsonb_build_object(
      'title', 'CPU-Kampf aktualisiert',
      'body',  'CPU-Gegner haben jetzt Namen — Agnesi, al-Kashi und Maupertuis. Tippe während eines Spiels auf den Namen des Gegners, um seine Statistiken anzuzeigen.'
    ),
    'fr', jsonb_build_object(
      'title', 'Bataille CPU mise à jour',
      'body',  'Les adversaires de la CPU ont maintenant des noms — Agnesi, al-Kashi et Maupertuis. Appuyez sur le nom de l''adversaire pendant une partie pour voir ses statistiques.'
    ),
    'it', jsonb_build_object(
      'title', 'Aggiornamento della battaglia CPU',
      'body',  'Gli avversari CPU hanno ora dei nomi — Agnesi, al-Kashi e Maupertuis. Tocca il nome dell''avversario durante una partita per visualizzare le sue statistiche.'
    )
  )
WHERE id = 'd3395a1c-cac4-408d-b7ec-873c56f6ac12'
  AND message_key IS NULL
  AND (
    translations IS NULL
    OR NOT (
      translations ? 'en' AND translations ? 'ja' AND translations ? 'zh-Hans' AND
      translations ? 'zh-Hant' AND translations ? 'ko' AND translations ? 'es' AND
      translations ? 'pt-BR' AND translations ? 'de' AND translations ? 'fr' AND translations ? 'it'
    )
  );
