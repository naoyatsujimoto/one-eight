-- =============================================================================
-- 20260908000000_journal_persecution_elite_resources_scotland_article.sql
-- 記事: oej-2026-persecution-elite-resources-scotland / who-could-afford-the-witch-hunt
-- 言語: en / ja / zh-Hant / zh-Hans / ko / es / pt-BR / de / fr / it
-- 適用: supabase db push (via migration)
-- 出典: approved/oej-2026-persecution-elite-resources-scotland_who-could-afford-the-witch-hunt_APPROVED_multilingual.md
-- 注記: tags はこの migration では扱わない（INSERT 列にも ON CONFLICT DO UPDATE にも含まれない）。
--       承認済みの 8 タグ（economic history / persecution / witch trials /
--       early modern Scotland / elites / climate / commodity prices / institutions）は
--       2026-09-08 のタグ更新指示書に基づき本番 DB へ登録済み。
--       この migration を再適用しても既存の tags は保持される。
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
  'who-could-afford-the-witch-hunt',
  'published',
  'ONE EIGHT Journal',
  '2026-09-08 01:01:21+09:00',
  '2026-09-08 00:00:00+09:00',
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
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'who-could-afford-the-witch-hunt')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'en',
  'Who Could Afford the Witch Hunt?',
  $ex$We blame persecution on hard times and frightened, hungry people. In early modern Scotland, the trials rose in the good years — when the men who ran the courts had money to spend$ex$,
  $body$<p>When we picture a witch hunt, we picture bad times. A failed harvest, a hard winter, frightened and hungry people looking for someone to blame. Persecution feels like something that boils up out of misery and fear — a symptom of scarcity. We reach for that explanation almost by reflex, for old cruelties and sometimes for new ones.</p>
<p>But a witch hunt is not cheap. Someone has to accuse the suspect, gather evidence, jail and feed and guard her, often torture her, petition distant Edinburgh for approval, stage the trial, and carry out the execution. Witchcraft was a secular crime in Scotland, tried by local courts, which meant local men had to pay for it. Jailing a single suspect in Aberdeen in 1596 cost about £20, at a time when a day-labourer earned forty pence. The accused rarely had money of their own — rarely even property worth seizing — so the hunt could not pay for itself. It was money spent, not money made. Someone with money had to want it done, and be able to fund it.</p>
<p>That someone was the local elite — the lairds, sheriffs, and burgh councils who ran the courts. Cornelius Christian set the Survey of Scottish Witchcraft, a record of 3,098 suspects named between 1563 and 1727, against the weather and the prices of the day. The result runs the wrong way for the misery story. Warmer growing seasons — the better years — came with more trials, not fewer.</p>
<p>You can put faces to those courts. In Dumfries in 1671, a woman named Janet Macmurdoch was tried and executed on the verdict of a jury drawn from the small lairds and larger tenants living within about ten miles. The people deciding a witch's fate were the local landholders — the same rank of men whose fortunes rose with the price of wool and the warmth of the season.</p>
<p>The prices sharpen the point. When wool and herring, Scotland's taxable export goods, rose in price and filled the pockets of the elites who traded and taxed them, the trials rose too. When the price of oats moved — the crop ordinary people actually ate — the trials did not budge. The hunts tracked the income of the powerful, not the hunger of the poor.</p>
<p>The pattern holds strongest where money should make it strongest. Trials climbed higher near Edinburgh, where a court could get its approval quickly, and in counties with more justices of the peace, where a prosecution was cheaper to run. They climbed less far from the capital, and far from the trading ports where the export money came ashore. Where the courts were cheap and the elite's income close at hand, the accusations followed.</p>
<p>So the witch hunt starts to look less like a fever and more like a purchase. Not a spasm of the desperate, but a project of the comfortable — something taken up when there is surplus to spend on it. You can even see it in the machinery's pauses and surges: while an occupying English army held Scotland, the trials nearly stopped; when the army left in 1660 and the local courts were free to act again, more than six hundred trials followed in 1661 and 1662 — up from just two the year before. What moved was not a sudden wave of fresh fear. It was who had the room and the resources to prosecute.</p>
<p>This is not the usual shape of the story. Where the witch-blaming of other places has been traced to cold and want — ruined crops, frightened people hunting for someone to punish — Scotland runs the other way. The accusations here did not peak when the poor were most desperate. They peaked when the men who paid for the courts had the most to spend.</p>
<p>Christian is careful about how far this reaches. The records show a pattern; the mechanism — elite income turning into prosecutions — is his reading of it, with prices standing in for wealth that no surviving ledger records directly. But the pattern is stubborn. Warm years and rising export prices bring more trials; the price of the poor's own grain brings none. The link even passes a basic sanity check: next year's weather, which cannot reach back to cause this year's trials, predicts nothing. Whatever exactly carried the money, the hunts rose and fell with the fortunes of the men who ran them.</p>
<p>The lens is worth keeping past Scotland. When we explain cruelty — then or now — we reach first for desperation: they were poor, they were frightened, they didn't know better. Sometimes that is right. But it is worth also asking the colder question these trials put to us: who could afford this, and who was doing well while it happened? Persecution can be a luxury as much as a panic — something that arrives not when people have nothing left to lose, but when someone has enough to spend.</p>$body$,
  'Who Could Afford the Witch Hunt? | ONE EIGHT Journal',
  $ex$We blame persecution on hard times and frightened, hungry people. In early modern Scotland, the trials rose in the good years — when the men who ran the courts had money to spend$ex$,
  true
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ja
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'who-could-afford-the-witch-hunt')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'ja',
  'その魔女狩りを、支払えたのは誰か',
  $ex$私たちは迫害を、苦しい時代と、怯えて飢えた人々のせいにする。近世スコットランドでは、裁判が増えたのは豊かな年だった——法廷を動かす者たちに、使えるお金があった年に$ex$,
  $body$<p>魔女狩りを思い描くとき、私たちは悪い時代を思い描く。凶作、厳しい冬、怯えて飢えた人々が、誰かを責めようとする。迫害は、みじめさと恐れから沸き上がるもの——欠乏の症状のように感じられる。古い残虐にも、ときに新しい残虐にも、私たちはほとんど反射でこの説明に手を伸ばす。</p>
