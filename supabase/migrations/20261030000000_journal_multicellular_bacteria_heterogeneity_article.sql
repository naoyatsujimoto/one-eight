-- =============================================================================
-- 20261030000000_journal_multicellular_bacteria_heterogeneity_article.sql
-- 記事: oej-2026-multicellular-bacteria-heterogeneity / what-makes-many-cells-one-body
-- 言語: en / ja / zh-Hant / zh-Hans / ko / es / pt-BR / de / fr / it
-- 適用: supabase db push (via migration)
-- 出典: approved/oej-2026-multicellular-bacteria-heterogeneity_what-makes-many-cells-one-body_APPROVED_multilingual.md
-- 注記: 承認済み tags 7件を逐語・原順で登録する。
--       region_category「北米（米国）」と
--       field_category「生物学（微生物学／多細胞性・分化）」に対応する列は
--       journal スキーマに存在しないため、この migration では列を追加せず保持しない。
--       原論文は PLOS Biology 22(7):e3002638（published 2024-07-11, license CC0 1.0）。
--       帰属表示は References に保持する。
--       本文は遺伝的・代謝的な不均一性を分業の証明として主張しない。
--       Approved 稿の留保をそのまま保持する。
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
  approved_at,
  published_at,
  archived_at
)
VALUES (
  'what-makes-many-cells-one-body',
  'published',
  'ONE EIGHT Journal',
  ARRAY['microbiology','multicellularity','magnetotactic bacteria','genetic heterogeneity','division of labour','single-cell analysis','nanoSIMS'],
  '2026-10-30 11:51:25+09:00',
  '2026-10-30 00:00:00+09:00',
  NULL
)
ON CONFLICT (slug) DO UPDATE
  SET
    status       = EXCLUDED.status,
    author_label = EXCLUDED.author_label,
    tags         = EXCLUDED.tags,
    approved_at  = EXCLUDED.approved_at,
    published_at = EXCLUDED.published_at,
    archived_at  = EXCLUDED.archived_at,
    updated_at   = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. journal_article_translations (10 languages)
-- ─────────────────────────────────────────────────────────────────────────────

-- en
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-makes-many-cells-one-body')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'en',
  $t$What Makes Many Cells One Body?$t$,
  $ex$A bacterium that is never a single cell turns out not to be a colony of clones. The cells sharing one body carry different genomes — and they do not all eat at the same rate$ex$,
  $body$<p>A body made of many cells is a body made of copies. Whatever else separates a liver cell from a skin cell, they carry the same genome; they are one organism because they are, genetically, one thing in different uniforms. We take this for granted. Being a single body means being a single genome.</p>
<p>In the mud of Little Sippewissett Salt Marsh, on Cape Cod, lives something that does not fit the frame. Multicellular magnetotactic bacteria are, as far as anyone knows, the only bacteria with no single-cell stage at all — never one cell, at any point in the life cycle. A consortium is a ball of between fifteen and eighty-six cells, three to twelve micrometres across, arranged in a single layer around a hollow centre. Each cell carries tiny crystals of magnetic mineral, and the whole ball swims along the Earth's magnetic field lines. To reproduce, the ball grows and splits in two.</p>
<p>Because they divide as a unit, it was assumed the cells inside were clones. Nobody had checked one ball at a time.</p>
<p>George Schaible, Roland Hatzenpichler and colleagues did. They pulled consortia out of the sediment with magnets, sequenced twenty-two of them individually, and counted the genetic differences inside each one. A genuinely clonal control — cells of a lab bacterium — showed about five single-letter differences. The magnetotactic consortia showed between 157 and 789. The cells sharing one body were not copies of each other.</p>
<p>Then they asked whether the cells behaved alike. They fed the sediment acetate labelled with heavy carbon and measured, cell by cell, who took it up. Within a single consortium, uptake was uneven: some cells were hotspots, others barely fed. A separate tag for newly built protein showed the same unevenness — in all fifty-seven consortia examined, a gradient of protein-building running around the hollow centre. The cells were not only genetically different. They were working at different rates.</p>
<p>It is tempting to call that a division of labour: some cells eating, then passing resources through the hollow middle. The authors raise the possibility and then decline to claim it. The genetic differences are scattered across genes with no pattern suggesting assigned roles — which is what ordinary copying errors look like, not specialisation. These bacteria cannot be grown in a lab. There is no way yet to read which genes each cell is actually running, and no evidence of the channels that sharing would require. That the cells differ, they can show. That the differences are organised, they cannot.</p>
<p>Even unresolved, it moves something. "One body, one genome" feels necessary to us because we generalise from ourselves and from the animals and plants we can see. Here is an organism more committed to multicellularity than we are — it has no solitary stage at all — and it is genetically mixed on the inside. Being one unit does not require being one genome. Whatever holds this ball together, it is not sameness.</p>
<p>None of which is a claim about how our own multicellularity started. The authors do not make one, and a salt-marsh bacterium is not a step in anyone's ancestry. The useful piece is smaller. The next time something looks like a single individual — a body, a colony, a crew — what makes it one thing is worth asking separately from whether its parts are alike. We tend to answer both at once, and let the second stand in for the first.</p>$body$,
  $t$What Makes Many Cells One Body? | ONE EIGHT Journal$t$,
  $ex$A bacterium that is never a single cell turns out not to be a colony of clones. The cells sharing one body carry different genomes — and they do not all eat at the same rate$ex$,
  true
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ja
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-makes-many-cells-one-body')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'ja',
  $t$多くの細胞を、一つの体にしているものは何か$t$,
  $ex$一度も単細胞にならない細菌は、クローンの集まりではなかった。一つの体を分け合う細胞は、それぞれ違うゲノムを持ち、食べる速さも同じではない$ex$,
  $body$<p>多くの細胞でできた体は、コピーでできた体だ。肝臓の細胞と皮膚の細胞を何が隔てていようと、両者は同じゲノムを持つ。遺伝的には一つのものが別の制服を着ているだけだから、一つの生き物なのだ。私たちはそれを当然だと思っている。一つの体であるとは、一つのゲノムであることだ、と。</p>
