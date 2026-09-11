-- =============================================================================
-- 20260911000000_journal_congo_concrete_sape_article.sql
-- 記事: oej-2026-congo-concrete-sape-urban-display / when-a-skyline-is-a-costume
-- 言語: en / ja / zh-Hant / zh-Hans / ko / es / pt-BR / de / fr / it
-- 適用: supabase db push (via migration)
-- 出典: approved/oej-2026-congo-concrete-sape-urban-display_when-a-skyline-is-a-costume_APPROVED_multilingual.md
-- 注記: 承認済み tags 8件を逐語・原順で登録する。
--       region_category「中部アフリカ（コンゴ民主共和国・コンゴ共和国）」と
--       field_category「文化人類学（都市人類学／建築の政治）」に対応する列は
--       journal スキーマに存在しないため、この migration では列を追加せず保持しない。
--       原論文は Open access / CC BY 4.0（Belinga Ondoua 2025, Africa 95(4):392–423,
--       online 2026-01-20）。帰属表示は References に保持する。
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
  'when-a-skyline-is-a-costume',
  'published',
  'ONE EIGHT Journal',
  ARRAY['cultural anthropology','urban anthropology','political economy','real estate','Kinshasa','Brazzaville','La Sape','state performance'],
  '2026-09-11 10:31:15+09:00',
  '2026-09-11 00:00:00+09:00',
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
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'when-a-skyline-is-a-costume')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'en',
  'What Is That New Tower Actually Telling You?',
  $ex$In Kinshasa and Brazzaville, glass high-rises go up beside flooded, unpaved streets. Read one way, the skyline is progress; read another, it is a costume the state puts on — and the question is who it is for$ex$,
  $body$<p>A skyline of new towers reads as progress. When glass high-rises go up, a mall opens, a "new city" is announced, we take it as a sign that a place is recovering, developing, on its way up. We treat the buildings we can see as evidence that things are working.</p>
<p>Kinshasa and Brazzaville, the two Congo capitals, make that reading stumble. The towers are real, but so is what sits right beside them. A luxury high-rise on Kinshasa's Avenue Flamboyant stands over a road so flooded that drivers pay an informal fee to cut across the building's forecourt and skirt the water. Cité du Fleuve, sold as "the Dubai of Kinshasa," promised ten thousand homes on reclaimed swampland; it has finished a few hundred, many of them damp and delivered late, ringed by flood-prone slums. The Future Tower shows a polished main face to the boulevard and cracked, unfinished sides to everyone else.</p>
<p>Brazzaville, across the river, offers the same lesson at a different scale. Kintélé, a whole new city launched around a sixty-thousand-seat Olympic stadium, has aged into cracked paint and unpaved roads within a decade; a local official told Ondoua that when you cross the viaduct into it you should "close your eyes" to miss the ruin on either side. And which districts get the gleaming towers is not left to chance — the northern side of the city, the president's base, gets the beautiful houses; the south is largely left out.</p>
<p>Patrick Belinga Ondoua, who spent the autumn of 2024 walking the construction sites and the real-estate fairs of both cities, has a name for this: concrete Sape. La Sape is the Congolese art of dress — flamboyant designer suits worn in poor neighbourhoods, elegance staged over hardship, a way of existing by being seen. The buildings, he argues, do the same thing in concrete. A tower is a suit the state puts on. It is not only housing or office space; it is display.</p>
<p>And a costume is worn for someone. The audience for these towers is not mainly the people living beside them. It is foreign investors, donors, and regional rivals, and the message is steady: we are stable, we are capable, we are developing. In the Democratic Republic of Congo the president, Félix Tshisekedi, is nicknamed "Fatshi Béton" — Concrete Fatshi — for exactly this appetite. The building is an argument addressed outward, made in glass and cement.</p>
<p>So a skyline can be a claim rather than a measurement. The new tower may say less about how a country is actually doing than about what its state needs others to believe. Once you see that, the telling part of the picture is not the façade but the seam — the line where the polished front meets the flooded street, where the finished side meets the cracked one. That gap is not a flaw in the performance. It is where you can read what the performance is covering.</p>
<p>This is not a story about fake African cities, and Ondoua works to keep it from becoming one. The buildings are real; some people do live in them; and for states that are genuinely fragile — ranked near the bottom of the world's business-climate lists, still fighting a war in the east — projecting order is a rational move, not a foolish one. Nor are residents fooled. In his interviews it is often the taxi drivers and construction workers who name the "bluff" first, even as they pay to cross a tower's forecourt to escape the flood. The performance is real, its costs are real, and much of its home audience already knows it is a performance.</p>
<p>The lens is worth keeping. The next time a skyline, a launch, a gleaming "new city" is offered as proof that a place is rising — there, or anywhere — it is worth asking who the building is talking to, and looking hard at whatever stands directly beside it. Sometimes the street next to the tower says more than the tower does.</p>$body$,
  'What Is That New Tower Actually Telling You? | ONE EIGHT Journal',
  $ex$In Kinshasa and Brazzaville, glass high-rises go up beside flooded, unpaved streets. Read one way, the skyline is progress; read another, it is a costume the state puts on — and the question is who it is for$ex$,
  true
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ja
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'when-a-skyline-is-a-costume')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'ja',
  'その新しい高層ビルは、あなたに何を告げているのか',
  $ex$キンシャサとブラザヴィルでは、ガラスの高層ビルが冠水した未舗装の道のすぐ横に建つ。ある読み方では発展、別の読み方では、国家がまとう一着の衣装だ——問いは、それが誰のためか$ex$,
  $body$<p>新しい高層ビルの立ち並ぶ空は、発展のしるしに読める。ガラスのビルが建ち、モールが開き、「新都市」が発表されると、私たちはそれを、この土地が立ち直り、発展し、上っていく合図として受け取る。目に見える建物を、うまくいっている証拠として扱う。</p>
