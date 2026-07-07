-- =============================================================================
-- journal_salamander_seed.sql
-- 記事: oej-2026-salamander-community-science / when-rare-ones-get-recorded
-- 言語: en / ja / zh-Hant / zh-Hans / ko / es / pt-BR / de / fr / it
-- 生成: gen_salamander_seed.py
-- 適用: supabase db push (via migration) or direct apply with approval
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
  'when-rare-ones-get-recorded',
  'published',
  'ONE EIGHT Journal',
  ARRAY['ecology', 'community science', 'salamander', 'observation bias', 'iNaturalist'],
  '2026-07-08 00:00:00+09:00'
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
  SELECT id FROM public.journal_articles WHERE slug = 'when-rare-ones-get-recorded'
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
  'When the Rare Ones Get Recorded, How Does Nature Look?',
  'A creature with more photographs seems to be more abundant. It is a fair assumption, and most of the time it is close enough to true. If a bird fills your feed, it is probably common; if you have neve',
  $body_html_en$<p>A creature with more photographs seems to be more abundant. It is a fair assumption, and most of the time it is close enough to true. If a bird fills your feed, it is probably common; if you have never seen a picture of something, it is probably rare or far away. The map of what we have recorded feels like a map of what exists.</p>

<p>But those two maps are made differently. One is drawn by animals living their lives. The other is drawn by people deciding, in a given moment, that something is worth stopping for, worth photographing, worth uploading. Most of the time the two overlap enough that we forget they are separate. It takes a particular kind of case to pull them apart — one where what catches a person's eye and what is actually out there in the leaf litter turn out not to match.</p>

<p>Consider a damp forest floor in early spring. Lift a rock or a fallen log, and you might find several small salamanders pressed together underneath, sharing the same cool pocket of ground. Now consider what tends to travel from that moment onto a phone. Not, usually, the huddle of ordinary animals. What gets the photograph is the single striking one — a salamander wearing an unusual colour, the one that looks different from all the others. Both things happened in the same forest. Only one of them reliably becomes a record.</p>

<p>This is the small friction worth sitting with before any research enters. We treat a pile of records as a picture of nature. But a record is also a picture of attention — of what a person noticed, and wanted to keep. When the two diverge, the pile starts telling us about ourselves as much as about the animals. And the question stops being how much data there is, and becomes what the data was inclined to catch.</p>

<p>There is a piece of work that puts the two side by side. Alexia McCormick and Julia Riley walked a set of forests in New Brunswick — twenty-three of them — turning cover, counting salamanders, noting who was alone and who was in company, and what colour each one was. Then they pulled the other kind of record: observations of the same species posted to iNaturalist from across the province, made by whoever happened to be out there with a camera. Published in PLOS ONE in 2025, the comparison was not really about the Eastern Red-backed Salamander alone. It was about setting two ways of seeing the same animal against each other, and reading the space between them.</p>

<p>The fieldwork on its own has a rhythm to report. Adults were more likely to be found together — aggregated, several in one spot — in the early spring and the autumn, which lines up with what has been seen elsewhere in the species' range. That is the animal's own pattern, gathered by a method built to sample it: go to the site, look under things, write down everything found, the plain individuals as much as the odd ones.</p>

<p>There is something worth noticing in what that method costs. To learn that the animals gather in spring and autumn, someone has to come back to the same forests across the seasons and lift the same cover again and again — writing down the crowd under the log even when it is the same plain individuals as the week before. The knowledge that huddles happen, and when, is bought with exactly the patience a passing photographer has no reason to spend. That is not a flaw in the walker; it is simply a different errand. A walk does not wait for the season to turn.</p>

<p>The comparison is where the ground shifts. Set the two records next to each other and they disagree in a couple of consistent ways. People posting to iNaturalist were less likely than the field surveys to report salamanders clustered together, and more likely to report the unusual colour forms. Neither difference is a mistake, exactly. A person out for a walk photographs what stands out, and moves on; a survey is obligated to the whole huddle, and to the fiftieth ordinary animal as much as the first. Put those habits into a dataset and the same forest comes out looking different: fewer groups, more rarities, than a systematic count would give.</p>

<p>It would be easy to read that as a case against community records, and easy to read too much into it in the other direction. Both readings miss what the difference is good for. The very habit that under-counts the huddles also has a reach no survey can match. Spread thousands of walkers across a whole province with cameras, and eventually one of them finds something the surveys did not. Here that something was an amelanistic salamander — an individual lacking the usual dark pigment — a colour form not previously documented in New Brunswick. The same tilt toward the unusual that distorts the proportions is what surfaces the genuinely new. The bias and the discovery are the same trait, seen from two sides.</p>

<p>Which is why the useful move is not to pick a winner. The field survey is not a neutral mirror either; it is just biased differently, toward whatever its protocol is built to catch, within the patches of forest someone chose to walk. Every way of recording nature has a shape to its attention. What matters is being able to read that shape — to know, when the rare morph shows up again and again in the posts, that this is a fact about photographers as much as about salamanders, and not to mistake it for the colour becoming more common in the population. To know that fewer reported huddles need not mean fewer huddles on the ground.</p>

<p>That distinction is the whole thing, and it is easy to lose. A colour form that is over-reported is not thereby more frequent. A social behaviour that is under-reported is not thereby rare. Recordability and abundance are different quantities, and a large dataset does not automatically close the gap between them — it can just as easily widen it, piling up more of what was always easy to notice. More records can mean a fuller picture. They can also mean a more confident version of a lopsided one.</p>

<p>None of this is a verdict on the salamanders, or on the people with the cameras, or on the forests of one Canadian province at the cold edge of a species' range. It is smaller than that, and it travels further. The next time you meet a wall of nature records — a species map bright with points, a feed of a hundred sightings, a chart of what people found this year — the animals are in there, genuinely. But so is the shape of human attention, folded in so smoothly it can pass for the thing itself. The question worth keeping is not whether the data is good. It is quieter than that: what was this data inclined to see, and what did it let slip past?</p>$body_html_en$,
  'When the Rare Ones Get Recorded, How Does Nature Look?',
  'A creature with more photographs seems to be more abundant. It is a fair assumption, and most of the time it is close enough to true. If a bird fills your feed,',
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
  SELECT id FROM public.journal_articles WHERE slug = 'when-rare-ones-get-recorded'
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
  '珍しい個体ばかりが記録されると、自然はどう見え変わるか',
  '写真の多い生きものほど、たくさんいるように見える。無理のない思い込みだし、たいていは、だいたい当たっている。ある鳥がしょっちゅう流れてくるなら、その鳥はきっとありふれている。一度も写真を見たことのないものは、たぶん珍しいか、遠くにいる。記録されたものの地図は、存在するものの地図のように感じられる。',
  $body_html_ja$<p>写真の多い生きものほど、たくさんいるように見える。無理のない思い込みだし、たいていは、だいたい当たっている。ある鳥がしょっちゅう流れてくるなら、その鳥はきっとありふれている。一度も写真を見たことのないものは、たぶん珍しいか、遠くにいる。記録されたものの地図は、存在するものの地図のように感じられる。</p>

<p>けれど、その二つの地図は、作られ方が違う。片方は、生きものが暮らしを送ることで描かれる。もう片方は、人がその瞬間に、これは足を止める値打ちがある、撮る値打ちがある、投稿する値打ちがあると決めることで描かれる。ふだんは二つが十分に重なっているので、別物だということを忘れている。二つを引き剥がすには、ちょっと特別な場面がいる。人の目を引くものと、落ち葉の下に実際にいるものとが、食い違ってしまうような場面が。</p>

<p>春先の、湿った森の地面を思い浮かべてみる。石や倒木をそっと持ち上げると、小さなサンショウウオが何匹か身を寄せ合って、同じひんやりした地面のくぼみを分け合っていることがある。次に、その場面から、何がスマートフォンへ運ばれていきやすいかを考える。たいていは、ありふれた個体のかたまりではない。写真になるのは、ひときわ目立つ一匹だ。ほかのどれとも違って見える、めずらしい色をまとった個体。どちらも同じ森で起きたことだ。それでも、記録として残りやすいのは、片方だけである。</p>

<p>これが、研究が入ってくる前に、少し腰を据えて眺めておきたい小さな引っかかりだ。記録の山を、私たちは自然の絵として扱う。でも記録は、注意の絵でもある。ある人が何に気づき、何を手元に残したかったか、の絵だ。二つがずれるとき、その山は、生きものについてと同じくらい、人間について語りはじめる。そして問いは、データがどれだけあるかではなくなる。そのデータが、何を拾いやすかったのか、に変わる。</p>

<p>その二つを並べて置いた仕事がある。Alexia McCormick と Julia Riley は、ニュー・ブランズウィックの森をいくつも歩いた。全部で二十三か所。かぶさっているものをめくり、サンショウウオを数え、単独でいるものと連れのいるものを書き留め、それぞれが何色かを記した。それから、もう一種類の記録を引き出した。同じ種について州じゅうから iNaturalist に投稿された観察——たまたまカメラを持って外に出ていた、誰かによる記録だ。2025年に PLOS ONE に載ったこの比較は、じつのところ、東部アカセスジサンショウウオ（Eastern Red-backed Salamander）という一種そのものの話ではない。同じ生きものを見る二つのやり方を突き合わせ、その間の隙間を読む話だった。</p>

<p>現地調査だけでも、報告すべき手ざわりがある。おとなの個体は、春先と秋に、いっしょにいる——一か所に何匹も集まっている——ことが多かった。これは、この種の分布のほかの場所で見られてきた傾向とも重なる。それは生きものの側のパターンで、それを拾うために作られた方法で集められている。現地へ行き、物の下をのぞき、見つけたものを全部書き留める。地味な個体も、変わった個体と同じだけ。</p>

