-- =============================================================================
-- 20260828000000_journal_urban_polycentricity_article.sql
-- 記事: oej-2026-urban-polycentricity-mobility / where-is-the-center-of-your-city
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
  approved_at,
  published_at,
  archived_at
)
VALUES (
  'where-is-the-center-of-your-city',
  'published',
  'ONE EIGHT Journal',
  ARRAY['urban structure','polycentricity','human mobility','smart-card data','London','Seoul','transport networks','urban centrality'],
  '2026-08-20 12:51:11+09:00',
  '2026-08-28 00:00:00+09:00',
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
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'where-is-the-center-of-your-city')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'en',
  'Where Is the Center of Your City?',
  $ex$You could point to it without thinking. But the center you would name and the center your week actually circles may not be the same place.$ex$,
  $body$<p>You know where your city's center is. You could point without thinking — the station everyone names, the district printed largest on the map, the place you would send a visitor. It feels like a plain fact about the city, fixed and singular. One center, and everyone agrees where.</p>
<p>Watch what you are pointing at, though. It is a place: towers, a name, a dot. It is not where you actually spend your days. Most weeks you keep to a smaller orbit — the stop near work, the shops a few minutes off, the corner you keep coming back to. You may hardly set foot in the official center at all. If someone traced only your movements, the center they drew might not be the one you would name.</p>
<p>That gap has been measured. Following millions of ordinary trips in London and Seoul, Carmen Cabrera-Arnau and colleagues did not ask anyone where the center was; they watched where trips actually gathered. Their move was to fix one obvious center — Piccadilly Circus in London, City Hall in Seoul — and see how far real journeys strayed from what that single center should produce. London's mostly matched it. Seoul's did not: trips to the outer stations kept coming in too short, many of them only about five stops, people moving a few stops and back, orbiting something close to home instead of heading downtown. The pattern that shows up across a whole city is built out of ordinary weeks like yours.</p>
<p>Which city has "more" centers is not the interesting part. What matters is what happened to the word. The center stopped being a place you point to and became a pattern you measure. And once it is something measured, it depends on what you measure. Movement marks one center. Land prices mark another. The official plan marks a third. Nothing says they land in the same spot.</p>
<p>So there is no single true center waiting under the city — only a question we skip because the skyline answers it so confidently. Where the tallest buildings stand is one answer. Where rents peak is another. Where your days actually collect is a third, and it is the one you live inside.</p>
<p>Nothing here changes the buildings. The towers stay where they are. What changes is the next time you say "downtown," or point a visitor toward the center, or call a neighborhood central. A small question comes with it now: central by what measure, and for whom? The place with the towers, or the place your own week keeps circling? The city you move through may be centered somewhere the map has never marked.</p>$body$,
  'Where Is the Center of Your City? | ONE EIGHT Journal',
  $ex$You could point to it without thinking. But the center you would name and the center your week actually circles may not be the same place.$ex$,
  true
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ja
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'where-is-the-center-of-your-city')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'ja',
  'あなたの街の中心は、どこですか',
  $ex$迷わず指させる。けれど、あなたが名指す中心と、あなたの一週間が実際に回っている中心は、同じ場所とはかぎらない。$ex$,
  $body$<p>あなたは、自分の街の中心がどこか知っている。考えるまでもなく指させる。誰もが名を挙げる駅、地図にいちばん大きく刷られた一角、来客を送るならそこ、という場所。それは街についての動かしがたい事実に感じられる。ひとつきりで、みなが同じ場所を思い浮かべる。</p>