<p>コンゴの二つの首都、キンシャサとブラザヴィルは、その読みをつまずかせる。ビルは本物だ。だが、そのすぐ横にあるものも本物だ。キンシャサのアヴェニュ・フランボワイヤンの高級高層ビルは、あまりに冠水した道の上に建ち、運転手は水を避けようと、ビルの前庭を横切る非公式の通行料を払う。「キンシャサのドバイ」と売られたシテ・デュ・フルーヴは、埋め立てた湿地に一万戸を約束したが、仕上がったのは数百戸、その多くは湿り、引き渡しは遅れ、水没しやすいスラムに囲まれている。フューチャー・タワーは、大通りには磨かれた正面を見せ、それ以外の面はひび割れて未完成のままだ。</p>
<p>川の対岸のブラザヴィルは、同じ教訓を別の規模で見せる。六万席の五輪スタジアムを中心に立ち上げた新都市キンテレは、十年ほどでひび割れた塗装と未舗装の道へと老いた。ある地元当局者は Ondoua に、そこへ入る高架を渡るときは、両側の荒廃を見ずにすむよう「目を閉じよ」と言ったという。しかも、どの地区が輝くビルを得るかは、偶然に任されてはいない。大統領の地盤である北側が美しい住宅を得て、南側はおおむね置き去りにされる。</p>
<p>Patrick Belinga Ondoua は、2024年の秋、両都市の建設現場と不動産フェアを歩き回り、これに名前をつけた。「コンクリートのサップ(concrete Sape)」だ。ラ・サップとは、コンゴの装いの芸術——貧しい地区で華やかなブランドのスーツをまとい、苦境の上に優雅さを演出し、見られることで存在する流儀である。建物も同じことをコンクリートでしている、と彼は論じる。高層ビルは、国家がまとう一着のスーツだ。それは住居やオフィスであるだけでなく、見せもの(ディスプレイ)なのだ。</p>
<p>そして衣装は、誰かのために着られる。これらのビルの観客は、その脇に暮らす人々ではない。海外の投資家、援助国(ドナー)、地域のライバルたちだ。そしてメッセージは一貫している。我々は安定し、力があり、発展している、と。コンゴ民主共和国では、大統領フェリックス・チセケディが、まさにこの嗜好ゆえに「ファッチ・ベトン(コンクリートのファッチ)」と渾名される。建物は、ガラスとセメントで外へ向けて発せられた、一つの主張なのだ。</p>
<p>だから、高層ビルの空は、測定ではなく主張でありうる。新しいビルは、その国が実際どうであるかより、その国家が他者に信じさせたいことを語っているのかもしれない。そう見えてくると、この光景で物を言うのはファサードではなく、継ぎ目のほうだ——磨かれた正面が冠水した道と接する線、仕上がった面がひび割れた面と接する線。その隙間は、演出の失敗ではない。演出が何を覆っているかを、そこで読める。</p>
<p>これは「アフリカの見せかけの都市」の話ではない。Ondoua は、それに堕さないよう腐心している。建物は本物で、そこに暮らす人もいる。そして、本当に脆弱な国家——世界のビジネス環境ランキングの最下位近くに置かれ、東部では今も戦争が続く——にとって、秩序を演じることは、愚かどころか合理的な一手だ。住民も欺かれてはいない。彼のインタビューでしばしば最初に「ブラフ」だと名指すのは、タクシー運転手や建設労働者のほうであり、しかも彼らは、冠水を逃れるためにビルの前庭を横切る料金を払っている。演出は本物、その代償も本物、そしてその地元の観客の多くは、これが演出だと最初から知っている。</p>
<p>このレンズは、持っておく値打ちがある。次に、高層ビルの空が、開業が、きらめく「新都市」が、この土地は上っているという証拠として差し出されたとき——そこでも、どこでも——問う値打ちがある。この建物は誰に話しかけているのか。そして、そのすぐ隣に立っているものを、よく見ること。ときに、ビルの隣の道のほうが、ビルより多くを語る。</p>$body$,
  'その新しい高層ビルは、あなたに何を告げているのか | ONE EIGHT Journal',
  $ex$キンシャサとブラザヴィルでは、ガラスの高層ビルが冠水した未舗装の道のすぐ横に建つ。ある読み方では発展、別の読み方では、国家がまとう一着の衣装だ——問いは、それが誰のためか$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- zh-Hant
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'when-a-skyline-is-a-costume')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'zh-Hant',
  '那座新落成的高樓，究竟在告訴你什麼？',
  $ex$在金沙薩與布拉柴維爾，玻璃帷幕的高樓就蓋在積水、未鋪面的街道旁。一種讀法裡，天際線是進步；另一種讀法裡，它是國家穿上的一件衣裝——而問題是，它是穿給誰看的$ex$,
  $body$<p>一片新高樓構成的天際線，讀起來就是進步。當玻璃帷幕的大樓一棟棟升起，商場開張，一座「新城」被宣布，我們把這當成一個徵兆：這地方正在復甦、正在發展、正在往上走。我們把看得見的建築，當作事情運作良好的證據。</p>
<p>金沙薩與布拉柴維爾，剛果的兩個首都，讓這種讀法絆了一跤。大樓是真的，但緊挨著它們的東西也是真的。金沙薩弗朗布瓦揚大道（Avenue Flamboyant）上的一棟豪華高樓，矗立在一條積水嚴重到讓司機付一筆非正式費用、穿過大樓前庭繞開積水的道路之上。被當作「金沙薩的杜拜」出售的河濱城（Cité du Fleuve），承諾在填出來的沼澤地上蓋一萬戶住宅；完工的只有幾百戶，其中許多潮濕、交屋延遲，四周環繞著易淹水的貧民區。未來塔（Future Tower）對著大道展示一面打磨光亮的正面，其餘各面朝向所有其他人的，則是龜裂而未完工的模樣。</p>
<p>河對岸的布拉柴維爾，以另一種規模給出同樣的教訓。以一座六萬座席的奧運體育場為中心啟動的新城金泰勒（Kintélé），在十年之內就老成了龜裂的漆面與未鋪面的道路；一位地方官員告訴 Ondoua，當你跨過高架橋進入那裡時，應該「閉上眼睛」，好錯過兩側的殘敗。而哪些區能得到閃亮的高樓，並不是交給偶然決定的——城市的北側，也就是總統的地盤，得到漂亮的房子；南側則大致被排除在外。</p>
<p>Patrick Belinga Ondoua 在2024年秋天走遍兩座城市的工地與房地產展覽會，他為這件事取了一個名字：混凝土的薩普（concrete Sape）。拉薩普（La Sape）是剛果的穿衣藝術——在貧窮的街區穿上華麗的名牌西裝，把優雅演在困頓之上，一種靠被看見而存在的方式。他主張，這些建築用混凝土做著同樣的事。一棟高樓，就是國家穿上的一套西裝。它不只是住宅或辦公空間；它是展示。</p>
<p>而衣裝總是穿給某個人看的。這些高樓的觀眾，主要並不是住在它們旁邊的人。觀眾是外國投資者、援助方，以及區域內的對手，而訊息始終如一：我們穩定、我們有能力、我們正在發展。在剛果民主共和國，總統費利克斯·齊塞克迪正是因為這種胃口而被戲稱為「法奇混凝土」（Fatshi Béton）。建築是一則朝外發出的論證，用玻璃與水泥寫成。</p>
<p>所以，一片天際線可以是一項主張，而不是一次測量。那座新高樓所訴說的，也許更少關於這個國家實際過得如何，而更多關於它的國家機器需要別人相信什麼。一旦你看見這一點，這幅畫面裡真正說話的就不是立面，而是接縫——打磨過的正面與積水街道相接的那條線，完工的一面與龜裂的一面相接的那條線。那道落差不是演出的瑕疵。那正是你能讀出演出在遮蓋什麼的地方。</p>
<p>這並不是一個關於「虛假的非洲城市」的故事，而 Ondoua 也著力不讓它變成那樣。建築是真的；確實有人住在裡面；而對於真正脆弱的國家——在世界營商環境排行榜上位居末端附近，東部仍在打仗——投射出秩序是一步理性的棋，而不是一步愚蠢的棋。居民也沒有被騙。在他的訪談裡，往往正是計程車司機與建築工人最先說出「虛張聲勢」這個詞，即便他們同時正付錢穿過一棟高樓的前庭以躲開積水。演出是真的，它的代價是真的，而它在本地的觀眾，很多人早就知道那是一場演出。</p>
<p>這面透鏡值得留著。下一次，當一片天際線、一場開幕、一座閃亮的「新城」，被當作某個地方正在崛起的證據遞到你面前——不論在那裡，還是在任何地方——都值得問一問：這棟建築是在對誰說話。並且，好好去看緊挨著它站著的那樣東西。有時候，高樓旁邊那條街說的，比高樓本身還多。</p>$body$,
  '那座新落成的高樓，究竟在告訴你什麼？ | ONE EIGHT Journal',
  $ex$在金沙薩與布拉柴維爾，玻璃帷幕的高樓就蓋在積水、未鋪面的街道旁。一種讀法裡，天際線是進步；另一種讀法裡，它是國家穿上的一件衣裝——而問題是，它是穿給誰看的$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- zh-Hans
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'when-a-skyline-is-a-costume')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'zh-Hans',
  '那座新落成的高楼，究竟在告诉你什么？',
  $ex$在金沙萨与布拉柴维尔，玻璃幕墙的高楼就盖在积水、未铺面的街道旁。一种读法里，天际线是进步；另一种读法里，它是国家穿上的一件衣装——而问题是，它是穿给谁看的$ex$,
  $body$<p>一片新高楼构成的天际线，读起来就是进步。当玻璃幕墙的大楼一栋栋升起，商场开张，一座“新城”被宣布，我们把这当成一个征兆：这地方正在复苏、正在发展、正在往上走。我们把看得见的建筑，当作事情运作良好的证据。</p>