<p>だが、魔女狩りは安くない。誰かが容疑者を告発し、証拠を集め、投獄して食わせて見張り、しばしば拷問し、遠いエディンバラに承認を請い、裁判を仕立て、処刑を執り行う。スコットランドで魔術は世俗の犯罪で、地元の法廷が裁いた。つまり、その費用は地元の者が払った。1596年、アバディーンで容疑者を一人投獄するのに約20ポンドかかった。日雇い労働者の稼ぎが一日40ペンスの時代にである。告発された側にお金があることはまれで、差し押さえるほどの財産を持つ者もまれだった。だから魔女狩りは、自らの費用すら賄えない。使われるお金であって、生み出すお金ではなかった。お金を持つ誰かが、それを望み、支払える必要があった。</p>
<p>その誰かとは、地元のエリートだった。法廷を動かす、郷紳(レアド)や州長官(シェリフ)、都市の参事会である。Cornelius Christian は、1563年から1727年のあいだに名指された3,098人の容疑者の記録「スコットランド魔術調査(Survey of Scottish Witchcraft)」を、当時の気候と物価に突き合わせた。結果は、みじめさの物語とは逆を向く。生育期が暖かい年——つまり良い年——ほど、裁判は減るのではなく、増えた。</p>
<p>その法廷には、顔がある。1671年、ダンフリーズで、ジャネット・マクマードクという女性が裁かれ、処刑された。彼女を有罪とした陪審は、およそ十マイル以内に住む小郷紳(レアド)や大きめの借地農から選ばれていた。魔女の運命を決めていたのは、土地を持つ地元の者たち——羊毛の価格と季節の暖かさとともに懐が潤う、まさにその階層の男たちだった。</p>
<p>物価が、その点を鋭くする。スコットランドの課税輸出品である羊毛とニシンの価格が上がり、それを商い課税するエリートの懐を潤したとき、裁判も増えた。庶民が実際に食べていた作物、オーツ麦の価格が動いても、裁判は動かなかった。魔女狩りは、貧者の飢えではなく、権力者の所得をなぞっていた。</p>
<p>このパターンは、お金が効くはずの場所で、いちばん強く出る。裁判は、承認をすぐ得られるエディンバラの近くで、そして訴追費用を安く抑えられる治安判事(JP)の多い県で、より高く積み上がった。首都から遠い県、輸出のお金が陸揚げされる交易港から遠い県では、伸びは鈍かった。法廷が安上がりで、エリートの所得が手近なところで、告発は続いた。</p>
<p>こうして魔女狩りは、熱病というより、購入に見えてくる。追いつめられた者の発作ではなく、余裕ある者の事業——使える余剰があるときに手をつけるもの、だ。その機構の、止まりと高まりにも見てとれる。占領するイングランド軍がスコットランドを押さえていたあいだ、裁判はほぼ止まった。1660年に軍が去り、地元の法廷がまた動けるようになると、1661年と1662年だけで六百件を超える裁判が続いた——前年はわずか二件だったのに。動いたのは、新たな恐れの波ではない。誰に、訴追する余地と資源があったか、だった。</p>
<p>これは、物語のいつもの形ではない。ほかの土地の魔女非難が、寒さと欠乏——駄目になった作物、罰する相手を探す怯えた人々——に跡づけられてきたのに対し、スコットランドは逆を行く。ここでの告発は、貧者がもっとも切羽詰まったときに高まったのではない。法廷にお金を出す者たちに、もっとも使う余裕があったときに、高まった。</p>
<p>Christian は、これがどこまで及ぶかに慎重だ。記録が示すのはパターンであり、その機構——エリートの所得が訴追に変わる——は彼の読みだ。物価は、どの現存帳簿も直接は記さない富の、代わりの指標である。だが、パターンは頑固だ。暖かい年と輸出価格の上昇は裁判を増やし、貧者自身の穀物の価格は何も増やさない。この結びつきは、素朴な検証にも耐える。翌年の天候は、当年の裁判を引き起こしようがないのに、何も予測しない。お金を運んだのが正確には何であれ、魔女狩りは、それを動かす者たちの懐具合とともに増え、減った。</p>
<p>このレンズは、スコットランドの外でも使う値打ちがある。残虐を——過去のものも、いまのものも——説明するとき、私たちはまず追いつめられた事情に手を伸ばす。貧しかった、怯えていた、無知だった、と。それが正しいこともある。だが、この裁判が突きつける冷たい問いも、あわせて問う値打ちがある。これを支払えたのは誰か。それが起きているあいだ、うまくいっていたのは誰か。迫害は、恐慌であると同じくらい、贅沢でもありうる——失うもののない人々のところにではなく、使えるだけのものを持つ誰かのところに、やってくる。</p>$body$,
  'その魔女狩りを、支払えたのは誰か | ONE EIGHT Journal',
  $ex$私たちは迫害を、苦しい時代と、怯えて飢えた人々のせいにする。近世スコットランドでは、裁判が増えたのは豊かな年だった——法廷を動かす者たちに、使えるお金があった年に$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- zh-Hant
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'who-could-afford-the-witch-hunt')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'zh-Hant',
  '那場獵巫，誰付得起？',
  $ex$我們把迫害歸咎於艱困的年代，歸咎於受驚而飢餓的人。但在近代早期的蘇格蘭，審判增加的是好年頭——是掌管法庭的那些人有錢可花的時候$ex$,
  $body$<p>想像一場獵巫時，我們想像的是壞年頭。歉收，嚴冬，受驚又飢餓的人們四處尋找可以怪罪的對象。迫害感覺像是從悲慘與恐懼裡沸騰出來的東西——一種匱乏的症狀。對於古老的殘酷，有時也對於新的殘酷，我們幾乎是反射性地伸手去拿這個解釋。</p>
<p>但獵巫並不便宜。得有人去指控嫌疑人，蒐集證據，把她關起來、餵她、看守她，往往還要對她用刑，向遙遠的愛丁堡請求批准，張羅審判，最後執行處決。在蘇格蘭，巫術是世俗的罪，由地方法庭審理，這意味著費用得由地方上的人來付。1596年在亞伯丁，光是關押一名嫌疑人就要花上約20英鎊，而當時一名散工一天的工資是四十便士。被告很少有自己的錢——甚至很少有值得查抄的財產——所以這場追捕無法自負盈虧。那是花出去的錢，不是賺回來的錢。必須有個有錢的人想要它發生，而且付得起。</p>
<p>那個人，就是地方上的權貴——掌管法庭的鄉紳、郡治安官與市鎮參事會。Cornelius Christian 把《蘇格蘭巫術調查》——一份記載了1563年到1727年間被指名的3,098名嫌疑人的紀錄——與當時的天候和物價對照起來。結果與那個「悲慘故事」的走向相反。生長季較溫暖的年份——也就是比較好的年份——伴隨的是更多的審判，而不是更少。</p>
<p>那些法庭是有臉孔的。1671年在鄧弗里斯，一位名叫珍妮特·麥克默多克的女性受審並被處決，判她有罪的陪審團，來自住在方圓約十英里內的小鄉紳與較大的佃農。決定一名「女巫」命運的，正是地方上的土地持有者——與羊毛價格和季節的溫暖一同水漲船高的，正是同一個階層的男人。</p>
<p>物價讓這一點更加鋒利。當羊毛與鯡魚——蘇格蘭應稅的出口貨品——價格上漲，塞滿了經手交易與課稅的權貴口袋時，審判也隨之上升。而當燕麥的價格變動時——那是尋常百姓真正吃的作物——審判卻紋風不動。這些追捕跟隨的是有權者的收入，不是窮人的飢餓。</p>
<p>這個模式在金錢最該發揮作用的地方最強。在愛丁堡附近，審判攀得更高，因為法庭能較快取得批准；在治安法官較多的郡也是如此，因為在那裡起訴的成本更低。離首都愈遠，離出口錢款上岸的貿易港愈遠，攀升的幅度就愈小。凡是法庭便宜、權貴的收入又近在手邊的地方，指控就跟著來。</p>
<p>於是獵巫看起來愈來愈不像一場高燒，而更像一次購買。不是絕望者的痙攣，而是有餘裕者的一項事業——在有多餘的錢可花時才著手的事。你甚至能從這部機器的停頓與激增裡看出來：在一支占領的英格蘭軍隊控制蘇格蘭期間，審判幾乎停止；1660年軍隊撤離、地方法庭重新得以行動之後，1661與1662兩年就有超過六百件審判——而前一年只有兩件。移動的並不是一波突然湧現的新恐懼。移動的是誰擁有起訴的空間與資源。</p>
<p>這不是這個故事慣常的形狀。在別的地方，怪罪女巫的行為被追溯到寒冷與匱乏——毀掉的作物，受驚的人們尋找可以懲罰的對象——而蘇格蘭走的是反方向。這裡的指控並沒有在窮人最走投無路的時候達到高峰。它們達到高峰，是在為法庭掏錢的那些人最有餘裕可花的時候。</p>
<p>Christian 對這件事能推到多遠十分謹慎。紀錄顯示的是一個模式；至於其中的機制——權貴的收入轉化為起訴——是他的讀法，而物價則充當了那份沒有任何現存帳冊直接記載的財富的代理指標。但這個模式很頑固。溫暖的年份與上漲的出口價格帶來更多審判；窮人自己那種穀物的價格則什麼也沒帶來。這個關聯甚至通得過一個基本的合理性檢驗：明年的天氣無法回頭造成今年的審判，而它也的確什麼都預測不出來。無論確切是什麼在輸送這些錢，獵巫的起落，都跟著操辦它的那些人的財運。</p>
<p>這面透鏡值得帶出蘇格蘭之外。當我們解釋殘酷——不論是過去的還是當下的——我們最先伸手去拿的是走投無路：他們窮，他們害怕，他們不懂事。有時候這是對的。但這些審判向我們拋出的那個更冷的問題，也值得一併問一問：誰付得起這件事，而在它發生的時候，誰過得不錯？迫害可以是恐慌，也同樣可以是一種奢侈——它到來的時刻，不是人們已經一無所失的時候，而是有人擁有足夠可花的東西的時候。</p>$body$,
  '那場獵巫，誰付得起？ | ONE EIGHT Journal',
  $ex$我們把迫害歸咎於艱困的年代，歸咎於受驚而飢餓的人。但在近代早期的蘇格蘭，審判增加的是好年頭——是掌管法庭的那些人有錢可花的時候$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- zh-Hans
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'who-could-afford-the-witch-hunt')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'zh-Hans',
  '那场猎巫，谁付得起？',
  $ex$我们把迫害归咎于艰困的年代，归咎于受惊而饥饿的人。但在近代早期的苏格兰，审判增加的是好年头——是掌管法庭的那些人有钱可花的时候$ex$,
  $body$<p>想象一场猎巫时，我们想象的是坏年头。歉收，严冬，受惊又饥饿的人们四处寻找可以怪罪的对象。迫害感觉像是从悲惨与恐惧里沸腾出来的东西——一种匮乏的症状。对于古老的残酷，有时也对于新的残酷，我们几乎是反射性地伸手去拿这个解释。</p>