<p>ケープコッドのリトル・シッペウィセット塩性湿地の泥のなかに、その枠に収まらないものがいる。多細胞磁性細菌は、知られているかぎり、単細胞の時期をまったく持たない唯一の細菌だ。生活環のどの時点でも、一つの細胞にならない。その集合体は、十五個から八十六個の細胞でできた球で、差し渡し三〜十二マイクロメートル、細胞は一層に並んで中央の空洞を取り囲む。どの細胞も磁性鉱物の微小な結晶を抱え、球ごと地球の磁力線に沿って泳ぐ。増えるときは、球のまま大きくなって二つに割れる。</p>
<p>一つのまとまりとして分裂するのだから、なかの細胞はクローンだろう——そう見なされてきた。球を一つずつ確かめた者はいなかった。</p>
<p>George Schaible と Roland Hatzenpichler らが、それをやった。磁石で集合体を泥から引き出し、二十二個を個別に解読して、それぞれの内部の遺伝的な違いを数えた。正真正銘のクローンである対照——実験室の細菌の細胞——では、一文字の違いはおよそ五つだった。磁性細菌の集合体では、157から789あった。一つの体を分け合う細胞たちは、互いのコピーではなかった。</p>
<p>次に彼らは、細胞がふるまいの上でも同じかを問うた。重い炭素で標識した酢酸を泥に与え、どの細胞が取り込むかを一細胞ずつ測った。一つの集合体のなかで、取り込みは不ぞろいだった。よく取り込む細胞もあれば、ほとんど食べない細胞もある。新しく作られたタンパク質を示す別の標識でも、同じ不ぞろいが出た。調べた五十七個すべての集合体で、中央の空洞を取り巻くように、タンパク質を作る勢いの勾配があったのだ。細胞は遺伝的に違うだけではない。働く速さも違っていた。</p>
<p>これを分業と呼びたくなる。ある細胞が食べ、中央の空洞を通して分け合う、というふうに。著者らはその可能性を挙げ、そして主張することは控える。遺伝的な違いは遺伝子のあちこちに散らばり、役割分担を思わせる型がない——それは専門化ではなく、ありふれた複製の写し間違いの姿だ。この細菌は培養できない。どの細胞がいまどの遺伝子を動かしているかを読む手段はまだなく、分け合いに必要な通路の証拠もない。細胞が違うことは示せる。その違いが組織されていることは、示せない。</p>
<p>決着がつかないままでも、これは何かを動かす。「一つの体なら一つのゲノム」が必然に感じられるのは、私たちが自分自身と、目に見える動植物から一般化しているからだ。ここにいるのは、私たちより多細胞であることに徹した生き物——単独の時期をまったく持たない——でありながら、内側は遺伝的に混ざっている。一つのまとまりであることは、一つのゲノムであることを要求しない。この球をまとめているものが何であれ、それは同一性ではない。</p>
<p>とはいえ、これは私たち自身の多細胞化がどう始まったかについての主張ではない。著者らもそう述べていないし、塩性湿地の細菌は誰かの祖先の一段階ではない。持ち帰る値打ちがあるのは、もっと小さいことだ。次に何かが一つの個体に見えるとき——体でも、集団でも、チームでも——それを一つのものにしているのは何か、という問いは、その部分どうしが似ているかどうかとは切り離して問う値打ちがある。私たちはたいてい両方をまとめて答え、後者に前者を代弁させてしまう。</p>$body$,
  $t$多くの細胞を、一つの体にしているものは何か | ONE EIGHT Journal$t$,
  $ex$一度も単細胞にならない細菌は、クローンの集まりではなかった。一つの体を分け合う細胞は、それぞれ違うゲノムを持ち、食べる速さも同じではない$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- zh-Hant
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-makes-many-cells-one-body')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'zh-Hant',
  $t$是什麼讓許多細胞成為一個身體？$t$,
  $ex$一種從來不曾是單一細胞的細菌，結果並不是一群複製品。分享同一個身體的細胞帶著不同的基因組——而且它們進食的速度也並不一致$ex$,
  $body$<p>由許多細胞構成的身體，是由複本構成的身體。無論還有什麼把肝臟細胞和皮膚細胞區分開來，它們帶的是同一份基因組；它們之所以是同一個生物，是因為在遺傳上它們是同一樣東西，只是穿著不同的制服。我們把這件事視為理所當然。身為單一個身體，就意味著身為單一份基因組。</p>
