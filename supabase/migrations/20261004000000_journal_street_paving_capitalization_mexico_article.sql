-- =============================================================================
-- 20261004000000_journal_street_paving_capitalization_mexico_article.sql
-- 記事: oej-2026-street-paving-capitalization-mexico / the-road-was-not-the-point
-- 言語: en / ja / zh-Hant / zh-Hans / ko / es / pt-BR / de / fr / it
-- 適用: supabase db push (via migration)
-- 出典: approved/oej-2026-street-paving-capitalization-mexico_the-road-was-not-the-point_APPROVED_multilingual.md
-- 注記: 承認済み tags 8件を逐語・原順で登録する。
--       region_category「ラテンアメリカ（メキシコ）」と
--       field_category「経済（都市経済／インフラ・不動産価値）」に対応する列は
--       journal スキーマに存在しないため、この migration では列を追加せず保持しない。
--       原論文は © 2016 President and Fellows of Harvard College and MIT
--       （全著作権保有／CC ではない。Oxford ORA にグリーンOAとして掲載版全文あり）。
--       帰属表示は References に保持する。
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
  'the-road-was-not-the-point',
  'published',
  'ONE EIGHT Journal',
  ARRAY['economics','urban economics','infrastructure','property values','capitalization','credit','randomized controlled trial','Mexico'],
  '2026-09-30 14:50:54+09:00',
  '2026-10-04 00:00:00+09:00',
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
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'the-road-was-not-the-point')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'en',
  'The Road Was Not the Point',
  $ex$In one Mexican city, streets were paved by lottery. Travel times barely moved. Land values rose 72%, and came back out as cars, appliances and loans$ex$,
  $body$<p>We judge public works by the service they perform. A paved street is for getting somewhere — faster trips, cheaper taxis, less mud on the way to work. If those things do not improve much, the money looks wasted.</p>
<p>Acayucan, a metropolitan area of about 105,000 people in southern Mexico, made it possible to check. Like many cities in the region it has a paved core and an unpaved edge that advances slowly outward. The public works office had a list of 56 candidate streets. Marco Gonzalez-Navarro and Climent Quintana-Domeque had 28 of them drawn at random — an Excel random number generator deciding which residential streets got asphalt first. Households were surveyed in February and March 2006, before any work, and again in the same weeks of 2009, by which point 17 of the treated streets were fully paved, 11 were under way, and not one control street had been touched. The 2009 round included professional appraisals of 578 properties by a licensed agent, alongside 900 households tracked from the baseline.</p>
<p>The trip did not get much better. Time to the city centre fell by about a minute, which is not statistically distinguishable from zero; taxi costs, working hours and labour income moved no further. Judged as transport, the asphalt did close to nothing measurable within three years.</p>
<p>Judged as property, it did a great deal. Appraised land values on paved streets rose 72%, and total property values 17% — the gap being the building, which the street does not improve. Owners' own valuations rose 28%; rents rose 36%. The street had been converted into the price of what people already owned.</p>
<p>That new value did not stay on paper. Vehicle ownership rose 43% against a control mean of a quarter of a vehicle per household — roughly the difference between one household in four owning something and one in three. Appliance counts rose 12%. Home improvements doubled. Everyday spending did not move at all, which is the shape of a wealth effect rather than an income effect: nobody was earning more, and the things being bought were durable. Borrowing changed to match. Participation in collateral-based credit went from 2% of households to 5%, and the average such loan went from 135 pesos to 1,643 — more than tenfold, about two months of per capita expenditure. Other kinds of credit, informal and family loans included, did not budge. What moved was specifically the kind of borrowing that requires something to pledge.</p>
<p>Which is where the mechanism gets a sharper edge than the headline. The consumption gains were concentrated among households that already had credit access; those without it got appliances, financed by spending down savings, and not the vehicles or building work that need a secured loan. Paving raised the value of a plot, and that value converted into something usable only if you held the plot and could already borrow against it. Renters, meanwhile, are on the other side of a 36% rise in rents.</p>
<p>The authors put the whole thing against the municipality's bill and get a benefit-cost ratio of 1.09, with a confidence interval from 0.66 to 1.51 — the land value created on the abutting plots roughly equal to what the work cost, which in the public finance literature is what efficient provision of a local public good looks like. They are careful that this counts only the plots on the street, not city-wide effects, and that Acayucan is poorer and less industrial than comparable Mexican cities.</p>
<p>The reframing is worth keeping even where the streets are already paved. Public investment is argued about in terms of use — journey times, ridership, footfall — because that is what a road or a line or a park appears to be for. A large part of what it actually does is revalue the things standing next to it, which lands on whoever owns them, and turns into spending only for those who could already borrow. When a project is proposed, the service it provides is the part that gets debated. The transfer it performs happens either way.</p>$body$,
  'The Road Was Not the Point | ONE EIGHT Journal',
  $ex$In one Mexican city, streets were paved by lottery. Travel times barely moved. Land values rose 72%, and came back out as cars, appliances and loans$ex$,
  true
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ja
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'the-road-was-not-the-point')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'ja',
  '道そのものが目的ではなかった',
  $ex$メキシコのある都市で、通りはくじ引きで舗装された。移動時間はほとんど動かなかった。土地の値段は72%上がり、それは車と家電と借入になって出てきた$ex$,
  $body$<p>公共事業は、それが果たす役割で評価される。舗装された道路は、どこかへ行くためのものだ——速い移動、安いタクシー代、通勤路のぬかるみの減少。それらがさほど改善しないなら、お金は無駄だったことになる。</p>
