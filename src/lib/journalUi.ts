/**
 * journalUi.ts — Journal UI 固定文言の翻訳定数
 *
 * Journal UI 専用の静的翻訳を管理する。
 * DB から取得する記事翻訳 (journal.ts) とは独立している。
 *
 * 選択言語 (selectedLocale / LocaleCode) をキーに文言を取得する。
 * journalLang (en/ja の2値) ではなく、LocaleCode 10言語で管理すること。
 */

import type { LocaleCode } from './locales';

// ─── 編集指針本文 ──────────────────────────────────────────────────────────────

/**
 * 編集指針本文の10言語翻訳。
 * canonical: 探究心と情熱に敬意をもって。（ja）
 */
export const EDITORIAL_GUIDELINE: Record<LocaleCode, string> = {
  ja:        '探究心と情熱に敬意をもって。',
  en:        'With respect for curiosity and passion.',
  'zh-Hant': '向求知慾與熱情致敬。',
  'zh-Hans': '向求知欲与热情致敬。',
  ko:        '탐구심과 열정에 경의를 표합니다.',
  es:        'Con respeto por la curiosidad y la pasión.',
  'pt-BR':   'Com respeito pela curiosidade e pela paixão.',
  de:        'Mit Respekt vor Neugier und Leidenschaft.',
  fr:        'Avec respect pour la curiosité et la passion.',
  it:        'Con rispetto per la curiosità e la passione.',
};

/**
 * 編集指針本文を取得する。
 * 想定外の locale は英語にフォールバックする。
 *
 * @param locale selectedLocale (LocaleCode) または任意の文字列
 */
export function getEditorialGuideline(locale: LocaleCode | string): string {
  return (EDITORIAL_GUIDELINE as Record<string, string>)[locale]
    ?? EDITORIAL_GUIDELINE['en'];
}

// ─── Journal UI 固定文言 ───────────────────────────────────────────────────────

export interface JournalUiTranslations {
  archive: string;
  editorialPolicy: string;
  loading: string;
  noArticles: string;
  articleNotFound: string;
  backToJournal: string;
  noContent: string;
  references: string;
  readArticle: string;
  noTranslation: string;
  playOneEight: string;
  fallbackNotice: (requestedLanguage: string, displayedLanguage: string) => string;
  editorialGuideline: string;
}