<p>けれど、自分が何を指しているかを見てほしい。指しているのは場所だ。高層ビル、地名、地図の点。そこは、あなたが実際に一日を過ごす場所ではない。たいていの週、あなたはもっと小さな範囲を回っている。職場の最寄り、数分先の店、いつも戻ってくる角。公式の中心には、ほとんど足を踏み入れない週もある。もし誰かがあなたの移動だけをなぞったら、描かれる中心は、あなたが名指すそれとは違うかもしれない。</p>
<p>その食い違いが、実際に測られたことがある。ロンドンとソウルの数百万件の移動を追って、Carmen Cabrera-Arnau らは、中心はどこかと誰にも尋ねなかった。移動が実際にどこへ集まるかを見た。やり方はこうだ。分かりやすい中心を一つ置く——ロンドンはピカデリー・サーカス、ソウルはシティホール。そして、実際の移動が、その一つの中心が生むはずの姿からどれだけ外れるかを見る。ロンドンはおおむね一致した。ソウルは違った。外縁の駅で終わる移動が、どれも短すぎたのだ。多くはせいぜい5駅ほど。人びとは数駅を行き来し、都心へ出るより、家の近くの何かのまわりを回っていた。街全体に現れるこのパターンは、あなたのような、ありふれた一週間の積み重ねでできている。</p>
<p>どちらの街の中心が「多い」かは、面白いところではない。大事なのは、言葉に起きたことだ。中心は、指させる場所であることをやめ、測るパターンになった。そして測るものである以上、何を測るかで変わる。移動はある中心を示す。地価は別の中心を示す。公式の計画はまた別を示す。それらが同じ場所に来る保証はない。</p>
<p>だから、街の下に埋まっている唯一の真の中心などない。あるのは、私たちが飛ばしている問いだけだ——街並みがあまりに自信たっぷりに答えるから、飛ばしてしまう問い。高いビルが立つのはどこか、が一つの答え。家賃が頂点に達するのはどこか、が別の答え。あなたの日々が実際に集まるのはどこか、が三つ目で、あなたが暮らしているのはそこだ。</p>
<p>建物は何も変わらない。高層ビルは、あるところにある。変わるのは、次にあなたが「都心」と言うとき、来客に中心はあちらと指すとき、ある界隈を中心的だと呼ぶときだ。小さな問いが、いまはついてくる。何を測っての中心か、誰にとっての中心か。高層ビルの場所か、それとも、あなた自身の一週間が回りつづけている場所か。あなたが動きまわる街は、地図がまだ記していないどこかを中心にしているかもしれない。</p>$body$,
  'あなたの街の中心は、どこですか | ONE EIGHT Journal',
  $ex$迷わず指させる。けれど、あなたが名指す中心と、あなたの一週間が実際に回っている中心は、同じ場所とはかぎらない。$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- zh-Hant
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'where-is-the-center-of-your-city')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'zh-Hant',
  '你的城市，中心在哪裡？',
  $ex$你能想都不想就指出來。但你會說出口的那個中心，和你的一週實際繞著轉的那個中心，未必是同一個地方。$ex$,
  $body$<p>你知道自己城市的中心在哪裡。你能想都不想就指出來——那個人人都會提起的車站，地圖上印得最大的那一區，你會帶訪客去的那個地方。它感覺像是關於這座城市的一樁明白事實，固定而唯一。一個中心，而且大家都同意它在哪。</p>
<p>不過，看看你正指著的是什麼。那是一個地方：高樓、一個名字、一個點。那並不是你實際度過每一天的地方。多數的星期裡，你守著一個更小的軌道——工作附近的那一站，走幾分鐘就到的店家，你一再回去的那個街角。你甚至可能幾乎沒踏進官方的那個中心。如果有人只描摹你的移動，他們畫出來的中心，或許不是你會說出口的那一個。</p>
<p>這道落差被測量過。追蹤倫敦與首爾數以百萬計的日常行程，Carmen Cabrera-Arnau 與同事並沒有問任何人中心在哪；他們看的是行程實際往哪裡聚集。他們的做法，是先固定一個顯而易見的中心——倫敦的皮卡迪利圓環，首爾的市廳——再看真實的旅次偏離「單一中心應該產生的樣子」有多遠。倫敦大致吻合。首爾則不然：往外圍車站的旅次一直太短，其中許多只有大約五站，人們移動個幾站再回來，繞著離家不遠的什麼東西打轉，而不是往市中心去。在整座城市尺度上浮現的這個型態，正是由一個個像你那樣平常的星期堆疊而成的。</p>
<p>哪一座城市的中心「比較多」，並不是有意思的地方。要緊的是這個詞發生了什麼事。中心不再是一個你可以指出來的地方，而成了一個你可以測量的型態。而一旦它是被測出來的東西，它就取決於你測的是什麼。移動標出一個中心。地價標出另一個。官方的規劃標出第三個。沒有什麼保證它們會落在同一點上。</p>
<p>所以，城市底下並沒有埋著一個唯一為真的中心——有的只是一個我們略過的問題，因為天際線回答得太過篤定。最高的樓立在哪裡，是一個答案。租金在哪裡達到頂點，是另一個。你的日子實際聚集在哪裡，是第三個，而那是你身在其中的那一個。</p>
<p>這一切都不會改變任何建築。高樓還在原處。會改變的，是下一次你說「市中心」的時候，或你為訪客指向中心的時候，或你稱某個街區為中心地帶的時候。現在，一個小小的問題會跟著來：以什麼標準算中心，又是對誰而言的中心？是有高樓的那個地方，還是你自己的一週一直繞著轉的那個地方？你所穿行的那座城市，中心也許落在地圖從未標記過的某處。</p>$body$,
  '你的城市，中心在哪裡？ | ONE EIGHT Journal',
  $ex$你能想都不想就指出來。但你會說出口的那個中心，和你的一週實際繞著轉的那個中心，未必是同一個地方。$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- zh-Hans
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'where-is-the-center-of-your-city')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'zh-Hans',
  '你的城市，中心在哪里？',
  $ex$你能想都不想就指出来。但你会说出口的那个中心，和你的一周实际绕着转的那个中心，未必是同一个地方。$ex$,
  $body$<p>你知道自己城市的中心在哪里。你能想都不想就指出来——那个人人都会提起的车站，地图上印得最大的那一区，你会带访客去的那个地方。它感觉像是关于这座城市的一桩明白事实，固定而唯一。一个中心，而且大家都同意它在哪。</p>