<p>在鱈魚角的小西佩威塞特鹽沼的泥裡，住著某種不合這個框架的東西。多細胞趨磁細菌，就目前所知，是唯一完全沒有單細胞階段的細菌——在生活史的任何一個時點，都不會是一個細胞。一個集合體是一顆由十五到八十六個細胞組成的球，直徑三到十二微米，細胞排成單層，圍著一個中空的中心。每個細胞都帶著磁性礦物的微小晶體，整顆球沿著地球的磁力線游動。要繁殖時，這顆球長大，然後一分為二。</p>
<p>既然它們是作為一個整體分裂的，人們便假定裡頭的細胞是複製品。沒有人一顆一顆地去查過。</p>
<p>George Schaible、Roland Hatzenpichler 與同事們去查了。他們用磁鐵把集合體從沉積物裡吸出來，逐一定序了其中二十二顆，並清點每一顆內部的遺傳差異。一個真正的克隆對照——一種實驗室細菌的細胞——顯示出大約五個單字母的差異。而那些趨磁細菌的集合體顯示出一百五十七到七百八十九個。分享同一個身體的細胞，並不是彼此的複本。</p>
<p>接著他們問，這些細胞的行為是否一致。他們給沉積物餵了以重碳標記的乙酸鹽，並逐個細胞測量誰把它吸收進去。在同一顆集合體之內，吸收是不均勻的：有些細胞是熱點，有些則幾乎沒進食。另一個標記新合成蛋白質的方法顯示出同樣的不均勻——在所檢視的全部五十七顆集合體裡，都有一道環繞著中空中心的蛋白質合成梯度。這些細胞不只是在遺傳上不同。它們工作的速度也不同。</p>
<p>很容易就想把那稱為分工：某些細胞進食，然後透過中空的中間把資源傳遞出去。作者們提出了這個可能性，然後克制自己不去宣稱它。那些遺傳差異散落在各個基因上，沒有任何型態足以暗示有被指派的角色——而那正是尋常的複製錯誤看起來的樣子，不是專門化。這些細菌無法在實驗室裡培養。目前還沒有辦法讀出每一個細胞實際上正在運作哪些基因，也沒有分享所需要的那些通道的證據。細胞彼此不同，他們能夠指出來。至於這些差異是被組織起來的，他們無法指出。</p>
<p>即使懸而未決，這件事仍然推動了什麼。「一個身體，一份基因組」之所以讓我們覺得是必然的，是因為我們從自己身上、從看得見的動物與植物身上做了一般化。而這裡有一種比我們更徹底投入多細胞性的生物——它完全沒有獨居的階段——內部卻是遺傳上混雜的。身為一個單位，並不要求身為一份基因組。無論是什麼把這顆球維繫在一起，那都不是同一性。</p>
<p>以上這些都不是關於我們自身的多細胞性如何開始的主張。作者們並未提出這樣的主張，而一種鹽沼細菌也不是任何人祖譜上的一個階段。真正有用的部分比較小。下一次，當某樣東西看起來像是單一個體時——一個身體、一個群落、一支隊伍——究竟是什麼讓它成為一個東西，這個問題值得與「它的各部分是否相像」分開來問。我們往往把兩者一併回答，並且讓後者頂替了前者。</p>$body$,
  $t$是什麼讓許多細胞成為一個身體？ | ONE EIGHT Journal$t$,
  $ex$一種從來不曾是單一細胞的細菌，結果並不是一群複製品。分享同一個身體的細胞帶著不同的基因組——而且它們進食的速度也並不一致$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- zh-Hans
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-makes-many-cells-one-body')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'zh-Hans',
  $t$是什么让许多细胞成为一个身体？$t$,
  $ex$一种从来不曾是单一细胞的细菌，结果并不是一群复制品。分享同一个身体的细胞带着不同的基因组——而且它们进食的速度也并不一致$ex$,
  $body$<p>由许多细胞构成的身体，是由复本构成的身体。无论还有什么把肝脏细胞和皮肤细胞区分开来，它们带的是同一份基因组；它们之所以是同一个生物，是因为在遗传上它们是同一样东西，只是穿着不同的制服。我们把这件事视为理所当然。身为单一个身体，就意味着身为单一份基因组。</p>
<p>在科德角的小西佩威塞特盐沼的泥里，住着某种不合这个框架的东西。多细胞趋磁细菌，就目前所知，是唯一完全没有单细胞阶段的细菌——在生活史的任何一个时点，都不会是一个细胞。一个集合体是一颗由十五到八十六个细胞组成的球，直径三到十二微米，细胞排成单层，围着一个中空的中心。每个细胞都带着磁性矿物的微小晶体，整颗球沿着地球的磁力线游动。要繁殖时，这颗球长大，然后一分为二。</p>
<p>既然它们是作为一个整体分裂的，人们便假定里头的细胞是复制品。没有人一颗一颗地去查过。</p>
<p>George Schaible、Roland Hatzenpichler 与同事们去查了。他们用磁铁把集合体从沉积物里吸出来，逐一测序了其中二十二颗，并清点每一颗内部的遗传差异。一个真正的克隆对照——一种实验室细菌的细胞——显示出大约五个单字母的差异。而那些趋磁细菌的集合体显示出一百五十七到七百八十九个。分享同一个身体的细胞，并不是彼此的复本。</p>
<p>接着他们问，这些细胞的行为是否一致。他们给沉积物喂了以重碳标记的乙酸盐，并逐个细胞测量谁把它吸收进去。在同一颗集合体之内，吸收是不均匀的：有些细胞是热点，有些则几乎没进食。另一个标记新合成蛋白质的方法显示出同样的不均匀——在所检视的全部五十七颗集合体里，都有一道环绕着中空中心的蛋白质合成梯度。这些细胞不只是在遗传上不同。它们工作的速度也不同。</p>
<p>很容易就想把那称为分工：某些细胞进食，然后透过中空的中间把资源传递出去。作者们提出了这个可能性，然后克制自己不去宣称它。那些遗传差异散落在各个基因上，没有任何形态足以暗示有被指派的角色——而那正是寻常的复制错误看起来的样子，不是专门化。这些细菌无法在实验室里培养。目前还没有办法读出每一个细胞实际上正在运作哪些基因，也没有分享所需要的那些通道的证据。细胞彼此不同，他们能够指出来。至于这些差异是被组织起来的，他们无法指出。</p>
<p>即使悬而未决，这件事仍然推动了什么。“一个身体，一份基因组”之所以让我们觉得是必然的，是因为我们从自己身上、从看得见的动物与植物身上做了一般化。而这里有一种比我们更彻底投入多细胞性的生物——它完全没有独居的阶段——内部却是遗传上混杂的。身为一个单位，并不要求身为一份基因组。无论是什么把这颗球维系在一起，那都不是同一性。</p>
<p>以上这些都不是关于我们自身的多细胞性如何开始的主张。作者们并未提出这样的主张，而一种盐沼细菌也不是任何人族谱上的一个阶段。真正有用的部分比较小。下一次，当某样东西看起来像是单一个体时——一个身体、一个群落、一支队伍——究竟是什么让它成为一个东西，这个问题值得与“它的各部分是否相像”分开来问。我们往往把两者一并回答，并且让后者顶替了前者。</p>$body$,
  $t$是什么让许多细胞成为一个身体？ | ONE EIGHT Journal$t$,
  $ex$一种从来不曾是单一细胞的细菌，结果并不是一群复制品。分享同一个身体的细胞带着不同的基因组——而且它们进食的速度也并不一致$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ko
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-makes-many-cells-one-body')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'ko',
  $t$많은 세포를 하나의 몸으로 만드는 것은 무엇인가$t$,
  $ex$한 번도 단세포인 적이 없는 세균은 알고 보니 복제품들의 모임이 아니었다. 하나의 몸을 나누어 쓰는 세포들은 서로 다른 유전체를 지니고 있고, 먹는 속도도 모두 같지는 않다$ex$,
  $body$<p>많은 세포로 이루어진 몸은 사본으로 이루어진 몸이다. 간세포와 피부세포를 가르는 것이 그 밖에 무엇이든, 둘은 같은 유전체를 지닌다. 유전적으로는 하나인 것이 서로 다른 제복을 입고 있을 뿐이기에 하나의 생물인 것이다. 우리는 이것을 당연하게 여긴다. 하나의 몸이라는 것은 하나의 유전체라는 뜻이라고.</p>
