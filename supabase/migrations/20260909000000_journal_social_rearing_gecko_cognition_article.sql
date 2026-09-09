-- =============================================================================
-- 20260909000000_journal_social_rearing_gecko_cognition_article.sql
-- 記事: oej-2026-social-rearing-gecko-cognition / what-growing-up-together-changes
-- 言語: en / ja / zh-Hant / zh-Hans / ko / es / pt-BR / de / fr / it
-- 適用: supabase db push (via migration)
-- 出典: approved/oej-2026-social-rearing-gecko-cognition_what-growing-up-together-changes_APPROVED_multilingual.md
-- 注記: 承認済み front matter はタグ・地域カテゴリー・分野カテゴリーを指定していないため、
--       tags はこの migration では扱わない（INSERT 列にも ON CONFLICT DO UPDATE にも含まれない）。
--       原論文は Open access / CC BY 4.0（Szabo & Ringler 2025, Ecology and Evolution 15(6):e71560）。
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. journal_articles
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.journal_articles (
  slug,
  status,
  author_label,
  approved_at,
  published_at,
  archived_at
)
VALUES (
  'what-growing-up-together-changes',
  'published',
  'ONE EIGHT Journal',
  '2026-09-09 20:03:03+09:00',
  '2026-09-09 00:00:00+09:00',
  NULL
)
ON CONFLICT (slug) DO UPDATE
  SET
    status       = EXCLUDED.status,
    author_label = EXCLUDED.author_label,
    approved_at  = EXCLUDED.approved_at,
    published_at = EXCLUDED.published_at,
    archived_at  = EXCLUDED.archived_at,
    updated_at   = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. journal_article_translations (10 languages)
-- ─────────────────────────────────────────────────────────────────────────────

-- en
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-growing-up-together-changes')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'en',
  $t$What Does Growing Up Together Actually Change?$t$,
  $ex$Raise a gecko alone, or with its family, then test it. On almost every test the two scored the same — and the one real difference is not the one anyone expects$ex$,
  $body$<p>We assume how you are raised leaves a clear mark. Raise one animal alone and another with its family, and you expect them to turn out visibly different — the loner warier, maybe, or the one with company a little sharper. Behind that is a simple picture: the environment moves the average, in a direction you can name.</p>
<p>Birgit Szabo and Eva Ringler tested that picture on the tokay gecko (Gekko gecko), an animal we rarely think of as shaped by company. They hatched twenty. Seven were taken away at birth and raised alone; thirteen stayed with their parents, sometimes with a sibling, for six months. Then all of them lived alone for a month, so the tests would measure the upbringing and not the current housing. At about seven months old, the testing began. The idea being tested has a name — the social-intelligence hypothesis, the claim that living among others builds a sharper mind. It has mostly been argued from mammals and birds; a gecko is an odd place to go looking for it.</p>
<p>The tests were plain. Would a gecko still strike at a cricket when a strange object — a toilet-paper roll, an egg carton — sat next to it? How long before it left a covered box to step into an unfamiliar tank? Could it learn that touching a marked card — a white triangle, black-and-white stripes — meant a hidden cricket underneath? Each test ran over several days.</p>
<p>On almost every measure, the two groups scored the same. Loner or family-raised, the geckos were about equally wary of the strange object, explored the new tank about as much, and learned the card at about the same rate. "Company makes you bolder, or quicker" did not appear. The averages stayed level.</p>
<p>Two differences did show up, and both are easy to miss, because neither is about the average. The first is in the learning test. The family-raised geckos were far more uneven than the loners: a few learned the card fast, others barely learned it at all. The geckos raised alone were bunched together — all middling, none standing out in either direction. Same average, completely different spread. The second is in the new tank. The family-raised geckos were slower to leave the box and step inside it. Not bolder — more hesitant. Growing up watched over seems to have left them warier of open, unfamiliar space, not readier for it. And "bold" turned out not to be one thing: a gecko unbothered by the strange object was often the very one that hung back from the new tank. Nerve in one setting did not carry over to the other.</p>
<p>So the upbringing did leave a mark, just not the kind we go looking for. We check whether a group came out better or worse on average, and here the average barely moved. What moved was how much the individuals differed from each other, and one specific thing: their willingness to walk into a new space. The honest sentence is not "family rearing made them smarter." It is "family rearing made them less alike." A group with a few standouts and a group of steady middlers can post the same average and still be nothing like each other — and in the wild, the authors note, a few quicker learners might do better, though that was not tested. Szabo and Ringler read all this as partial, patchy support for the old idea that social life shapes the mind: a small effect, in a few places, in one captive group of twenty.</p>
<p>The distinction is worth carrying past the geckos. When we ask whether a school, a childhood, a team "shaped" someone, we almost always mean the average — did it make people better. But an environment can leave its clearest mark somewhere else: on how far apart people end up, and on one narrow trait rather than the whole person. Two groups can share an average and have been built very differently. So the next time you want to know what an early environment did, don't only ask which side came out ahead. Ask who ended up more alike and who more spread out — and which single thing actually moved.</p>$body$,
  $t$What Does Growing Up Together Actually Change? | ONE EIGHT Journal$t$,
  $ex$Raise a gecko alone, or with its family, then test it. On almost every test the two scored the same — and the one real difference is not the one anyone expects$ex$,
  true
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ja
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-growing-up-together-changes')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'ja',
  $t$一緒に育つと、何が変わるのか$t$,
  $ex$ヤモリを一匹で、あるいは家族と育て、試す。ほぼ全ての試験で二つは同じ成績だった——そして唯一の本当の違いは、誰も予想しない場所にあった$ex$,
  $body$<p>育ち方は、はっきりした跡を残す。私たちはそう思っている。一匹を単独で、もう一匹を家族と育てれば、目に見えて違って育つはずだ——単独のほうが用心深く、あるいは仲間がいたほうが少し賢く。その裏にあるのは単純な図だ。環境が平均を、はっきりした一方向——大胆に、あるいは臆病に——へ動かす、という。</p>
