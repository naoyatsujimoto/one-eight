-- =============================================================================
-- journal_lizard_tail_article.sql
-- 記事: oej-2026-lizard-tail-autotomy-regeneration / what-comes-back-after-the-tail
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
  'what-comes-back-after-the-tail',
  'published',
  'ONE EIGHT Journal',
  ARRAY['ecology', 'lizard', 'autotomy', 'regeneration', 'Taiwan', 'survival'],
  '2026-07-20 00:00:00+09:00'
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
WITH article_0 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'what-comes-back-after-the-tail'
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
  article_0.id,
  'en',
  'What Comes Back After the Tail Is Gone',
  'A tail lies on the ground, still twitching, and the bird''s eye stays on it a beat too long. In that beat the lizard is already into the grass. We watch the tail wriggle, we see the lizard slip away,',
  $body_en$<p>A tail lies on the ground, still twitching, and the bird's eye stays on it a beat too long. In that beat the lizard is already into the grass. We watch the tail wriggle, we see the lizard slip away, and something in us closes the case: the defense worked. The animal traded a part it can regrow for the whole of its life. A fair bargain, cleanly settled.</p>

<p>But getting away is not the same as carrying on as before. The lizard that reaches the grass now moves through the next weeks without its tail — and in a grass lizard, the tail is no small thing. In the genus <em>Takydromus</em>, it runs several times the length of the body, a long counterweight these "grass swimmers" use to balance across thin leaves. Take it away and the animal is not simply lighter. It is a different animal for a while, until the tail grows back.</p>

<p>So the question that the tidy bargain skips over is what happens in that while. Does a tailless lizard live through the next month as well as one with its tail? Is the answer the same for males and females, in the breeding season and outside it? And when the tail does return, does it bring back only a shape — or something that had slipped in the meantime?</p>

<p>These are hard questions to answer by watching a single escape, because the interesting part is not the second of the strike but the weeks that follow it. You would have to know the same animals over time: who lost a tail, who still had one, who had grown one back, and which of them were still alive a month later. In the grasslands of Jinshan Cape, on the northern tip of Taiwan, that is what was done. For seven years, one night a month, a wild population of green-spotted grass lizards (<em>Takydromus viridipunctatus</em>) was searched out as the animals slept on Miscanthus leaves, caught by hand, marked, and checked again on later visits. Over twenty thousand captures of more than eleven thousand individuals accumulated. Each lizard's tail was sorted into one of three states — intact, recently lost, or regrown — and its fate followed. Lin and colleagues then laid the region's bird records over the lizard data, tracking four avian hunters: brown shrikes, common kestrels, black drongos, and cattle egrets.</p>

<p>That last layer matters more than it first seems, because it separates two things we tend to blur. The birds do not all threaten a lizard the same way. The large cattle egret tends to kill outright; a lizard it strikes rarely gets the chance to shed a tail and run. The smaller shrikes and kestrels are the ones most associated with tail loss — the encounters an animal survives by leaving a wriggling tail behind. Attack and escape, death and autotomy, turn out to sit with different predators. The tail on the ground is evidence of a hunter the lizard got away from, not of the one most likely to end it.</p>

<p>With the animals sorted and the birds mapped, the view begins to shift. Look only at the instant of the strike and tail loss reads as pure gain — a few seconds bought, a life kept. Extend the watch to the following month and a different figure surfaces. Among these lizards, the ones that had recently lost a tail were less likely to be alive at the next visit than the ones that still had theirs. And the gap was not the same for everyone. It was widest for males during the breeding season, when the estimated monthly survival of tailless males fell by roughly a third relative to intact males; for breeding females the drop was smaller but still clear, and outside the breeding season the differences narrowed for both. The cost of losing a tail, in other words, was not a fixed price. It depended on who paid it and when.</p>

<p>Where did that cost come from? The obvious guess is that a tailless lizard, slower and more exposed, simply gets caught more often next time. The numbers here point away from that. Tailless animals were not more strongly affected by predator abundance than tailed ones — being caught again did not seem to be the main driver. That leaves something more inward: the drain of carrying on, and rebuilding, without a tail. The authors read the pattern as a matter of how a body divides its resources, and connect the steep male cost in the breeding season to the demands of reproduction in a species where males put on bright courtship colouration — a reading supported by their earlier work, and offered as interpretation rather than something measured directly in this census. It is worth holding that line carefully: the survival gap is an estimate from the tracking data; the reason behind it is a hypothesis about physiology, not a demonstrated mechanism.</p>

<p>Then comes the part that changes what "regrowth" means. Follow the lizards whose tails had fully grown back, and their estimated survival was not stuck down where the tailless animals sat. It had climbed back up — and, in both sexes and both seasons, it was no longer distinguishable from that of lizards whose tails had never been shed. The animals that had come through the tailless stretch and regrown a tail were, by this measure, back to baseline. Whatever had dropped while the tail was missing had, on this reading, returned along with it.</p>

<p>That is a quieter claim than it might sound, and it is worth keeping it at its true size. A regrown tail is not the original: it is shorter, differently coloured, and its nerve response is weak or absent. What the tracking shows is not that the animal is restored in every respect, but that a survival level which had fallen came back near where it started. "Getting the tail back" turns out to mean less than a full undoing and more than a cosmetic patch. It is the return of a margin — the odds of seeing the next month — that the missing tail had cost.</p>

<p>None of this overturns the familiar picture of the wriggling tail and the escape. It extends it. The escape is real; the few seconds are real; the bird's misplaced attention is real. What the long watch adds is the time on the far side of that moment — a stretch in which the animal is more likely to die, weighted by its sex and the season, followed by a slower stretch in which, as the tail returns, that added risk recedes. Loss, a costly interval, and recovery are not three separate facts about lizards. In these grasslands, over these years, they look like one behaviour seen across time.</p>

<p>The next time the image comes to mind — the tail still moving on the ground, the lizard gone into the grass — it is worth letting the frame run a little longer. The animal that got away has weeks to live through before the tail is back. Whether escaping counts as surviving depends, it turns out, on how much of that time you agree to watch.</p>$body_en$,
  'What Comes Back After the Tail Is Gone | ONE EIGHT Journal',
  'A tail lies on the ground, still twitching, and the bird''s eye stays on it a beat too long. In that beat the lizard is already into the grass. We watch the tail wriggle, we see the lizard slip away,',
  true
FROM article_0
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH article_1 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'what-comes-back-after-the-tail'
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
  article_1.id,
  'ja',
  'しっぽを切って逃げた先で、トカゲは何を取り戻すのか',
  '草の上に切れたしっぽが落ちて、まだくねっている。鳥の目が、そこにほんの一瞬長くとどまる。その一瞬のうちに、トカゲはもう草むらへ入っている。動くしっぽを見て、逃げていくトカゲを見て、私たちはそこで話を閉じる。防御は成功した、と。再び生えてくる部分と引き換えに、体そのものが助かった。損得のはっきりした、きれいな取り決めに見える。

けれど、逃げ切ることと、その後も前と同じように生きられることは、同じで',
  $body_ja$<p>草の上に切れたしっぽが落ちて、まだくねっている。鳥の目が、そこにほんの一瞬長くとどまる。その一瞬のうちに、トカゲはもう草むらへ入っている。動くしっぽを見て、逃げていくトカゲを見て、私たちはそこで話を閉じる。防御は成功した、と。再び生えてくる部分と引き換えに、体そのものが助かった。損得のはっきりした、きれいな取り決めに見える。</p>

<p>けれど、逃げ切ることと、その後も前と同じように生きられることは、同じではない。草むらへ入ったトカゲは、これからしばらく、しっぽのない体で日々を過ごす。そしてこの草地のトカゲにとって、しっぽは小さな部分ではない。トカゲ属(Takydromus)の尾は体の何倍もあり、細い葉の上を渡るときの長い釣り合いおもりになっている。それを失うと、体が軽くなるだけではない。尾が伸びそろうまでのあいだ、その個体は少し違う生きものになる。</p>

<p>だから、きれいな取り決めが飛ばしているのは、その「しばらく」だ。しっぽを失った個体は、次の一か月をしっぽのある個体と同じように生き延びられるのか。その答えは、オスとメスで、繁殖期とそれ以外で、同じなのか。そして尾がまた伸びたとき、戻ってくるのは形だけなのか、それとも、そのあいだに下がった何かなのか。</p>

<p>こうした問いは、一度の逃走を見るだけでは答えにくい。肝心なのは襲われた一瞬ではなく、そのあとに続く数週間だからだ。答えるには、同じ個体を時間をかけて知るしかない。どの個体がしっぽを失い、どの個体がまだ持ち、どの個体が生やし直したのか。そして、その一か月後にも生きているのか。台湾の北端、金山岬(Jinshan Cape)の草地で、それが行われた。七年間、月に一晩、ススキの葉の上で眠るミドリスジトカゲ(Takydromus viridipunctatus)を探し出し、手で捕まえ、印をつけ、次の機会にまた確かめる。一晩に捕まる個体は平均で二百匹を超え、時に五百匹に達した。積み重なった記録は、一万一千匹あまりの個体の、二万を超える捕獲になった。個体ごとに尾の状態を三つ——切れていない、最近失った、十分に再生した——に分け、その後を追う。Lin らはさらに、その土地の鳥の記録を重ねた。追ったのは四種の捕食者、モズ、チョウゲンボウ、オウチュウ、そしてアマサギである。</p>

<p>この最後の重ね合わせは、見かけ以上に効いてくる。私たちが混ぜて考えがちな二つを、切り分けるからだ。鳥はどれも同じ脅かし方をするわけではない。大きなアマサギは、その場で仕留めることが多い。襲われたトカゲが、しっぽを切って逃げる機会を得られないことがある。大きなアマサギは体長五十センチほどで、小さなモズは二十センチ前後である。一方、尾の自切と結びつきやすいのは、より小さなモズとチョウゲンボウのほうだ。くねる尾を残して切り抜ける、あの場面である。襲撃と逃走、死と自切は、別々の捕食者のところに分かれて座っていた。地面に落ちた尾は、トカゲが逃げおおせた相手の証しであって、命を終わらせる可能性が最も高い相手の証しではない。</p>

<p>個体を分け、鳥を地図に重ねると、見え方が動きはじめる。襲われた瞬間だけを見れば、尾を失うことは差し引き得に見える。数秒を稼ぎ、命を保つ。ところが、観察の幅を翌月まで延ばすと、別の数字が浮かぶ。この草地のトカゲでは、最近しっぽを失った個体は、まだ持っている個体より、次に会えない確率が高かった。その差は、みなに同じではない。いちばん大きかったのは、繁殖期のオスである。しっぽのないオスの月ごとの推定生存率は、尾のあるオスより三割ほど下がっていた。繁殖期のメスでも差はあり、より小さいがはっきりしていて、繁殖期を外れると、どちらの性でも差は縮んだ。非繁殖期のオスでの低下は二割弱、メスでは一割に届かないほどにとどまる。尾を失う費用は、決まった額ではなかった。誰が、いつ払うかで変わっていた。尾のない一か月を越えられるかどうかは、季節と性によって重みが違っていた。</p>

