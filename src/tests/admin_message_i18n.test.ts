/**
 * admin_message_i18n.test.ts
 * Tests for resolveAdminMessageContent()
 */
import { describe, it, expect } from 'vitest';
import { resolveAdminMessageContent } from '../lib/adminMessageI18n';
import type { AdminMessageRow } from '../lib/adminMessageI18n';
import { resolveUiTranslations } from '../i18n/index';
import type { LocaleCode } from '../lib/locales';

const ALL_LOCALES: LocaleCode[] = ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko', 'es', 'pt-BR', 'de', 'fr', 'it'];

function t(locale: LocaleCode) {
  return resolveUiTranslations(locale);
}

describe('resolveAdminMessageContent — system key: arena_master_reward_eligible', () => {
  const baseMsg: AdminMessageRow = {
    title: 'Legacy Title',
    body: 'Legacy Body',
    message_key: 'arena_master_reward_eligible',
    message_params: { arenaLabel: 'ELEPHANT Arena' },
    translations: null,
  };

  it('returns non-empty title and body for all 10 locales', () => {
    for (const locale of ALL_LOCALES) {
      const result = resolveAdminMessageContent(baseMsg, locale, t(locale));
      expect(result.title, `title for ${locale}`).toBeTruthy();
      expect(result.body, `body for ${locale}`).toBeTruthy();
      expect(typeof result.title, `title type for ${locale}`).toBe('string');
      expect(typeof result.body, `body type for ${locale}`).toBe('string');
    }
  });

  it('preserves arenaLabel in all 10 locales', () => {
    for (const locale of ALL_LOCALES) {
      const result = resolveAdminMessageContent(baseMsg, locale, t(locale));
      expect(result.title, `title for ${locale} should contain arenaLabel`).toContain('ELEPHANT Arena');
      expect(result.body, `body for ${locale} should contain arenaLabel`).toContain('ELEPHANT Arena');
    }
  });

  it('handles empty arenaLabel gracefully for all 10 locales', () => {
    const msgNoLabel: AdminMessageRow = {
      ...baseMsg,
      message_params: { arenaLabel: '' },
    };
    for (const locale of ALL_LOCALES) {
      const result = resolveAdminMessageContent(msgNoLabel, locale, t(locale));
      expect(result.title, `title for ${locale} (no label)`).toBeTruthy();
      expect(result.body, `body for ${locale} (no label)`).toBeTruthy();
    }
  });

  it('handles null message_params gracefully', () => {
    const msgNullParams: AdminMessageRow = {
      ...baseMsg,
      message_params: null,
    };
    for (const locale of ALL_LOCALES) {
      const result = resolveAdminMessageContent(msgNullParams, locale, t(locale));
      expect(result.title).toBeTruthy();
      expect(result.body).toBeTruthy();
    }
  });
});

