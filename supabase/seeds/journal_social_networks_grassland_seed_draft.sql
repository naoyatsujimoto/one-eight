-- =============================================================================
-- Journal Seed: JNL-20260629-001
-- slug: why-seeing-a-crisis-doesnt-lead-to-action
-- Source: approved/JNL-20260629-001_why-seeing-a-crisis-doesnt-lead-to-action_APPROVED.md
-- approved_by_naoya: true / ready_for_2g: true
-- DB inserted: 2026-06-29 JST
--
-- Touches:
--   journal_articles
--   journal_article_translations (en / ja)
--   journal_article_references (4 refs)
--
-- Does NOT touch:
--   journal_mail_issues / journal_delivery_history / journal_email_preferences
--   profiles / game系 / billing系 / official_matches / arena系
--   Paddle / Pro / Prize / Payout
--
-- Idempotency:
--   journal_articles:             ON CONFLICT (slug) DO UPDATE
--   journal_article_translations: ON CONFLICT (article_id, lang) DO UPDATE
--   journal_article_references:   DELETE WHERE article_id = target, then INSERT
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. journal_articles
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
  'why-seeing-a-crisis-doesnt-lead-to-action',
  'published',
  'ONE EIGHT Journal',
  ARRAY[
    'social networks',
    'Great Plains',
    'Nebraska',
    'woody encroachment',
    'prescribed burning',
    'grassland management',
    'environmental governance',
    'resilience',
    'decision-making'
  ],
  '2026-06-29T18:29:00+09:00',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (slug) DO UPDATE
  SET
    status       = EXCLUDED.status,
    author_label = EXCLUDED.author_label,
    tags         = EXCLUDED.tags,
    published_at = EXCLUDED.published_at,
    updated_at   = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. journal_article_translations — EN (is_primary=true)