<p>メキシコ南部、人口およそ10万5千人の都市圏アカユカンは、それを確かめる場になった。この地域の多くの都市と同じく、舗装された中心部と未舗装の縁があり、縁はゆっくり外へ広がっていく。公共事業課の手元には、舗装候補の通りが56本のリストとしてあった。Marco Gonzalez-Navarro と Climent Quintana-Domeque は、そのうち28本を無作為に引かせた。どの住宅街の通りが先にアスファルトを得るかを、Excel の乱数が決めたことになる。世帯調査は工事前の2006年2月から3月に、そして2009年の同じ時期にもう一度行われた。その時点で処置群の17本は完全に舗装され、11本は工事中で、対照群の通りは一本も手をつけられていない。2009年の調査には、有資格の不動産業者による578件の専門評価と、ベースラインから追跡された900世帯が含まれる。</p>
<p>移動はたいして良くならなかった。市の中心部までの所要時間は約1分短くなったが、これはゼロと区別できない。タクシー代、労働時間、労働所得もそれ以上には動かなかった。交通として評価するかぎり、アスファルトは三年のあいだにほとんど何も測定可能なことをしていない。</p>
<p>資産として評価すると、大量のことをしていた。舗装された通りの土地の鑑定評価は72%上がり、不動産全体の評価は17%上がった。その差は建物のぶんで、通りは建物を良くしない。所有者自身による評価額は28%、家賃は36%上がった。通りは、人がすでに所有していたものの値段に変換されたことになる。</p>
<p>その新しい価値は紙の上に留まらなかった。自動車の保有は、対照群の平均が1世帯あたり0.25台という水準に対して43%増えた——四世帯に一世帯が持っている状態と、三世帯に一世帯が持っている状態の差である。家電の台数は12%増。住宅の改修は倍になった。日々の支出はまったく動いていない。これは所得効果ではなく資産効果の形だ。誰も余計に稼いではおらず、買われたものは耐久財だった。借入もそれに合わせて変わる。担保付き信用の利用世帯は2%から5%になり、その平均額は135ペソから1,643ペソへ——十倍以上、一人あたり支出の約二か月ぶんである。それ以外の信用は、非担保も、インフォーマルも、家族・友人からの借入も動かなかった。動いたのは、差し出すものが要る種類の借入だけだった。</p>
<p>そして機序には、見出しよりも鋭い縁がある。消費の増加は、もともと信用にアクセスできていた世帯に集中していた。そうでない世帯が得たのは家電だけで、それは貯蓄の取り崩しによるものであり、担保付きの融資を要する車や工事ではなかった。舗装は区画の価値を上げる。その価値が使えるものに変わるのは、区画を所有していて、なおかつすでに担保に入れて借りられる場合だけだ。一方で借家人は、36%上がった家賃の反対側にいる。</p>
<p>著者たちはこれ全体を自治体の支出と突き合わせ、便益費用比1.09（信頼区間0.66–1.51）を得る。沿道の区画に生じた土地価値が、工事の費用とおおよそ等しい。公共財政の文献において、地方公共財の効率的な供給とはそう見えるものだとされる。彼らは慎重に、これが沿道の区画のみを数えており都市全体の効果を含まないこと、アカユカンが同規模のメキシコの都市より貧しく工業が少ないことを断っている。</p>
<p>この読み替えは、通りがすでに舗装されている場所でも持っておく値打ちがある。公共投資は利用の言葉で議論される——所要時間、輸送人員、通行量。道路も路線も公園も、そのためのものに見えるからだ。だが実際にそれがしていることの大きな部分は、隣に立っているものの値段を付け直すことであり、それは所有している人のところに落ち、すでに借りられた人のところでだけ支出に変わる。事業が提案されるとき、議論されるのはそれが提供する役割のほうだ。それが行う移転のほうは、どちらにせよ起きている。</p>$body$,
  '道そのものが目的ではなかった | ONE EIGHT Journal',
  $ex$メキシコのある都市で、通りはくじ引きで舗装された。移動時間はほとんど動かなかった。土地の値段は72%上がり、それは車と家電と借入になって出てきた$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- zh-Hant
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'the-road-was-not-the-point')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'zh-Hant',
  '這條路本身並不是重點',
  $ex$在墨西哥的一座城市，街道是用抽籤決定鋪設的。通行時間幾乎沒有變化。土地價值上漲了72%，而它又以汽車、家電與貸款的形式回流出來$ex$,
  $body$<p>我們用公共工程所履行的功能來評判它。一條鋪好的街道是為了到達某處——更快的行程、更便宜的計程車、上班路上更少的泥濘。如果這些都沒有多少改善，這筆錢看起來就是浪費了。</p>
<p>墨西哥南部的阿卡尤坎，一個約有十萬五千人的都會區，讓檢驗這件事成為可能。和這個地區的許多城市一樣，它有一個鋪好路面的核心，以及一圈未鋪面的邊緣，而這圈邊緣正緩慢地向外推進。公共工程處手上有一份五十六條候選街道的名單。Marco Gonzalez-Navarro 與 Climent Quintana-Domeque 讓其中二十八條以隨機方式抽出——由 Excel 的亂數產生器決定哪些住宅街道先鋪上柏油。住戶在動工之前的2006年二月與三月接受調查，並在2009年的同樣幾週再調查一次；到那時，處理組中有十七條街道已完全鋪好，十一條正在施工，而對照組的街道一條也沒有被動過。2009年那一輪包含由一位持照業者對五百七十八處不動產所做的專業鑑價，以及自基線起持續追蹤的九百戶家庭。</p>
<p>行程並沒有變好多少。到市中心的時間縮短了大約一分鐘，而這在統計上與零無法區分；計程車費用、工作時數與勞動所得也沒有進一步移動。若以交通來評判，這些柏油在三年之內幾乎沒有做出任何可測量的事。</p>
<p>若以財產來評判，它做的事就多了。鋪面街道上的土地鑑價上漲了72%，不動產總值上漲了17%——這個落差來自建物，而街道並不會讓建物變好。屋主自己的估價上漲了28%；租金上漲了36%。街道被轉換成了人們原本就擁有之物的價格。</p>
<p>那份新增的價值並沒有停留在紙面上。車輛持有量上升了43%，而對照組的平均是每戶四分之一輛車——大致相當於「每四戶有一戶擁有」與「每三戶有一戶擁有」之間的差距。家電數量上升了12%。住宅修繕增加了一倍。日常支出則完全沒有移動，而這正是財富效果而非所得效果的形狀：沒有人賺得更多，而被買下的東西都是耐久財。借貸也跟著相應改變。有抵押信貸的參與率從2%的家戶上升到5%，而這類貸款的平均金額從135披索上升到1,643披索——十倍有餘，約相當於人均支出的兩個月。其他種類的信貸，包括非正式借貸與向家人借的錢，都沒有挪動。動起來的，明確就是那種需要拿出東西來質押的借貸。</p>
<p>而機制也正是在這裡顯出比標題更鋒利的邊緣。消費的增加集中在原本就有信貸管道的家戶；沒有信貸管道的家戶得到的是家電，靠動用存款來支應，而不是那些需要擔保貸款的車輛或修建工程。鋪面提高了一塊地的價值，而那份價值只有在你持有那塊地、並且原本就能以它為抵押去借錢時，才會轉換成可用的東西。與此同時，租屋者則站在租金上漲36%的另一側。</p>
<p>作者們把這整件事拿去對照市政當局的帳單，得到1.09的效益成本比，信賴區間從0.66到1.51——在臨街地塊上所創造的土地價值，大致等於這項工程的花費；而在公共財政的文獻裡，地方公共財的有效率供給看起來正是這個樣子。他們謹慎地指出，這只計入了街道旁的地塊，並未計入全市範圍的效果，而且阿卡尤坎比起條件相當的墨西哥城市更貧窮、工業也更少。</p>
<p>即使在街道早已鋪好的地方，這個重新框定也值得留著。公共投資總是以使用的語彙被爭論——旅行時間、運量、人流——因為一條道路、一條路線或一座公園看起來就是為了這些而存在。但它實際上所做的事情裡，有很大一部分是替站在它旁邊的東西重新標價，而這會落到擁有那些東西的人身上，並且只對原本就借得到錢的人轉化為支出。當一項工程被提出時，被拿來辯論的是它所提供的功能。至於它所執行的那筆移轉，無論如何都在發生。</p>$body$,
  '這條路本身並不是重點 | ONE EIGHT Journal',
  $ex$在墨西哥的一座城市，街道是用抽籤決定鋪設的。通行時間幾乎沒有變化。土地價值上漲了72%，而它又以汽車、家電與貸款的形式回流出來$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- zh-Hans
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'the-road-was-not-the-point')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'zh-Hans',
  '这条路本身并不是重点',
  $ex$在墨西哥的一座城市，街道是用抽签决定铺设的。通行时间几乎没有变化。土地价值上涨了72%，而它又以汽车、家电与贷款的形式回流出来$ex$,
  $body$<p>我们用公共工程所履行的功能来评判它。一条铺好的街道是为了到达某处——更快的行程、更便宜的出租车、上班路上更少的泥泞。如果这些都没有多少改善，这笔钱看起来就是浪费了。</p>