<p>金沙萨与布拉柴维尔，刚果的两个首都，让这种读法绊了一跤。大楼是真的，但紧挨着它们的东西也是真的。金沙萨弗朗布瓦扬大道（Avenue Flamboyant）上的一栋豪华高楼，矗立在一条积水严重到让司机付一笔非正式费用、穿过大楼前庭绕开积水的道路之上。被当作“金沙萨的迪拜”出售的河滨城（Cité du Fleuve），承诺在填出来的沼泽地上盖一万户住宅；完工的只有几百户，其中许多潮湿、交房延迟，四周环绕着易淹水的贫民区。未来塔（Future Tower）对着大道展示一面打磨光亮的正面，其余各面朝向所有其他人的，则是龟裂而未完工的模样。</p>
<p>河对岸的布拉柴维尔，以另一种规模给出同样的教训。以一座六万座席的奥运体育场为中心启动的新城金泰勒（Kintélé），在十年之内就老成了龟裂的漆面与未铺面的道路；一位地方官员告诉 Ondoua，当你跨过高架桥进入那里时，应该“闭上眼睛”，好错过两侧的残败。而哪些区能得到闪亮的高楼，并不是交给偶然决定的——城市的北侧，也就是总统的地盘，得到漂亮的房子；南侧则大致被排除在外。</p>
<p>Patrick Belinga Ondoua 在2024年秋天走遍两座城市的工地与房地产展览会，他为这件事取了一个名字：混凝土的萨普（concrete Sape）。拉萨普（La Sape）是刚果的穿衣艺术——在贫穷的街区穿上华丽的名牌西装，把优雅演在困顿之上，一种靠被看见而存在的方式。他主张，这些建筑用混凝土做着同样的事。一栋高楼，就是国家穿上的一套西装。它不只是住宅或办公空间；它是展示。</p>
<p>而衣装总是穿给某个人看的。这些高楼的观众，主要并不是住在它们旁边的人。观众是外国投资者、援助方，以及区域内的对手，而信息始终如一：我们稳定、我们有能力、我们正在发展。在刚果民主共和国，总统费利克斯·齐塞克迪正是因为这种胃口而被戏称为“法奇混凝土”（Fatshi Béton）。建筑是一则朝外发出的论证，用玻璃与水泥写成。</p>
<p>所以，一片天际线可以是一项主张，而不是一次测量。那座新高楼所诉说的，也许更少关于这个国家实际过得如何，而更多关于它的国家机器需要别人相信什么。一旦你看见这一点，这幅画面里真正说话的就不是立面，而是接缝——打磨过的正面与积水街道相接的那条线，完工的一面与龟裂的一面相接的那条线。那道落差不是演出的瑕疵。那正是你能读出演出在遮盖什么的地方。</p>
<p>这并不是一个关于“虚假的非洲城市”的故事，而 Ondoua 也着力不让它变成那样。建筑是真的；确实有人住在里面；而对于真正脆弱的国家——在世界营商环境排行榜上位居末端附近，东部仍在打仗——投射出秩序是一步理性的棋，而不是一步愚蠢的棋。居民也没有被骗。在他的访谈里，往往正是出租车司机与建筑工人最先说出“虚张声势”这个词，即便他们同时正付钱穿过一栋高楼的前庭以躲开积水。演出是真的，它的代价是真的，而它在本地的观众，很多人早就知道那是一场演出。</p>
<p>这面透镜值得留着。下一次，当一片天际线、一场开幕、一座闪亮的“新城”，被当作某个地方正在崛起的证据递到你面前——不论在那里，还是在任何地方——都值得问一问：这栋建筑是在对谁说话。并且，好好去看紧挨着它站着的那样东西。有时候，高楼旁边那条街说的，比高楼本身还多。</p>$body$,
  '那座新落成的高楼，究竟在告诉你什么？ | ONE EIGHT Journal',
  $ex$在金沙萨与布拉柴维尔，玻璃幕墙的高楼就盖在积水、未铺面的街道旁。一种读法里，天际线是进步；另一种读法里，它是国家穿上的一件衣装——而问题是，它是穿给谁看的$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ko
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'when-a-skyline-is-a-costume')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'ko',
  '저 새 고층 건물은 당신에게 무엇을 말하고 있는가',
  $ex$킨샤사와 브라자빌에서는 유리로 된 고층 건물이 물에 잠긴 비포장 도로 바로 옆에 올라간다. 한 가지로 읽으면 스카이라인은 발전이고, 다르게 읽으면 그것은 국가가 걸쳐 입은 의상이다 — 그리고 문제는 그것이 누구를 위한 것인가다$ex$,
  $body$<p>새 고층 건물들이 이루는 스카이라인은 발전으로 읽힌다. 유리 건물이 올라가고, 쇼핑몰이 문을 열고, '신도시'가 발표되면 우리는 그것을 이 지역이 회복하고 있고, 발전하고 있고, 올라가는 중이라는 신호로 받아들인다. 눈에 보이는 건물을, 일이 잘 돌아가고 있다는 증거로 다루는 것이다.</p>