<p>Birgit Szabo と Eva Ringler は、その図をトッケイヤモリ(Gekko gecko)で試した。仲間に形づくられるとは、あまり思われていない動物だ。二十匹を孵し、七匹は生まれてすぐ引き離して単独で育て、十三匹は親と、ときにきょうだいと、六か月をともに過ごした。それから全員を一か月だけ単独にした。試験が測るのが、いまの飼育ではなく育ちのほうになるように。生後およそ七か月で、試験を始めた。彼らが試していた考えには名前がある。社会知性仮説——他者のなかで暮らすことが鋭い心を育てる、という主張だ。ただ、根拠の多くは哺乳類と鳥類で、ヤモリはそれを探すには風変わりな場所だった。</p>
<p>試験は素朴だ。見知らぬ物——トイレットペーパーの芯、卵のパック——がそばにあっても、ヤモリはコオロギに飛びつくか。ふたのある箱から、見慣れないタンクへ出るまで、どれだけかかるか。印のついたカード——白い三角、白黒の縞——に触れれば下に隠れたコオロギがある、と学べるか。どれも数日かけて繰り返した。</p>
<p>ほとんどの指標で、二つの群れは同じ成績だった。単独でも家族とでも、見知らぬ物へのおよその警戒は同じ、新しいタンクの探索量も同じ、カードを学ぶ速さもほぼ同じ。「仲間がいれば大胆に、賢くなる」は現れなかった。平均は横ばいのままだった。</p>
<p>違いは二つ現れ、どちらも平均の話ではないから見落としやすい。一つ目は学習試験だ。家族と育ったヤモリは、単独組よりずっとばらついた。数匹はカードをすぐ覚え、ほかはほとんど覚えなかった。一方、単独で育ったヤモリは似通っていた——みな中くらいで、どちらにも突出しない。平均は同じ、散らばりはまるで違う。二つ目は新しいタンクだ。家族と育ったヤモリは、箱を出て中へ踏み出すのが遅かった。大胆ではなく、ためらいがちに。見守られて育ったことが、開けた見慣れない空間への用心を残したらしい。踏み出す準備、ではなく。しかも「大胆さ」は一枚岩ではなかった。見知らぬ物に動じないヤモリは、しばしば新しいタンクへは尻込みする、まさにその個体だった。ある場面での度胸は、別の場面へは持ち越されない。</p>
<p>つまり育ちは跡を残した。ただし、私たちが探しにいく種類の跡ではない。私たちは、群れが平均で良く出たか悪く出たかを見る。ここでは平均はほとんど動かなかった。動いたのは、個体どうしがどれだけ違うか、と、たった一つのこと——新しい空間へ入っていく気があるか、だった。正直な一文は「家族と育つと賢くなった」ではない。「家族と育つと、互いに似なくなった」だ。数匹だけ抜きん出た群れと、みな並の群れは、平均が同じでも、まるで別の群れである。野外では、覚えの早い数匹が有利かもしれない——ただし、それは試していない、と著者は断る。Szabo と Ringler はこれらを、社会生活が心を形づくるという古い考えへの、まだらで部分的な裏づけと読む。効果は小さく、いくつかの場所でだけ、飼育下の二十匹という一組で。</p>
<p>この区別は、ヤモリの外へ持ち出す値打ちがある。ある学校が、子ども時代が、チームが、人を「形づくった」かを問うとき、私たちはほぼいつも平均を指している——それで人は良くなったか、と。だが環境は、いちばんはっきりした跡を、別の場所に残しうる。人によってどれだけ差が開くかに、そして人全体ではなく一つの狭い性質に。二つの群れは、同じ平均を持ちながら、まるで違う形に育てられていることがある。だから次に、初期の環境が何をしたのかを知りたいとき、どちらが上だったかだけを問わないこと。誰がより似通い、誰がより散らばったか——そして、実際に動いた一つのことは何か、を問うこと。</p>$body$,
  $t$一緒に育つと、何が変わるのか | ONE EIGHT Journal$t$,
  $ex$ヤモリを一匹で、あるいは家族と育て、試す。ほぼ全ての試験で二つは同じ成績だった——そして唯一の本当の違いは、誰も予想しない場所にあった$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- zh-Hant
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-growing-up-together-changes')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'zh-Hant',
  $t$一起長大，究竟改變了什麼？$t$,
  $ex$把一隻壁虎單獨養大，或和家人一起養大，然後測試牠。幾乎每一項測試裡，兩者的成績都一樣——而唯一真正的差別，不是任何人預期的那一個$ex$,
  $body$<p>我們假定，一個個體是怎麼被養大的，會留下清楚的印記。把一隻動物單獨養大，另一隻和家人一起養大，你會預期牠們長成看得出來的不同——獨居的那隻大概更警戒，或者有伴的那隻稍微機靈一些。這背後有一幅簡單的圖像：環境會把平均值往某個你叫得出名字的方向推。</p>
<p>Birgit Szabo 與 Eva Ringler 拿這幅圖像去測試大壁虎（<em>Gekko gecko</em>），一種我們很少會想到「被同伴形塑」的動物。他們孵出二十隻。其中七隻一出生就被帶走，單獨養大；十三隻和父母待在一起，有時還有一隻同胞，為期六個月。接著全部都單獨生活一個月，好讓測試量到的是成長經歷，而不是當下的居住狀況。大約七個月大時，測試開始。他們所測試的這個想法有個名字——社會智力假說，也就是「生活在他者之間會鍛造出更敏銳的心智」這個主張。它主要是從哺乳類與鳥類那裡被論證出來的；壁虎是個奇怪的尋找地點。</p>
<p>測試很樸素。當一個陌生物體——一個衛生紙捲筒、一個蛋盒——擺在旁邊時，壁虎還會不會撲向蟋蟀？牠要多久才會離開有蓋的盒子，踏進一個陌生的水槽？牠能不能學會：碰觸一張有記號的卡片——白色三角形、黑白條紋——底下就藏著一隻蟋蟀？每一項測試都進行了好幾天。</p>
<p>幾乎在每一項指標上，兩組的成績都一樣。不論是獨居還是家庭養大的，這些壁虎對陌生物體的警戒程度差不多，探索新水槽的程度差不多，學會卡片的速度也差不多。「有伴會讓你更大膽，或更快」並沒有出現。平均值維持在同一條線上。</p>
<p>確實出現了兩個差別，而兩個都容易被忽略，因為它們都不是關於平均值的。第一個在學習測試裡。家庭養大的壁虎比獨居的那些不均勻得多：少數幾隻很快學會卡片，其他的幾乎根本沒學會。單獨養大的壁虎則擠在一起——全都中等，沒有一隻往任何一個方向突出。平均值相同，散布卻完全不同。第二個在新水槽裡。家庭養大的壁虎離開盒子、踏進去的速度較慢。不是更大膽——而是更遲疑。在注視下長大，似乎讓牠們對開闊而陌生的空間更加戒備，而不是更有準備。而且「大膽」原來並不是同一件事：一隻不被陌生物體困擾的壁虎，往往正是那隻對新水槽裹足不前的。在某一個場合裡的膽量，並沒有帶到另一個場合去。</p>
<p>所以成長經歷確實留下了印記，只是不是我們去尋找的那一種。我們檢查的是一組在平均上表現得更好還是更差，而在這裡，平均幾乎沒有動。動的是個體彼此之間差異有多大，以及一件具體的事：牠們願不願意走進一個新的空間。誠實的句子不是「家庭養育讓牠們變聰明了」，而是「家庭養育讓牠們彼此變得比較不像」。一個有少數幾隻突出的群體，和一個全是穩定中等者的群體，可以繳出同樣的平均值，卻一點也不像彼此——而在野外，作者指出，少數幾隻學得比較快的個體或許會過得更好，儘管這一點並未被測試。Szabo 與 Ringler 把這一切讀作對那個老想法——社會生活形塑心智——的部分而零星的支持：一個小小的效果，出現在少數幾個地方，出現在一組二十隻的圈養個體身上。</p>
<p>這個區分值得帶出壁虎之外。當我們問一所學校、一段童年、一支隊伍是否「形塑」了某個人時，我們幾乎總是在講平均——它有沒有讓人變得更好。但一個環境最清楚的印記，可能落在別的地方：落在人們最後彼此相距多遠，以及落在某一項狹窄的特質而非整個人身上。兩個群體可以共有同一個平均值，卻是以非常不同的方式被造就出來的。所以下一次，當你想知道一個早期環境做了什麼，別只問哪一邊勝出。問問誰變得更相像、誰變得更分散——以及，實際上動了的是哪一件事。</p>$body$,
  $t$一起長大，究竟改變了什麼？ | ONE EIGHT Journal$t$,
  $ex$把一隻壁虎單獨養大，或和家人一起養大，然後測試牠。幾乎每一項測試裡，兩者的成績都一樣——而唯一真正的差別，不是任何人預期的那一個$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- zh-Hans
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-growing-up-together-changes')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'zh-Hans',
  $t$一起长大，究竟改变了什么？$t$,
  $ex$把一只壁虎单独养大，或和家人一起养大，然后测试它。几乎每一项测试里，两者的成绩都一样——而唯一真正的差别，不是任何人预期的那一个$ex$,
  $body$<p>我们假定，一个个体是怎么被养大的，会留下清楚的印记。把一只动物单独养大，另一只和家人一起养大，你会预期它们长成看得出来的不同——独居的那只大概更警戒，或者有伴的那只稍微机灵一些。这背后有一幅简单的图像：环境会把平均值往某个你叫得出名字的方向推。</p>
