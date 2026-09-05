-- =============================================================================
-- 20260905000000_journal_toxicity_visibility_taranto_article.sql
-- 記事: oej-2026-toxicity-visibility-taranto / if-you-cannot-see-it
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
  'if-you-cannot-see-it',
  'published',
  'ONE EIGHT Journal',
  ARRAY['cultural anthropology','environmental crisis','toxicity','slow violence','photography','Taranto','Italy','visibility'],
  '2026-09-03 19:59:00+09:00',
  '2026-09-05 00:00:00+09:00',
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
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'if-you-cannot-see-it')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'en',
  'If You Can''t See It, Is It Happening?',
  $ex$A poisoned Italian city where some of the harm sits plainly on the gravestones and some of it never shows — and what that does to how we decide what is real$ex$,
  $body$<p>We trust what we can see. A photograph settles an argument; show the thing and it is real. When no one can produce a clear picture, doubt creeps in — maybe it isn't happening, or isn't as bad as claimed. We use visibility as the test of reality, mostly without noticing we do it.</p>
<p>That test breaks in Taranto, on Italy's southern coast, in the shadow of Europe's largest steelworks — the plant once called ILVA, now ArcelorMittal, big enough to cover twice the old city. About 200,000 people live beside it, and the workers' district, Tamburi, sits closest and takes the most. Some of the harm is plainly visible: a faintly pink iron-ore dust the locals call minerale, laced with lead, cadmium, and arsenic, settles on skin, on windowsills, on the graves in the cemetery next to the plant — one section is even named Zona Ilva, after the factory. The dust even changes color — gray, then orange, then a burnt ochre — depending on how it has weathered. On "wind days," schools close because the dust is blowing. But the part that does the gravest harm, the dioxin from the tallest chimney, is colorless, and drifts even to the wealthier suburbs unseen.</p>
<p>So the harm will not hold still for a camera. The dust you can photograph; the dioxin you can't. The deaths are real — higher rates of cancers, heart disease, lost pregnancies — but slow enough to pass for ordinary life, and no single photograph proves that this death came from that chimney. The gravediggers know the dust close up: they describe it like flour, shining in the ground, catching in the eyes and mouth. One of them kept a notebook of the causes of death, turning the cemetery into a ledger of what the plant was doing. Years ago its night custodians photographed the grounds every two hours to prove they were awake, and the flash caught the dust glittering — thousands of images. None of it held up as proof in court.</p>
<p>Even the cleanup — the bonifica — makes the harm blink. To lift out the poisoned soil, the town has to dig up its dead: families are told to reopen graves decades old and pay for a second burial, or lose the remains to a common pit. In the field of angels, the section where the town buries its infants, one couple reopened a grave their son had lain in for fifty-two years — and found nothing left of him. Another mother, Mariangela, lost an infant son she says was stillborn from the pollution. The contamination becomes visible again in the very act of removing it, and the question it leaves points forward, not back — what is there left to hand down to your children?</p>
<p>Jasmine Pisapia, who spent time among these workers and their pictures, gives the condition a name: flickering. The harm never stays invisible, and it never comes fully into view. It blinks — present, then gone, then present. A photograph from Taranto is not evidence that settles the matter. It catches the poison at the moment it half-shows, and loses it again.</p>
<p>There is a pull to photograph it anyway. The performance artist Isabella Mongelli, who shot the factory and the graves for a series she called Visions of Taranto, described the camera as a way to put the poison outside herself — expel it, and for a moment it is no longer part of you. It never stays out. What the lens pushes away drifts back on the next wind.</p>
<p>This is not only a way of seeing; it has been tested in court. The steelworks went on trial in the case Italians called Ambiente Svenduto — "Sacrificed Environment." Executives were convicted in 2021; the convictions were overturned on appeal in 2024. The difficulty is the same one the cemetery photographs ran into: harm spread across 200,000 bodies and several decades does not resolve into the single clear image, or the clean line from this cause to that death, that proof demands. The standard meant to protect people is built for harm that holds still.</p>
<p>Here the reflex we started with turns over. We were treating "can't see it, can't prove it" as "probably not real." Taranto says the reverse. The harm is real, and its refusal to hold still in an image is not a flaw in the harm — it is what this kind of harm is like. Some of the most serious things never arrive as a clear picture. They arrive as a flicker: a dust you notice one day and forget the next, a risk you half-see, a cause you can't fasten to its effect.</p>
<p>What changes is your own reflex, the next time something won't resolve into a clean image or a proven line from cause to effect. The instinct is to file it under "not yet proven" and wait for the picture to sharpen. Taranto is a place where waiting for the picture is itself the danger. Some things are only ever going to flicker — and the question is whether you can learn to see at that setting, instead of looking away until the proof arrives.</p>$body$,
  'If You Can''t See It, Is It Happening? | ONE EIGHT Journal',
  $ex$A poisoned Italian city where some of the harm sits plainly on the gravestones and some of it never shows — and what that does to how we decide what is real$ex$,
  true
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ja
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'if-you-cannot-see-it')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'ja',
  '見えないなら、起きていないのか',
  $ex$害の一部は墓石の上にはっきり積もり、一部は決して現れない——毒に侵されたイタリアの街が、「何を現実と認めるか」の判断を揺らす$ex$,
  $body$<p>私たちは、見えるものを信じる。一枚の写真が議論を決める。示せれば、それは現実だ。誰もはっきりした画像を出せないと、疑いが忍び込む。起きていないのでは、言うほどひどくないのでは、と。私たちは、見えることを現実の判定基準にしている。たいていは、そうしていると気づかないまま。</p>