<p>콩고의 두 수도 킨샤사와 브라자빌은 그 읽기를 비틀거리게 만든다. 건물은 진짜다. 그러나 바로 그 옆에 있는 것도 진짜다. 킨샤사 플랑부아양 대로(Avenue Flamboyant)의 한 고급 고층 건물은, 운전자들이 물을 피하려고 비공식 요금을 내고 건물 앞마당을 가로지를 만큼 심하게 잠긴 도로 위에 서 있다. '킨샤사의 두바이'로 팔린 시테 뒤 플뢰브(Cité du Fleuve)는 매립한 습지 위에 만 채의 집을 약속했지만, 완공된 것은 수백 채뿐이고 그중 다수는 눅눅하며 인도도 늦었고, 침수가 잦은 빈민가에 둘러싸여 있다. 퓨처 타워(Future Tower)는 대로 쪽으로는 잘 다듬어진 정면을 보여 주고, 나머지 모든 이에게는 금이 가고 마감되지 않은 옆면을 보여 준다.</p>
<p>강 건너 브라자빌은 같은 교훈을 다른 규모로 보여 준다. 육만 석 규모의 올림픽 경기장을 중심으로 출범한 신도시 킨텔레(Kintélé)는 십 년 안에 갈라진 페인트와 비포장 도로로 늙어 버렸다. 한 지역 공무원은 Ondoua에게, 고가도로를 건너 그곳으로 들어갈 때는 양옆의 폐허를 보지 않도록 "눈을 감으라"고 말했다. 그리고 어느 구역이 번쩍이는 건물을 얻는지는 우연에 맡겨져 있지 않다. 대통령의 기반인 도시 북쪽이 아름다운 집들을 얻고, 남쪽은 대체로 빠진다.</p>
<p>2024년 가을 두 도시의 건설 현장과 부동산 박람회를 걸어 다닌 Patrick Belinga Ondoua는 이것에 이름을 붙인다. 콘크리트 사프(concrete Sape)다. 라 사프(La Sape)는 콩고의 옷차림 예술이다 — 가난한 동네에서 화려한 명품 정장을 입고, 고단함 위에 우아함을 연출하며, 보임으로써 존재하는 방식. 건물도 콘크리트로 같은 일을 하고 있다고 그는 주장한다. 고층 건물은 국가가 걸쳐 입는 한 벌의 정장이다. 그것은 주거나 사무 공간이기만 한 것이 아니라, 전시다.</p>
<p>그리고 의상은 누군가를 위해 입는 것이다. 이 건물들의 관객은 주로 그 곁에 사는 사람들이 아니다. 관객은 외국 투자자와 공여자, 그리고 역내 경쟁자들이며, 메시지는 한결같다. 우리는 안정되어 있고, 능력이 있고, 발전하고 있다. 콩고민주공화국에서 대통령 펠릭스 치세케디는 바로 이런 취향 때문에 '파치 베통(Fatshi Béton)', 곧 '콘크리트 파치'라는 별명으로 불린다. 건물은 유리와 시멘트로 쓰여 바깥을 향해 제기된 하나의 주장이다.</p>
<p>그러니 스카이라인은 측정이 아니라 주장일 수 있다. 새 고층 건물은 그 나라가 실제로 어떻게 지내는지보다, 그 국가가 남들에게 무엇을 믿게 해야 하는지를 더 많이 말하고 있는지도 모른다. 그것이 보이기 시작하면, 이 그림에서 정작 말을 하는 것은 파사드가 아니라 이음매다 — 잘 다듬어진 정면이 물에 잠긴 거리와 만나는 선, 마감된 면이 갈라진 면과 만나는 선. 그 틈은 연출의 결함이 아니다. 연출이 무엇을 덮고 있는지를 읽어 낼 수 있는 자리다.</p>
<p>이것은 '가짜 아프리카 도시'에 관한 이야기가 아니며, Ondoua는 그렇게 되지 않도록 공을 들인다. 건물은 진짜고, 실제로 거기 사는 사람들도 있다. 그리고 정말로 취약한 국가에게 — 세계 기업환경 순위의 바닥 가까이에 놓여 있고, 동부에서는 여전히 전쟁을 치르고 있는 — 질서를 내보이는 것은 어리석은 수가 아니라 합리적인 수다. 주민들이 속고 있는 것도 아니다. 그의 인터뷰에서 '허세'라는 말을 먼저 꺼내는 쪽은 흔히 택시 기사와 건설 노동자들이며, 그러면서도 그들은 침수를 피하려고 고층 건물 앞마당을 가로지르는 값을 치른다. 연출도 진짜고, 그 대가도 진짜이며, 그 국내 관객의 상당수는 이미 그것이 연출임을 알고 있다.</p>
<p>이 렌즈는 지녀 둘 만하다. 다음에 어떤 스카이라인이, 어떤 개장이, 번쩍이는 '신도시'가 이곳이 떠오르고 있다는 증거로 내밀어질 때 — 그곳에서든 어디에서든 — 물어볼 값이 있다. 이 건물은 누구에게 말을 걸고 있는가. 그리고 그 바로 옆에 서 있는 것이 무엇이든, 눈여겨볼 것. 때로는 고층 건물 옆의 거리가 그 건물보다 더 많은 것을 말한다.</p>$body$,
  '저 새 고층 건물은 당신에게 무엇을 말하고 있는가 | ONE EIGHT Journal',
  $ex$킨샤사와 브라자빌에서는 유리로 된 고층 건물이 물에 잠긴 비포장 도로 바로 옆에 올라간다. 한 가지로 읽으면 스카이라인은 발전이고, 다르게 읽으면 그것은 국가가 걸쳐 입은 의상이다 — 그리고 문제는 그것이 누구를 위한 것인가다$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- es
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'when-a-skyline-is-a-costume')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'es',
  '¿Qué te está diciendo en realidad esa torre nueva?',
  $ex$En Kinshasa y Brazzaville, los rascacielos de cristal se levantan junto a calles inundadas y sin asfaltar. Leído de una manera, el perfil urbano es progreso; leído de otra, es un disfraz que se pone el Estado — y la pregunta es para quién$ex$,
  $body$<p>Un perfil urbano de torres nuevas se lee como progreso. Cuando se alzan rascacielos de cristal, abre un centro comercial, se anuncia una "ciudad nueva", lo tomamos como señal de que un lugar se recupera, se desarrolla, va hacia arriba. Tratamos los edificios que podemos ver como prueba de que las cosas funcionan.</p>