<p>その費用は、どこから来るのか。まず思いつくのは、しっぽを失った個体は動きが鈍く目立つから、次にまた捕まりやすいのだろう、という筋だ。ここでの数字は、そちらを指していない。しっぽのない個体が、尾のある個体より捕食者の多さに強く影響される、ということはなかった。もう一度捕まることが、主な原因ではなさそうなのだ。残るのは、もっと内側の話になる。尾のない体で暮らし、それを作り直すことの負担である。著者らはこのパターンを、体が資源をどう配分するかの問題として読み、繁殖期のオスで費用が急に大きくなることを、鮮やかな婚姻色をまとうこの種の繁殖の要求と結びつけている。これは彼ら自身の以前の研究に支えられた読み方で、今回の追跡で直接測られたものではなく、解釈として示されている。この線は慎重に引いておきたい。生存率の差は追跡データからの推定であり、その背後の理由は生理をめぐる仮説であって、実証された仕組みではない。</p>

<p>そして、「再生」という言葉の意味を変える部分が来る。尾が十分に生えそろった個体を追うと、その推定生存率は、しっぽのない個体が沈んでいた低いところに留まってはいなかった。上へ戻っていて——しかもオスでもメスでも、繁殖期でもそれ以外でも——一度も尾を切っていない個体と区別がつかなくなっていた。しっぽのない時期をくぐり抜け、尾を生やし直した個体は、この尺度では基準へ戻っていた。尾を失っているあいだに下がっていた何かが、尾とともに戻ってきた、という読み方になる。</p>

<p>これは聞こえるより控えめな主張で、その大きさのまま置いておきたい。生え直した尾は、元の尾ではない。短く、色も違い、触っても神経の反応は弱いか、ない。追跡が示すのは、あらゆる面で元どおりになったということではなく、下がっていた生存の水準が、始まりの近くまで戻ったということだ。「しっぽが戻る」は、完全な取り消しよりは小さく、見た目の繕いよりは大きい。戻ってくるのは余白——次の一か月を迎えられる見込み——であり、それこそ、失った尾が奪っていたものだった。</p>

<p>以上のどれも、くねる尾と逃走という見慣れた像をひっくり返すものではない。像を延ばすのだ。逃走は本物で、数秒も本物で、鳥の狂った注意も本物だ。長い観察が付け加えるのは、その瞬間の向こう側の時間である。性と季節に応じて、より死にやすい一続きの時期があり、そのあとに、尾が戻るにつれて、その上乗せされた危険が引いていく、もう少し緩やかな時期が続く。喪失、費用のかかる合間、回復。これらはトカゲについての三つの別々の事実ではない。この草地で、この年月のあいだ、それらは時間の中で見た一つのふるまいのように見える。</p>

<p>次にあの像が浮かんだとき——地面でまだ動く尾、草むらへ消えたトカゲ——少しだけ長くその枠を回してみるとよい。逃げおおせた個体には、尾が戻るまでに生きねばならない数週間がある。逃げ切ったことが生き延びたことになるかどうかは、その時間をどこまで見ることに同意するか次第なのだ。</p>$body_ja$,
  'しっぽを切って逃げた先で、トカゲは何を取り戻すのか | ONE EIGHT Journal',
  '草の上に切れたしっぽが落ちて、まだくねっている。鳥の目が、そこにほんの一瞬長くとどまる。その一瞬のうちに、トカゲはもう草むらへ入っている。動くしっぽを見て、逃げていくトカゲを見て、私たちはそこで話を閉じる。防御は成功した、と。再び生えてくる部分と引き換えに、体そのものが助かった。損得のはっきりした、きれいな取り決めに見える。

けれど、逃げ切ることと、その後も前と同じように生きられることは、同じで',
  false
FROM article_1
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH article_2 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'what-comes-back-after-the-tail'
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
  article_2.id,
  'zh-Hant',
  '尾巴斷了之後，會回來的是什麼',
  '一截尾巴掉在地上，還在抽動，鳥的目光在那上面多停留了半拍。就在這半拍裡，蜥蜴已經鑽進草叢。我們看著尾巴扭動，看著蜥蜴溜走，心裡某個地方就把這樁事情結了案：防禦成功了。這隻動物用一個能再長回來的部位，換下了整條性命。一筆划算的交易，乾淨俐落地了結。

但逃得掉，並不等於之後還能像從前一樣過活。鑽進草叢的那隻蜥蜴，接下來的幾個星期都得帶著沒有尾巴的身體度過——而對草蜥來說，尾巴可不是小東西。在',
  $body_zh_Hant$<p>一截尾巴掉在地上，還在抽動，鳥的目光在那上面多停留了半拍。就在這半拍裡，蜥蜴已經鑽進草叢。我們看著尾巴扭動，看著蜥蜴溜走，心裡某個地方就把這樁事情結了案：防禦成功了。這隻動物用一個能再長回來的部位，換下了整條性命。一筆划算的交易，乾淨俐落地了結。</p>

<p>但逃得掉，並不等於之後還能像從前一樣過活。鑽進草叢的那隻蜥蜴，接下來的幾個星期都得帶著沒有尾巴的身體度過——而對草蜥來說，尾巴可不是小東西。在 <em>Takydromus</em> 這個屬裡，尾巴有身體的好幾倍長，是這些「草上的游泳者」用來在細葉之間保持平衡的一根長長的配重。少了它，動物不只是變輕而已。在尾巴長回來之前，牠有一陣子成了另一種動物。</p>

<p>於是，那筆乾淨的交易略過不談的，正是這「一陣子」裡發生的事。沒有尾巴的蜥蜴，能不能像有尾巴的一樣熬過接下來的一個月？這個答案，對公的和母的、在繁殖季和繁殖季之外，是不是一樣？而當尾巴真的長回來時，回來的只是一個形狀——還是這段期間悄悄溜走的某樣東西？</p>

<p>光看一次逃脫，這些問題很難回答，因為關鍵不在被撲擊的那一秒，而在其後的那幾個星期。你得長時間認得同一批動物：誰失去了尾巴，誰還留著，誰又重新長了一條，而其中哪些在一個月後仍然活著。在台灣最北端金山岬的草地上，人們正是這麼做的。一連七年，每個月挑一個晚上，趁著綠斑草蜥（<em>Takydromus viridipunctatus</em>）在芒草葉上睡著時把牠們找出來，徒手捕捉、做上標記，並在日後的造訪中再次查看。累積下來，是一萬一千多隻個體、兩萬多次的捕捉。每隻蜥蜴的尾巴都被歸入三種狀態之一——完整、剛失去、已再生——並追蹤牠此後的命運。Lin 與同事接著把這片地區的鳥類紀錄疊在蜥蜴的資料上，追蹤四種空中的獵手：紅尾伯勞、紅隼、大卷尾，還有牛背鷺。</p>

<p>最後這一層，比乍看之下更要緊，因為它把我們慣於混為一談的兩件事分了開來。這些鳥並不是以同一種方式威脅蜥蜴。體型大的牛背鷺往往一擊斃命；被牠撲中的蜥蜴，很少有機會斷尾逃走。反倒是體型較小的伯勞和紅隼，才是與斷尾最相關的——那正是動物靠著留下一截扭動的尾巴而脫身的場面。攻擊與逃脫、死亡與自割，原來分別坐落在不同的捕食者身上。地上那截尾巴，是蜥蜴逃過了某個獵手的證據，而不是那個最可能終結牠的獵手的證據。</p>

<p>把動物分了類、把鳥也標上圖之後，整個景象開始移動。只看被撲擊的那一瞬，斷尾讀起來是純粹的收穫——買下幾秒，保住一命。把觀察延長到接下來的那個月，另一組數字便浮了上來。在這些蜥蜴當中，剛失去尾巴的那些，到下次造訪時還活著的機率，低於仍留著尾巴的。而這道差距，對每個個體並不一樣。它在繁殖季的公蜥身上最大：這時，沒有尾巴的公蜥，每月的估計存活率比尾巴完整的公蜥低了約三分之一；繁殖中的母蜥，降幅較小，但仍然清楚可見；而在繁殖季之外，兩性的差距都收窄了。換句話說，失去尾巴的代價，並不是一個固定的價碼。它取決於由誰來付，以及在什麼時候付。</p>

<p>這代價又是從何而來？最直接的猜測是：沒有尾巴的蜥蜴動作較慢、也較顯眼，下一次就是比較容易被逮住罷了。這裡的數字，卻不指向那一頭。沒有尾巴的動物，並沒有比有尾巴的更強烈地受到捕食者數量多寡的影響——再次被逮，似乎不是主要的推手。那麼剩下的，就是更向內的東西：帶著沒有尾巴的身體繼續過活、並且重新把它長出來，這件事本身的消耗。作者把這個型態讀成身體如何分配資源的問題，並把繁殖季公蜥那陡然加大的代價，連上這個物種——公蜥會換上鮮豔求偶體色——在繁殖上的種種需求；這個讀法有他們先前研究的支持，是作為一種詮釋提出的，而非在這次普查中直接量測到的。這條線值得謹慎地拉好：存活率的差距，是從追蹤資料得出的估計；其背後的原因，則是一個關於生理的假說，而不是一個已被證實的機制。</p>

<p>接著，來到讓「再生」這個詞改變意思的部分。去追那些尾巴已經完全長回來的蜥蜴，牠們的估計存活率，並沒有卡在沒有尾巴的動物所沉到的那個低處。它又爬了回去——而且在兩種性別、兩個季節裡，都已經與那些從不曾斷過尾的蜥蜴分不出高下。那些熬過了無尾階段、又重新長出尾巴的動物，就這項尺度而言，回到了基準線。無論尾巴不在時下降的是什麼，照這個讀法，都隨著尾巴一起回來了。</p>

<p>這是個比聽起來更為收斂的說法，值得就著它本來的大小擺放。長回來的尾巴，不是原來那條：它比較短、顏色不同，摸上去神經反應微弱、甚至沒有。追蹤所顯示的，並不是這隻動物在每一方面都復原了，而是一個曾經下降的存活水準，回到了接近它起點的地方。「把尾巴要回來」，結果比一次徹底的抹消要少，卻又比一塊表面的修補要多。回來的是一份餘裕——迎來下一個月的那點機會——而那正是失去的尾巴曾經奪走的東西。</p>