<p>但猎巫并不便宜。得有人去指控嫌疑人，搜集证据，把她关起来、喂她、看守她，往往还要对她用刑，向遥远的爱丁堡请求批准，张罗审判，最后执行处决。在苏格兰，巫术是世俗的罪，由地方法庭审理，这意味着费用得由地方上的人来付。1596年在阿伯丁，光是关押一名嫌疑人就要花上约20英镑，而当时一名散工一天的工资是四十便士。被告很少有自己的钱——甚至很少有值得查抄的财产——所以这场追捕无法自负盈亏。那是花出去的钱，不是赚回来的钱。必须有个有钱的人想要它发生，而且付得起。</p>
<p>那个人，就是地方上的权贵——掌管法庭的乡绅、郡治安官与市镇参事会。Cornelius Christian 把《苏格兰巫术调查》——一份记载了1563年到1727年间被指名的3,098名嫌疑人的记录——与当时的天候和物价对照起来。结果与那个“悲惨故事”的走向相反。生长季较温暖的年份——也就是比较好的年份——伴随的是更多的审判，而不是更少。</p>
<p>那些法庭是有脸孔的。1671年在邓弗里斯，一位名叫珍妮特·麦克默多克的女性受审并被处决，判她有罪的陪审团，来自住在方圆约十英里内的小乡绅与较大的佃农。决定一名“女巫”命运的，正是地方上的土地持有者——与羊毛价格和季节的温暖一同水涨船高的，正是同一个阶层的男人。</p>
<p>物价让这一点更加锋利。当羊毛与鲱鱼——苏格兰应税的出口货品——价格上涨，塞满了经手交易与课税的权贵口袋时，审判也随之上升。而当燕麦的价格变动时——那是寻常百姓真正吃的作物——审判却纹丝不动。这些追捕跟随的是有权者的收入，不是穷人的饥饿。</p>
<p>这个模式在金钱最该发挥作用的地方最强。在爱丁堡附近，审判攀得更高，因为法庭能较快取得批准；在治安法官较多的郡也是如此，因为在那里起诉的成本更低。离首都愈远，离出口钱款上岸的贸易港愈远，攀升的幅度就愈小。凡是法庭便宜、权贵的收入又近在手边的地方，指控就跟着来。</p>
<p>于是猎巫看起来愈来愈不像一场高烧，而更像一次购买。不是绝望者的痉挛，而是有余裕者的一项事业——在有多余的钱可花时才着手的事。你甚至能从这部机器的停顿与激增里看出来：在一支占领的英格兰军队控制苏格兰期间，审判几乎停止；1660年军队撤离、地方法庭重新得以行动之后，1661与1662两年就有超过六百件审判——而前一年只有两件。移动的并不是一波突然涌现的新恐惧。移动的是谁拥有起诉的空间与资源。</p>
<p>这不是这个故事惯常的形状。在别的地方，怪罪女巫的行为被追溯到寒冷与匮乏——毁掉的作物，受惊的人们寻找可以惩罚的对象——而苏格兰走的是反方向。这里的指控并没有在穷人最走投无路的时候达到高峰。它们达到高峰，是在为法庭掏钱的那些人最有余裕可花的时候。</p>
<p>Christian 对这件事能推到多远十分谨慎。记录显示的是一个模式；至于其中的机制——权贵的收入转化为起诉——是他的读法，而物价则充当了那份没有任何现存账册直接记载的财富的代理指标。但这个模式很顽固。温暖的年份与上涨的出口价格带来更多审判；穷人自己那种谷物的价格则什么也没带来。这个关联甚至通得过一个基本的合理性检验：明年的天气无法回头造成今年的审判，而它也的确什么都预测不出来。无论确切是什么在输送这些钱，猎巫的起落，都跟着操办它的那些人的财运。</p>
<p>这面透镜值得带出苏格兰之外。当我们解释残酷——不论是过去的还是当下的——我们最先伸手去拿的是走投无路：他们穷，他们害怕，他们不懂事。有时候这是对的。但这些审判向我们抛出的那个更冷的问题，也值得一并问一问：谁付得起这件事，而在它发生的时候，谁过得不错？迫害可以是恐慌，也同样可以是一种奢侈——它到来的时刻，不是人们已经一无所失的时候，而是有人拥有足够可花的东西的时候。</p>$body$,
  '那场猎巫，谁付得起？ | ONE EIGHT Journal',
  $ex$我们把迫害归咎于艰困的年代，归咎于受惊而饥饿的人。但在近代早期的苏格兰，审判增加的是好年头——是掌管法庭的那些人有钱可花的时候$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ko
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'who-could-afford-the-witch-hunt')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'ko',
  '그 마녀사냥의 비용은 누가 감당할 수 있었나',
  $ex$우리는 박해를 어려운 시절과 겁먹고 굶주린 사람들의 탓으로 돌린다. 근대 초 스코틀랜드에서 재판이 늘어난 것은 좋은 해였다 — 법정을 움직이던 이들에게 쓸 돈이 있던 해에$ex$,
  $body$<p>마녀사냥을 떠올릴 때 우리는 나쁜 시절을 떠올린다. 흉작, 혹독한 겨울, 겁먹고 굶주린 사람들이 탓할 누군가를 찾는 장면. 박해는 비참함과 두려움에서 끓어오르는 것처럼 느껴진다 — 결핍의 증상처럼. 옛날의 잔혹에 대해서도, 때로는 오늘의 잔혹에 대해서도, 우리는 거의 반사적으로 그 설명에 손을 뻗는다.</p>