<p>Kinshasa y Brazzaville, las dos capitales congoleñas, hacen tropezar esa lectura. Las torres son reales, pero también lo es lo que hay justo al lado. Un rascacielos de lujo en la Avenue Flamboyant de Kinshasa se alza sobre una calzada tan inundada que los conductores pagan una tarifa informal para cruzar por la explanada del edificio y esquivar el agua. Cité du Fleuve, vendida como "el Dubái de Kinshasa", prometió diez mil viviendas sobre un pantano ganado al agua; ha terminado unos cientos, muchas de ellas húmedas y entregadas tarde, rodeadas de barrios propensos a las inundaciones. La Future Tower muestra una cara principal pulida hacia el bulevar y unos laterales agrietados y sin terminar a todos los demás.</p>
<p>Brazzaville, al otro lado del río, ofrece la misma lección a otra escala. Kintélé, toda una ciudad nueva lanzada en torno a un estadio olímpico de sesenta mil asientos, ha envejecido en una década hasta la pintura agrietada y las calles sin asfaltar; un funcionario local le dijo a Ondoua que, al cruzar el viaducto para entrar, uno debería "cerrar los ojos" para no ver la ruina a ambos lados. Y qué distritos reciben las torres relucientes no se deja al azar: el lado norte de la ciudad, la base del presidente, se lleva las casas bonitas; el sur queda en buena medida fuera.</p>
<p>Patrick Belinga Ondoua, que pasó el otoño de 2024 recorriendo las obras y las ferias inmobiliarias de ambas ciudades, tiene un nombre para esto: Sape de hormigón (concrete Sape). La Sape es el arte congoleño del vestir — trajes de diseñador llamativos lucidos en barrios pobres, elegancia puesta en escena sobre la penuria, una manera de existir siendo visto. Los edificios, sostiene, hacen lo mismo en hormigón. Una torre es un traje que se pone el Estado. No es solo vivienda o espacio de oficinas; es exhibición.</p>
<p>Y un disfraz se lleva para alguien. El público de estas torres no es principalmente la gente que vive al lado. Son inversores extranjeros, donantes y rivales regionales, y el mensaje es constante: somos estables, somos capaces, nos estamos desarrollando. En la República Democrática del Congo, al presidente Félix Tshisekedi lo apodan "Fatshi Béton" —Fatshi Hormigón— justamente por ese apetito. El edificio es un argumento dirigido hacia fuera, hecho de cristal y cemento.</p>
<p>Así que un perfil urbano puede ser una afirmación y no una medición. La torre nueva quizá diga menos sobre cómo le va realmente a un país que sobre lo que su Estado necesita que otros crean. Una vez que ves eso, lo elocuente de la imagen no es la fachada sino la costura: la línea donde el frente pulido se encuentra con la calle inundada, donde el lado terminado se encuentra con el agrietado. Ese hueco no es un fallo de la representación. Es donde puedes leer qué está tapando la representación.</p>
<p>Esta no es una historia sobre ciudades africanas falsas, y Ondoua se esfuerza por que no se convierta en eso. Los edificios son reales; hay gente que vive en ellos; y para Estados que son genuinamente frágiles —situados cerca del final de las listas mundiales de clima de negocios, todavía en guerra en el este—, proyectar orden es una jugada racional, no una necedad. Tampoco los residentes están engañados. En sus entrevistas son a menudo los taxistas y los obreros de la construcción quienes nombran primero el "farol", incluso mientras pagan por cruzar la explanada de una torre para escapar de la inundación. La representación es real, sus costes son reales, y buena parte de su público local ya sabe que es una representación.</p>
<p>Vale la pena conservar esta lente. La próxima vez que un perfil urbano, una inauguración, una reluciente "ciudad nueva" se ofrezcan como prueba de que un lugar está despegando —allí o en cualquier parte—, vale la pena preguntar con quién está hablando el edificio, y mirar bien lo que sea que esté justo a su lado. A veces la calle contigua a la torre dice más que la torre.</p>$body$,
  '¿Qué te está diciendo en realidad esa torre nueva? | ONE EIGHT Journal',
  $ex$En Kinshasa y Brazzaville, los rascacielos de cristal se levantan junto a calles inundadas y sin asfaltar. Leído de una manera, el perfil urbano es progreso; leído de otra, es un disfraz que se pone el Estado — y la pregunta es para quién$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- pt-BR
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'when-a-skyline-is-a-costume')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'pt-BR',
  'O que aquela torre nova está de fato dizendo a você?',
  $ex$Em Kinshasa e Brazzaville, arranha-céus de vidro sobem ao lado de ruas alagadas e sem asfalto. Lido de um jeito, o horizonte é progresso; lido de outro, é uma fantasia que o Estado veste — e a questão é para quem$ex$,
  $body$<p>Um horizonte de torres novas se lê como progresso. Quando arranha-céus de vidro sobem, um shopping abre, uma "cidade nova" é anunciada, tomamos isso como sinal de que um lugar está se recuperando, se desenvolvendo, subindo. Tratamos os prédios que conseguimos ver como prova de que as coisas estão funcionando.</p>