<p>케이프코드의 리틀 시퍼위싯 염습지 진흙 속에, 그 틀에 들어맞지 않는 것이 산다. 다세포 주자성세균은 알려진 한, 단세포 단계를 아예 갖지 않는 유일한 세균이다. 생활사의 어느 시점에도 하나의 세포가 되지 않는다. 한 군집체는 열다섯에서 여든여섯 개의 세포로 이루어진 공으로, 지름은 3에서 12마이크로미터이며, 세포들은 한 겹으로 늘어서 속이 빈 중심을 둘러싼다. 세포마다 자성 광물의 작은 결정을 품고 있고, 공 전체가 지구 자기력선을 따라 헤엄친다. 번식할 때는 공째로 자라나 둘로 갈라진다.</p>
<p>하나의 단위로 분열하니 그 안의 세포들은 복제품이려니 여겨져 왔다. 공을 하나씩 확인해 본 사람은 없었다.</p>
<p>George Schaible와 Roland Hatzenpichler, 그리고 동료들이 그것을 했다. 그들은 자석으로 군집체를 퇴적물에서 끌어내어 스물두 개를 하나씩 해독하고, 각각의 내부에 있는 유전적 차이를 셈했다. 진짜로 클론인 대조군 — 실험실 세균의 세포들 — 은 한 글자짜리 차이를 약 다섯 개 보였다. 주자성세균 군집체는 157개에서 789개를 보였다. 하나의 몸을 나누어 쓰는 세포들은 서로의 사본이 아니었다.</p>
<p>이어 그들은 세포들이 행동도 같은지를 물었다. 무거운 탄소로 표지한 아세트산을 퇴적물에 먹이고, 누가 그것을 받아들이는지를 세포 하나하나 측정했다. 한 군집체 안에서 흡수는 고르지 않았다. 어떤 세포는 집중적으로 받아들였고, 어떤 세포는 거의 먹지 않았다. 새로 만들어진 단백질을 가리키는 별도의 표지도 같은 불균등을 보여 주었다 — 살펴본 쉰일곱 개 군집체 전부에서, 속이 빈 중심을 둘러싸고 단백질 합성의 기울기가 나타났다. 세포들은 유전적으로만 다른 것이 아니었다. 일하는 속도도 달랐다.</p>
<p>그것을 분업이라 부르고 싶어진다. 어떤 세포가 먹고, 속이 빈 가운데를 통해 자원을 넘겨준다는 식으로. 저자들은 그 가능성을 꺼내 놓고는, 그것을 주장하기를 삼간다. 유전적 차이는 여러 유전자에 흩어져 있고, 역할이 배정되었음을 시사하는 어떤 양상도 없다 — 그것은 전문화가 아니라 흔한 복제 오류의 모습이다. 이 세균은 실험실에서 기를 수 없다. 각 세포가 실제로 어떤 유전자를 돌리고 있는지 읽어 낼 방법이 아직 없고, 나눔에 필요한 통로의 증거도 없다. 세포들이 서로 다르다는 것은 보여 줄 수 있다. 그 차이가 조직되어 있다는 것은, 보여 줄 수 없다.</p>
<p>결론이 나지 않은 채로도 이것은 무언가를 움직인다. '하나의 몸이면 하나의 유전체'가 우리에게 필연처럼 느껴지는 것은, 우리가 우리 자신으로부터, 그리고 눈에 보이는 동물과 식물로부터 일반화하기 때문이다. 여기 우리보다 더 철저하게 다세포성에 몸담은 생물이 있다 — 홀로 지내는 단계가 아예 없다 — 그런데 그 안쪽은 유전적으로 섞여 있다. 하나의 단위라는 것이 하나의 유전체일 것을 요구하지는 않는다. 이 공을 붙들어 두고 있는 것이 무엇이든, 그것은 같음이 아니다.</p>
<p>그렇다고 이것이 우리 자신의 다세포성이 어떻게 시작되었는지에 대한 주장인 것은 아니다. 저자들도 그런 주장을 하지 않으며, 염습지의 세균은 누군가의 계보에 놓인 한 단계가 아니다. 쓸모 있는 대목은 더 작다. 다음번에 무언가가 하나의 개체처럼 보일 때 — 한 몸이든, 한 군락이든, 한 팀이든 — 무엇이 그것을 하나로 만드는가 하는 물음은, 그 부분들이 서로 닮았는지와는 떼어서 물어볼 값이 있다. 우리는 대개 둘을 한꺼번에 대답하고, 뒤의 것으로 앞의 것을 대신하게 한다.</p>$body$,
  $t$많은 세포를 하나의 몸으로 만드는 것은 무엇인가 | ONE EIGHT Journal$t$,
  $ex$한 번도 단세포인 적이 없는 세균은 알고 보니 복제품들의 모임이 아니었다. 하나의 몸을 나누어 쓰는 세포들은 서로 다른 유전체를 지니고 있고, 먹는 속도도 모두 같지는 않다$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- es
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-makes-many-cells-one-body')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'es',
  $t$¿Qué hace que muchas células sean un solo cuerpo?$t$,
  $ex$Una bacteria que nunca es una sola célula resulta no ser una colonia de clones. Las células que comparten un mismo cuerpo llevan genomas distintos, y no todas comen al mismo ritmo$ex$,
  $body$<p>Un cuerpo hecho de muchas células es un cuerpo hecho de copias. Sea lo que sea lo demás que separa a una célula del hígado de una de la piel, ambas llevan el mismo genoma; son un solo organismo porque son, genéticamente, una misma cosa con distintos uniformes. Lo damos por sentado. Ser un solo cuerpo significa ser un solo genoma.</p>