<p>不过，看看你正指着的是什么。那是一个地方：高楼、一个名字、一个点。那并不是你实际度过每一天的地方。多数的星期里，你守着一个更小的轨道——工作附近的那一站，走几分钟就到的店家，你一再回去的那个街角。你甚至可能几乎没踏进官方的那个中心。如果有人只描摹你的移动，他们画出来的中心，或许不是你会说出口的那一个。</p>
<p>这道落差被测量过。追踪伦敦与首尔数以百万计的日常行程，Carmen Cabrera-Arnau 与同事并没有问任何人中心在哪；他们看的是行程实际往哪里聚集。他们的做法，是先固定一个显而易见的中心——伦敦的皮卡迪利圆环，首尔的市厅——再看真实的出行偏离"单一中心应该产生的样子"有多远。伦敦大致吻合。首尔则不然：往外围车站的出行一直太短，其中许多只有大约五站，人们移动个几站再回来，绕着离家不远的什么东西打转，而不是往市中心去。在整座城市尺度上浮现的这个形态，正是由一个个像你那样平常的星期堆叠而成的。</p>
<p>哪一座城市的中心"比较多"，并不是有意思的地方。要紧的是这个词发生了什么事。中心不再是一个你可以指出来的地方，而成了一个你可以测量的形态。而一旦它是被测出来的东西，它就取决于你测的是什么。移动标出一个中心。地价标出另一个。官方的规划标出第三个。没有什么保证它们会落在同一点上。</p>
<p>所以，城市底下并没有埋着一个唯一为真的中心——有的只是一个我们略过的问题，因为天际线回答得太过笃定。最高的楼立在哪里，是一个答案。租金在哪里达到顶点，是另一个。你的日子实际聚集在哪里，是第三个，而那是你身在其中的那一个。</p>
<p>这一切都不会改变任何建筑。高楼还在原处。会改变的，是下一次你说"市中心"的时候，或你为访客指向中心的时候，或你称某个街区为中心地带的时候。现在，一个小小的问题会跟着来：以什么标准算中心，又是对谁而言的中心？是有高楼的那个地方，还是你自己的一周一直绕着转的那个地方？你所穿行的那座城市，中心也许落在地图从未标记过的某处。</p>$body$,
  '你的城市，中心在哪里？ | ONE EIGHT Journal',
  $ex$你能想都不想就指出来。但你会说出口的那个中心，和你的一周实际绕着转的那个中心，未必是同一个地方。$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ko
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'where-is-the-center-of-your-city')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'ko',
  '당신의 도시, 중심은 어디인가',
  $ex$생각할 것도 없이 가리킬 수 있다. 그러나 당신이 이름 붙일 그 중심과, 당신의 한 주가 실제로 맴도는 중심은 같은 곳이 아닐 수도 있다.$ex$,
  $body$<p>당신은 자기 도시의 중심이 어디인지 안다. 생각할 것도 없이 가리킬 수 있다 — 모두가 이름을 대는 그 역, 지도에 가장 크게 박힌 그 구역, 손님이 오면 보낼 그 장소. 그것은 도시에 관한 명백한 사실처럼, 고정되고 하나뿐인 것처럼 느껴진다. 중심은 하나, 그리고 그곳이 어디인지에 모두가 동의한다.</p>