<p>Birgit Szabo 与 Eva Ringler 拿这幅图像去测试大壁虎（<em>Gekko gecko</em>），一种我们很少会想到“被同伴形塑”的动物。他们孵出二十只。其中七只一出生就被带走，单独养大；十三只和父母待在一起，有时还有一只同胞，为期六个月。接着全部都单独生活一个月，好让测试量到的是成长经历，而不是当下的居住状况。大约七个月大时，测试开始。他们所测试的这个想法有个名字——社会智力假说，也就是“生活在他者之间会锻造出更敏锐的心智”这个主张。它主要是从哺乳类与鸟类那里被论证出来的；壁虎是个奇怪的寻找地点。</p>
<p>测试很朴素。当一个陌生物体——一个卫生纸卷筒、一个蛋盒——摆在旁边时，壁虎还会不会扑向蟋蟀？它要多久才会离开有盖的盒子，踏进一个陌生的水槽？它能不能学会：碰触一张有记号的卡片——白色三角形、黑白条纹——底下就藏着一只蟋蟀？每一项测试都进行了好几天。</p>
<p>几乎在每一项指标上，两组的成绩都一样。不论是独居还是家庭养大的，这些壁虎对陌生物体的警戒程度差不多，探索新水槽的程度差不多，学会卡片的速度也差不多。“有伴会让你更大胆，或更快”并没有出现。平均值维持在同一条线上。</p>
<p>确实出现了两个差别，而两个都容易被忽略，因为它们都不是关于平均值的。第一个在学习测试里。家庭养大的壁虎比独居的那些不均匀得多：少数几只很快学会卡片，其他的几乎根本没学会。单独养大的壁虎则挤在一起——全都中等，没有一只往任何一个方向突出。平均值相同，散布却完全不同。第二个在新水槽里。家庭养大的壁虎离开盒子、踏进去的速度较慢。不是更大胆——而是更迟疑。在注视下长大，似乎让它们对开阔而陌生的空间更加戒备，而不是更有准备。而且“大胆”原来并不是同一件事：一只不被陌生物体困扰的壁虎，往往正是那只对新水槽裹足不前的。在某一个场合里的胆量，并没有带到另一个场合去。</p>
<p>所以成长经历确实留下了印记，只是不是我们去寻找的那一种。我们检查的是一组在平均上表现得更好还是更差，而在这里，平均几乎没有动。动的是个体彼此之间差异有多大，以及一件具体的事：它们愿不愿意走进一个新的空间。诚实的句子不是“家庭养育让它们变聪明了”，而是“家庭养育让它们彼此变得比较不像”。一个有少数几只突出的群体，和一个全是稳定中等者的群体，可以缴出同样的平均值，却一点也不像彼此——而在野外，作者指出，少数几只学得比较快的个体或许会过得更好，尽管这一点并未被测试。Szabo 与 Ringler 把这一切读作对那个老想法——社会生活形塑心智——的部分而零星的支持：一个小小的效果，出现在少数几个地方，出现在一组二十只的圈养个体身上。</p>
<p>这个区分值得带出壁虎之外。当我们问一所学校、一段童年、一支队伍是否“形塑”了某个人时，我们几乎总是在讲平均——它有没有让人变得更好。但一个环境最清楚的印记，可能落在别的地方：落在人们最后彼此相距多远，以及落在某一项狭窄的特质而非整个人身上。两个群体可以共有同一个平均值，却是以非常不同的方式被造就出来的。所以下一次，当你想知道一个早期环境做了什么，别只问哪一边胜出。问问谁变得更相像、谁变得更分散——以及，实际上动了的是哪一件事。</p>$body$,
  $t$一起长大，究竟改变了什么？ | ONE EIGHT Journal$t$,
  $ex$把一只壁虎单独养大，或和家人一起养大，然后测试它。几乎每一项测试里，两者的成绩都一样——而唯一真正的差别，不是任何人预期的那一个$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ko
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-growing-up-together-changes')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'ko',
  $t$함께 자란다는 것은 무엇을 바꾸는가$t$,
  $ex$도마뱀붙이를 혼자 키우거나 가족과 함께 키운 뒤 시험해 본다. 거의 모든 시험에서 두 쪽의 성적은 같았다 — 그리고 단 하나의 진짜 차이는 누구도 예상하지 않는 곳에 있었다$ex$,
  $body$<p>어떻게 길러졌는지가 뚜렷한 자국을 남긴다고 우리는 가정한다. 한 마리는 혼자, 다른 한 마리는 가족과 함께 키우면 눈에 띄게 다르게 자랄 것이라고 기대한다 — 혼자 자란 쪽이 더 경계심이 많거나, 아니면 곁에 누가 있던 쪽이 조금 더 영리하거나. 그 뒤에는 단순한 그림이 있다. 환경이 평균을, 이름을 붙일 수 있는 어떤 방향으로 옮긴다는 그림이다.</p>