<p>En el fango de la marisma de Little Sippewissett, en Cape Cod, vive algo que no encaja en ese marco. Las bacterias magnetotácticas multicelulares son, por lo que se sabe, las únicas bacterias sin ninguna etapa unicelular: nunca una sola célula, en ningún momento del ciclo de vida. Un consorcio es una bola de entre quince y ochenta y seis células, de tres a doce micrómetros de diámetro, dispuestas en una sola capa alrededor de un centro hueco. Cada célula lleva diminutos cristales de mineral magnético, y la bola entera nada siguiendo las líneas del campo magnético terrestre. Para reproducirse, la bola crece y se parte en dos.</p>
<p>Como se dividen en bloque, se suponía que las células de dentro eran clones. Nadie había mirado bola por bola.</p>
<p>George Schaible, Roland Hatzenpichler y sus colegas lo hicieron. Sacaron consorcios del sedimento con imanes, secuenciaron veintidós de ellos por separado y contaron las diferencias genéticas dentro de cada uno. Un control genuinamente clonal —células de una bacteria de laboratorio— mostró unas cinco diferencias de una sola letra. Los consorcios magnetotácticos mostraron entre 157 y 789. Las células que comparten un mismo cuerpo no eran copias unas de otras.</p>
<p>Después preguntaron si las células se comportaban igual. Alimentaron el sedimento con acetato marcado con carbono pesado y midieron, célula a célula, quién lo incorporaba. Dentro de un mismo consorcio, la incorporación era desigual: algunas células eran puntos calientes, otras apenas comían. Un marcaje distinto, para proteína recién fabricada, mostró la misma desigualdad: en los cincuenta y siete consorcios examinados, un gradiente de fabricación de proteína recorriendo el contorno del centro hueco. Las células no solo eran genéticamente distintas. Trabajaban a ritmos distintos.</p>
<p>Es tentador llamar a eso división del trabajo: unas células comen y luego pasan recursos a través del hueco central. Los autores plantean la posibilidad y luego se abstienen de afirmarla. Las diferencias genéticas están repartidas por los genes sin ningún patrón que sugiera papeles asignados, que es el aspecto que tienen los errores de copia corrientes, no la especialización. Estas bacterias no pueden cultivarse en el laboratorio. Todavía no hay forma de leer qué genes está ejecutando realmente cada célula, ni hay pruebas de los canales que exigiría ese reparto. Que las células difieren, pueden demostrarlo. Que las diferencias están organizadas, no.</p>
<p>Aun sin resolverse, algo mueve. "Un cuerpo, un genoma" nos parece necesario porque generalizamos a partir de nosotros mismos y de los animales y plantas que alcanzamos a ver. Aquí hay un organismo más comprometido con la multicelularidad que nosotros —no tiene ninguna etapa solitaria— y por dentro está genéticamente mezclado. Ser una unidad no exige ser un genoma. Sea lo que sea lo que mantiene unida esta bola, no es la igualdad.</p>
<p>Nada de esto es una afirmación sobre cómo empezó nuestra propia multicelularidad. Los autores no la hacen, y una bacteria de marisma no es un paso en la ascendencia de nadie. La pieza útil es más pequeña. La próxima vez que algo parezca un solo individuo —un cuerpo, una colonia, una tripulación—, vale la pena preguntar qué lo hace una sola cosa por separado de si sus partes se parecen. Solemos responder ambas a la vez, y dejar que la segunda haga las veces de la primera.</p>$body$,
  $t$¿Qué hace que muchas células sean un solo cuerpo? | ONE EIGHT Journal$t$,
  $ex$Una bacteria que nunca es una sola célula resulta no ser una colonia de clones. Las células que comparten un mismo cuerpo llevan genomas distintos, y no todas comen al mismo ritmo$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- pt-BR
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-makes-many-cells-one-body')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'pt-BR',
  $t$O que faz de muitas células um só corpo?$t$,
  $ex$Uma bactéria que nunca é uma única célula acaba não sendo uma colônia de clones. As células que dividem um mesmo corpo carregam genomas diferentes — e não comem todas no mesmo ritmo$ex$,
  $body$<p>Um corpo feito de muitas células é um corpo feito de cópias. Seja lá o que mais separe uma célula do fígado de uma da pele, as duas carregam o mesmo genoma; são um só organismo porque são, geneticamente, uma mesma coisa em uniformes diferentes. Tomamos isso como dado. Ser um único corpo significa ser um único genoma.</p>