<p>以上這些，都沒有推翻那幅熟悉的畫面：扭動的尾巴，與那場逃脫。它是把畫面延長了。逃脫是真的；那幾秒是真的；鳥那放錯了地方的注意力也是真的。長時間的觀察所添上的，是那一瞬另一頭的時間——一段動物更容易死去的時期，其輕重隨性別與季節而定，隨後是一段較緩的時期，隨著尾巴回來，那份被加上去的風險漸漸退去。失去、一段代價高昂的間隔、以及復原，並不是關於蜥蜴的三件各自分開的事實。在這片草地上、在這些年月裡，它們看起來像是在時間中被看見的同一種行為。</p>

<p>下一次那幅畫面浮上心頭時——尾巴還在地上動著，蜥蜴已消失在草裡——不妨讓那個鏡頭再多轉一會兒。逃過一劫的動物，在尾巴回來之前，還有好幾個星期要撐過去。逃得掉算不算活下來，結果，取決於你願意把那段時間看到多遠。</p>$body_zh_Hant$,
  '尾巴斷了之後，會回來的是什麼 | ONE EIGHT Journal',
  '一截尾巴掉在地上，還在抽動，鳥的目光在那上面多停留了半拍。就在這半拍裡，蜥蜴已經鑽進草叢。我們看著尾巴扭動，看著蜥蜴溜走，心裡某個地方就把這樁事情結了案：防禦成功了。這隻動物用一個能再長回來的部位，換下了整條性命。一筆划算的交易，乾淨俐落地了結。

但逃得掉，並不等於之後還能像從前一樣過活。鑽進草叢的那隻蜥蜴，接下來的幾個星期都得帶著沒有尾巴的身體度過——而對草蜥來說，尾巴可不是小東西。在',
  false
FROM article_2
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH article_3 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'what-comes-back-after-the-tail'
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
  article_3.id,
  'zh-Hans',
  '尾巴断了之后，会回来的是什么',
  '一截尾巴掉在地上，还在抽动，鸟的目光在那上面多停留了半拍。就在这半拍里，蜥蜴已经钻进草丛。我们看着尾巴扭动，看着蜥蜴溜走，心里某个地方就把这桩事情结了案：防御成功了。这只动物用一个能再长回来的部位，换下了整条性命。一笔划算的交易，干净利落地了结。

但逃得掉，并不等于之后还能像从前一样过活。钻进草丛的那只蜥蜴，接下来的几个星期都得带着没有尾巴的身体度过——而对草蜥来说，尾巴可不是小东西。在',
  $body_zh_Hans$<p>一截尾巴掉在地上，还在抽动，鸟的目光在那上面多停留了半拍。就在这半拍里，蜥蜴已经钻进草丛。我们看着尾巴扭动，看着蜥蜴溜走，心里某个地方就把这桩事情结了案：防御成功了。这只动物用一个能再长回来的部位，换下了整条性命。一笔划算的交易，干净利落地了结。</p>

<p>但逃得掉，并不等于之后还能像从前一样过活。钻进草丛的那只蜥蜴，接下来的几个星期都得带着没有尾巴的身体度过——而对草蜥来说，尾巴可不是小东西。在 <em>Takydromus</em> 这个属里，尾巴有身体的好几倍长，是这些"草上的游泳者"用来在细叶之间保持平衡的一根长长的配重。少了它，动物不只是变轻而已。在尾巴长回来之前，它有一阵子成了另一种动物。</p>

<p>于是，那笔干净的交易略过不谈的，正是这"一阵子"里发生的事。没有尾巴的蜥蜴，能不能像有尾巴的一样熬过接下来的一个月？这个答案，对公的和母的、在繁殖季和繁殖季之外，是不是一样？而当尾巴真的长回来时，回来的只是一个形状——还是这段期间悄悄溜走的某样东西？</p>

<p>光看一次逃脱，这些问题很难回答，因为关键不在被扑击的那一秒，而在其后的那几个星期。你得长时间认得同一批动物：谁失去了尾巴，谁还留着，谁又重新长了一条，而其中哪些在一个月后仍然活着。在台湾最北端金山岬的草地上，人们正是这么做的。一连七年，每个月挑一个晚上，趁着绿斑草蜥（<em>Takydromus viridipunctatus</em>）在芒草叶上睡着时把它们找出来，徒手捕捉、做上标记，并在日后的造访中再次查看。累积下来，是一万一千多只个体、两万多次的捕捉。每只蜥蜴的尾巴都被归入三种状态之一——完整、刚失去、已再生——并追踪它此后的命运。Lin 与同事接着把这片地区的鸟类记录叠在蜥蜴的资料上，追踪四种空中的猎手：红尾伯劳、红隼、黑卷尾，还有牛背鹭。</p>

<p>最后这一层，比乍看之下更要紧，因为它把我们惯于混为一谈的两件事分了开来。这些鸟并不是以同一种方式威胁蜥蜴。体型大的牛背鹭往往一击毙命；被它扑中的蜥蜴，很少有机会断尾逃走。反倒是体型较小的伯劳和红隼，才是与断尾最相关的——那正是动物靠着留下一截扭动的尾巴而脱身的场面。攻击与逃脱、死亡与自割，原来分别坐落在不同的捕食者身上。地上那截尾巴，是蜥蜴逃过了某个猎手的证据，而不是那个最可能终结它的猎手的证据。</p>

<p>把动物分了类、把鸟也标上图之后，整个景象开始移动。只看被扑击的那一瞬，断尾读起来是纯粹的收获——买下几秒，保住一命。把观察延长到接下来的那个月，另一组数字便浮了上来。在这些蜥蜴当中，刚失去尾巴的那些，到下次造访时还活着的机率，低于仍留着尾巴的。而这道差距，对每个个体并不一样。它在繁殖季的公蜥身上最大：这时，没有尾巴的公蜥，每月的估计存活率比尾巴完整的公蜥低了约三分之一；繁殖中的母蜥，降幅较小，但仍然清楚可见；而在繁殖季之外，两性的差距都收窄了。换句话说，失去尾巴的代价，并不是一个固定的价码。它取决于由谁来付，以及在什么时候付。</p>

<p>这代价又是从何而来？最直接的猜测是：没有尾巴的蜥蜴动作较慢、也较显眼，下一次就是比较容易被逮住罢了。这里的数字，却不指向那一头。没有尾巴的动物，并没有比有尾巴的更强烈地受到捕食者数量多寡的影响——再次被逮，似乎不是主要的推手。那么剩下的，就是更向内的东西：带着没有尾巴的身体继续过活、并且重新把它长出来，这件事本身的消耗。作者把这个型态读成身体如何分配资源的问题，并把繁殖季公蜥那陡然加大的代价，连上这个物种——公蜥会换上鲜艳求偶体色——在繁殖上的种种需求；这个读法有他们先前研究的支持，是作为一种诠释提出的，而非在这次普查中直接量测到的。这条线值得谨慎地拉好：存活率的差距，是从追踪资料得出的估计；其背后的原因，则是一个关于生理的假说，而不是一个已被证实的机制。</p>

<p>接着，来到让"再生"这个词改变意思的部分。去追那些尾巴已经完全长回来的蜥蜴，它们的估计存活率，并没有卡在没有尾巴的动物所沉到的那个低处。它又爬了回去——而且在两种性别、两个季节里，都已经与那些从不曾断过尾的蜥蜴分不出高下。那些熬过了无尾阶段、又重新长出尾巴的动物，就这项尺度而言，回到了基准线。无论尾巴不在时下降的是什么，照这个读法，都随着尾巴一起回来了。</p>

<p>这是个比听起来更为收敛的说法，值得就着它本来的大小摆放。长回来的尾巴，不是原来那条：它比较短、颜色不同，摸上去神经反应微弱、甚至没有。追踪所显示的，并不是这只动物在每一方面都复原了，而是一个曾经下降的存活水准，回到了接近它起点的地方。"把尾巴要回来"，结果比一次彻底的抹消要少，却又比一块表面的修补要多。回来的是一份余裕——迎来下一个月的那点机会——而那正是失去的尾巴曾经夺走的东西。</p>

<p>以上这些，都没有推翻那幅熟悉的画面：扭动的尾巴，与那场逃脱。它是把画面延长了。逃脱是真的；那几秒是真的；鸟那放错了地方的注意力也是真的。长时间的观察所添上的，是那一瞬另一头的时间——一段动物更容易死去的时期，其轻重随性别与季节而定，随后是一段较缓的时期，随着尾巴回来，那份被加上去的风险渐渐退去。失去、一段代价高昂的间隔、以及复原，并不是关于蜥蜴的三件各自分开的事实。在这片草地上、在这些年月里，它们看起来像是在时间中被看见的同一种行为。</p>

<p>下一次那幅画面浮上心头时——尾巴还在地上动着，蜥蜴已消失在草里——不妨让那个镜头再多转一会儿。逃过一劫的动物，在尾巴回来之前，还有好几个星期要撑过去。逃得掉算不算活下来，结果，取决于你愿意把那段时间看到多远。</p>$body_zh_Hans$,
  '尾巴断了之后，会回来的是什么 | ONE EIGHT Journal',
  '一截尾巴掉在地上，还在抽动，鸟的目光在那上面多停留了半拍。就在这半拍里，蜥蜴已经钻进草丛。我们看着尾巴扭动，看着蜥蜴溜走，心里某个地方就把这桩事情结了案：防御成功了。这只动物用一个能再长回来的部位，换下了整条性命。一笔划算的交易，干净利落地了结。

但逃得掉，并不等于之后还能像从前一样过活。钻进草丛的那只蜥蜴，接下来的几个星期都得带着没有尾巴的身体度过——而对草蜥来说，尾巴可不是小东西。在',
  false
FROM article_3
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH article_4 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'what-comes-back-after-the-tail'
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
  article_4.id,
  'ko',
  '꼬리가 사라진 뒤에 돌아오는 것',
  '꼬리 한 토막이 땅에 떨어져 아직도 꿈틀거리고, 새의 눈은 거기에 반 박자쯤 더 머문다. 그 반 박자 사이에 도마뱀은 이미 풀숲으로 들어가 있다. 우리는 꼬리가 꿈틀대는 것을 보고, 도마뱀이 빠져나가는 것을 보며, 마음 한구석에서 사건을 종결짓는다. 방어는 성공했다고. 이 동물은 다시 자라날 수 있는 부위 하나를 내주고 목숨 전체를 지켰다. 깔끔하게',
  $body_ko$<p>꼬리 한 토막이 땅에 떨어져 아직도 꿈틀거리고, 새의 눈은 거기에 반 박자쯤 더 머문다. 그 반 박자 사이에 도마뱀은 이미 풀숲으로 들어가 있다. 우리는 꼬리가 꿈틀대는 것을 보고, 도마뱀이 빠져나가는 것을 보며, 마음 한구석에서 사건을 종결짓는다. 방어는 성공했다고. 이 동물은 다시 자라날 수 있는 부위 하나를 내주고 목숨 전체를 지켰다. 깔끔하게 매듭지어진, 수지 맞는 거래다.</p>