const JOURNAL_UI: Record<LocaleCode, JournalUiTranslations> = {
  en: {
    archive: 'Archive',
    editorialPolicy: 'Editorial Policy',
    loading: 'Loading…',
    noArticles: 'No articles yet.',
    articleNotFound: 'Article not found.',
    backToJournal: 'Back to Journal',
    noContent: 'No content available.',
    references: 'References',
    readArticle: 'Read article',
    noTranslation: 'No translation',
    playOneEight: 'Play ONE EIGHT, a competitive abstract board game',
    fallbackNotice: (req, disp) =>
      `This article is not available in ${req}. Showing it in ${disp}.`,
    editorialGuideline: EDITORIAL_GUIDELINE['en'],
  },
  ja: {
    archive: 'アーカイブ',
    editorialPolicy: '編集指針',
    loading: '読み込み中…',
    noArticles: '記事はまだありません。',
    articleNotFound: '記事が見つかりません。',
    backToJournal: 'Journal 一覧に戻る',
    noContent: '本文がありません。',
    references: '参考文献',
    readArticle: '記事を読む',
    noTranslation: '翻訳なし',
    playOneEight: '競技性ボードゲーム ONE EIGHT をプレイする',
    fallbackNotice: (req, disp) =>
      `この記事は${req}ではご利用いただけません。${disp}で表示しています。`,
    editorialGuideline: EDITORIAL_GUIDELINE['ja'],
  },
  'zh-Hant': {
    archive: '封存',
    editorialPolicy: '編輯方針',
    loading: '載入中…',
    noArticles: '尚無文章。',
    articleNotFound: '找不到文章。',
    backToJournal: '返回 Journal',
    noContent: '目前無內容。',
    references: '參考資料',
    readArticle: '閱讀文章',
    noTranslation: '無翻譯',
    playOneEight: '遊玩策略棋盤遊戲 ONE EIGHT',
    fallbackNotice: (req, disp) =>
      `此文章目前無${req}版本。以${disp}顯示。`,
    editorialGuideline: EDITORIAL_GUIDELINE['zh-Hant'],
  },
  'zh-Hans': {
    archive: '归档',
    editorialPolicy: '编辑方针',
    loading: '加载中…',
    noArticles: '暂无文章。',
    articleNotFound: '找不到文章。',
    backToJournal: '返回 Journal',
    noContent: '暂无内容。',
    references: '参考资料',
    readArticle: '阅读文章',
    noTranslation: '无翻译',
    playOneEight: '游玩策略棋盘游戏 ONE EIGHT',
    fallbackNotice: (req, disp) =>
      `此文章暂无${req}版本。以${disp}显示。`,
    editorialGuideline: EDITORIAL_GUIDELINE['zh-Hans'],
  },
  ko: {
    archive: '아카이브',
    editorialPolicy: '편집 방침',
    loading: '불러오는 중…',
    noArticles: '아직 기사가 없습니다.',
    articleNotFound: '기사를 찾을 수 없습니다.',
    backToJournal: 'Journal로 돌아가기',
    noContent: '콘텐츠가 없습니다.',
    references: '참고 자료',
    readArticle: '기사 읽기',
    noTranslation: '번역 없음',
    playOneEight: '전략 보드게임 ONE EIGHT 플레이하기',
    fallbackNotice: (req, disp) =>
      `이 기사는 ${req}로 제공되지 않습니다. ${disp}로 표시합니다.`,
    editorialGuideline: EDITORIAL_GUIDELINE['ko'],
  },
  es: {
    archive: 'Archivo',
    editorialPolicy: 'Política Editorial',
    loading: 'Cargando…',
    noArticles: 'Aún no hay artículos.',
    articleNotFound: 'Artículo no encontrado.',
    backToJournal: 'Volver al Journal',
    noContent: 'No hay contenido disponible.',
    references: 'Referencias',
    readArticle: 'Leer artículo',
    noTranslation: 'Sin traducción',
    playOneEight: 'Juega ONE EIGHT, un juego de tablero abstracto competitivo',
    fallbackNotice: (req, disp) =>
      `Este artículo no está disponible en ${req}. Mostrándolo en ${disp}.`,
    editorialGuideline: EDITORIAL_GUIDELINE['es'],
  },
  'pt-BR': {
    archive: 'Arquivo',
    editorialPolicy: 'Política de Editorial',
    loading: 'Carregando…',
    noArticles: 'Nenhum artigo ainda.',
    articleNotFound: 'Artigo não encontrado.',
    backToJournal: 'Voltar ao Journal',
    noContent: 'Nenhum conteúdo disponível.',
    references: 'Referências',
    readArticle: 'Ler artigo',
    noTranslation: 'Sem tradução',
    playOneEight: 'Jogue ONE EIGHT, um jogo de tabuleiro abstrato competitivo',
    fallbackNotice: (req, disp) =>
      `Este artigo não está disponível em ${req}. Exibindo em ${disp}.`,
    editorialGuideline: EDITORIAL_GUIDELINE['pt-BR'],
  },
  de: {
    archive: 'Archiv',
    editorialPolicy: 'Redaktionelle Richtlinie',
    loading: 'Wird geladen…',
    noArticles: 'Noch keine Artikel.',
    articleNotFound: 'Artikel nicht gefunden.',
    backToJournal: 'Zurück zum Journal',
    noContent: 'Kein Inhalt verfügbar.',
    references: 'Referenzen',
    readArticle: 'Artikel lesen',
    noTranslation: 'Keine Übersetzung',
    playOneEight: 'ONE EIGHT spielen – ein kompetitives abstraktes Brettspiel',
    fallbackNotice: (req, disp) =>
      `Dieser Artikel ist nicht auf ${req} verfügbar. Wird auf ${disp} angezeigt.`,
    editorialGuideline: EDITORIAL_GUIDELINE['de'],
  },
  fr: {
    archive: 'Archives',
    editorialPolicy: 'Politique Éditoriale',
    loading: 'Chargement…',
    noArticles: 'Aucun article pour l\'instant.',
    articleNotFound: 'Article introuvable.',
    backToJournal: 'Retour au Journal',
    noContent: 'Aucun contenu disponible.',
    references: 'Références',
    readArticle: 'Lire l\'article',
    noTranslation: 'Pas de traduction',
    playOneEight: 'Jouez à ONE EIGHT, un jeu de plateau abstrait compétitif',
    fallbackNotice: (req, disp) =>
      `Cet article n'est pas disponible en ${req}. Affichage en ${disp}.`,
    editorialGuideline: EDITORIAL_GUIDELINE['fr'],
  },
  it: {
    archive: 'Archivio',
    editorialPolicy: 'Politica Editoriale',
    loading: 'Caricamento…',
    noArticles: 'Nessun articolo ancora.',
    articleNotFound: 'Articolo non trovato.',
    backToJournal: 'Torna al Journal',
    noContent: 'Nessun contenuto disponibile.',
    references: 'Riferimenti',
    readArticle: 'Leggi articolo',
    noTranslation: 'Nessuna traduzione',
    playOneEight: 'Gioca a ONE EIGHT, un gioco da tavolo astratto competitivo',
    fallbackNotice: (req, disp) =>
      `Questo articolo non è disponibile in ${req}. Visualizzato in ${disp}.`,
    editorialGuideline: EDITORIAL_GUIDELINE['it'],
  },
};

/**
 * Journal UI 固定文言を取得する。
 * 想定外の locale は英語にフォールバックする。
 *
 * @param locale selectedLocale (LocaleCode) または任意の文字列
 */
export function getJournalUi(locale: string): JournalUiTranslations {
  return (JOURNAL_UI as Record<string, JournalUiTranslations>)[locale]
    ?? JOURNAL_UI['en'];
}