<p>그러나 마녀사냥은 싸지 않다. 누군가는 혐의자를 고발하고, 증거를 모으고, 가두고 먹이고 지켜야 하며, 흔히 고문까지 하고, 멀리 에든버러에 승인을 청하고, 재판을 차리고, 처형을 집행해야 한다. 스코틀랜드에서 주술은 세속의 범죄였고 지방 법정이 재판했으니, 그 비용은 지방 사람들이 치러야 했다. 1596년 애버딘에서 혐의자 한 사람을 가두는 데 약 20파운드가 들었다. 날품팔이의 하루 벌이가 40펜스이던 시절이다. 고발당한 이들에게 자기 돈이 있는 경우는 드물었고 — 압류할 만한 재산조차 드물었다 — 그래서 이 사냥은 스스로 비용을 대지 못했다. 그것은 쓰이는 돈이었지, 벌어들이는 돈이 아니었다. 돈을 가진 누군가가 그 일이 벌어지기를 원해야 했고, 그 비용을 댈 수 있어야 했다.</p>
<p>그 누군가는 지역의 유력자들이었다 — 법정을 움직이던 소지주(레어드), 주 장관(셰리프), 도시 참사회. Cornelius Christian은 1563년부터 1727년 사이에 이름이 오른 혐의자 3,098명의 기록인 「스코틀랜드 주술 조사」를 당시의 날씨 및 물가와 맞대어 놓았다. 결과는 비참함의 이야기와 반대 방향으로 간다. 생육기가 더 따뜻했던 해 — 즉 더 좋은 해 — 에 재판은 줄어든 것이 아니라 늘었다.</p>
<p>그 법정에는 얼굴이 있다. 1671년 덤프리스에서 재닛 맥머독이라는 여성이 재판을 받고 처형되었는데, 그녀에게 유죄를 내린 배심은 반경 약 10마일 안에 사는 소지주와 규모가 큰 소작농들로 꾸려졌다. 한 '마녀'의 운명을 정하던 이들은 그 지역의 토지 보유자들이었다 — 양모 값과 계절의 따뜻함에 따라 형편이 나아지던, 바로 그 계층의 남자들이다.</p>
<p>물가가 이 점을 더 날카롭게 만든다. 스코틀랜드의 과세 수출품이던 양모와 청어의 값이 오르고, 그것을 거래하고 과세하던 유력자들의 주머니가 두둑해지자 재판도 함께 늘었다. 평범한 사람들이 실제로 먹던 작물인 귀리의 값이 움직였을 때는, 재판은 꿈쩍도 하지 않았다. 이 사냥들은 가난한 이들의 굶주림이 아니라 권력자들의 소득을 따라갔다.</p>
<p>이 양상은 돈이 가장 크게 작용해야 할 곳에서 가장 강하게 나타난다. 재판은 에든버러 가까이에서 더 높이 치솟았다. 그곳에서는 법정이 승인을 빨리 받을 수 있었기 때문이다. 치안판사가 더 많은 주에서도 그랬다. 그곳에서는 기소를 굴리는 비용이 더 쌌기 때문이다. 수도에서 멀수록, 그리고 수출 대금이 뭍에 오르던 교역항에서 멀수록 상승 폭은 작았다. 법정이 값싸고 유력자의 소득이 가까이 있는 곳에서, 고발이 뒤따랐다.</p>
<p>그리하여 마녀사냥은 열병이라기보다 점점 하나의 구매처럼 보이기 시작한다. 절박한 이들의 경련이 아니라 여유 있는 이들의 사업 — 쓸 여윳돈이 있을 때 착수하는 일. 그 기계의 멈춤과 급증에서도 그것이 보인다. 점령한 잉글랜드 군대가 스코틀랜드를 장악하고 있는 동안 재판은 거의 멈췄다. 1660년에 군대가 떠나고 지방 법정이 다시 움직일 수 있게 되자, 1661년과 1662년에만 육백 건이 넘는 재판이 이어졌다 — 그 전해에는 겨우 두 건이었는데. 움직인 것은 갑자기 밀려온 새로운 공포의 물결이 아니었다. 누구에게 기소할 여지와 자원이 있었는가였다.</p>
<p>이것은 이 이야기의 익숙한 모양이 아니다. 다른 곳에서 마녀 탓하기가 추위와 궁핍 — 망가진 작물, 벌할 상대를 찾는 겁먹은 사람들 — 으로 거슬러 올라가 설명되어 온 것과 달리, 스코틀랜드는 반대로 간다. 이곳의 고발은 가난한 이들이 가장 절박했을 때 정점에 이르지 않았다. 법정의 값을 치르던 사내들에게 쓸 것이 가장 많았을 때 정점에 이르렀다.</p>
<p>Christian은 이것이 어디까지 미치는지에 대해 신중하다. 기록이 보여 주는 것은 하나의 양상이고, 그 기제 — 유력자의 소득이 기소로 바뀐다는 것 — 는 그의 읽기다. 물가는 어떤 현존 장부도 직접 기록하지 않은 부(富)를 대신하는 지표로 놓였다. 그러나 그 양상은 완강하다. 따뜻한 해와 오르는 수출 가격은 더 많은 재판을 불러오고, 가난한 이들이 먹던 곡물의 값은 아무것도 불러오지 않는다. 이 연결은 기본적인 타당성 점검도 통과한다. 이듬해의 날씨는 올해의 재판을 거슬러 일으킬 수 없는데, 실제로 아무것도 예측하지 못한다. 정확히 무엇이 그 돈을 실어 날랐든, 사냥은 그것을 운영하던 이들의 형편과 함께 오르내렸다.</p>
<p>이 렌즈는 스코틀랜드 바깥까지 가지고 갈 만하다. 잔혹을 설명할 때 — 그때의 것이든 지금의 것이든 — 우리는 먼저 절박함에 손을 뻗는다. 그들은 가난했고, 겁먹었고, 더 잘 알지 못했다고. 때로는 그것이 옳다. 그러나 이 재판들이 우리에게 들이미는 더 차가운 질문도 함께 물어볼 만하다. 누가 이 일을 감당할 수 있었는가, 그리고 그것이 벌어지는 동안 누가 잘 지내고 있었는가? 박해는 공황인 만큼이나 사치일 수도 있다 — 사람들에게 더 잃을 것이 남지 않았을 때가 아니라, 누군가에게 쓸 만큼이 있을 때 찾아오는 것이다.</p>$body$,
  '그 마녀사냥의 비용은 누가 감당할 수 있었나 | ONE EIGHT Journal',
  $ex$우리는 박해를 어려운 시절과 겁먹고 굶주린 사람들의 탓으로 돌린다. 근대 초 스코틀랜드에서 재판이 늘어난 것은 좋은 해였다 — 법정을 움직이던 이들에게 쓸 돈이 있던 해에$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- es
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'who-could-afford-the-witch-hunt')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'es',
  '¿Quién podía permitirse la caza de brujas?',
  $ex$Culpamos de la persecución a los malos tiempos y a gente asustada y hambrienta. En la Escocia de la primera Edad Moderna, los juicios aumentaron en los años buenos, cuando los hombres que dirigían los tribunales tenían dinero para gastar$ex$,
  $body$<p>Cuando imaginamos una caza de brujas, imaginamos malos tiempos. Una cosecha perdida, un invierno duro, gente asustada y hambrienta buscando a quién culpar. La persecución se siente como algo que hierve y sube desde la miseria y el miedo: un síntoma de la escasez. Echamos mano de esa explicación casi por reflejo, para las crueldades antiguas y a veces también para las nuevas.</p>