<p>墨西哥南部的阿卡尤坎，一个约有十万五千人的都会区，让检验这件事成为可能。和这个地区的许多城市一样，它有一个铺好路面的核心，以及一圈未铺面的边缘，而这圈边缘正缓慢地向外推进。公共工程处手上有一份五十六条候选街道的名单。Marco Gonzalez-Navarro 与 Climent Quintana-Domeque 让其中二十八条以随机方式抽出——由 Excel 的随机数生成器决定哪些住宅街道先铺上沥青。住户在动工之前的2006年二月与三月接受调查，并在2009年的同样几周再调查一次；到那时，处理组中有十七条街道已完全铺好，十一条正在施工，而对照组的街道一条也没有被动过。2009年那一轮包含由一位持照业者对五百七十八处不动产所做的专业估价，以及自基线起持续追踪的九百户家庭。</p>
<p>行程并没有变好多少。到市中心的时间缩短了大约一分钟，而这在统计上与零无法区分；出租车费用、工作时数与劳动所得也没有进一步移动。若以交通来评判，这些沥青在三年之内几乎没有做出任何可测量的事。</p>
<p>若以财产来评判，它做的事就多了。铺面街道上的土地估价上涨了72%，不动产总值上涨了17%——这个落差来自建筑物，而街道并不会让建筑物变好。业主自己的估价上涨了28%；租金上涨了36%。街道被转换成了人们原本就拥有之物的价格。</p>
<p>那份新增的价值并没有停留在纸面上。车辆持有量上升了43%，而对照组的平均是每户四分之一辆车——大致相当于“每四户有一户拥有”与“每三户有一户拥有”之间的差距。家电数量上升了12%。住宅修缮增加了一倍。日常支出则完全没有移动，而这正是财富效应而非收入效应的形状：没有人赚得更多，而被买下的东西都是耐用品。借贷也跟着相应改变。有抵押信贷的参与率从2%的家户上升到5%，而这类贷款的平均金额从135比索上升到1,643比索——十倍有余，约相当于人均支出的两个月。其他种类的信贷，包括非正式借贷与向家人借的钱，都没有挪动。动起来的，明确就是那种需要拿出东西来质押的借贷。</p>
<p>而机制也正是在这里显出比标题更锋利的边缘。消费的增加集中在原本就有信贷渠道的家户；没有信贷渠道的家户得到的是家电，靠动用存款来支应，而不是那些需要担保贷款的车辆或修建工程。铺面提高了一块地的价值，而那份价值只有在你持有那块地、并且原本就能以它为抵押去借钱时，才会转换成可用的东西。与此同时，租房者则站在租金上涨36%的另一侧。</p>
<p>作者们把这整件事拿去对照市政当局的账单，得到1.09的效益成本比，置信区间从0.66到1.51——在临街地块上所创造的土地价值，大致等于这项工程的花费；而在公共财政的文献里，地方公共品的有效率供给看起来正是这个样子。他们谨慎地指出，这只计入了街道旁的地块，并未计入全市范围的效果，而且阿卡尤坎比起条件相当的墨西哥城市更贫穷、工业也更少。</p>
<p>即使在街道早已铺好的地方，这个重新框定也值得留着。公共投资总是以使用的语汇被争论——旅行时间、运量、人流——因为一条道路、一条线路或一座公园看起来就是为了这些而存在。但它实际上所做的事情里，有很大一部分是替站在它旁边的东西重新标价，而这会落到拥有那些东西的人身上，并且只对原本就借得到钱的人转化为支出。当一项工程被提出时，被拿来辩论的是它所提供的功能。至于它所执行的那笔转移，无论如何都在发生。</p>$body$,
  '这条路本身并不是重点 | ONE EIGHT Journal',
  $ex$在墨西哥的一座城市，街道是用抽签决定铺设的。通行时间几乎没有变化。土地价值上涨了72%，而它又以汽车、家电与贷款的形式回流出来$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ko
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'the-road-was-not-the-point')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'ko',
  '도로 자체가 요점은 아니었다',
  $ex$멕시코의 한 도시에서 거리는 추첨으로 포장되었다. 통행 시간은 거의 움직이지 않았다. 땅값은 72퍼센트 올랐고, 그것은 자동차와 가전과 대출이 되어 다시 나왔다$ex$,
  $body$<p>우리는 공공사업을 그것이 수행하는 기능으로 판단한다. 포장된 거리는 어딘가로 가기 위한 것이다 — 더 빠른 이동, 더 싼 택시, 출근길의 진창이 줄어드는 것. 그런 것들이 별로 나아지지 않는다면, 그 돈은 낭비처럼 보인다.</p>