<p>その基準が、タラントで壊れる。イタリア南部の海辺、ヨーロッパ最大の製鉄所のすぐ隣にある街だ。かつてILVA、いまはアルセロール・ミッタルと呼ばれる工場は、もとの街の二倍の広さを覆うほど大きい。約20万人がその脇で暮らし、労働者の地区タンブリが最も近く、最も多くを浴びる。害の一部は、はっきり見える。地元の人がミネラーレと呼ぶ、鉛やカドミウム、ヒ素を含む、うっすらと桃色の鉄鉱石の粉塵が、肌に、窓枠に、工場のとなりの墓地の墓石に積もる——一区画は、工場にちなんでゾーナ・イルヴァと呼ばれている。粉塵は色さえ変える。灰色から、橙、そして焦げたような黄土色へ。風化の具合しだいだ。「風の日」には、粉塵が舞うため学校が閉まる。だが、いちばん重い害をもたらすダイオキシンは、いちばん高い煙突から出て、無色のまま裕福な郊外にまで漂う。</p>
<p>だから害は、カメラの前でじっとしていない。粉塵は撮れる。ダイオキシンは撮れない。死は現実にある——がんも、心臓の病も、失われた妊娠も増えている——が、日常に紛れるほど遅く、この死がその煙突から来たと、一枚の写真が証明することはない。墓掘りたちは、粉塵を間近で知っている。小麦粉のようだ、地面が内側から光る、目や口に入る、と語る。ある墓掘りは、死因をノートに記録し続けた。墓地は、工場がしていることの帳簿になった。かつて夜警は、起きている証拠にと、二時間ごとに敷地を撮った。フラッシュが粉塵のきらめきを捉え、写真は何千枚にもなった。だが、どれも法廷では証拠にならなかった。</p>
<p>除染——ボニフィカ——さえ、害を明滅させる。汚染された土を取り除くには、街は死者を掘り起こさねばならない。家族は、何十年も前の墓を開け、二度目の埋葬の費用を払うか、遺骨を共同の穴に渡すかを迫られる。街が幼子を葬る「天使たちの区画」では、ある夫婦が、五十二年ものあいだ息子が横たわっていた墓を開け直した——そして、何も残っていなかった。別の母親マリアンジェラは、汚染のせいで死産したという幼い息子を亡くしていた。汚染は、それを取り除くまさにその行為のなかで、また見えるようになる。そして残る問いは、過去ではなく先を向いている——子どもたちに、いったい何を遺せるのか。</p>
<p>この労働者たちと写真のあいだで時間を過ごした Jasmine Pisapia は、この状態に名をつける。フリッカリング(明滅)だ。害は、見えないままでもなく、はっきり見えるようにもならない。点滅する。現れ、消え、また現れる。タラントの一枚の写真は、事を決める証拠ではない。毒が半ば姿を見せた瞬間をつかみ、また取り逃がす。</p>
<p>それでも、撮らずにいられない引力がある。工場と墓を「Visions of Taranto」という連作に撮ったパフォーマンス・アーティスト、イザベラ・モンジェッリは、カメラを、毒を自分の外へ出す方法だと語った。吐き出せば、ほんの一瞬、それはもう自分の一部ではない。だが、外にとどまってはくれない。レンズが押しやったものは、次の風でまた戻ってくる。</p>
<p>これは見方だけの話ではない。法廷でも試された。製鉄所は、イタリアで「アンビエンテ・スヴェンドゥート(売り渡された環境)」と呼ばれた裁判にかけられた。2021年に経営陣は有罪となり、その判決は2024年、控訴審で覆った。難しさは、墓地の写真がぶつかったものと同じだ。20万の身体と数十年にわたって広がる害は、証明が求める一枚のはっきりした像にも、この原因からその死へ、という一本のきれいな線にも収まらない。人を守るはずの基準は、じっとしている害のために作られている。</p>
<p>ここで、最初の反射が裏返る。私たちは「見えない、証明できない」を「たぶん現実ではない」と扱っていた。タラントは逆を言う。害は現実にある。そして、それが画像の中でじっとしないことは、害の欠陥ではない。この種の害とは、そういうものなのだ。もっとも深刻なものの一部は、はっきりした像としては決して来ない。明滅として来る。ある日気づき、翌日には忘れる粉塵。半分だけ見えるリスク。結果に結びつけられない原因として。</p>
<p>変わるのは、あなた自身の反射だ。次に、何かがきれいな像にも、原因から結果への証明された一本の線にも収まらないとき。反射的に「まだ証明されていない」の棚に入れ、像がくっきりするのを待つ。タラントは、その「像を待つ」こと自体が危険になる場所だ。あるものは、どこまでいっても明滅するしかない——問われているのは、証拠が来るまで目をそらすのではなく、その明るさで見ることを、こちらが覚えられるかどうかだ。</p>$body$,
  '見えないなら、起きていないのか | ONE EIGHT Journal',
  $ex$害の一部は墓石の上にはっきり積もり、一部は決して現れない——毒に侵されたイタリアの街が、「何を現実と認めるか」の判断を揺らす$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- zh-Hant
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'if-you-cannot-see-it')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'zh-Hant',
  '如果看不見，它就沒有發生嗎？',
  $ex$一座中毒的義大利城市，那裡有些傷害清清楚楚積在墓碑上，有些卻從不現身——而這件事改變了我們如何判定什麼是真的$ex$,
  $body$<p>我們相信自己看得見的東西。一張照片就能了結一場爭論；把東西拿出來，它就是真的。當沒有人能拿出一張清楚的影像，懷疑就悄悄爬進來——也許事情根本沒發生，或者沒有說的那麼糟。我們拿「看得見」當作真實的檢驗標準，而且多半沒察覺自己正在這麼做。</p>
<p>這個標準在塔蘭托失效了。這座城市位在義大利南部海岸，緊挨著歐洲最大的鋼鐵廠——那座曾經叫 ILVA、如今屬於安賽樂米塔爾的工廠，大到足以覆蓋兩倍的老城區。約有二十萬人住在它旁邊，而工人聚居的坦布里區離得最近，也承受得最多。有些傷害清清楚楚看得見：當地人稱為 minerale 的淡粉色鐵礦粉塵，摻著鉛、鎘與砷，落在皮膚上、窗台上，落在緊鄰工廠的墓園墓碑上——其中一區甚至就以工廠為名，叫做 Zona Ilva。粉塵連顏色都會變——灰色，接著橙色，再到燒焦般的赭黃——取決於它風化到什麼程度。遇到「颳風的日子」，學校會停課，因為粉塵正在飛揚。但造成最嚴重傷害的那一部分，從最高的煙囪排出的戴奧辛，是無色的，而且會一路飄到更富裕的郊區，沒有人看見。</p>
<p>所以傷害不會為了鏡頭乖乖停住。粉塵你拍得到；戴奧辛你拍不到。死亡是真的——癌症、心臟疾病、失去的懷孕，比率都更高——但慢得足以被當成尋常人生的一部分，而且沒有任何一張照片能證明這一樁死亡來自那一根煙囪。掘墓人近距離認得那些粉塵：他們說它像麵粉，在地裡發著光，會鑽進眼睛和嘴巴。其中一位持續用一本筆記本記下死因，把墓園變成了一本記錄工廠所作所為的帳簿。多年前，夜間守衛每兩小時就拍下園區一次，用來證明自己沒睡著，閃光燈捕捉到粉塵閃爍的樣子——照片累積到數千張。這些沒有一張在法庭上站得住腳。</p>
<p>就連清理——bonifica——也讓傷害忽明忽滅。為了把有毒的土壤挖走，這座城鎮必須挖出自己的死者：家屬被告知要重新打開幾十年前的墳墓，並支付第二次安葬的費用，否則遺骸將被送進公共墓穴。在天使之地，也就是鎮上安葬嬰兒的那一區，一對夫婦重新打開了兒子躺了五十二年的墳——結果什麼也沒剩下。另一位母親瑪麗安潔拉，失去了一個年幼的兒子，她說那是污染造成的死產。污染在移除它的那個動作裡，重新變得看得見。而它留下的問題朝向前方，而不是回頭——你還剩下什麼可以交給你的孩子？</p>
<p>在這些工人和他們的照片之間待過一段時間的 Jasmine Pisapia，為這種狀態取了一個名字：明滅。傷害從不會一直隱形，也從不會完全進入視野。它閃爍——出現，消失，又出現。一張來自塔蘭托的照片，並不是能了結此事的證據。它抓住了毒物半顯半隱的那一刻，然後又把它弄丟。</p>
<p>即便如此，仍有一股想去拍它的拉力。行為藝術家伊莎貝拉·蒙傑利拍下了工廠與那些墳墓，做成名為 Visions of Taranto 的系列。她形容相機是一種把毒物放到自己身體之外的方法——把它吐出去，那一瞬間它就不再是你的一部分。它從來不會一直待在外面。鏡頭推開的東西，會隨著下一陣風飄回來。</p>
<p>這不只是一種觀看的方式；它已經在法庭上被試驗過。這座鋼鐵廠被送上一場義大利人稱為 Ambiente Svenduto——「被犧牲的環境」——的審判。高層主管在2021年被判有罪；這些有罪判決在2024年的上訴審中被撤銷。困難之處，和墓園照片撞上的是同一個：散布在二十萬個身體、橫跨數十年的傷害，並不會收攏成證明所要求的那一張清楚的影像，或那條從此因到彼死的乾淨線條。原本應該保護人的標準，是為了會停住不動的傷害而打造的。</p>
<p>到這裡，我們一開始的那個反射整個翻轉過來。我們一直把「看不見、證明不了」當成「大概不是真的」。塔蘭托說的正好相反。傷害是真的，而它拒絕在一張影像裡停住，並不是這傷害的缺陷——這種傷害本來就是這個樣子。某些最嚴重的事，永遠不會以一張清楚的圖像抵達。它們以明滅的方式抵達：一種你某天注意到、隔天就忘了的粉塵，一個你只看見一半的風險，一個你沒辦法扣上其結果的原因。</p>
<p>會改變的，是你自己的反射——下一次，當某件事無法收攏成一張乾淨的影像，或一條從因到果、已被證明的線條時。直覺是把它歸進「尚未證實」的檔案夾，然後等那張圖變清晰。塔蘭托正是這樣一個地方：等待那張圖，本身就是危險。有些東西，無論如何都只會明滅——問題在於，你能不能學會在那個亮度下觀看，而不是別開視線，直到證據到來。</p>$body$,
  '如果看不見，它就沒有發生嗎？ | ONE EIGHT Journal',
  $ex$一座中毒的義大利城市，那裡有些傷害清清楚楚積在墓碑上，有些卻從不現身——而這件事改變了我們如何判定什麼是真的$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- zh-Hans
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'if-you-cannot-see-it')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'zh-Hans',
  '如果看不见，它就没有发生吗？',
  $ex$一座中毒的意大利城市，那里有些伤害清清楚楚积在墓碑上，有些却从不现身——而这件事改变了我们如何判定什么是真的$ex$,
  $body$<p>我们相信自己看得见的东西。一张照片就能了结一场争论；把东西拿出来，它就是真的。当没有人能拿出一张清楚的影像，怀疑就悄悄爬进来——也许事情根本没发生，或者没有说的那么糟。我们拿“看得见”当作真实的检验标准，而且多半没察觉自己正在这么做。</p>
