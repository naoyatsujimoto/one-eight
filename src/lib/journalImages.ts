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
  'citizen-science-salamander-colour-polymorphism': {
    hero: '/journal/journal-ecology-community-science-salamander-001_hero.jpg',
    thumbnail: '/journal/journal-ecology-community-science-salamander-001_thumb.jpg',
    alt: 'Salamander colour polymorphism key visual',
  },
  'when-rare-ones-get-recorded': {
    hero: '/journal/oej-2026-salamander-community-science_when-rare-ones-get-recorded_hero.jpg',
    thumbnail: '/journal/oej-2026-salamander-community-science_when-rare-ones-get-recorded_thumb.jpg',
    alt: 'Salamander community science key visual',
  },
  'coin-arrived-did-people-change-how-they-paid': {
    hero: '/journal/oej-2026-coinage-monetary-patterns_coin-arrived-did-people-change-how-they-paid_hero.jpg',
    thumbnail: '/journal/oej-2026-coinage-monetary-patterns_coin-arrived-did-people-change-how-they-paid_thumb.jpg',
    alt: 'Coinage monetary patterns key visual',
  },
  'the-shape-a-city-keeps': {
    hero: '/journal/2026-uk-urban-freight-form-allen-2012_the-shape-a-city-keeps_hero.jpg',
    thumbnail: '/journal/2026-uk-urban-freight-form-allen-2012_the-shape-a-city-keeps_thumb.jpg',
    alt: 'Urban freight and city form key visual',
  },
  'nineteen-places-the-map-missed': {
    hero: '/journal/oej-2026-climate-security-participatory-mapping_nineteen-places-the-map-missed_hero.jpg',
    thumbnail: '/journal/oej-2026-climate-security-participatory-mapping_nineteen-places-the-map-missed_thumb.jpg',
    alt: 'Climate security participatory mapping key visual',
  },
  'what-comes-back-after-the-tail': {
    hero: '/journal/oej-2026-lizard-tail-autotomy-regeneration_what-comes-back-after-the-tail_hero.jpg',
    thumbnail: '/journal/oej-2026-lizard-tail-autotomy-regeneration_what-comes-back-after-the-tail_thumb.jpg',
    alt: 'Lizard tail autotomy and regeneration key visual',
  },
};

/**
 * 記事slugに対応する画像情報を返す。
 * 画像がない記事はundefinedを返す。
 */
export function getJournalArticleImages(slug: string): JournalArticleImages | undefined {
  return JOURNAL_IMAGE_MAP[slug];
}