<p>멕시코 남부의 인구 약 10만 5천 명 규모 도시권 아카유칸은 그것을 확인할 수 있게 해 주었다. 이 지역의 많은 도시가 그렇듯 이곳에도 포장된 중심부와 포장되지 않은 가장자리가 있고, 그 가장자리는 천천히 바깥으로 밀려 나간다. 공공사업과에는 후보 거리 쉰여섯 곳의 목록이 있었다. Marco Gonzalez-Navarro와 Climent Quintana-Domeque는 그중 스물여덟 곳을 무작위로 뽑게 했다 — 어느 주택가 거리가 먼저 아스팔트를 얻을지를 엑셀의 난수 생성기가 정한 셈이다. 가구 조사는 공사가 시작되기 전인 2006년 2월과 3월에, 그리고 2009년 같은 몇 주에 한 번 더 이루어졌다. 그 시점에 처치 대상 거리 가운데 열일곱 곳은 완전히 포장되었고, 열한 곳은 공사 중이었으며, 대조군 거리는 한 곳도 손대지 않은 상태였다. 2009년 조사에는 면허를 가진 중개인이 수행한 578건의 전문 감정과, 기준 시점부터 추적된 900가구가 포함되었다.</p>
<p>이동은 크게 나아지지 않았다. 도심까지 걸리는 시간은 1분쯤 줄었는데, 이는 통계적으로 0과 구별되지 않는다. 택시 요금도, 노동 시간도, 노동 소득도 그 이상으로 움직이지 않았다. 교통으로 판단하는 한, 아스팔트는 3년 안에 측정할 만한 일을 거의 하지 않았다.</p>
<p>자산으로 판단하면, 그것은 아주 많은 일을 했다. 포장된 거리의 감정된 토지 가치는 72퍼센트 올랐고, 부동산 전체 가치는 17퍼센트 올랐다 — 그 차이는 건물 몫이며, 거리는 건물을 좋게 만들지 않는다. 소유자 자신의 평가액은 28퍼센트 올랐고, 임대료는 36퍼센트 올랐다. 거리는 사람들이 이미 가지고 있던 것의 가격으로 변환된 것이다.</p>
<p>그 새로운 가치는 종이 위에만 머물지 않았다. 차량 보유는 가구당 4분의 1대라는 대조군 평균에 견주어 43퍼센트 늘었다 — 네 가구 중 한 가구가 가진 상태와 세 가구 중 한 가구가 가진 상태의 차이쯤 된다. 가전 대수는 12퍼센트 늘었다. 주택 개량은 두 배가 되었다. 일상적인 지출은 전혀 움직이지 않았는데, 이것이 바로 소득 효과가 아니라 부의 효과가 띠는 모양이다. 아무도 더 벌지 않았고, 사들인 것들은 내구재였다. 차입도 그에 맞추어 바뀌었다. 담보 기반 신용의 이용은 가구의 2퍼센트에서 5퍼센트로 올라갔고, 그런 대출의 평균 금액은 135페소에서 1,643페소로 — 열 배가 넘게, 1인당 지출의 약 두 달치에 해당하는 수준으로 — 올라갔다. 다른 종류의 신용은, 비공식 대출과 가족에게 빌린 돈을 포함해 꿈쩍하지 않았다. 움직인 것은 바로 내놓을 무언가가 있어야 하는 그 종류의 차입이었다.</p>
<p>그리고 바로 여기서 그 기제가 표제보다 날카로운 모서리를 드러낸다. 소비 증가는 이미 신용에 접근할 수 있던 가구에 집중되었다. 그렇지 못한 가구가 얻은 것은 가전이었고, 그것은 저축을 헐어 마련한 것이지, 담보 대출이 필요한 차량이나 공사가 아니었다. 포장은 한 필지의 가치를 올린다. 그리고 그 가치가 쓸 수 있는 무언가로 바뀌는 것은, 당신이 그 필지를 가지고 있고 이미 그것을 담보로 빌릴 수 있는 경우에 한해서다. 한편 세입자들은 36퍼센트 오른 임대료의 반대편에 있다.</p>
<p>저자들은 이 전부를 지자체의 청구서와 맞대어 1.09라는 편익비용비를 얻는다. 신뢰구간은 0.66에서 1.51까지다 — 접한 필지들에서 생겨난 토지 가치가 공사에 든 비용과 대략 같다는 것이고, 공공재정 문헌에서 지방 공공재의 효율적인 공급이란 바로 그렇게 보이는 것이다. 그들은 이것이 거리에 접한 필지만을 셈했을 뿐 도시 전체의 효과는 아니라는 점, 그리고 아카유칸이 비슷한 규모의 멕시코 도시들보다 가난하고 공업이 덜하다는 점을 조심스럽게 밝힌다.</p>
<p>이 다시 보기는 거리가 이미 포장된 곳에서도 지녀 둘 만하다. 공공 투자는 이용의 언어로 논의된다 — 소요 시간, 수송 인원, 통행량. 도로나 노선이나 공원이 바로 그것을 위한 것처럼 보이기 때문이다. 그러나 그것이 실제로 하는 일의 큰 부분은 바로 옆에 서 있는 것들의 값을 다시 매기는 일이고, 그것은 그것들을 소유한 사람에게 떨어지며, 이미 빌릴 수 있던 사람에게만 지출로 바뀐다. 어떤 사업이 제안될 때 논쟁의 대상이 되는 것은 그것이 제공하는 기능 쪽이다. 그것이 수행하는 이전은, 어느 쪽이든 일어난다.</p>$body$,
  '도로 자체가 요점은 아니었다 | ONE EIGHT Journal',
  $ex$멕시코의 한 도시에서 거리는 추첨으로 포장되었다. 통행 시간은 거의 움직이지 않았다. 땅값은 72퍼센트 올랐고, 그것은 자동차와 가전과 대출이 되어 다시 나왔다$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- es
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'the-road-was-not-the-point')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'es',
  'Lo importante no era la calle',
  $ex$En una ciudad mexicana, las calles se pavimentaron por sorteo. Los tiempos de viaje apenas se movieron. El valor del suelo subió un 72% y volvió a salir en forma de coches, electrodomésticos y préstamos$ex$,
  $body$<p>Juzgamos la obra pública por el servicio que presta. Una calle pavimentada sirve para llegar a algún sitio: viajes más rápidos, taxis más baratos, menos barro camino del trabajo. Si esas cosas no mejoran mucho, el dinero parece desperdiciado.</p>