<p>その方法が何を代償にしているかにも、目を留めておきたい。春と秋に集まるのだと分かるためには、誰かが季節をまたいで同じ森へ戻り、同じかぶさりを何度もめくらなければならない。倒木の下のかたまりを、先週と同じ地味な顔ぶれであっても、そのつど数え、書き留めながら。群れが起きること、そしてそれがいつ起きるのかという知識は、通りすがりの撮り手には費やす理由のない、まさにその根気によって買われている。それは歩き手の欠点ではない。ただ、手にしている用事が違うだけだ。散歩は、季節が巡るのを待ってはくれない。</p>

<p>比較のところで、足場がずれる。二つの記録を並べると、いくつかの決まった向きに食い違う。iNaturalist に投稿する人たちは、現地調査に比べて、集まっているサンショウウオを報告しにくく、めずらしい色の個体を報告しやすかった。どちらのずれも、間違いというわけではない。散歩に出た人は、目立つものを撮って、先へ進む。調査のほうは、かたまり全体に義理があり、五十匹目の地味な個体にも、一匹目と同じだけ付き合う。この癖をデータに流し込むと、同じ森が違って出てくる。きちんと数えたときより、群れは少なく、めずらしいものは多く。</p>

<p>これを市民科学への反証と読むのはたやすいし、逆の向きに読みすぎるのもたやすい。どちらの読みも、この食い違いが何の役に立つかを取りこぼす。かたまりを数えそこねる、まさにその癖は、どんな調査にも真似できない広がりを持っている。カメラを持った何千人もの歩き手を州じゅうにばらまけば、そのうちの一人が、調査の見つけなかったものに行き当たる。ここでのそれは、無黒色型のサンショウウオだった。ふだんの暗い色素を欠いた個体で、ニュー・ブランズウィックではそれまで正式に記録されていなかった色型だ。割合をゆがめる、めずらしいものへのその傾きこそが、本当に新しいものを浮かび上がらせる。偏りと発見は、同じ一つの性質を、裏表から見たものだ。</p>

<p>だから、値打ちのある一手は、勝者を選ぶことではない。現地調査もまた、中立の鏡ではない。ただ、偏り方が違うだけだ。手順が拾うように作られたものへ、そして誰かが歩くと決めた森の区画のなかへ、傾いている。自然を記録するどのやり方にも、注意の形がある。大事なのは、その形を読めることだ。めずらしい色型が投稿のなかに何度も現れるとき、それがサンショウウオについての事実であると同じくらい、撮る人についての事実でもあると分かること。そして、それを個体群のなかでその色が増えたことと取り違えないこと。報告される群れが減っても、地面の上で群れが減ったとはかぎらない、と分かること。</p>

<p>この区別が、話のすべてで、しかも取り落としやすい。過大に報告される色型は、それによって頻度が高いわけではない。過小に報告される集まりの行動は、それによってめずらしいわけではない。記録されやすさと、実際の多さは、別の量だ。そして大きなデータは、二つの隙間をひとりでに埋めてはくれない。むしろ広げることもある。もともと気づきやすかったものを、さらに積み上げていくことで。記録が増えれば、絵は豊かになりうる。だが、偏った絵の、より自信たっぷりな版になることもある。</p>

<p>以上のどれも、サンショウウオへの、あるいはカメラを持った人たちへの、あるいは分布の寒い縁にあるカナダの一州の森への、判定ではない。もっと小さく、そのぶん遠くまで届く話だ。次に、自然の記録の壁に出会ったとき——点で光る分布図、百件の目撃が並ぶ画面、今年みんなが見つけたものの一覧——そこに生きものは、確かに入っている。けれど、人間の注意の形も、それそのものに見えるほどなめらかに、折り込まれている。手元に残しておく値打ちのある問いは、このデータが良いかどうか、ではない。もっと低い温度の問いだ。このデータは何を見やすく、何を取りこぼしていたのか。</p>$body_html_ja$,
  '珍しい個体ばかりが記録されると、自然はどう見え変わるか',
  '写真の多い生きものほど、たくさんいるように見える。無理のない思い込みだし、たいていは、だいたい当たっている。ある鳥がしょっちゅう流れてくるなら、その鳥はきっとありふれている。一度も写真を見たことのないものは、たぶん珍しいか、遠くにいる。記録されたものの地図は、存在するものの地図のように感じられる。',
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
  SELECT id FROM public.journal_articles WHERE slug = 'when-rare-ones-get-recorded'
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
  '當被記錄下來的總是罕見的那些，自然看起來會是什麼樣子？',
  '一種生物若有更多照片，看起來就更常見。這是個合理的假設，多數時候也八九不離十。若某種鳥不斷出現在你的動態裡，牠大概很普通；若你從沒見過某樣東西的照片，牠大概很罕見，或離得很遠。我們所記錄下來的那張地圖，感覺就像存在之物的地圖。',
  $body_html_zh_Hant$<p>一種生物若有更多照片，看起來就更常見。這是個合理的假設，多數時候也八九不離十。若某種鳥不斷出現在你的動態裡，牠大概很普通；若你從沒見過某樣東西的照片，牠大概很罕見，或離得很遠。我們所記錄下來的那張地圖，感覺就像存在之物的地圖。</p>

<p>但這兩張地圖，是以不同方式繪成的。一張由過著自己日子的動物畫出；另一張則由人在某個當下，判定某樣東西值得停下、值得拍攝、值得上傳而畫出。多數時候兩者重疊得夠多，讓我們忘了它們本是兩回事。要把它們拉開，需要某種特別的情況——一種讓「吸引人目光的」與「真正躺在落葉層裡的」對不上號的情況。</p>

<p>想像早春一片潮濕的林地。掀開一塊石頭或一根倒木，你可能會發現底下有好幾隻小蠑螈緊挨在一起，共用同一處陰涼的地面凹處。再想想，那個場景中，什麼比較容易被帶進手機裡。通常不是那一團普通的動物。被拍下的，是那唯一顯眼的一隻——一隻披著不尋常顏色、看起來與其餘全都不同的蠑螈。兩件事都發生在同一片森林。但只有其中一件，會可靠地成為記錄。</p>

<p>這正是在任何研究進場之前，值得先停下來細想的小小摩擦。我們把一堆記錄當成自然的畫像。但記錄同時也是注意力的畫像——是某個人注意到了什麼、又想把什麼留下來的畫像。當兩者分岔，這堆記錄開始訴說的，關於我們自己的，和關於動物的一樣多。於是問題不再是資料有多少，而變成：這些資料傾向於捕捉到什麼。</p>

<p>有一項研究把這兩者並排放在一起。Alexia McCormick 與 Julia Riley 走遍新伯倫瑞克的一批森林——共二十三處——翻開覆蓋物、清點蠑螈、記下誰是獨處、誰有同伴，以及每一隻是什麼顏色。然後她們取出另一種記錄：來自全省、由碰巧帶著相機出門的任何人上傳到 iNaturalist 的、同一物種的觀察。這項比較於 2025 年發表在 PLOS ONE，其實並不只是關於東部紅背蠑螈（Eastern Red-backed Salamander）這一個物種，而是把看待同一種動物的兩種方式互相對照，並閱讀兩者之間的空隙。</p>

<p>光是野外調查本身，就有一種值得報告的節奏。成體在早春與秋季比較容易被發現聚在一起——聚集，好幾隻擠在同一處——這與該物種分布範圍內其他地方所見的情形相符。那是動物自身的模式，由一套為了取樣牠而打造的方法收集而來：到樣點去、翻看底下、把找到的一切都寫下來，平凡的個體與奇特的個體一樣照記。</p>

<p>這套方法的代價，也有值得留意之處。要得知這些動物在春秋聚集，就得有人跨越季節一再回到同一片森林，一次又一次掀開同樣的覆蓋物——把倒木下那一群寫下來，即使牠們和上週是同一批平凡面孔。「聚集會發生、以及何時發生」這份知識，正是用一位路過的攝影者沒有理由花費的那種耐心換來的。這不是走訪者的缺陷；那只是一趟不同的差事。散步不會等季節轉換。</p>

<p>比較之處，正是地面移動的地方。把兩種記錄並排，它們會在幾個一致的方向上彼此不合。上傳到 iNaturalist 的人，比野外調查更不容易回報聚在一起的蠑螈，卻更容易回報不尋常的色型。兩種差異都不算是錯誤。出門散步的人拍下顯眼的，然後繼續前行；調查則對整群負有義務，對第五十隻平凡個體與第一隻同樣盡責。把這些習慣灌進一份資料集，同一片森林出來的樣子就不同了：群體更少、罕見者更多，比一次有系統的清點所會給出的還要如此。</p>

<p>這很容易被讀成一樁反對社群記錄的案例，也很容易往另一個方向讀得太過。兩種讀法都錯過了這差異的用處。正是那個少算了群聚的習慣，也擁有任何調查都無法企及的觸及範圍。把數以千計、帶著相機的走訪者撒遍整個省，終究會有其中一人找到調查沒找到的東西。這裡那樣東西，是一隻缺乏黑色素（amelanistic）的蠑螈——一隻缺少通常那種深色色素的個體——一種先前在新伯倫瑞克未曾被記錄過的色型。那個扭曲了比例、偏向不尋常者的傾斜，正是讓真正嶄新之物浮現的東西。偏差與發現，是同一項特質的一體兩面。</p>

<p>正因如此，有用的一步並不是選出贏家。野外調查也不是一面中立的鏡子；它只是以不同方式偏斜——偏向其操作規程所打造來捕捉的東西，且落在某人選擇去走的那些林地斑塊之內。每一種記錄自然的方式，其注意力都有一個形狀。要緊的是能夠讀出那個形狀——在罕見色型一再出現於貼文中時，知道這既是關於攝影者的事實、也是關於蠑螈的事實，而不把它誤認為那種顏色在族群中變得更常見。要知道被回報的群聚變少，未必意味著地面上的群聚變少。</p>

<p>那個區分，就是全部的重點，而它很容易被弄丟。一種被過度回報的色型，並不因此更頻繁。一種被過少回報的社會行為，並不因此更罕見。可記錄性與豐度，是不同的量；而一份龐大的資料集，並不會自動彌合兩者之間的落差——它同樣可能把落差拉得更大，堆積更多一向就容易被注意到的東西。更多記錄可以意味著更完整的畫面，也可以意味著一個偏斜畫面的、更有自信的版本。</p>