<p>Birgit Szabo와 Eva Ringler는 그 그림을 토케이도마뱀붙이(<em>Gekko gecko</em>)에게 시험했다. 우리가 좀처럼 동료에게 빚어진다고 생각하지 않는 동물이다. 그들은 스무 마리를 부화시켰다. 그중 일곱 마리는 태어나자마자 떼어 내 혼자 길렀고, 열세 마리는 부모와, 때로는 형제 한 마리와 함께 여섯 달을 지냈다. 그런 다음 전부를 한 달 동안 혼자 살게 했다. 시험이 지금의 사육 상태가 아니라 자라 온 과정을 재도록 하기 위해서다. 생후 일곱 달쯤에 시험이 시작되었다. 여기서 시험되는 생각에는 이름이 있다 — 사회지능 가설, 곧 다른 개체들 사이에서 사는 것이 더 예리한 마음을 만든다는 주장이다. 그 근거는 대체로 포유류와 조류에서 논증되어 왔고, 도마뱀붙이는 그것을 찾으러 가기에는 낯선 자리다.</p>
<p>시험은 소박했다. 낯선 물체 — 두루마리 휴지 심, 달걀 상자 — 가 옆에 놓여 있어도 도마뱀붙이는 여전히 귀뚜라미에게 달려들까? 뚜껑 덮인 상자에서 나와 낯선 수조로 발을 들이기까지 얼마나 걸릴까? 표시가 있는 카드 — 흰 삼각형, 흑백 줄무늬 — 를 건드리면 그 밑에 귀뚜라미가 숨겨져 있다는 것을 배울 수 있을까? 시험은 저마다 며칠에 걸쳐 진행되었다.</p>
<p>거의 모든 척도에서 두 집단의 성적은 같았다. 혼자 자랐든 가족과 자랐든, 도마뱀붙이들은 낯선 물체를 경계하는 정도가 비슷했고, 새 수조를 탐색하는 정도도 비슷했으며, 카드를 배우는 속도도 비슷했다. "함께 지내면 더 대담해지거나 더 빨라진다"는 나타나지 않았다. 평균은 나란한 채로 있었다.</p>
<p>차이는 두 가지가 나타났고, 둘 다 놓치기 쉽다. 어느 쪽도 평균에 관한 것이 아니기 때문이다. 첫 번째는 학습 시험에 있다. 가족과 자란 도마뱀붙이들은 혼자 자란 쪽보다 훨씬 고르지 않았다. 몇 마리는 카드를 빨리 배웠고, 나머지는 거의 배우지 못했다. 혼자 자란 도마뱀붙이들은 한데 뭉쳐 있었다 — 모두 중간쯤이고, 어느 방향으로도 튀는 개체가 없었다. 같은 평균, 완전히 다른 퍼짐. 두 번째는 새 수조에 있다. 가족과 자란 도마뱀붙이들은 상자를 나와 안으로 발을 들이는 것이 더 느렸다. 더 대담한 것이 아니라 — 더 머뭇거렸다. 지켜봐 주는 가운데 자란 것이, 트이고 낯선 공간에 대해 더 경계하게 만든 듯하다. 그런 공간을 향해 더 준비되게 한 것이 아니라. 그리고 "대담함"은 하나의 것이 아니었다. 낯선 물체에 아랑곳하지 않던 도마뱀붙이가, 종종 바로 새 수조 앞에서 물러서던 그 개체였다. 한 장면에서의 배짱은 다른 장면으로 넘어가지 않았다.</p>
<p>그러니 자라 온 과정은 자국을 남겼다. 다만 우리가 찾으러 가는 종류의 자국은 아니었다. 우리는 한 집단이 평균적으로 더 나아졌는지 나빠졌는지를 확인하는데, 여기서 평균은 거의 움직이지 않았다. 움직인 것은 개체들이 서로 얼마나 달라졌는가, 그리고 한 가지 구체적인 것 — 새로운 공간으로 걸어 들어갈 의향 — 이었다. 정직한 문장은 "가족 양육이 그들을 더 똑똑하게 만들었다"가 아니다. "가족 양육이 그들을 서로 덜 닮게 만들었다"이다. 몇몇이 두드러지는 집단과 고르게 중간인 집단은 같은 평균을 내면서도 전혀 서로 같지 않을 수 있다 — 그리고 야생에서라면 더 빨리 배우는 몇 마리가 더 잘 지낼지도 모른다고 저자들은 덧붙이지만, 그것은 시험되지 않았다. Szabo와 Ringler는 이 모두를, 사회생활이 마음을 빚는다는 오래된 생각에 대한 부분적이고 군데군데인 뒷받침으로 읽는다. 작은 효과가, 몇몇 자리에서, 스무 마리로 이루어진 사육 상태의 한 집단에서.</p>
<p>이 구분은 도마뱀붙이 너머로 가지고 갈 만하다. 어떤 학교가, 어떤 어린 시절이, 어떤 팀이 누군가를 "빚었는지" 물을 때 우리는 거의 언제나 평균을 뜻한다 — 그것이 사람들을 더 낫게 만들었는가. 그러나 환경은 가장 뚜렷한 자국을 다른 곳에 남길 수 있다. 사람들이 결국 서로 얼마나 멀어지는가에, 그리고 사람 전체가 아니라 좁은 특성 하나에. 두 집단은 같은 평균을 가지고도 아주 다르게 지어져 있을 수 있다. 그러니 다음번에 어떤 초기 환경이 무엇을 했는지 알고 싶다면, 어느 쪽이 앞섰는지만 묻지 말 것. 누가 더 비슷해졌고 누가 더 흩어졌는지 — 그리고 실제로 움직인 그 한 가지가 무엇인지를 물을 것.</p>$body$,
  $t$함께 자란다는 것은 무엇을 바꾸는가 | ONE EIGHT Journal$t$,
  $ex$도마뱀붙이를 혼자 키우거나 가족과 함께 키운 뒤 시험해 본다. 거의 모든 시험에서 두 쪽의 성적은 같았다 — 그리고 단 하나의 진짜 차이는 누구도 예상하지 않는 곳에 있었다$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- es
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-growing-up-together-changes')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'es',
  $t$¿Qué cambia de verdad crecer juntos?$t$,
  $ex$Cría un gecko solo, o con su familia, y luego ponlo a prueba. En casi todas las pruebas los dos sacaron lo mismo — y la única diferencia real no es la que nadie espera$ex$,
  $body$<p>Damos por hecho que la forma en que uno se cría deja una marca clara. Cría a un animal solo y a otro con su familia, y esperas que salgan visiblemente distintos: el solitario más receloso, quizá, o el que tuvo compañía un poco más despierto. Detrás de eso hay una imagen sencilla: el entorno mueve la media, en una dirección que puedes nombrar.</p>
