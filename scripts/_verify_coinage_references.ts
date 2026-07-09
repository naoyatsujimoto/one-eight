import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // coinage記事ID確認
  const { data: article, error: ae } = await supabase
    .from('journal_articles')
    .select('id, slug, status')
    .eq('slug', 'coin-arrived-did-people-change-how-they-paid')
    .single();

  if (ae || !article) {
    console.error('Article not found:', ae);
    process.exit(1);
  }
  console.log('Article ID:', article.id, '| slug:', article.slug, '| status:', article.status);

  // References確認
  const { data: refs, error: re } = await supabase
    .from('journal_article_references')
    .select('id, sort_order, ref_text, doi, url')
    .eq('article_id', article.id)
    .order('sort_order');

  if (re) {
    console.error('References error:', re);
    process.exit(1);
  }

  console.log('References count:', refs?.length ?? 0);
  refs?.forEach(r => {
    console.log(`  [${r.sort_order}] ${r.ref_text.slice(0, 80)}...`);
    console.log(`       DOI: ${r.doi}`);
    console.log(`       URL: ${r.url}`);
  });

  if (!refs || refs.length === 0) {
    console.error('ERROR: References not found in DB!');
    process.exit(1);
  }
  console.log('\nVERIFICATION PASSED ✅');
}

main().catch(e => { console.error(e); process.exit(1); });