<p>這一切都不是對蠑螈的裁決，不是對那些拿著相機的人的裁決，也不是對某個位於物種分布寒冷邊緣的加拿大省份森林的裁決。它比那更小，卻走得更遠。下次你遇上一整面自然記錄的牆——一張以點閃爍的物種分布圖、一連串上百筆的目擊、一張今年人們找到了什麼的圖表——動物確實在其中。但人類注意力的形狀也在其中，折疊得如此順滑，幾乎可以冒充事物本身。值得留在手邊的問題，不是這份資料好不好。它比那更安靜：這份資料傾向於看見什麼，又讓什麼溜了過去？</p>$body_html_zh_Hant$,
  '當被記錄下來的總是罕見的那些，自然看起來會是什麼樣子？',
  '一種生物若有更多照片，看起來就更常見。這是個合理的假設，多數時候也八九不離十。若某種鳥不斷出現在你的動態裡，牠大概很普通；若你從沒見過某樣東西的照片，牠大概很罕見，或離得很遠。我們所記錄下來的那張地圖，感覺就像存在之物的地圖。',
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
  SELECT id FROM public.journal_articles WHERE slug = 'when-rare-ones-get-recorded'
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
  '当被记录下来的总是那些罕见的个体，自然看起来会是什么样子？',
  '一种生物若有更多照片，看上去就更常见。这是个合理的假设，多数时候也八九不离十。要是某种鸟不断出现在你的信息流里，它大概很普通；要是你从没见过某样东西的照片，它大概很罕见，或者离得很远。我们所记录下来的那张地图，感觉就像存在之物的地图。',
  $body_html_zh_Hans$<p>一种生物若有更多照片，看上去就更常见。这是个合理的假设，多数时候也八九不离十。要是某种鸟不断出现在你的信息流里，它大概很普通；要是你从没见过某样东西的照片，它大概很罕见，或者离得很远。我们所记录下来的那张地图，感觉就像存在之物的地图。</p>

<p>但这两张地图，是以不同方式绘成的。一张由过着自己日子的动物画出；另一张则由人在某个当下，判定某样东西值得停下、值得拍摄、值得上传而画出。多数时候两者重叠得足够多，让我们忘了它们本是两回事。要把它们拉开，需要某种特别的情形——一种让"吸引人目光的"和"真正躺在落叶层里的"对不上号的情形。</p>

<p>设想早春一片潮湿的林地。掀开一块石头或一根倒木，你也许会发现底下有好几只小蝾螈紧挨在一起，共用同一处阴凉的地面凹陷。再想想，那个场景里，什么更容易被带进手机。通常不是那一团普通的动物。被拍下的，是那唯一显眼的一只——一只披着不寻常颜色、看上去与其余全都不同的蝾螈。两件事都发生在同一片森林。可只有其中一件，会可靠地成为记录。</p>

<p>这正是在任何研究进场之前，值得先停下来细想的小小摩擦。我们把一堆记录当成自然的画像。但记录同时也是注意力的画像——是某个人注意到了什么、又想把什么留下来的画像。当两者分岔，这堆记录开始诉说的，关于我们自己的，和关于动物的一样多。于是问题不再是数据有多少，而变成：这些数据倾向于捕捉到什么。</p>

<p>有一项研究把这两者并排放在一起。Alexia McCormick 与 Julia Riley 走遍新不伦瑞克的一批森林——共二十三处——掀开覆盖物、清点蝾螈、记下谁是独处、谁有同伴，以及每一只是什么颜色。然后她们取出另一种记录：来自全省、由碰巧带着相机出门的任何人上传到 iNaturalist 的、同一物种的观察。这项比较于 2025 年发表在 PLOS ONE，其实并不只是关于东部红背蝾螈（Eastern Red-backed Salamander）这一个物种，而是把看待同一种动物的两种方式相互对照，并阅读两者之间的空隙。</p>

<p>单是野外调查本身，就有一种值得报告的节奏。成体在早春与秋季更容易被发现聚在一起——聚集，好几只挤在同一处——这与该物种分布范围内其他地方所见的情形相符。那是动物自身的模式，由一套为取样它而打造的方法收集而来：到样点去、翻看底下、把找到的一切都写下来，平凡的个体与奇特的个体一样照记。</p>

<p>这套方法的代价，也有值得留意之处。要得知这些动物在春秋聚集，就得有人跨越季节一再回到同一片森林，一次又一次掀开同样的覆盖物——把倒木下那一群写下来，哪怕它们和上周是同一批平凡面孔。"聚集会发生、以及何时发生"这份知识，正是用一位路过的拍摄者没有理由花费的那种耐心换来的。这不是走访者的缺陷；那只是一趟不同的差事。散步不会等季节转换。</p>

<p>比较之处，正是地面移动的地方。把两种记录并排，它们会在几个一致的方向上彼此不合。上传到 iNaturalist 的人，比野外调查更不容易报告聚在一起的蝾螈，却更容易报告不寻常的色型。两种差异都算不上错误。出门散步的人拍下显眼的，然后继续前行；调查则对整群负有义务，对第五十只平凡个体与第一只同样尽责。把这些习惯灌进一份数据集，同一片森林出来的样子就不同了：群体更少、罕见者更多，比一次有系统的清点所会给出的还要如此。</p>

<p>这很容易被读成一桩反对社群记录的案例，也很容易往另一个方向读得太过。两种读法都错过了这差异的用处。正是那个少算了群聚的习惯，也拥有任何调查都无法企及的触及范围。把数以千计、带着相机的走访者撒遍整个省，终归会有其中一人找到调查没找到的东西。这里那样东西，是一只缺乏黑色素（amelanistic）的蝾螈——一只缺少通常那种深色色素的个体——一种此前在新不伦瑞克未曾被记录过的色型。那个扭曲了比例、偏向不寻常者的倾斜，正是让真正崭新之物浮现的东西。偏差与发现，是同一项特质的一体两面。</p>

<p>正因如此，有用的一步并不是选出赢家。野外调查也不是一面中立的镜子；它只是以不同方式偏斜——偏向其操作规程所打造来捕捉的东西，且落在某人选择去走的那些林地斑块之内。每一种记录自然的方式，其注意力都有一个形状。要紧的是能够读出那个形状——在罕见色型一再出现于帖子中时，知道这既是关于拍摄者的事实、也是关于蝾螈的事实，而不把它误认为那种颜色在种群中变得更常见。要知道被报告的群聚变少，未必意味着地面上的群聚变少。</p>

<p>那个区分，就是全部的重点，而它很容易被弄丢。一种被过度报告的色型，并不因此更频繁。一种被过少报告的社会行为，并不因此更罕见。可记录性与丰度，是不同的量；而一份庞大的数据集，并不会自动弥合两者之间的落差——它同样可能把落差拉得更大，堆积更多一向就容易被注意到的东西。更多记录可以意味着更完整的画面，也可以意味着一个偏斜画面的、更有自信的版本。</p>

<p>这一切都不是对蝾螈的裁决，不是对那些拿着相机的人的裁决，也不是对某个位于物种分布寒冷边缘的加拿大省份森林的裁决。它比那更小，却走得更远。下次你遇上一整面自然记录的墙——一张以点闪烁的物种分布图、一连串上百条的目击、一张今年人们找到了什么的图表——动物确实在其中。但人类注意力的形状也在其中，折叠得如此顺滑，几乎可以冒充事物本身。值得留在手边的问题，不是这份数据好不好。它比那更安静：这份数据倾向于看见什么，又让什么溜了过去？</p>$body_html_zh_Hans$,
  '当被记录下来的总是那些罕见的个体，自然看起来会是什么样子？',
  '一种生物若有更多照片，看上去就更常见。这是个合理的假设，多数时候也八九不离十。要是某种鸟不断出现在你的信息流里，它大概很普通；要是你从没见过某样东西的照片，它大概很罕见，或者离得很远。我们所记录下来的那张地图，感觉就像存在之物的地图。',
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
  SELECT id FROM public.journal_articles WHERE slug = 'when-rare-ones-get-recorded'
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
  '드문 것들만 기록될 때, 자연은 어떻게 보이는가?',
  '사진이 더 많은 생물은 더 흔해 보인다. 무리 없는 가정이고, 대개는 얼추 맞는다. 어떤 새가 당신의 피드를 가득 채운다면 그 새는 아마 흔할 것이고, 어떤 것의 사진을 한 번도 본 적이 없다면 그것은 아마 드물거나 멀리 있을 것이다. 우리가 기록해 온 것들의 지도는, 존재하는 것들의 지도처럼 느껴진다.',
  $body_html_ko$<p>사진이 더 많은 생물은 더 흔해 보인다. 무리 없는 가정이고, 대개는 얼추 맞는다. 어떤 새가 당신의 피드를 가득 채운다면 그 새는 아마 흔할 것이고, 어떤 것의 사진을 한 번도 본 적이 없다면 그것은 아마 드물거나 멀리 있을 것이다. 우리가 기록해 온 것들의 지도는, 존재하는 것들의 지도처럼 느껴진다.</p>

<p>그러나 그 두 지도는 서로 다른 방식으로 그려진다. 하나는 제 삶을 살아가는 동물들이 그린다. 다른 하나는 사람이 어느 순간, 무언가가 멈춰 설 만하다, 사진 찍을 만하다, 올릴 만하다고 판단하며 그린다. 대개 둘은 충분히 겹쳐서, 우리는 그것들이 원래 별개라는 사실을 잊는다. 둘을 떼어 놓으려면 특별한 경우가 필요하다 — 사람의 눈길을 끄는 것과 낙엽층 아래 실제로 있는 것이 어긋나 버리는, 그런 경우가.</p>

