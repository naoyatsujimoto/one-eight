-- =============================================================================
-- DRAFT ONLY
-- Do not apply manually without Naoya approval.
-- Target: journal_articles / journal_article_translations / journal_article_references only.
-- =============================================================================
-- Step D-1: kenya記事 seed SQL ドラフト
-- 作成日: 2026-06-29
-- 対象記事: slug='kenya'
-- 参照元:   public/journal/kenya.html (承認済み静的記事)
-- 適用先:   本番 remote DB への投入は禁止。Naoya 承認後のみ適用可。
--
-- 触るテーブル:
--   journal_articles
--   journal_article_translations
--   journal_article_references
--
-- 触らないテーブル:
--   journal_mail_issues / journal_delivery_history / journal_email_preferences
--   profiles / game系 / billing系 / official_matches / arena系
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. journal_articles
--    slug 'kenya' を upsert する。
--    再実行時は status / author_label / tags / published_at を上書き。
--    created_by_user_id / approved_by_user_id はドラフト時点では NULL。
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.journal_articles (
  slug,
  status,
  author_label,
  tags,
  published_at,
  created_by_user_id,
  approved_by_user_id,
  approved_at
)
VALUES (
  'kenya',
  'published',
  'ONE EIGHT Journal',
  ARRAY['climate security', 'mapping', 'Kenya', 'local knowledge'],
  '2026-06-28 00:00:00+09:00',
  NULL,  -- 投入時に Naoya の user_id を確認してから設定すること
  NULL,  -- 投入時に Naoya の user_id を確認してから設定すること
  NULL   -- published_at と同値にするか NULL にするかは投入時に判断すること
)
ON CONFLICT (slug) DO UPDATE
  SET
    status       = EXCLUDED.status,
    author_label = EXCLUDED.author_label,
    tags         = EXCLUDED.tags,
    published_at = EXCLUDED.published_at,
    updated_at   = now();
-- 注: created_by_user_id / approved_by_user_id / approved_at は ON CONFLICT 時に上書きしない。
--     投入前に確認して VALUES を直接修正すること。

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. journal_article_translations (JA のみ)
--    is_primary=TRUE で登録する。
--    EN 翻訳は今回作成しない。
--    Step C-1 の fallback 仕様により EN request 時も JA primary へ fallback 可能。
--    unique(article_id, lang) に対して upsert。
-- ─────────────────────────────────────────────────────────────────────────────
WITH article AS (
  SELECT id FROM public.journal_articles WHERE slug = 'kenya'
)
INSERT INTO public.journal_article_translations (
  article_id,
  lang,
  title,
  excerpt,
  body_html,
  meta_title,
  meta_description,
  is_primary
)
SELECT
  article.id,
  'ja',
  '地図が見落とした19の場所',
  'ケニアの気候安全保障ホットスポット研究をもとに、地図、ローカル知、見えにくい危機について考える短いエッセイ。',
  $body_html$<h2>地図が見落とした19の場所</h2>

<p>地図に載っていない危険は、存在しないのだろうか。Benson Kenduiywo らの論文は、その問いをケニアで真正面から扱っている。対象になったのは「気候安全保障ホットスポット」だ。これは、気候変動そのものだけではなく、社会経済的脆弱性、統治上の問題、対立、そして気候に左右されやすい生業が重なっている場所を指す。つまり、干ばつや洪水の分布図ではない。環境と生計と政治と暴力が、ある地点でどう重なっているかを見るための地図である。</p>

<p>こうした地図は、ふつう大量のデータから作られる。だからこそ、いかにも客観的に見える。しかし、この論文が問うのは、その「正しそうな地図」が現場でも同じように正しいのか、ということだった。著者たちは、グローバルな気候データと紛争データから事前に作成されたホットスポット地図を持ち込み、ケニアの11の乾燥・半乾燥郡から集まったローカル専門家たちと照合した。ここでいう expert は、地域住民一般ではなく、郡レベルの政策・実務・現場知を持つ人びとである。33人を招き、30人が参加した3日間のワークショップで、印刷地図とインタラクティブ地図を使いながら、5つの合意形成型フォーカスグループ討議が行われた。</p>

<p>結果は、地図を単純に否定するものではなかった。80のサンプル・ホットスポットのうち、45％は気候と紛争の分類の両方について専門家が同意し、38.75％はどちらか一方については同意した。つまり合計83.75％で、地図はかなりの程度、現場の認識と重なっていたことになる。ここは大事な点で、この論文は「データ地図は役に立たない」と言っているのではない。むしろ、トップダウンのモデルには相応の頑健さがあり、そのうえでなお、現場の知が補正しなければ見えにくい部分が残ることを示している。</p>