<p>Acayucan, un área metropolitana de unos 105.000 habitantes en el sur de México, permitió comprobarlo. Como muchas ciudades de la región, tiene un centro pavimentado y un borde sin pavimentar que avanza despacio hacia fuera. La oficina de obras públicas tenía una lista de 56 calles candidatas. Marco Gonzalez-Navarro y Climent Quintana-Domeque hicieron que 28 de ellas se sortearan al azar: un generador de números aleatorios de Excel decidió qué calles residenciales recibían asfalto primero. Se encuestó a los hogares en febrero y marzo de 2006, antes de cualquier obra, y de nuevo en las mismas semanas de 2009, momento en el que 17 de las calles tratadas estaban totalmente pavimentadas, 11 estaban en obra y ninguna calle de control había sido tocada. La ronda de 2009 incluyó tasaciones profesionales de 578 propiedades a cargo de un agente colegiado, junto con 900 hogares seguidos desde la línea de base.</p>
<p>El trayecto no mejoró gran cosa. El tiempo hasta el centro de la ciudad bajó cerca de un minuto, lo que no es estadísticamente distinguible de cero; los costes de taxi, las horas trabajadas y los ingresos laborales no se movieron más allá. Juzgado como transporte, el asfalto no hizo casi nada medible en tres años.</p>
<p>Juzgado como propiedad, hizo muchísimo. El valor tasado del suelo en las calles pavimentadas subió un 72%, y el valor total de la propiedad un 17%: la diferencia es el edificio, que la calle no mejora. Las valoraciones de los propios dueños subieron un 28%; los alquileres, un 36%. La calle se había convertido en el precio de lo que la gente ya poseía.</p>
<p>Ese valor nuevo no se quedó sobre el papel. La posesión de vehículos subió un 43% frente a una media de control de un cuarto de vehículo por hogar, aproximadamente la diferencia entre que uno de cada cuatro hogares tenga uno y que lo tenga uno de cada tres. El número de electrodomésticos subió un 12%. Las mejoras en la vivienda se duplicaron. El gasto cotidiano no se movió en absoluto, que es la forma que tiene un efecto riqueza y no un efecto renta: nadie ganaba más, y lo que se compraba eran bienes duraderos. El endeudamiento cambió en consecuencia. La participación en el crédito con garantía pasó del 2% de los hogares al 5%, y el préstamo medio de ese tipo pasó de 135 pesos a 1.643, más de diez veces, unos dos meses de gasto per cápita. Los demás tipos de crédito, incluidos los préstamos informales y los familiares, no se movieron. Lo que se movió fue específicamente el endeudamiento que exige algo que pignorar.</p>
<p>Y ahí es donde el mecanismo cobra un filo más agudo que el titular. Las ganancias de consumo se concentraron en los hogares que ya tenían acceso al crédito; los que no lo tenían consiguieron electrodomésticos, financiados tirando de ahorros, y no los vehículos ni las obras que requieren un préstamo garantizado. Pavimentar elevó el valor de una parcela, y ese valor se convirtió en algo utilizable solo si uno era dueño de la parcela y ya podía pedir prestado contra ella. Los inquilinos, mientras tanto, están al otro lado de una subida del 36% en los alquileres.</p>
<p>Los autores contrastan todo esto con la factura del municipio y obtienen una relación beneficio-coste de 1,09, con un intervalo de confianza de 0,66 a 1,51: el valor del suelo creado en las parcelas colindantes es aproximadamente igual a lo que costó la obra, que es como se ve, en la literatura de hacienda pública, la provisión eficiente de un bien público local. Advierten con cuidado de que esto solo cuenta las parcelas de la calle, no los efectos en toda la ciudad, y de que Acayucan es más pobre y menos industrial que ciudades mexicanas comparables.</p>
<p>Vale la pena conservar este cambio de encuadre incluso donde las calles ya están pavimentadas. La inversión pública se discute en términos de uso —tiempos de trayecto, pasajeros, afluencia— porque eso es para lo que parece servir una carretera, una línea o un parque. Buena parte de lo que hace en realidad es revalorizar lo que está a su lado, lo cual recae sobre quien lo posea, y se convierte en gasto solo para quienes ya podían pedir prestado. Cuando se propone un proyecto, lo que se debate es el servicio que presta. La transferencia que ejecuta ocurre de todos modos.</p>$body$,
  'Lo importante no era la calle | ONE EIGHT Journal',
  $ex$En una ciudad mexicana, las calles se pavimentaron por sorteo. Los tiempos de viaje apenas se movieron. El valor del suelo subió un 72% y volvió a salir en forma de coches, electrodomésticos y préstamos$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- pt-BR
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'the-road-was-not-the-point')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'pt-BR',
  'O importante não era a rua',
  $ex$Numa cidade mexicana, as ruas foram asfaltadas por sorteio. Os tempos de viagem quase não mudaram. O valor da terra subiu 72% e voltou a sair na forma de carros, eletrodomésticos e empréstimos$ex$,
  $body$<p>Julgamos a obra pública pelo serviço que ela presta. Uma rua asfaltada serve para chegar a algum lugar: viagens mais rápidas, táxis mais baratos, menos lama no caminho do trabalho. Se essas coisas não melhoram muito, o dinheiro parece desperdiçado.</p>