<p>Birgit Szabo y Eva Ringler pusieron a prueba esa imagen con el gecko tokay (<em>Gekko gecko</em>), un animal en el que rara vez pensamos como moldeado por la compañía. Incubaron veinte. A siete se los apartó al nacer y se criaron solos; trece se quedaron con sus padres, a veces con un hermano, durante seis meses. Después todos vivieron solos un mes, para que las pruebas midieran la crianza y no el alojamiento del momento. Alrededor de los siete meses de edad empezaron las pruebas. La idea que se estaba poniendo a prueba tiene nombre: la hipótesis de la inteligencia social, la afirmación de que vivir entre otros construye una mente más aguda. Se ha defendido sobre todo a partir de mamíferos y aves; un gecko es un sitio raro donde ir a buscarla.</p>
<p>Las pruebas eran sencillas. ¿Se lanzaría un gecko igualmente sobre un grillo con un objeto extraño al lado: un rollo de papel higiénico, una huevera? ¿Cuánto tardaría en salir de una caja tapada para entrar en un acuario desconocido? ¿Podría aprender que tocar una tarjeta marcada —un triángulo blanco, unas franjas en blanco y negro— significaba un grillo escondido debajo? Cada prueba se prolongó varios días.</p>
<p>En casi todas las medidas, los dos grupos sacaron lo mismo. Solitarios o criados en familia, los geckos desconfiaban del objeto extraño más o menos por igual, exploraron el acuario nuevo más o menos lo mismo y aprendieron la tarjeta a un ritmo parecido. "La compañía te hace más audaz, o más rápido" no apareció. Las medias se mantuvieron a la par.</p>
<p>Sí aparecieron dos diferencias, y las dos son fáciles de pasar por alto, porque ninguna tiene que ver con la media. La primera está en la prueba de aprendizaje. Los geckos criados en familia fueron mucho más desiguales que los solitarios: unos pocos aprendieron la tarjeta deprisa, otros apenas la aprendieron. Los geckos criados solos estaban apiñados: todos intermedios, ninguno destacando en ninguna dirección. La misma media, una dispersión completamente distinta. La segunda está en el acuario nuevo. Los geckos criados en familia tardaron más en salir de la caja y entrar en él. No más audaces: más vacilantes. Crecer vigilados parece haberlos dejado más recelosos del espacio abierto y desconocido, no más dispuestos a él. Y "audaz" resultó no ser una sola cosa: un gecko al que no le molestaba el objeto extraño era a menudo justo el que se quedaba atrás ante el acuario nuevo. El temple en un escenario no se trasladaba al otro.</p>
<p>Así que la crianza sí dejó una marca, solo que no de la clase que vamos buscando. Comprobamos si un grupo salió mejor o peor de media, y aquí la media apenas se movió. Lo que se movió fue cuánto se diferenciaban los individuos entre sí, y una cosa concreta: su disposición a adentrarse en un espacio nuevo. La frase honesta no es "criarse en familia los hizo más listos". Es "criarse en familia los hizo menos parecidos entre sí". Un grupo con unos pocos que destacan y un grupo de intermedios estables pueden dar la misma media y no parecerse en nada — y en libertad, señalan los autores, a unos pocos que aprendan más rápido podría irles mejor, aunque eso no se puso a prueba. Szabo y Ringler leen todo esto como un apoyo parcial y desigual a la vieja idea de que la vida social moldea la mente: un efecto pequeño, en unos pocos lugares, en un grupo cautivo de veinte.</p>
<p>La distinción merece llevarse más allá de los geckos. Cuando preguntamos si una escuela, una infancia, un equipo "formaron" a alguien, casi siempre nos referimos a la media: si hizo mejores a las personas. Pero un entorno puede dejar su marca más nítida en otro sitio: en cuánto acaban distanciándose unas personas de otras, y en un rasgo estrecho en lugar de en la persona entera. Dos grupos pueden compartir una media y haber sido construidos de maneras muy distintas. Así que la próxima vez que quieras saber qué hizo un entorno temprano, no preguntes solo qué lado salió ganando. Pregunta quién acabó más parecido y quién más disperso — y qué única cosa se movió de verdad.</p>$body$,
  $t$¿Qué cambia de verdad crecer juntos? | ONE EIGHT Journal$t$,
  $ex$Cría un gecko solo, o con su familia, y luego ponlo a prueba. En casi todas las pruebas los dos sacaron lo mismo — y la única diferencia real no es la que nadie espera$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- pt-BR
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-growing-up-together-changes')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'pt-BR',
  $t$O que crescer junto muda de fato?$t$,
  $ex$Crie uma lagartixa sozinha, ou com a família, e depois teste. Em quase todos os testes as duas tiveram o mesmo resultado — e a única diferença real não é a que ninguém espera$ex$,
  $body$<p>Presumimos que o modo como alguém é criado deixa uma marca clara. Crie um animal sozinho e outro com a família, e você espera que saiam visivelmente diferentes — o solitário mais desconfiado, talvez, ou o que teve companhia um pouco mais esperto. Por trás disso há uma imagem simples: o ambiente move a média, numa direção que você consegue nomear.</p>