describe('resolveAdminMessageContent — resolution priority', () => {
  it('uses exact locale translation when available', () => {
    const msg: AdminMessageRow = {
      title: 'Legacy',
      body: 'Legacy body',
      message_key: null,
      message_params: null,
      translations: {
        en: { title: 'EN Title', body: 'EN Body' },
        ja: { title: 'JA タイトル', body: 'JA 本文' },
      },
    };
    const result = resolveAdminMessageContent(msg, 'ja', t('ja'));
    expect(result.title).toBe('JA タイトル');
    expect(result.body).toBe('JA 本文');
  });

  it('falls back to en when exact locale is missing', () => {
    const msg: AdminMessageRow = {
      title: 'Legacy',
      body: 'Legacy body',
      message_key: null,
      message_params: null,
      translations: {
        en: { title: 'EN Title', body: 'EN Body' },
      },
    };
    const result = resolveAdminMessageContent(msg, 'ko', t('ko'));
    expect(result.title).toBe('EN Title');
    expect(result.body).toBe('EN Body');
  });

  it('falls back to legacy title/body when translations is null', () => {
    const msg: AdminMessageRow = {
      title: 'Legacy Title',
      body: 'Legacy Body',
      message_key: null,
      message_params: null,
      translations: null,
    };
    const result = resolveAdminMessageContent(msg, 'en', t('en'));
    expect(result.title).toBe('Legacy Title');
    expect(result.body).toBe('Legacy Body');
  });

  it('does not crash on unknown message_key — falls through to translations', () => {
    const msg: AdminMessageRow = {
      title: 'Legacy',
      body: 'Legacy body',
      message_key: 'future_unknown_key',
      message_params: {},
      translations: {
        en: { title: 'EN Title', body: 'EN Body' },
      },
    };
    expect(() => resolveAdminMessageContent(msg, 'en', t('en'))).not.toThrow();
    const result = resolveAdminMessageContent(msg, 'en', t('en'));
    expect(result.title).toBe('EN Title');
  });

  it('system key takes priority over translations', () => {
    const msg: AdminMessageRow = {
      title: 'Legacy',
      body: 'Legacy body',
      message_key: 'arena_master_reward_eligible',
      message_params: { arenaLabel: 'JAGUAR Arena' },
      translations: {
        en: { title: 'Old EN Title', body: 'Old EN Body' },
      },
    };
    const result = resolveAdminMessageContent(msg, 'en', t('en'));
    // Should use the system key function, not the translations entry
    expect(result.title).toContain('JAGUAR Arena');
    expect(result.title).not.toBe('Old EN Title');
  });
});