<p>Pero una caza de brujas no es barata. Alguien tiene que acusar a la sospechosa, reunir pruebas, encarcelarla, alimentarla y vigilarla, a menudo torturarla, pedir la aprobación de la lejana Edimburgo, montar el juicio y llevar a cabo la ejecución. En Escocia la brujería era un delito secular, juzgado por tribunales locales, lo que significaba que eran los hombres del lugar quienes debían pagarlo. Encarcelar a una sola sospechosa en Aberdeen en 1596 costaba unas 20 libras, en una época en que un jornalero ganaba cuarenta peniques. Las acusadas rara vez tenían dinero propio —rara vez siquiera bienes que valiera la pena confiscar—, así que la cacería no podía costearse a sí misma. Era dinero gastado, no dinero ganado. Alguien con dinero tenía que quererlo y poder financiarlo.</p>
<p>Ese alguien era la élite local: los lairds, los sheriffs y los concejos de los burgos que dirigían los tribunales. Cornelius Christian cotejó el Survey of Scottish Witchcraft, un registro de 3.098 sospechosos nombrados entre 1563 y 1727, con el clima y los precios de la época. El resultado va en dirección contraria al relato de la miseria. Las estaciones de crecimiento más cálidas —los años mejores— vinieron con más juicios, no con menos.</p>
<p>A esos tribunales se les pueden poner caras. En Dumfries, en 1671, una mujer llamada Janet Macmurdoch fue juzgada y ejecutada por el veredicto de un jurado formado por pequeños lairds y arrendatarios acomodados que vivían a unas diez millas a la redonda. Quienes decidían la suerte de una bruja eran los terratenientes del lugar: los mismos hombres cuya fortuna subía con el precio de la lana y con el calor de la estación.</p>
<p>Los precios afilan el argumento. Cuando la lana y el arenque, los bienes de exportación gravables de Escocia, subieron de precio y llenaron los bolsillos de las élites que los comerciaban y los gravaban, los juicios también subieron. Cuando se movió el precio de la avena —el cultivo que la gente común comía de verdad—, los juicios no se movieron. Las cacerías seguían los ingresos de los poderosos, no el hambre de los pobres.</p>
<p>El patrón se sostiene con más fuerza allí donde el dinero debería hacerlo más fuerte. Los juicios trepaban más cerca de Edimburgo, donde un tribunal podía obtener la aprobación con rapidez, y en los condados con más jueces de paz, donde procesar salía más barato. Trepaban menos lejos de la capital, y lejos de los puertos comerciales por donde entraba el dinero de la exportación. Donde los tribunales eran baratos y los ingresos de la élite estaban a mano, las acusaciones venían detrás.</p>
<p>Así, la caza de brujas empieza a parecer menos una fiebre y más una compra. No un espasmo de los desesperados, sino un proyecto de los acomodados: algo que se emprende cuando hay excedente para gastar en ello. Se ve incluso en las pausas y los arranques de la maquinaria: mientras un ejército inglés de ocupación dominó Escocia, los juicios casi se detuvieron; cuando el ejército se marchó en 1660 y los tribunales locales quedaron libres para actuar de nuevo, siguieron más de seiscientos juicios en 1661 y 1662, frente a apenas dos el año anterior. Lo que se movió no fue una oleada repentina de miedo nuevo. Fue quién tenía el margen y los recursos para procesar.</p>
<p>Esta no es la forma habitual del relato. Allí donde la culpa echada a las brujas se ha rastreado hasta el frío y la carencia —cosechas arruinadas, gente asustada buscando a quién castigar—, Escocia va al revés. Aquí las acusaciones no alcanzaron su punto más alto cuando los pobres estaban más desesperados. Lo alcanzaron cuando los hombres que pagaban los tribunales tenían más para gastar.</p>
<p>Christian es prudente sobre hasta dónde llega esto. Los registros muestran un patrón; el mecanismo —los ingresos de la élite convertidos en procesos— es su lectura, con los precios haciendo las veces de una riqueza que ningún libro de cuentas conservado registra de forma directa. Pero el patrón es tozudo. Los años cálidos y los precios de exportación al alza traen más juicios; el precio del propio grano de los pobres no trae ninguno. El vínculo incluso supera una comprobación básica de sensatez: el clima del año siguiente, que no puede volver atrás para causar los juicios de este año, no predice nada. Fuera lo que fuera lo que transportaba el dinero, las cacerías subían y bajaban con la fortuna de los hombres que las dirigían.</p>
<p>Vale la pena conservar esta lente más allá de Escocia. Cuando explicamos la crueldad —de entonces o de ahora—, echamos mano primero de la desesperación: eran pobres, estaban asustados, no sabían más. A veces eso es cierto. Pero también vale la pena hacer la pregunta más fría que nos plantean estos juicios: ¿quién podía permitirse esto, y a quién le iba bien mientras ocurría? La persecución puede ser tanto un lujo como un pánico: algo que llega no cuando a la gente ya no le queda nada que perder, sino cuando alguien tiene bastante para gastar.</p>$body$,
  '¿Quién podía permitirse la caza de brujas? | ONE EIGHT Journal',
  $ex$Culpamos de la persecución a los malos tiempos y a gente asustada y hambrienta. En la Escocia de la primera Edad Moderna, los juicios aumentaron en los años buenos, cuando los hombres que dirigían los tribunales tenían dinero para gastar$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- pt-BR
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'who-could-afford-the-witch-hunt')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'pt-BR',
  'Quem podia pagar a caça às bruxas?',
  $ex$Atribuímos a perseguição aos tempos difíceis e a gente assustada e faminta. Na Escócia do início da era moderna, os julgamentos aumentaram nos anos bons — quando os homens que comandavam os tribunais tinham dinheiro para gastar$ex$,
  $body$<p>Quando imaginamos uma caça às bruxas, imaginamos tempos ruins. Uma colheita perdida, um inverno duro, gente assustada e faminta procurando alguém para culpar. A perseguição parece algo que ferve e sobe da miséria e do medo — um sintoma da escassez. Recorremos a essa explicação quase por reflexo, para as crueldades antigas e às vezes também para as novas.</p>