<p>그러나 빠져나가는 것과, 그 뒤로도 전과 같이 살아가는 것은 같지 않다. 풀숲에 다다른 도마뱀은 이제 몇 주 동안 꼬리 없는 몸으로 지내야 한다 — 그리고 풀도마뱀에게 꼬리는 결코 사소한 것이 아니다. <em>Takydromus</em> 속에서 꼬리는 몸길이의 몇 배에 이르며, 이 "풀 위의 헤엄꾼들"이 가느다란 잎 사이를 건널 때 균형을 잡는 데 쓰는 긴 평형추다. 그것을 떼어 내면 동물은 단지 가벼워지는 데 그치지 않는다. 꼬리가 다시 자랄 때까지 한동안 그것은 다른 동물이 된다.</p>

<p>그러니 그 깔끔한 거래가 건너뛰는 것은 바로 그 "한동안" 사이에 벌어지는 일이다. 꼬리 없는 도마뱀은 다음 한 달을, 꼬리 있는 도마뱀만큼 잘 살아 낼까? 그 답은 수컷과 암컷에게, 번식기와 그 바깥에서 같을까? 그리고 꼬리가 정말 되돌아올 때, 돌아오는 것은 형태뿐일까 — 아니면 그사이에 슬그머니 빠져나간 무언가일까?</p>

<p>이런 물음은 한 번의 도망을 지켜보는 것만으로는 답하기 어렵다. 흥미로운 대목은 덮치는 그 한순간이 아니라, 그 뒤로 이어지는 몇 주이기 때문이다. 같은 동물들을 시간을 두고 알아야 한다. 누가 꼬리를 잃었고, 누가 아직 지니고 있으며, 누가 다시 길러 냈는지, 그리고 그중 누가 한 달 뒤에도 살아 있는지를. 타이완 북단 진산곶(Jinshan Cape)의 풀밭에서, 바로 그 일이 이루어졌다. 칠 년 동안 달마다 하룻밤, 억새 잎 위에서 잠든 녹색점풀도마뱀(<em>Takydromus viridipunctatus</em>)을 찾아내어 손으로 잡고, 표식을 하고, 다음 방문 때 다시 확인했다. 쌓인 것은 만 천 마리가 넘는 개체의, 이만 번이 넘는 포획이었다. 도마뱀마다 꼬리는 세 가지 상태 — 온전함, 최근에 잃음, 다시 자람 — 가운데 하나로 분류되어 그 이후의 운명이 추적되었다. 이어 Lin과 동료들은 이 지역의 새 기록을 도마뱀 자료 위에 겹쳐, 네 종의 공중 사냥꾼 — 노랑때까치, 황조롱이, 검은바람까마귀, 그리고 황로 — 을 함께 살폈다.</p>

<p>이 마지막 겹침은 언뜻 보이는 것보다 더 중요하다. 우리가 흔히 뭉뚱그리는 두 가지를 갈라놓기 때문이다. 새들이 모두 같은 방식으로 도마뱀을 위협하는 것은 아니다. 몸집이 큰 황로는 대개 단번에 죽인다. 그 새에게 덮친 도마뱀은 꼬리를 끊고 달아날 기회를 좀처럼 얻지 못한다. 오히려 몸집이 작은 때까치와 황조롱이가 꼬리 잃음과 가장 관련이 깊다 — 꿈틀거리는 꼬리 한 토막을 남기고 살아남는 바로 그 장면이다. 공격과 도망, 죽음과 자절(自切)은 알고 보니 서로 다른 포식자에게 나뉘어 놓여 있었다. 땅에 떨어진 꼬리는 도마뱀이 벗어난 사냥꾼의 증거이지, 그를 끝장낼 가능성이 가장 높은 사냥꾼의 증거가 아니다.</p>

<p>동물을 분류하고 새를 지도에 겹치자, 그림이 움직이기 시작한다. 덮치는 그 순간만 보면 꼬리 잃음은 순전한 이득으로 읽힌다 — 몇 초를 벌고, 목숨을 지킨다. 관찰을 그다음 달까지 늘리면 다른 수치가 떠오른다. 이 도마뱀들 가운데 최근 꼬리를 잃은 쪽은, 아직 꼬리를 지닌 쪽보다 다음 방문 때 살아 있을 확률이 낮았다. 그리고 그 격차는 모두에게 같지 않았다. 번식기의 수컷에게서 가장 컸다. 이때 꼬리 없는 수컷의 월간 추정 생존율은 꼬리가 온전한 수컷보다 약 삼분의 일 떨어졌다. 번식기의 암컷에서는 낙폭이 더 작았으나 여전히 뚜렷했고, 번식기 바깥에서는 양쪽 모두 그 차이가 좁아졌다. 다시 말해, 꼬리를 잃는 대가는 고정된 값이 아니었다. 그것은 누가, 언제 치르느냐에 달려 있었다.</p>

<p>그 대가는 어디서 왔을까? 가장 그럴듯한 짐작은, 꼬리 없는 도마뱀은 더 느리고 더 눈에 띄니 다음번에 그저 더 자주 잡힐 뿐이라는 것이다. 여기서의 수치는 그쪽을 가리키지 않는다. 꼬리 없는 동물이 꼬리 있는 동물보다 포식자의 많고 적음에 더 강하게 영향받지는 않았다 — 다시 잡히는 것이 주된 동인으로 보이지 않았다. 그러면 남는 것은 더 안쪽의 무언가다. 꼬리 없는 몸으로 살아가고, 그것을 다시 지어 올리는 데 드는 소모다. 저자들은 이 양상을 몸이 자원을 어떻게 나누는가의 문제로 읽고, 번식기 수컷에게서 가파르게 커지는 대가를, 수컷이 화려한 구애 색을 두르는 이 종의 번식 요구와 잇는다 — 이는 그들 자신의 앞선 연구가 뒷받침하는 읽기이며, 이번 조사에서 직접 측정된 것이 아니라 하나의 해석으로 제시된 것이다. 이 선은 조심스럽게 그어 둘 만하다. 생존율의 격차는 추적 자료에서 나온 추정이고, 그 배후의 이유는 생리에 관한 가설이지 입증된 기제가 아니다.</p>

<p>그러고 나서 "재생"이라는 말의 뜻을 바꾸는 대목이 온다. 꼬리가 완전히 다시 자란 도마뱀들을 좇으면, 그 추정 생존율은 꼬리 없는 동물이 가라앉아 있던 낮은 자리에 머물러 있지 않았다. 그것은 도로 올라가 있었다 — 그리고 두 성별, 두 계절 모두에서, 한 번도 꼬리를 끊은 적 없는 도마뱀의 것과 더는 구별되지 않았다. 꼬리 없는 시기를 통과해 꼬리를 다시 길러 낸 동물들은, 이 척도로 보면 기준선으로 돌아와 있었다. 꼬리가 없는 동안 떨어졌던 무엇이든, 이 읽기에 따르면 꼬리와 함께 되돌아온 것이다.</p>

<p>이것은 들리는 것보다 더 조용한 주장이며, 그 본래의 크기 그대로 두는 편이 좋다. 다시 자란 꼬리는 원래의 것이 아니다. 더 짧고, 색이 다르며, 만졌을 때 신경 반응이 약하거나 없다. 추적이 보여 주는 것은 동물이 모든 면에서 복원되었다는 것이 아니라, 떨어졌던 생존 수준이 처음 자리 가까이로 되돌아왔다는 것이다. "꼬리를 되찾는다"는 것은 결국 완전한 되돌림보다는 작고, 겉만의 땜질보다는 크다. 되돌아오는 것은 여백 — 다음 한 달을 맞이할 그 정도의 가능성 — 이며, 바로 그것이 잃어버린 꼬리가 앗아 갔던 것이다.</p>

<p>이 가운데 어느 것도 꿈틀거리는 꼬리와 도망이라는 낯익은 그림을 뒤엎지 않는다. 그것을 늘일 뿐이다. 도망은 진짜이고, 그 몇 초도 진짜이며, 새의 빗나간 주의도 진짜다. 긴 관찰이 보태는 것은 그 순간의 저편에 있는 시간이다 — 동물이 더 죽기 쉬운, 성별과 계절에 따라 무게가 실리는 한 구간, 그리고 그 뒤로 꼬리가 되돌아오면서 그 얹힌 위험이 물러가는 더 느린 구간. 잃음, 대가가 큰 사이 구간, 그리고 회복은 도마뱀에 관한 세 개의 따로 떨어진 사실이 아니다. 이 풀밭에서, 이 세월 동안, 그것들은 시간 속에서 보이는 하나의 행동처럼 보인다.</p>

<p>다음에 그 그림이 떠오를 때 — 땅에서 아직 움직이는 꼬리, 풀 속으로 사라진 도마뱀 — 그 화면을 조금만 더 돌려 보는 것이 좋다. 벗어난 동물에게는 꼬리가 되돌아오기까지 살아 내야 할 몇 주가 있다. 도망친 것이 살아남은 것으로 쳐지는지는, 알고 보니, 그 시간을 어디까지 지켜보기로 하느냐에 달려 있다.</p>$body_ko$,
  '꼬리가 사라진 뒤에 돌아오는 것 | ONE EIGHT Journal',
  '꼬리 한 토막이 땅에 떨어져 아직도 꿈틀거리고, 새의 눈은 거기에 반 박자쯤 더 머문다. 그 반 박자 사이에 도마뱀은 이미 풀숲으로 들어가 있다. 우리는 꼬리가 꿈틀대는 것을 보고, 도마뱀이 빠져나가는 것을 보며, 마음 한구석에서 사건을 종결짓는다. 방어는 성공했다고. 이 동물은 다시 자라날 수 있는 부위 하나를 내주고 목숨 전체를 지켰다. 깔끔하게',
  false
FROM article_4
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH article_5 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'what-comes-back-after-the-tail'
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
  article_5.id,
  'es',
  'Qué regresa cuando la cola ya no está',
  'Una cola yace en el suelo, todavía retorciéndose, y el ojo del ave se demora en ella un compás de más. En ese compás el lagarto ya está dentro de la hierba. Vemos la cola sacudirse, vemos al lagarto',
  $body_es$<p>Una cola yace en el suelo, todavía retorciéndose, y el ojo del ave se demora en ella un compás de más. En ese compás el lagarto ya está dentro de la hierba. Vemos la cola sacudirse, vemos al lagarto escabullirse, y algo en nosotros da el caso por cerrado: la defensa funcionó. El animal cambió una parte que puede volver a crecer por la totalidad de su vida. Un trato justo, saldado con limpieza.</p>

