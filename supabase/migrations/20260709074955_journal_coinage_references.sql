-- =============================================================================
-- 20260709074955_journal_coinage_references.sql
-- 記事: oej-2026-coinage-monetary-patterns / coin-arrived-did-people-change-how-they-paid
-- 目的: journal_article_references への登録漏れを修正
-- 参照元: ONE_EIGHT_JOURNAL/approved/oej-2026-coinage-monetary-patterns_..._reviewed_multilingual.md
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- journal_article_references
-- 初回投入のため DELETE + INSERT のべき等パターン
-- ─────────────────────────────────────────────────────────────────────────────
WITH article AS (
  SELECT id FROM public.journal_articles WHERE slug = 'coin-arrived-did-people-change-how-they-paid'
),
del AS (
  DELETE FROM public.journal_article_references
  WHERE article_id = (SELECT id FROM article)
  RETURNING 1
)
INSERT INTO public.journal_article_references (
  article_id,
  sort_order,
  ref_text,
  doi,
  url
)
SELECT
  a.id,
  v.sort_order,
  v.ref_text,
  v.doi,
  v.url
FROM article a
CROSS JOIN (
  VALUES
    (
      1,
      'Ialongo, N. (2024). The introduction of coinage in Europe did not change pre-existing monetary patterns. Frontiers in Human Dynamics, 6, 1501894.',
      '10.3389/fhumd.2024.1501894',
      'https://doi.org/10.3389/fhumd.2024.1501894'
    )
) AS v(sort_order, ref_text, doi, url);

COMMIT;

-- =============================================================================
-- END
-- =============================================================================