<p>이른 봄, 축축한 숲 바닥을 떠올려 보자. 돌이나 쓰러진 통나무를 들추면, 그 아래 작은 도롱뇽 여러 마리가 몸을 맞댄 채 같은 서늘한 땅의 오목한 곳을 나눠 쓰고 있는 것을 발견할지 모른다. 이제 그 장면에서 무엇이 휴대폰으로 옮겨 가기 쉬운지 생각해 보자. 대개는 평범한 개체들이 뭉쳐 있는 무리가 아니다. 사진이 되는 것은 유독 눈에 띄는 한 마리다 — 다른 모든 것과 달라 보이는, 특이한 색을 두른 도롱뇽. 두 가지 모두 같은 숲에서 일어났다. 그런데도 기록으로 남기 쉬운 것은 그중 한쪽뿐이다.</p>

<p>이것이 어떤 연구든 들어오기 전에 잠시 자리 잡고 들여다볼 만한 작은 마찰이다. 우리는 기록의 더미를 자연의 그림으로 다룬다. 그러나 기록은 주의의 그림이기도 하다 — 누군가가 무엇을 알아차렸고, 무엇을 곁에 남기고 싶어 했는지의 그림. 둘이 어긋날 때, 그 더미는 동물에 대해서만큼이나 우리 자신에 대해 말하기 시작한다. 그리고 물음은 데이터가 얼마나 많은가가 아니라, 그 데이터가 무엇을 붙잡기 쉬웠는가로 바뀐다.</p>

<p>그 둘을 나란히 놓은 작업이 있다. Alexia McCormick과 Julia Riley는 뉴브런즈윅의 숲 여러 곳 — 모두 스물세 곳 — 을 걸으며 덮인 것을 들추고, 도롱뇽을 세고, 혼자인 것과 짝이 있는 것을 적고, 저마다 무슨 색인지를 기록했다. 그런 다음 다른 종류의 기록을 끌어냈다. 같은 종에 대해 주 전역에서, 마침 카메라를 들고 밖에 나와 있던 누군가가 iNaturalist에 올린 관찰들이다. 2025년 PLOS ONE에 실린 이 비교는 사실 동부붉은등도롱뇽(Eastern Red-backed Salamander)이라는 한 종 자체에 관한 것이 아니었다. 같은 동물을 보는 두 방식을 맞세우고, 그 사이의 틈을 읽어 내는 일이었다.</p>

<p>현장 조사만으로도 보고할 만한 리듬이 있다. 성체는 이른 봄과 가을에 함께 있는 — 한자리에 여러 마리 모여 있는 — 경우가 더 많았고, 이는 이 종의 분포 범위 안 다른 곳에서 관찰되어 온 경향과 들어맞는다. 그것은 동물 쪽의 패턴이며, 그것을 표집하려고 만들어진 방법으로 모은 것이다. 현장에 가서, 물건 아래를 들여다보고, 찾은 것을 전부 적는다. 밋밋한 개체도 특이한 개체와 똑같이.</p>

<p>그 방법이 무엇을 치르는지도 눈여겨볼 만하다. 이 동물들이 봄과 가을에 모인다는 것을 알아내려면, 누군가는 계절을 넘나들며 같은 숲으로 돌아와 같은 덮개를 몇 번이고 다시 들춰야 한다 — 통나무 아래 무리를, 지난주와 똑같은 밋밋한 얼굴들일지라도, 그때마다 적어 가며. 무리가 생긴다는 것, 그리고 그것이 언제인지에 대한 앎은, 지나가는 사진가는 들일 이유가 없는 바로 그 끈기로 사들인 것이다. 그것은 걷는 이의 흠이 아니다. 그저 손에 쥔 볼일이 다를 뿐이다. 산책은 계절이 바뀌기를 기다려 주지 않는다.</p>

<p>비교하는 대목에서 발판이 움직인다. 두 기록을 나란히 놓으면 몇 가지 일관된 방향으로 어긋난다. iNaturalist에 올리는 사람들은 현장 조사에 비해 뭉쳐 있는 도롱뇽을 보고할 가능성이 낮았고, 특이한 색형을 보고할 가능성이 높았다. 어느 쪽 차이도 딱히 잘못은 아니다. 산책 나온 사람은 눈에 띄는 것을 찍고 지나가고, 조사는 무리 전체에, 그리고 첫 마리만큼이나 쉰 번째 밋밋한 개체에도 의무를 진다. 이 습관을 데이터에 부어 넣으면 같은 숲이 다르게 나온다. 체계적으로 세었을 때보다 무리는 더 적고, 드문 것은 더 많게.</p>

<p>이것을 시민 기록에 대한 반증으로 읽기도 쉽고, 반대 방향으로 지나치게 읽기도 쉽다. 두 읽기 모두 이 차이가 무엇에 쓸모 있는지를 놓친다. 무리를 적게 세는 바로 그 습관은, 어떤 조사도 따라올 수 없는 도달 범위를 지닌다. 카메라를 든 수천 명의 걷는 이를 주 전역에 흩뿌리면, 결국 그중 한 사람이 조사가 찾지 못한 것을 마주친다. 여기서 그것은 무흑색소(amelanistic) 도롱뇽이었다 — 여느 때의 짙은 색소가 없는 개체로, 뉴브런즈윅에서 이전에 기록된 적 없는 색형이다. 비율을 일그러뜨리는, 특이한 것을 향한 그 기울기가 바로 정말로 새로운 것을 떠오르게 한다. 편향과 발견은 같은 하나의 특성을 앞뒤에서 본 것이다.</p>

<p>그래서 쓸모 있는 한 수는 승자를 고르는 것이 아니다. 현장 조사 역시 중립의 거울이 아니다. 다만 다르게 치우쳐 있을 뿐이다 — 그 절차가 붙잡도록 만들어진 것 쪽으로, 그리고 누군가가 걷기로 정한 숲의 자락들 안으로. 자연을 기록하는 모든 방식에는 주의의 형태가 있다. 중요한 것은 그 형태를 읽어 낼 수 있는 것이다 — 드문 색형이 게시물 속에 몇 번이고 나타날 때, 그것이 도롱뇽에 대한 사실인 만큼 사진 찍는 사람에 대한 사실이기도 하다는 것을 알고, 그것을 그 색이 개체군 안에서 더 흔해진 것으로 착각하지 않는 것. 보고된 무리가 줄었다고 해서 땅 위의 무리가 줄었다는 뜻은 아님을 아는 것.</p>

<p>그 구분이 전부이며, 놓치기 쉽다. 과다 보고된 색형이 그로 인해 더 잦은 것은 아니다. 과소 보고된 사회적 행동이 그로 인해 드문 것은 아니다. 기록되기 쉬움과 실제 많음은 서로 다른 양이며, 큰 데이터가 그 둘 사이의 틈을 저절로 메워 주지는 않는다 — 오히려 넓힐 수도 있다. 처음부터 알아차리기 쉬웠던 것을 더 쌓아 올리면서. 기록이 늘면 그림이 더 온전해질 수 있다. 그러나 치우친 그림의, 더 자신만만한 판본이 될 수도 있다.</p>

<p>이 가운데 어느 것도 도롱뇽에 대한, 카메라를 든 사람들에 대한, 혹은 종의 분포가 추운 가장자리에 놓인 캐나다 한 주의 숲에 대한 판결이 아니다. 그보다 더 작고, 그만큼 더 멀리 간다. 다음에 자연 기록의 벽과 마주쳤을 때 — 점으로 빛나는 종 분포도, 백 건의 목격이 늘어선 화면, 올해 사람들이 무엇을 찾았는지의 도표 — 동물은 분명 그 안에 있다. 그러나 인간의 주의의 형태도 그 안에, 그 자체로 보일 만큼 매끄럽게 접혀 있다. 곁에 둘 만한 물음은 이 데이터가 좋은가가 아니다. 그보다 더 낮은 온도의 물음이다. 이 데이터는 무엇을 보기 쉬웠고, 무엇을 놓쳐 보냈는가?</p>$body_html_ko$,
  '드문 것들만 기록될 때, 자연은 어떻게 보이는가?',
  '사진이 더 많은 생물은 더 흔해 보인다. 무리 없는 가정이고, 대개는 얼추 맞는다. 어떤 새가 당신의 피드를 가득 채운다면 그 새는 아마 흔할 것이고, 어떤 것의 사진을 한 번도 본 적이 없다면 그것은 아마 드물거나 멀리 있을 것이다. 우리가 기록해 온 것들의 지도는, 존재하는 것들의 ',
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
  SELECT id FROM public.journal_articles WHERE slug = 'when-rare-ones-get-recorded'
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
  'Cuando lo que se registra son siempre los raros, ¿cómo se ve la naturaleza?',
  'Una criatura con más fotografías parece más abundante. Es una suposición razonable y, casi siempre, se acerca bastante a la verdad. Si un ave llena tu feed, probablemente sea común; si nunca has visto',
  $body_html_es$<p>Una criatura con más fotografías parece más abundante. Es una suposición razonable y, casi siempre, se acerca bastante a la verdad. Si un ave llena tu feed, probablemente sea común; si nunca has visto una foto de algo, probablemente sea raro o esté lejos. El mapa de lo que hemos registrado se siente como el mapa de lo que existe.</p>

<p>Pero esos dos mapas se trazan de maneras distintas. Uno lo dibujan los animales viviendo su vida. El otro lo dibujan las personas al decidir, en un momento dado, que algo merece detenerse, merece una foto, merece subirse a la red. Casi siempre los dos se solapan lo suficiente como para que olvidemos que son cosas separadas. Hace falta un caso particular para separarlos: uno en el que lo que llama la atención de alguien y lo que de verdad está en la hojarasca terminan por no coincidir.</p>

<p>Imagina el suelo húmedo de un bosque a comienzos de la primavera. Levanta una piedra o un tronco caído y quizá encuentres debajo varias salamandras pequeñas apretadas unas contra otras, compartiendo el mismo hueco fresco del suelo. Ahora piensa qué suele viajar de esa escena a un teléfono. Por lo general, no el montón de animales corrientes. Lo que se lleva la foto es el único llamativo: una salamandra con un color inusual, la que se ve distinta a todas las demás. Ambas cosas ocurrieron en el mismo bosque. Solo una de ellas se convierte de manera fiable en un registro.</p>