<p>这个标准在塔兰托失效了。这座城市位在意大利南部海岸，紧挨着欧洲最大的钢铁厂——那座曾经叫 ILVA、如今属于安赛乐米塔尔的工厂，大到足以覆盖两倍的老城区。约有二十万人住在它旁边，而工人聚居的坦布里区离得最近，也承受得最多。有些伤害清清楚楚看得见：当地人称为 minerale 的淡粉色铁矿粉尘，掺着铅、镉与砷，落在皮肤上、窗台上，落在紧邻工厂的墓园墓碑上——其中一区甚至就以工厂为名，叫做 Zona Ilva。粉尘连颜色都会变——灰色，接着橙色，再到烧焦般的赭黄——取决于它风化到什么程度。遇到“刮风的日子”，学校会停课，因为粉尘正在飞扬。但造成最严重伤害的那一部分，从最高的烟囱排出的二噁英，是无色的，而且会一路飘到更富裕的郊区，没有人看见。</p>
<p>所以伤害不会为了镜头乖乖停住。粉尘你拍得到；二噁英你拍不到。死亡是真的——癌症、心脏疾病、失去的怀孕，比率都更高——但慢得足以被当成寻常人生的一部分，而且没有任何一张照片能证明这一桩死亡来自那一根烟囱。掘墓人近距离认得那些粉尘：他们说它像面粉，在地里发着光，会钻进眼睛和嘴巴。其中一位持续用一本笔记本记下死因，把墓园变成了一本记录工厂所作所为的账簿。多年前，夜间守卫每两小时就拍下园区一次，用来证明自己没睡着，闪光灯捕捉到粉尘闪烁的样子——照片累积到数千张。这些没有一张在法庭上站得住脚。</p>
<p>就连清理——bonifica——也让伤害忽明忽灭。为了把有毒的土壤挖走，这座城镇必须挖出自己的死者：家属被告知要重新打开几十年前的坟墓，并支付第二次安葬的费用，否则遗骸将被送进公共墓穴。在天使之地，也就是镇上安葬婴儿的那一区，一对夫妇重新打开了儿子躺了五十二年的坟——结果什么也没剩下。另一位母亲玛丽安洁拉，失去了一个年幼的儿子，她说那是污染造成的死产。污染在移除它的那个动作里，重新变得看得见。而它留下的问题朝向前方，而不是回头——你还剩下什么可以交给你的孩子？</p>
<p>在这些工人和他们的照片之间待过一段时间的 Jasmine Pisapia，为这种状态取了一个名字：明灭。伤害从不会一直隐形，也从不会完全进入视野。它闪烁——出现，消失，又出现。一张来自塔兰托的照片，并不是能了结此事的证据。它抓住了毒物半显半隐的那一刻，然后又把它弄丢。</p>
<p>即便如此，仍有一股想去拍它的拉力。行为艺术家伊莎贝拉·蒙杰利拍下了工厂与那些坟墓，做成名为 Visions of Taranto 的系列。她形容相机是一种把毒物放到自己身体之外的方法——把它吐出去，那一瞬间它就不再是你的一部分。它从来不会一直待在外面。镜头推开的东西，会随着下一阵风飘回来。</p>
<p>这不只是一种观看的方式；它已经在法庭上被试验过。这座钢铁厂被送上一场意大利人称为 Ambiente Svenduto——“被牺牲的环境”——的审判。高层主管在2021年被判有罪；这些有罪判决在2024年的上诉审中被撤销。困难之处，和墓园照片撞上的是同一个：散布在二十万个身体、横跨数十年的伤害，并不会收拢成证明所要求的那一张清楚的影像，或那条从此因到彼死的干净线条。原本应该保护人的标准，是为了会停住不动的伤害而打造的。</p>
<p>到这里，我们一开始的那个反射整个翻转过来。我们一直把“看不见、证明不了”当成“大概不是真的”。塔兰托说的正好相反。伤害是真的，而它拒绝在一张影像里停住，并不是这伤害的缺陷——这种伤害本来就是这个样子。某些最严重的事，永远不会以一张清楚的图像抵达。它们以明灭的方式抵达：一种你某天注意到、隔天就忘了的粉尘，一个你只看见一半的风险，一个你没办法扣上其结果的原因。</p>
<p>会改变的，是你自己的反射——下一次，当某件事无法收拢成一张干净的影像，或一条从因到果、已被证明的线条时。直觉是把它归进“尚未证实”的档案夹，然后等那张图变清晰。塔兰托正是这样一个地方：等待那张图，本身就是危险。有些东西，无论如何都只会明灭——问题在于，你能不能学会在那个亮度下观看，而不是别开视线，直到证据到来。</p>$body$,
  '如果看不见，它就没有发生吗？ | ONE EIGHT Journal',
  $ex$一座中毒的意大利城市，那里有些伤害清清楚楚积在墓碑上，有些却从不现身——而这件事改变了我们如何判定什么是真的$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- ko
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'if-you-cannot-see-it')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'ko',
  '보이지 않으면, 일어나지 않은 것인가',
  $ex$어떤 피해는 묘비 위에 뚜렷이 쌓이고 어떤 피해는 끝내 드러나지 않는, 독에 잠긴 이탈리아의 한 도시 — 그리고 그것이 우리가 무엇을 현실로 인정하는지를 어떻게 흔드는가$ex$,
  $body$<p>우리는 눈에 보이는 것을 믿는다. 사진 한 장이 논쟁을 끝낸다. 내보이면, 그것은 현실이다. 누구도 선명한 이미지를 내놓지 못하면 의심이 스며든다 — 어쩌면 일어나지 않은 것 아닐까, 말만큼 심하지는 않은 것 아닐까. 우리는 보인다는 것을 현실의 시험대로 삼는다. 대개는 그러고 있다는 것조차 알아차리지 못한 채로.</p>