<p>Kinshasa e Brazzaville, as duas capitais congolesas, fazem essa leitura tropeçar. As torres são reais, mas também é real o que está bem ao lado delas. Um arranha-céu de luxo na Avenue Flamboyant, em Kinshasa, ergue-se sobre uma via tão alagada que os motoristas pagam uma taxa informal para atravessar o pátio do prédio e desviar da água. A Cité du Fleuve, vendida como "a Dubai de Kinshasa", prometeu dez mil moradias sobre um pântano aterrado; concluiu algumas centenas, muitas delas úmidas e entregues com atraso, cercadas por favelas sujeitas a enchentes. A Future Tower mostra uma fachada principal polida para a avenida e laterais rachadas e inacabadas para todo o resto.</p>
<p>Brazzaville, do outro lado do rio, oferece a mesma lição em outra escala. Kintélé, uma cidade nova inteira lançada em torno de um estádio olímpico de sessenta mil lugares, envelheceu em uma década até a tinta rachada e as ruas sem asfalto; um funcionário local disse a Ondoua que, ao cruzar o viaduto para entrar ali, você deveria "fechar os olhos" para não ver a ruína dos dois lados. E quais bairros ganham as torres reluzentes não é deixado ao acaso: o lado norte da cidade, a base do presidente, fica com as casas bonitas; o sul é em boa parte deixado de fora.</p>
<p>Patrick Belinga Ondoua, que passou o outono de 2024 percorrendo os canteiros de obras e as feiras imobiliárias das duas cidades, tem um nome para isso: Sape de concreto (concrete Sape). La Sape é a arte congolesa de se vestir — ternos de grife exuberantes usados em bairros pobres, elegância encenada sobre a dificuldade, um jeito de existir sendo visto. Os prédios, argumenta ele, fazem a mesma coisa em concreto. Uma torre é um terno que o Estado veste. Não é só moradia ou espaço de escritório; é exibição.</p>
<p>E uma fantasia se veste para alguém. O público dessas torres não é principalmente quem mora ao lado delas. São investidores estrangeiros, doadores e rivais regionais, e a mensagem é constante: somos estáveis, somos capazes, estamos nos desenvolvendo. Na República Democrática do Congo, o presidente Félix Tshisekedi é apelidado de "Fatshi Béton" — Fatshi Concreto — exatamente por esse apetite. O prédio é um argumento dirigido para fora, feito de vidro e cimento.</p>
<p>Então um horizonte pode ser uma afirmação, e não uma medição. A torre nova talvez diga menos sobre como um país realmente está do que sobre o que seu Estado precisa que os outros acreditem. Uma vez que você enxerga isso, o que fala na imagem não é a fachada, e sim a emenda — a linha em que a frente polida encontra a rua alagada, em que o lado acabado encontra o rachado. Essa lacuna não é uma falha da encenação. É onde dá para ler o que a encenação está cobrindo.</p>
<p>Esta não é uma história sobre cidades africanas falsas, e Ondoua se empenha para que não vire isso. Os prédios são reais; algumas pessoas de fato moram neles; e para Estados que são genuinamente frágeis — perto do fim das listas mundiais de ambiente de negócios, ainda em guerra no leste —, projetar ordem é um movimento racional, não uma tolice. Nem os moradores estão enganados. Nas entrevistas dele, muitas vezes são os motoristas de táxi e os operários da construção que nomeiam primeiro o "blefe", mesmo enquanto pagam para atravessar o pátio de uma torre e escapar da enchente. A encenação é real, seus custos são reais, e boa parte do público local já sabe que é uma encenação.</p>
<p>Vale guardar essa lente. Da próxima vez que um horizonte, uma inauguração, uma reluzente "cidade nova" forem oferecidos como prova de que um lugar está subindo — ali ou em qualquer outro lugar —, vale perguntar com quem o prédio está falando, e olhar bem para o que quer que esteja bem ao lado dele. Às vezes a rua vizinha à torre diz mais do que a torre.</p>$body$,
  'O que aquela torre nova está de fato dizendo a você? | ONE EIGHT Journal',
  $ex$Em Kinshasa e Brazzaville, arranha-céus de vidro sobem ao lado de ruas alagadas e sem asfalto. Lido de um jeito, o horizonte é progresso; lido de outro, é uma fantasia que o Estado veste — e a questão é para quem$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- de
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'when-a-skyline-is-a-costume')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'de',
  'Was sagt Ihnen dieser neue Turm eigentlich?',
  $ex$In Kinshasa und Brazzaville wachsen gläserne Hochhäuser neben überfluteten, unbefestigten Straßen empor. So gelesen ist die Skyline Fortschritt; anders gelesen ist sie ein Kostüm, das der Staat anlegt — und die Frage ist, für wen$ex$,
  $body$<p>Eine Skyline neuer Türme liest sich als Fortschritt. Wenn gläserne Hochhäuser hochgezogen werden, eine Mall eröffnet, eine "neue Stadt" angekündigt wird, nehmen wir das als Zeichen, dass ein Ort sich erholt, sich entwickelt, im Aufstieg ist. Wir behandeln die Gebäude, die wir sehen können, als Beleg dafür, dass es läuft.</p>