<p>Pero escapar no es lo mismo que seguir adelante como antes. El lagarto que alcanza la hierba atraviesa ahora las semanas siguientes sin su cola — y en un lagarto de pasto la cola no es poca cosa. En el género <em>Takydromus</em> mide varias veces el largo del cuerpo, un largo contrapeso que estos "nadadores de la hierba" usan para mantener el equilibrio sobre hojas delgadas. Quítesela y el animal no queda simplemente más ligero. Durante un tiempo es un animal distinto, hasta que la cola vuelve a crecer.</p>

<p>Así que lo que aquel trato tan pulcro se salta es lo que ocurre en ese tiempo. ¿Sobrevive un lagarto sin cola al mes siguiente tan bien como uno que aún la tiene? ¿Es la respuesta la misma para machos y hembras, en la estación de cría y fuera de ella? Y cuando la cola por fin regresa, ¿trae de vuelta solo una forma — o algo que se había escurrido entretanto?</p>

<p>Son preguntas difíciles de responder observando una sola huida, porque lo interesante no es el segundo del ataque sino las semanas que lo siguen. Habría que conocer a los mismos animales a lo largo del tiempo: quién perdió la cola, quién todavía la tenía, quién había vuelto a criar una, y cuáles de ellos seguían vivos un mes después. En los pastizales del cabo Jinshan, en el extremo norte de Taiwán, fue eso lo que se hizo. Durante siete años, una noche al mes, se buscó a una población silvestre de lagartos de pasto de puntos verdes (<em>Takydromus viridipunctatus</em>) mientras dormían sobre hojas de miscanto, se los capturó a mano, se los marcó y se los volvió a revisar en visitas posteriores. Se acumularon más de veinte mil capturas de más de once mil individuos. La cola de cada lagarto se clasificó en uno de tres estados — intacta, perdida hace poco o regenerada — y se siguió su suerte. Lin y sus colegas superpusieron entonces los registros de aves de la región sobre los datos de los lagartos, siguiendo a cuatro cazadores alados: alcaudones pardos, cernícalos vulgares, drongos negros y garcillas bueyeras.</p>

<p>Esa última capa importa más de lo que parece al principio, porque separa dos cosas que solemos confundir. Las aves no amenazan todas al lagarto del mismo modo. La garcilla bueyera, de mayor tamaño, tiende a matar de una vez; un lagarto al que golpea rara vez tiene ocasión de soltar la cola y correr. Los alcaudones y cernícalos, más pequeños, son los más asociados con la pérdida de cola — los encuentros que el animal sobrevive dejando atrás una cola que se retuerce. El ataque y la huida, la muerte y la autotomía resultan estar en manos de depredadores distintos. La cola en el suelo es prueba de un cazador del que el lagarto se libró, no del que tiene más probabilidades de acabar con él.</p>

<p>Con los animales clasificados y las aves cartografiadas, la vista empieza a moverse. Mírese solo el instante del ataque y la pérdida de cola se lee como pura ganancia — unos segundos comprados, una vida conservada. Extiéndase la observación al mes siguiente y aflora otra cifra. Entre estos lagartos, los que habían perdido la cola hacía poco tenían menos probabilidades de seguir vivos en la visita siguiente que los que aún la conservaban. Y la brecha no era igual para todos. Era mayor en los machos durante la estación de cría, cuando la supervivencia mensual estimada de los machos sin cola caía en torno a un tercio respecto a los machos intactos; en las hembras reproductoras el descenso era menor pero igual de claro, y fuera de la estación de cría las diferencias se estrechaban para ambos sexos. El costo de perder la cola, dicho de otro modo, no era un precio fijo. Dependía de quién lo pagaba y de cuándo.</p>

<p>¿De dónde venía ese costo? La suposición evidente es que un lagarto sin cola, más lento y más expuesto, sencillamente cae con más frecuencia la próxima vez. Los números aquí apuntan en otra dirección. Los animales sin cola no se veían más afectados por la abundancia de depredadores que los que la tenían — ser capturado de nuevo no parecía ser el motor principal. Queda entonces algo más interno: el desgaste de seguir adelante, y de reconstruir, sin cola. Los autores leen el patrón como una cuestión de cómo reparte un cuerpo sus recursos, y ligan el costo pronunciado de los machos en la estación de cría a las exigencias de la reproducción en una especie donde los machos adoptan una vistosa coloración de cortejo — una lectura respaldada por su trabajo anterior, y ofrecida como interpretación y no como algo medido directamente en este censo. Conviene sostener esa línea con cuidado: la brecha de supervivencia es una estimación a partir de los datos de seguimiento; la razón que hay detrás es una hipótesis sobre la fisiología, no un mecanismo demostrado.</p>

<p>Luego llega la parte que cambia lo que significa "regeneración". Síganse los lagartos cuyas colas habían vuelto a crecer del todo, y su supervivencia estimada no se quedaba hundida allí donde estaban los animales sin cola. Había vuelto a subir — y, en ambos sexos y ambas estaciones, ya no se distinguía de la de los lagartos que nunca habían mudado la cola. Los animales que habían atravesado el tramo sin cola y habían regenerado una estaban, según esta medida, de vuelta en el punto de partida. Lo que hubiera descendido mientras faltaba la cola había, según esta lectura, regresado con ella.</p>

<p>Es una afirmación más callada de lo que podría sonar, y conviene mantenerla en su tamaño real. Una cola regenerada no es la original: es más corta, de color distinto, y su respuesta nerviosa es débil o nula. Lo que el seguimiento muestra no es que el animal quede restaurado en todos los aspectos, sino que un nivel de supervivencia que había caído volvió cerca de donde empezó. "Recuperar la cola" resulta significar menos que una reparación completa y más que un remiendo cosmético. Es el regreso de un margen — la probabilidad de ver el mes siguiente — que la cola perdida había costado.</p>

<p>Nada de esto derriba la imagen conocida de la cola que se retuerce y la huida. La prolonga. La huida es real; los pocos segundos son reales; la atención mal dirigida del ave es real. Lo que la observación larga añade es el tiempo del otro lado de ese instante — un tramo en el que el animal tiene más probabilidades de morir, ponderado por su sexo y la estación, seguido de un tramo más lento en el que, a medida que la cola regresa, ese riesgo añadido se retira. La pérdida, un intervalo costoso y la recuperación no son tres hechos separados sobre los lagartos. En estos pastizales, a lo largo de estos años, parecen un solo comportamiento visto a través del tiempo.</p>

<p>La próxima vez que venga a la mente la imagen — la cola aún moviéndose en el suelo, el lagarto desaparecido en la hierba — vale la pena dejar correr el encuadre un poco más. Al animal que escapó le quedan semanas por vivir antes de que la cola vuelva. Que escapar cuente como sobrevivir depende, al final, de cuánto de ese tiempo accedas a mirar.</p>$body_es$,
  'Qué regresa cuando la cola ya no está | ONE EIGHT Journal',
  'Una cola yace en el suelo, todavía retorciéndose, y el ojo del ave se demora en ella un compás de más. En ese compás el lagarto ya está dentro de la hierba. Vemos la cola sacudirse, vemos al lagarto',
  false
FROM article_5
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH article_6 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'what-comes-back-after-the-tail'
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
  article_6.id,
  'pt-BR',
  'O que retorna depois que a cauda se vai',
  'Uma cauda jaz no chão, ainda se contorcendo, e o olho da ave se demora nela um tempo a mais. Nesse tempo o lagarto já está dentro do capim. Vemos a cauda se sacudir, vemos o lagarto escapulir, e algo',
  $body_pt_BR$<p>Uma cauda jaz no chão, ainda se contorcendo, e o olho da ave se demora nela um tempo a mais. Nesse tempo o lagarto já está dentro do capim. Vemos a cauda se sacudir, vemos o lagarto escapulir, e algo em nós encerra o caso: a defesa funcionou. O animal trocou uma parte que pode voltar a crescer pela totalidade de sua vida. Um bom negócio, resolvido com limpeza.</p>

<p>Mas escapar não é o mesmo que seguir em frente como antes. O lagarto que alcança o capim atravessa agora as semanas seguintes sem a cauda — e, num lagarto-do-capim, a cauda não é pouca coisa. No gênero <em>Takydromus</em> ela mede várias vezes o comprimento do corpo, um longo contrapeso que esses "nadadores do capim" usam para se equilibrar sobre folhas finas. Tire-a e o animal não fica apenas mais leve. Por um tempo, ele é um animal diferente, até a cauda voltar a crescer.</p>

<p>Então o que aquele negócio tão bem-ajustado deixa de fora é o que acontece nesse tempo. Um lagarto sem cauda sobrevive ao mês seguinte tão bem quanto um que ainda a tem? A resposta é a mesma para machos e fêmeas, na estação de reprodução e fora dela? E quando a cauda de fato retorna, ela traz de volta apenas uma forma — ou algo que havia escapado no entretempo?</p>

<p>São perguntas difíceis de responder observando uma única fuga, porque o interessante não é o segundo do bote, e sim as semanas que o seguem. Seria preciso conhecer os mesmos animais ao longo do tempo: quem perdeu a cauda, quem ainda a tinha, quem havia criado outra, e quais deles continuavam vivos um mês depois. Nos campos do cabo Jinshan, na ponta norte de Taiwan, foi isso o que se fez. Por sete anos, uma noite por mês, uma população selvagem de lagartos-do-capim de pintas verdes (<em>Takydromus viridipunctatus</em>) era procurada enquanto os animais dormiam sobre folhas de capim-miscanto, capturada à mão, marcada e conferida de novo em visitas posteriores. Acumularam-se mais de vinte mil capturas de mais de onze mil indivíduos. A cauda de cada lagarto foi classificada em um de três estados — intacta, perdida havia pouco ou regenerada — e seu destino, acompanhado. Lin e colegas então sobrepuseram os registros de aves da região aos dados dos lagartos, seguindo quatro caçadores alados: picanços-castanhos, peneireiros, drongos-pretos e garças-vaqueiras.</p>

<p>Essa última camada importa mais do que parece à primeira vista, porque separa duas coisas que tendemos a misturar. As aves não ameaçam o lagarto todas do mesmo modo. A garça-vaqueira, maior, tende a matar de imediato; um lagarto que ela atinge raramente tem a chance de largar a cauda e correr. Os picanços e peneireiros, menores, é que estão mais associados à perda da cauda — os encontros que o animal sobrevive deixando para trás uma cauda que se contorce. Ataque e fuga, morte e autotomia acabam ficando com predadores diferentes. A cauda no chão é prova de um caçador do qual o lagarto escapou, não daquele com maior probabilidade de acabar com ele.</p>