<p>그 시험대가 타란토에서 무너진다. 이탈리아 남부 해안, 유럽 최대 제철소의 그늘에 있는 도시다. 한때 ILVA라 불렸고 지금은 아르셀로미탈이 된 그 공장은 옛 시가지의 두 배를 덮을 만큼 크다. 약 20만 명이 그 곁에서 살고, 노동자들의 동네인 탐부리가 가장 가까이 붙어 가장 많이 뒤집어쓴다. 피해의 일부는 뚜렷이 보인다. 주민들이 미네랄레라 부르는, 납과 카드뮴과 비소가 섞인 옅은 분홍빛 철광석 먼지가 피부에, 창턱에, 공장 옆 묘지의 무덤들 위에 내려앉는다 — 그중 한 구역은 아예 공장 이름을 따 조나 일바라고 불린다. 먼지는 색까지 바뀐다. 회색에서 주황으로, 다시 그을린 듯한 황토색으로. 얼마나 풍화되었느냐에 따라. '바람 부는 날'이면 먼지가 날려 학교가 문을 닫는다. 그러나 가장 무거운 피해를 입히는 것, 가장 높은 굴뚝에서 나오는 다이옥신은 무색이고, 보이지 않은 채 더 부유한 교외까지 흘러간다.</p>
<p>그러니 피해는 카메라 앞에 가만히 있어 주지 않는다. 먼지는 찍을 수 있다. 다이옥신은 찍을 수 없다. 죽음은 실재한다 — 암도, 심장병도, 잃어버린 임신도 더 많아졌다 — 그러나 평범한 삶으로 넘어갈 만큼 느리고, 이 죽음이 저 굴뚝에서 왔다는 것을 사진 한 장이 증명해 주지는 않는다. 무덤 파는 이들은 그 먼지를 가까이서 안다. 밀가루 같다고, 땅속에서 빛난다고, 눈과 입에 들러붙는다고 말한다. 그중 한 사람은 사인(死因)을 공책에 적어 나갔고, 그렇게 묘지는 공장이 하고 있는 일의 장부가 되었다. 여러 해 전, 야간 경비들은 자신들이 깨어 있음을 증명하려고 두 시간마다 부지를 촬영했고, 플래시는 반짝이는 먼지를 붙잡았다 — 수천 장의 사진이 되었다. 그중 어느 것도 법정에서 증거로 버티지 못했다.</p>
<p>정화 작업 — 보니피카 — 조차 피해를 깜박이게 만든다. 오염된 흙을 걷어 내려면 마을은 자기네 죽은 이들을 파내야 한다. 유가족은 수십 년 된 무덤을 다시 열고 두 번째 매장 비용을 치르거나, 아니면 유해를 공동 구덩이에 내주라는 통보를 받는다. 마을이 아기들을 묻는 구역인 천사들의 뜰에서, 한 부부가 아들이 오십이 년 동안 누워 있던 무덤을 다시 열었다 — 그리고 아무것도 남아 있지 않았다. 또 다른 어머니 마리안젤라는 오염 때문에 사산했다고 말하는 어린 아들을 잃었다. 오염은 그것을 걷어 내는 바로 그 행위 속에서 다시 보이게 된다. 그리고 그것이 남기는 질문은 뒤가 아니라 앞을 향한다 — 당신의 아이들에게 물려줄 것이 무엇이 남아 있는가?</p>
<p>이 노동자들과 그들의 사진 사이에서 시간을 보낸 Jasmine Pisapia는 이 상태에 이름을 붙인다. 깜박임이다. 피해는 끝내 보이지 않는 채로 있지도 않고, 온전히 시야에 들어오지도 않는다. 깜박인다 — 나타났다가, 사라졌다가, 다시 나타난다. 타란토에서 찍힌 사진 한 장은 사안을 매듭짓는 증거가 아니다. 독이 반쯤 모습을 드러내는 그 순간을 붙잡았다가, 다시 놓친다.</p>
<p>그럼에도 그것을 찍게 만드는 끌림이 있다. 공장과 무덤을 찍어 Visions of Taranto라는 연작으로 묶은 퍼포먼스 예술가 이자벨라 몬젤리는, 카메라를 독을 자기 바깥으로 내보내는 방법이라고 말했다 — 뱉어 내면, 잠깐이나마 그것은 더 이상 당신의 일부가 아니다. 그것은 결코 바깥에 머물러 있지 않는다. 렌즈가 밀어낸 것은 다음 바람에 다시 실려 온다.</p>
<p>이것은 보는 방식만의 문제가 아니다. 법정에서도 시험되었다. 제철소는 이탈리아인들이 암비엔테 스벤두토 — '희생된 환경' — 라 부른 재판에 넘겨졌다. 경영진은 2021년에 유죄 판결을 받았고, 그 판결은 2024년 항소심에서 뒤집혔다. 어려움은 묘지 사진들이 부딪힌 것과 같다. 20만 개의 몸과 수십 년에 걸쳐 퍼진 피해는, 증명이 요구하는 한 장의 선명한 이미지로도, 이 원인에서 저 죽음으로 이어지는 깔끔한 선으로도 정리되지 않는다. 사람을 지키라고 만들어진 기준은, 가만히 있어 주는 피해를 위해 만들어져 있다.</p>
<p>여기서 우리가 출발점으로 삼았던 반사가 뒤집힌다. 우리는 '보이지 않는다, 증명할 수 없다'를 '아마 실재하지 않는다'로 다루고 있었다. 타란토는 그 반대를 말한다. 피해는 실재하고, 그것이 이미지 속에 가만히 있기를 거부하는 것은 피해의 결함이 아니다 — 이런 종류의 피해란 원래 그런 것이다. 가장 심각한 것들 가운데 일부는 결코 선명한 그림으로 도착하지 않는다. 깜박임으로 도착한다. 어느 날 알아차렸다가 다음 날 잊는 먼지로, 절반만 보이는 위험으로, 그 결과에 붙들어 맬 수 없는 원인으로.</p>
<p>바뀌는 것은 당신 자신의 반사다. 다음번에 무언가가 깔끔한 이미지로도, 원인에서 결과로 이어지는 입증된 선으로도 정리되지 않을 때. 본능은 그것을 '아직 입증되지 않음'으로 분류해 두고 그림이 또렷해지기를 기다리는 것이다. 타란토는 그림을 기다리는 일 자체가 위험이 되는 곳이다. 어떤 것들은 끝까지 깜박이기만 할 것이다 — 그리고 문제는, 증거가 올 때까지 눈을 돌리는 대신, 그 밝기에서 보는 법을 당신이 익힐 수 있느냐다.</p>$body$,
  '보이지 않으면, 일어나지 않은 것인가 | ONE EIGHT Journal',
  $ex$어떤 피해는 묘비 위에 뚜렷이 쌓이고 어떤 피해는 끝내 드러나지 않는, 독에 잠긴 이탈리아의 한 도시 — 그리고 그것이 우리가 무엇을 현실로 인정하는지를 어떻게 흔드는가$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- es
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'if-you-cannot-see-it')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'es',
  'Si no puedes verlo, ¿está ocurriendo?',
  $ex$Una ciudad italiana envenenada donde parte del daño se posa a la vista sobre las lápidas y parte no se muestra nunca — y lo que eso le hace a nuestra manera de decidir qué es real$ex$,
  $body$<p>Confiamos en lo que podemos ver. Una fotografía zanja una discusión; muestra la cosa y es real. Cuando nadie puede aportar una imagen clara, se cuela la duda: quizá no está ocurriendo, o no es tan grave como se dice. Usamos la visibilidad como prueba de la realidad, casi siempre sin darnos cuenta de que lo hacemos.</p>