<p>Mas uma caça às bruxas não é barata. Alguém precisa acusar a suspeita, reunir provas, prendê-la, alimentá-la e vigiá-la, muitas vezes torturá-la, pedir a aprovação da distante Edimburgo, montar o julgamento e executar a sentença. Na Escócia a bruxaria era um crime secular, julgado por tribunais locais, o que significava que os homens do lugar tinham de pagar por isso. Manter uma única suspeita presa em Aberdeen, em 1596, custava cerca de 20 libras, numa época em que um diarista ganhava quarenta pence. As acusadas raramente tinham dinheiro próprio — raramente tinham sequer bens que valesse a pena confiscar —, de modo que a caçada não se pagava. Era dinheiro gasto, não dinheiro ganho. Alguém com dinheiro tinha de querer que aquilo acontecesse e de poder bancá-lo.</p>
<p>Esse alguém era a elite local: os lairds, os sheriffs e os conselhos dos burgos que comandavam os tribunais. Cornelius Christian confrontou o Survey of Scottish Witchcraft, um registro de 3.098 suspeitos nomeados entre 1563 e 1727, com o clima e os preços da época. O resultado corre na direção contrária à da história da miséria. As estações de cultivo mais quentes — os anos melhores — vieram com mais julgamentos, não com menos.</p>
<p>É possível dar rostos a esses tribunais. Em Dumfries, em 1671, uma mulher chamada Janet Macmurdoch foi julgada e executada pelo veredicto de um júri formado por pequenos lairds e arrendatários mais abastados que viviam num raio de cerca de dez milhas. Quem decidia o destino de uma bruxa eram os proprietários de terra do lugar — os mesmos homens cuja sorte subia com o preço da lã e com o calor da estação.</p>
<p>Os preços afiam o argumento. Quando a lã e o arenque, os produtos de exportação tributáveis da Escócia, subiram de preço e encheram os bolsos das elites que os negociavam e os tributavam, os julgamentos subiram junto. Quando o preço da aveia se mexeu — a lavoura que as pessoas comuns de fato comiam —, os julgamentos não se mexeram. As caçadas acompanhavam a renda dos poderosos, não a fome dos pobres.</p>
<p>O padrão se sustenta com mais força justamente onde o dinheiro deveria torná-lo mais forte. Os julgamentos subiam mais perto de Edimburgo, onde um tribunal conseguia sua aprovação depressa, e nos condados com mais juízes de paz, onde processar saía mais barato. Subiam menos longe da capital e longe dos portos comerciais por onde o dinheiro da exportação desembarcava. Onde os tribunais eram baratos e a renda da elite estava à mão, as acusações vinham atrás.</p>
<p>Assim, a caça às bruxas começa a parecer menos uma febre e mais uma compra. Não um espasmo dos desesperados, mas um projeto dos abastados — algo que se assume quando há excedente para gastar nisso. Dá para ver até nas pausas e nos surtos da engrenagem: enquanto um exército inglês de ocupação dominou a Escócia, os julgamentos quase pararam; quando o exército foi embora, em 1660, e os tribunais locais ficaram livres para agir de novo, vieram mais de seiscentos julgamentos em 1661 e 1662 — contra apenas dois no ano anterior. O que se moveu não foi uma onda repentina de medo novo. Foi quem tinha o espaço e os recursos para processar.</p>
<p>Esse não é o formato de sempre da história. Onde a culpa lançada sobre as bruxas foi rastreada até o frio e a falta — lavouras arruinadas, gente assustada à procura de alguém para punir —, a Escócia vai no sentido oposto. Aqui as acusações não chegaram ao auge quando os pobres estavam mais desesperados. Chegaram ao auge quando os homens que pagavam os tribunais tinham mais para gastar.</p>
<p>Christian é cuidadoso quanto ao alcance disso. Os registros mostram um padrão; o mecanismo — a renda da elite virando processos — é a leitura dele, com os preços fazendo as vezes de uma riqueza que nenhum livro-caixa sobrevivente registra diretamente. Mas o padrão é teimoso. Anos quentes e preços de exportação em alta trazem mais julgamentos; o preço do próprio grão dos pobres não traz nenhum. A ligação passa até por uma verificação básica de bom senso: o clima do ano seguinte, que não pode voltar atrás para causar os julgamentos deste ano, não prevê nada. Fosse o que fosse que carregava o dinheiro, as caçadas subiam e desciam junto com a sorte dos homens que as conduziam.</p>
<p>Vale guardar essa lente para além da Escócia. Quando explicamos a crueldade — a de então ou a de agora —, recorremos primeiro ao desespero: eram pobres, estavam com medo, não sabiam mais. Às vezes isso está certo. Mas vale também fazer a pergunta mais fria que esses julgamentos nos colocam: quem podia pagar por isso, e quem estava indo bem enquanto aquilo acontecia? A perseguição pode ser tanto um luxo quanto um pânico — algo que chega não quando as pessoas não têm mais nada a perder, mas quando alguém tem o bastante para gastar.</p>$body$,
  'Quem podia pagar a caça às bruxas? | ONE EIGHT Journal',
  $ex$Atribuímos a perseguição aos tempos difíceis e a gente assustada e faminta. Na Escócia do início da era moderna, os julgamentos aumentaram nos anos bons — quando os homens que comandavam os tribunais tinham dinheiro para gastar$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- de
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'who-could-afford-the-witch-hunt')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'de',
  'Wer konnte sich die Hexenjagd leisten?',
  $ex$Wir schieben Verfolgung auf schlechte Zeiten und auf verängstigte, hungrige Menschen. Im frühneuzeitlichen Schottland stiegen die Prozesse in den guten Jahren — wenn die Männer, die die Gerichte führten, Geld zum Ausgeben hatten$ex$,
  $body$<p>Wenn wir uns eine Hexenjagd vorstellen, stellen wir uns schlechte Zeiten vor. Eine missratene Ernte, einen harten Winter, verängstigte und hungrige Menschen, die jemanden suchen, dem sie die Schuld geben können. Verfolgung fühlt sich an wie etwas, das aus Elend und Angst hochkocht — ein Symptom des Mangels. Nach dieser Erklärung greifen wir fast reflexhaft, bei alten Grausamkeiten und manchmal auch bei neuen.</p>
<p>Aber eine Hexenjagd ist nicht billig. Jemand muss die Verdächtige anklagen, Beweise sammeln, sie einsperren, ernähren und bewachen, sie oft foltern, im fernen Edinburgh um Genehmigung ersuchen, den Prozess ausrichten und die Hinrichtung vollziehen. Hexerei war in Schottland ein weltliches Verbrechen, das von örtlichen Gerichten verhandelt wurde — was hieß, dass die Männer vor Ort dafür zahlen mussten. Eine einzige Verdächtige in Aberdeen einzusperren kostete 1596 etwa 20 Pfund, zu einer Zeit, in der ein Tagelöhner vierzig Pence verdiente. Die Angeklagten hatten selten eigenes Geld — selten überhaupt Besitz, den zu beschlagnahmen sich lohnte —, also konnte sich die Jagd nicht selbst tragen. Es war ausgegebenes Geld, kein verdientes. Jemand mit Geld musste es wollen und es finanzieren können.</p>
<p>Dieser Jemand war die örtliche Oberschicht — die Lairds, die Sheriffs und die Stadträte der Burghs, die die Gerichte führten. Cornelius Christian stellte den Survey of Scottish Witchcraft, ein Verzeichnis von 3.098 zwischen 1563 und 1727 benannten Verdächtigen, dem Wetter und den Preisen der Zeit gegenüber. Das Ergebnis läuft der Elendserzählung entgegen. Wärmere Wachstumsperioden — die besseren Jahre — gingen mit mehr Prozessen einher, nicht mit weniger.</p>
<p>Diesen Gerichten lassen sich Gesichter geben. In Dumfries wurde 1671 eine Frau namens Janet Macmurdoch vor Gericht gestellt und hingerichtet, auf den Spruch einer Jury hin, die aus kleinen Lairds und größeren Pächtern bestand, die im Umkreis von etwa zehn Meilen lebten. Über das Schicksal einer Hexe entschieden die örtlichen Grundbesitzer — genau jene Schicht von Männern, deren Vermögen mit dem Wollpreis und der Wärme der Jahreszeit stieg.</p>
<p>Die Preise schärfen den Punkt. Als Wolle und Hering, Schottlands steuerpflichtige Exportgüter, im Preis stiegen und die Taschen der Eliten füllten, die mit ihnen handelten und sie besteuerten, stiegen auch die Prozesse. Als sich der Haferpreis bewegte — die Feldfrucht, die die einfachen Leute tatsächlich aßen —, rührten sich die Prozesse nicht. Die Jagden folgten dem Einkommen der Mächtigen, nicht dem Hunger der Armen.</p>
<p>Das Muster hält dort am stärksten, wo Geld es am stärksten machen sollte. Die Prozesse stiegen höher in der Nähe von Edinburgh, wo ein Gericht rasch seine Genehmigung bekam, und in Grafschaften mit mehr Friedensrichtern, wo eine Anklage billiger zu führen war. Weniger stiegen sie fern der Hauptstadt und fern der Handelshäfen, wo das Exportgeld an Land kam. Wo die Gerichte billig und die Einkünfte der Oberschicht nah waren, folgten die Anschuldigungen.</p>
<p>So sieht die Hexenjagd immer weniger nach einem Fieber aus und immer mehr nach einem Kauf. Kein Krampf der Verzweifelten, sondern ein Vorhaben der Wohlhabenden — etwas, das man angeht, wenn ein Überschuss da ist, den man dafür ausgeben kann. Man sieht es sogar an den Pausen und Schüben der Maschinerie: Solange ein englisches Besatzungsheer Schottland hielt, kamen die Prozesse fast zum Erliegen; als das Heer 1660 abzog und die örtlichen Gerichte wieder handeln konnten, folgten 1661 und 1662 mehr als sechshundert Prozesse — nach nur zweien im Jahr davor. Was sich bewegte, war keine plötzliche Welle frischer Angst. Es war die Frage, wer den Spielraum und die Mittel hatte zu verfolgen.</p>
<p>Das ist nicht die übliche Form der Geschichte. Wo man das Hexenbeschuldigen anderswo auf Kälte und Not zurückgeführt hat — verdorbene Ernten, verängstigte Menschen auf der Suche nach jemandem, den man bestrafen kann —, läuft Schottland andersherum. Die Anschuldigungen erreichten hier ihren Höhepunkt nicht, als die Armen am verzweifeltsten waren. Sie erreichten ihn, als die Männer, die die Gerichte bezahlten, am meisten auszugeben hatten.</p>
<p>Christian ist vorsichtig damit, wie weit das reicht. Die Aufzeichnungen zeigen ein Muster; der Mechanismus — Einkünfte der Oberschicht, die sich in Anklagen verwandeln — ist seine Lesart, wobei die Preise für einen Reichtum einstehen, den kein erhaltenes Rechnungsbuch unmittelbar festhält. Doch das Muster ist hartnäckig. Warme Jahre und steigende Exportpreise bringen mehr Prozesse; der Preis des Getreides der Armen bringt keine. Die Verbindung besteht sogar eine einfache Plausibilitätsprüfung: Das Wetter des nächsten Jahres, das die Prozesse dieses Jahres nicht rückwirkend verursachen kann, sagt nichts vorher. Was auch immer genau das Geld trug — die Jagden stiegen und fielen mit dem Wohlergehen der Männer, die sie betrieben.</p>
<p>Diese Linse lohnt sich über Schottland hinaus. Wenn wir Grausamkeit erklären — die damalige wie die heutige —, greifen wir zuerst nach der Verzweiflung: Sie waren arm, sie hatten Angst, sie wussten es nicht besser. Manchmal stimmt das. Aber es lohnt sich, auch die kältere Frage zu stellen, die diese Prozesse uns vorlegen: Wer konnte sich das leisten, und wem ging es gut, während es geschah? Verfolgung kann ebenso ein Luxus sein wie eine Panik — etwas, das nicht dann kommt, wenn Menschen nichts mehr zu verlieren haben, sondern wenn jemand genug zum Ausgeben hat.</p>$body$,
  'Wer konnte sich die Hexenjagd leisten? | ONE EIGHT Journal',
  $ex$Wir schieben Verfolgung auf schlechte Zeiten und auf verängstigte, hungrige Menschen. Im frühneuzeitlichen Schottland stiegen die Prozesse in den guten Jahren — wenn die Männer, die die Gerichte führten, Geld zum Ausgeben hatten$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- fr
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'who-could-afford-the-witch-hunt')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'fr',
  'Qui pouvait s''offrir la chasse aux sorcières ?',
  $ex$Nous imputons la persécution aux temps difficiles et à des gens effrayés et affamés. Dans l'Écosse du début de l'époque moderne, les procès ont augmenté les bonnes années — quand les hommes qui tenaient les tribunaux avaient de l'argent à dépenser$ex$,
  $body$<p>Quand nous imaginons une chasse aux sorcières, nous imaginons de mauvaises années. Une récolte perdue, un hiver rude, des gens effrayés et affamés cherchant quelqu'un à blâmer. La persécution donne l'impression de monter en bouillonnant de la misère et de la peur — un symptôme de la pénurie. Nous saisissons cette explication presque par réflexe, pour les cruautés anciennes et parfois pour les nouvelles.</p>