<p>그런데 당신이 가리키고 있는 것이 무엇인지 보라. 그것은 하나의 장소다. 고층 건물, 이름 하나, 점 하나. 그곳은 당신이 실제로 하루하루를 보내는 곳이 아니다. 대부분의 주에 당신은 더 작은 궤도를 지킨다 — 직장 근처의 그 정류장, 몇 분 거리의 가게들, 자꾸만 되돌아가는 그 모퉁이. 공식적인 중심에는 발조차 거의 들이지 않을 수도 있다. 누군가 당신의 이동만을 따라 그린다면, 그렇게 그려진 중심은 당신이 이름 붙일 그 중심이 아닐지도 모른다.</p>
<p>그 간극은 측정된 적이 있다. 런던과 서울의 수백만 건에 이르는 평범한 이동을 좇으면서, Carmen Cabrera-Arnau와 동료들은 중심이 어디냐고 누구에게도 묻지 않았다. 이동이 실제로 어디에 모이는지를 보았다. 그들의 수는 이랬다. 누가 봐도 분명한 중심 하나를 고정해 두고 — 런던은 피커딜리 서커스, 서울은 시청 — 실제 이동이 그 하나의 중심이 만들어 낼 법한 모습에서 얼마나 벗어나는지를 본 것이다. 런던은 대체로 들어맞았다. 서울은 그렇지 않았다. 외곽 역으로 향하는 이동이 계속 너무 짧게 나왔고, 그중 상당수는 다섯 정거장 남짓에 불과했다. 사람들은 몇 정거장을 오갔고, 도심으로 나가는 대신 집에서 멀지 않은 무언가의 둘레를 맴돌고 있었다. 도시 전체에서 드러나는 이 양상은, 당신의 것과 같은 평범한 한 주들로 지어진다.</p>
<p>어느 도시에 중심이 "더 많은지"는 흥미로운 대목이 아니다. 중요한 것은 그 단어에 일어난 일이다. 중심은 가리킬 수 있는 장소이기를 그치고, 측정하는 양상이 되었다. 그리고 일단 측정되는 것이 되면, 그것은 무엇을 측정하느냐에 달려 있다. 이동은 하나의 중심을 찍는다. 땅값은 또 다른 중심을 찍는다. 공식 계획은 세 번째를 찍는다. 그것들이 같은 자리에 내려앉는다고 말해 주는 것은 아무것도 없다.</p>
<p>그러니 도시 아래 묻혀 기다리는 단 하나의 참된 중심 같은 것은 없다 — 있는 것은 우리가 건너뛰는 질문뿐이다. 스카이라인이 너무도 자신 있게 답해 주기 때문에 건너뛰는 질문. 가장 높은 건물들이 서 있는 곳이 하나의 답이다. 임대료가 정점에 이르는 곳이 또 하나다. 당신의 하루하루가 실제로 모이는 곳이 세 번째이고, 당신이 그 안에서 살고 있는 것은 바로 그것이다.</p>
<p>이 가운데 무엇도 건물을 바꾸지는 않는다. 고층 건물은 있던 자리에 그대로 있다. 바뀌는 것은 다음번에 당신이 "도심"이라고 말할 때, 혹은 손님에게 중심 쪽을 가리킬 때, 혹은 어떤 동네를 중심가라고 부를 때다. 이제 작은 질문 하나가 따라온다. 무엇으로 재서 중심이며, 누구에게 중심인가? 고층 건물이 있는 그곳인가, 아니면 당신 자신의 한 주가 계속 맴도는 그곳인가? 당신이 지나다니는 그 도시는, 지도가 한 번도 표시한 적 없는 어딘가를 중심으로 삼고 있을지도 모른다.</p>$body$,
  '당신의 도시, 중심은 어디인가 | ONE EIGHT Journal',
  $ex$생각할 것도 없이 가리킬 수 있다. 그러나 당신이 이름 붙일 그 중심과, 당신의 한 주가 실제로 맴도는 중심은 같은 곳이 아닐 수도 있다.$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- es
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'where-is-the-center-of-your-city')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'es',
  '¿Dónde está el centro de tu ciudad?',
  $ex$Podrías señalarlo sin pensar. Pero el centro que nombrarías y el centro alrededor del cual gira de verdad tu semana quizá no sean el mismo lugar.$ex$,
  $body$<p>Sabes dónde está el centro de tu ciudad. Podrías señalarlo sin pensar: la estación que todo el mundo nombra, el barrio impreso más grande en el mapa, el sitio al que mandarías a alguien de visita. Parece un hecho llano sobre la ciudad, fijo y único. Un centro, y todos de acuerdo en dónde queda.</p>