<p>Esa prueba se rompe en Taranto, en la costa sur de Italia, a la sombra de la mayor acería de Europa: la planta que antes se llamaba ILVA y ahora es ArcelorMittal, tan grande como para cubrir dos veces el casco antiguo. Unas 200.000 personas viven a su lado, y el barrio obrero, Tamburi, es el más cercano y el que más recibe. Parte del daño se ve con claridad: un polvo de mineral de hierro, de un rosa tenue, que los vecinos llaman minerale, con plomo, cadmio y arsénico, que se posa en la piel, en los alféizares, en las tumbas del cementerio contiguo a la planta —una sección incluso se llama Zona Ilva, por la fábrica—. El polvo hasta cambia de color —gris, luego naranja, luego un ocre quemado—, según cómo se haya curtido a la intemperie. En los "días de viento", las escuelas cierran porque el polvo está soplando. Pero la parte que causa el daño más grave, la dioxina de la chimenea más alta, es incolora, y llega sin verse incluso a los barrios más acomodados.</p>
<p>Así que el daño no se queda quieto para una cámara. El polvo se puede fotografiar; la dioxina no. Las muertes son reales —más casos de cáncer, de enfermedades del corazón, de embarazos perdidos—, pero lo bastante lentas como para pasar por vida corriente, y ninguna fotografía prueba que esta muerte viniera de aquella chimenea. Los sepultureros conocen el polvo de cerca: lo describen como harina, brillando en la tierra, metiéndose en los ojos y en la boca. Uno de ellos llevaba un cuaderno con las causas de muerte, y convertía el cementerio en un libro de cuentas de lo que la planta estaba haciendo. Hace años, los vigilantes nocturnos fotografiaban el recinto cada dos horas para demostrar que estaban despiertos, y el flash atrapaba el polvo destellando: miles de imágenes. Ninguna se sostuvo como prueba ante un tribunal.</p>
<p>Incluso la limpieza —la bonifica— hace parpadear el daño. Para sacar la tierra envenenada, el pueblo tiene que desenterrar a sus muertos: a las familias se les dice que reabran tumbas de hace décadas y paguen un segundo entierro, o que pierdan los restos en una fosa común. En el campo de los ángeles, la sección donde el pueblo entierra a sus bebés, una pareja reabrió la tumba en la que su hijo llevaba cincuenta y dos años, y no quedaba nada de él. Otra madre, Mariangela, perdió a un hijo pequeño que, según ella, nació muerto por la contaminación. La contaminación vuelve a hacerse visible en el acto mismo de retirarla, y la pregunta que deja apunta hacia adelante, no hacia atrás: ¿qué queda para dejarles a tus hijos?</p>
<p>Jasmine Pisapia, que pasó tiempo entre estos trabajadores y sus fotos, le pone nombre a esa condición: parpadeo. El daño nunca permanece invisible, y nunca llega a verse del todo. Parpadea: está, desaparece, vuelve a estar. Una fotografía de Taranto no es una prueba que zanje el asunto. Atrapa el veneno en el instante en que se muestra a medias, y lo vuelve a perder.</p>
<p>Aun así, hay un tirón que empuja a fotografiarlo. La artista de performance Isabella Mongelli, que retrató la fábrica y las tumbas para una serie que llamó Visions of Taranto, describió la cámara como una forma de poner el veneno fuera de sí misma: expulsarlo y, por un momento, dejar de tenerlo dentro. Nunca se queda fuera. Lo que la lente aparta vuelve con el siguiente viento.</p>
<p>Esto no es solo una manera de mirar; también se ha puesto a prueba en los tribunales. La acería fue juzgada en el caso que los italianos llamaron Ambiente Svenduto, "Ambiente sacrificado". Varios directivos fueron condenados en 2021; las condenas se anularon en apelación en 2024. La dificultad es la misma con la que chocaron las fotografías del cementerio: un daño repartido entre 200.000 cuerpos y varias décadas no se resuelve en la imagen única y clara, ni en la línea limpia de esta causa a aquella muerte, que exige la prueba. El estándar pensado para proteger a la gente está hecho para un daño que se queda quieto.</p>
<p>Aquí se da la vuelta el reflejo del principio. Tratábamos "no se ve, no se puede probar" como "seguramente no es real". Taranto dice lo contrario. El daño es real, y que se niegue a quedarse quieto en una imagen no es un defecto del daño: así es este tipo de daño. Algunas de las cosas más graves no llegan nunca como una imagen clara. Llegan como un parpadeo: un polvo que adviertes un día y olvidas al siguiente, un riesgo que ves a medias, una causa que no consigues sujetar a su efecto.</p>
<p>Lo que cambia es tu propio reflejo, la próxima vez que algo no se resuelva en una imagen limpia ni en una línea probada de causa a efecto. El instinto es archivarlo como "todavía no probado" y esperar a que la imagen se afine. Taranto es un lugar donde esperar la imagen es en sí mismo el peligro. Algunas cosas solo van a parpadear, siempre — y la cuestión es si puedes aprender a ver con esa luz, en vez de apartar la mirada hasta que llegue la prueba.</p>$body$,
  'Si no puedes verlo, ¿está ocurriendo? | ONE EIGHT Journal',
  $ex$Una ciudad italiana envenenada donde parte del daño se posa a la vista sobre las lápidas y parte no se muestra nunca — y lo que eso le hace a nuestra manera de decidir qué es real$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- pt-BR
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'if-you-cannot-see-it')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'pt-BR',
  'Se você não consegue ver, está acontecendo?',
  $ex$Uma cidade italiana envenenada onde parte do dano se assenta à vista sobre as lápides e parte nunca aparece — e o que isso faz com o modo como decidimos o que é real$ex$,
  $body$<p>Confiamos no que conseguimos ver. Uma fotografia encerra uma discussão; mostre a coisa e ela é real. Quando ninguém consegue apresentar uma imagem nítida, a dúvida se infiltra — talvez não esteja acontecendo, ou não seja tão grave quanto dizem. Usamos a visibilidade como teste da realidade, quase sempre sem perceber que fazemos isso.</p>