<p>Na lama do brejo salgado de Little Sippewissett, em Cape Cod, vive algo que não cabe nesse quadro. As bactérias magnetotáticas multicelulares são, até onde se sabe, as únicas bactérias sem nenhuma etapa unicelular — nunca uma só célula, em momento algum do ciclo de vida. Um consórcio é uma bola de quinze a oitenta e seis células, de três a doze micrômetros de diâmetro, dispostas em uma única camada ao redor de um centro oco. Cada célula carrega minúsculos cristais de mineral magnético, e a bola inteira nada seguindo as linhas do campo magnético da Terra. Para se reproduzir, a bola cresce e se parte em duas.</p>
<p>Como se dividem como um bloco, supunha-se que as células de dentro fossem clones. Ninguém havia conferido uma bola de cada vez.</p>
<p>George Schaible, Roland Hatzenpichler e colegas conferiram. Puxaram consórcios do sedimento com ímãs, sequenciaram vinte e dois deles individualmente e contaram as diferenças genéticas dentro de cada um. Um controle genuinamente clonal — células de uma bactéria de laboratório — apresentou cerca de cinco diferenças de uma única letra. Os consórcios magnetotáticos apresentaram entre 157 e 789. As células que dividem um mesmo corpo não eram cópias umas das outras.</p>
<p>Em seguida perguntaram se as células se comportavam igual. Alimentaram o sedimento com acetato marcado com carbono pesado e mediram, célula a célula, quem o absorvia. Dentro de um mesmo consórcio, a absorção era desigual: algumas células eram pontos quentes, outras mal comiam. Uma marcação separada, para proteína recém-construída, mostrou a mesma desigualdade — em todos os cinquenta e sete consórcios examinados, um gradiente de construção de proteína percorrendo o entorno do centro oco. As células não eram apenas geneticamente diferentes. Trabalhavam em ritmos diferentes.</p>
<p>É tentador chamar isso de divisão do trabalho: algumas células comendo e depois repassando recursos pelo meio oco. Os autores levantam a possibilidade e então se abstêm de afirmá-la. As diferenças genéticas estão espalhadas pelos genes sem nenhum padrão que sugira papéis atribuídos — que é a cara dos erros de cópia comuns, não da especialização. Essas bactérias não podem ser cultivadas em laboratório. Ainda não há como ler quais genes cada célula está de fato operando, nem evidência dos canais que esse compartilhamento exigiria. Que as células diferem, eles conseguem mostrar. Que as diferenças são organizadas, não conseguem.</p>
<p>Mesmo sem resolução, isso move alguma coisa. "Um corpo, um genoma" nos parece necessário porque generalizamos a partir de nós mesmos e dos animais e plantas que conseguimos ver. Aqui está um organismo mais comprometido com a multicelularidade do que nós — não tem etapa solitária nenhuma — e por dentro é geneticamente misturado. Ser uma unidade não exige ser um genoma. Seja lá o que mantém essa bola unida, não é a semelhança.</p>
<p>Nada disso é uma afirmação sobre como começou a nossa própria multicelularidade. Os autores não a fazem, e uma bactéria de brejo salgado não é um passo na ascendência de ninguém. A parte útil é menor. Da próxima vez que algo parecer um único indivíduo — um corpo, uma colônia, uma equipe —, vale perguntar o que o torna uma coisa só separadamente de se as suas partes se parecem. Costumamos responder às duas de uma vez, e deixar a segunda fazer as vezes da primeira.</p>$body$,
  $t$O que faz de muitas células um só corpo? | ONE EIGHT Journal$t$,
  $ex$Uma bactéria que nunca é uma única célula acaba não sendo uma colônia de clones. As células que dividem um mesmo corpo carregam genomas diferentes — e não comem todas no mesmo ritmo$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- de
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-makes-many-cells-one-body')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'de',
  $t$Was macht viele Zellen zu einem Körper?$t$,
  $ex$Ein Bakterium, das nie eine einzelne Zelle ist, erweist sich nicht als Kolonie von Klonen. Die Zellen, die sich einen Körper teilen, tragen verschiedene Genome — und sie fressen nicht alle gleich schnell$ex$,
  $body$<p>Ein Körper aus vielen Zellen ist ein Körper aus Kopien. Was eine Leberzelle sonst auch von einer Hautzelle trennen mag: Sie tragen dasselbe Genom; sie sind ein Organismus, weil sie genetisch ein und dasselbe sind, nur in verschiedenen Uniformen. Wir halten das für selbstverständlich. Ein einziger Körper zu sein heißt, ein einziges Genom zu sein.</p>
<p>Im Schlick der Salzmarsch Little Sippewissett auf Cape Cod lebt etwas, das nicht in diesen Rahmen passt. Vielzellige magnetotaktische Bakterien sind, soweit bekannt, die einzigen Bakterien ganz ohne einzelliges Stadium — nie eine einzelne Zelle, zu keinem Zeitpunkt des Lebenszyklus. Ein Konsortium ist eine Kugel aus fünfzehn bis sechsundachtzig Zellen, drei bis zwölf Mikrometer im Durchmesser, in einer einzigen Lage um einen hohlen Kern angeordnet. Jede Zelle trägt winzige Kristalle aus magnetischem Mineral, und die ganze Kugel schwimmt entlang der Feldlinien des Erdmagnetfelds. Zur Fortpflanzung wächst die Kugel und teilt sich in zwei.</p>
<p>Weil sie sich als Einheit teilen, nahm man an, die Zellen darin seien Klone. Niemand hatte Kugel für Kugel nachgesehen.</p>
<p>George Schaible, Roland Hatzenpichler und Kollegen taten es. Sie holten Konsortien mit Magneten aus dem Sediment, sequenzierten zweiundzwanzig davon einzeln und zählten die genetischen Unterschiede in jedem einzelnen. Eine wirklich klonale Kontrolle — Zellen eines Laborbakteriums — zeigte etwa fünf Unterschiede an einzelnen Buchstaben. Die magnetotaktischen Konsortien zeigten zwischen 157 und 789. Die Zellen, die sich einen Körper teilen, waren keine Kopien voneinander.</p>
<p>Dann fragten sie, ob sich die Zellen gleich verhalten. Sie fütterten das Sediment mit Acetat, das mit schwerem Kohlenstoff markiert war, und maßen Zelle für Zelle, wer es aufnahm. Innerhalb eines einzigen Konsortiums war die Aufnahme ungleichmäßig: Manche Zellen waren Hotspots, andere fraßen kaum. Eine gesonderte Markierung für frisch gebautes Protein zeigte dieselbe Ungleichmäßigkeit — in allen siebenundfünfzig untersuchten Konsortien ein Gefälle des Proteinaufbaus rund um den hohlen Kern. Die Zellen waren nicht nur genetisch verschieden. Sie arbeiteten auch unterschiedlich schnell.</p>
<p>Es liegt nahe, das Arbeitsteilung zu nennen: Manche Zellen fressen und geben Ressourcen durch die hohle Mitte weiter. Die Autoren bringen die Möglichkeit auf und verzichten dann darauf, sie zu behaupten. Die genetischen Unterschiede verteilen sich über die Gene, ohne ein Muster, das auf zugewiesene Rollen hindeutet — und genau so sehen gewöhnliche Kopierfehler aus, nicht Spezialisierung. Diese Bakterien lassen sich nicht im Labor züchten. Es gibt bislang keine Möglichkeit zu lesen, welche Gene jede Zelle tatsächlich laufen lässt, und keinen Beleg für die Kanäle, die ein Teilen voraussetzen würde. Dass die Zellen sich unterscheiden, können sie zeigen. Dass die Unterschiede organisiert sind, können sie nicht.</p>
<p>Auch ungeklärt bewegt das etwas. "Ein Körper, ein Genom" erscheint uns zwingend, weil wir von uns selbst und von den Tieren und Pflanzen verallgemeinern, die wir sehen können. Hier ist ein Organismus, der sich der Vielzelligkeit stärker verschrieben hat als wir — er hat gar kein Einzelstadium — und der innen genetisch gemischt ist. Eine Einheit zu sein verlangt nicht, ein Genom zu sein. Was auch immer diese Kugel zusammenhält, Gleichheit ist es nicht.</p>
<p>Nichts davon ist eine Aussage darüber, wie unsere eigene Vielzelligkeit begann. Die Autoren treffen keine, und ein Salzmarsch-Bakterium ist keine Stufe in irgendjemandes Ahnenreihe. Der brauchbare Teil ist kleiner. Wenn das nächste Mal etwas wie ein einzelnes Individuum aussieht — ein Körper, eine Kolonie, eine Mannschaft —, lohnt es sich, getrennt zu fragen, was es zu einer Sache macht, und ob seine Teile einander gleichen. Wir neigen dazu, beides auf einmal zu beantworten und das Zweite für das Erste einstehen zu lassen.</p>$body$,
  $t$Was macht viele Zellen zu einem Körper? | ONE EIGHT Journal$t$,
  $ex$Ein Bakterium, das nie eine einzelne Zelle ist, erweist sich nicht als Kolonie von Klonen. Die Zellen, die sich einen Körper teilen, tragen verschiedene Genome — und sie fressen nicht alle gleich schnell$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- fr
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-makes-many-cells-one-body')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'fr',
  $t$Qu'est-ce qui fait de nombreuses cellules un seul corps ?$t$,
  $ex$Une bactérie qui n'est jamais une cellule unique se révèle n'être pas une colonie de clones. Les cellules qui partagent un même corps portent des génomes différents — et elles ne mangent pas toutes au même rythme$ex$,
  $body$<p>Un corps fait de nombreuses cellules est un corps fait de copies. Quoi que sépare par ailleurs une cellule du foie d'une cellule de la peau, elles portent le même génome ; elles forment un seul organisme parce qu'elles sont, génétiquement, une même chose sous des uniformes différents. Cela nous paraît aller de soi. Être un seul corps, c'est être un seul génome.</p>
