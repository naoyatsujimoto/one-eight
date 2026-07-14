-- =============================================================================
-- journal_climate_security_article.sql
-- 記事: oej-2026-climate-security-participatory-mapping / nineteen-places-the-map-missed
-- 言語: en / ja / zh-Hant / zh-Hans / ko / es / pt-BR / de / fr / it
-- 適用: supabase db push (via migration)
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
  published_at
)
VALUES (
  'nineteen-places-the-map-missed',
  'published',
  'ONE EIGHT Journal',
  ARRAY['climate security', 'participatory mapping', 'Kenya', 'geospatial analysis', 'Africa'],
  '2026-07-14 00:00:00+09:00'
)
ON CONFLICT (slug) DO UPDATE
  SET
    status       = EXCLUDED.status,
    author_label = EXCLUDED.author_label,
    tags         = EXCLUDED.tags,
    published_at = EXCLUDED.published_at,
    updated_at   = now();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. journal_article_translations (10 languages)
-- ─────────────────────────────────────────────────────────────────────────────

WITH article_en AS (
  SELECT id FROM public.journal_articles WHERE slug = 'nineteen-places-the-map-missed'
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
  article_en.id,
  'en',
  'Nineteen Places the Map Left Out',
  'A red mark on a map reads as danger. The places with no mark read as the opposite, though no one quite decides it: blank means fine. But a blank can mean two very different things. It can mean nothing is wrong there — or it can mean the knowledge that drew the map never reached that far.',
  $body_html_en$<p>A red mark on a map reads as danger. The places with no mark read as the opposite, though no one quite decides it: blank means fine. But a blank can mean two very different things. It can mean nothing is wrong there — or it can mean the knowledge that drew the map never reached that far. So which is it: are the unmarked places safe, or just unseen?</p>

<p>Benson Kenduiywo, Victor Korir, Brenda Chepngetich and colleagues put that question to the test in Kenya. Across eleven counties, they took eighty locations that global, top-down data had already flagged as climate-security hotspots, and set them on two maps — one printed, one interactive on a screen. Then they brought in local experts: not residents in general, but people who work on climate, conflict, resources and administration in the region. One location at a time, the experts said whether they agreed with each classification, agreed only in part, or disagreed. And where the map had missed a place they knew mattered, they could add it.</p>

<p>It helps to know what each mark was claiming. A climate-security hotspot, in this work, is not simply a hot or dry place. It is where climate pressure overlaps with other strains — thin livelihoods, weak governance, competition over water and land, the risk of conflict. Each of the eighty therefore carried two judgments at once: one about the climate conditions, and one about the intensity of conflict. To check a single mark was to check both of those at the same time.</p>

<p>What came back was not a rejection of the map. For 45 percent of the eighty, the experts accepted the classification as it stood. Nearly half of a map built from a distance was right, in the judgment of people who know the ground. That figure should not be waved past on the way to the sharper ones. A top-down map, drawn far from the places it names, got a large share of its calls right — which is worth saying plainly before anything else.</p>

<p>The next slice is where the detail appears. For 38.75 percent of the locations, agreement was only partial: the experts accepted one of the two judgments but not the other. A place might be correctly flagged for its climate stress while its conflict rating was wrong — or the other way around. This is neither full agreement nor full rejection, and collapsing it into either one loses the point. The two halves also did not fail evenly. The conflict classification drew more disagreement than the climate one; conflict, it seems, is the harder thing to read from far away. The remaining 16.25 percent did not fit at all — here the experts disagreed with both the climate and the conflict call.</p>

<p>Then there was something the eighty marks could never have surfaced on their own. Beyond correcting what was already there, the experts pointed to nineteen places the map had left blank — locations they judged to be hotspots that the global data had never flagged. These were not mistakes in the existing marks. They were gaps: ground a wide dataset could not resolve, and that people who know the land could. A blank, it turns out, does not always mean "nothing here." Sometimes it means "not yet reached."</p>

<p>Put the numbers side by side and the argument is direct. Local expertise did not overturn the top-down map. It confirmed 45 percent, corrected part of another 38.75 percent, set aside 16.25 percent, and added nineteen more. Global data is good at the broad shape of a whole region; it is not built to catch the pressure a single county is under this year. Local knowledge is the opposite — close and specific, but no substitute for the wide view that let anyone place eighty marks to begin with. Neither is simply the correct map. Only by setting the two against each other can you tell how much of the map holds and where its blind spots are.</p>

<p>So when a risk map is in front of you, the marks are not the only thing to read. There is also the question of what data drew it, at what scale, and whose knowledge has checked it. The same eighty points look one way under a top-down indicator alone, and a different way once local experts have gone over them county by county.</p>

<p>None of this makes the map worthless. The nineteen places added across those eleven Kenyan counties are not proof that the map failed; they are a sign that it can still be corrected and updated. What a map shows matters — and so does what it was made from, and who confirmed it.</p>$body_html_en$,
  'Nineteen Places the Map Left Out',
  'A red mark on a map reads as danger. The places with no mark read as the opposite, though no one quite decides it: blank means fine. But a blank can mean two very different things.',
  TRUE
FROM article_en
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();


WITH article_ja AS (
  SELECT id FROM public.journal_articles WHERE slug = 'nineteen-places-the-map-missed'
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
  article_ja.id,
  'ja',
  '地図が見落とした19の場所',
  '地図に赤い印がついていれば、そこは危険な場所に見える。では、印のない場所はどうだろう。そこは安全なのか。それとも、その地図を作った知識が、まだそこまで届いていないだけなのか。',
  $body_html_ja$<p>地図に赤い印がついていれば、そこは危険な場所に見える。では、印のない場所はどうだろう。そこは安全なのか。それとも、その地図を作った知識が、まだそこまで届いていないだけなのか。</p>

<p>この問いを、ケニアで実際に確かめた仕事がある。Benson Kenduiywo、Victor Korir、Brenda Chepngetich らは、国内の11の郡を対象に、すでに地図上へ置かれていた80の「気候安全保障ホットスポット」を検証した。この80地点は、世界規模のトップダウンのデータによって選ばれていた。手続きはこうだ。印刷した地図と、画面上で動かせる地図の両方に、80の地点を示す。そして、地域の事情を専門的に知る人びと――住民一般ではなく、気候や紛争、資源、行政に関わるローカル専門家――が、その分類を一つずつ確かめる。同意するのか、一部だけ同意するのか、同意しないのか。さらに、地図に載っていない地点に心当たりがあれば、それも書き加えていく。</p>

<p>ここでいうホットスポットとは、ただ暑い、あるいは乾いた場所のことではない。気候の圧力が、ほかの負荷と重なる場所を指す。細い生計、弱い統治、水や土地をめぐる競合、そして紛争の危険。こうした条件が気候と重なるところが、危険度の高い地点とされる。だから80のそれぞれには、二つの判断が組み合わさっていた。気候の状態についての判断と、紛争の激しさについての判断だ。一つの印を確かめるとは、その両方を同時に確かめることだった。</p>

<p>返ってきたのは、既存地図の否定ではなかった。80地点のうち、45%については、専門家は分類をそのまま妥当と認めた。遠くのデータで作られた地図の、半分近く。それが、現地の事情を知る目から見ても正しかった。この数字は軽く扱うべきではない。距離を置いて、一様な規則で作られた地図が、判断のかなりの部分を当てていたことになる。</p>

<p>差が見えてくるのは、次の層だ。38.75%の地点では、同意は部分的だった。専門家は、二つの判断のうち一方だけを認めた。気候の分類は合っているが、紛争の評価はずれている。あるいは、その逆。全面的な賛成でも、全面的な反対でもない。この部分同意を、賛成か反対のどちらかに丸めてしまうと、いちばん大事なところが消える。そして、二つの判断は同じようには食い違わなかった。紛争の分類のほうが、気候の分類よりも多くの異議を集めた。遠くから見るとき、気候の状態よりも、紛争の状況のほうが読み取りにくいらしい。残りの16.25%は、気候と紛争の両方について、専門家が既存の分類に同意しなかった地点だった。</p>

<p>そして、80地点を確かめるだけでは出てこないものがあった。専門家は、地図に印のない19の場所を、新たにホットスポットとして加えた。世界規模のデータが一度も拾わなかった地点である。これは、既存の印を間違いとして正したのではない。空白を埋めたのだ。広域のデータには見えず、その土地を知る人には見えていた場所が、19あった。地図の空白は、必ずしも「問題がない」を意味しない。「まだ知識が届いていない」を意味することがある。</p>

<p>数字を並べると、言えることははっきりしている。ローカル専門知は、トップダウンの地図を退けたのではない。45%はそのまま支持し、38.75%は一部を直し、16.25%は認めず、19地点を補った。広域のデータは、地域全体の大まかな形を描くのに向いている。だが、ある郡が今まさに抱えている圧力までは拾いきれない。現地の専門知は、その細部を埋める。近くには詳しいが、そもそも誰かが80の印を置くことを可能にした、あの広い視野の代わりにはならない。どちらか一方が正しいのではない。二つを突き合わせて初めて、その地図がどこまで当たっていて、どこに盲点があるのかを確かめられる。</p>

<p>だとすれば、地図を見るときに確かめるべきものは、描かれた印だけではない。その地図が、どのデータから、どの尺度で作られたのか。そして、誰の知識によって確かめられたのか。同じ80地点でも、上空からの指標だけを見るときと、現地の専門家の評価を重ねたときとでは、危険の分布が違って見える。</p>

<p>地図が無価値だという話ではない。ケニアの11郡で加わった19の場所は、地図が失敗した証拠ではなく、地図がまだ直され、更新される余地を持っていることの印だ。何が描かれているかと同じくらい、何を使って描かれ、誰の知識で確かめられたのかを見ること。それが、次に一枚の地図を前にしたときにできる、確かな一歩になる。</p>$body_html_ja$,
  '地図が見落とした19の場所',
  '地図に赤い印がついていれば、そこは危険な場所に見える。では、印のない場所はどうだろう。そこは安全なのか。それとも、その地図を作った知識が、まだそこまで届いていないだけなのか。',
  FALSE
FROM article_ja
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();


WITH article_zh_Hant AS (
  SELECT id FROM public.journal_articles WHERE slug = 'nineteen-places-the-map-missed'
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
  article_zh_Hant.id,
  'zh-Hant',
  '地圖漏掉的十九個地方',
  '地圖上一個紅色標記，讀起來就是危險。沒有標記的地方讀起來則相反，儘管沒有人真正如此裁定：空白就代表沒事。但空白可以意味兩件很不一樣的事。',
  $body_html_zh_Hant$<p>地圖上一個紅色標記，讀起來就是危險。沒有標記的地方讀起來則相反，儘管沒有人真正如此裁定：空白就代表沒事。但空白可以意味兩件很不一樣的事。它可以意味那裡沒有問題——也可以意味畫這張地圖的知識，從來沒抵達那麼遠。那麼到底是哪一種：那些沒被標記的地方，是安全，還是只是沒被看見？</p>

<p>Benson Kenduiywo、Victor Korir、Brenda Chepngetich 與同事在肯亞把這個問題拿來檢驗。橫跨十一個郡，他們取了八十個由全球性、由上而下的資料早已標記為氣候安全熱點的地點，把它們放上兩張地圖——一張印出來的，一張在螢幕上可以互動的。然後他們請來當地專家：不是一般居民，而是在該地區從事氣候、衝突、資源與行政工作的人。一個地點接著一個地點，專家們說出他們是同意每一項分類、只部分同意，還是不同意。而在地圖漏掉了一個他們知道重要的地方時，他們可以把它補上。</p>

<p>先弄清楚每個標記在主張什麼，會有幫助。在這項研究裡，一個氣候安全熱點並不只是一個炎熱或乾旱的地方。它是氣候壓力與其他張力交疊之處——單薄的生計、脆弱的治理、對水與土地的競逐、衝突的風險。因此，八十個當中的每一個，都同時帶著兩項判斷：一項關於氣候狀況，一項關於衝突的強度。核對單一個標記，就是同時核對這兩者。</p>

<p>回饋回來的，並不是對這張地圖的否定。八十個當中，有 45% 的分類被專家原封接受。一張從遠處建起的地圖，將近一半，在熟悉這片土地的人看來是對的。這個數字不該在趕往那些更尖銳的數字時被輕輕帶過。一張由上而下、在它所指名的地方之外遙遙畫成的地圖，有很大一部分判斷是對的——這一點值得在其他一切之前，先明白說出來。</p>

<p>細節出現在下一層。有 38.75% 的地點，同意只是部分的：專家接受了兩項判斷中的一項，但不接受另一項。一個地方也許因其氣候壓力而被正確標記，它的衝突評級卻是錯的——或者反過來。這既非完全同意，也非完全否定，把它併入其中任何一邊，都會失去重點。這兩半也不是均勻地出錯。衝突的分類比氣候的分類招來更多不同意見；看來，衝突是從遠處更難讀出的那一項。剩下的 16.25% 完全對不上——在這裡，專家對氣候與衝突兩項判斷都不同意。</p>

<p>接著，還有一件八十個標記靠自己永遠浮現不出來的事。除了更正既有的內容，專家們指出了十九個地圖留為空白的地方——他們判定為熱點、而全球資料從未標記過的地點。這些並不是既有標記裡的錯誤。它們是缺口：一份廣域資料集無法解析、而熟悉這片土地的人卻能解析的地面。原來，空白並不總是意味「這裡什麼也沒有」。有時它意味「還沒抵達」。</p>

<p>把這些數字並排起來，論點很直接。當地專業並沒有推翻這張由上而下的地圖。它確認了 45%，更正了另外 38.75% 當中的一部分，擱置了 16.25%，又補上了十九個。全球資料擅長描繪整個地區的大致輪廓；它並不是為了捕捉某一個郡今年所承受的壓力而建的。當地知識恰好相反——貼近而具體，卻無法替代那個一開始就讓人得以放下八十個標記的廣闊視野。兩者都不單獨是那張正確的地圖。唯有把兩者彼此對照，你才說得出這張地圖有多少站得住腳，以及它的盲點在哪裡。</p>

<p>所以，當一張風險地圖擺在你面前，標記並不是唯一要讀的東西。還有一個問題：是什麼資料畫出了它，以什麼尺度，又是誰的知識核對過它。同樣的八十個點，單看一項由上而下的指標是一個樣子，等當地專家一個郡一個郡地審視過之後，又是另一個樣子。</p>

<p>這一切都沒有使這張地圖變得毫無價值。在那十一個肯亞郡裡補上的十九個地方，並不是地圖失敗的證據；它們是一個跡象，表明地圖仍然可以被更正、被更新。一張地圖顯示了什麼，很重要——它由什麼做成、又由誰確認過，同樣重要。</p>$body_html_zh_Hant$,
  '地圖漏掉的十九個地方',
  '地圖上一個紅色標記，讀起來就是危險。沒有標記的地方讀起來則相反，儘管沒有人真正如此裁定：空白就代表沒事。但空白可以意味兩件很不一樣的事。',
  FALSE
FROM article_zh_Hant
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();


WITH article_zh_Hans AS (
  SELECT id FROM public.journal_articles WHERE slug = 'nineteen-places-the-map-missed'
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
  article_zh_Hans.id,
  'zh-Hans',
  '地图漏掉的十九个地方',
  '地图上一个红色标记，读起来就是危险。没有标记的地方读起来则相反，尽管没有人真正如此裁定：空白就代表没事。但空白可以意味两件很不一样的事。',
  $body_html_zh_Hans$<p>地图上一个红色标记，读起来就是危险。没有标记的地方读起来则相反，尽管没有人真正如此裁定：空白就代表没事。但空白可以意味两件很不一样的事。它可以意味那里没有问题——也可以意味画这张地图的知识，从来没抵达那么远。那么到底是哪一种：那些没被标记的地方，是安全，还是只是没被看见？</p>

<p>Benson Kenduiywo、Victor Korir、Brenda Chepngetich 与同事在肯尼亚把这个问题拿来检验。横跨十一个郡，他们取了八十个由全球性、自上而下的数据早已标记为气候安全热点的地点，把它们放上两张地图——一张印出来的，一张在屏幕上可以互动的。然后他们请来当地专家：不是一般居民，而是在该地区从事气候、冲突、资源与行政工作的人。一个地点接着一个地点，专家们说出他们是同意每一项分类、只部分同意，还是不同意。而在地图漏掉了一个他们知道重要的地方时，他们可以把它补上。</p>

<p>先弄清楚每个标记在主张什么，会有帮助。在这项研究里，一个气候安全热点并不只是一个炎热或干旱的地方。它是气候压力与其他张力交叠之处——单薄的生计、脆弱的治理、对水与土地的争夺、冲突的风险。因此，八十个当中的每一个，都同时带着两项判断：一项关于气候状况，一项关于冲突的强度。核对单一个标记，就是同时核对这两者。</p>

<p>回馈回来的，并不是对这张地图的否定。八十个当中，有 45% 的分类被专家原封接受。一张从远处建起的地图，将近一半，在熟悉这片土地的人看来是对的。这个数字不该在赶往那些更尖锐的数字时被轻轻带过。一张自上而下、在它所指名的地方之外遥遥画成的地图，有很大一部分判断是对的——这一点值得在其他一切之前，先明白说出来。</p>

<p>细节出现在下一层。有 38.75% 的地点，同意只是部分的：专家接受了两项判断中的一项，但不接受另一项。一个地方也许因其气候压力而被正确标记，它的冲突评级却是错的——或者反过来。这既非完全同意，也非完全否定，把它并入其中任何一边，都会失去重点。这两半也不是均匀地出错。冲突的分类比气候的分类招来更多不同意见；看来，冲突是从远处更难读出的那一项。剩下的 16.25% 完全对不上——在这里，专家对气候与冲突两项判断都不同意。</p>

<p>接着，还有一件八十个标记靠自己永远浮现不出来的事。除了更正既有的内容，专家们指出了十九个地图留为空白的地方——他们判定为热点、而全球数据从未标记过的地点。这些并不是既有标记里的错误。它们是缺口：一份广域数据集无法解析、而熟悉这片土地的人却能解析的地面。原来，空白并不总是意味"这里什么也没有"。有时它意味"还没抵达"。</p>

<p>把这些数字并排起来，论点很直接。当地专业并没有推翻这张自上而下的地图。它确认了 45%，更正了另外 38.75% 当中的一部分，搁置了 16.25%，又补上了十九个。全球数据擅长描绘整个地区的大致轮廓；它并不是为了捕捉某一个郡今年所承受的压力而建的。当地知识恰好相反——贴近而具体，却无法替代那个一开始就让人得以放下八十个标记的广阔视野。两者都不单独是那张正确的地图。唯有把两者彼此对照，你才说得出这张地图有多少站得住脚，以及它的盲点在哪里。</p>

<p>所以，当一张风险地图摆在你面前，标记并不是唯一要读的东西。还有一个问题：是什么数据画出了它，以什么尺度，又是谁的知识核对过它。同样的八十个点，单看一项自上而下的指标是一个样子，等当地专家一个郡一个郡地审视过之后，又是另一个样子。</p>

<p>这一切都没有使这张地图变得毫无价值。在那十一个肯尼亚郡里补上的十九个地方，并不是地图失败的证据；它们是一个迹象，表明地图仍然可以被更正、被更新。一张地图显示了什么，很重要——它由什么做成、又由谁确认过，同样重要。</p>$body_html_zh_Hans$,
  '地图漏掉的十九个地方',
  '地图上一个红色标记，读起来就是危险。没有标记的地方读起来则相反，尽管没有人真正如此裁定：空白就代表没事。但空白可以意味两件很不一样的事。',
  FALSE
FROM article_zh_Hans
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();


WITH article_ko AS (
  SELECT id FROM public.journal_articles WHERE slug = 'nineteen-places-the-map-missed'
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
  article_ko.id,
  'ko',
  '지도가 빠뜨린 열아홉 곳',
  '지도 위 붉은 표시는 위험으로 읽힌다. 표시가 없는 곳은 그 반대로 읽힌다. 아무도 딱히 그렇게 정한 적은 없지만, 비어 있음은 곧 괜찮음이라는 식이다. 그러나 비어 있음은 아주 다른 두 가지를 뜻할 수 있다.',
  $body_html_ko$<p>지도 위 붉은 표시는 위험으로 읽힌다. 표시가 없는 곳은 그 반대로 읽힌다. 아무도 딱히 그렇게 정한 적은 없지만, 비어 있음은 곧 괜찮음이라는 식이다. 그러나 비어 있음은 아주 다른 두 가지를 뜻할 수 있다. 그곳에 아무 문제가 없다는 뜻일 수도 있고, 그 지도를 그린 지식이 거기까지 닿은 적이 없다는 뜻일 수도 있다. 그렇다면 어느 쪽일까. 표시되지 않은 곳들은 안전한가, 아니면 그저 보이지 않았을 뿐인가?</p>

<p>Benson Kenduiywo, Victor Korir, Brenda Chepngetich와 동료들은 이 물음을 케냐에서 시험대에 올렸다. 열한 개 카운티에 걸쳐, 전 지구적·하향식 데이터가 이미 기후안보 핫스폿으로 표시해 둔 여든 곳을 골라, 두 지도에 올렸다 — 하나는 인쇄한 것, 하나는 화면에서 조작할 수 있는 대화형. 그런 다음 현지 전문가들을 불러들였다. 일반 주민이 아니라, 그 지역에서 기후, 분쟁, 자원, 행정을 다루는 사람들이다. 한 곳씩, 전문가들은 각 분류에 동의하는지, 일부만 동의하는지, 동의하지 않는지를 말했다. 그리고 지도가 그들이 중요하다고 아는 곳을 빠뜨렸을 때는, 그곳을 더할 수 있었다.</p>

<p>각 표시가 무엇을 주장하고 있었는지 알아 두면 도움이 된다. 이 연구에서 기후안보 핫스폿은 그저 덥거나 건조한 곳이 아니다. 기후 압력이 다른 부담들과 겹치는 곳이다 — 얄팍한 생계, 취약한 거버넌스, 물과 땅을 둘러싼 경쟁, 분쟁의 위험. 그래서 여든 곳 각각은 두 가지 판단을 한꺼번에 지니고 있었다. 하나는 기후 조건에 관한 것, 하나는 분쟁의 강도에 관한 것. 표시 하나를 검토한다는 것은 그 둘을 동시에 검토하는 일이었다.</p>

<p>돌아온 것은 지도에 대한 거부가 아니었다. 여든 곳 가운데 45퍼센트에 대해, 전문가들은 분류를 그대로 받아들였다. 멀리서 세운 지도의 거의 절반이, 땅을 아는 사람들의 판단으로도 옳았다. 이 수치는 더 날카로운 수치들로 넘어가는 길에 가볍게 지나쳐서는 안 된다. 이름 붙인 그곳들에서 멀리 떨어져 그려진 하향식 지도가, 그 판단의 큰 몫을 맞혔다 — 이것은 다른 무엇보다 먼저 분명히 말해 둘 만하다.</p>

<p>세부는 다음 층에서 드러난다. 38.75퍼센트의 지점에서, 동의는 부분적이었다. 전문가들은 두 판단 중 하나는 받아들이고 다른 하나는 받아들이지 않았다. 어떤 곳은 기후 압력에 대해서는 옳게 표시되었으나 분쟁 등급은 틀렸을 수 있다 — 혹은 그 반대다. 이것은 완전한 동의도, 완전한 거부도 아니며, 어느 한쪽으로 뭉뚱그리면 요점을 잃는다. 두 절반이 고르게 어긋난 것도 아니다. 분쟁 분류가 기후 분류보다 더 많은 이견을 불렀다. 아무래도 분쟁은 멀리서 읽어 내기가 더 어려운 쪽인 듯하다. 남은 16.25퍼센트는 전혀 들어맞지 않았다 — 여기서는 전문가들이 기후와 분쟁 두 판단 모두에 동의하지 않았다.</p>

<p>그리고 여든 개의 표시만으로는 결코 떠오를 수 없었던 것이 있었다. 이미 있는 것을 바로잡는 데 더해, 전문가들은 지도가 비워 둔 열아홉 곳을 짚었다 — 그들이 핫스폿으로 판단했으나 전 지구적 데이터가 한 번도 표시하지 않은 지점들이다. 이것들은 기존 표시의 오류가 아니었다. 그것들은 빈틈이었다. 넓은 데이터셋으로는 해상되지 않지만, 땅을 아는 사람들은 짚어 낼 수 있는 지면. 알고 보니 비어 있음이 언제나 "여기엔 아무것도 없다"를 뜻하지는 않는다. 때로는 "아직 닿지 못했다"를 뜻한다.</p>

<p>이 수치들을 나란히 놓으면 논지는 곧바르다. 현지 전문성은 하향식 지도를 뒤엎지 않았다. 그것은 45퍼센트를 확인하고, 또 다른 38.75퍼센트의 일부를 바로잡고, 16.25퍼센트를 제쳐 두고, 열아홉 곳을 더했다. 전 지구적 데이터는 한 지역 전체의 큰 윤곽을 잡는 데 능하다. 그것은 한 카운티가 올해 겪고 있는 압력까지 잡아내도록 만들어지지는 않았다. 현지 지식은 그 반대다 — 가깝고 구체적이지만, 애초에 누군가가 여든 개의 표시를 놓을 수 있게 해 준 그 넓은 시야를 대신하지는 못한다. 어느 쪽도 그 자체로 옳은 지도인 것은 아니다. 둘을 서로 맞대어 보아야만, 지도의 얼마만큼이 버티는지, 그리고 그 사각지대가 어디인지를 말할 수 있다.</p>

<p>그러니 위험 지도가 앞에 놓였을 때, 읽어야 할 것은 표시만이 아니다. 어떤 데이터가 그것을 그렸는지, 어떤 축척으로, 그리고 누구의 지식이 그것을 검토했는지도 물어야 한다. 같은 여든 개의 점이, 하향식 지표 하나만으로 볼 때와, 현지 전문가들이 카운티 단위로 훑고 난 뒤에는 다르게 보인다.</p>

<p>이 가운데 어느 것도 지도를 무가치하게 만들지 않는다. 그 열한 개 케냐 카운티에 걸쳐 더해진 열아홉 곳은 지도가 실패했다는 증거가 아니다. 그것들은 지도가 여전히 바로잡히고 갱신될 수 있다는 표시다. 지도가 무엇을 보여 주는지가 중요하다 — 그리고 그것이 무엇으로 만들어졌는지, 누가 그것을 확인했는지도 그만큼 중요하다.</p>$body_html_ko$,
  '지도가 빠뜨린 열아홉 곳',
  '지도 위 붉은 표시는 위험으로 읽힌다. 표시가 없는 곳은 그 반대로 읽힌다. 아무도 딱히 그렇게 정한 적은 없지만, 비어 있음은 곧 괜찮음이라는 식이다. 그러나 비어 있음은 아주 다른 두 가지를 뜻할 수 있다.',
  FALSE
FROM article_ko
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();


WITH article_es AS (
  SELECT id FROM public.journal_articles WHERE slug = 'nineteen-places-the-map-missed'
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
  article_es.id,
  'es',
  'Diecinueve lugares que el mapa dejó fuera',
  'Una marca roja en un mapa se lee como peligro. Los lugares sin marca se leen como lo contrario, aunque nadie llega a decidirlo del todo: en blanco significa que no pasa nada. Pero un espacio en blanco puede significar dos cosas muy distintas.',
  $body_html_es$<p>Una marca roja en un mapa se lee como peligro. Los lugares sin marca se leen como lo contrario, aunque nadie llega a decidirlo del todo: en blanco significa que no pasa nada. Pero un espacio en blanco puede significar dos cosas muy distintas. Puede significar que ahí no hay ningún problema, o puede significar que el conocimiento que trazó el mapa nunca llegó tan lejos. Entonces, ¿cuál de las dos?: ¿los lugares sin marcar están a salvo, o solo sin ver?</p>

<p>Benson Kenduiywo, Victor Korir, Brenda Chepngetich y sus colegas pusieron esa pregunta a prueba en Kenia. A lo largo de once condados, tomaron ochenta ubicaciones que datos globales, hechos desde arriba, ya habían señalado como puntos críticos de seguridad climática, y las colocaron en dos mapas: uno impreso, otro interactivo en una pantalla. Luego convocaron a expertos locales: no a los habitantes en general, sino a personas que trabajan sobre clima, conflicto, recursos y administración en la región. Una ubicación tras otra, los expertos dijeron si estaban de acuerdo con cada clasificación, de acuerdo solo en parte, o en desacuerdo. Y donde el mapa había pasado por alto un lugar que ellos sabían importante, podían añadirlo.</p>

<p>Conviene saber qué afirmaba cada marca. En este trabajo, un punto crítico de seguridad climática no es simplemente un lugar caluroso o seco. Es donde la presión climática se solapa con otras tensiones: medios de vida frágiles, gobernanza débil, competencia por el agua y la tierra, el riesgo de conflicto. Cada una de las ochenta llevaba, por tanto, dos juicios a la vez: uno sobre las condiciones climáticas y otro sobre la intensidad del conflicto. Revisar una sola marca era revisar ambos al mismo tiempo.</p>

<p>Lo que volvió no fue un rechazo del mapa. Para el 45 por ciento de las ochenta, los expertos aceptaron la clasificación tal como estaba. Casi la mitad de un mapa construido a distancia acertaba, a juicio de quienes conocen el terreno. Esa cifra no debería pasarse de largo camino de las más agudas. Un mapa hecho desde arriba, trazado lejos de los lugares que nombra, acertó en buena parte de sus valoraciones, y conviene decirlo con claridad antes que nada.</p>

<p>El detalle aparece en el siguiente tramo. Para el 38,75 por ciento de las ubicaciones, el acuerdo fue solo parcial: los expertos aceptaron uno de los dos juicios, pero no el otro. Un lugar podía estar bien señalado por su estrés climático mientras su calificación de conflicto estaba equivocada, o al revés. Esto no es ni acuerdo pleno ni rechazo pleno, y reducirlo a cualquiera de los dos pierde el punto. Las dos mitades tampoco fallaron por igual. La clasificación del conflicto suscitó más desacuerdo que la del clima; el conflicto, al parecer, es lo más difícil de leer desde lejos. El 16,25 por ciento restante no encajaba en absoluto: aquí los expertos discreparon tanto del juicio climático como del de conflicto.</p>

<p>Luego hubo algo que las ochenta marcas nunca habrían podido sacar a la luz por sí solas. Más allá de corregir lo que ya estaba, los expertos señalaron diecinueve lugares que el mapa había dejado en blanco: ubicaciones que juzgaban puntos críticos y que los datos globales nunca habían señalado. No eran errores en las marcas existentes. Eran vacíos: terreno que un conjunto amplio de datos no podía resolver, y que quienes conocen la tierra sí. Un espacio en blanco, resulta, no siempre significa "aquí no hay nada". A veces significa "aún no se ha llegado".</p>

<p>Pon las cifras una junto a otra y el argumento es directo. La pericia local no derribó el mapa hecho desde arriba. Confirmó el 45 por ciento, corrigió parte de otro 38,75 por ciento, apartó el 16,25 por ciento y añadió diecinueve más. Los datos globales son buenos para la forma general de toda una región; no están hechos para captar la presión que un solo condado soporta este año. El conocimiento local es lo contrario: cercano y específico, pero no un sustituto de la mirada amplia que permitió, para empezar, colocar ochenta marcas. Ninguno es sin más el mapa correcto. Solo enfrentando ambos puedes decir cuánto del mapa se sostiene y dónde están sus puntos ciegos.</p>

<p>Así que, cuando tengas delante un mapa de riesgo, las marcas no son lo único que leer. Está también la pregunta de qué datos lo trazaron, a qué escala y qué conocimiento lo ha revisado. Los mismos ochenta puntos se ven de una manera bajo un indicador hecho desde arriba, y de otra una vez que los expertos locales los han repasado condado por condado.</p>

<p>Nada de esto vuelve inútil el mapa. Los diecinueve lugares añadidos en esos once condados de Kenia no son prueba de que el mapa fallara; son una señal de que todavía puede corregirse y actualizarse. Importa lo que un mapa muestra, y también con qué se hizo y quién lo confirmó.</p>$body_html_es$,
  'Diecinueve lugares que el mapa dejó fuera',
  'Una marca roja en un mapa se lee como peligro. Los lugares sin marca se leen como lo contrario, aunque nadie llega a decidirlo del todo: en blanco significa que no pasa nada.',
  FALSE
FROM article_es
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();


WITH article_pt_BR AS (
  SELECT id FROM public.journal_articles WHERE slug = 'nineteen-places-the-map-missed'
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
  article_pt_BR.id,
  'pt-BR',
  'Dezenove lugares que o mapa deixou de fora',
  'Uma marca vermelha num mapa se lê como perigo. Os lugares sem marca se leem como o contrário, embora ninguém chegue bem a decidir isso: em branco significa tudo bem. Mas um espaço em branco pode significar duas coisas bem diferentes.',
  $body_html_pt_BR$<p>Uma marca vermelha num mapa se lê como perigo. Os lugares sem marca se leem como o contrário, embora ninguém chegue bem a decidir isso: em branco significa tudo bem. Mas um espaço em branco pode significar duas coisas bem diferentes. Pode significar que não há nada de errado ali — ou pode significar que o conhecimento que traçou o mapa nunca chegou tão longe. Então, qual é: os lugares sem marca estão seguros, ou apenas não foram vistos?</p>

<p>Benson Kenduiywo, Victor Korir, Brenda Chepngetich e colegas puseram essa pergunta à prova no Quênia. Ao longo de onze condados, tomaram oitenta localidades que dados globais, feitos de cima para baixo, já haviam sinalizado como pontos críticos de segurança climática, e as colocaram em dois mapas — um impresso, outro interativo numa tela. Depois trouxeram especialistas locais: não os moradores em geral, mas pessoas que trabalham com clima, conflito, recursos e administração na região. Uma localidade de cada vez, os especialistas disseram se concordavam com cada classificação, se concordavam apenas em parte, ou se discordavam. E onde o mapa tinha deixado passar um lugar que sabiam importante, podiam acrescentá-lo.</p>

<p>Ajuda saber o que cada marca estava afirmando. Neste trabalho, um ponto crítico de segurança climática não é simplesmente um lugar quente ou seco. É onde a pressão climática se sobrepõe a outras tensões — meios de vida frágeis, governança fraca, competição por água e terra, o risco de conflito. Cada uma das oitenta trazia, portanto, dois juízos ao mesmo tempo: um sobre as condições climáticas e outro sobre a intensidade do conflito. Conferir uma única marca era conferir ambos ao mesmo tempo.</p>

<p>O que voltou não foi uma rejeição do mapa. Para 45 por cento das oitenta, os especialistas aceitaram a classificação como estava. Quase metade de um mapa construído à distância acertava, no juízo de quem conhece o terreno. Esse número não deveria ser deixado para trás a caminho dos mais agudos. Um mapa feito de cima para baixo, traçado longe dos lugares que nomeia, acertou boa parte de suas avaliações — o que vale dizer com clareza antes de qualquer coisa.</p>

<p>O detalhe aparece na fatia seguinte. Para 38,75 por cento das localidades, a concordância foi apenas parcial: os especialistas aceitaram um dos dois juízos, mas não o outro. Um lugar podia estar corretamente sinalizado por seu estresse climático enquanto sua avaliação de conflito estava errada — ou o contrário. Isto não é nem concordância plena nem rejeição plena, e reduzi-lo a um dos dois perde o ponto. As duas metades também não falharam por igual. A classificação do conflito suscitou mais discordância do que a do clima; o conflito, ao que parece, é o mais difícil de ler de longe. Os 16,25 por cento restantes não se encaixavam de modo algum — aqui os especialistas discordaram tanto do juízo climático quanto do de conflito.</p>

<p>Depois houve algo que as oitenta marcas jamais poderiam ter trazido à tona por si sós. Além de corrigir o que já estava ali, os especialistas apontaram dezenove lugares que o mapa tinha deixado em branco — localidades que julgavam pontos críticos e que os dados globais nunca haviam sinalizado. Não eram erros nas marcas existentes. Eram lacunas: terreno que um conjunto amplo de dados não conseguia resolver, e que quem conhece a terra conseguia. Um espaço em branco, verifica-se, nem sempre significa "não há nada aqui". Às vezes significa "ainda não se chegou".</p>

<p>Ponha os números lado a lado e o argumento é direto. A perícia local não derrubou o mapa feito de cima para baixo. Confirmou 45 por cento, corrigiu parte de outros 38,75 por cento, deixou de lado 16,25 por cento e acrescentou mais dezenove. Os dados globais são bons para a forma geral de uma região inteira; não são feitos para captar a pressão que um único condado sofre neste ano. O conhecimento local é o oposto — próximo e específico, mas não um substituto da visão ampla que permitiu, antes de tudo, colocar oitenta marcas. Nenhum é simplesmente o mapa correto. Só confrontando os dois se pode dizer quanto do mapa se sustenta e onde estão seus pontos cegos.</p>

<p>Então, quando um mapa de risco está diante de você, as marcas não são a única coisa a ler. Há também a pergunta de quais dados o traçaram, em que escala, e de quem foi o conhecimento que o conferiu. Os mesmos oitenta pontos parecem de um jeito sob um indicador feito de cima para baixo, e de outro depois que os especialistas locais os examinaram condado por condado.</p>

<p>Nada disso torna o mapa sem valor. Os dezenove lugares acrescentados naqueles onze condados do Quênia não são prova de que o mapa falhou; são um sinal de que ele ainda pode ser corrigido e atualizado. O que um mapa mostra importa — e também importa com o que ele foi feito, e quem o confirmou.</p>$body_html_pt_BR$,
  'Dezenove lugares que o mapa deixou de fora',
  'Uma marca vermelha num mapa se lê como perigo. Os lugares sem marca se leem como o contrário, embora ninguém chegue bem a decidir isso: em branco significa tudo bem.',
  FALSE
FROM article_pt_BR
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();


WITH article_de AS (
  SELECT id FROM public.journal_articles WHERE slug = 'nineteen-places-the-map-missed'
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
  article_de.id,
  'de',
  'Neunzehn Orte, die die Karte ausließ',
  'Eine rote Markierung auf einer Karte liest sich als Gefahr. Die Orte ohne Markierung lesen sich als das Gegenteil, auch wenn es niemand recht entscheidet: leer heißt in Ordnung. Aber eine Leerstelle kann zwei sehr verschiedene Dinge bedeuten.',
  $body_html_de$<p>Eine rote Markierung auf einer Karte liest sich als Gefahr. Die Orte ohne Markierung lesen sich als das Gegenteil, auch wenn es niemand recht entscheidet: leer heißt in Ordnung. Aber eine Leerstelle kann zwei sehr verschiedene Dinge bedeuten. Sie kann bedeuten, dass dort nichts im Argen liegt — oder dass das Wissen, das die Karte zeichnete, nie so weit reichte. Was also ist es: sind die unmarkierten Orte sicher, oder bloß ungesehen?</p>

<p>Benson Kenduiywo, Victor Korir, Brenda Chepngetich und Kolleginnen und Kollegen stellten diese Frage in Kenia auf die Probe. Über elf Bezirke hinweg nahmen sie achtzig Orte, die globale, von oben erstellte Daten bereits als Klimasicherheits-Hotspots ausgewiesen hatten, und setzten sie auf zwei Karten — eine gedruckte, eine interaktive auf einem Bildschirm. Dann holten sie lokale Fachleute hinzu: nicht die Bewohner im Allgemeinen, sondern Menschen, die in der Region zu Klima, Konflikt, Ressourcen und Verwaltung arbeiten. Ort für Ort sagten die Fachleute, ob sie jeder Einstufung zustimmten, nur teilweise zustimmten oder widersprachen. Und wo die Karte einen Ort ausgelassen hatte, von dem sie wussten, dass er zählt, konnten sie ihn hinzufügen.</p>

<p>Es hilft zu wissen, was jede Markierung behauptete. Ein Klimasicherheits-Hotspot ist in dieser Arbeit nicht einfach ein heißer oder trockener Ort. Es ist ein Ort, an dem sich klimatischer Druck mit anderen Belastungen überlagert — dünne Lebensgrundlagen, schwache Regierungsführung, Konkurrenz um Wasser und Land, das Konfliktrisiko. Jeder der achtzig trug daher zwei Urteile zugleich: eines über die klimatischen Bedingungen und eines über die Intensität des Konflikts. Eine einzige Markierung zu prüfen hieß, beide zugleich zu prüfen.</p>

<p>Was zurückkam, war keine Ablehnung der Karte. Für 45 Prozent der achtzig nahmen die Fachleute die Einstufung an, wie sie war. Fast die Hälfte einer aus der Distanz gebauten Karte lag richtig, im Urteil von Menschen, die den Boden kennen. Diese Zahl sollte man nicht auf dem Weg zu den schärferen einfach übergehen. Eine von oben erstellte Karte, fern der Orte gezeichnet, die sie benennt, traf einen großen Teil ihrer Einschätzungen — was man vor allem anderen klar sagen sollte.</p>

<p>Das Detail zeigt sich in der nächsten Schicht. Für 38,75 Prozent der Orte war die Zustimmung nur teilweise: Die Fachleute nahmen eines der beiden Urteile an, das andere nicht. Ein Ort mochte für seinen klimatischen Stress richtig markiert sein, während seine Konflikteinstufung falsch war — oder umgekehrt. Das ist weder volle Zustimmung noch volle Ablehnung, und es in eines von beiden zu pressen verfehlt den Punkt. Auch die beiden Hälften scheiterten nicht gleichmäßig. Die Konfliktklassifizierung zog mehr Widerspruch auf sich als die klimatische; Konflikt ist, wie es scheint, das Schwerere, das sich aus der Ferne lesen lässt. Die übrigen 16,25 Prozent passten überhaupt nicht — hier widersprachen die Fachleute sowohl dem Klima- als auch dem Konflikturteil.</p>

<p>Dann gab es etwas, das die achtzig Markierungen von sich aus nie hätten zutage fördern können. Über das Korrigieren des schon Vorhandenen hinaus wiesen die Fachleute auf neunzehn Orte hin, die die Karte leer gelassen hatte — Orte, die sie als Hotspots einschätzten und die die globalen Daten nie ausgewiesen hatten. Das waren keine Fehler in den bestehenden Markierungen. Es waren Lücken: Boden, den ein weiter Datensatz nicht auflösen konnte und den Menschen, die das Land kennen, sehr wohl. Eine Leerstelle bedeutet, so zeigt sich, nicht immer „hier ist nichts". Manchmal bedeutet sie „noch nicht erreicht".</p>

<p>Stellt man die Zahlen nebeneinander, ist das Argument unmittelbar. Die lokale Fachkenntnis stürzte die von oben erstellte Karte nicht um. Sie bestätigte 45 Prozent, korrigierte einen Teil weiterer 38,75 Prozent, legte 16,25 Prozent beiseite und fügte neunzehn hinzu. Globale Daten sind gut in der groben Gestalt einer ganzen Region; sie sind nicht dafür gebaut, den Druck zu erfassen, unter dem ein einzelner Bezirk in diesem Jahr steht. Lokales Wissen ist das Gegenteil — nah und spezifisch, aber kein Ersatz für den weiten Blick, der es überhaupt erst erlaubte, achtzig Markierungen zu setzen. Keines ist einfach die richtige Karte. Nur indem man beide gegeneinander stellt, lässt sich sagen, wie viel von der Karte hält und wo ihre blinden Flecken liegen.</p>

<p>Wenn also eine Risikokarte vor dir liegt, sind die Markierungen nicht das Einzige, was zu lesen ist. Da ist auch die Frage, welche Daten sie zeichneten, in welchem Maßstab und wessen Wissen sie geprüft hat. Dieselben achtzig Punkte sehen unter einem von oben erstellten Indikator allein so aus und anders, sobald lokale Fachleute sie Bezirk für Bezirk durchgegangen sind.</p>

<p>Nichts davon macht die Karte wertlos. Die neunzehn über jene elf kenianischen Bezirke hinzugefügten Orte sind kein Beweis, dass die Karte versagte; sie sind ein Zeichen, dass sie sich noch korrigieren und aktualisieren lässt. Was eine Karte zeigt, zählt — und ebenso, woraus sie gemacht wurde und wer sie bestätigt hat.</p>$body_html_de$,
  'Neunzehn Orte, die die Karte ausließ',
  'Eine rote Markierung auf einer Karte liest sich als Gefahr. Die Orte ohne Markierung lesen sich als das Gegenteil, auch wenn es niemand recht entscheidet: leer heißt in Ordnung.',
  FALSE
FROM article_de
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();


WITH article_fr AS (
  SELECT id FROM public.journal_articles WHERE slug = 'nineteen-places-the-map-missed'
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
  article_fr.id,
  'fr',
  'Dix-neuf endroits que la carte a laissés de côté',
  'Un repère rouge sur une carte se lit comme un danger. Les endroits sans repère se lisent comme le contraire, même si personne ne le décide vraiment : vide veut dire que tout va bien. Mais un blanc peut vouloir dire deux choses très différentes.',
  $body_html_fr$<p>Un repère rouge sur une carte se lit comme un danger. Les endroits sans repère se lisent comme le contraire, même si personne ne le décide vraiment : vide veut dire que tout va bien. Mais un blanc peut vouloir dire deux choses très différentes. Il peut vouloir dire que rien ne cloche là — ou que le savoir qui a tracé la carte n'est jamais allé jusque-là. Alors, laquelle des deux : les endroits non repérés sont-ils sûrs, ou seulement invisibles ?</p>

<p>Benson Kenduiywo, Victor Korir, Brenda Chepngetich et leurs collègues ont mis cette question à l'épreuve au Kenya. À travers onze comtés, ils ont pris quatre-vingts lieux que des données mondiales, tracées d'en haut, avaient déjà signalés comme points chauds de sécurité climatique, et les ont posés sur deux cartes — l'une imprimée, l'autre interactive sur un écran. Puis ils ont fait venir des experts locaux : non pas les habitants en général, mais des personnes qui travaillent sur le climat, le conflit, les ressources et l'administration dans la région. Un lieu après l'autre, les experts ont dit s'ils étaient d'accord avec chaque classement, d'accord seulement en partie, ou en désaccord. Et là où la carte avait manqué un lieu qu'ils savaient important, ils pouvaient l'ajouter.</p>

<p>Il est utile de savoir ce que chaque repère affirmait. Dans ce travail, un point chaud de sécurité climatique n'est pas simplement un lieu chaud ou sec. C'est là où la pression climatique se superpose à d'autres tensions — des moyens de subsistance ténus, une gouvernance faible, la concurrence pour l'eau et la terre, le risque de conflit. Chacun des quatre-vingts portait donc deux jugements à la fois : l'un sur les conditions climatiques, l'autre sur l'intensité du conflit. Vérifier un seul repère, c'était vérifier les deux en même temps.</p>

<p>Ce qui est revenu n'était pas un rejet de la carte. Pour 45 pour cent des quatre-vingts, les experts ont accepté le classement tel quel. Près de la moitié d'une carte bâtie à distance voyait juste, de l'avis de gens qui connaissent le terrain. Ce chiffre ne devrait pas être dépassé à la hâte en route vers les plus tranchants. Une carte tracée d'en haut, loin des lieux qu'elle nomme, a vu juste pour une bonne part de ses appréciations — ce qu'il vaut la peine de dire clairement avant tout le reste.</p>

<p>Le détail apparaît dans la tranche suivante. Pour 38,75 pour cent des lieux, l'accord n'était que partiel : les experts acceptaient l'un des deux jugements, mais pas l'autre. Un lieu pouvait être correctement signalé pour son stress climatique tandis que sa cote de conflit était fausse — ou l'inverse. Ce n'est ni un accord entier ni un rejet entier, et le ramener à l'un ou l'autre manque l'essentiel. Les deux moitiés n'ont pas non plus failli également. Le classement du conflit a suscité plus de désaccord que celui du climat ; le conflit, semble-t-il, est le plus difficile à lire de loin. Les 16,25 pour cent restants ne collaient pas du tout — ici, les experts étaient en désaccord tant sur le jugement climatique que sur celui du conflit.</p>

<p>Puis il y a eu quelque chose que les quatre-vingts repères n'auraient jamais pu faire surgir d'eux-mêmes. Au-delà de corriger ce qui était déjà là, les experts ont désigné dix-neuf endroits que la carte avait laissés en blanc — des lieux qu'ils jugeaient être des points chauds et que les données mondiales n'avaient jamais signalés. Ce n'étaient pas des erreurs dans les repères existants. C'étaient des lacunes : un terrain qu'un vaste jeu de données ne pouvait pas résoudre, et que des gens qui connaissent la terre le pouvaient. Un blanc, il s'avère, ne veut pas toujours dire « rien ici ». Parfois il veut dire « pas encore atteint ».</p>

<p>Mettez les chiffres côte à côte et l'argument est direct. L'expertise locale n'a pas renversé la carte tracée d'en haut. Elle a confirmé 45 pour cent, corrigé une partie de 38,75 pour cent de plus, écarté 16,25 pour cent et en a ajouté dix-neuf. Les données mondiales sont bonnes pour la forme générale d'une région entière ; elles ne sont pas faites pour saisir la pression que subit un seul comté cette année. Le savoir local est l'inverse — proche et précis, mais nul substitut de la vue large qui a permis, au départ, de poser quatre-vingts repères. Aucun n'est simplement la bonne carte. Ce n'est qu'en confrontant les deux que l'on peut dire quelle part de la carte tient et où sont ses angles morts.</p>

<p>Ainsi, quand une carte du risque est devant vous, les repères ne sont pas la seule chose à lire. Il y a aussi la question de savoir quelles données l'ont tracée, à quelle échelle, et de quel savoir elle a été vérifiée. Les mêmes quatre-vingts points apparaissent d'une façon sous un seul indicateur tracé d'en haut, et d'une autre une fois que des experts locaux les ont passés en revue comté par comté.</p>

<p>Rien de tout cela ne rend la carte sans valeur. Les dix-neuf endroits ajoutés à travers ces onze comtés du Kenya ne prouvent pas que la carte a échoué ; ils sont un signe qu'elle peut encore être corrigée et mise à jour. Ce qu'une carte montre compte — et compte aussi ce à partir de quoi elle a été faite, et qui l'a confirmée.</p>$body_html_fr$,
  'Dix-neuf endroits que la carte a laissés de côté',
  'Un repère rouge sur une carte se lit comme un danger. Les endroits sans repère se lisent comme le contraire, même si personne ne le décide vraiment : vide veut dire que tout va bien.',
  FALSE
FROM article_fr
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();


WITH article_it AS (
  SELECT id FROM public.journal_articles WHERE slug = 'nineteen-places-the-map-missed'
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
  article_it.id,
  'it',
  'Diciannove luoghi che la mappa ha lasciato fuori',
  'Un segno rosso su una mappa si legge come pericolo. I luoghi senza segno si leggono come il contrario, anche se nessuno lo decide davvero: vuoto vuol dire che va tutto bene. Ma uno spazio vuoto può voler dire due cose molto diverse.',
  $body_html_it$<p>Un segno rosso su una mappa si legge come pericolo. I luoghi senza segno si leggono come il contrario, anche se nessuno lo decide davvero: vuoto vuol dire che va tutto bene. Ma uno spazio vuoto può voler dire due cose molto diverse. Può voler dire che lì non c'è nulla che non va — oppure che la conoscenza che ha tracciato la mappa non è mai arrivata fin là. Allora quale delle due: i luoghi non segnati sono al sicuro, o soltanto non visti?</p>

<p>Benson Kenduiywo, Victor Korir, Brenda Chepngetich e colleghi hanno messo alla prova questa domanda in Kenya. Attraverso undici contee, hanno preso ottanta località che dati globali, tracciati dall'alto, avevano già segnalato come punti caldi di sicurezza climatica, e le hanno poste su due mappe — una stampata, una interattiva su uno schermo. Poi hanno chiamato esperti locali: non gli abitanti in generale, ma persone che lavorano su clima, conflitto, risorse e amministrazione nella regione. Una località dopo l'altra, gli esperti hanno detto se erano d'accordo con ciascuna classificazione, d'accordo solo in parte, o in disaccordo. E dove la mappa aveva mancato un luogo che sapevano importante, potevano aggiungerlo.</p>

<p>Aiuta sapere che cosa affermava ciascun segno. In questo lavoro, un punto caldo di sicurezza climatica non è semplicemente un luogo caldo o arido. È dove la pressione climatica si sovrappone ad altre tensioni — mezzi di sussistenza esili, governance debole, competizione per l'acqua e la terra, il rischio di conflitto. Ciascuna delle ottanta portava dunque due giudizi in una volta: uno sulle condizioni climatiche e uno sull'intensità del conflitto. Verificare un singolo segno significava verificare entrambi allo stesso tempo.</p>

<p>Ciò che è tornato non era un rifiuto della mappa. Per il 45 per cento delle ottanta, gli esperti hanno accettato la classificazione così com'era. Quasi metà di una mappa costruita a distanza aveva ragione, a giudizio di chi conosce il terreno. Quella cifra non andrebbe superata in fretta lungo la strada verso quelle più taglienti. Una mappa tracciata dall'alto, disegnata lontano dai luoghi che nomina, ha colto giusto in buona parte delle sue valutazioni — cosa che vale la pena dire chiaramente prima di ogni altra.</p>

<p>Il dettaglio compare nella fascia successiva. Per il 38,75 per cento delle località, l'accordo era solo parziale: gli esperti accettavano uno dei due giudizi, ma non l'altro. Un luogo poteva essere segnalato correttamente per il suo stress climatico mentre la sua classe di conflitto era sbagliata — o viceversa. Questo non è né pieno accordo né pieno rifiuto, e ridurlo all'uno o all'altro fa perdere il punto. Nemmeno le due metà hanno fallito in modo uniforme. La classificazione del conflitto ha suscitato più disaccordo di quella del clima; il conflitto, a quanto pare, è la cosa più difficile da leggere da lontano. Il restante 16,25 per cento non si adattava affatto — qui gli esperti erano in disaccordo sia sul giudizio climatico sia su quello del conflitto.</p>

<p>Poi c'è stato qualcosa che gli ottanta segni non avrebbero mai potuto far emergere da soli. Oltre a correggere ciò che c'era già, gli esperti hanno indicato diciannove luoghi che la mappa aveva lasciato in bianco — località che giudicavano punti caldi e che i dati globali non avevano mai segnalato. Non erano errori nei segni esistenti. Erano lacune: terreno che un ampio insieme di dati non poteva risolvere, e che chi conosce la terra sì. Uno spazio vuoto, si scopre, non sempre vuol dire "qui non c'è niente". A volte vuol dire "non ancora raggiunto".</p>

<p>Metti i numeri uno accanto all'altro e l'argomento è diretto. La competenza locale non ha ribaltato la mappa tracciata dall'alto. Ha confermato il 45 per cento, corretto una parte di un altro 38,75 per cento, messo da parte il 16,25 per cento e ne ha aggiunti diciannove. I dati globali sono bravi nella forma generale di un'intera regione; non sono fatti per cogliere la pressione che una singola contea subisce quest'anno. La conoscenza locale è l'opposto — vicina e specifica, ma non un sostituto della veduta ampia che ha permesso, all'inizio, di collocare ottanta segni. Nessuna delle due è semplicemente la mappa giusta. Solo mettendo l'una di fronte all'altra si può dire quanto della mappa regge e dove sono i suoi punti ciechi.</p>

<p>Così, quando una mappa del rischio ti è davanti, i segni non sono la sola cosa da leggere. C'è anche la domanda di quali dati l'abbiano tracciata, a quale scala, e di chi sia la conoscenza che l'ha verificata. Gli stessi ottanta punti appaiono in un modo sotto un solo indicatore tracciato dall'alto, e in un altro una volta che gli esperti locali li hanno esaminati contea per contea.</p>

<p>Niente di tutto questo rende la mappa priva di valore. I diciannove luoghi aggiunti in quelle undici contee del Kenya non sono la prova che la mappa abbia fallito; sono un segno che può ancora essere corretta e aggiornata. Ciò che una mappa mostra conta — e conta anche di che cosa è stata fatta, e chi l'ha confermata.</p>$body_html_it$,
  'Diciannove luoghi che la mappa ha lasciato fuori',
  'Un segno rosso su una mappa si legge come pericolo. I luoghi senza segno si leggono come il contrario, anche se nessuno lo decide davvero: vuoto vuol dire che va tutto bene.',
  FALSE
FROM article_it
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
-- ─────────────────────────────────────────────────────────────────────────────
WITH article AS (
  SELECT id FROM public.journal_articles WHERE slug = 'nineteen-places-the-map-missed'
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
      'Kenduiywo, B., Korir, V., Chepngetich, B., Villa, V., Belli, A., Sagliocco, L., Pacillo, G., Medina, L., & Läderach, P. (2026). Understanding local expert perceptions of climate security hotspots using participatory mapping. PLOS Climate, 5, e0000746.',
      '10.1371/journal.pclm.0000746',
      'https://doi.org/10.1371/journal.pclm.0000746'
    )
) AS v(sort_order, ref_text, doi, url);

COMMIT;

-- =============================================================================
-- END
-- =============================================================================