<p>Kinshasa und Brazzaville, die beiden kongolesischen Hauptstädte, bringen diese Lesart ins Stolpern. Die Türme sind echt, aber das, was direkt daneben liegt, ist es auch. Ein Luxushochhaus an der Avenue Flamboyant in Kinshasa steht über einer so überfluteten Straße, dass Fahrer eine informelle Gebühr zahlen, um über den Vorplatz des Gebäudes abzukürzen und dem Wasser auszuweichen. Cité du Fleuve, verkauft als "das Dubai von Kinshasa", versprach zehntausend Wohnungen auf aufgeschüttetem Sumpfland; fertig geworden sind einige Hundert, viele davon feucht und verspätet übergeben, umringt von hochwassergefährdeten Armenvierteln. Der Future Tower zeigt dem Boulevard eine polierte Hauptfassade und allen anderen rissige, unfertige Seiten.</p>
<p>Brazzaville, jenseits des Flusses, bietet dieselbe Lektion in anderem Maßstab. Kintélé, eine ganze neue Stadt, die um ein Olympiastadion mit sechzigtausend Plätzen herum begonnen wurde, ist binnen eines Jahrzehnts zu abblätternder Farbe und unbefestigten Straßen gealtert; ein lokaler Beamter sagte Ondoua, wenn man über das Viadukt hineinfahre, solle man "die Augen schließen", um den Verfall zu beiden Seiten nicht zu sehen. Und welche Viertel die glänzenden Türme bekommen, bleibt nicht dem Zufall überlassen — die Nordseite der Stadt, die Hausmacht des Präsidenten, bekommt die schönen Häuser; der Süden bleibt weitgehend außen vor.</p>
<p>Patrick Belinga Ondoua, der im Herbst 2024 die Baustellen und Immobilienmessen beider Städte abgelaufen ist, hat dafür einen Namen: Beton-Sape (concrete Sape). La Sape ist die kongolesische Kunst des Sichkleidens — auffällige Designeranzüge, getragen in armen Vierteln, Eleganz, die über der Not in Szene gesetzt wird, eine Art zu existieren, indem man gesehen wird. Die Gebäude, so argumentiert er, tun dasselbe in Beton. Ein Turm ist ein Anzug, den der Staat anlegt. Er ist nicht nur Wohn- oder Büroraum; er ist Zurschaustellung.</p>
<p>Und ein Kostüm trägt man für jemanden. Das Publikum dieser Türme sind nicht in erster Linie die Menschen, die daneben wohnen. Es sind ausländische Investoren, Geber und regionale Rivalen, und die Botschaft bleibt gleich: Wir sind stabil, wir sind fähig, wir entwickeln uns. In der Demokratischen Republik Kongo trägt Präsident Félix Tshisekedi genau wegen dieses Appetits den Spitznamen "Fatshi Béton" — Beton-Fatshi. Das Gebäude ist ein nach außen gerichtetes Argument, vorgetragen in Glas und Zement.</p>
<p>Eine Skyline kann also eine Behauptung sein statt einer Messung. Der neue Turm sagt vielleicht weniger darüber, wie es einem Land tatsächlich geht, als darüber, was sein Staat andere glauben machen muss. Hat man das erst gesehen, ist das Aufschlussreiche an dem Bild nicht die Fassade, sondern die Naht — die Linie, an der die polierte Front auf die überflutete Straße trifft, an der die fertige Seite auf die rissige trifft. Diese Lücke ist kein Fehler der Inszenierung. Sie ist die Stelle, an der man lesen kann, was die Inszenierung zudeckt.</p>
<p>Dies ist keine Geschichte über falsche afrikanische Städte, und Ondoua arbeitet daran, dass sie keine wird. Die Gebäude sind echt; manche Menschen wohnen tatsächlich darin; und für Staaten, die wirklich fragil sind — nahe am Ende der weltweiten Rankings zum Geschäftsklima, im Osten noch immer im Krieg —, ist es ein rationaler Zug, Ordnung auszustrahlen, kein törichter. Auch die Bewohner lassen sich nicht täuschen. In seinen Interviews sind es oft die Taxifahrer und Bauarbeiter, die als Erste vom "Bluff" sprechen, während sie zugleich dafür zahlen, den Vorplatz eines Turms zu queren, um dem Hochwasser zu entkommen. Die Inszenierung ist echt, ihre Kosten sind echt, und ein großer Teil ihres heimischen Publikums weiß längst, dass es eine Inszenierung ist.</p>
<p>Die Linse lohnt sich. Wenn das nächste Mal eine Skyline, eine Eröffnung, eine glänzende "neue Stadt" als Beweis dafür angeboten wird, dass ein Ort im Aufstieg ist — dort oder anderswo —, lohnt es sich zu fragen, mit wem das Gebäude spricht, und genau hinzusehen, was auch immer direkt daneben steht. Manchmal sagt die Straße neben dem Turm mehr als der Turm.</p>$body$,
  'Was sagt Ihnen dieser neue Turm eigentlich? | ONE EIGHT Journal',
  $ex$In Kinshasa und Brazzaville wachsen gläserne Hochhäuser neben überfluteten, unbefestigten Straßen empor. So gelesen ist die Skyline Fortschritt; anders gelesen ist sie ein Kostüm, das der Staat anlegt — und die Frage ist, für wen$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- fr
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'when-a-skyline-is-a-costume')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'fr',
  'Que vous dit vraiment cette nouvelle tour ?',
  $ex$À Kinshasa et à Brazzaville, des tours de verre s'élèvent au bord de rues inondées et non goudronnées. Lue d'une façon, la ligne d'horizon est un progrès ; lue autrement, c'est un costume que l'État endosse — et la question est de savoir pour qui$ex$,
  $body$<p>Une ligne d'horizon de tours neuves se lit comme un progrès. Quand des immeubles de verre s'élèvent, qu'un centre commercial ouvre, qu'une « ville nouvelle » est annoncée, nous y voyons le signe qu'un endroit se relève, se développe, monte. Nous traitons les bâtiments que nous voyons comme la preuve que les choses fonctionnent.</p>
<p>Kinshasa et Brazzaville, les deux capitales congolaises, font trébucher cette lecture. Les tours sont réelles, mais ce qui se trouve juste à côté l'est aussi. Une tour de luxe sur l'Avenue Flamboyant, à Kinshasa, domine une chaussée si inondée que les conducteurs paient un péage informel pour couper par le parvis de l'immeuble et contourner l'eau. Cité du Fleuve, vendue comme « le Dubaï de Kinshasa », promettait dix mille logements sur un marécage remblayé ; quelques centaines ont été achevés, beaucoup humides et livrés en retard, cernés par des quartiers exposés aux inondations. La Future Tower présente au boulevard une façade principale soignée, et à tous les autres des flancs fissurés et inachevés.</p>
<p>Brazzaville, de l'autre côté du fleuve, donne la même leçon à une autre échelle. Kintélé, une ville nouvelle entière lancée autour d'un stade olympique de soixante mille places, a vieilli en une décennie jusqu'à la peinture fissurée et aux routes non goudronnées ; un responsable local a dit à Ondoua qu'en franchissant le viaduc pour y entrer, il fallait « fermer les yeux » afin de ne pas voir la ruine de part et d'autre. Et le choix des quartiers qui reçoivent les tours rutilantes n'est pas laissé au hasard : le nord de la ville, le fief du président, obtient les belles maisons ; le sud est largement laissé de côté.</p>
<p>Patrick Belinga Ondoua, qui a passé l'automne 2024 à arpenter les chantiers et les salons de l'immobilier des deux villes, a un nom pour cela : la Sape de béton (concrete Sape). La Sape est l'art congolais de s'habiller — costumes de créateurs flamboyants portés dans des quartiers pauvres, élégance mise en scène par-dessus la difficulté, une manière d'exister en étant vu. Les bâtiments, soutient-il, font la même chose en béton. Une tour est un costume que l'État endosse. Ce n'est pas seulement du logement ou du bureau ; c'est de l'exhibition.</p>
<p>Et un costume se porte pour quelqu'un. Le public de ces tours n'est pas d'abord celui qui vit à côté. Ce sont les investisseurs étrangers, les bailleurs et les rivaux régionaux, et le message ne varie pas : nous sommes stables, nous sommes capables, nous nous développons. En République démocratique du Congo, le président Félix Tshisekedi est surnommé « Fatshi Béton » précisément pour cet appétit. Le bâtiment est un argument adressé vers l'extérieur, tenu en verre et en ciment.</p>
<p>Une ligne d'horizon peut donc être une affirmation plutôt qu'une mesure. La tour neuve en dit peut-être moins sur l'état réel d'un pays que sur ce que son État a besoin de faire croire aux autres. Une fois qu'on voit cela, ce qui parle dans l'image n'est pas la façade mais la couture — la ligne où la face polie rencontre la rue inondée, où le côté achevé rencontre le côté fissuré. Cet écart n'est pas un raté de la représentation. C'est là qu'on peut lire ce que la représentation recouvre.</p>
<p>Ce n'est pas une histoire de fausses villes africaines, et Ondoua s'emploie à ce qu'elle ne le devienne pas. Les bâtiments sont réels ; certains y vivent ; et pour des États réellement fragiles — placés près du bas des classements mondiaux du climat des affaires, encore en guerre à l'est —, projeter de l'ordre est un geste rationnel, non une sottise. Les habitants ne sont pas dupes non plus. Dans ses entretiens, ce sont souvent les chauffeurs de taxi et les ouvriers du bâtiment qui nomment les premiers le « bluff », alors même qu'ils paient pour traverser le parvis d'une tour afin d'échapper à l'inondation. La représentation est réelle, ses coûts sont réels, et une grande partie de son public local sait déjà que c'est une représentation.</p>
<p>Cette lentille mérite d'être gardée. La prochaine fois qu'une ligne d'horizon, une inauguration, une rutilante « ville nouvelle » seront présentées comme la preuve qu'un lieu s'élève — là-bas ou n'importe où —, il vaut la peine de demander à qui le bâtiment s'adresse, et de bien regarder ce qui se tient juste à côté de lui. Parfois la rue voisine de la tour en dit plus que la tour.</p>$body$,
  'Que vous dit vraiment cette nouvelle tour ? | ONE EIGHT Journal',
  $ex$À Kinshasa et à Brazzaville, des tours de verre s'élèvent au bord de rues inondées et non goudronnées. Lue d'une façon, la ligne d'horizon est un progrès ; lue autrement, c'est un costume que l'État endosse — et la question est de savoir pour qui$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- it
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'when-a-skyline-is-a-costume')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'it',
  'Che cosa ti sta dicendo davvero quella nuova torre?',
  $ex$A Kinshasa e a Brazzaville i grattacieli di vetro si alzano accanto a strade allagate e non asfaltate. Letto in un modo, lo skyline è progresso; letto in un altro, è un costume che lo Stato indossa — e la domanda è per chi$ex$,
  $body$<p>Uno skyline di torri nuove si legge come progresso. Quando si alzano grattacieli di vetro, apre un centro commerciale, viene annunciata una "città nuova", lo prendiamo come segno che un posto si sta riprendendo, si sta sviluppando, sta salendo. Trattiamo gli edifici che riusciamo a vedere come prova che le cose funzionano.</p>