<p>Dans la vase du marais salé de Little Sippewissett, sur Cape Cod, vit quelque chose qui n'entre pas dans ce cadre. Les bactéries magnétotactiques multicellulaires sont, pour autant qu'on sache, les seules bactéries dépourvues de tout stade unicellulaire — jamais une cellule seule, à aucun moment du cycle de vie. Un consortium est une boule de quinze à quatre-vingt-six cellules, de trois à douze micromètres de diamètre, disposées en une seule couche autour d'un centre creux. Chaque cellule porte de minuscules cristaux de minéral magnétique, et la boule entière nage le long des lignes du champ magnétique terrestre. Pour se reproduire, la boule grossit et se fend en deux.</p>
<p>Comme elles se divisent d'un bloc, on supposait que les cellules du dedans étaient des clones. Personne n'avait vérifié boule par boule.</p>
<p>George Schaible, Roland Hatzenpichler et leurs collègues l'ont fait. Ils ont extrait des consortiums du sédiment à l'aimant, en ont séquencé vingt-deux séparément et ont compté les différences génétiques à l'intérieur de chacun. Un témoin véritablement clonal — des cellules d'une bactérie de laboratoire — montrait environ cinq différences d'une seule lettre. Les consortiums magnétotactiques en montraient entre 157 et 789. Les cellules qui partagent un même corps n'étaient pas des copies les unes des autres.</p>
<p>Ils ont ensuite demandé si les cellules se comportaient de la même façon. Ils ont nourri le sédiment d'acétate marqué au carbone lourd et ont mesuré, cellule par cellule, qui l'absorbait. Au sein d'un même consortium, l'absorption était inégale : certaines cellules étaient des points chauds, d'autres mangeaient à peine. Un autre marquage, pour les protéines fraîchement fabriquées, a révélé la même inégalité — dans les cinquante-sept consortiums examinés, un gradient de fabrication de protéines courant autour du centre creux. Les cellules n'étaient pas seulement génétiquement différentes. Elles travaillaient aussi à des rythmes différents.</p>
<p>Il est tentant d'appeler cela une division du travail : certaines cellules mangent, puis font passer des ressources par le creux central. Les auteurs soulèvent la possibilité, puis se gardent de l'affirmer. Les différences génétiques sont dispersées à travers les gènes, sans motif suggérant des rôles assignés — ce à quoi ressemblent des erreurs de copie ordinaires, non une spécialisation. Ces bactéries ne peuvent pas être cultivées en laboratoire. Il n'existe pas encore de moyen de lire quels gènes chaque cellule fait réellement tourner, ni de preuve des canaux qu'un tel partage exigerait. Que les cellules diffèrent, ils peuvent le montrer. Que les différences soient organisées, ils ne le peuvent pas.</p>
<p>Même non tranché, cela déplace quelque chose. « Un corps, un génome » nous semble nécessaire parce que nous généralisons à partir de nous-mêmes et des animaux et des plantes que nous pouvons voir. Voici un organisme plus engagé que nous dans la multicellularité — il n'a aucun stade solitaire — et qui est génétiquement mêlé à l'intérieur. Être une unité n'exige pas d'être un génome. Quoi qui tienne cette boule ensemble, ce n'est pas la similitude.</p>
<p>Rien de tout cela n'est une affirmation sur la façon dont notre propre multicellularité a commencé. Les auteurs n'en font pas, et une bactérie de marais salé n'est une étape dans l'ascendance de personne. Le morceau utile est plus modeste. La prochaine fois que quelque chose ressemblera à un individu unique — un corps, une colonie, un équipage —, il vaudra la peine de demander ce qui en fait une seule chose, séparément de la question de savoir si ses parties se ressemblent. Nous avons tendance à répondre aux deux d'un coup, et à laisser la seconde tenir lieu de la première.</p>$body$,
  $t$Qu'est-ce qui fait de nombreuses cellules un seul corps ? | ONE EIGHT Journal$t$,
  $ex$Une bactérie qui n'est jamais une cellule unique se révèle n'être pas une colonie de clones. Les cellules qui partagent un même corps portent des génomes différents — et elles ne mangent pas toutes au même rythme$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- it
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'what-makes-many-cells-one-body')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'it',
  $t$Che cosa rende molte cellule un solo corpo?$t$,
  $ex$Un batterio che non è mai una cellula sola si rivela non essere una colonia di cloni. Le cellule che condividono uno stesso corpo portano genomi diversi — e non mangiano tutte allo stesso ritmo$ex$,
  $body$<p>Un corpo fatto di molte cellule è un corpo fatto di copie. Qualunque altra cosa separi una cellula del fegato da una della pelle, entrambe portano lo stesso genoma; sono un solo organismo perché sono, geneticamente, una stessa cosa in divise diverse. Lo diamo per scontato. Essere un solo corpo significa essere un solo genoma.</p>