<p>Fíjate, sin embargo, en qué estás señalando. Es un lugar: torres, un nombre, un punto. No es donde pasas realmente tus días. Casi todas las semanas te mueves en una órbita más pequeña: la parada cerca del trabajo, las tiendas a unos minutos, la esquina a la que vuelves una y otra vez. Puede que apenas pises el centro oficial. Si alguien trazara solo tus desplazamientos, el centro que dibujara quizá no sería el que tú nombrarías.</p>
<p>Esa distancia se ha medido. Siguiendo millones de viajes corrientes en Londres y en Seúl, Carmen Cabrera-Arnau y sus colegas no le preguntaron a nadie dónde estaba el centro; observaron dónde se agrupaban de hecho los viajes. Su jugada fue fijar un centro evidente —Piccadilly Circus en Londres, el Ayuntamiento en Seúl— y ver cuánto se apartaban los trayectos reales de lo que ese único centro debería producir. Los de Londres encajaban en su mayoría. Los de Seúl no: los viajes hacia las estaciones exteriores salían una y otra vez demasiado cortos, muchos de ellos de apenas unas cinco paradas; gente que se movía unas pocas paradas y volvía, orbitando algo cercano a casa en lugar de dirigirse al centro. El patrón que aparece en el conjunto de una ciudad está hecho de semanas corrientes como la tuya.</p>
<p>Cuál de las dos ciudades tiene "más" centros no es lo interesante. Lo que importa es lo que le pasó a la palabra. El centro dejó de ser un lugar que se señala y pasó a ser un patrón que se mide. Y en cuanto es algo medido, depende de qué midas. El movimiento marca un centro. El precio del suelo marca otro. El plan oficial marca un tercero. Nada dice que caigan en el mismo punto.</p>
<p>Así que no hay un único centro verdadero esperando bajo la ciudad: solo una pregunta que nos saltamos porque el perfil de los edificios la responde con demasiada seguridad. Dónde se alzan los edificios más altos es una respuesta. Dónde alcanzan su tope los alquileres es otra. Dónde se juntan de verdad tus días es una tercera, y es la que habitas por dentro.</p>
<p>Nada de esto cambia los edificios. Las torres siguen donde están. Lo que cambia es la próxima vez que digas "el centro", o le señales el centro a quien te visita, o llames céntrico a un barrio. Ahora viene con una pequeña pregunta: céntrico según qué medida, y para quién. ¿El lugar de las torres, o el lugar alrededor del cual sigue girando tu propia semana? La ciudad por la que te mueves quizá esté centrada en un punto que el mapa nunca ha marcado.</p>$body$,
  '¿Dónde está el centro de tu ciudad? | ONE EIGHT Journal',
  $ex$Podrías señalarlo sin pensar. Pero el centro que nombrarías y el centro alrededor del cual gira de verdad tu semana quizá no sean el mismo lugar.$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- pt-BR
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'where-is-the-center-of-your-city')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'pt-BR',
  'Onde fica o centro da sua cidade?',
  $ex$Você apontaria sem pensar. Mas o centro que você nomearia e o centro em torno do qual sua semana de fato gira podem não ser o mesmo lugar.$ex$,
  $body$<p>Você sabe onde fica o centro da sua cidade. Apontaria sem pensar: a estação que todo mundo cita, o bairro impresso maior no mapa, o lugar para onde você mandaria uma visita. Parece um fato simples sobre a cidade, fixo e único. Um centro, e todo mundo concorda sobre onde ele fica.</p>