<p>その「残る部分」が、タイトルにもしたくなる19の場所だった。討議の後半で、専門家たちは既存データでは捉えきれていない新たなホットスポットを19か所特定した。そこでは、持続的な干ばつ、高温、季節洪水だけでなく、資源不足、民族間の緊張、急進化、移動による摩擦などが複合していた。論文が特に面白いのは、これらの場所が単に「データ漏れ」だったと片づけられていないことだ。多くは、急性の暴力イベントだけでは表れにくい、ゆっくり進む環境劣化や塩害、森林劣化のような変化を抱えていた。たとえば Lamu の沿岸集落や Laikipia の Mukogodo Forest のような場所は、短期的な紛争イベントの密度だけでは危機が見えにくい。けれども、そこでは徐々にレジリエンスが削られ、移動と競合の条件が積み上がっていく。</p>

<p>論文がさらに丁寧なのは、なぜ地図と現場のあいだにズレが生まれるのかも説明しているところだ。もっとも争点になりやすかったのは、気候条件よりむしろ紛争分類だった。著者たちはその理由の一つとして、データの時間幅の違いを挙げる。気候データは1981年まで遡れるのに対し、紛争データとして用いた ACLED のケニア記録は1997年以降に限られる。つまり、より長い時間を背負った土地の対立史が、現在の event data だけでは十分に現れない可能性がある。ここでローカル専門家の知は、感覚的な補助ではなく、歴史の抜けを埋める補正項として機能している。</p>

<p>この研究が静かに転換しているのは、「地図は現実を写す」という考え方だろう。実際には、地図はいつも何らかのデータの形式、時間範囲、分類の仕方を通して作られている。だから、地図の外にあるものは、危険ではないのではなく、まだその形式で拾われていないだけかもしれない。Kenduiywo らの論文は、ローカル専門家の知を科学の代替に置くのではなく、地図をもう少し現実に近づけるための照合作業として位置づけている。その態度がとても良い。科学かローカル知か、ではない。どの知を、どこで重ねると、見えなかった構造が見えてくるのか。問いはそこにある。</p>

<p>この論文を読むと、危機を描く地図とは、世界そのものではなく、世界をどのような情報で切り出したかの結果なのだと分かる。数字は必要だ。広域の俯瞰も必要だ。けれども、そこだけでは見えにくい遅い変化、境界に滲む摩擦、地域の履歴をどう扱うかで、優先すべき場所は変わりうる。19という数が示しているのは、誤差の大きさというより、地図がまだ閉じていないことの証拠なのだと思う。</p>

<p>ONE EIGHTとの接続をあえて最小限にするなら、こういうことになる。見えている盤面をそのまま信じるだけでは、局面は読み切れないことがある。どの地図を使っているのか、何がその地図から落ちているのかを考えた瞬間に、ようやく選べる手が変わる。研究にも、ゲームにも、日常の判断にも、その読み替えの力はある。</p>$body_html$,
  '地図が見落とした19の場所',
  'ケニアの気候安全保障ホットスポット研究をもとに、地図、ローカル知、見えにくい危機について考える短いエッセイ。',
  TRUE
FROM article
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. journal_article_references
--    DELETE は対象 article_id に限定する（広範囲 DELETE 禁止）。
--    delete → insert の順で再実行時も冪等になる。
--    既存の他 article の references には一切触れない。
-- ─────────────────────────────────────────────────────────────────────────────
WITH article AS (
  SELECT id FROM public.journal_articles WHERE slug = 'kenya'
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
      'Kenduiywo, Benson, Victor Korir, Brenda Chepngetich, Victor Villa, Anna Belli, Livia Sagliocco, Grazia Pacillo, Leonardo Medina, and Peter Läderach. "Understanding local expert perceptions of climate security hotspots using participatory mapping." PLOS Climate 5(4), e0000746. Published April 30, 2026. DOI: 10.1371/journal.pclm.0000746. 著者らの主所属は CIAT を中心とする研究機関ネットワークで、論文本文はオープンアクセスで公開されている。',
      '10.1371/journal.pclm.0000746',
      NULL::text
    ),
    (
      2,
      '論文の要旨では、気候安全保障ホットスポットを、社会経済的脆弱性、統治上の課題、紛争、気候敏感型生業が重なる場所として定義している。また、80の既存ホットスポットに対する専門家の評価割合、19の新規ホットスポット、参加型マッピングの位置づけが示されている。方法章では、30人の郡レベル専門家、5つの合意形成型FGD、印刷・インタラクティブ双方の地図利用が確認できる。',
      NULL::text,
      NULL::text
    )
) AS v(sort_order, ref_text, doi, url);

COMMIT;

-- =============================================================================
-- END OF DRAFT
-- =============================================================================
-- 投入前に Naoya 確認が必要な項目:
--   1. published_at: '2026-06-28 00:00:00+09:00' — kenya.html の article meta より取得。妥当か確認。
--   2. approved_at: 現在 NULL。published_at と同値にするか NULL のままにするかを決定すること。
--   3. created_by_user_id / approved_by_user_id: 現在 NULL。
--      Naoya の auth.users.id を確認してから設定すること（勝手に推定しないこと）。
--   4. tags: ['climate security', 'mapping', 'Kenya', 'local knowledge'] — kenya.html の表示タグより取得。
--   5. excerpt: meta description より取得。変更が必要な場合は本文を参照すること。
-- =============================================================================