<p>Mais une chasse aux sorcières n'est pas bon marché. Il faut que quelqu'un accuse la suspecte, rassemble les preuves, l'emprisonne, la nourrisse et la garde, souvent la torture, sollicite l'approbation de la lointaine Édimbourg, monte le procès et exécute la sentence. En Écosse, la sorcellerie était un crime séculier, jugé par des tribunaux locaux, ce qui voulait dire que les hommes du lieu devaient payer. Emprisonner une seule suspecte à Aberdeen en 1596 coûtait environ 20 livres, à une époque où un journalier gagnait quarante pence. Les accusées avaient rarement de l'argent à elles — rarement même des biens qui vaillent la peine d'être saisis —, si bien que la chasse ne pouvait pas se financer elle-même. C'était de l'argent dépensé, non de l'argent gagné. Il fallait que quelqu'un ayant de l'argent le veuille, et puisse le financer.</p>
<p>Ce quelqu'un, c'était l'élite locale : les lairds, les shérifs et les conseils de bourgs qui tenaient les tribunaux. Cornelius Christian a confronté le Survey of Scottish Witchcraft, un relevé de 3 098 suspects nommés entre 1563 et 1727, au climat et aux prix de l'époque. Le résultat va à rebours du récit de la misère. Les saisons de croissance plus chaudes — les meilleures années — se sont accompagnées de plus de procès, non de moins.</p>
<p>On peut mettre des visages sur ces tribunaux. À Dumfries, en 1671, une femme nommée Janet Macmurdoch fut jugée et exécutée sur le verdict d'un jury composé de petits lairds et de fermiers plus aisés vivant dans un rayon d'environ dix milles. Ceux qui décidaient du sort d'une sorcière étaient les propriétaires terriens du lieu — ces mêmes hommes dont la fortune montait avec le prix de la laine et la douceur de la saison.</p>
<p>Les prix aiguisent le propos. Quand la laine et le hareng, les biens d'exportation taxables de l'Écosse, montaient de prix et remplissaient les poches des élites qui les négociaient et les taxaient, les procès montaient aussi. Quand le prix de l'avoine bougeait — la culture que les gens ordinaires mangeaient réellement —, les procès ne bougeaient pas. Les chasses suivaient les revenus des puissants, non la faim des pauvres.</p>
<p>Le schéma tient le plus fermement là où l'argent devrait le rendre le plus fort. Les procès grimpaient davantage près d'Édimbourg, où un tribunal obtenait vite son approbation, et dans les comtés comptant plus de juges de paix, où une poursuite coûtait moins cher à mener. Ils grimpaient moins loin de la capitale, et loin des ports de commerce où l'argent de l'exportation débarquait. Là où les tribunaux étaient bon marché et où les revenus de l'élite se trouvaient à portée de main, les accusations suivaient.</p>
<p>Ainsi la chasse aux sorcières se met à ressembler moins à une fièvre qu'à un achat. Non le spasme des désespérés, mais le projet des gens à l'aise — quelque chose que l'on entreprend quand il y a du surplus à y consacrer. On le voit jusque dans les arrêts et les poussées de la machine : tant qu'une armée anglaise d'occupation tint l'Écosse, les procès s'arrêtèrent presque ; quand l'armée partit en 1660 et que les tribunaux locaux furent de nouveau libres d'agir, plus de six cents procès suivirent en 1661 et 1662 — contre deux seulement l'année précédente. Ce qui s'était déplacé n'était pas une vague soudaine de peur nouvelle. C'était la question de savoir qui avait la marge et les moyens de poursuivre.</p>
<p>Ce n'est pas la forme habituelle de l'histoire. Là où, ailleurs, l'accusation de sorcellerie a été rapportée au froid et au manque — récoltes ruinées, gens effrayés en quête de quelqu'un à punir —, l'Écosse va dans l'autre sens. Ici, les accusations n'ont pas culminé quand les pauvres étaient le plus aux abois. Elles ont culminé quand les hommes qui payaient les tribunaux avaient le plus à dépenser.</p>
<p>Christian est prudent sur la portée de tout cela. Les archives montrent un schéma ; le mécanisme — des revenus de l'élite qui se changent en poursuites — est sa lecture, les prix tenant lieu d'une richesse qu'aucun registre conservé ne consigne directement. Mais le schéma est tenace. Les années chaudes et la hausse des prix à l'exportation amènent plus de procès ; le prix du grain des pauvres eux-mêmes n'en amène aucun. Le lien passe même une vérification élémentaire de bon sens : le temps qu'il fera l'an prochain, qui ne peut remonter le temps pour causer les procès de cette année, ne prédit rien. Quoi qui ait exactement porté l'argent, les chasses montaient et retombaient avec la fortune des hommes qui les menaient.</p>
<p>Cette lentille mérite d'être gardée au-delà de l'Écosse. Quand nous expliquons la cruauté — celle d'hier comme celle d'aujourd'hui —, nous saisissons d'abord le désespoir : ils étaient pauvres, ils avaient peur, ils ne savaient pas mieux. Parfois c'est juste. Mais il vaut la peine de poser aussi la question plus froide que ces procès nous adressent : qui pouvait se le permettre, et à qui cela allait-il bien pendant que cela se passait ? La persécution peut être un luxe autant qu'une panique — quelque chose qui arrive non pas quand les gens n'ont plus rien à perdre, mais quand quelqu'un a de quoi dépenser.</p>$body$,
  'Qui pouvait s''offrir la chasse aux sorcières ? | ONE EIGHT Journal',
  $ex$Nous imputons la persécution aux temps difficiles et à des gens effrayés et affamés. Dans l'Écosse du début de l'époque moderne, les procès ont augmenté les bonnes années — quand les hommes qui tenaient les tribunaux avaient de l'argent à dépenser$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- it
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'who-could-afford-the-witch-hunt')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'it',
  'Chi poteva permettersi la caccia alle streghe?',
  $ex$Attribuiamo la persecuzione ai tempi duri e a gente spaventata e affamata. Nella Scozia della prima età moderna i processi aumentarono negli anni buoni — quando gli uomini che gestivano i tribunali avevano denaro da spendere$ex$,
  $body$<p>Quando immaginiamo una caccia alle streghe, immaginiamo tempi cattivi. Un raccolto andato male, un inverno duro, gente spaventata e affamata in cerca di qualcuno da incolpare. La persecuzione sembra qualcosa che ribolle e sale dalla miseria e dalla paura: un sintomo della scarsità. Afferriamo quella spiegazione quasi per riflesso, per le crudeltà antiche e a volte anche per quelle nuove.</p>