<p>Birgit Szabo e Eva Ringler testaram essa imagem na lagartixa-tokay (<em>Gekko gecko</em>), um animal em que raramente pensamos como moldado pela companhia. Eles chocaram vinte. Sete foram separadas ao nascer e criadas sozinhas; treze ficaram com os pais, às vezes com um irmão, por seis meses. Depois todas viveram sozinhas por um mês, para que os testes medissem a criação e não o alojamento do momento. Por volta dos sete meses de idade, os testes começaram. A ideia que estava sendo testada tem nome: a hipótese da inteligência social, a afirmação de que viver entre outros constrói uma mente mais afiada. Ela foi defendida sobretudo a partir de mamíferos e aves; uma lagartixa é um lugar estranho para ir procurá-la.</p>
<p>Os testes eram simples. Uma lagartixa ainda se lançaria sobre um grilo com um objeto estranho ao lado — um rolo de papel higiênico, uma caixa de ovos? Quanto tempo levaria para sair de uma caixa tampada e entrar num aquário desconhecido? Conseguiria aprender que tocar um cartão marcado — um triângulo branco, listras em preto e branco — significava um grilo escondido embaixo? Cada teste se estendeu por vários dias.</p>
<p>Em quase todas as medidas, os dois grupos tiveram o mesmo resultado. Solitárias ou criadas em família, as lagartixas desconfiaram do objeto estranho mais ou menos igualmente, exploraram o aquário novo mais ou menos o mesmo tanto e aprenderam o cartão num ritmo parecido. "A companhia deixa você mais ousado, ou mais rápido" não apareceu. As médias ficaram emparelhadas.</p>
<p>Duas diferenças apareceram, sim, e as duas são fáceis de não notar, porque nenhuma delas é sobre a média. A primeira está no teste de aprendizado. As lagartixas criadas em família foram muito mais desiguais que as solitárias: umas poucas aprenderam o cartão depressa, outras mal aprenderam. As lagartixas criadas sozinhas ficaram agrupadas — todas medianas, nenhuma se destacando em qualquer direção. A mesma média, uma dispersão completamente diferente. A segunda está no aquário novo. As lagartixas criadas em família demoraram mais para sair da caixa e entrar nele. Não mais ousadas — mais hesitantes. Crescer sob vigilância parece tê-las deixado mais desconfiadas do espaço aberto e desconhecido, não mais prontas para ele. E "ousado" acabou não sendo uma coisa só: uma lagartixa que não se incomodava com o objeto estranho era muitas vezes justamente a que recuava diante do aquário novo. A coragem num cenário não se transferia para o outro.</p>
<p>Então a criação deixou mesmo uma marca, só que não do tipo que a gente vai procurar. Verificamos se um grupo saiu melhor ou pior na média, e aqui a média mal se moveu. O que se moveu foi o quanto os indivíduos diferiam entre si, e uma coisa específica: sua disposição de entrar num espaço novo. A frase honesta não é "a criação em família as deixou mais espertas". É "a criação em família as deixou menos parecidas entre si". Um grupo com uns poucos destaques e um grupo de medianos constantes podem registrar a mesma média e não se parecer em nada — e na natureza, observam os autores, umas poucas que aprendem mais rápido talvez se saíssem melhor, embora isso não tenha sido testado. Szabo e Ringler leem tudo isso como um apoio parcial e irregular à velha ideia de que a vida social molda a mente: um efeito pequeno, em uns poucos pontos, num único grupo cativo de vinte.</p>
<p>A distinção vale ser levada para além das lagartixas. Quando perguntamos se uma escola, uma infância, um time "formaram" alguém, quase sempre queremos dizer a média — se aquilo tornou as pessoas melhores. Mas um ambiente pode deixar sua marca mais nítida em outro lugar: no quanto as pessoas acabam se distanciando umas das outras, e num traço estreito em vez de na pessoa inteira. Dois grupos podem compartilhar uma média e terem sido construídos de maneiras muito diferentes. Então, da próxima vez que você quiser saber o que um ambiente inicial fez, não pergunte só qual lado saiu na frente. Pergunte quem acabou mais parecido e quem mais espalhado — e qual foi a única coisa que de fato se moveu.</p>$body$,
  $t$O que crescer junto muda de fato? | ONE EIGHT Journal$t$,
  $ex$Crie uma lagartixa sozinha, ou com a família, e depois teste. Em quase todos os testes as duas tiveram o mesmo resultado — e a única diferença real não é a que ninguém espera$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- de
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-growing-up-together-changes')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'de',
  $t$Was verändert es wirklich, gemeinsam aufzuwachsen?$t$,
  $ex$Zieh einen Gecko allein auf, oder mit seiner Familie, und teste ihn dann. In fast jedem Test schnitten beide gleich ab — und der eine wirkliche Unterschied ist nicht der, den irgendwer erwartet$ex$,
  $body$<p>Wir gehen davon aus, dass die Art, wie man aufwächst, eine deutliche Spur hinterlässt. Zieht man ein Tier allein auf und ein anderes mit seiner Familie, erwartet man, dass sie sichtbar verschieden werden — das einzeln aufgewachsene vorsichtiger vielleicht, oder das mit Gesellschaft ein wenig aufgeweckter. Dahinter steht ein einfaches Bild: Die Umgebung verschiebt den Durchschnitt, in eine Richtung, die man benennen kann.</p>
<p>Birgit Szabo und Eva Ringler haben dieses Bild am Tokeh (<em>Gekko gecko</em>) geprüft, einem Tier, von dem wir selten denken, dass Gesellschaft es formt. Sie zogen zwanzig aus dem Ei. Sieben wurden gleich nach dem Schlupf weggenommen und allein aufgezogen; dreizehn blieben sechs Monate bei ihren Eltern, manchmal mit einem Geschwistertier. Danach lebten alle einen Monat allein, damit die Tests das Aufwachsen messen würden und nicht die gegenwärtige Haltung. Mit etwa sieben Monaten begannen die Tests. Der geprüfte Gedanke hat einen Namen — die Hypothese der sozialen Intelligenz, die Behauptung, dass das Leben unter anderen einen schärferen Verstand hervorbringt. Sie ist überwiegend an Säugetieren und Vögeln entwickelt worden; ein Gecko ist ein merkwürdiger Ort, um danach zu suchen.</p>
<p>Die Tests waren schlicht. Würde ein Gecko noch nach einer Grille schnappen, wenn ein fremder Gegenstand daneben lag — eine Klopapierrolle, ein Eierkarton? Wie lange brauchte er, um eine abgedeckte Box zu verlassen und in ein unbekanntes Becken zu treten? Konnte er lernen, dass das Berühren einer markierten Karte — ein weißes Dreieck, schwarz-weiße Streifen — eine darunter versteckte Grille bedeutete? Jeder Test lief über mehrere Tage.</p>
<p>In fast jedem Maß schnitten die beiden Gruppen gleich ab. Ob allein oder in der Familie aufgezogen — die Geckos waren gegenüber dem fremden Gegenstand etwa gleich misstrauisch, erkundeten das neue Becken etwa gleich viel und lernten die Karte etwa gleich schnell. "Gesellschaft macht dich mutiger oder schneller" zeigte sich nicht. Die Durchschnitte blieben auf gleicher Höhe.</p>
<p>Zwei Unterschiede zeigten sich sehr wohl, und beide übersieht man leicht, weil es bei keinem um den Durchschnitt geht. Der erste liegt im Lerntest. Die in der Familie aufgezogenen Geckos waren weit ungleichmäßiger als die Einzelgänger: Ein paar lernten die Karte schnell, andere kaum. Die allein aufgezogenen Geckos lagen dicht beieinander — alle mittelmäßig, keiner stach in irgendeine Richtung heraus. Gleicher Durchschnitt, völlig andere Streuung. Der zweite liegt beim neuen Becken. Die in der Familie aufgezogenen Geckos verließen die Box langsamer und traten langsamer hinein. Nicht mutiger — zögerlicher. Behütet aufzuwachsen scheint sie gegenüber offenem, unbekanntem Raum vorsichtiger gemacht zu haben, nicht bereiter dafür. Und "mutig" erwies sich als nicht eine einzige Sache: Ein Gecko, den der fremde Gegenstand nicht störte, war oft genau derjenige, der vor dem neuen Becken zurückblieb. Der Mut in der einen Lage übertrug sich nicht auf die andere.</p>
<p>Das Aufwachsen hat also durchaus eine Spur hinterlassen, nur nicht die Art, nach der wir suchen. Wir prüfen, ob eine Gruppe im Durchschnitt besser oder schlechter abschnitt, und hier bewegte sich der Durchschnitt kaum. Bewegt hat sich, wie stark sich die Einzelnen voneinander unterschieden, und eine bestimmte Sache: ihre Bereitschaft, in einen neuen Raum hineinzugehen. Der ehrliche Satz lautet nicht "die Aufzucht in der Familie machte sie klüger". Er lautet: "die Aufzucht in der Familie machte sie einander unähnlicher". Eine Gruppe mit ein paar Herausragenden und eine Gruppe gleichmäßiger Mittelmäßiger können denselben Durchschnitt haben und einander doch überhaupt nicht gleichen — und in freier Wildbahn, merken die Autoren an, könnten ein paar schnellere Lerner besser zurechtkommen, wobei das nicht geprüft wurde. Szabo und Ringler lesen all das als teilweise, lückenhafte Stütze für den alten Gedanken, dass soziales Leben den Verstand formt: ein kleiner Effekt, an wenigen Stellen, in einer Gruppe von zwanzig Tieren in Gefangenschaft.</p>
<p>Die Unterscheidung lohnt sich über die Geckos hinaus. Wenn wir fragen, ob eine Schule, eine Kindheit, ein Team jemanden "geprägt" hat, meinen wir fast immer den Durchschnitt — ob es die Leute besser gemacht hat. Doch eine Umgebung kann ihre deutlichste Spur woanders hinterlassen: darin, wie weit die Leute am Ende auseinanderliegen, und in einem einzelnen engen Merkmal statt im ganzen Menschen. Zwei Gruppen können denselben Durchschnitt teilen und sehr unterschiedlich gebaut worden sein. Wenn Sie also das nächste Mal wissen wollen, was eine frühe Umgebung bewirkt hat, fragen Sie nicht nur, welche Seite vorne lag. Fragen Sie, wer einander ähnlicher wurde und wer weiter auseinanderging — und welche eine Sache sich tatsächlich bewegt hat.</p>$body$,
  $t$Was verändert es wirklich, gemeinsam aufzuwachsen? | ONE EIGHT Journal$t$,
  $ex$Zieh einen Gecko allein auf, oder mit seiner Familie, und teste ihn dann. In fast jedem Test schnitten beide gleich ab — und der eine wirkliche Unterschied ist nicht der, den irgendwer erwartet$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- fr
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-growing-up-together-changes')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'fr',
  $t$Qu'est-ce que grandir ensemble change vraiment ?$t$,
  $ex$Élevez un gecko seul, ou avec sa famille, puis testez-le. À presque tous les tests, les deux ont obtenu la même chose — et la seule vraie différence n'est pas celle que l'on attend$ex$,
  $body$<p>Nous supposons que la façon dont on est élevé laisse une marque nette. Élevez un animal seul et un autre avec sa famille, et vous vous attendez à ce qu'ils deviennent visiblement différents — le solitaire plus méfiant, peut-être, ou celui qui a eu de la compagnie un peu plus vif. Derrière cela il y a une image simple : l'environnement déplace la moyenne, dans une direction qu'on peut nommer.</p>