<p>Esse teste se quebra em Taranto, no litoral sul da Itália, à sombra da maior siderúrgica da Europa — a usina que já se chamou ILVA e hoje é ArcelorMittal, grande o bastante para cobrir duas vezes a cidade velha. Cerca de 200 mil pessoas vivem ao lado dela, e o bairro operário, Tamburi, é o mais próximo e o que mais recebe. Parte do dano é claramente visível: um pó de minério de ferro, de um rosa desbotado, que os moradores chamam de minerale, com chumbo, cádmio e arsênico, que se assenta na pele, nos peitoris das janelas, nos túmulos do cemitério vizinho à usina — uma seção chega a se chamar Zona Ilva, por causa da fábrica. O pó até muda de cor — cinza, depois laranja, depois um ocre queimado —, conforme o tempo que passou exposto. Nos "dias de vento", as escolas fecham porque o pó está soprando. Mas a parte que causa o dano mais grave, a dioxina da chaminé mais alta, é incolor, e chega sem ser vista até os subúrbios mais ricos.</p>
<p>Então o dano não fica parado para uma câmera. O pó dá para fotografar; a dioxina, não. As mortes são reais — mais casos de câncer, de doenças do coração, de gestações perdidas —, mas lentas o bastante para passar por vida comum, e nenhuma fotografia isolada prova que esta morte veio daquela chaminé. Os coveiros conhecem o pó de perto: descrevem-no como farinha, brilhando na terra, entrando nos olhos e na boca. Um deles mantinha um caderno com as causas de morte, transformando o cemitério num livro de registros do que a usina estava fazendo. Anos atrás, os vigias noturnos fotografavam o terreno a cada duas horas para provar que estavam acordados, e o flash pegava o pó cintilando — milhares de imagens. Nenhuma delas se sustentou como prova no tribunal.</p>
<p>Até a limpeza — a bonifica — faz o dano piscar. Para retirar o solo envenenado, a cidade precisa desenterrar seus mortos: as famílias são avisadas de que devem reabrir túmulos de décadas atrás e pagar por um segundo sepultamento, ou perder os restos para uma vala comum. No campo dos anjos, a seção onde a cidade enterra seus bebês, um casal reabriu o túmulo em que o filho jazia havia cinquenta e dois anos — e não restava nada dele. Outra mãe, Mariangela, perdeu um filho pequeno que, segundo ela, nasceu morto por causa da poluição. A contaminação volta a ficar visível no próprio ato de removê-la, e a pergunta que ela deixa aponta para a frente, não para trás — o que sobra para deixar aos seus filhos?</p>
<p>Jasmine Pisapia, que passou um tempo entre esses trabalhadores e suas fotos, dá um nome a essa condição: cintilação. O dano nunca permanece invisível, e nunca entra inteiramente em cena. Ele pisca — está, some, está de novo. Uma fotografia de Taranto não é a prova que resolve a questão. Ela pega o veneno no instante em que ele se mostra pela metade, e o perde outra vez.</p>
<p>Ainda assim, há um puxão que leva a fotografar mesmo assim. A artista performática Isabella Mongelli, que fotografou a fábrica e os túmulos para uma série que chamou de Visions of Taranto, descreveu a câmera como um jeito de colocar o veneno para fora de si — expulsá-lo e, por um momento, ele já não é parte de você. Ele nunca fica do lado de fora. O que a lente afasta volta com o vento seguinte.</p>
<p>Isso não é apenas um modo de ver; já foi testado no tribunal. A siderúrgica foi a julgamento no caso que os italianos chamaram de Ambiente Svenduto — "ambiente sacrificado". Executivos foram condenados em 2021; as condenações foram anuladas em recurso em 2024. A dificuldade é a mesma em que esbarraram as fotos do cemitério: um dano espalhado por 200 mil corpos e várias décadas não se resolve na imagem única e nítida, nem na linha limpa desta causa até aquela morte, que a prova exige. O padrão feito para proteger as pessoas foi construído para um dano que fica parado.</p>
<p>Aqui o reflexo do começo se inverte. Estávamos tratando "não dá para ver, não dá para provar" como "provavelmente não é real". Taranto diz o contrário. O dano é real, e sua recusa em ficar parado numa imagem não é um defeito do dano — é assim que esse tipo de dano é. Algumas das coisas mais graves nunca chegam como uma imagem nítida. Chegam como uma cintilação: um pó que você nota um dia e esquece no outro, um risco que você vê pela metade, uma causa que você não consegue prender ao seu efeito.</p>
<p>O que muda é o seu próprio reflexo, na próxima vez que algo não se resolver numa imagem limpa nem numa linha comprovada de causa e efeito. O instinto é arquivar aquilo como "ainda não provado" e esperar a imagem ficar nítida. Taranto é um lugar onde esperar pela imagem é, ele mesmo, o perigo. Algumas coisas só vão cintilar, sempre — e a questão é se você consegue aprender a enxergar nesse ajuste, em vez de desviar o olhar até a prova chegar.</p>$body$,
  'Se você não consegue ver, está acontecendo? | ONE EIGHT Journal',
  $ex$Uma cidade italiana envenenada onde parte do dano se assenta à vista sobre as lápides e parte nunca aparece — e o que isso faz com o modo como decidimos o que é real$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- de
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'if-you-cannot-see-it')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'de',
  'Wenn man es nicht sehen kann, geschieht es dann?',
  $ex$Eine vergiftete italienische Stadt, in der ein Teil des Schadens sichtbar auf den Grabsteinen liegt und ein Teil sich nie zeigt — und was das damit macht, wie wir entscheiden, was wirklich ist$ex$,
  $body$<p>Wir vertrauen dem, was wir sehen können. Ein Foto beendet einen Streit; zeig die Sache, und sie ist wirklich. Wenn niemand ein klares Bild vorlegen kann, schleicht sich der Zweifel ein — vielleicht geschieht es gar nicht, oder es ist nicht so schlimm wie behauptet. Wir benutzen Sichtbarkeit als Prüfstein der Wirklichkeit, meist ohne zu merken, dass wir es tun.</p>
<p>Dieser Prüfstein zerbricht in Taranto, an Italiens Südküste, im Schatten des größten Stahlwerks Europas — der Anlage, die früher ILVA hieß und heute ArcelorMittal gehört, groß genug, um die Altstadt zweimal zu bedecken. Rund 200.000 Menschen leben daneben, und das Arbeiterviertel Tamburi liegt am nächsten und bekommt am meisten ab. Ein Teil des Schadens ist deutlich sichtbar: ein blassrosa Eisenerzstaub, den die Leute hier minerale nennen, versetzt mit Blei, Cadmium und Arsen, der sich auf Haut, auf Fensterbänken und auf den Gräbern des Friedhofs neben dem Werk absetzt — ein Abschnitt heißt sogar Zona Ilva, nach der Fabrik. Der Staub wechselt sogar die Farbe — grau, dann orange, dann ein gebranntes Ocker —, je nachdem, wie lange er der Witterung ausgesetzt war. An "Windtagen" bleiben die Schulen geschlossen, weil der Staub weht. Doch der Teil, der den schwersten Schaden anrichtet, das Dioxin aus dem höchsten Schornstein, ist farblos und zieht ungesehen bis in die wohlhabenderen Vororte.</p>
<p>Der Schaden hält also für eine Kamera nicht still. Den Staub kann man fotografieren, das Dioxin nicht. Die Toten sind wirklich — mehr Krebserkrankungen, mehr Herzkrankheiten, mehr verlorene Schwangerschaften —, aber langsam genug, um als gewöhnliches Leben durchzugehen, und kein einzelnes Foto beweist, dass dieser Tod von jenem Schornstein kam. Die Totengräber kennen den Staub aus nächster Nähe: Sie beschreiben ihn wie Mehl, das im Boden glänzt und sich in Augen und Mund setzt. Einer von ihnen führte ein Heft mit den Todesursachen und machte den Friedhof so zu einem Kontobuch dessen, was das Werk anrichtete. Vor Jahren fotografierten die Nachtwächter das Gelände alle zwei Stunden, um zu belegen, dass sie wach waren, und der Blitz fing den glitzernden Staub ein — Tausende von Aufnahmen. Keine davon hielt vor Gericht als Beweis stand.</p>
<p>Selbst die Sanierung — die bonifica — lässt den Schaden flackern. Um den vergifteten Boden herauszuholen, muss die Stadt ihre Toten ausgraben: Familien wird gesagt, sie sollen jahrzehntealte Gräber wieder öffnen und eine zweite Bestattung bezahlen, sonst gehen die Überreste in ein Sammelgrab. Auf dem Feld der Engel, dem Abschnitt, in dem die Stadt ihre Säuglinge bestattet, öffnete ein Paar das Grab, in dem ihr Sohn zweiundfünfzig Jahre gelegen hatte — und fand nichts mehr von ihm. Eine andere Mutter, Mariangela, verlor einen kleinen Sohn, der nach ihren Worten wegen der Verschmutzung tot geboren wurde. Die Verseuchung wird ausgerechnet in dem Akt wieder sichtbar, mit dem man sie beseitigt, und die Frage, die sie hinterlässt, weist nach vorn, nicht zurück — was bleibt noch, das man seinen Kindern weitergeben kann?</p>
<p>Jasmine Pisapia, die Zeit unter diesen Arbeitern und ihren Bildern verbracht hat, gibt diesem Zustand einen Namen: Flackern. Der Schaden bleibt nie unsichtbar, und er tritt nie ganz in den Blick. Er flackert — da, weg, wieder da. Ein Foto aus Taranto ist kein Beweis, der die Sache klärt. Es erwischt das Gift in dem Moment, in dem es sich halb zeigt, und verliert es wieder.</p>
<p>Es gibt trotzdem einen Sog, es doch zu fotografieren. Die Performancekünstlerin Isabella Mongelli, die die Fabrik und die Gräber für eine Serie namens Visions of Taranto aufnahm, beschrieb die Kamera als eine Möglichkeit, das Gift aus sich heraus nach draußen zu setzen — es auszustoßen, und für einen Moment ist es nicht mehr ein Teil von einem. Draußen bleibt es nie. Was die Linse wegschiebt, treibt mit dem nächsten Wind zurück.</p>
<p>Das ist nicht nur eine Art zu sehen; es wurde auch vor Gericht erprobt. Das Stahlwerk stand in dem Verfahren vor Gericht, das die Italiener Ambiente Svenduto nannten — "geopferte Umwelt". Führungskräfte wurden 2021 verurteilt; die Urteile wurden 2024 in der Berufung aufgehoben. Die Schwierigkeit ist dieselbe, an die auch die Friedhofsfotos stießen: Ein Schaden, der sich über 200.000 Körper und mehrere Jahrzehnte verteilt, löst sich nicht in das eine klare Bild auf, auch nicht in die saubere Linie von dieser Ursache zu jenem Tod, die ein Beweis verlangt. Der Maßstab, der Menschen schützen soll, ist für Schäden gebaut, die stillhalten.</p>
<p>Hier kippt der Reflex, mit dem wir begonnen haben. Wir behandelten "nicht sichtbar, nicht beweisbar" als "wahrscheinlich nicht wirklich". Taranto sagt das Gegenteil. Der Schaden ist wirklich, und dass er sich weigert, in einem Bild stillzuhalten, ist kein Mangel des Schadens — so ist diese Art von Schaden nun einmal. Manches vom Schwerwiegendsten kommt nie als klares Bild an. Es kommt als Flackern: ein Staub, den man an einem Tag bemerkt und am nächsten vergisst, ein Risiko, das man nur halb sieht, eine Ursache, die man nicht an ihre Wirkung heften kann.</p>
<p>Was sich ändert, ist der eigene Reflex — beim nächsten Mal, wenn sich etwas weder zu einem sauberen Bild noch zu einer bewiesenen Linie von Ursache zu Wirkung fügt. Der Impuls ist, es unter "noch nicht bewiesen" abzulegen und zu warten, bis das Bild schärfer wird. Taranto ist ein Ort, an dem das Warten auf das Bild selbst die Gefahr ist. Manches wird immer nur flackern — und die Frage ist, ob man lernen kann, bei dieser Einstellung zu sehen, statt wegzuschauen, bis der Beweis eintrifft.</p>$body$,
  'Wenn man es nicht sehen kann, geschieht es dann? | ONE EIGHT Journal',
  $ex$Eine vergiftete italienische Stadt, in der ein Teil des Schadens sichtbar auf den Grabsteinen liegt und ein Teil sich nie zeigt — und was das damit macht, wie wir entscheiden, was wirklich ist$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- fr
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'if-you-cannot-see-it')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'fr',
  'Si on ne peut pas le voir, est-ce que cela a lieu ?',
  $ex$Une ville italienne empoisonnée où une part du mal se dépose bien en vue sur les pierres tombales et où une autre ne se montre jamais — et ce que cela fait à notre façon de décider ce qui est réel$ex$,
  $body$<p>Nous nous fions à ce que nous pouvons voir. Une photographie clôt une discussion ; montrez la chose et elle est réelle. Quand personne ne peut produire d'image nette, le doute s'insinue — peut-être que cela n'a pas lieu, ou que ce n'est pas si grave qu'on le dit. Nous prenons la visibilité pour l'épreuve du réel, le plus souvent sans nous apercevoir que nous le faisons.</p>