<p>Repare, porém, no que você está apontando. É um lugar: torres, um nome, um ponto. Não é onde você de fato passa os seus dias. Na maioria das semanas você se mantém numa órbita menor — o ponto perto do trabalho, as lojas a alguns minutos, a esquina à qual você sempre volta. Talvez você mal pise no centro oficial. Se alguém traçasse apenas os seus deslocamentos, o centro que essa pessoa desenhasse talvez não fosse o que você nomearia.</p>
<p>Essa diferença já foi medida. Acompanhando milhões de viagens comuns em Londres e em Seul, Carmen Cabrera-Arnau e colegas não perguntaram a ninguém onde ficava o centro; observaram onde as viagens de fato se juntavam. A jogada deles foi fixar um centro evidente — Piccadilly Circus em Londres, a Prefeitura em Seul — e ver o quanto os trajetos reais se afastavam do que aquele centro único deveria produzir. Os de Londres, em boa parte, batiam. Os de Seul, não: as viagens para as estações mais externas saíam sempre curtas demais, muitas delas de apenas umas cinco paradas; pessoas que andavam algumas paradas e voltavam, orbitando algo perto de casa em vez de seguir para o centro. O padrão que aparece na cidade inteira é feito de semanas comuns como a sua.</p>
<p>Qual cidade tem "mais" centros não é a parte interessante. O que importa é o que aconteceu com a palavra. O centro deixou de ser um lugar que se aponta e virou um padrão que se mede. E, uma vez que é algo medido, depende do que você mede. O movimento marca um centro. O preço da terra marca outro. O plano oficial marca um terceiro. Nada garante que caiam no mesmo ponto.</p>
<p>Portanto não existe um único centro verdadeiro à espera debaixo da cidade — só uma pergunta que pulamos porque a linha do horizonte a responde com confiança demais. Onde ficam os prédios mais altos é uma resposta. Onde os aluguéis chegam ao pico é outra. Onde os seus dias de fato se juntam é uma terceira, e é dentro dela que você vive.</p>
<p>Nada disso muda os prédios. As torres continuam onde estão. O que muda é a próxima vez que você disser "centro", ou apontar o centro para quem está de visita, ou chamar um bairro de central. Agora vem junto uma pequena pergunta: central por qual medida, e para quem? O lugar com as torres, ou o lugar em torno do qual a sua própria semana continua girando? A cidade pela qual você circula pode estar centrada em algum ponto que o mapa nunca marcou.</p>$body$,
  'Onde fica o centro da sua cidade? | ONE EIGHT Journal',
  $ex$Você apontaria sem pensar. Mas o centro que você nomearia e o centro em torno do qual sua semana de fato gira podem não ser o mesmo lugar.$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- de
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'where-is-the-center-of-your-city')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'de',
  'Wo liegt das Zentrum Ihrer Stadt?',
  $ex$Sie könnten ohne Nachdenken darauf zeigen. Doch das Zentrum, das Sie nennen würden, und das Zentrum, um das Ihre Woche tatsächlich kreist, müssen nicht derselbe Ort sein.$ex$,
  $body$<p>Sie wissen, wo das Zentrum Ihrer Stadt liegt. Sie könnten ohne Nachdenken darauf zeigen — der Bahnhof, den alle nennen, das Viertel, das am größten auf der Karte steht, der Ort, zu dem Sie einen Besuch schicken würden. Es fühlt sich wie eine schlichte Tatsache über die Stadt an, feststehend und einzig. Ein Zentrum, und alle sind sich einig, wo.</p>
<p>Sehen Sie aber genau hin, worauf Sie zeigen. Es ist ein Ort: Türme, ein Name, ein Punkt. Es ist nicht der Ort, an dem Sie Ihre Tage tatsächlich verbringen. In den meisten Wochen bleiben Sie auf einer kleineren Umlaufbahn — die Haltestelle bei der Arbeit, die Läden ein paar Minuten weiter, die Ecke, an die Sie immer wieder zurückkehren. Vielleicht setzen Sie kaum einen Fuß in das offizielle Zentrum. Würde jemand nur Ihre Wege nachzeichnen, wäre das Zentrum, das dabei entsteht, womöglich nicht das, welches Sie nennen würden.</p>
<p>Diese Lücke ist gemessen worden. Carmen Cabrera-Arnau und Kollegen verfolgten Millionen alltäglicher Fahrten in London und Seoul und fragten niemanden, wo das Zentrum sei; sie schauten, wo sich die Fahrten tatsächlich sammelten. Ihr Kniff war, ein offensichtliches Zentrum festzulegen — Piccadilly Circus in London, das Rathaus in Seoul — und dann zu sehen, wie weit die wirklichen Wege von dem abwichen, was dieses eine Zentrum hervorbringen müsste. Londons Wege passten größtenteils dazu. Seouls nicht: Fahrten zu den äußeren Stationen fielen immer wieder zu kurz aus, viele davon nur etwa fünf Stationen; Menschen fuhren ein paar Stationen und zurück und kreisten um etwas nahe der eigenen Wohnung, statt in die Innenstadt zu fahren. Das Muster, das sich über eine ganze Stadt zeigt, ist aus gewöhnlichen Wochen wie Ihrer gebaut.</p>
<p>Welche Stadt "mehr" Zentren hat, ist nicht das Interessante. Wichtig ist, was mit dem Wort geschehen ist. Das Zentrum hörte auf, ein Ort zu sein, auf den man zeigt, und wurde ein Muster, das man misst. Und sobald es etwas Gemessenes ist, hängt es davon ab, was man misst. Bewegung markiert ein Zentrum. Bodenpreise markieren ein anderes. Der offizielle Plan markiert ein drittes. Nichts sagt, dass sie an derselben Stelle landen.</p>
<p>Es gibt also kein einziges wahres Zentrum, das unter der Stadt wartet — nur eine Frage, die wir überspringen, weil die Skyline sie so selbstsicher beantwortet. Wo die höchsten Gebäude stehen, ist eine Antwort. Wo die Mieten ihren Höchststand erreichen, ist eine andere. Wo sich Ihre Tage tatsächlich sammeln, ist eine dritte, und in dieser leben Sie.</p>
<p>Nichts davon verändert die Gebäude. Die Türme bleiben, wo sie sind. Was sich ändert, ist das nächste Mal, wenn Sie "Innenstadt" sagen, oder einem Besuch die Richtung zum Zentrum weisen, oder ein Viertel zentral nennen. Eine kleine Frage kommt jetzt mit: zentral nach welchem Maß, und für wen? Der Ort mit den Türmen, oder der Ort, um den Ihre eigene Woche immer wieder kreist? Die Stadt, durch die Sie sich bewegen, hat ihr Zentrum vielleicht dort, wo die Karte nie eines eingetragen hat.</p>$body$,
  'Wo liegt das Zentrum Ihrer Stadt? | ONE EIGHT Journal',
  $ex$Sie könnten ohne Nachdenken darauf zeigen. Doch das Zentrum, das Sie nennen würden, und das Zentrum, um das Ihre Woche tatsächlich kreist, müssen nicht derselbe Ort sein.$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- fr
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'where-is-the-center-of-your-city')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'fr',
  'Où est le centre de votre ville ?',
  $ex$Vous pourriez le montrer sans réfléchir. Mais le centre que vous nommeriez et celui autour duquel tourne réellement votre semaine ne sont peut-être pas le même endroit.$ex$,
  $body$<p>Vous savez où se trouve le centre de votre ville. Vous pourriez le montrer sans réfléchir — la gare que tout le monde cite, le quartier imprimé en plus gros sur la carte, l'endroit où vous enverriez un visiteur. Cela ressemble à un fait tout simple sur la ville, fixe et unique. Un centre, et tout le monde d'accord sur son emplacement.</p>