<p>Com os animais classificados e as aves mapeadas, a vista começa a se deslocar. Olhe apenas o instante do bote e a perda da cauda se lê como puro ganho — alguns segundos comprados, uma vida preservada. Estenda a observação ao mês seguinte e outra cifra vem à tona. Entre esses lagartos, os que haviam perdido a cauda havia pouco tinham menos probabilidade de continuar vivos na visita seguinte do que os que ainda a conservavam. E a diferença não era igual para todos. Era maior nos machos durante a estação de reprodução, quando a sobrevivência mensal estimada dos machos sem cauda caía cerca de um terço em relação aos machos intactos; nas fêmeas reprodutoras a queda era menor, mas igualmente nítida, e fora da estação de reprodução as diferenças se estreitavam para ambos os sexos. O custo de perder a cauda, em outras palavras, não era um preço fixo. Dependia de quem o pagava e de quando.</p>

<p>De onde vinha esse custo? O palpite óbvio é que um lagarto sem cauda, mais lento e mais exposto, simplesmente é apanhado com mais frequência da próxima vez. Os números aqui apontam para longe disso. Os animais sem cauda não eram mais fortemente afetados pela abundância de predadores do que os que tinham cauda — ser apanhado de novo não parecia ser o principal motor. Resta então algo mais interno: o desgaste de seguir em frente, e de reconstruir, sem cauda. Os autores leem o padrão como uma questão de como um corpo divide seus recursos, e ligam o custo acentuado dos machos na estação de reprodução às exigências da reprodução numa espécie em que os machos adotam uma coloração de corte vistosa — uma leitura amparada por seu trabalho anterior, e oferecida como interpretação, não como algo medido diretamente neste levantamento. Vale sustentar essa linha com cuidado: a diferença de sobrevivência é uma estimativa a partir dos dados de acompanhamento; a razão por trás dela é uma hipótese sobre a fisiologia, não um mecanismo demonstrado.</p>

<p>Vem então a parte que muda o que significa "regeneração". Acompanhe os lagartos cujas caudas haviam voltado a crescer por completo, e sua sobrevivência estimada não ficava presa lá embaixo, onde estavam os animais sem cauda. Tinha subido de novo — e, em ambos os sexos e ambas as estações, já não se distinguia da dos lagartos que nunca haviam perdido a cauda. Os animais que haviam atravessado o trecho sem cauda e regenerado uma estavam, por essa medida, de volta ao ponto de partida. O que quer que tivesse baixado enquanto faltava a cauda havia, por essa leitura, retornado junto com ela.</p>

<p>É uma afirmação mais discreta do que pode soar, e convém mantê-la em seu tamanho real. Uma cauda regenerada não é a original: é mais curta, de cor diferente, e sua resposta nervosa é fraca ou inexistente. O que o acompanhamento mostra não é que o animal fique restaurado em todos os aspectos, mas que um nível de sobrevivência que havia caído voltou para perto de onde começou. "Recuperar a cauda" acaba significando menos que um desfazer completo e mais que um remendo cosmético. É o retorno de uma margem — a chance de ver o mês seguinte — que a cauda perdida havia custado.</p>

<p>Nada disso derruba a imagem conhecida da cauda que se contorce e da fuga. Ela a prolonga. A fuga é real; os poucos segundos são reais; a atenção mal dirigida da ave é real. O que a observação longa acrescenta é o tempo do outro lado daquele instante — um trecho em que o animal tem mais probabilidade de morrer, ponderado por seu sexo e pela estação, seguido de um trecho mais lento em que, à medida que a cauda retorna, esse risco acrescido recua. A perda, um intervalo custoso e a recuperação não são três fatos separados sobre os lagartos. Nesses campos, ao longo desses anos, eles parecem um só comportamento visto através do tempo.</p>

<p>Da próxima vez que a imagem vier à mente — a cauda ainda se movendo no chão, o lagarto sumido no capim — vale deixar o quadro correr um pouco mais. Ao animal que escapou restam semanas a atravessar antes de a cauda voltar. Se escapar conta como sobreviver depende, no fim, de quanto desse tempo você concorda em observar.</p>$body_pt_BR$,
  'O que retorna depois que a cauda se vai | ONE EIGHT Journal',
  'Uma cauda jaz no chão, ainda se contorcendo, e o olho da ave se demora nela um tempo a mais. Nesse tempo o lagarto já está dentro do capim. Vemos a cauda se sacudir, vemos o lagarto escapulir, e algo',
  false
FROM article_6
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH article_7 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'what-comes-back-after-the-tail'
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
  article_7.id,
  'de',
  'Was zurückkommt, wenn der Schwanz weg ist',
  'Ein Schwanz liegt am Boden, zuckt noch, und das Auge des Vogels verweilt einen Schlag zu lange auf ihm. In diesem Schlag ist die Eidechse längst im Gras. Wir sehen den Schwanz zappeln, sehen die',
  $body_de$<p>Ein Schwanz liegt am Boden, zuckt noch, und das Auge des Vogels verweilt einen Schlag zu lange auf ihm. In diesem Schlag ist die Eidechse längst im Gras. Wir sehen den Schwanz zappeln, sehen die Eidechse entwischen, und etwas in uns legt den Fall zu den Akten: Die Verteidigung hat funktioniert. Das Tier hat einen Teil, der nachwachsen kann, gegen sein ganzes Leben eingetauscht. Ein fairer Handel, sauber abgeschlossen.</p>

<p>Doch davonzukommen ist nicht dasselbe wie weiterzuleben wie zuvor. Die Eidechse, die das Gras erreicht, kommt nun die nächsten Wochen ohne ihren Schwanz durch — und bei einer Graseidechse ist der Schwanz keine Kleinigkeit. In der Gattung <em>Takydromus</em> misst er ein Mehrfaches der Körperlänge, ein langes Gegengewicht, mit dem diese „Grasschwimmer" auf schmalen Blättern die Balance halten. Nimmt man ihn weg, ist das Tier nicht einfach leichter. Für eine Weile ist es ein anderes Tier, bis der Schwanz nachwächst.</p>

<p>Was der saubere Handel also überspringt, ist, was in dieser Weile geschieht. Übersteht eine schwanzlose Eidechse den nächsten Monat so gut wie eine mit Schwanz? Ist die Antwort für Männchen und Weibchen dieselbe, in der Fortpflanzungszeit und außerhalb? Und wenn der Schwanz tatsächlich zurückkehrt, bringt er nur eine Gestalt zurück — oder etwas, das in der Zwischenzeit abgeglitten war?</p>

<p>Solche Fragen lassen sich schwer beantworten, wenn man einer einzelnen Flucht zusieht, denn das Interessante ist nicht die Sekunde des Zuschlagens, sondern die Wochen danach. Man müsste dieselben Tiere über die Zeit kennen: wer einen Schwanz verlor, wer noch einen hatte, wer einen nachgezogen hatte, und welche von ihnen einen Monat später noch am Leben waren. In den Grasländern des Kaps Jinshan, an der Nordspitze Taiwans, wurde genau das getan. Sieben Jahre lang, eine Nacht im Monat, wurde eine wilde Population grüngepunkteter Graseidechsen (<em>Takydromus viridipunctatus</em>) aufgespürt, während die Tiere auf Miscanthus-Blättern schliefen, von Hand gefangen, markiert und bei späteren Besuchen erneut überprüft. Über zwanzigtausend Fänge von mehr als elftausend Individuen kamen zusammen. Der Schwanz jeder Eidechse wurde in einen von drei Zuständen eingeordnet — unversehrt, kürzlich verloren oder nachgewachsen — und ihr Schicksal verfolgt. Lin und Kollegen legten dann die Vogelaufzeichnungen der Region über die Eidechsendaten und verfolgten vier gefiederte Jäger: Braunwürger, Turmfalken, Königsdrongos und Kuhreiher.</p>

<p>Diese letzte Schicht wiegt schwerer, als sie zunächst scheint, denn sie trennt zwei Dinge, die wir gern vermengen. Die Vögel bedrohen die Eidechse nicht alle auf dieselbe Weise. Der große Kuhreiher tötet meist auf der Stelle; eine Eidechse, die er trifft, bekommt selten die Gelegenheit, den Schwanz abzuwerfen und zu fliehen. Die kleineren Würger und Falken sind es, die am ehesten mit dem Schwanzverlust einhergehen — die Begegnungen, die ein Tier überlebt, indem es einen zappelnden Schwanz zurücklässt. Angriff und Flucht, Tod und Autotomie sitzen, wie sich zeigt, bei verschiedenen Räubern. Der Schwanz am Boden ist der Beleg für einen Jäger, dem die Eidechse entkommen ist, nicht für den, der sie am ehesten erledigt.</p>

<p>Sind die Tiere sortiert und die Vögel kartiert, beginnt sich das Bild zu verschieben. Blickt man nur auf den Augenblick des Zuschlagens, liest sich der Schwanzverlust als reiner Gewinn — ein paar Sekunden gekauft, ein Leben bewahrt. Dehnt man die Beobachtung auf den folgenden Monat aus, taucht eine andere Zahl auf. Unter diesen Eidechsen waren die, die kürzlich einen Schwanz verloren hatten, beim nächsten Besuch seltener am Leben als die, die ihren noch hatten. Und der Abstand war nicht für alle gleich. Am größten war er bei den Männchen während der Fortpflanzungszeit, als das geschätzte monatliche Überleben schwanzloser Männchen gegenüber unversehrten um etwa ein Drittel sank; bei fortpflanzenden Weibchen fiel der Rückgang kleiner aus, war aber ebenso deutlich, und außerhalb der Fortpflanzungszeit verengten sich die Unterschiede für beide Geschlechter. Der Preis des Schwanzverlusts war, mit anderen Worten, kein fester Betrag. Er hing davon ab, wer ihn zahlte und wann.</p>

<p>Woher kam dieser Preis? Die naheliegende Vermutung ist, dass eine schwanzlose Eidechse, langsamer und ungeschützter, beim nächsten Mal schlicht häufiger gefangen wird. Die Zahlen hier weisen davon weg. Schwanzlose Tiere wurden von der Zahl der Räuber nicht stärker beeinflusst als Tiere mit Schwanz — erneut gefangen zu werden schien nicht der Hauptantrieb zu sein. Bleibt etwas Innerlicheres: die Zehrung, ohne Schwanz weiterzuleben und ihn wieder aufzubauen. Die Autoren lesen das Muster als eine Frage, wie ein Körper seine Ressourcen aufteilt, und verbinden den steilen Preis der Männchen in der Fortpflanzungszeit mit den Anforderungen der Fortpflanzung bei einer Art, deren Männchen eine leuchtende Balzfärbung anlegen — eine Deutung, die durch ihre früheren Arbeiten gestützt und als Interpretation angeboten wird, nicht als etwas in dieser Erhebung direkt Gemessenes. Diese Linie ist mit Sorgfalt zu halten: Der Überlebensabstand ist eine Schätzung aus den Verfolgungsdaten; der Grund dahinter ist eine Hypothese über die Physiologie, kein nachgewiesener Mechanismus.</p>