<p>Cette épreuve se brise à Taranto, sur la côte sud de l'Italie, à l'ombre de la plus grande aciérie d'Europe — l'usine autrefois appelée ILVA, aujourd'hui ArcelorMittal, assez vaste pour couvrir deux fois la vieille ville. Environ 200 000 personnes vivent à côté, et le quartier ouvrier, Tamburi, est le plus proche et celui qui prend le plus. Une part du mal est parfaitement visible : une poussière de minerai de fer, d'un rose pâle, que les habitants appellent minerale, mêlée de plomb, de cadmium et d'arsenic, qui se dépose sur la peau, sur les rebords de fenêtre, sur les tombes du cimetière voisin de l'usine — une section porte même le nom de Zona Ilva, d'après la fabrique. La poussière change jusqu'à sa couleur — grise, puis orange, puis un ocre brûlé — selon la façon dont elle a vieilli à l'air. Les "jours de vent", les écoles ferment parce que la poussière vole. Mais la part qui fait le mal le plus grave, la dioxine de la plus haute cheminée, est incolore, et dérive sans être vue jusqu'aux banlieues plus aisées.</p>
<p>Le mal ne tient donc pas en place devant un appareil photo. La poussière, on peut la photographier ; la dioxine, non. Les morts sont réelles — davantage de cancers, de maladies du cœur, de grossesses perdues — mais assez lentes pour passer pour la vie ordinaire, et aucune photographie ne prouve à elle seule que cette mort-là est venue de cette cheminée-là. Les fossoyeurs connaissent la poussière de près : ils la décrivent comme de la farine, brillant dans la terre, s'accrochant aux yeux et à la bouche. L'un d'eux tenait un carnet des causes de décès, faisant du cimetière un registre de ce que l'usine était en train de faire. Il y a des années, les gardiens de nuit photographiaient le site toutes les deux heures pour prouver qu'ils étaient éveillés, et le flash saisissait la poussière qui scintillait — des milliers d'images. Aucune n'a tenu comme preuve devant le tribunal.</p>
<p>Même la dépollution — la bonifica — fait clignoter le mal. Pour retirer la terre empoisonnée, la ville doit déterrer ses morts : on demande aux familles de rouvrir des tombes vieilles de plusieurs décennies et de payer une seconde inhumation, faute de quoi les restes iront dans une fosse commune. Dans le champ des anges, la section où la ville enterre ses nourrissons, un couple a rouvert la tombe où leur fils reposait depuis cinquante-deux ans — et il ne restait rien de lui. Une autre mère, Mariangela, a perdu un fils en bas âge qui, dit-elle, est né sans vie à cause de la pollution. La contamination redevient visible dans le geste même qui l'enlève, et la question qu'elle laisse regarde vers l'avant, non vers l'arrière — que reste-t-il à transmettre à ses enfants ?</p>
<p>Jasmine Pisapia, qui a passé du temps parmi ces ouvriers et leurs images, donne un nom à cet état : le scintillement. Le mal ne reste jamais invisible, et il n'entre jamais pleinement dans le champ. Il clignote — présent, puis absent, puis présent. Une photographie prise à Taranto n'est pas une preuve qui règle l'affaire. Elle attrape le poison à l'instant où il se montre à moitié, et le reperd.</p>
<p>Il y a malgré tout une force qui pousse à le photographier. La performeuse Isabella Mongelli, qui a photographié l'usine et les tombes pour une série qu'elle a appelée Visions of Taranto, décrivait l'appareil comme un moyen de mettre le poison hors d'elle — l'expulser, et l'espace d'un instant il ne fait plus partie de vous. Il ne reste jamais dehors. Ce que l'objectif repousse revient avec le vent suivant.</p>
<p>Ce n'est pas seulement une manière de voir ; cela a été éprouvé au tribunal. L'aciérie a été jugée dans l'affaire que les Italiens ont appelée Ambiente Svenduto — "environnement sacrifié". Des dirigeants ont été condamnés en 2021 ; les condamnations ont été annulées en appel en 2024. La difficulté est celle-là même sur laquelle ont buté les photographies du cimetière : un mal réparti sur 200 000 corps et plusieurs décennies ne se résout pas en l'image unique et nette, ni en la ligne propre allant de cette cause à cette mort, qu'exige la preuve. La norme censée protéger les gens est faite pour un mal qui tient en place.</p>
<p>Ici, le réflexe du début se retourne. Nous traitions "on ne le voit pas, on ne peut pas le prouver" comme "ce n'est probablement pas réel". Taranto dit l'inverse. Le mal est réel, et son refus de tenir en place dans une image n'est pas un défaut du mal — c'est ainsi qu'est ce genre de mal. Certaines des choses les plus graves n'arrivent jamais sous la forme d'une image nette. Elles arrivent comme un scintillement : une poussière qu'on remarque un jour et qu'on oublie le lendemain, un risque qu'on ne voit qu'à moitié, une cause qu'on n'arrive pas à attacher à son effet.</p>
<p>Ce qui change, c'est votre propre réflexe, la prochaine fois que quelque chose refusera de se résoudre en une image nette ou en une ligne prouvée de la cause à l'effet. L'instinct est de classer cela sous "pas encore prouvé" et d'attendre que l'image se précise. Taranto est un endroit où attendre l'image est en soi le danger. Certaines choses ne feront jamais que scintiller — et la question est de savoir si l'on peut apprendre à voir à cette intensité, au lieu de détourner le regard jusqu'à ce que la preuve arrive.</p>$body$,
  'Si on ne peut pas le voir, est-ce que cela a lieu ? | ONE EIGHT Journal',
  $ex$Une ville italienne empoisonnée où une part du mal se dépose bien en vue sur les pierres tombales et où une autre ne se montre jamais — et ce que cela fait à notre façon de décider ce qui est réel$ex$,
  false