<p>Acayucan, uma região metropolitana de cerca de 105 mil habitantes no sul do México, tornou possível verificar isso. Como muitas cidades da região, tem um centro asfaltado e uma borda sem asfalto que avança devagar para fora. O setor de obras públicas tinha uma lista de 56 ruas candidatas. Marco Gonzalez-Navarro e Climent Quintana-Domeque fizeram com que 28 delas fossem sorteadas ao acaso — um gerador de números aleatórios do Excel decidindo quais ruas residenciais receberiam asfalto primeiro. Os domicílios foram pesquisados em fevereiro e março de 2006, antes de qualquer obra, e de novo nas mesmas semanas de 2009, quando 17 das ruas tratadas já estavam totalmente asfaltadas, 11 estavam em obras e nenhuma rua de controle havia sido tocada. A rodada de 2009 incluiu avaliações profissionais de 578 imóveis feitas por um corretor registrado, além de 900 domicílios acompanhados desde a linha de base.</p>
<p>O trajeto não melhorou muito. O tempo até o centro da cidade caiu cerca de um minuto, o que não é estatisticamente distinguível de zero; os custos de táxi, as horas trabalhadas e a renda do trabalho não foram além disso. Julgado como transporte, o asfalto não fez quase nada mensurável em três anos.</p>
<p>Julgado como patrimônio, fez muita coisa. O valor avaliado da terra nas ruas asfaltadas subiu 72%, e o valor total dos imóveis, 17% — a diferença é a construção, que a rua não melhora. As avaliações dos próprios donos subiram 28%; os aluguéis, 36%. A rua tinha sido convertida no preço daquilo que as pessoas já possuíam.</p>
<p>Esse valor novo não ficou no papel. A posse de veículos subiu 43% ante uma média de controle de um quarto de veículo por domicílio — mais ou menos a diferença entre um em cada quatro domicílios ter um e um em cada três ter. A contagem de eletrodomésticos subiu 12%. As reformas na casa dobraram. O gasto cotidiano não se mexeu nem um pouco, que é o formato de um efeito riqueza e não de um efeito renda: ninguém estava ganhando mais, e o que se comprava era bem durável. O endividamento mudou junto. A participação no crédito com garantia foi de 2% dos domicílios para 5%, e o empréstimo médio desse tipo foi de 135 pesos para 1.643 — mais de dez vezes, cerca de dois meses de gasto per capita. Os outros tipos de crédito, incluídos os empréstimos informais e os de família, não se moveram. O que se moveu foi especificamente o tipo de endividamento que exige algo a dar em penhor.</p>
<p>E é aí que o mecanismo ganha um fio mais afiado que a manchete. Os ganhos de consumo se concentraram nos domicílios que já tinham acesso a crédito; os que não tinham ficaram com eletrodomésticos, financiados com a queima de poupança, e não com os veículos ou as obras que exigem um empréstimo garantido. O asfalto elevou o valor de um lote, e esse valor virou algo utilizável apenas se você fosse dono do lote e já pudesse tomar emprestado contra ele. Os inquilinos, por sua vez, estão do outro lado de uma alta de 36% nos aluguéis.</p>
<p>Os autores confrontam tudo isso com a conta do município e chegam a uma relação benefício-custo de 1,09, com intervalo de confiança de 0,66 a 1,51 — o valor da terra criado nos lotes lindeiros é aproximadamente igual ao que a obra custou, que é como se parece, na literatura de finanças públicas, a provisão eficiente de um bem público local. Eles têm o cuidado de assinalar que isso conta apenas os lotes da rua, não os efeitos em toda a cidade, e que Acayucan é mais pobre e menos industrial do que cidades mexicanas comparáveis.</p>
<p>Vale guardar esse reenquadramento mesmo onde as ruas já estão asfaltadas. O investimento público é discutido em termos de uso — tempos de viagem, número de passageiros, fluxo de pessoas — porque é para isso que uma estrada, uma linha ou um parque parecem servir. Boa parte do que ele de fato faz é reprecificar as coisas que estão ao lado, o que recai sobre quem quer que as possua, e vira gasto apenas para quem já podia tomar emprestado. Quando um projeto é proposto, o que se debate é o serviço que ele presta. A transferência que ele realiza acontece de qualquer jeito.</p>$body$,
  'O importante não era a rua | ONE EIGHT Journal',
  $ex$Numa cidade mexicana, as ruas foram asfaltadas por sorteio. Os tempos de viagem quase não mudaram. O valor da terra subiu 72% e voltou a sair na forma de carros, eletrodomésticos e empréstimos$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- de
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'the-road-was-not-the-point')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'de',
  'Um die Straße ging es gar nicht',
  $ex$In einer mexikanischen Stadt wurden Straßen per Los asphaltiert. Die Fahrzeiten bewegten sich kaum. Die Bodenwerte stiegen um 72 % und kamen als Autos, Haushaltsgeräte und Kredite wieder heraus$ex$,
  $body$<p>Wir beurteilen öffentliche Bauten nach der Leistung, die sie erbringen. Eine asphaltierte Straße ist dazu da, irgendwohin zu kommen — schnellere Wege, billigere Taxis, weniger Schlamm auf dem Weg zur Arbeit. Bessern sich diese Dinge nicht sonderlich, wirkt das Geld verschwendet.</p>
<p>Acayucan, eine Metropolregion mit etwa 105.000 Einwohnern im Süden Mexikos, machte die Überprüfung möglich. Wie viele Städte der Region hat sie einen asphaltierten Kern und einen unbefestigten Rand, der sich langsam nach außen schiebt. Das Bauamt hatte eine Liste mit 56 Straßen zur Auswahl. Marco Gonzalez-Navarro und Climent Quintana-Domeque ließen 28 davon per Zufall ziehen — ein Zufallszahlengenerator in Excel entschied, welche Wohnstraßen zuerst Asphalt bekamen. Die Haushalte wurden im Februar und März 2006 befragt, vor jeder Bautätigkeit, und noch einmal in denselben Wochen des Jahres 2009; zu diesem Zeitpunkt waren 17 der behandelten Straßen vollständig asphaltiert, 11 im Bau, und keine einzige Kontrollstraße war angerührt worden. Die Runde von 2009 umfasste professionelle Schätzungen von 578 Grundstücken durch einen zugelassenen Makler sowie 900 Haushalte, die seit der Ausgangserhebung verfolgt wurden.</p>
<p>Der Weg wurde nicht viel besser. Die Zeit bis ins Stadtzentrum sank um etwa eine Minute, was statistisch nicht von null zu unterscheiden ist; Taxikosten, Arbeitsstunden und Arbeitseinkommen bewegten sich nicht weiter. Als Verkehrsprojekt beurteilt, hat der Asphalt binnen drei Jahren fast nichts Messbares bewirkt.</p>
<p>Als Vermögen beurteilt, hat er sehr viel bewirkt. Die geschätzten Bodenwerte an den asphaltierten Straßen stiegen um 72 %, der Gesamtwert der Immobilien um 17 % — der Unterschied ist das Gebäude, das die Straße nicht verbessert. Die eigenen Bewertungen der Eigentümer stiegen um 28 %, die Mieten um 36 %. Die Straße war in den Preis dessen verwandelt worden, was die Leute ohnehin schon besaßen.</p>
<p>Dieser neue Wert blieb nicht auf dem Papier. Der Fahrzeugbesitz stieg um 43 % gegenüber einem Kontrollmittel von einem Viertel Fahrzeug je Haushalt — ungefähr der Unterschied zwischen einem von vier Haushalten, der eines besitzt, und einem von drei. Die Zahl der Haushaltsgeräte stieg um 12 %. Umbauten am Haus verdoppelten sich. Die alltäglichen Ausgaben bewegten sich überhaupt nicht, und genau so sieht ein Vermögenseffekt aus und kein Einkommenseffekt: Niemand verdiente mehr, und gekauft wurden langlebige Güter. Die Verschuldung änderte sich passend dazu. Die Teilnahme an besichertem Kredit stieg von 2 % der Haushalte auf 5 %, und der durchschnittliche Kredit dieser Art stieg von 135 Pesos auf 1.643 — mehr als das Zehnfache, etwa zwei Monate der Pro-Kopf-Ausgaben. Andere Kreditformen, informelle Darlehen und solche aus der Familie eingeschlossen, rührten sich nicht. Bewegt hat sich genau jene Art von Verschuldung, die etwas zum Verpfänden verlangt.</p>
<p>Und hier bekommt der Mechanismus eine schärfere Kante als die Schlagzeile. Die Konsumgewinne konzentrierten sich auf Haushalte, die bereits Zugang zu Kredit hatten; die ohne ihn bekamen Haushaltsgeräte, finanziert durch das Auflösen von Ersparnissen, und nicht die Fahrzeuge oder Bauarbeiten, für die ein besicherter Kredit nötig ist. Das Asphaltieren hob den Wert eines Grundstücks, und dieser Wert wurde nur dann zu etwas Brauchbarem, wenn man das Grundstück besaß und ohnehin schon darauf Kredit aufnehmen konnte. Die Mieter stehen derweil auf der anderen Seite eines Mietanstiegs von 36 %.</p>
<p>Die Autoren stellen das Ganze der Rechnung der Kommune gegenüber und erhalten ein Nutzen-Kosten-Verhältnis von 1,09, mit einem Konfidenzintervall von 0,66 bis 1,51 — der auf den angrenzenden Grundstücken geschaffene Bodenwert entspricht ungefähr dem, was die Arbeiten gekostet haben, und genau so sieht in der finanzwissenschaftlichen Literatur die effiziente Bereitstellung eines lokalen öffentlichen Guts aus. Sie weisen sorgfältig darauf hin, dass dabei nur die Grundstücke an der Straße gezählt werden und nicht stadtweite Effekte, und dass Acayucan ärmer und weniger industriell ist als vergleichbare mexikanische Städte.</p>
<p>Die Umdeutung lohnt sich auch dort, wo die Straßen längst asphaltiert sind. Über öffentliche Investitionen wird in Begriffen der Nutzung gestritten — Fahrzeiten, Fahrgastzahlen, Passantenströme —, weil eine Straße, eine Linie oder ein Park genau dafür da zu sein scheinen. Ein großer Teil dessen, was sie tatsächlich tun, ist, die Dinge daneben neu zu bewerten, was bei denen landet, denen sie gehören, und nur bei denen zu Ausgaben wird, die ohnehin schon Kredit bekamen. Wenn ein Projekt vorgeschlagen wird, ist es die Leistung, über die debattiert wird. Die Umverteilung, die es vollzieht, findet so oder so statt.</p>$body$,
  'Um die Straße ging es gar nicht | ONE EIGHT Journal',
  $ex$In einer mexikanischen Stadt wurden Straßen per Los asphaltiert. Die Fahrzeiten bewegten sich kaum. Die Bodenwerte stiegen um 72 % und kamen als Autos, Haushaltsgeräte und Kredite wieder heraus$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- fr
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'the-road-was-not-the-point')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'fr',
  'La rue n''était pas l''essentiel',
  $ex$Dans une ville mexicaine, les rues ont été goudronnées par tirage au sort. Les temps de trajet ont à peine bougé. La valeur des terrains a augmenté de 72 %, et elle est ressortie en voitures, en électroménager et en prêts$ex$,
  $body$<p>Nous jugeons les travaux publics au service qu'ils rendent. Une rue goudronnée sert à aller quelque part : des trajets plus rapides, des taxis moins chers, moins de boue sur le chemin du travail. Si ces choses-là ne s'améliorent guère, l'argent paraît gaspillé.</p>