<p>Nel fango della palude salata di Little Sippewissett, a Cape Cod, vive qualcosa che non rientra in quella cornice. I batteri magnetotattici multicellulari sono, per quanto se ne sappia, gli unici batteri privi di qualsiasi stadio unicellulare: mai una cellula sola, in nessun momento del ciclo vitale. Un consorzio è una palla di quindici-ottantasei cellule, da tre a dodici micrometri di diametro, disposte in un solo strato attorno a un centro cavo. Ogni cellula porta minuscoli cristalli di minerale magnetico, e l'intera palla nuota lungo le linee del campo magnetico terrestre. Per riprodursi, la palla cresce e si divide in due.</p>
<p>Poiché si dividono come un blocco, si dava per scontato che le cellule all'interno fossero cloni. Nessuno aveva controllato una palla alla volta.</p>
<p>George Schaible, Roland Hatzenpichler e colleghi lo hanno fatto. Hanno estratto i consorzi dal sedimento con i magneti, ne hanno sequenziati ventidue singolarmente e hanno contato le differenze genetiche dentro ciascuno. Un controllo autenticamente clonale — cellule di un batterio da laboratorio — mostrava circa cinque differenze di una sola lettera. I consorzi magnetotattici ne mostravano tra 157 e 789. Le cellule che condividono uno stesso corpo non erano copie l'una dell'altra.</p>
<p>Poi hanno chiesto se le cellule si comportassero allo stesso modo. Hanno nutrito il sedimento con acetato marcato con carbonio pesante e hanno misurato, cellula per cellula, chi lo assorbiva. All'interno di uno stesso consorzio l'assorbimento era disomogeneo: alcune cellule erano punti caldi, altre mangiavano appena. Una marcatura distinta, per le proteine appena costruite, ha mostrato la stessa disomogeneità — in tutti i cinquantasette consorzi esaminati, un gradiente di costruzione proteica che correva attorno al centro cavo. Le cellule non erano soltanto geneticamente diverse. Lavoravano anche a ritmi diversi.</p>
<p>Viene la tentazione di chiamarla divisione del lavoro: alcune cellule mangiano e poi passano risorse attraverso il vuoto centrale. Gli autori sollevano la possibilità e poi si astengono dall'affermarla. Le differenze genetiche sono sparse tra i geni senza alcuno schema che suggerisca ruoli assegnati — che è l'aspetto che hanno gli errori di copiatura comuni, non la specializzazione. Questi batteri non si possono coltivare in laboratorio. Non c'è ancora modo di leggere quali geni ciascuna cellula stia davvero facendo funzionare, né prova dei canali che una simile condivisione richiederebbe. Che le cellule differiscano, lo possono mostrare. Che le differenze siano organizzate, no.</p>
<p>Anche irrisolta, la cosa muove qualcosa. "Un corpo, un genoma" ci sembra necessario perché generalizziamo a partire da noi stessi e dagli animali e dalle piante che riusciamo a vedere. Ecco un organismo più votato alla multicellularità di quanto lo siamo noi — non ha alcuno stadio solitario — e all'interno è geneticamente mescolato. Essere un'unità non richiede essere un genoma. Qualunque cosa tenga insieme questa palla, non è l'uguaglianza.</p>
<p>Niente di tutto ciò è un'affermazione su come sia cominciata la nostra multicellularità. Gli autori non la fanno, e un batterio di palude salata non è un passo nella discendenza di nessuno. Il pezzo utile è più piccolo. La prossima volta che qualcosa sembrerà un singolo individuo — un corpo, una colonia, un equipaggio — vale la pena chiedersi che cosa lo renda una cosa sola, separatamente dal fatto che le sue parti si somiglino. Tendiamo a rispondere a entrambe le domande in una volta sola, lasciando che la seconda faccia le veci della prima.</p>$body$,
  $t$Che cosa rende molte cellule un solo corpo? | ONE EIGHT Journal$t$,
  $ex$Un batterio che non è mai una cellula sola si rivela non essere una colonia di cloni. Le cellule che condividono uno stesso corpo portano genomi diversi — e non mangiano tutte allo stesso ritmo$ex$,
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
  SELECT id FROM public.journal_articles WHERE slug = 'what-makes-many-cells-one-body'
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
  $t$Schaible, George A., Zackary J. Jay, John Cliff, Frederik Schulz, Colin Gauvin, Danielle Goudeau, Rex R. Malmstrom, S. Emil Ruff, Virginia Edgcomb, and Roland Hatzenpichler. "Multicellular magnetotactic bacteria are genetically heterogeneous consortia with metabolically differentiated cells." PLOS Biology 22, no. 7 (2024): e3002638.$t$,
  '10.1371/journal.pbio.3002638',
  'https://doi.org/10.1371/journal.pbio.3002638'
FROM article a;

COMMIT;

-- =============================================================================
-- END
-- =============================================================================