<p>Esta es la pequeña fricción con la que vale la pena quedarse antes de que entre investigación alguna. Tratamos un montón de registros como una imagen de la naturaleza. Pero un registro es también una imagen de la atención: de lo que alguien notó y quiso conservar. Cuando ambas divergen, el montón empieza a hablarnos de nosotros mismos tanto como de los animales. Y la pregunta deja de ser cuántos datos hay, y pasa a ser qué tendían esos datos a captar.</p>

<p>Hay un trabajo que pone los dos lado a lado. Alexia McCormick y Julia Riley recorrieron un conjunto de bosques en Nuevo Brunswick —veintitrés— levantando cubiertas, contando salamandras, anotando quién estaba solo y quién acompañado, y de qué color era cada una. Luego extrajeron el otro tipo de registro: observaciones de la misma especie subidas a iNaturalist desde toda la provincia, hechas por quienquiera que anduviera por ahí con una cámara. Publicada en PLOS ONE en 2025, la comparación no trataba en realidad solo de la salamandra de dorso rojo del este (Eastern Red-backed Salamander). Trataba de enfrentar dos maneras de ver al mismo animal y leer el espacio que queda entre ellas.</p>

<p>El trabajo de campo, por sí solo, tiene un ritmo que vale la pena contar. Los adultos aparecían más a menudo juntos —agregados, varios en un mismo sitio— a comienzos de la primavera y en el otoño, lo que concuerda con lo observado en otros lugares del área de distribución de la especie. Ese es el patrón del propio animal, reunido por un método hecho para muestrearlo: ir al sitio, mirar debajo de las cosas, anotar todo lo que se encuentra, los ejemplares sosos tanto como los raros.</p>

<p>Hay algo que conviene notar en lo que ese método cuesta. Para saber que los animales se reúnen en primavera y otoño, alguien tiene que volver a los mismos bosques a lo largo de las estaciones y levantar la misma cubierta una y otra vez, anotando el grupo bajo el tronco aunque sean los mismos ejemplares sosos que la semana anterior. El saber de que los amontonamientos ocurren, y cuándo, se compra con exactamente la paciencia que un fotógrafo de paso no tiene motivo para gastar. No es un defecto del que camina; es sencillamente otro encargo. Un paseo no espera a que cambie la estación.</p>

<p>La comparación es donde el terreno se mueve. Pon los dos registros uno junto al otro y discrepan de un par de maneras constantes. Quienes publicaban en iNaturalist eran menos propensos que los muestreos de campo a reportar salamandras agrupadas, y más propensos a reportar las formas de color inusuales. Ninguna de las dos diferencias es exactamente un error. Quien sale a pasear fotografía lo que destaca y sigue su camino; un muestreo está obligado con el grupo entero, y con el quincuagésimo animal corriente tanto como con el primero. Mete esos hábitos en un conjunto de datos y el mismo bosque sale con otro aspecto: menos grupos, más rarezas, de las que daría un conteo sistemático.</p>

<p>Sería fácil leer eso como un caso en contra de los registros comunitarios, y fácil leer demasiado en el otro sentido. Ambas lecturas se pierden para qué sirve la diferencia. El mismo hábito que subcuenta los amontonamientos tiene además un alcance que ningún muestreo puede igualar. Reparte miles de caminantes con cámara por toda una provincia y, tarde o temprano, uno de ellos encuentra algo que los muestreos no encontraron. Aquí ese algo fue una salamandra amelánica —un ejemplar que carece del pigmento oscuro habitual—, una forma de color no documentada antes en Nuevo Brunswick. La misma inclinación hacia lo inusual que distorsiona las proporciones es la que hace aflorar lo genuinamente nuevo. El sesgo y el hallazgo son el mismo rasgo, visto por sus dos caras.</p>

<p>Por eso el movimiento útil no es elegir un ganador. El muestreo de campo tampoco es un espejo neutral; solo está sesgado de otro modo, hacia aquello que su protocolo está hecho para captar, dentro de los retazos de bosque que alguien eligió recorrer. Toda manera de registrar la naturaleza tiene una forma en su atención. Lo que importa es poder leer esa forma: saber, cuando la morfología rara aparece una y otra vez en las publicaciones, que eso es un hecho sobre los fotógrafos tanto como sobre las salamandras, y no confundirlo con que ese color se esté volviendo más común en la población. Saber que menos amontonamientos reportados no tiene por qué significar menos amontonamientos en el terreno.</p>

<p>Esa distinción lo es todo, y es fácil perderla. Una forma de color sobrerreportada no es por ello más frecuente. Un comportamiento social subreportado no es por ello raro. Registrabilidad y abundancia son cantidades distintas, y un conjunto de datos grande no cierra por sí solo la brecha entre ambas: puede igualmente ensancharla, amontonando más de lo que siempre fue fácil notar. Más registros pueden significar una imagen más completa. También pueden significar una versión más segura de una imagen ladeada.</p>

<p>Nada de esto es un veredicto sobre las salamandras, ni sobre la gente con cámaras, ni sobre los bosques de una provincia canadiense en el borde frío del área de una especie. Es más pequeño que eso, y llega más lejos. La próxima vez que te topes con un muro de registros de naturaleza —un mapa de especie encendido de puntos, un feed de cien avistamientos, un gráfico de lo que la gente encontró este año—, los animales están ahí, de verdad. Pero también lo está la forma de la atención humana, plegada con tanta suavidad que puede pasar por la cosa misma. La pregunta que vale la pena conservar no es si los datos son buenos. Es más callada que eso: ¿qué tendían estos datos a ver, y qué dejaron escapar?</p>$body_html_es$,
  'Cuando lo que se registra son siempre los raros, ¿cómo se ve la naturaleza?',
  'Una criatura con más fotografías parece más abundante. Es una suposición razonable y, casi siempre, se acerca bastante a la verdad. Si un ave llena tu feed, pro',
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
  SELECT id FROM public.journal_articles WHERE slug = 'when-rare-ones-get-recorded'
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
  'Quando os registrados são sempre os raros, como a natureza aparece?',
  'Uma criatura com mais fotografias parece mais abundante. É uma suposição razoável e, quase sempre, chega bem perto da verdade. Se uma ave enche o seu feed, provavelmente é comum; se você nunca viu fot',
  $body_html_pt_BR$<p>Uma criatura com mais fotografias parece mais abundante. É uma suposição razoável e, quase sempre, chega bem perto da verdade. Se uma ave enche o seu feed, provavelmente é comum; se você nunca viu foto de alguma coisa, provavelmente ela é rara ou está longe. O mapa daquilo que registramos parece o mapa daquilo que existe.</p>

<p>Mas esses dois mapas são feitos de maneiras diferentes. Um é desenhado por animais vivendo suas vidas. O outro é desenhado por pessoas ao decidir, num dado momento, que algo vale a pena parar, vale a pena fotografar, vale a pena postar. Quase sempre os dois se sobrepõem o bastante para que a gente esqueça que são coisas separadas. É preciso um caso particular para separá-los — um em que o que chama a atenção de alguém e o que de fato está na serapilheira acabam não batendo.</p>

<p>Imagine o chão úmido de uma floresta no começo da primavera. Levante uma pedra ou um tronco caído e você pode encontrar embaixo várias salamandras pequenas apertadas umas contra as outras, dividindo a mesma reentrância fresca do solo. Agora pense no que costuma viajar dessa cena para um celular. Em geral, não o amontoado de animais comuns. Quem ganha a foto é o único chamativo — uma salamandra de cor incomum, a que parece diferente de todas as outras. As duas coisas aconteceram na mesma floresta. Só uma delas vira registro de forma confiável.</p>

<p>Essa é a pequena fricção com que vale a pena ficar antes que qualquer pesquisa entre. Tratamos uma pilha de registros como um retrato da natureza. Mas um registro também é um retrato da atenção — do que alguém notou e quis guardar. Quando os dois divergem, a pilha começa a nos falar tanto sobre nós mesmos quanto sobre os animais. E a pergunta deixa de ser quantos dados existem, e passa a ser o que esses dados tendiam a capturar.</p>

<p>Há um trabalho que coloca os dois lado a lado. Alexia McCormick e Julia Riley percorreram um conjunto de florestas em Nova Brunswick — vinte e três delas — virando coberturas, contando salamandras, anotando quem estava sozinho e quem estava acompanhado, e de que cor era cada uma. Depois puxaram o outro tipo de registro: observações da mesma espécie postadas no iNaturalist de toda a província, feitas por quem quer que estivesse por lá com uma câmera. Publicada na PLOS ONE em 2025, a comparação não era realmente só sobre a salamandra-de-dorso-vermelho-do-leste (Eastern Red-backed Salamander). Era sobre pôr frente a frente duas maneiras de ver o mesmo animal e ler o espaço entre elas.</p>

<p>O trabalho de campo, por si só, tem um ritmo que vale relatar. Os adultos eram encontrados juntos com mais frequência — agregados, vários num mesmo ponto — no começo da primavera e no outono, o que combina com o que se observou em outros lugares da área de distribuição da espécie. Esse é o padrão do próprio animal, reunido por um método feito para amostrá-lo: ir ao local, olhar embaixo das coisas, anotar tudo o que se encontra, os indivíduos sem graça tanto quanto os esquisitos.</p>

<p>Há algo que vale notar no que esse método custa. Para saber que os animais se reúnem na primavera e no outono, alguém tem de voltar às mesmas florestas ao longo das estações e levantar a mesma cobertura vez após vez — anotando o grupo embaixo do tronco mesmo quando são os mesmos indivíduos sem graça da semana anterior. O saber de que os amontoados acontecem, e quando, é comprado com exatamente a paciência que um fotógrafo de passagem não tem motivo para gastar. Isso não é um defeito de quem caminha; é simplesmente outra incumbência. Uma caminhada não espera a estação virar.</p>