<p>Birgit Szabo et Eva Ringler ont mis cette image à l'épreuve chez le gecko tokay (<em>Gekko gecko</em>), un animal dont on pense rarement qu'il est façonné par la compagnie. Ils en ont fait éclore vingt. Sept ont été retirés à la naissance et élevés seuls ; treize sont restés avec leurs parents, parfois avec un frère ou une sœur, pendant six mois. Ensuite tous ont vécu seuls pendant un mois, pour que les tests mesurent l'éducation reçue et non le logement du moment. Vers l'âge de sept mois, les tests ont commencé. L'idée que l'on testait porte un nom : l'hypothèse de l'intelligence sociale, l'affirmation selon laquelle vivre parmi d'autres construit un esprit plus vif. Elle a surtout été défendue à partir des mammifères et des oiseaux ; un gecko est un endroit étrange où aller la chercher.</p>
<p>Les tests étaient simples. Un gecko se jetterait-il encore sur un grillon si un objet inconnu se trouvait à côté — un rouleau de papier toilette, une boîte à œufs ? Combien de temps mettrait-il à quitter une boîte couverte pour entrer dans un aquarium inconnu ? Pouvait-il apprendre que toucher une carte marquée — un triangle blanc, des rayures noires et blanches — signifiait un grillon caché dessous ? Chaque test s'est déroulé sur plusieurs jours.</p>
<p>Sur presque toutes les mesures, les deux groupes ont obtenu la même chose. Solitaires ou élevés en famille, les geckos se méfiaient à peu près autant de l'objet inconnu, exploraient à peu près autant le nouvel aquarium et apprenaient la carte à peu près au même rythme. « La compagnie vous rend plus hardi, ou plus rapide » n'est pas apparu. Les moyennes sont restées au même niveau.</p>
<p>Deux différences sont bel et bien apparues, et toutes deux sont faciles à manquer, car aucune ne porte sur la moyenne. La première est dans le test d'apprentissage. Les geckos élevés en famille étaient bien plus inégaux que les solitaires : quelques-uns ont appris la carte vite, d'autres ne l'ont presque pas apprise. Les geckos élevés seuls se tenaient serrés — tous moyens, aucun ne se détachant dans un sens ou dans l'autre. Même moyenne, dispersion complètement différente. La seconde est dans le nouvel aquarium. Les geckos élevés en famille ont mis plus de temps à quitter la boîte et à y entrer. Non pas plus hardis — plus hésitants. Grandir sous surveillance semble les avoir laissés plus méfiants envers l'espace ouvert et inconnu, non plus prêts à l'affronter. Et « hardi » s'est révélé ne pas être une seule chose : un gecko que l'objet inconnu ne dérangeait pas était souvent celui-là même qui restait en retrait devant le nouvel aquarium. Le cran dans un cadre ne se reportait pas sur l'autre.</p>
<p>L'éducation reçue a donc bien laissé une marque, mais pas celle que nous allons chercher. Nous vérifions si un groupe s'en est sorti mieux ou moins bien en moyenne, et ici la moyenne n'a presque pas bougé. Ce qui a bougé, c'est l'écart entre les individus, et une chose précise : leur disposition à s'avancer dans un espace nouveau. La phrase honnête n'est pas « l'élevage en famille les a rendus plus intelligents ». C'est « l'élevage en famille les a rendus moins semblables les uns aux autres ». Un groupe où quelques-uns se détachent et un groupe de moyens réguliers peuvent afficher la même moyenne sans se ressembler du tout — et dans la nature, notent les auteurs, quelques individus apprenant plus vite s'en tireraient peut-être mieux, même si cela n'a pas été testé. Szabo et Ringler lisent tout cela comme un appui partiel et inégal à la vieille idée selon laquelle la vie sociale façonne l'esprit : un petit effet, à quelques endroits, dans un seul groupe captif de vingt.</p>
<p>La distinction mérite d'être emportée au-delà des geckos. Quand nous demandons si une école, une enfance, une équipe ont « façonné » quelqu'un, nous parlons presque toujours de la moyenne — est-ce que cela a rendu les gens meilleurs. Mais un environnement peut laisser sa marque la plus nette ailleurs : dans l'écart final entre les personnes, et sur un trait étroit plutôt que sur la personne entière. Deux groupes peuvent partager une moyenne et avoir été construits très différemment. Alors la prochaine fois que vous voudrez savoir ce qu'a fait un environnement précoce, ne demandez pas seulement quel côté l'a emporté. Demandez qui s'est retrouvé plus semblable et qui plus dispersé — et quelle chose, une seule, a réellement bougé.</p>$body$,
  $t$Qu'est-ce que grandir ensemble change vraiment ? | ONE EIGHT Journal$t$,
  $ex$Élevez un gecko seul, ou avec sa famille, puis testez-le. À presque tous les tests, les deux ont obtenu la même chose — et la seule vraie différence n'est pas celle que l'on attend$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- it
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-growing-up-together-changes')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'it',
  $t$Che cosa cambia davvero crescere insieme?$t$,
  $ex$Alleva un geco da solo, o con la sua famiglia, e poi mettilo alla prova. In quasi tutti i test i due hanno ottenuto lo stesso risultato — e l'unica differenza vera non è quella che ci si aspetta$ex$,
  $body$<p>Diamo per scontato che il modo in cui si viene cresciuti lasci un segno chiaro. Alleva un animale da solo e un altro con la sua famiglia, e ti aspetti che vengano su visibilmente diversi: il solitario più diffidente, forse, o quello che ha avuto compagnia un po' più sveglio. Dietro c'è un'immagine semplice: l'ambiente sposta la media, in una direzione che sai nominare.</p>