FROM art
ON CONFLICT (article_id, lang) DO UPDATE
  SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt, body_html=EXCLUDED.body_html,
      meta_title=EXCLUDED.meta_title, meta_description=EXCLUDED.meta_description,
      is_primary=EXCLUDED.is_primary, updated_at=now();

-- it
WITH art AS (SELECT id FROM public.journal_articles WHERE slug = 'if-you-cannot-see-it')
INSERT INTO public.journal_article_translations (article_id, lang, title, excerpt, body_html, meta_title, meta_description, is_primary)
SELECT art.id, 'it',
  'Se non riesci a vederlo, sta accadendo?',
  $ex$Una città italiana avvelenata dove una parte del danno si posa bene in vista sulle lapidi e una parte non si mostra mai — e che cosa questo fa al modo in cui decidiamo che cosa è reale$ex$,
  $body$<p>Ci fidiamo di ciò che riusciamo a vedere. Una fotografia chiude una discussione; mostra la cosa ed è reale. Quando nessuno riesce a produrre un'immagine nitida, il dubbio si insinua: forse non sta accadendo, o non è grave quanto si dice. Usiamo la visibilità come prova della realtà, quasi sempre senza accorgerci di farlo.</p>
<p>Quella prova si rompe a Taranto, sulla costa meridionale d'Italia, all'ombra della più grande acciaieria d'Europa: lo stabilimento un tempo chiamato ILVA, oggi ArcelorMittal, abbastanza grande da coprire due volte la città vecchia. Circa 200.000 persone vivono accanto, e il quartiere operaio, Tamburi, è il più vicino e quello che ne prende di più. Una parte del danno è chiaramente visibile: una polvere di minerale di ferro, di un rosa tenue, che qui chiamano minerale, con dentro piombo, cadmio e arsenico, che si posa sulla pelle, sui davanzali, sulle tombe del cimitero accanto all'impianto — una sezione si chiama perfino Zona Ilva, dal nome della fabbrica. La polvere cambia persino colore — grigia, poi arancione, poi un ocra bruciato — a seconda di quanto è stata esposta alle intemperie. Nei "giorni di vento" le scuole chiudono perché la polvere sta soffiando. Ma la parte che fa il danno più grave, la diossina che esce dal camino più alto, è incolore, e arriva senza farsi vedere fin nei quartieri più agiati.</p>
<p>Il danno, dunque, non sta fermo per una macchina fotografica. La polvere la puoi fotografare; la diossina no. Le morti sono reali — più tumori, più malattie del cuore, più gravidanze perdute — ma abbastanza lente da passare per vita ordinaria, e nessuna singola fotografia dimostra che questa morte sia venuta da quel camino. I becchini conoscono la polvere da vicino: la descrivono come farina, che luccica nella terra, che entra negli occhi e in bocca. Uno di loro teneva un quaderno con le cause di morte, trasformando il cimitero in un registro di quello che l'impianto stava facendo. Anni fa i custodi notturni fotografavano l'area ogni due ore per dimostrare di essere svegli, e il flash coglieva la polvere che brillava: migliaia di immagini. Nessuna ha retto come prova in tribunale.</p>
<p>Perfino la bonifica fa lampeggiare il danno. Per portare via il terreno avvelenato, la città deve dissotterrare i propri morti: alle famiglie viene detto di riaprire tombe vecchie di decenni e di pagare una seconda sepoltura, oppure di perdere i resti in una fossa comune. Nel campo degli angeli, la sezione dove la città seppellisce i suoi bambini, una coppia ha riaperto la tomba in cui il figlio giaceva da cinquantadue anni — e di lui non era rimasto nulla. Un'altra madre, Mariangela, ha perso un figlio piccolo che, dice, è nato morto a causa dell'inquinamento. La contaminazione torna visibile proprio nell'atto di rimuoverla, e la domanda che lascia guarda avanti, non indietro: che cosa resta da lasciare ai propri figli?</p>
<p>Jasmine Pisapia, che ha passato del tempo tra questi lavoratori e le loro immagini, dà un nome a questa condizione: intermittenza. Il danno non resta mai invisibile, e non entra mai del tutto nel campo visivo. Lampeggia: c'è, sparisce, c'è di nuovo. Una fotografia scattata a Taranto non è una prova che chiude la questione. Coglie il veleno nell'istante in cui si mostra a metà, e lo perde di nuovo.</p>
<p>C'è comunque una spinta a fotografarlo lo stesso. L'artista performativa Isabella Mongelli, che ha ripreso la fabbrica e le tombe per una serie intitolata Visions of Taranto, ha descritto la macchina fotografica come un modo per mettere il veleno fuori di sé: espellerlo e, per un momento, non averlo più addosso. Fuori non ci resta mai. Ciò che l'obiettivo allontana torna con il vento successivo.</p>
<p>Non è soltanto un modo di vedere; è stato messo alla prova anche in tribunale. L'acciaieria è finita sotto processo nel caso che gli italiani hanno chiamato Ambiente Svenduto — "ambiente sacrificato". Alcuni dirigenti sono stati condannati nel 2021; le condanne sono state annullate in appello nel 2024. La difficoltà è la stessa contro cui hanno sbattuto le fotografie del cimitero: un danno distribuito su 200.000 corpi e diversi decenni non si risolve nell'unica immagine nitida, né nella linea pulita da questa causa a quella morte, che la prova pretende. Lo standard pensato per proteggere le persone è costruito per un danno che sta fermo.</p>
<p>Qui il riflesso da cui siamo partiti si rovescia. Trattavamo "non si vede, non si può provare" come "probabilmente non è reale". Taranto dice il contrario. Il danno è reale, e il suo rifiuto di stare fermo dentro un'immagine non è un difetto del danno: questo tipo di danno è fatto così. Alcune delle cose più gravi non arrivano mai come un'immagine nitida. Arrivano come un'intermittenza: una polvere che noti un giorno e dimentichi il giorno dopo, un rischio che vedi a metà, una causa che non riesci ad agganciare al suo effetto.</p>
<p>Quello che cambia è il tuo stesso riflesso, la prossima volta che qualcosa non si risolverà in un'immagine pulita o in una linea dimostrata dalla causa all'effetto. L'istinto è archiviarlo sotto "non ancora provato" e aspettare che l'immagine si faccia più nitida. Taranto è un luogo in cui aspettare l'immagine è essa stessa il pericolo. Certe cose non faranno altro che lampeggiare — e la domanda è se sai imparare a vedere a quella intensità, invece di distogliere lo sguardo finché non arriva la prova.</p>$body$,
  'Se non riesci a vederlo, sta accadendo? | ONE EIGHT Journal',
  $ex$Una città italiana avvelenata dove una parte del danno si posa bene in vista sulle lapidi e una parte non si mostra mai — e che cosa questo fa al modo in cui decidiamo che cosa è reale$ex$,
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
  SELECT id FROM public.journal_articles WHERE slug = 'if-you-cannot-see-it'
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
  'Pisapia, Jasmine Clotilde. "Poisonous Images: Taranto''s Environmental Crisis between the Visible and the Invisible." Cultural Anthropology 41, no. 2 (2026): 247–274.',
  '10.14506/ca41.2.03',
  'https://doi.org/10.14506/ca41.2.03'
FROM article a;

COMMIT;

-- =============================================================================
-- END
-- =============================================================================