<p>Kinshasa e Brazzaville, le due capitali congolesi, fanno inciampare quella lettura. Le torri sono reali, ma lo è anche ciò che sta proprio accanto. Un grattacielo di lusso sull'Avenue Flamboyant di Kinshasa si erge sopra una strada così allagata che gli automobilisti pagano una tariffa informale per tagliare attraverso il piazzale dell'edificio ed evitare l'acqua. Cité du Fleuve, venduta come "la Dubai di Kinshasa", prometteva diecimila abitazioni su una palude bonificata; ne ha completate qualche centinaio, molte umide e consegnate in ritardo, circondate da quartieri poveri soggetti ad allagamenti. La Future Tower mostra al viale una facciata principale lucidata e a tutti gli altri fianchi crepati e incompiuti.</p>
<p>Brazzaville, sull'altra sponda del fiume, offre la stessa lezione su un'altra scala. Kintélé, un'intera città nuova avviata attorno a uno stadio olimpico da sessantamila posti, in un decennio è invecchiata fino alla vernice screpolata e alle strade non asfaltate; un funzionario locale ha detto a Ondoua che, attraversando il viadotto per entrarvi, bisognerebbe "chiudere gli occhi" per non vedere la rovina ai due lati. E quali quartieri ottengano le torri scintillanti non è lasciato al caso: il lato nord della città, la base del presidente, riceve le belle case; il sud resta in gran parte fuori.</p>
<p>Patrick Belinga Ondoua, che ha passato l'autunno del 2024 a percorrere i cantieri e le fiere immobiliari di entrambe le città, ha un nome per tutto questo: Sape di cemento (concrete Sape). La Sape è l'arte congolese del vestire — abiti firmati sgargianti indossati in quartieri poveri, eleganza messa in scena sopra la fatica, un modo di esistere facendosi vedere. Gli edifici, sostiene, fanno la stessa cosa in cemento. Una torre è un abito che lo Stato indossa. Non è solo alloggio o spazio per uffici; è esposizione.</p>
<p>E un costume lo si indossa per qualcuno. Il pubblico di queste torri non è in primo luogo chi ci abita accanto. Sono investitori stranieri, donatori e rivali regionali, e il messaggio è costante: siamo stabili, siamo capaci, ci stiamo sviluppando. Nella Repubblica Democratica del Congo il presidente Félix Tshisekedi è soprannominato "Fatshi Béton" — Fatshi Cemento — proprio per questo appetito. L'edificio è un argomento rivolto verso l'esterno, formulato in vetro e cemento.</p>
<p>Uno skyline, dunque, può essere un'affermazione anziché una misurazione. La torre nuova forse dice meno su come va davvero un paese che su ciò che il suo Stato ha bisogno di far credere agli altri. Una volta che lo vedi, la parte eloquente dell'immagine non è la facciata ma la cucitura — la linea in cui il fronte lucidato incontra la strada allagata, in cui il lato finito incontra quello crepato. Quel divario non è un difetto della rappresentazione. È il punto in cui si può leggere che cosa la rappresentazione sta coprendo.</p>
<p>Questa non è una storia di finte città africane, e Ondoua lavora perché non lo diventi. Gli edifici sono reali; qualcuno ci abita davvero; e per Stati realmente fragili — collocati vicino al fondo delle classifiche mondiali sul clima degli affari, ancora in guerra a est — proiettare ordine è una mossa razionale, non una sciocchezza. Nemmeno i residenti si lasciano ingannare. Nelle sue interviste sono spesso i tassisti e gli operai edili a nominare per primi il "bluff", pur pagando nel frattempo per attraversare il piazzale di una torre e sfuggire all'allagamento. La rappresentazione è reale, i suoi costi sono reali, e buona parte del suo pubblico locale sa già che è una rappresentazione.</p>
<p>Vale la pena tenersi questa lente. La prossima volta che uno skyline, un'inaugurazione, una scintillante "città nuova" vengono offerti come prova che un posto sta salendo — lì o altrove — vale la pena chiedersi a chi stia parlando l'edificio, e guardare bene qualunque cosa stia proprio accanto. A volte la strada di fianco alla torre dice più della torre.</p>$body$,
  'Che cosa ti sta dicendo davvero quella nuova torre? | ONE EIGHT Journal',
  $ex$A Kinshasa e a Brazzaville i grattacieli di vetro si alzano accanto a strade allagate e non asfaltate. Letto in un modo, lo skyline è progresso; letto in un altro, è un costume che lo Stato indossa — e la domanda è per chi$ex$,
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
  SELECT id FROM public.journal_articles WHERE slug = 'when-a-skyline-is-a-costume'
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
  'Belinga Ondoua, Patrick. "Concrete Sape: post-crisis urbanization and the political economy of the real estate boom in the Congos." Africa 95, no. 4 (2025): 392–423.',
  '10.1017/S0001972025101472',
  'https://doi.org/10.1017/S0001972025101472'
FROM article a;

COMMIT;

-- =============================================================================
-- END
-- =============================================================================