<p>Birgit Szabo ed Eva Ringler hanno messo alla prova quell'immagine sul geco tokay (<em>Gekko gecko</em>), un animale che raramente pensiamo plasmato dalla compagnia. Ne hanno fatti schiudere venti. Sette sono stati allontanati alla nascita e cresciuti da soli; tredici sono rimasti con i genitori, a volte con un fratello, per sei mesi. Poi tutti hanno vissuto da soli per un mese, così che i test misurassero l'allevamento e non la sistemazione del momento. Verso i sette mesi di età sono cominciate le prove. L'idea messa alla prova ha un nome: l'ipotesi dell'intelligenza sociale, l'affermazione che vivere tra altri costruisca una mente più acuta. È stata sostenuta soprattutto a partire da mammiferi e uccelli; un geco è un posto strano dove andarla a cercare.</p>
<p>I test erano semplici. Un geco si sarebbe ancora lanciato su un grillo con accanto un oggetto sconosciuto — un rotolo di carta igienica, un portauova? Quanto ci avrebbe messo a uscire da una scatola coperta per entrare in una vasca sconosciuta? Poteva imparare che toccare una carta contrassegnata — un triangolo bianco, strisce bianche e nere — significava un grillo nascosto sotto? Ogni prova è durata più giorni.</p>
<p>In quasi tutte le misure i due gruppi hanno ottenuto lo stesso risultato. Solitari o cresciuti in famiglia, i gechi diffidavano dell'oggetto sconosciuto più o meno allo stesso modo, esploravano la vasca nuova più o meno quanto gli altri e imparavano la carta più o meno alla stessa velocità. "La compagnia ti rende più audace, o più rapido" non è comparso. Le medie sono rimaste allineate.</p>
<p>Due differenze però sono emerse, ed entrambe sfuggono facilmente, perché nessuna delle due riguarda la media. La prima sta nel test di apprendimento. I gechi cresciuti in famiglia erano molto più disomogenei dei solitari: alcuni hanno imparato la carta in fretta, altri quasi per niente. I gechi cresciuti da soli stavano stretti insieme: tutti nella media, nessuno che spiccasse in una direzione o nell'altra. Stessa media, dispersione del tutto diversa. La seconda sta nella vasca nuova. I gechi cresciuti in famiglia sono stati più lenti a uscire dalla scatola e a entrarci. Non più audaci: più esitanti. Crescere sotto sorveglianza sembra averli lasciati più diffidenti verso lo spazio aperto e sconosciuto, non più pronti ad affrontarlo. E "audace" si è rivelato non essere una cosa sola: un geco che non si scomponeva davanti all'oggetto sconosciuto era spesso proprio quello che si tirava indietro davanti alla vasca nuova. Il coraggio in una situazione non si trasferiva all'altra.</p>
<p>Dunque l'allevamento un segno l'ha lasciato, solo non del tipo che andiamo a cercare. Controlliamo se un gruppo ne è uscito meglio o peggio in media, e qui la media si è mossa appena. A muoversi è stato quanto gli individui differissero l'uno dall'altro, e una cosa precisa: la loro disponibilità a inoltrarsi in uno spazio nuovo. La frase onesta non è "crescere in famiglia li ha resi più intelligenti". È "crescere in famiglia li ha resi meno simili tra loro". Un gruppo con qualche individuo che spicca e un gruppo di stabili individui nella media possono registrare la stessa media e non somigliarsi affatto — e in natura, notano gli autori, qualche individuo che impara più in fretta potrebbe cavarsela meglio, anche se questo non è stato verificato. Szabo e Ringler leggono tutto ciò come un sostegno parziale e a macchie alla vecchia idea che la vita sociale plasmi la mente: un effetto piccolo, in pochi punti, in un solo gruppo in cattività di venti individui.</p>
<p>La distinzione vale la pena portarla oltre i gechi. Quando ci chiediamo se una scuola, un'infanzia, una squadra abbiano "formato" qualcuno, intendiamo quasi sempre la media: se abbiano reso le persone migliori. Ma un ambiente può lasciare il suo segno più netto altrove: in quanto le persone finiscano per distanziarsi le une dalle altre, e su un tratto ristretto anziché sulla persona intera. Due gruppi possono condividere una media ed essere stati costruiti in modi molto diversi. Perciò la prossima volta che vorrai sapere che cosa ha fatto un ambiente precoce, non chiedere soltanto quale parte sia venuta avanti. Chiedi chi è diventato più simile e chi più disperso — e quale singola cosa si sia mossa davvero.</p>$body$,
  $t$Che cosa cambia davvero crescere insieme? | ONE EIGHT Journal$t$,
  $ex$Alleva un geco da solo, o con la sua famiglia, e poi mettilo alla prova. In quasi tutti i test i due hanno ottenuto lo stesso risultato — e l'unica differenza vera non è quella che ci si aspetta$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. journal_article_references
-- ─────────────────────────────────────────────────────────────────────────────
WITH article AS (
  SELECT id FROM public.journal_articles WHERE slug = 'what-growing-up-together-changes'
),
del AS (
  DELETE FROM public.journal_article_references
  WHERE article_id = (SELECT id FROM article)
  RETURNING 1
)
INSERT INTO public.journal_article_references (article_id, sort_order, ref_text, doi, url)
SELECT
  a.id,
  1,
  'Szabo, Birgit, and Eva Ringler. "Does the Post-Natal Social Environment Influence Cognitive Development in a Social Gecko?" Ecology and Evolution 15, no. 6 (2025): e71560.',
  '10.1002/ece3.71560',
  'https://doi.org/10.1002/ece3.71560'
FROM article a;

COMMIT;

-- =============================================================================
-- END
-- =============================================================================
