/**
 * journalImages.ts — Journal記事画像の静的マッピング
 *
 * Supabase DBにimage/heroImageカラムがないため、slug → 画像パスを静的に管理する。
 * 画像を持たない記事はundefinedを返す。
 * 記事本文・slug・published_at・タイトルはこのファイルで変更しない。
 */

export interface JournalArticleImages {
  /** /journal/ 配下のhero画像パス (1200×630px) */
  hero: string;
  /** /journal/ 配下のthumbnail画像パス (640×400px) */
  thumbnail: string;
  /** alt テキスト */
  alt: string;
}

/**
 * slug → 画像情報マッピング
 * 画像が追加されたらここへ追記する。
 */
const JOURNAL_IMAGE_MAP: Record<string, JournalArticleImages> = {
  'journal-ecology-community-science-salamander-001': {
    hero: '/journal/journal-ecology-community-science-salamander-001_hero.jpg',
    thumbnail: '/journal/journal-ecology-community-science-salamander-001_thumb.jpg',
    alt: 'Salamander colour polymorphism key visual',
  },
};

/**
 * 記事slugに対応する画像情報を返す。
 * 画像がない記事はundefinedを返す。
 */
export function getJournalArticleImages(slug: string): JournalArticleImages | undefined {
  return JOURNAL_IMAGE_MAP[slug];
}