<p>A comparação é onde o chão se mexe. Ponha os dois registros um ao lado do outro e eles discordam de algumas maneiras constantes. Quem postava no iNaturalist tinha menos probabilidade do que os levantamentos de campo de relatar salamandras agrupadas, e mais probabilidade de relatar as formas de cor incomuns. Nenhuma das duas diferenças é bem um erro. Quem sai para caminhar fotografa o que se destaca e segue em frente; um levantamento tem obrigação com o grupo inteiro, e com o quinquagésimo animal comum tanto quanto com o primeiro. Ponha esses hábitos num conjunto de dados e a mesma floresta sai com outra cara: menos grupos, mais raridades, do que daria uma contagem sistemática.</p>

<p>Seria fácil ler isso como um argumento contra os registros comunitários, e fácil ler demais no sentido oposto. As duas leituras perdem para que serve a diferença. O mesmo hábito que subconta os amontoados tem também um alcance que nenhum levantamento consegue igualar. Espalhe milhares de caminhantes com câmera por uma província inteira e, mais cedo ou mais tarde, um deles encontra algo que os levantamentos não encontraram. Aqui esse algo foi uma salamandra amelanística — um indivíduo sem o pigmento escuro de sempre —, uma forma de cor não documentada antes em Nova Brunswick. A mesma inclinação para o incomum que distorce as proporções é o que faz aflorar o genuinamente novo. O viés e a descoberta são o mesmo traço, visto por dois lados.</p>

<p>É por isso que o movimento útil não é escolher um vencedor. O levantamento de campo também não é um espelho neutro; está apenas enviesado de outro jeito, para aquilo que seu protocolo foi feito para captar, dentro dos retalhos de floresta que alguém escolheu percorrer. Toda maneira de registrar a natureza tem uma forma na sua atenção. O que importa é conseguir ler essa forma — saber, quando a morfologia rara aparece de novo e de novo nas postagens, que isso é um fato sobre os fotógrafos tanto quanto sobre as salamandras, e não confundir com a cor estar ficando mais comum na população. Saber que menos amontoados relatados não precisa significar menos amontoados no terreno.</p>

<p>Essa distinção é tudo, e é fácil de perder. Uma forma de cor superrelatada não é por isso mais frequente. Um comportamento social subrelatado não é por isso raro. Registrabilidade e abundância são quantidades diferentes, e um conjunto de dados grande não fecha sozinho a lacuna entre elas — pode igualmente alargá-la, empilhando mais daquilo que sempre foi fácil de notar. Mais registros podem significar um quadro mais completo. Podem também significar uma versão mais segura de um quadro torto.</p>

<p>Nada disso é um veredicto sobre as salamandras, nem sobre as pessoas com câmeras, nem sobre as florestas de uma província canadense na borda fria da área de uma espécie. É menor do que isso, e vai mais longe. Da próxima vez que você esbarrar num muro de registros de natureza — um mapa de espécie aceso de pontos, um feed de cem avistamentos, um gráfico do que as pessoas acharam neste ano —, os animais estão ali, de verdade. Mas também está a forma da atenção humana, dobrada com tanta suavidade que pode passar pela coisa em si. A pergunta que vale a pena guardar não é se os dados são bons. É mais silenciosa do que isso: o que esses dados tendiam a ver, e o que deixaram escapar?</p>$body_html_pt_BR$,
  'Quando os registrados são sempre os raros, como a natureza aparece?',
  'Uma criatura com mais fotografias parece mais abundante. É uma suposição razoável e, quase sempre, chega bem perto da verdade. Se uma ave enche o seu feed, prov',
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
  SELECT id FROM public.journal_articles WHERE slug = 'when-rare-ones-get-recorded'
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
  'Wenn immer nur die seltenen aufgenommen werden – wie sieht die Natur dann aus?',
  'Ein Tier mit mehr Fotos wirkt häufiger. Das ist eine vernünftige Annahme, und meistens kommt sie der Wahrheit nahe genug. Füllt ein Vogel deinen Feed, ist er wahrscheinlich häufig; hast du von etwas n',
  $body_html_de$<p>Ein Tier mit mehr Fotos wirkt häufiger. Das ist eine vernünftige Annahme, und meistens kommt sie der Wahrheit nahe genug. Füllt ein Vogel deinen Feed, ist er wahrscheinlich häufig; hast du von etwas nie ein Bild gesehen, ist es wahrscheinlich selten oder weit weg. Die Karte dessen, was wir aufgenommen haben, fühlt sich an wie die Karte dessen, was existiert.</p>

<p>Doch diese beiden Karten entstehen auf verschiedene Weise. Die eine zeichnen Tiere, die ihr Leben leben. Die andere zeichnen Menschen, indem sie in einem Moment entscheiden, dass etwas es wert ist, stehenzubleiben, es wert, fotografiert, es wert, hochgeladen zu werden. Meist überschneiden sich beide so weit, dass wir vergessen, dass sie getrennt sind. Es braucht einen besonderen Fall, um sie auseinanderzuziehen – einen, in dem das, was jemandem ins Auge fällt, und das, was tatsächlich im Falllaub liegt, nicht mehr zusammenpassen.</p>

<p>Stell dir den feuchten Waldboden im frühen Frühling vor. Hebst du einen Stein oder einen umgestürzten Stamm an, findest du darunter vielleicht mehrere kleine Salamander eng aneinandergedrängt, die sich dieselbe kühle Mulde im Boden teilen. Und nun überlege, was aus dieser Szene gewöhnlich auf ein Handy wandert. In der Regel nicht das Häufchen gewöhnlicher Tiere. Aufs Foto kommt der eine auffällige – ein Salamander in ungewöhnlicher Farbe, der, der anders aussieht als alle übrigen. Beides geschah im selben Wald. Doch nur eines von beiden wird zuverlässig zum Datensatz.</p>

<p>Das ist die kleine Reibung, bei der es sich lohnt zu verweilen, bevor irgendeine Forschung ins Spiel kommt. Wir behandeln einen Stapel Aufzeichnungen als Bild der Natur. Aber eine Aufzeichnung ist auch ein Bild der Aufmerksamkeit – dessen, was jemand bemerkt und behalten wollte. Wenn beide auseinandergehen, fängt der Stapel an, ebenso viel über uns selbst zu erzählen wie über die Tiere. Und die Frage ist nicht länger, wie viele Daten es gibt, sondern was diese Daten aufzunehmen geneigt waren.</p>

<p>Es gibt eine Arbeit, die beides nebeneinanderstellt. Alexia McCormick und Julia Riley durchstreiften eine Reihe von Wäldern in New Brunswick – dreiundzwanzig an der Zahl –, hoben Deckung an, zählten Salamander, notierten, wer allein und wer in Gesellschaft war, und welche Farbe jeder hatte. Dann zogen sie die andere Art von Aufzeichnung heran: Beobachtungen derselben Art, die aus der ganzen Provinz bei iNaturalist eingestellt wurden, von wem auch immer gerade mit einer Kamera unterwegs war. 2025 in PLOS ONE veröffentlicht, ging es bei dem Vergleich eigentlich nicht allein um den Östlichen Rotrücken-Salamander (Eastern Red-backed Salamander). Es ging darum, zwei Weisen, dasselbe Tier zu sehen, einander gegenüberzustellen und den Raum dazwischen zu lesen.</p>

<p>Schon die Feldarbeit für sich hat einen Rhythmus, von dem sich berichten lässt. Erwachsene Tiere wurden im frühen Frühling und im Herbst eher beieinander gefunden – zusammengeschart, mehrere an einer Stelle –, was zu dem passt, was andernorts im Verbreitungsgebiet der Art beobachtet wurde. Das ist das Muster des Tieres selbst, mit einer Methode gesammelt, die dafür gebaut ist, es zu erfassen: zum Ort gehen, unter Dinge schauen, alles Gefundene aufschreiben, die schlichten Tiere ebenso wie die eigenartigen.</p>

<p>An dem, was diese Methode kostet, ist etwas zu bemerken. Um zu erfahren, dass die Tiere sich im Frühling und Herbst versammeln, muss jemand über die Jahreszeiten hinweg zu denselben Wäldern zurückkehren und dieselbe Deckung wieder und wieder anheben – und die Gruppe unter dem Stamm notieren, selbst wenn es dieselben schlichten Tiere sind wie in der Woche zuvor. Das Wissen, dass Ansammlungen vorkommen, und wann, wird mit genau der Geduld erkauft, für die ein vorbeikommender Fotograf keinen Grund hat, sie aufzuwenden. Das ist kein Makel des Wandernden; es ist schlicht ein anderer Auftrag. Ein Spaziergang wartet nicht, bis die Jahreszeit sich wendet.</p>

<p>Beim Vergleich verschiebt sich der Boden. Legt man die beiden Aufzeichnungen nebeneinander, weichen sie auf ein paar gleichbleibende Weisen voneinander ab. Wer bei iNaturalist einstellte, meldete seltener als die Feldaufnahmen zusammengedrängte Salamander und häufiger die ungewöhnlichen Farbformen. Keiner der beiden Unterschiede ist eigentlich ein Fehler. Wer spazieren geht, fotografiert, was heraussticht, und zieht weiter; eine Erhebung ist der ganzen Gruppe verpflichtet und dem fünfzigsten gewöhnlichen Tier ebenso wie dem ersten. Gießt man diese Gewohnheiten in einen Datensatz, kommt derselbe Wald anders heraus: weniger Gruppen, mehr Seltenheiten, als eine systematische Zählung ergäbe.</p>

<p>Man könnte das leicht als Argument gegen Bürgeraufzeichnungen lesen, und leicht in die andere Richtung zu viel hineinlesen. Beide Lesarten verfehlen, wofür der Unterschied gut ist. Ebendie Gewohnheit, die die Ansammlungen zu niedrig zählt, hat zugleich eine Reichweite, mit der keine Erhebung mithalten kann. Verteile Tausende von Wandernden mit Kameras über eine ganze Provinz, und irgendwann findet einer von ihnen etwas, das die Erhebungen nicht fanden. Hier war dieses Etwas ein amelanistischer Salamander – ein Tier, dem das übliche dunkle Pigment fehlt –, eine Farbform, die in New Brunswick zuvor nicht dokumentiert war. Ebenjene Neigung zum Ungewöhnlichen, die die Verhältnisse verzerrt, ist es, die das wirklich Neue zutage bringt. Verzerrung und Entdeckung sind derselbe Zug, von zwei Seiten gesehen.</p>