<p>Acayucan, une agglomération d'environ 105 000 habitants dans le sud du Mexique, a permis de le vérifier. Comme beaucoup de villes de la région, elle a un centre goudronné et une frange non goudronnée qui avance lentement vers l'extérieur. Le service des travaux publics avait une liste de 56 rues candidates. Marco Gonzalez-Navarro et Climent Quintana-Domeque en ont fait tirer 28 au hasard — un générateur de nombres aléatoires d'Excel décidant quelles rues résidentielles recevraient l'asphalte en premier. Les ménages ont été enquêtés en février et mars 2006, avant tout chantier, puis de nouveau aux mêmes semaines de 2009 ; à cette date, 17 des rues traitées étaient entièrement goudronnées, 11 étaient en travaux, et pas une seule rue témoin n'avait été touchée. La vague de 2009 comprenait des expertises professionnelles de 578 biens réalisées par un agent agréé, ainsi que 900 ménages suivis depuis l'enquête initiale.</p>
<p>Le trajet ne s'est pas beaucoup amélioré. Le temps pour rejoindre le centre-ville a baissé d'environ une minute, ce qui n'est pas statistiquement distinguable de zéro ; les coûts de taxi, les heures travaillées et les revenus du travail n'ont pas bougé davantage. Jugé comme un projet de transport, l'asphalte n'a presque rien fait de mesurable en trois ans.</p>
<p>Jugé comme un patrimoine, il a fait énormément. La valeur expertisée des terrains le long des rues goudronnées a augmenté de 72 %, et la valeur totale des biens de 17 % — l'écart correspond au bâti, que la rue n'améliore pas. Les estimations des propriétaires eux-mêmes ont augmenté de 28 % ; les loyers, de 36 %. La rue avait été convertie en prix de ce que les gens possédaient déjà.</p>
<p>Cette valeur nouvelle n'est pas restée sur le papier. La possession de véhicules a augmenté de 43 % par rapport à une moyenne témoin d'un quart de véhicule par ménage — à peu près l'écart entre un ménage sur quatre qui en possède un et un ménage sur trois. Le nombre d'appareils électroménagers a augmenté de 12 %. Les travaux d'amélioration du logement ont doublé. Les dépenses courantes n'ont pas bougé du tout, et c'est là la forme d'un effet de richesse et non d'un effet de revenu : personne ne gagnait davantage, et ce qui était acheté relevait du durable. L'emprunt a changé en conséquence. La participation au crédit adossé à une garantie est passée de 2 % des ménages à 5 %, et le montant moyen de ce type de prêt de 135 pesos à 1 643 — plus de dix fois, environ deux mois de dépense par habitant. Les autres formes de crédit, prêts informels et familiaux compris, n'ont pas bougé. Ce qui a bougé, c'est précisément le type d'emprunt qui exige quelque chose à mettre en gage.</p>
<p>Et c'est là que le mécanisme prend un tranchant plus net que le titre. Les gains de consommation se sont concentrés dans les ménages qui avaient déjà accès au crédit ; ceux qui n'en avaient pas ont obtenu de l'électroménager, financé en puisant dans l'épargne, et non les véhicules ou les travaux qui exigent un prêt garanti. Le goudronnage a relevé la valeur d'une parcelle, et cette valeur ne s'est convertie en quelque chose d'utilisable que si l'on détenait la parcelle et que l'on pouvait déjà emprunter contre elle. Les locataires, eux, se trouvent de l'autre côté d'une hausse des loyers de 36 %.</p>
<p>Les auteurs rapportent l'ensemble à la facture de la municipalité et obtiennent un ratio avantages-coûts de 1,09, avec un intervalle de confiance allant de 0,66 à 1,51 — la valeur foncière créée sur les parcelles riveraines équivaut à peu près au coût des travaux, ce à quoi ressemble, dans la littérature de finances publiques, la fourniture efficace d'un bien public local. Ils précisent avec soin que cela ne compte que les parcelles de la rue, et non les effets à l'échelle de la ville, et qu'Acayucan est plus pauvre et moins industrielle que des villes mexicaines comparables.</p>
<p>Ce recadrage mérite d'être gardé, même là où les rues sont déjà goudronnées. L'investissement public se débat en termes d'usage — temps de trajet, fréquentation, passage — parce que c'est à cela qu'une route, une ligne ou un parc semblent servir. Une grande part de ce qu'il fait réellement, c'est de réévaluer ce qui se tient à côté, ce qui retombe sur ceux qui le possèdent, et ne se transforme en dépense que pour ceux qui pouvaient déjà emprunter. Quand un projet est proposé, c'est le service qu'il rend qui est discuté. Le transfert qu'il opère a lieu de toute façon.</p>$body$,
  'La rue n''était pas l''essentiel | ONE EIGHT Journal',
  $ex$Dans une ville mexicaine, les rues ont été goudronnées par tirage au sort. Les temps de trajet ont à peine bougé. La valeur des terrains a augmenté de 72 %, et elle est ressortie en voitures, en électroménager et en prêts$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- it
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'the-road-was-not-the-point')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'it',
  'Il punto non era la strada',
  $ex$In una città messicana le strade sono state asfaltate per sorteggio. I tempi di viaggio si sono mossi appena. Il valore dei terreni è salito del 72% ed è riemerso sotto forma di automobili, elettrodomestici e prestiti$ex$,
  $body$<p>Giudichiamo le opere pubbliche dal servizio che rendono. Una strada asfaltata serve per arrivare da qualche parte: spostamenti più rapidi, taxi più economici, meno fango sulla via del lavoro. Se queste cose non migliorano granché, i soldi sembrano sprecati.</p>