describe('resolveAdminMessageContent — legacy manual messages with 10-locale translations (real DB data equivalent)', () => {
  // Represents the 5 legacy messages backfilled by 20260805120000_backfill_legacy_messages_ten_languages.sql

  const INBOX_TEST_MSG: AdminMessageRow = {
    title: 'Test Message',
    body: 'This is a test of the inbox. If you received this message, the system is working correctly.',
    message_key: null,
    message_params: null,
    translations: {
      en: { title: 'Test Message', body: 'This is a test of the inbox. If you received this message, the system is working correctly.' },
      ja: { title: 'テスト送信', body: '受信箱の動作確認です。このメッセージが届いていれば正常に機能しています。' },
      'zh-Hans': { title: '测试消息', body: '这是收件箱的功能测试。如果您收到此消息，说明系统正常运行。' },
      'zh-Hant': { title: '測試訊息', body: '這是收件箱的功能測試。如果您收到此訊息，表示系統正常運作。' },
      ko: { title: '테스트 메시지', body: '받은 편지함 동작 확인입니다. 이 메시지를 받으셨다면 정상적으로 작동하고 있는 것입니다.' },
      es: { title: 'Mensaje de prueba', body: 'Esta es una prueba del buzón de entrada. Si recibiste este mensaje, el sistema funciona correctamente.' },
      'pt-BR': { title: 'Mensagem de teste', body: 'Este é um teste da caixa de entrada. Se você recebeu esta mensagem, o sistema está funcionando corretamente.' },
      de: { title: 'Testnachricht', body: 'Dies ist ein Test des Posteingangs. Wenn Sie diese Nachricht erhalten haben, funktioniert das System korrekt.' },
      fr: { title: 'Message de test', body: 'Ceci est un test de la boîte de réception. Si vous avez reçu ce message, le système fonctionne correctement.' },
      it: { title: 'Messaggio di test', body: 'Questo è un test della casella di posta in arrivo. Se hai ricevuto questo messaggio, il sistema funziona correttamente.' },
    },
  };

  const CPU_UPDATE_MSG: AdminMessageRow = {
    title: 'vs CPU Update',
    body: 'When starting a game in vs CPU mode, you can now choose your side (Black / White) and the CPU difficulty level (Normal / Hard / Very Hard).\n\nGive it a try!',
    message_key: null,
    message_params: null,
    translations: {
      en: { title: 'vs CPU Update', body: 'When starting a game in vs CPU mode, you can now choose your side (Black / White) and the CPU difficulty level (Normal / Hard / Very Hard).\n\nGive it a try!' },
      ja: { title: 'vs CPU アップデート', body: 'vs CPU でゲームを開始する際に、先手（黒）／後手（白）と CPU の強さ（Normal／Hard／Very Hard）を選べるようになりました。\n\nぜひお試しください。' },
      'zh-Hans': { title: 'vs CPU 更新', body: 'CPU 难度（普通/困难/非常困难）。' },
      'zh-Hant': { title: 'vs CPU 更新', body: 'CPU 難度（普通/困難/非常困難）。' },
      ko: { title: 'vs CPU 업데이트', body: 'CPU 난이도（보통/어려움/매우 어려움）。' },
      es: { title: 'Actualización de vs CPU', body: 'Al iniciar una partida en modo vs CPU, ahora puedes elegir tu lado (Negro / Blanco) y el nivel de dificultad de la CPU (Normal / Difícil / Muy Difícil).\n\n¡Pruébalo!' },
      'pt-BR': { title: 'Atualização do vs CPU', body: 'Ao iniciar uma partida no modo vs CPU, agora você pode escolher seu lado (Preto / Branco) e o nível de dificuldade da CPU (Normal / Difícil / Muito Difícil).\n\nExperimente!' },
      de: { title: 'vs CPU-Update', body: 'Beim Starten eines Spiels im vs CPU-Modus kannst du jetzt deine Seite (Schwarz / Weiß) und den CPU-Schwierigkeitsgrad (Normal / Schwer / Sehr Schwer) wählen.\n\nProbiere es aus!' },
      fr: { title: 'Mise à jour vs CPU', body: "Lors du démarrage d'une partie en mode vs CPU, vous pouvez maintenant choisir votre camp (Noir / Blanc) et le niveau de difficulté de la CPU (Normal / Difficile / Très Difficile).\n\nEssayez-le !" },
      it: { title: 'Aggiornamento vs CPU', body: 'Quando si avvia una partita in modalità vs CPU, ora è possibile scegliere il proprio lato (Nero / Bianco) e il livello di difficoltà della CPU (Normale / Difficile / Molto Difficile).\n\nProva subito!' },
    },
  };

  const CPU_NAMES_MSG: AdminMessageRow = {
    title: 'CPU Battle Updated',
    body: "CPU opponents now have names — Agnesi, al-Kashi, and Maupertuis. Tap the opponent's name during a game to view their stats.",
    message_key: null,
    message_params: null,
    translations: {
      en: { title: 'CPU Battle Updated', body: "CPU opponents now have names — Agnesi, al-Kashi, and Maupertuis. Tap the opponent's name during a game to view their stats." },
      ja: { title: 'CPU対戦をアップデートしました', body: 'CPUに名前がつきました。アニェージ、アル・カーシー、モーペルテュイの3名です。対局中に相手の名前をタップすると、彼らの戦績を確認できます。' },
      'zh-Hans': { title: 'CPU对战已更新', body: 'CPU 对手现在有了名字——Agnesi、al-Kashi 和 Maupertuis。在对局中点击对手的名字即可查看他们的战绩。' },
      'zh-Hant': { title: 'CPU 對戰已更新', body: 'CPU 對手現在有了名字——Agnesi、al-Kashi 和 Maupertuis。在對局中點擊對手的名字即可查看他們的戰績。' },
      ko: { title: 'CPU 대전 업데이트', body: 'CPU 상대에게 이제 이름이 생겼습니다 — Agnesi, al-Kashi, Maupertuis. 대국 중 상대의 이름을 탭하면 그들의 전적을 확인할 수 있습니다.' },
      es: { title: 'Actualización de la batalla CPU', body: 'Los oponentes de CPU ahora tienen nombres: Agnesi, al-Kashi y Maupertuis. Toca el nombre del oponente durante una partida para ver sus estadísticas.' },
      'pt-BR': { title: 'Atualização da batalha CPU', body: 'Os oponentes da CPU agora têm nomes — Agnesi, al-Kashi e Maupertuis. Toque no nome do oponente durante uma partida para ver suas estatísticas.' },
      de: { title: 'CPU-Kampf aktualisiert', body: 'CPU-Gegner haben jetzt Namen — Agnesi, al-Kashi und Maupertuis. Tippe während eines Spiels auf den Namen des Gegners, um seine Statistiken anzuzeigen.' },
      fr: { title: 'Bataille CPU mise à jour', body: "Les adversaires de la CPU ont maintenant des noms — Agnesi, al-Kashi et Maupertuis. Appuyez sur le nom de l'adversaire pendant une partie pour voir ses statistiques." },
      it: { title: 'Aggiornamento della battaglia CPU', body: "Gli avversari CPU hanno ora dei nomi — Agnesi, al-Kashi e Maupertuis. Tocca il nome dell'avversario durante una partita per visualizzare le sue statistiche." },
    },
  };

  it('inbox test message: resolves all 10 locales with non-empty title and body', () => {
    for (const locale of ALL_LOCALES) {
      const result = resolveAdminMessageContent(INBOX_TEST_MSG, locale, t(locale));
      expect(result.title, `title[${locale}]`).toBeTruthy();
      expect(result.body, `body[${locale}]`).toBeTruthy();
    }
  });

  it('inbox test message: uses exact-locale translations (ja)', () => {
    const result = resolveAdminMessageContent(INBOX_TEST_MSG, 'ja', t('ja'));
    expect(result.title).toBe('テスト送信');
    expect(result.body).toContain('受信箱の動作確認');
  });

  it('vs CPU update message: resolves all 10 locales with non-empty title and body', () => {
    for (const locale of ALL_LOCALES) {
      const result = resolveAdminMessageContent(CPU_UPDATE_MSG, locale, t(locale));
      expect(result.title, `title[${locale}]`).toBeTruthy();
      expect(result.body, `body[${locale}]`).toBeTruthy();
    }
  });

  it('vs CPU update message: English title is correct', () => {
    const result = resolveAdminMessageContent(CPU_UPDATE_MSG, 'en', t('en'));
    expect(result.title).toBe('vs CPU Update');
  });

  it('CPU names message: resolves all 10 locales with non-empty title and body', () => {
    for (const locale of ALL_LOCALES) {
      const result = resolveAdminMessageContent(CPU_NAMES_MSG, locale, t(locale));
      expect(result.title, `title[${locale}]`).toBeTruthy();
      expect(result.body, `body[${locale}]`).toBeTruthy();
    }
  });

  it('CPU names message: CPU names (Agnesi, al-Kashi, Maupertuis) preserved in en translation', () => {
    const result = resolveAdminMessageContent(CPU_NAMES_MSG, 'en', t('en'));
    expect(result.body).toContain('Agnesi');
    expect(result.body).toContain('al-Kashi');
    expect(result.body).toContain('Maupertuis');
  });

  it('CPU names message: CPU names preserved in ja translation', () => {
    const result = resolveAdminMessageContent(CPU_NAMES_MSG, 'ja', t('ja'));
    expect(result.body).toContain('アニェージ');
    expect(result.body).toContain('アル・カーシー');
    expect(result.body).toContain('モーペルテュイ');
  });

  it('legacy messages: all 10 locales produce string title and body (type safety)', () => {
    const msgs = [INBOX_TEST_MSG, CPU_UPDATE_MSG, CPU_NAMES_MSG];
    for (const msg of msgs) {
      for (const locale of ALL_LOCALES) {
        const result = resolveAdminMessageContent(msg, locale, t(locale));
        expect(typeof result.title).toBe('string');
        expect(typeof result.body).toBe('string');
      }
    }
  });
});

describe('resolveAdminMessageContent — return type safety', () => {
  it('title and body are always strings', () => {
    const msg: AdminMessageRow = {
      title: 'T',
      body: 'B',
      message_key: 'arena_master_reward_eligible',
      message_params: { arenaLabel: 'ELEPHANT Arena' },
      translations: null,
    };
    for (const locale of ALL_LOCALES) {
      const result = resolveAdminMessageContent(msg, locale, t(locale));
      expect(typeof result.title).toBe('string');
      expect(typeof result.body).toBe('string');
    }
  });
});