<p>Darum besteht der nützliche Schritt nicht darin, einen Sieger zu küren. Auch die Felderhebung ist kein neutraler Spiegel; sie ist nur anders verzerrt – hin zu dem, was ihr Protokoll zu erfassen gebaut ist, und innerhalb der Waldstücke, die jemand zu begehen wählte. Jede Weise, Natur aufzuzeichnen, hat eine Form ihrer Aufmerksamkeit. Worauf es ankommt, ist, diese Form lesen zu können – zu wissen, wenn die seltene Morphe immer wieder in den Beiträgen auftaucht, dass dies ebenso eine Tatsache über die Fotografierenden ist wie über die Salamander, und es nicht damit zu verwechseln, dass die Farbe in der Population häufiger würde. Zu wissen, dass weniger gemeldete Ansammlungen nicht weniger Ansammlungen am Boden heißen müssen.</p>

<p>Diese Unterscheidung ist das Ganze, und sie geht leicht verloren. Eine überberichtete Farbform ist dadurch nicht häufiger. Ein unterberichtetes Sozialverhalten ist dadurch nicht selten. Aufzeichenbarkeit und Häufigkeit sind verschiedene Größen, und ein großer Datensatz schließt die Lücke zwischen ihnen nicht von selbst – er kann sie ebenso gut weiten, indem er mehr von dem aufhäuft, was immer schon leicht zu bemerken war. Mehr Aufzeichnungen können ein volleres Bild bedeuten. Sie können auch eine selbstsicherere Fassung eines schiefen bedeuten.</p>

<p>Nichts davon ist ein Urteil über die Salamander, noch über die Menschen mit den Kameras, noch über die Wälder einer kanadischen Provinz am kalten Rand eines Artareals. Es ist kleiner als das und reicht weiter. Wenn du das nächste Mal auf eine Wand von Naturaufzeichnungen stößt – eine von Punkten leuchtende Artkarte, einen Feed aus hundert Sichtungen, ein Diagramm dessen, was die Leute dieses Jahr fanden –, sind die Tiere darin, wirklich. Aber ebenso die Form der menschlichen Aufmerksamkeit, so glatt hineingefaltet, dass sie für die Sache selbst durchgehen kann. Die Frage, die zu behalten sich lohnt, ist nicht, ob die Daten gut sind. Sie ist leiser als das: Was waren diese Daten geneigt zu sehen, und was ließen sie durchschlüpfen?</p>$body_html_de$,
  'Wenn immer nur die seltenen aufgenommen werden – wie sieht die Natur dann aus?',
  'Ein Tier mit mehr Fotos wirkt häufiger. Das ist eine vernünftige Annahme, und meistens kommt sie der Wahrheit nahe genug. Füllt ein Vogel deinen Feed, ist er wa',
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
  SELECT id FROM public.journal_articles WHERE slug = 'when-rare-ones-get-recorded'
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
  'Quand ce sont toujours les rares qu''on enregistre, à quoi ressemble la nature ?',
  'Une créature qui a plus de photos paraît plus abondante. C''est une supposition raisonnable, et la plupart du temps elle est assez proche du vrai. Si un oiseau remplit votre fil, il est sans doute comm',
  $body_html_fr$<p>Une créature qui a plus de photos paraît plus abondante. C'est une supposition raisonnable, et la plupart du temps elle est assez proche du vrai. Si un oiseau remplit votre fil, il est sans doute commun ; si vous n'avez jamais vu la photo de quelque chose, c'est sans doute qu'il est rare ou lointain. La carte de ce que nous avons enregistré ressemble à la carte de ce qui existe.</p>

<p>Mais ces deux cartes ne se dessinent pas de la même façon. L'une est tracée par des animaux qui vivent leur vie. L'autre est tracée par des gens qui décident, à un instant donné, que quelque chose vaut la peine qu'on s'arrête, qu'on le photographie, qu'on le publie. La plupart du temps, les deux se recouvrent assez pour qu'on oublie qu'elles sont distinctes. Il faut un cas particulier pour les écarter — un cas où ce qui accroche l'œil de quelqu'un et ce qui se trouve vraiment dans la litière finissent par ne pas coïncider.</p>

<p>Imaginez le sol humide d'une forêt au début du printemps. Soulevez une pierre ou un tronc tombé, et vous pourriez trouver dessous plusieurs petites salamandres serrées les unes contre les autres, partageant le même creux frais du sol. Songez maintenant à ce qui, de cette scène, a tendance à passer sur un téléphone. D'ordinaire, pas le tas d'animaux ordinaires. Ce qui a droit à la photo, c'est le seul qui saute aux yeux — une salamandre d'une couleur inhabituelle, celle qui a l'air différente de toutes les autres. Les deux choses ont eu lieu dans la même forêt. Une seule d'entre elles devient à coup sûr un enregistrement.</p>

<p>Voilà la petite friction sur laquelle il vaut la peine de s'arrêter avant que la moindre recherche n'entre en scène. Nous traitons un tas d'enregistrements comme une image de la nature. Mais un enregistrement est aussi une image de l'attention — de ce que quelqu'un a remarqué, et voulu garder. Quand les deux divergent, le tas se met à nous parler autant de nous-mêmes que des animaux. Et la question cesse d'être : combien y a-t-il de données ? pour devenir : qu'est-ce que ces données étaient portées à saisir ?</p>

<p>Il existe un travail qui met les deux côte à côte. Alexia McCormick et Julia Riley ont parcouru un ensemble de forêts du Nouveau-Brunswick — vingt-trois — soulevant des abris, comptant les salamandres, notant qui était seul et qui était accompagné, et de quelle couleur était chacune. Puis elles ont tiré l'autre type d'enregistrement : des observations de la même espèce publiées sur iNaturalist depuis toute la province, faites par quiconque se trouvait là avec un appareil photo. Parue dans PLOS ONE en 2025, la comparaison ne portait pas vraiment sur la seule salamandre rayée (Eastern Red-backed Salamander). Elle portait sur la mise en regard de deux manières de voir le même animal, et sur la lecture de l'espace qui les sépare.</p>

<p>Le travail de terrain, à lui seul, a un rythme dont on peut rendre compte. Les adultes étaient plus souvent trouvés ensemble — regroupés, plusieurs au même endroit — au début du printemps et à l'automne, ce qui concorde avec ce qu'on a observé ailleurs dans l'aire de l'espèce. C'est le motif propre à l'animal, recueilli par une méthode faite pour l'échantillonner : aller sur le site, regarder sous les choses, noter tout ce qu'on trouve, les individus quelconques autant que les singuliers.</p>

<p>Il y a quelque chose à remarquer dans ce que cette méthode coûte. Pour apprendre que les animaux se rassemblent au printemps et à l'automne, il faut que quelqu'un revienne aux mêmes forêts au fil des saisons et soulève le même abri encore et encore — en notant le groupe sous le tronc même quand ce sont les mêmes individus quelconques que la semaine d'avant. Le savoir que les attroupements ont lieu, et quand, s'achète avec exactement la patience qu'un photographe de passage n'a aucune raison de dépenser. Ce n'est pas un défaut du marcheur ; c'est simplement une autre course. Une promenade n'attend pas que la saison tourne.</p>

<p>C'est à la comparaison que le terrain se dérobe. Placez les deux enregistrements l'un à côté de l'autre et ils divergent de deux ou trois façons constantes. Ceux qui publiaient sur iNaturalist étaient moins enclins que les relevés de terrain à signaler des salamandres regroupées, et plus enclins à signaler les formes de couleur inhabituelles. Aucune des deux différences n'est vraiment une erreur. Qui sort se promener photographie ce qui ressort, et poursuit son chemin ; un relevé est tenu envers le groupe entier, et envers le cinquantième animal ordinaire autant que le premier. Versez ces habitudes dans un jeu de données et la même forêt en ressort autrement : moins de groupes, plus de raretés, que ne donnerait un comptage systématique.</p>

<p>Il serait facile d'y lire un réquisitoire contre les enregistrements communautaires, et facile d'en lire trop dans l'autre sens. Les deux lectures manquent ce à quoi la différence est utile. L'habitude même qui sous-compte les attroupements a aussi une portée qu'aucun relevé ne peut égaler. Dispersez des milliers de marcheurs munis d'appareils sur toute une province, et l'un d'eux finit par trouver quelque chose que les relevés n'ont pas trouvé. Ici, ce quelque chose fut une salamandre amélanique — un individu dépourvu du pigment sombre habituel —, une forme de couleur non documentée auparavant au Nouveau-Brunswick. Le même penchant pour l'inhabituel qui fausse les proportions est ce qui fait surgir le vraiment nouveau. Le biais et la découverte sont le même trait, vu des deux côtés.</p>

<p>C'est pourquoi le geste utile n'est pas de désigner un vainqueur. Le relevé de terrain n'est pas non plus un miroir neutre ; il est seulement biaisé autrement, vers ce que son protocole est fait pour saisir, dans les fragments de forêt que quelqu'un a choisi de parcourir. Toute manière d'enregistrer la nature donne une forme à son attention. Ce qui importe, c'est de savoir lire cette forme — de savoir, quand la morphe rare revient encore et encore dans les publications, que c'est un fait sur les photographes autant que sur les salamandres, et de ne pas le confondre avec le fait que cette couleur deviendrait plus courante dans la population. De savoir que moins d'attroupements signalés ne veut pas forcément dire moins d'attroupements sur le terrain.</p>