<p>Dann kommt der Teil, der verändert, was „Nachwuchs" bedeutet. Verfolgt man die Eidechsen, deren Schwänze vollständig nachgewachsen waren, so blieb ihr geschätztes Überleben nicht dort unten stecken, wo die schwanzlosen Tiere saßen. Es war wieder hinaufgeklettert — und war, in beiden Geschlechtern und beiden Jahreszeiten, von dem der Eidechsen, die nie einen Schwanz abgeworfen hatten, nicht mehr zu unterscheiden. Die Tiere, die die schwanzlose Strecke durchgestanden und einen Schwanz nachgezogen hatten, waren nach diesem Maß auf den Ausgangswert zurück. Was auch immer gesunken war, während der Schwanz fehlte, war nach dieser Lesart mit ihm zurückgekehrt.</p>

<p>Das ist eine leisere Behauptung, als es klingen mag, und man sollte sie in ihrer wahren Größe belassen. Ein nachgewachsener Schwanz ist nicht der ursprüngliche: Er ist kürzer, anders gefärbt, und seine Nervenreaktion ist schwach oder fehlt. Was die Verfolgung zeigt, ist nicht, dass das Tier in jeder Hinsicht wiederhergestellt wäre, sondern dass ein Überlebensniveau, das gefallen war, wieder nahe an seinen Ausgangspunkt zurückkam. „Den Schwanz zurückbekommen" bedeutet, wie sich zeigt, weniger als ein vollständiges Rückgängigmachen und mehr als ein kosmetisches Flicken. Es ist die Rückkehr eines Spielraums — der Aussicht, den nächsten Monat zu erleben —, den der fehlende Schwanz gekostet hatte.</p>

<p>Nichts davon stürzt das vertraute Bild vom zappelnden Schwanz und der Flucht um. Es erweitert es. Die Flucht ist real; die paar Sekunden sind real; die fehlgeleitete Aufmerksamkeit des Vogels ist real. Was die lange Beobachtung hinzufügt, ist die Zeit auf der anderen Seite jenes Augenblicks — eine Strecke, in der das Tier eher stirbt, gewichtet nach Geschlecht und Jahreszeit, gefolgt von einer langsameren Strecke, in der, während der Schwanz zurückkehrt, dieses zusätzliche Risiko zurückweicht. Verlust, ein kostspieliges Intervall und Erholung sind nicht drei getrennte Tatsachen über Eidechsen. In diesen Grasländern, über diese Jahre, sehen sie aus wie ein einziges Verhalten, gesehen quer durch die Zeit.</p>

<p>Wenn das Bild das nächste Mal in den Sinn kommt — der Schwanz, der sich noch am Boden bewegt, die Eidechse, im Gras verschwunden —, lohnt es sich, das Bild ein wenig länger laufen zu lassen. Dem Tier, das entkam, bleiben Wochen zu überstehen, bevor der Schwanz zurück ist. Ob Entkommen als Überleben zählt, hängt, wie sich herausstellt, davon ab, wie viel von dieser Zeit man mitzusehen bereit ist.</p>$body_de$,
  'Was zurückkommt, wenn der Schwanz weg ist | ONE EIGHT Journal',
  'Ein Schwanz liegt am Boden, zuckt noch, und das Auge des Vogels verweilt einen Schlag zu lange auf ihm. In diesem Schlag ist die Eidechse längst im Gras. Wir sehen den Schwanz zappeln, sehen die',
  false
FROM article_7
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH article_8 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'what-comes-back-after-the-tail'
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
  article_8.id,
  'fr',
  'Ce qui revient une fois la queue perdue',
  'Une queue gît sur le sol, encore frémissante, et l''œil de l''oiseau s''y attarde d''un temps de trop. Dans ce temps, le lézard est déjà dans l''herbe. Nous regardons la queue se tortiller, nous voyons le',
  $body_fr$<p>Une queue gît sur le sol, encore frémissante, et l'œil de l'oiseau s'y attarde d'un temps de trop. Dans ce temps, le lézard est déjà dans l'herbe. Nous regardons la queue se tortiller, nous voyons le lézard s'esquiver, et quelque chose en nous classe l'affaire : la défense a marché. L'animal a échangé une partie qui repousse contre la totalité de sa vie. Un marché équitable, réglé proprement.</p>

<p>Mais s'en tirer n'est pas la même chose que continuer comme avant. Le lézard qui atteint l'herbe traverse désormais les semaines suivantes sans sa queue — et chez un lézard des herbes, la queue n'est pas peu de chose. Dans le genre <em>Takydromus</em>, elle fait plusieurs fois la longueur du corps, un long contrepoids dont ces « nageurs de l'herbe » se servent pour tenir l'équilibre sur les feuilles minces. Ôtez-la et l'animal n'est pas simplement plus léger. Pour un temps, c'est un autre animal, jusqu'à ce que la queue repousse.</p>

<p>Ce que le marché si net saute, c'est donc ce qui se passe pendant ce temps-là. Un lézard sans queue survit-il au mois suivant aussi bien qu'un lézard qui a la sienne ? La réponse est-elle la même pour les mâles et les femelles, en saison de reproduction et hors saison ? Et lorsque la queue revient enfin, ramène-t-elle seulement une forme — ou quelque chose qui avait glissé entre-temps ?</p>

<p>Ce sont des questions difficiles à trancher en observant une seule fuite, car l'intéressant n'est pas la seconde de l'attaque mais les semaines qui la suivent. Il faudrait connaître les mêmes animaux dans la durée : qui a perdu une queue, qui en avait encore une, qui en avait fait repousser une, et lesquels d'entre eux étaient encore vivants un mois plus tard. Dans les prairies du cap Jinshan, à la pointe nord de Taïwan, c'est ce qui a été fait. Pendant sept ans, une nuit par mois, on est allé chercher une population sauvage de lézards des herbes à points verts (<em>Takydromus viridipunctatus</em>) tandis que les animaux dormaient sur des feuilles de miscanthus, on les a capturés à la main, marqués, puis revérifiés lors de visites ultérieures. Plus de vingt mille captures, portant sur plus de onze mille individus, se sont accumulées. La queue de chaque lézard a été classée dans l'un de trois états — intacte, perdue depuis peu ou régénérée — et son sort a été suivi. Lin et ses collègues ont ensuite superposé les relevés d'oiseaux de la région aux données sur les lézards, en suivant quatre chasseurs ailés : les pies-grièches brunes, les faucons crécerelles, les drongos royaux et les hérons garde-bœufs.</p>

<p>Cette dernière couche compte plus qu'il n'y paraît, car elle sépare deux choses que nous avons tendance à confondre. Les oiseaux ne menacent pas tous le lézard de la même façon. Le héron garde-bœufs, plus grand, tend à tuer d'emblée ; un lézard qu'il frappe a rarement l'occasion de lâcher sa queue et de courir. Ce sont les pies-grièches et les crécerelles, plus petites, qui sont le plus associées à la perte de la queue — les rencontres qu'un animal survit en laissant derrière lui une queue qui se tortille. L'attaque et la fuite, la mort et l'autotomie se logent, on le découvre, chez des prédateurs différents. La queue au sol témoigne d'un chasseur auquel le lézard a échappé, non de celui qui a le plus de chances de l'achever.</p>

<p>Une fois les animaux classés et les oiseaux cartographiés, la vue se met à bouger. Ne regardez que l'instant de l'attaque et la perte de la queue se lit comme un pur gain — quelques secondes achetées, une vie conservée. Étendez l'observation au mois suivant et un autre chiffre remonte. Parmi ces lézards, ceux qui avaient perdu une queue depuis peu avaient moins de chances d'être encore vivants à la visite suivante que ceux qui gardaient la leur. Et l'écart n'était pas le même pour tous. Il était le plus grand chez les mâles pendant la saison de reproduction, où la survie mensuelle estimée des mâles sans queue baissait d'environ un tiers par rapport aux mâles intacts ; chez les femelles reproductrices, la baisse était plus faible mais tout aussi nette, et hors saison de reproduction les différences se resserraient pour les deux sexes. Le coût de la perte de la queue, autrement dit, n'était pas un prix fixe. Il dépendait de qui le payait, et de quand.</p>

<p>D'où venait ce coût ? La supposition évidente est qu'un lézard sans queue, plus lent et plus exposé, se fait simplement prendre plus souvent la fois suivante. Les chiffres, ici, pointent ailleurs. Les animaux sans queue n'étaient pas plus fortement affectés par l'abondance des prédateurs que ceux qui en avaient une — être repris de nouveau ne semblait pas être le moteur principal. Reste alors quelque chose de plus intérieur : l'usure de continuer, et de reconstruire, sans queue. Les auteurs lisent le schéma comme une affaire de répartition des ressources par le corps, et relient le coût abrupt des mâles en saison de reproduction aux exigences de la reproduction chez une espèce où les mâles revêtent une vive coloration nuptiale — une lecture étayée par leurs travaux antérieurs, et offerte comme interprétation, non comme quelque chose de mesuré directement dans ce recensement. Il vaut la peine de tenir cette ligne avec soin : l'écart de survie est une estimation tirée des données de suivi ; la raison qui le sous-tend est une hypothèse sur la physiologie, non un mécanisme démontré.</p>

<p>Vient ensuite la partie qui change le sens de « repousse ». Suivez les lézards dont la queue avait entièrement repoussé, et leur survie estimée ne restait pas coincée en bas, là où se tenaient les animaux sans queue. Elle était remontée — et, dans les deux sexes et les deux saisons, elle ne se distinguait plus de celle des lézards qui n'avaient jamais perdu leur queue. Les animaux qui avaient traversé la période sans queue et en avaient régénéré une étaient, selon cette mesure, revenus au niveau de départ. Ce qui avait baissé pendant l'absence de la queue était, selon cette lecture, revenu avec elle.</p>

<p>C'est une affirmation plus discrète qu'elle n'en a l'air, et il vaut mieux la garder à sa taille réelle. Une queue régénérée n'est pas l'originale : elle est plus courte, d'une autre couleur, et sa réponse nerveuse est faible ou nulle. Ce que le suivi montre, ce n'est pas que l'animal est rétabli à tous égards, mais qu'un niveau de survie qui avait chuté est revenu près de son point de départ. « Récupérer la queue » finit par signifier moins qu'une remise en état complète et plus qu'un raccommodage cosmétique. C'est le retour d'une marge — la probabilité de voir le mois suivant — que la queue perdue avait coûtée.</p>