-- ─────────────────────────────────────────────────────────────────────────────
WITH article AS (
  SELECT id FROM public.journal_articles
  WHERE slug = 'why-seeing-a-crisis-doesnt-lead-to-action'
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
  'en',
  'Why Seeing a Crisis Still Doesn''t Make People Act',
  'A Nebraska grassland study suggests that awareness of risk is not enough. Transformative action, such as prescribed burning, is closely associated with the social relationships that help make difficult action feasible.',
  $en_body$<p>A study of grassland management in Nebraska suggests that recognizing danger is not the same as being socially able to respond to it.</p>
<p>There is a familiar story we like to tell about human behavior. If the warning signs become visible enough, if the risk is explained clearly enough, if the consequences are serious enough, people will change what they do. It is a reassuring story because it treats action as the natural result of awareness. See the danger, understand it, and move. But many of the hardest social and ecological problems do not unfold that way. People often live in systems where the danger is visible long before an adequate response becomes common. The puzzle, then, is not only why people fail to notice a crisis, but why they may still not act even when they do.</p>
<p>A 2024 paper in <em>People and Nature</em> examines that puzzle in a very particular setting: grasslands in Nebraska, within the central Great Plains, where woody plants—especially juniper, and in this region eastern redcedar in particular—have been spreading into landscapes historically dominated by prairie. The paper frames this as a social-ecological regime shift: a change not only in vegetation, but in the practical and institutional conditions under which people manage land. The authors study livestock producers across a gradient of encroachment severity and ask a deceptively simple question: when the land is changing in serious ways, what actually predicts management action?</p>
<p>That question matters because the management choices at stake are not all the same. Some responses are relatively familiar and individually manageable, such as mechanical tree removal. Others, such as prescribed burning, are more demanding. Fire is not just another technique. It requires timing, coordination, knowledge, trust, and often some degree of collective buy-in across property lines. It sits closer to what the paper calls a "transformative" behavior: not merely coping within an existing pattern, but using a practice capable of changing the trajectory of the wider system. The paper does <strong>not</strong> say that prescribed burning is always universally appropriate, nor does it generalize "transformative behavior" into a broad theory of politics or personal life. It keeps that term anchored in the specific context of grassland management.</p>
<p>To study this, the researchers combined two kinds of evidence. On the ecological side, they used land-cover data and transition-severity measures derived from the Rangeland Analysis Platform to capture variation in woody encroachment. On the social side, they conducted a 2021 questionnaire of Nebraska livestock producers across 31 counties spanning a northwest-to-southeast vegetation gradient. From a random sample of 4,500 producers, roughly 570 surveys were returned, and 191 complete responses were used for the ego-network analysis. Respondents were asked about their management behaviors over the prior three years and about their immediate social worlds: they could list up to 15 contacts with whom they worked, communicated, or sought management advice, and then describe those contacts' occupations, the frequency of interaction, the kinds of information exchanged, and whether those contacts knew one another. The result was an empirical picture not just of what producers believed, but of how they were socially situated.</p>
<p>The headline finding is sharp. For prescribed burning, the severity of ecological transition itself did <strong>not</strong> end up adding predictive power in the final model. Instead, social-network characteristics and some socio-cognitive factors did. Producers were more likely to report prescribed burning when they were involved in rangeland management groups and when their networks showed occupational homophily—that is, similarity between the producer and their contacts by occupation. Heterogeneity and access to different information types also leaned in a positive direction. Separate from those network characteristics, observing local change and trusting government information were positively related to prescribed burning. But the paper is explicit that neither perceived social norms nor perceived risk from encroachment predicted management behavior, and in the discussion the authors go further: even though many individuals perceived high risk, those risk perceptions were not predictive of either adaptive or transformative behavior.</p>
<p>That distinction is easy to miss, and it is the most interesting part of the paper. The study does <strong>not</strong> claim that awareness is irrelevant. In fact, "change observation" did matter. What it challenges is a stronger assumption: that high risk perception alone is enough to move people into consequential action. The authors argue that it may not be a deficit of risk information that is blocking response. Instead, low social support, low information access of the right kind, and limited collective capacity may function as behavioral constraints. In their reading, people may understand the danger and still lack the practical relationships that make a difficult action feasible.</p>
<p>The contrast with mechanical removal helps clarify the point. Mechanical removal was more common in the sample overall: 76% of respondents reported using it, whereas only 30% reported prescribed burning. And unlike prescribed burning, mechanical removal was positively related to transition severity. It was also associated with more frequent interaction with contacts and with network density. In other words, the more familiar, more individually graspable response looked more responsive to ecological conditions themselves. The more socially demanding response did not. The paper's conclusion is not that ecology stops mattering, but that different types of action are bottlenecked in different ways.</p>
<p>Why might that be? The authors offer a compelling interpretation. Heterogeneous networks appear to provide access to more varied and non-redundant information, while more homophilous networks may provide the social support, frequent contact, and shared understanding needed for coordinated action. In their discussion, they suggest that these are not contradictory mechanisms but complementary ones. Some relationships broaden what a person can know; others stabilize what a person can do. For prescribed burning, both seem relevant. Fire crosses boundaries—ecological, legal, and social. It is difficult to carry out in a setting shaped by private lands, local norms, perceptions of fire risk, and bureaucratic approvals. Under those conditions, "information" in the thin sense is probably not enough.</p>
<p>This is also why the paper resists a simplistic lesson about human irrationality. It would be easy to tell the story as: people see the land changing, but they still refuse to do the right thing. The study points somewhere subtler. Social constraints may meaningfully limit transformative behavior even when the ecological problem is obvious and the consequences of inaction are understood. That is a very different claim. It shifts the explanation away from moral failure or ignorance and toward the structure of action itself. A person may not simply need more evidence. They may need trusted partners, a group, equipment, confidence, procedural knowledge, or a social setting in which an unpopular but effective practice becomes thinkable and legitimate.</p>
<p>There are limits here, and they matter. The empirical study was conducted in Nebraska, not across every corner of the Great Plains, and the final analytical sample was 191 complete ego-network responses drawn from a broader response pool. The authors themselves caution that the sample is not representative of all producers in Nebraska and call for more research on broader and more spatially distributed networks. Just as importantly, the paper does not license sweeping claims about political participation, consumer choices, or "human nature" in general. Its evidence concerns a specific land-management problem, a specific set of producers, and a specific class of actions embedded in a landscape of private property and fire governance.</p>
<p>Even with those limits, the paper offers a quiet but durable insight. We often imagine judgment as a matter of perception: who saw the danger first, who had the correct information, who understood the stakes. But between perception and response there is another layer—the layer of relationships, institutions, and practical coordination. What people can see is one question. What they can actually do, from within the network they inhabit, is another. The distance between those two questions is where many crises harden.</p>
<p>That is also where the paper makes a restrained connection to the kind of scenario ONE EIGHT is interested in. Seeing a dangerous position is not the same as having a move available. A system can make the threat legible before it makes response possible. The lesson here is not that information does not matter. Action often depends on more than information; it may also depend on practical and social support. Sometimes the decisive difference lies not in whether the danger was recognized, but in whether the people facing it were embedded in relationships that made action more feasible.</p>$en_body$,
  'Why Seeing a Crisis Still Doesn''t Make People Act',
  'A Nebraska grassland study suggests that awareness of risk is not enough. Transformative action, such as prescribed burning, is closely associated with the social relationships that help make difficult action feasible.',
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
-- 3. journal_article_translations — JA (is_primary=false)
-- ─────────────────────────────────────────────────────────────────────────────
WITH article AS (
  SELECT id FROM public.journal_articles
  WHERE slug = 'why-seeing-a-crisis-doesnt-lead-to-action'
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
  'なぜ危機を見ても、人は動かないのか',
  '危機が見えていても、人はそれだけでは動かない。ネブラスカ州の草原管理研究は、重い行動を後押しするのは、危険認識そのものよりも、実行を支える社会的なつながりかもしれないことを示している。',
  $ja_body$<p>ネブラスカ州の草原管理をめぐる研究は、危険を認識することと、社会的に応答できることが、同じではない可能性を示している。</p>
<p>私たちはしばしば、危機への反応をかなり単純に考えてしまう。状況が悪化し、その兆候が十分にはっきり見え、危険がきちんと説明されれば、人は当然動くだろう、と。危機認識が、そのまま行動につながるという見方である。だが、実際の社会や環境の問題は、そこまで素直には進まない。危険は見えていても、必要な行動が広がらない。何が起きているのか。問題は「人は危機に気づかない」のかではなく、「気づいても、なぜ十分には動かないのか」にある。</p>
<p>この問いを、かなり具体的な土地管理の文脈で扱ったのが、2024年に <em>People and Nature</em> に掲載された Holly K. Nesbitt らの論文である。対象は米国ネブラスカ州の草原地帯で、中央グレートプレーンズに位置するこの地域では、ジュニパー類（この地域では特にイースタンレッドシダー）などの木本植物が広がり、草原が木本優占の景観へ移っていく変化が問題になっている。論文はこれを、単なる植生変化ではなく、人と土地管理の関係まで巻き込む「社会生態学的レジームシフト」として捉える。そして、こう問う。土地がこれほど変わっているのに、何が人の管理行動を左右しているのか。</p>
<p>ここで重要なのは、研究が見ている行動が一枚岩でないことである。論文は、木の機械的除去と prescribed burning（計画的な野焼き）を区別している。前者は比較的個別に実施しやすい管理であり、後者は計画、知識、タイミング、周囲との調整が必要で、複数の土地所有者の境界をまたぐような協力や、制度上の手続きとも関わりやすい。論文では、この prescribed burning のような行動を「transformative behaviour」として位置づけている。ここでの transformative は、一般的な政治参加や消費者行動の話ではなく、あくまで草原管理の文脈に限定された用語である。この点は拡張しすぎない方がよい。</p>
<p>研究の方法も興味深い。著者たちは、生態学的な変化と社会的なつながりを同時に見ようとした。生態学側では、Rangeland Analysis Platform などの土地被覆データから、木本化の進行度や移行の強さを測っている。社会側では、2021年にネブラスカ州の畜産生産者を対象に質問票調査を実施した。対象は31郡にまたがり、北西から南東へと続く植生変化の勾配をカバーしている。4,500人の無作為抽出サンプルに調査票が送られ、およそ570件が返送された。そのうちエゴネットワーク分析に必要な回答が揃っていた191件が主分析に使われている。回答者には、過去3年間の管理行動に加え、自分が仕事上・相談上つながっている相手を最大15人まで挙げてもらい、その相手の職業、どのくらい頻繁に接触するか、どんな情報を受け取っているか、その相手同士が知り合いかどうかまで答えてもらっている。エゴネットワーク調査とは、個人を中心に、その周囲の直接的なつながりの形を把握する方法だと考えればよい。</p>
<p>結果は、かなりはっきりしている。prescribed burning については、木本化の移行強度そのものは最終モデルで追加的な説明力を持たなかった。代わりに効いていたのは、社会ネットワークの特徴と一部の認知変数だった。たとえば、放牧地管理グループへの関与は、prescribed burning と正の関係を示した。さらに、自分と似た職業の人とつながっている度合い、つまり occupation homophily も正の関係だった。職業の多様性や、得られる情報タイプの多さも、正方向の傾向を示している。また、地域の変化を自分で観察していることと、政府への信頼は、prescribed burning と正の関係を持っていた。だが、ここで大事なのは、論文が社会規範の認知もリスク認知も管理行動をうまく予測しなかったと書いている点である。危険を高く見積もっていることそれ自体は、適応的な行動とも変革的な行動とも結びついていなかったのである。</p>
<p>この結果は、「情報が足りないから動かない」という説明をかなり揺らす。論文の議論は慎重だが、その含意は深い。問題は、危険情報の不足ではないのかもしれない。むしろ、行動を可能にする社会的支援、適切な情報へのアクセス、集団的な実行能力の不足こそが制約なのではないか。とくに prescribed burning のような行動は、単に危機を知っているだけでは難しい。火入れには、技術、許認可の理解、周囲との調整、実施時の安全確保、場合によっては境界を越えた協力が要る。論文は、変化が深刻であっても、そうした社会的支援が乏しければ transformative な行動は起こりにくいと示唆している。</p>
<p>比較対象としての機械的除去を見ると、この違いはより分かりやすい。回答者全体では、機械的除去を使っていた人は76%で、prescribed burning を使っていた人の30%よりかなり多い。そしてこちらは、移行強度が高いほど行われやすかった。加えて、知人との接触頻度やネットワークの密度とも関連していた。つまり、比較的よく知られ、個別にも実施しやすい行動は、実際の生態学的変化そのものに反応しやすい。一方で、より広い調整を要する行動は、環境変化だけでは動かない。この差は、行動の種類によってボトルネックが違うことを示している。</p>
<p>さらに面白いのは、著者たちがネットワークの「多様性」と「同質性」を対立ではなく、別の仕方で働く二つの資源として読んでいる点だ。異質な人々につながるネットワークは、重複しない情報や多様な知識へのアクセスをもたらしやすい。逆に、同じような職業の人々が多いネットワークは、頻繁な接触や実行時の支援といった、いわば社会的な足場を与えやすい。論文の解釈では、prescribed burning を可能にしているのは、この二種類の仕組みかもしれない。新しい知識を得ることと、実際にやるときに支えてくれる共同体があること。その両方が揃って、ようやく難しい行動が現実になりやすい。</p>
<p>ここで見えてくるのは、「人は正しい情報で動く」という考え方の限界である。もちろん情報は要る。だが、それだけでは足りないのかもしれない。人は、動くべき局面を認識したら自動的に動くのではない。実行を支える関係の中にいるときほど、重い一手を打ちやすくなるのかもしれない。論文の言葉を借りれば、社会的制約は、レジームシフトが目に見えており、不作為の帰結もよく知られている場合ですら、transformative behaviour を制限しうる。これは、人間が愚かだという話ではない。むしろ、行動とは私的な決断より前に、実行可能性の問題でもあるということだ。</p>
<p>もちろん、この研究から何でも言えるわけではない。実証の中心はネブラスカ州であり、グレートプレーンズ全体を均質に扱っているわけではない。分析に使われた完全回答も191件で、著者自身が、ネブラスカ州の全生産者を代表するものではないと注意している。また、ここでいう transformative behaviour は、特定の土地管理実践を指している。ここからそのまま、投票行動、消費者行動、あるいは一般的な人生訓へと話を広げるべきではない。だが、それでもこの論文には、かなり持続的な示唆がある。危機認識と行動のあいだには、社会的な回路がある。そこがつながっていなければ、危険は見えていても、一手は出にくい。</p>
<p>ONE EIGHT との接続も、ここで控えめに見えてくる。状況の危険を見抜くことと、実際に打てる手があることは別問題である。判断は、情報の量や洞察の鋭さだけで決まるのではない。その人が、どんな関係の中にいて、どんな支援や調整可能性を持っているかにも左右される。危険が見えているのに動けない場面は、意志の弱さだけで生まれるのではない。それは、選択の前提となる構造にも左右される。その距離を見落とさないことが、危機に向き合うときの一歩なのかもしれない。</p>$ja_body$,
  'なぜ危機を見ても、人は動かないのか',
  '危機が見えていても、人はそれだけでは動かない。ネブラスカ州の草原管理研究は、重い行動を後押しするのは、危険認識そのものよりも、実行を支える社会的なつながりかもしれないことを示している。',
  FALSE
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
-- 4. journal_article_references
--    DELETE → INSERT で冪等化（対象 article_id のみ）
--
--    2026年論文の扱い:
--      sort_order 3, 4 は "Editorial background only" annotation を ref_text に含む。
--      承認済みファイルにて既にそのように記載されており、そのまま登録。
-- ─────────────────────────────────────────────────────────────────────────────
WITH article AS (
  SELECT id FROM public.journal_articles
  WHERE slug = 'why-seeing-a-crisis-doesnt-lead-to-action'
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
      'Nesbitt, H. K., Metcalf, A. L., Floyd, T. M., Uden, D. R., Chaffin, B. C., Gulab, S., Banerjee, S., Vallury, S., Hamlin, S. L., Metcalf, E. C., Fogarty, D. T., Twidwell, D., & Allen, C. R. (2024). Social networks and transformative behaviours in a grassland social-ecological system. People and Nature, 6(5), 1877–1892. https://doi.org/10.1002/pan3.10695 (Primary source for all empirical claims in this article. Volume, issue, page range, year, author list, and DOI cross-checked against the journal record and the University of Nebraska–Lincoln / Boise State press release; first published August 2024.)',
      '10.1002/pan3.10695',
      'https://doi.org/10.1002/pan3.10695'
    ),
    (
      2,
      'British Ecological Society / Wiley article page for the paper (abstract and metadata). Used to confirm the abstract-level statement that social-network characteristics explained significant variance in transformative behaviours, while severe regime shifts or high perceived risk did not make producers more likely to use prescribed burning.',
      NULL::text,
      NULL::text
    ),
    (
      3,
      'Legatzke, H. L., Floyd, T. M., Chaffin, B. C., et al. Influences of ecological change and social networks on conservation professionals'' and producers'' risk assessments of a vegetation transition. Ecology and Society (2026). Editorial background only — not used as a primary source for this article''s empirical claims.',
      NULL::text,
      NULL::text
    ),
    (
      4,
      'Nesbitt, H. K., Metcalf, A. L., Uden, D. R., & Allen, C. R. Diagnosing and navigating scale mismatches in a social-ecological system: cross-scale feedbacks and cross-level interactions enable regime shift management in the Great Plains. Ecology and Society (2026). Editorial background only — not used as a primary source for this article''s empirical claims.',
      NULL::text,
      NULL::text
    )
) AS v(sort_order, ref_text, doi, url);

COMMIT;

-- =============================================================================
-- END OF SEED
-- =============================================================================
-- DB挿入確認済み: 2026-06-29 JST
--   journal_articles:             1件 (slug unique constraint OK)
--   journal_article_translations: 2件 (en is_primary=true / ja is_primary=false)
--   journal_article_references:   4件 (sort_order 1-4)
--   build: ✓ / vitest: 591 tests all pass ✓
-- =============================================================================