<p>Cette distinction est le tout, et elle se perd facilement. Une forme de couleur surdéclarée n'en est pas pour autant plus fréquente. Un comportement social sous-déclaré n'en est pas pour autant rare. Enregistrabilité et abondance sont des quantités différentes, et un grand jeu de données ne comble pas de lui-même l'écart entre elles — il peut tout aussi bien l'élargir, en entassant davantage de ce qui a toujours été facile à remarquer. Plus d'enregistrements peuvent vouloir dire une image plus complète. Ils peuvent aussi vouloir dire une version plus assurée d'une image de travers.</p>

<p>Rien de tout cela n'est un verdict sur les salamandres, ni sur les gens aux appareils photo, ni sur les forêts d'une province canadienne, au bord froid de l'aire d'une espèce. C'est plus petit que cela, et cela va plus loin. La prochaine fois que vous tomberez sur un mur d'enregistrements de nature — une carte d'espèce constellée de points, un fil de cent observations, un graphique de ce que les gens ont trouvé cette année —, les animaux y sont, pour de bon. Mais la forme de l'attention humaine y est aussi, repliée si doucement qu'elle peut passer pour la chose même. La question qu'il vaut la peine de garder n'est pas de savoir si les données sont bonnes. Elle est plus basse que cela : qu'est-ce que ces données étaient portées à voir, et qu'ont-elles laissé filer ?</p>$body_html_fr$,
  'Quand ce sont toujours les rares qu''on enregistre, à quoi ressemble la nature ?',
  'Une créature qui a plus de photos paraît plus abondante. C''est une supposition raisonnable, et la plupart du temps elle est assez proche du vrai. Si un oiseau ',
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
  SELECT id FROM public.journal_articles WHERE slug = 'when-rare-ones-get-recorded'
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
  'Quando a essere registrati sono sempre i rari, come appare la natura?',
  'Una creatura con più fotografie sembra più abbondante. È un''ipotesi ragionevole e, quasi sempre, abbastanza vicina al vero. Se un uccello riempie il tuo feed, probabilmente è comune; se non hai mai vi',
  $body_html_it$<p>Una creatura con più fotografie sembra più abbondante. È un'ipotesi ragionevole e, quasi sempre, abbastanza vicina al vero. Se un uccello riempie il tuo feed, probabilmente è comune; se non hai mai visto la foto di qualcosa, probabilmente è raro o lontano. La mappa di ciò che abbiamo registrato pare la mappa di ciò che esiste.</p>

<p>Ma quelle due mappe si disegnano in modi diversi. Una la tracciano gli animali che vivono la loro vita. L'altra la tracciano le persone quando decidono, in un dato momento, che qualcosa vale la pena di fermarsi, vale una foto, vale un caricamento. Quasi sempre le due si sovrappongono abbastanza da farci dimenticare che sono separate. Serve un caso particolare per separarle: uno in cui ciò che cattura l'occhio di qualcuno e ciò che c'è davvero nella lettiera finiscono per non coincidere.</p>

<p>Immagina il suolo umido di un bosco all'inizio della primavera. Solleva una pietra o un tronco caduto e potresti trovare sotto diverse piccole salamandre strette l'una all'altra, che condividono la stessa fresca conca del terreno. Ora pensa a che cosa, di quella scena, tende a passare su un telefono. Di solito non il mucchietto di animali ordinari. A guadagnarsi la foto è l'unico vistoso: una salamandra di un colore insolito, quella che sembra diversa da tutte le altre. Entrambe le cose sono accadute nello stesso bosco. Solo una delle due diventa in modo affidabile un dato.</p>

<p>È questa la piccola frizione su cui vale la pena sostare prima che entri qualsiasi ricerca. Trattiamo un mucchio di registrazioni come un ritratto della natura. Ma una registrazione è anche un ritratto dell'attenzione: di ciò che qualcuno ha notato e ha voluto conservare. Quando le due divergono, il mucchio comincia a parlarci di noi stessi tanto quanto degli animali. E la domanda smette di essere quanti dati ci siano, e diventa che cosa quei dati fossero inclini a cogliere.</p>

<p>C'è un lavoro che mette i due fianco a fianco. Alexia McCormick e Julia Riley hanno percorso una serie di boschi nel New Brunswick — ventitré — sollevando ripari, contando salamandre, annotando chi era solo e chi in compagnia, e di che colore fosse ciascuna. Poi hanno estratto l'altro tipo di registrazione: osservazioni della stessa specie caricate su iNaturalist da tutta la provincia, fatte da chiunque si trovasse là fuori con una macchina fotografica. Pubblicato su PLOS ONE nel 2025, il confronto non riguardava davvero la sola salamandra dal dorso rosso orientale (Eastern Red-backed Salamander). Riguardava il mettere l'una di fronte all'altra due maniere di vedere lo stesso animale, e leggere lo spazio tra loro.</p>

<p>Il lavoro sul campo, di per sé, ha un ritmo di cui dar conto. Gli adulti si trovavano più spesso insieme — aggregati, diversi in un solo punto — all'inizio della primavera e in autunno, il che si accorda con quanto osservato altrove nell'areale della specie. È lo schema proprio dell'animale, raccolto con un metodo costruito per campionarlo: andare sul posto, guardare sotto le cose, annotare tutto ciò che si trova, gli individui insignificanti tanto quanto quelli strani.</p>

<p>C'è qualcosa da notare in ciò che quel metodo costa. Per sapere che gli animali si radunano in primavera e in autunno, qualcuno deve tornare agli stessi boschi attraverso le stagioni e sollevare lo stesso riparo ancora e ancora, annotando il gruppo sotto il tronco anche quando sono gli stessi individui insignificanti della settimana prima. Il sapere che gli assembramenti avvengono, e quando, si compra con esattamente la pazienza che un fotografo di passaggio non ha motivo di spendere. Non è un difetto di chi cammina; è semplicemente un'altra incombenza. Una passeggiata non aspetta che la stagione cambi.</p>

<p>È nel confronto che il terreno si sposta. Metti le due registrazioni una accanto all'altra e divergono in un paio di modi costanti. Chi caricava su iNaturalist era meno propenso, rispetto ai rilievi sul campo, a segnalare salamandre raggruppate, e più propenso a segnalare le forme di colore insolite. Nessuna delle due differenze è propriamente un errore. Chi esce a passeggio fotografa ciò che spicca e prosegue; un rilievo è tenuto verso l'intero gruppo, e verso il cinquantesimo animale ordinario tanto quanto verso il primo. Versa queste abitudini in un insieme di dati e lo stesso bosco ne esce diverso: meno gruppi, più rarità, di quanti ne darebbe un conteggio sistematico.</p>

<p>Sarebbe facile leggerlo come un'accusa contro le registrazioni della comunità, e facile leggerci troppo nel senso opposto. Entrambe le letture mancano ciò a cui la differenza serve. Proprio l'abitudine che conta in difetto gli assembramenti ha anche una portata che nessun rilievo può eguagliare. Spargi migliaia di camminatori con la macchina fotografica su un'intera provincia e, prima o poi, uno di loro trova qualcosa che i rilievi non hanno trovato. Qui quel qualcosa fu una salamandra amelanica — un individuo privo del solito pigmento scuro —, una forma di colore non documentata prima nel New Brunswick. La stessa inclinazione verso l'insolito che distorce le proporzioni è ciò che porta a galla il davvero nuovo. La distorsione e la scoperta sono lo stesso tratto, visto da due lati.</p>

<p>Ecco perché la mossa utile non è scegliere un vincitore. Nemmeno il rilievo sul campo è uno specchio neutro; è solo distorto in altro modo, verso ciò che il suo protocollo è fatto per cogliere, dentro i lembi di bosco che qualcuno ha scelto di percorrere. Ogni modo di registrare la natura dà una forma alla propria attenzione. Ciò che conta è saper leggere quella forma: sapere, quando la morfologia rara ricompare più e più volte nei post, che questo è un fatto sui fotografi tanto quanto sulle salamandre, e non scambiarlo per il colore che diventa più comune nella popolazione. Sapere che meno assembramenti segnalati non deve voler dire meno assembramenti sul terreno.</p>

<p>Quella distinzione è tutto, ed è facile perderla. Una forma di colore sovra-segnalata non è per ciò più frequente. Un comportamento sociale sotto-segnalato non è per ciò raro. Registrabilità e abbondanza sono quantità diverse, e un grande insieme di dati non colma da sé il divario tra loro: può altrettanto bene allargarlo, ammucchiando altro di ciò che è sempre stato facile notare. Più registrazioni possono voler dire un quadro più pieno. Possono anche voler dire una versione più sicura di sé di un quadro sbilenco.</p>

<p>Niente di tutto questo è un verdetto sulle salamandre, né sulle persone con le macchine fotografiche, né sui boschi di una provincia canadese al bordo freddo dell'areale di una specie. È più piccolo di così, e va più lontano. La prossima volta che ti imbatti in un muro di registrazioni della natura — una mappa di specie accesa di punti, un feed di cento avvistamenti, un grafico di ciò che la gente ha trovato quest'anno — gli animali ci sono, davvero. Ma c'è anche la forma dell'attenzione umana, ripiegata così dolcemente da poter passare per la cosa stessa. La domanda che vale la pena tenere non è se i dati siano buoni. È più sommessa di così: che cosa erano inclini a vedere, questi dati, e che cosa hanno lasciato sfuggire?</p>$body_html_it$,
  'Quando a essere registrati sono sempre i rari, come appare la natura?',
  'Una creatura con più fotografie sembra più abbondante. È un''ipotesi ragionevole e, quasi sempre, abbastanza vicina al vero. Se un uccello riempie il tuo feed, ',
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
  SELECT id FROM public.journal_articles WHERE slug = 'when-rare-ones-get-recorded'
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
      'McCormick, A., & Riley, J. L. (2025). Integrating ecological and community science data to understand patterns of colour polymorphism and social behaviour at the northern range limit of a plethodontid salamander. PLOS ONE, 20(9), e0332501.',
      '10.1371/journal.pone.0332501',
      'https://doi.org/10.1371/journal.pone.0332501'
    )
) AS v(sort_order, ref_text, doi, url);

COMMIT;

-- =============================================================================
-- END
-- =============================================================================