<p>Acayucan, un'area metropolitana di circa 105.000 abitanti nel sud del Messico, ha reso possibile verificarlo. Come molte città della regione, ha un centro asfaltato e un margine non asfaltato che avanza lentamente verso l'esterno. L'ufficio dei lavori pubblici aveva un elenco di 56 strade candidate. Marco Gonzalez-Navarro e Climent Quintana-Domeque ne hanno fatte estrarre 28 a caso — un generatore di numeri casuali di Excel a decidere quali strade residenziali ricevessero per prime l'asfalto. Le famiglie sono state intervistate a febbraio e marzo del 2006, prima di qualsiasi lavoro, e di nuovo nelle stesse settimane del 2009, quando 17 delle strade trattate erano completamente asfaltate, 11 erano in corso d'opera e nessuna strada di controllo era stata toccata. Il ciclo del 2009 comprendeva perizie professionali su 578 immobili svolte da un agente abilitato, oltre a 900 famiglie seguite dalla rilevazione iniziale.</p>
<p>Il tragitto non è migliorato granché. Il tempo per raggiungere il centro città è calato di circa un minuto, il che non è statisticamente distinguibile da zero; i costi del taxi, le ore lavorate e il reddito da lavoro non si sono mossi oltre. Giudicato come trasporto, l'asfalto non ha fatto quasi nulla di misurabile nell'arco di tre anni.</p>
<p>Giudicato come patrimonio, ha fatto moltissimo. Il valore peritale dei terreni sulle strade asfaltate è salito del 72%, e il valore complessivo degli immobili del 17% — la differenza è il fabbricato, che la strada non migliora. Le valutazioni dei proprietari stessi sono salite del 28%; gli affitti del 36%. La strada era stata convertita nel prezzo di ciò che le persone già possedevano.</p>
<p>Quel valore nuovo non è rimasto sulla carta. Il possesso di veicoli è salito del 43% a fronte di una media di controllo di un quarto di veicolo per famiglia — all'incirca la differenza tra una famiglia su quattro che ne possiede uno e una su tre. Il numero di elettrodomestici è salito del 12%. I lavori di miglioria in casa sono raddoppiati. La spesa quotidiana non si è mossa affatto, e questa è la forma di un effetto ricchezza e non di un effetto reddito: nessuno guadagnava di più, e ciò che veniva comprato era durevole. L'indebitamento è cambiato di conseguenza. La partecipazione al credito garantito è passata dal 2% delle famiglie al 5%, e il prestito medio di quel tipo da 135 pesos a 1.643 — più di dieci volte, circa due mesi di spesa pro capite. Le altre forme di credito, compresi i prestiti informali e quelli familiari, non si sono mosse. A muoversi è stato proprio quel tipo di indebitamento che richiede qualcosa da dare in pegno.</p>
<p>Ed è qui che il meccanismo acquista un taglio più affilato del titolo. I guadagni di consumo si sono concentrati nelle famiglie che avevano già accesso al credito; quelle che non ce l'avevano hanno ottenuto elettrodomestici, finanziati attingendo ai risparmi, e non i veicoli o i lavori edili che richiedono un prestito garantito. L'asfaltatura ha alzato il valore di un lotto, e quel valore si è convertito in qualcosa di utilizzabile soltanto se il lotto era tuo e se già potevi prenderci a prestito sopra. Gli inquilini, intanto, stanno dall'altra parte di un rincaro degli affitti del 36%.</p>
<p>Gli autori mettono il tutto a confronto con il conto del comune e ottengono un rapporto benefici-costi di 1,09, con un intervallo di confidenza da 0,66 a 1,51 — il valore fondiario creato sui lotti confinanti è all'incirca pari a quanto è costata l'opera, che è l'aspetto che ha, nella letteratura di finanza pubblica, la fornitura efficiente di un bene pubblico locale. Precisano con cura che questo conteggia solo i lotti sulla strada, non gli effetti sull'intera città, e che Acayucan è più povera e meno industriale di città messicane comparabili.</p>
<p>Vale la pena tenersi questo riposizionamento anche dove le strade sono già asfaltate. L'investimento pubblico viene discusso in termini di utilizzo — tempi di percorrenza, passeggeri, flusso di persone — perché è a questo che una strada, una linea o un parco sembrano servire. Buona parte di ciò che fa davvero è riprezzare le cose che gli stanno accanto, il che ricade su chiunque le possieda, e si trasforma in spesa solo per chi poteva già prendere a prestito. Quando un progetto viene proposto, a essere dibattuto è il servizio che rende. Il trasferimento che compie avviene comunque.</p>$body$,
  'Il punto non era la strada | ONE EIGHT Journal',
  $ex$In una città messicana le strade sono state asfaltate per sorteggio. I tempi di viaggio si sono mossi appena. Il valore dei terreni è salito del 72% ed è riemerso sotto forma di automobili, elettrodomestici e prestiti$ex$,
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
  SELECT id FROM public.journal_articles WHERE slug = 'the-road-was-not-the-point'
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
  'Gonzalez-Navarro, Marco, and Climent Quintana-Domeque. "Paving Streets for the Poor: Experimental Analysis of Infrastructure Effects." The Review of Economics and Statistics 98, no. 2 (2016): 254–267.',
  '10.1162/REST_a_00553',
  'https://doi.org/10.1162/REST_a_00553'
FROM article a;

COMMIT;

-- =============================================================================
-- END
-- =============================================================================