<p>Regardez pourtant ce que vous montrez. C'est un lieu : des tours, un nom, un point. Ce n'est pas là que vous passez réellement vos journées. La plupart des semaines, vous tenez une orbite plus petite — l'arrêt près du travail, les commerces à quelques minutes, le coin de rue où vous revenez sans cesse. Il se peut que vous ne mettiez presque jamais les pieds dans le centre officiel. Si quelqu'un ne traçait que vos déplacements, le centre qu'il dessinerait ne serait peut-être pas celui que vous nommeriez.</p>
<p>Cet écart a été mesuré. En suivant des millions de trajets ordinaires à Londres et à Séoul, Carmen Cabrera-Arnau et ses collègues n'ont demandé à personne où était le centre ; ils ont observé où les trajets se rassemblaient effectivement. Leur idée a été de fixer un centre évident — Piccadilly Circus à Londres, l'hôtel de ville à Séoul — puis de voir de combien les déplacements réels s'écartaient de ce que ce centre unique devrait produire. Ceux de Londres correspondaient pour l'essentiel. Ceux de Séoul, non : les trajets vers les stations extérieures ressortaient toujours trop courts, beaucoup ne faisant qu'environ cinq stations ; des gens parcouraient quelques stations puis revenaient, gravitant autour de quelque chose proche de chez eux plutôt que de gagner le centre-ville. Le motif qui apparaît à l'échelle d'une ville entière est fait de semaines ordinaires comme la vôtre.</p>
<p>Savoir quelle ville a "plus" de centres n'est pas ce qui compte. Ce qui compte, c'est ce qui est arrivé au mot. Le centre a cessé d'être un lieu que l'on montre pour devenir un motif que l'on mesure. Et dès lors qu'il s'agit d'une chose mesurée, cela dépend de ce que l'on mesure. Les déplacements désignent un centre. Le prix du foncier en désigne un autre. Le plan officiel en désigne un troisième. Rien ne dit qu'ils tombent au même endroit.</p>
<p>Il n'y a donc pas de centre unique et vrai qui attendrait sous la ville — seulement une question que nous sautons, parce que la ligne des toits y répond avec trop d'assurance. Là où se dressent les plus hauts immeubles est une réponse. Là où les loyers culminent en est une autre. Là où vos journées se rassemblent réellement en est une troisième, et c'est celle-là que vous habitez.</p>
<p>Rien de tout cela ne change les bâtiments. Les tours restent où elles sont. Ce qui change, c'est la prochaine fois que vous direz "le centre", ou que vous indiquerez le centre à un visiteur, ou que vous qualifierez un quartier de central. Une petite question l'accompagne désormais : central selon quelle mesure, et pour qui ? L'endroit avec les tours, ou celui autour duquel votre propre semaine ne cesse de tourner ? La ville que vous traversez a peut-être son centre quelque part où la carte n'en a jamais marqué.</p>$body$,
  'Où est le centre de votre ville ? | ONE EIGHT Journal',
  $ex$Vous pourriez le montrer sans réfléchir. Mais le centre que vous nommeriez et celui autour duquel tourne réellement votre semaine ne sont peut-être pas le même endroit.$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- it
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'where-is-the-center-of-your-city')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'it',
  'Dov''è il centro della tua città?',
  $ex$Potresti indicarlo senza pensarci. Ma il centro che nomineresti e quello attorno a cui gira davvero la tua settimana potrebbero non essere lo stesso luogo.$ex$,
  $body$<p>Sai dov'è il centro della tua città. Potresti indicarlo senza pensarci: la stazione che nominano tutti, il quartiere stampato più grande sulla mappa, il posto dove manderesti chi viene a trovarti. Sembra un fatto semplice sulla città, fisso e unico. Un centro, e tutti d'accordo su dove sia.</p>