<p>Rien de tout cela ne renverse l'image familière de la queue qui se tortille et de la fuite. Cela la prolonge. La fuite est réelle ; les quelques secondes sont réelles ; l'attention mal placée de l'oiseau est réelle. Ce que la longue observation ajoute, c'est le temps de l'autre côté de cet instant — une portion où l'animal a plus de chances de mourir, pondérée par son sexe et la saison, suivie d'une portion plus lente où, à mesure que la queue revient, ce risque supplémentaire reflue. La perte, un intervalle coûteux et le rétablissement ne sont pas trois faits distincts au sujet des lézards. Dans ces prairies, au fil de ces années, ils ressemblent à un seul comportement vu à travers le temps.</p>

<p>La prochaine fois que l'image se présente à l'esprit — la queue qui bouge encore au sol, le lézard disparu dans l'herbe — il vaut la peine de laisser courir le cadre un peu plus longtemps. À l'animal qui s'en est tiré, il reste des semaines à vivre avant que la queue soit de retour. Que s'échapper compte comme survivre dépend, il s'avère, de la part de ce temps que vous acceptez de regarder.</p>$body_fr$,
  'Ce qui revient une fois la queue perdue | ONE EIGHT Journal',
  'Une queue gît sur le sol, encore frémissante, et l''œil de l''oiseau s''y attarde d''un temps de trop. Dans ce temps, le lézard est déjà dans l''herbe. Nous regardons la queue se tortiller, nous voyons le',
  false
FROM article_8
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH article_9 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'what-comes-back-after-the-tail'
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
  article_9.id,
  'it',
  'Che cosa torna dopo che la coda è andata',
  'Una coda giace a terra, ancora guizzante, e l''occhio dell''uccello vi indugia un battito di troppo. In quel battito la lucertola è già tra l''erba. Guardiamo la coda dimenarsi, vediamo la lucertola',
  $body_it$<p>Una coda giace a terra, ancora guizzante, e l'occhio dell'uccello vi indugia un battito di troppo. In quel battito la lucertola è già tra l'erba. Guardiamo la coda dimenarsi, vediamo la lucertola svignarsela, e qualcosa in noi chiude il caso: la difesa ha funzionato. L'animale ha barattato una parte che può ricrescere con l'intera sua vita. Un affare equo, chiuso con pulizia.</p>

<p>Ma cavarsela non è lo stesso che proseguire come prima. La lucertola che raggiunge l'erba attraversa ora le settimane seguenti senza la coda — e in una lucertola dei prati la coda non è cosa da poco. Nel genere <em>Takydromus</em> misura parecchie volte la lunghezza del corpo, un lungo contrappeso con cui queste "nuotatrici dell'erba" tengono l'equilibrio sulle foglie sottili. Toglietela e l'animale non è semplicemente più leggero. Per un po' è un animale diverso, finché la coda non ricresce.</p>

<p>Ciò che l'affare così pulito salta è dunque quel che accade in quel po' di tempo. Una lucertola senza coda sopravvive al mese seguente bene quanto una che ce l'ha ancora? La risposta è la stessa per i maschi e per le femmine, nella stagione riproduttiva e fuori di essa? E quando la coda torna davvero, riporta soltanto una forma — o qualcosa che nel frattempo era scivolato via?</p>

<p>Sono domande a cui è difficile rispondere osservando una singola fuga, perché l'interessante non è il secondo dell'attacco ma le settimane che lo seguono. Bisognerebbe conoscere gli stessi animali nel tempo: chi ha perso la coda, chi la aveva ancora, chi ne aveva fatta ricrescere una, e quali di loro fossero ancora vivi un mese dopo. Nelle praterie di capo Jinshan, all'estremità settentrionale di Taiwan, è proprio questo che si è fatto. Per sette anni, una notte al mese, una popolazione selvatica di lucertole dei prati a macchie verdi (<em>Takydromus viridipunctatus</em>) veniva cercata mentre gli animali dormivano sulle foglie di miscanto, catturata a mano, marcata e ricontrollata nelle visite successive. Si accumularono oltre ventimila catture di più di undicimila individui. La coda di ogni lucertola veniva classificata in uno di tre stati — intatta, persa da poco o rigenerata — e se ne seguiva la sorte. Lin e colleghi sovrapposero poi i registri degli uccelli della regione ai dati sulle lucertole, seguendo quattro cacciatori alati: le averle brune, i gheppi, i drongo neri e gli aironi guardabuoi.</p>

<p>Quest'ultimo strato pesa più di quanto sembri a prima vista, perché separa due cose che tendiamo a confondere. Gli uccelli non minacciano tutti la lucertola allo stesso modo. Il grande airone guardabuoi tende a uccidere sul colpo; una lucertola che colpisce di rado ha l'occasione di lasciare la coda e correre. Sono le averle e i gheppi, più piccoli, a essere più associati alla perdita della coda — gli incontri che un animale sopravvive lasciandosi dietro una coda che si dimena. Attacco e fuga, morte e autotomia si trovano, si scopre, presso predatori diversi. La coda a terra è prova di un cacciatore a cui la lucertola è sfuggita, non di quello che ha più probabilità di finirla.</p>

<p>Con gli animali classificati e gli uccelli mappati, la veduta comincia a spostarsi. Si guardi solo l'istante dell'attacco e la perdita della coda si legge come puro guadagno — pochi secondi comprati, una vita salvata. Si estenda l'osservazione al mese seguente e affiora un'altra cifra. Tra queste lucertole, quelle che avevano perso la coda da poco avevano meno probabilità di essere ancora vive alla visita successiva rispetto a quelle che la conservavano. E il divario non era uguale per tutti. Era massimo nei maschi durante la stagione riproduttiva, quando la sopravvivenza mensile stimata dei maschi senza coda calava di circa un terzo rispetto ai maschi intatti; nelle femmine riproduttive la caduta era minore ma altrettanto netta, e fuori dalla stagione riproduttiva le differenze si restringevano per entrambi i sessi. Il costo della perdita della coda, in altre parole, non era un prezzo fisso. Dipendeva da chi lo pagava e da quando.</p>

<p>Da dove veniva quel costo? La supposizione ovvia è che una lucertola senza coda, più lenta e più esposta, venga semplicemente presa più spesso la volta dopo. I numeri, qui, puntano altrove. Gli animali senza coda non erano più fortemente influenzati dall'abbondanza di predatori rispetto a quelli con la coda — essere ripresi non sembrava il motore principale. Resta allora qualcosa di più interiore: il logorio di andare avanti, e di ricostruire, senza coda. Gli autori leggono lo schema come una questione di come un corpo ripartisce le proprie risorse, e collegano il costo ripido dei maschi nella stagione riproduttiva alle esigenze della riproduzione in una specie in cui i maschi assumono una vivace colorazione nuziale — una lettura sostenuta dai loro lavori precedenti, e offerta come interpretazione, non come qualcosa misurato direttamente in questo censimento. Vale la pena tenere quella linea con cura: il divario di sopravvivenza è una stima ricavata dai dati di monitoraggio; la ragione che vi sta dietro è un'ipotesi sulla fisiologia, non un meccanismo dimostrato.</p>

<p>Poi arriva la parte che cambia il significato di "ricrescita". Si seguano le lucertole la cui coda era ricresciuta del tutto, e la loro sopravvivenza stimata non restava inchiodata in basso, dove stavano gli animali senza coda. Era risalita — e, in entrambi i sessi e in entrambe le stagioni, non si distingueva più da quella delle lucertole che non avevano mai perso la coda. Gli animali che avevano attraversato il tratto senza coda e ne avevano rigenerata una erano, secondo questa misura, tornati al punto di partenza. Qualunque cosa fosse calata mentre mancava la coda era, secondo questa lettura, tornata insieme a essa.</p>

<p>È un'affermazione più sommessa di quanto possa suonare, e conviene tenerla nella sua misura reale. Una coda rigenerata non è l'originale: è più corta, di colore diverso, e la sua risposta nervosa è debole o assente. Ciò che il monitoraggio mostra non è che l'animale sia ripristinato sotto ogni aspetto, ma che un livello di sopravvivenza che era caduto è tornato vicino a dove era partito. "Riavere la coda" finisce per significare meno di un annullamento completo e più di un rattoppo estetico. È il ritorno di un margine — la probabilità di vedere il mese seguente — che la coda perduta era costata.</p>

<p>Nulla di tutto questo rovescia l'immagine familiare della coda che si dimena e della fuga. La prolunga. La fuga è reale; i pochi secondi sono reali; l'attenzione mal riposta dell'uccello è reale. Ciò che la lunga osservazione aggiunge è il tempo dall'altra parte di quell'istante — un tratto in cui l'animale ha più probabilità di morire, pesato dal sesso e dalla stagione, seguito da un tratto più lento in cui, mentre la coda torna, quel rischio aggiunto si ritira. La perdita, un intervallo costoso e il recupero non sono tre fatti separati sulle lucertole. In queste praterie, nel corso di questi anni, sembrano un solo comportamento visto attraverso il tempo.</p>

<p>La prossima volta che l'immagine viene in mente — la coda che si muove ancora a terra, la lucertola sparita nell'erba — vale la pena lasciar scorrere l'inquadratura un po' più a lungo. All'animale che se l'è cavata restano settimane da vivere prima che la coda sia di nuovo lì. Se scappare conti come sopravvivere dipende, si scopre, da quanto di quel tempo si acconsente a guardare.</p>$body_it$,
  'Che cosa torna dopo che la coda è andata | ONE EIGHT Journal',
  'Una coda giace a terra, ancora guizzante, e l''occhio dell''uccello vi indugia un battito di troppo. In quel battito la lucertola è già tra l''erba. Guardiamo la coda dimenarsi, vediamo la lucertola',
  false
FROM article_9
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
WITH ref_article AS (
  SELECT id FROM public.journal_articles WHERE slug = 'what-comes-back-after-the-tail'
)
INSERT INTO public.journal_article_references (
  article_id,
  sort_order,
  ref_text,
  doi,
  url
)
SELECT
  ref_article.id,
  1,
  $ref1$Lin, J.-W., Chen, Y.-R., Wang, Y.-H., Hung, K.-C., & Lin, S.-M. (2017). Tail regeneration after autotomy revives survival: a case from a long-term monitored lizard population under avian predation. Proceedings of the Royal Society B: Biological Sciences, 284(1847), 20162538.$ref1$,
  '10.1098/rspb.2016.2538',
  'https://doi.org/10.1098/rspb.2016.2538'
FROM ref_article
ON CONFLICT (article_id, sort_order) DO UPDATE
  SET
    ref_text = EXCLUDED.ref_text,
    doi      = EXCLUDED.doi,
    url      = EXCLUDED.url;

COMMIT;