<p>Ma una caccia alle streghe non è a buon mercato. Qualcuno deve accusare la sospettata, raccogliere le prove, incarcerarla, nutrirla e sorvegliarla, spesso torturarla, chiedere l'approvazione della lontana Edimburgo, allestire il processo ed eseguire la condanna. In Scozia la stregoneria era un reato secolare, giudicato dai tribunali locali, il che significava che a pagarla erano gli uomini del posto. Tenere in carcere una sola sospettata ad Aberdeen nel 1596 costava circa 20 sterline, in un'epoca in cui un bracciante a giornata guadagnava quaranta pence. Le accusate raramente avevano denaro proprio — raramente avevano perfino beni che valesse la pena confiscare — e così la caccia non poteva ripagarsi da sé. Era denaro speso, non denaro guadagnato. Serviva che qualcuno con denaro la volesse e potesse finanziarla.</p>
<p>Quel qualcuno era l'élite locale: i lairds, gli sceriffi e i consigli dei borghi che gestivano i tribunali. Cornelius Christian ha messo a confronto il Survey of Scottish Witchcraft, un registro di 3.098 sospettati nominati tra il 1563 e il 1727, con il clima e i prezzi dell'epoca. Il risultato va nella direzione opposta a quella della storia della miseria. Le stagioni di crescita più calde — gli anni migliori — portarono più processi, non meno.</p>
<p>A quei tribunali si possono dare dei volti. A Dumfries, nel 1671, una donna di nome Janet Macmurdoch fu processata e giustiziata per il verdetto di una giuria formata da piccoli lairds e da affittuari più agiati che vivevano nel raggio di una decina di miglia. A decidere il destino di una strega erano i proprietari terrieri del posto: gli stessi uomini le cui fortune salivano con il prezzo della lana e con il tepore della stagione.</p>
<p>I prezzi affilano il punto. Quando la lana e l'aringa, i beni d'esportazione tassabili della Scozia, salivano di prezzo e riempivano le tasche delle élite che li commerciavano e li tassavano, salivano anche i processi. Quando si muoveva il prezzo dell'avena — la coltura che la gente comune mangiava davvero — i processi non si muovevano. Le cacce seguivano il reddito dei potenti, non la fame dei poveri.</p>
<p>Lo schema tiene con più forza proprio dove il denaro dovrebbe renderlo più forte. I processi salivano di più vicino a Edimburgo, dove un tribunale otteneva in fretta la propria approvazione, e nelle contee con più giudici di pace, dove portare avanti un'accusa costava meno. Salivano meno lontano dalla capitale e lontano dai porti commerciali dove il denaro dell'esportazione sbarcava. Dove i tribunali erano a buon mercato e il reddito dell'élite era a portata di mano, le accuse seguivano.</p>
<p>Così la caccia alle streghe comincia a somigliare meno a una febbre e più a un acquisto. Non uno spasmo dei disperati, ma un progetto degli agiati: qualcosa che si intraprende quando c'è un surplus da spenderci. Lo si vede perfino nelle pause e negli scatti del meccanismo: finché un esercito inglese d'occupazione tenne la Scozia, i processi quasi si fermarono; quando l'esercito se ne andò, nel 1660, e i tribunali locali furono di nuovo liberi di agire, seguirono più di seicento processi nel 1661 e nel 1662 — contro appena due l'anno prima. A muoversi non fu un'improvvisa ondata di paura nuova. Fu chi avesse lo spazio e le risorse per procedere.</p>
<p>Non è la forma consueta della storia. Là dove altrove l'accusa di stregoneria è stata ricondotta al freddo e alla mancanza — raccolti rovinati, gente spaventata in cerca di qualcuno da punire — la Scozia va nel senso contrario. Qui le accuse non toccarono il picco quando i poveri erano più disperati. Lo toccarono quando gli uomini che pagavano i tribunali avevano di più da spendere.</p>
<p>Christian è cauto su quanto lontano arrivi tutto questo. Gli archivi mostrano uno schema; il meccanismo — il reddito dell'élite che si trasforma in processi — è la sua lettura, con i prezzi che fanno le veci di una ricchezza che nessun registro superstite annota direttamente. Ma lo schema è ostinato. Gli anni caldi e i prezzi all'esportazione in salita portano più processi; il prezzo del grano dei poveri stessi non ne porta nessuno. Il nesso supera perfino una verifica elementare di plausibilità: il tempo dell'anno successivo, che non può tornare indietro a causare i processi di quest'anno, non prevede nulla. Qualunque cosa esattamente trasportasse quel denaro, le cacce salivano e scendevano con le fortune degli uomini che le conducevano.</p>
<p>Vale la pena portare questa lente oltre la Scozia. Quando spieghiamo la crudeltà — quella di allora o quella di adesso — afferriamo per prima cosa la disperazione: erano poveri, erano spaventati, non sapevano fare di meglio. A volte è giusto. Ma vale la pena porsi anche la domanda più fredda che questi processi ci rivolgono: chi poteva permettersi tutto ciò, e a chi andava bene mentre accadeva? La persecuzione può essere un lusso tanto quanto un panico: qualcosa che arriva non quando alle persone non resta più nulla da perdere, ma quando qualcuno ha abbastanza da spendere.</p>$body$,
  'Chi poteva permettersi la caccia alle streghe? | ONE EIGHT Journal',
  $ex$Attribuiamo la persecuzione ai tempi duri e a gente spaventata e affamata. Nella Scozia della prima età moderna i processi aumentarono negli anni buoni — quando gli uomini che gestivano i tribunali avevano denaro da spendere$ex$,
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
  SELECT id FROM public.journal_articles WHERE slug = 'who-could-afford-the-witch-hunt'
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
  'Christian, Cornelius. "The Political and Economic Role of Elites in Persecution: Evidence from Witchcraft Trials in Early Modern Scotland." Review of Economics and Institutions 10, no. 2 (2019), art. 1.',
  '10.5202/rei.v10i2.273',
  'https://rei.unipg.it/rei/article/view/273'
FROM article a;

COMMIT;

-- =============================================================================
-- END
-- =============================================================================