<p>Guarda però che cosa stai indicando. È un luogo: torri, un nome, un punto. Non è dove passi davvero le tue giornate. Nella maggior parte delle settimane ti tieni su un'orbita più piccola: la fermata vicino al lavoro, i negozi a qualche minuto, l'angolo a cui torni di continuo. Può darsi che nel centro ufficiale non metta quasi piede. Se qualcuno tracciasse soltanto i tuoi spostamenti, il centro che ne verrebbe fuori forse non sarebbe quello che nomineresti.</p>
<p>Quella distanza è stata misurata. Seguendo milioni di spostamenti ordinari a Londra e a Seul, Carmen Cabrera-Arnau e colleghi non hanno chiesto a nessuno dove fosse il centro; hanno osservato dove gli spostamenti si radunavano davvero. La loro mossa è stata fissare un centro ovvio — Piccadilly Circus a Londra, il Municipio a Seul — e vedere quanto i percorsi reali si allontanassero da ciò che quell'unico centro dovrebbe produrre. Quelli di Londra corrispondevano in gran parte. Quelli di Seul no: gli spostamenti verso le stazioni esterne risultavano sempre troppo brevi, molti di appena cinque fermate; persone che facevano qualche fermata e tornavano, orbitando attorno a qualcosa vicino a casa invece di andare in centro. Lo schema che emerge sull'intera città è fatto di settimane ordinarie come la tua.</p>
<p>Quale città abbia "più" centri non è la parte interessante. Ciò che conta è che cosa è successo alla parola. Il centro ha smesso di essere un luogo da indicare ed è diventato uno schema da misurare. E una volta che è qualcosa di misurato, dipende da che cosa misuri. Il movimento segna un centro. Il prezzo dei terreni ne segna un altro. Il piano ufficiale ne segna un terzo. Nulla dice che cadano nello stesso punto.</p>
<p>Non c'è dunque un unico vero centro in attesa sotto la città: c'è solo una domanda che saltiamo, perché il profilo dei palazzi le risponde con troppa sicurezza. Dove sorgono gli edifici più alti è una risposta. Dove gli affitti toccano il massimo è un'altra. Dove le tue giornate si radunano davvero è una terza, ed è quella che abiti.</p>
<p>Niente di tutto questo cambia gli edifici. Le torri restano dove sono. Ciò che cambia è la prossima volta che dirai "centro", o indicherai il centro a chi è in visita, o definirai centrale un quartiere. Ora si porta dietro una piccola domanda: centrale secondo quale misura, e per chi? Il posto con le torri, o il posto attorno a cui la tua settimana continua a girare? La città che attraversi potrebbe avere il suo centro in un punto che la mappa non ha mai segnato.</p>$body$,
  'Dov''è il centro della tua città? | ONE EIGHT Journal',
  $ex$Potresti indicarlo senza pensarci. Ma il centro che nomineresti e quello attorno a cui gira davvero la tua settimana potrebbero non essere lo stesso luogo.$ex$,
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
  SELECT id FROM public.journal_articles WHERE slug = 'where-is-the-center-of-your-city'
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
  'Cabrera-Arnau, Carmen, Chen Zhong, Michael Batty, Ricardo Silva, and Soong Moon Kang. "Inferring urban polycentricity from the variability in human mobility patterns." Scientific Reports 13, art. 5751 (2023).',
  '10.1038/s41598-023-33003-7',
  'https://doi.org/10.1038/s41598-023-33003-7'
FROM article a;

COMMIT;

-- =============================================================================
-- END
-- =============================================================================
