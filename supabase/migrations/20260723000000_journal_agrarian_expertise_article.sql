-- =============================================================================
-- 20260723000000_journal_agrarian_expertise_article.sql
-- 記事: oej-2026-agrarian-expertise-affect / who-the-problem-belongs-to
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
  'who-the-problem-belongs-to',
  'published',
  'ONE EIGHT Journal',
  ARRAY['cultural anthropology', 'expertise', 'affect', 'agrarian labor', 'caste', 'India', 'Andhra Pradesh', 'sustainability', 'parasitic plant'],
  '2026-07-23 00:00:00+09:00'
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

WITH art_0 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'who-the-problem-belongs-to'
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
  art_0.id,
  'en',
  'Who the Expert Decides the Problem Belongs To',
  $sub_en$In a tobacco-growing district of India, a plant disease exposed something about expertise — before it solves a problem, it chooses whose problem to solve$sub_en$,
  $body_en$<p>In January 2016, near harvest, officials from India's Tobacco Board walked a field of ripe tobacco in Prakasam district, Andhra Pradesh, and found a parasite in the soil. It was <em>Orobanche cernua</em>, a plant with no green in it, which feeds by hooking into the roots of the tobacco. Left alone, it can cut a harvest by anywhere from a fifth to all of it. A junior officer phoned the farmer to tell him to act. The farmer would not cooperate, and a senior official waved the problem off: what can the farmer do, there are no laborers to hire.</p>

<p>Notice who just appeared in that sentence, and how. The laborers show up only as a shortage — a missing input, a problem for the harvest. A moment earlier, in the whole conversation about the crop and the parasite and the farmer, they were not mentioned at all.</p>

<p>That small absence is the subject here, and it points to a claim worth stating plainly. We usually judge an expert by whether the advice is correct. But there is an earlier step, and it is rarely examined. Before deciding what to do about a problem, an expert decides whose problem it is — whose livelihood is the thing to be protected. That decision is not made from data. It is made from sympathy: from who the expert identifies with. And it can leave entire groups of people outside the frame. Amrita Kurian's fieldwork among the people who advise these tobacco farmers shows how, and what it costs.</p>

<p>Start with who the experts are, and who they feel close to. They are Tobacco Board officials, state scientists, and researchers from the tobacco company. What they share with the landowning farmers is not only technical knowledge. They tend to hold land themselves, come from the same dominant castes, and carry the same grievance — that the world market rates Indian tobacco as second-rate. Their concern flows toward these farmers because these farmers feel like their own. The people who actually handle the crop — landless laborers, most of them Dalit women — are simply not who the advice is addressed to.</p>

<p>There is a structural reason for this, not only a personal one. The Tobacco Board was created in 1975 to protect the livelihoods of tobacco-growing farmers — meaning the people who own the land and sell the crop. The institution the experts work for is built around the landowner. So the pull of fellow feeling and the design of the job point the same way, and reinforce each other.</p>

<p>The bond is emotional in a specific way, too. Experts and landowners share a wound: on the world market, Indian tobacco is treated as low-grade and priced below the leaf it competes with. That shared sense of being undervalued gives expert and farmer a common cause, close to a patriotism. It is a real grievance — but it is defined entirely from the landowner's side of the field. The laborer's harder grievance — low pay, sickness, no security — never enters it.</p>

<p>That exclusion is not vague. It has concrete effects. When wages rise, the experts blame the laborers, treating a higher day-rate as a flaw in the workers rather than a sign that their bargaining power has grown. The single reliable way to clear the parasite is to pull it out by hand, plant by plant — a skill the laborers carry in their hands. But that skill is not counted as expertise, and the people who hold it are not counted as the public the experts serve. And the experts speak warmly of an earlier generation's "dedication," a nostalgia that sounds like respect but quietly rewrites the past, skipping over how those workers lost their land and were made dependent in the first place.</p>

<p>The teaching itself looks harmless, even progressive. The experts run seminars on "cultural methods" — crop rotation, deep plowing, cattle manure, handling the parasite with patience instead of harsh chemicals. The style is homely and reassuring: an expert will compare fertilizer — nitrogen, phosphorus, potassium — to a balanced plate of rice, curry, and yogurt, so the science feels like plain good sense. But the advice asks the landowner to reform himself for the market while leaving untouched the thing the whole operation runs on: cheap, caste-bound labor. You can see the tilt in what gets named. The stubborn parasite gets a name and a strategy. The falling profits get blamed on the weather — on a changing climate — rather than on buyers who pay a little less each year for the same leaf. The terms of trade and the workers in the field go unnamed, and so they stay a fixed background that no one is asked to change.</p>

<p>This is not a story about cruel experts, and that is the uncomfortable part. Their concern is real. Their nostalgia is sincere. The seminars are offered in good faith. The sorting of people into those who matter and those who fade out does not happen through malice. It happens through ordinary warmth — the pull toward the people who feel like yours. A kind face and good intentions do not cancel the exclusion. Here, they are how it operates.</p>

<p>It helps to know how a person ends up counted as "free." These laborers are landless because, over generations, they lost access to land and came to depend on wage work for the farmers who kept it. Being landless also leaves them free to leave — and more of them do, driven off by heat, by pesticide sickness, by work that pays little and wears the body down. Their leaving is exactly what produces the "no laborers to hire" shortage. The experts tend to read that shortage as workers being unreliable, rather than as people walking away from a job that harms them.</p>

<p>And the exclusion has a price that is not abstract. Over one season, a laborer — the wife of a labor contractor — kept working through the sickness that the crop and its pesticides brought on, and died after the harvest was in. Work paused briefly, then resumed, because the market keeps its own schedule. Her death did not register with the experts. Not because anyone ruled it out, but because of a category: she counted as a "free" worker, outside the protected group, so none of the state's disaster relief reached her.</p>

<p>The parasite in this story does have a striking flower — bright purple, on a pale stalk — even though the plant lives by draining the tobacco underground. Kurian uses it as a mirror for the expertise: an appealing surface, and a dependence on hidden labor underneath. The point is not that the experts are frauds. It is that the visible part of help — the method, the fix, the seminar — is not the whole of what is going on.</p>

<p>So the useful habit is not to distrust experts. It is to add one question before the usual one. Before asking whether an expert's answer is right, ask who they decided the problem belonged to. Who is the fix built around, and who is treated as the background it happens against? That answer is usually settled before any data is read — and it decides who help reaches, and who it passes over.</p>

<p>The habit travels beyond tobacco, and beyond India. Whenever a plan arrives to fix something, it is worth asking who has been cast as the person it is for, and who as the setting it plays out in. The plan itself rarely says. That is the part we have to supply.</p>$body_en$,
  $meta_en$Who the Expert Decides the Problem Belongs To | ONE EIGHT Journal$meta_en$,
  $sub_en$In a tobacco-growing district of India, a plant disease exposed something about expertise — before it solves a problem, it chooses whose problem to solve$sub_en$,
  true
FROM art_0
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH art_1 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'who-the-problem-belongs-to'
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
  art_1.id,
  'ja',
  'その問題は「誰のもの」だと、専門家は先に決めている',
  $sub_ja$インドのたばこ産地で起きた作物の病が、専門知について一つのことを見せた——問題を解く前に、それが誰の問題かを選んでいる$sub_ja$,
  $body_ja$<p>2016年1月、収穫間近の頃、インド・たばこ委員会の官吏が、アーンドラ・プラデーシュ州プラカサム地区の実ったたばこ畑を歩き、土のなかに寄生植物を見つけた。Orobanche cernua。緑を持たず、たばこの根に食い込んで養分を吸う植物だ。放っておけば、収穫を五分の一から丸ごとまで削りうる。若い官吏が農家に電話し、対処するよう告げた。農家は応じようとせず、上役の官吏は問題を手で払うように言った。農家に何ができる、雇う労働者もいないのに、と。</p>

<p>いま、その一言のなかに誰が現れたか、そしてどう現れたかに注目したい。労働者は、人手の不足としてだけ姿を見せる。足りない資源、収穫の妨げとして。その少し前まで、作物と寄生植物と農家をめぐる会話全体のなかで、彼女たちは一度も名を出されていなかった。</p>

<p>この小さな不在が、ここでの主題だ。そして、はっきり言っておくべき一つの主張を指している。私たちはふつう、専門家を助言が正しいかどうかで測る。だが、その前に一段ある。めったに問われない段だ。問題への対処を決める前に、専門家は、それが誰の問題かを——誰の暮らしを守るべきものとするかを——決めている。その決定はデータからではなく、共感から生まれる。専門家が誰に自分を重ねるか、で。そしてそれは、丸ごとの人びとを枠の外に置きうる。Amrita Kurian が、こうしたたばこ農家に助言する人びとのなかで行った調査は、その仕組みと、その代償を示している。</p>

<p>まず、専門家が誰で、誰に近しさを感じているか、から。彼らはたばこ委員会の官吏、州の科学者、たばこ会社の研究者だ。土地を持つ農家と分かち合っているのは、技術的な知識だけではない。彼ら自身も土地を持ち、同じ優勢なカーストの出で、同じ不満を抱えている——世界市場が自分たちのたばこを二流と値づける、という不満だ。心配がこの農家たちへ流れるのは、彼らが自分の側だと感じられるからだ。実際に作物を扱う人びと——土地を持たない、多くはダリトの女性労働者——は、そもそも助言の宛先ではない。</p>

<p>これは個人的な感情だけの話ではなく、仕組みの問題でもある。たばこ委員会は1975年に、たばこ農家の暮らしを守るために作られた。ここでいう農家とは、土地を持ち、作物を売る人びとのことだ。専門家が属する組織そのものが、地主を中心に組み立てられている。だから、仲間としての引力と、仕事の設計とが、同じ方向を指し、互いを補強する。</p>

<p>その結びつきには、特有の感情もある。専門家と地主は、一つの傷を分かち合っている。世界市場で、インドのたばこは低級品として扱われ、競う相手より安く値づけられる。この「低く見られている」という共有された感覚が、専門家と農家に共通の大義を——愛国心に近いものを——与える。それは本物の不満だ。だが、畑の地主の側からだけ定義された不満でもある。労働者のもっと重い不満——低い賃金、不調、保障のなさ——は、そこには入ってこない。</p>

<p>その締め出しは、曖昧なものではない。はっきりした効果がある。賃金が上がると、専門家は労働者を責める。高い日当を、交渉力が増した証しではなく、労働者側の欠陥のように扱う。寄生植物を確実に除くただ一つの方法は、一株ずつ手で抜くことだ——それは労働者が手で覚えている技術である。だがその技術は専門知に数えられず、それを持つ人びとも、専門家が仕える「公共」に数えられない。そして専門家は、前の世代の「献身」をあたたかく語る。敬意のように聞こえる郷愁は、しかし過去を書き換えている。その働き手たちがどう土地を失い、どう従属させられたのかを、飛ばして。</p>

<p>教えそのものは、無害に、むしろ進歩的にすら見える。専門家はセミナーで「文化的方法」を説く。輪作、深耕、堆肥、荒い薬剤ではなく辛抱で寄生植物に向き合うこと。語り口は親しみやすく、安心させる。ある専門家は、肥料——窒素、リン、カリウム——を、ご飯とカレーとヨーグルトのそろった一皿の食事にたとえ、科学を当たり前の常識のように感じさせる。だがその助言は、地主には市場に合わせて自分を改めよと求めながら、仕組み全体が乗っている当のもの——安く、カーストに縛られた労働——には手をつけない。傾きは、何に名が与えられるかに表れる。強情な寄生植物には、名と対策が与えられる。落ちていく利益は、天候の、変わりゆく気候のせいにされる。同じ葉に年々わずかずつ安い値しかつけない買い手のせいではなく。取引の条件と、畑にいる働き手は、名づけられないまま、誰も変えなくてよい背景として残る。</p>

<p>これは、冷たい専門家の物語ではない。そこが居心地の悪いところだ。彼らの心配は本物だ。郷愁も誠実だ。セミナーは善意から差し出されている。重んじられる者と、消えていく者への振り分けは、悪意で起きるのではない。ありふれたあたたかさで起きる——自分の側だと感じられる人へ引かれる、あの傾きで。やさしい顔と善意は、締め出しを打ち消さない。ここでは、それが締め出しの動き方そのものだ。</p>

<p>人がどうして「自由」と数えられてしまうのかを知っておくと分かりやすい。この労働者たちが土地を持たないのは、何世代ものあいだに土地への手がかりを失い、それを握り続けた農家のための賃仕事に頼るようになったからだ。土地を持たないことは、去る自由も意味する。そして実際、より多くの人が去っていく。暑さに、農薬による不調に、安い賃金で体をすり減らす仕事に、追われて。彼女たちが去ることこそが、「雇う労働者がいない」という人手不足を生む。専門家はその不足を、自分を害する仕事から人が離れていく姿としてではなく、労働者が当てにならない、と読みがちだ。</p>

<p>そして、その締め出しには、抽象的でない代償がある。ある季節をとおして、一人の労働者——労働請負人の妻——が、作物と農薬がもたらす不調を抱えたまま働き続け、収穫を終えたあとに亡くなった。作業は少し止まり、また動きだした。市場は市場の予定を守るからだ。彼女の死は、専門家に届かなかった。誰かがそう決めたからではなく、区分のせいだ。彼女は「自由な」働き手として数えられ、守られる集団の外にいた。だから、国家の災害救済はどれも彼女に届かなかった。</p>

<p>この物語の寄生植物には、確かに目を引く花がある。淡い茎の先の、鮮やかな紫の花だ。土の下でたばこを吸って生きているのに、である。Kurian はそれを、専門知を映す鏡として使う。人目を引く表面と、その下で頼りにされている見えない労働と。専門家が詐欺だ、という話ではない。助けの見えている部分——手法、対処、セミナー——が、起きていることの全部ではない、ということだ。</p>

<p>だから、役に立つ習慣は、専門家を疑うことではない。いつもの問いの前に、もう一つ問いを足すことだ。専門家の答えが正しいかを問う前に、その問題を誰のものと決めたのかを問う。対処は誰を中心に組み立てられ、誰をそれが起きる背景として扱っているのか。その答えは、たいていデータを読むより前に決まっている。そして、助けが誰に届き、誰を素通りするかを決めている。</p>

<p>この習慣は、たばこの外へも、インドの外へも持ち出せる。何かを直すための計画がやってくるたびに、問う値打ちがある。誰が、それが差し向けられる人として据えられ、誰が、それが起きる舞台として据えられているのか。計画そのものは、めったにそれを言わない。そこは、こちらが補うしかない。</p>$body_ja$,
  $meta_ja$その問題は「誰のもの」だと、専門家は先に決めている | ONE EIGHT Journal$meta_ja$,
  $sub_ja$インドのたばこ産地で起きた作物の病が、専門知について一つのことを見せた——問題を解く前に、それが誰の問題かを選んでいる$sub_ja$,
  false
FROM art_1
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH art_2 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'who-the-problem-belongs-to'
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
  art_2.id,
  'zh-Hant',
  '專家早已決定，這問題屬於誰',
  $sub_zh_hant$在印度一個菸草產區，一場作物的病害揭示了關於專業的一件事——在解決問題之前，它先挑選要解決誰的問題$sub_zh_hant$,
  $body_zh_hant$<p>2016年1月，接近收成時，印度菸草委員會（Tobacco Board）的官員走過安得拉邦（Andhra Pradesh）普拉卡薩姆縣（Prakasam）一片成熟的菸草田，在土裡發現了一種寄生植物。那是列當（<em>Orobanche cernua</em>），一種身上不帶一點綠、靠鉤進菸草根部吸取養分維生的植物。放著不管，它能讓一季的收成減少五分之一，乃至全部。一名基層官員打電話給農戶，要他採取行動。農戶不肯配合，一位資深官員則把問題揮到一邊：農戶能怎麼辦，根本沒有工人可雇。</p>

<p>且留意，在那句話裡剛剛出現了誰，又是怎麼出現的。工人只以「短缺」的樣子露面——一項缺了的投入，一個對收成的妨礙。就在片刻之前，在關於作物、寄生植物與農戶的整段對話裡，他們根本未被提起。</p>

<p>這個小小的缺席，正是這裡的主題，而它指向一個值得直說的論點。我們通常以建議是否正確來評斷一位專家。但在那之前還有一步，卻很少被檢視。在決定拿一個問題怎麼辦之前，專家先決定了它是誰的問題——決定了要保護的，是誰的生計。這個決定不是從數據做出的，而是從同情做出的：從專家把自己認同到誰身上。而它能把整整一群人擋在框外。Amrita Kurian 在這些為菸農提供建議的人當中所做的田野調查，讓我們看見這是怎麼運作的，以及代價是什麼。</p>

<p>先從專家是誰、他們對誰感到親近說起。他們是菸草委員會的官員、州的科學家，以及來自菸草公司的研究員。他們與擁地的農戶所共享的，不只是技術知識。他們自己往往也持有土地，出身同樣的優勢種姓，並懷著同樣的怨懟——世界市場把印度菸草評為次等。他們的關切之所以流向這些農戶，是因為這些農戶讓他們覺得是自己人。真正經手作物的人——沒有土地的工人，其中多數是達利特（Dalit）女性——根本就不是這些建議的對象。</p>

<p>這背後有一個結構性的原因，而不只是個人的原因。菸草委員會設立於1975年，是為了保護菸草農戶的生計——指的是那些擁有土地、賣出作物的人。專家所服務的這個機構，本身就是繞著地主建立起來的。於是，同類相親的拉力，與這份工作的設計，指向同一個方向，彼此加強。</p>

<p>這份連結還以一種特定的方式帶著情感。專家與地主共有一道傷口：在世界市場上，印度菸草被當作低級品，價格被壓在與它競爭的菸葉之下。這種「被低估」的共同感受，給了專家與農戶一個共同的志業，接近一種愛國心。那是一份真實的怨懟——但它完全是從田地裡地主那一側來定義的。工人那更沉重的怨懟——低薪、疾病、毫無保障——從來不曾進入其中。</p>

<p>這種排除並不含糊，它有具體的後果。工資一漲，專家就責怪工人，把較高的日薪當成工人身上的缺陷，而不是他們議價能力增強的跡象。清除這種寄生植物唯一可靠的辦法，是一株一株用手拔——那是工人以雙手記住的技術。可是這門技術不被算作專業，而握有它的人，也不被算進專家所服務的「公眾」。專家還會溫情地談起上一輩的「奉獻」，那種聽來像敬意的懷舊，卻悄悄改寫了過去，略過了那些工人當初是怎麼失去土地、又是怎麼被弄得只能仰人鼻息的。</p>

<p>這套教導本身看來無害，甚至像是進步的。專家開辦關於「耕作方法」的講習——輪作、深耕、牛糞堆肥，用耐心而非猛烈的藥劑去應對寄生植物。語氣家常而令人安心：一位專家會把肥料——氮、磷、鉀——比作一盤搭配均衡的飯、咖哩與優格，好讓科學聽起來像平實的常理。但這份建議要地主為市場而改造自己，卻對整套運作賴以為生的東西——廉價、被種姓綁定的勞動——不加一指。你能從「什麼被點名」看出那道傾斜。頑固的寄生植物有了名字，也有了對策。下滑的利潤則被怪到天氣頭上——怪到變遷中的氣候，而不是怪那些年年為同一種菸葉少付一點的買家。交易的條件，以及田裡的工人，都不被點名，於是他們就一直是那個沒人被要求去改變的固定背景。</p>

<p>這並不是一個關於冷酷專家的故事，而那正是叫人不安的地方。他們的關切是真的。他們的懷舊是真誠的。講習是出於善意而提供的。把人分成要緊的與淡出的，並不是透過惡意發生的。它是透過尋常的溫情發生的——那股朝向「感覺是自己人」的拉力。一張和善的臉與一片好意，並不會抵銷這種排除。在這裡，它們正是排除運作的方式。</p>

<p>明白一個人是怎麼落得被算作「自由」的，會有幫助。這些工人之所以沒有土地，是因為在世代之間，他們失去了對土地的憑藉，轉而依賴替守住土地的農戶做工的工資。沒有土地，也讓他們有離開的自由——而確實有更多人離開了，被暑熱、被農藥造成的病痛、被薪資微薄又磨損身體的活兒趕走。他們的離開，恰恰造出了那個「沒有工人可雇」的短缺。專家傾向把那份短缺讀成工人靠不住，而不是讀成人們正從一份傷害自己的工作走開。</p>

<p>而這種排除，有一個並不抽象的代價。在某一季裡，一名工人——一位勞務承包人的妻子——帶著作物與農藥引起的病痛持續勞作，在收成入倉之後去世。工作短暫停頓，隨即又動了起來，因為市場自有它的時程。她的死，在專家那裡沒有留下記號。不是因為誰把它排除掉了，而是因為一個類別：她被算作「自由的」工人，落在受保護的群體之外，於是國家的災害救濟一分也沒有到她身上。</p>

<p>這個故事裡的寄生植物，確實開著一朵醒目的花——淡色花莖上的一抹鮮紫——儘管這株植物是靠在地下抽乾菸草而活的。Kurian 用它作為映照這種專業的鏡子：一層吸引人的表面，底下卻依賴著隱藏的勞動。重點不在於專家是騙子，而在於幫助裡看得見的那一部分——方法、對策、講習——並不是正在發生的一切。</p>

<p>所以，有用的習慣不是去不信任專家。而是在慣常的那個問題之前，再添一個問題。在問一位專家的答案對不對之前，先問他們把這問題判給了誰。對策是繞著誰建立起來的，又把誰當成它得以上演的背景？那個答案，通常在任何數據被讀取之前就已定下——而它決定了幫助觸及誰，又略過誰。</p>

<p>這個習慣走得出菸草，也走得出印度。每當一份要修補什麼的計畫到來，都值得問一問：誰被安排成它所為的那個人，誰又被安排成它上演的那個場景。計畫本身很少明說。那一塊，得由我們來補上。</p>$body_zh_hant$,
  $meta_zh_hant$專家早已決定，這問題屬於誰 | ONE EIGHT Journal$meta_zh_hant$,
  $sub_zh_hant$在印度一個菸草產區，一場作物的病害揭示了關於專業的一件事——在解決問題之前，它先挑選要解決誰的問題$sub_zh_hant$,
  false
FROM art_2
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH art_3 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'who-the-problem-belongs-to'
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
  art_3.id,
  'zh-Hans',
  '专家早已决定，这问题属于谁',
  $sub_zh_hans$在印度一个烟草产区，一场作物的病害揭示了关于专业的一件事——在解决问题之前，它先挑选要解决谁的问题$sub_zh_hans$,
  $body_zh_hans$<p>2016年1月，接近收成时，印度烟草委员会（Tobacco Board）的官员走过安得拉邦（Andhra Pradesh）普拉卡萨姆县（Prakasam）一片成熟的烟草田，在土里发现了一种寄生植物。那是列当（<em>Orobanche cernua</em>），一种身上不带一点绿、靠钩进烟草根部吸取养分维生的植物。放着不管，它能让一季的收成减少五分之一，乃至全部。一名基层官员打电话给农户，要他采取行动。农户不肯配合，一位资深官员则把问题挥到一边：农户能怎么办，根本没有工人可雇。</p>

<p>且留意，在那句话里刚刚出现了谁，又是怎么出现的。工人只以“短缺”的样子露面——一项缺了的投入，一个对收成的妨碍。就在片刻之前，在关于作物、寄生植物与农户的整段对话里，他们根本未被提起。</p>

<p>这个小小的缺席，正是这里的主题，而它指向一个值得直说的论点。我们通常以建议是否正确来评断一位专家。但在那之前还有一步，却很少被检视。在决定拿一个问题怎么办之前，专家先决定了它是谁的问题——决定了要保护的，是谁的生计。这个决定不是从数据做出的，而是从同情做出的：从专家把自己认同到谁身上。而它能把整整一群人挡在框外。Amrita Kurian 在这些为烟农提供建议的人当中所做的田野调查，让我们看见这是怎么运作的，以及代价是什么。</p>

<p>先从专家是谁、他们对谁感到亲近说起。他们是烟草委员会的官员、州的科学家，以及来自烟草公司的研究员。他们与拥地的农户所共享的，不只是技术知识。他们自己往往也持有土地，出身同样的优势种姓，并怀着同样的怨怼——世界市场把印度烟草评为次等。他们的关切之所以流向这些农户，是因为这些农户让他们觉得是自己人。真正经手作物的人——没有土地的工人，其中多数是达利特（Dalit）女性——根本就不是这些建议的对象。</p>

<p>这背后有一个结构性的原因，而不只是个人的原因。烟草委员会设立于1975年，是为了保护烟草农户的生计——指的是那些拥有土地、卖出作物的人。专家所服务的这个机构，本身就是绕着地主建立起来的。于是，同类相亲的拉力，与这份工作的设计，指向同一个方向，彼此加强。</p>

<p>这份连结还以一种特定的方式带着情感。专家与地主共有一道伤口：在世界市场上，印度烟草被当作低级品，价格被压在与它竞争的烟叶之下。这种“被低估”的共同感受，给了专家与农户一个共同的志业，接近一种爱国心。那是一份真实的怨怼——但它完全是从田地里地主那一侧来定义的。工人那更沉重的怨怼——低薪、疾病、毫无保障——从来不曾进入其中。</p>

<p>这种排除并不含糊，它有具体的后果。工资一涨，专家就责怪工人，把较高的日薪当成工人身上的缺陷，而不是他们议价能力增强的迹象。清除这种寄生植物唯一可靠的办法，是一株一株用手拔——那是工人以双手记住的技术。可是这门技术不被算作专业，而握有它的人，也不被算进专家所服务的“公众”。专家还会温情地谈起上一辈的“奉献”，那种听来像敬意的怀旧，却悄悄改写了过去，略过了那些工人当初是怎么失去土地、又是怎么被弄得只能仰人鼻息的。</p>

<p>这套教导本身看来无害，甚至像是进步的。专家开办关于“耕作方法”的讲习——轮作、深耕、牛粪堆肥，用耐心而非猛烈的药剂去应对寄生植物。语气家常而令人安心：一位专家会把肥料——氮、磷、钾——比作一盘搭配均衡的饭、咖喱与酸奶，好让科学听起来像平实的常理。但这份建议要地主为市场而改造自己，却对整套运作赖以为生的东西——廉价、被种姓绑定的劳动——不加一指。你能从“什么被点名”看出那道倾斜。顽固的寄生植物有了名字，也有了对策。下滑的利润则被怪到天气头上——怪到变迁中的气候，而不是怪那些年年为同一种烟叶少付一点的买家。交易的条件，以及田里的工人，都不被点名，于是他们就一直是那个没人被要求去改变的固定背景。</p>

<p>这并不是一个关于冷酷专家的故事，而那正是叫人不安的地方。他们的关切是真的。他们的怀旧是真诚的。讲习是出于善意而提供的。把人分成要紧的与淡出的，并不是透过恶意发生的。它是透过寻常的温情发生的——那股朝向“感觉是自己人”的拉力。一张和善的脸与一片好意，并不会抵销这种排除。在这里，它们正是排除运作的方式。</p>

<p>明白一个人是怎么落得被算作“自由”的，会有帮助。这些工人之所以没有土地，是因为在世代之间，他们失去了对土地的凭借，转而依赖替守住土地的农户做工的工资。没有土地，也让他们有离开的自由——而确实有更多人离开了，被暑热、被农药造成的病痛、被薪资微薄又磨损身体的活儿赶走。他们的离开，恰恰造出了那个“没有工人可雇”的短缺。专家倾向把那份短缺读成工人靠不住，而不是读成人们正从一份伤害自己的工作走开。</p>

<p>而这种排除，有一个并不抽象的代价。在某一季里，一名工人——一位劳务承包人的妻子——带着作物与农药引起的病痛持续劳作，在收成入仓之后去世。工作短暂停顿，随即又动了起来，因为市场自有它的时程。她的死，在专家那里没有留下记号。不是因为谁把它排除掉了，而是因为一个类别：她被算作“自由的”工人，落在受保护的群体之外，于是国家的灾害救济一分也没有到她身上。</p>

<p>这个故事里的寄生植物，确实开着一朵醒目的花——淡色花茎上的一抹鲜紫——尽管这株植物是靠在地下抽干烟草而活的。Kurian 用它作为映照这种专业的镜子：一层吸引人的表面，底下却依赖着隐藏的劳动。重点不在于专家是骗子，而在于帮助里看得见的那一部分——方法、对策、讲习——并不是正在发生的一切。</p>

<p>所以，有用的习惯不是去不信任专家。而是在惯常的那个问题之前，再添一个问题。在问一位专家的答案对不对之前，先问他们把这问题判给了谁。对策是绕着谁建立起来的，又把谁当成它得以上演的背景？那个答案，通常在任何数据被读取之前就已定下——而它决定了帮助触及谁，又略过谁。</p>

<p>这个习惯走得出烟草，也走得出印度。每当一份要修补什么的计划到来，都值得问一问：谁被安排成它所为的那个人，谁又被安排成它上演的那个场景。计划本身很少明说。那一块，得由我们来补上。</p>$body_zh_hans$,
  $meta_zh_hans$专家早已决定，这问题属于谁 | ONE EIGHT Journal$meta_zh_hans$,
  $sub_zh_hans$在印度一个烟草产区，一场作物的病害揭示了关于专业的一件事——在解决问题之前，它先挑选要解决谁的问题$sub_zh_hans$,
  false
FROM art_3
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH art_4 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'who-the-problem-belongs-to'
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
  art_4.id,
  'ko',
  '전문가는 그 문제가 누구의 것인지 이미 정해 둔다',
  $sub_ko$인도의 한 담배 산지에서 일어난 작물의 병이, 전문성에 관한 한 가지를 드러냈다 — 문제를 풀기 전에, 그것이 누구의 문제인지를 먼저 고른다는 것$sub_ko$,
  $body_ko$<p>2016년 1월, 수확이 가까운 무렵, 인도 담배위원회(Tobacco Board)의 관리들이 안드라프라데시주 프라카삼 지역의 잘 익은 담배밭을 걷다가 흙 속에서 기생식물 하나를 발견했다. 오로반케 케르누아(<em>Orobanche cernua</em>), 몸에 초록이라곤 없이 담배 뿌리에 갈고리처럼 파고들어 양분을 빨아 사는 식물이다. 내버려 두면 한 철 수확을 5분의 1에서 전부까지 깎아낼 수 있다. 한 하급 관리가 농민에게 전화를 걸어 조치하라고 일렀다. 농민은 응하려 하지 않았고, 한 고참 관리는 문제를 손짓으로 밀쳐 냈다. 농민이 무얼 할 수 있겠느냐, 고용할 일꾼도 없는데.</p>

<p>방금 그 한마디 안에 누가 등장했는지, 그리고 어떻게 등장했는지를 눈여겨보자. 일꾼들은 오직 '부족'의 모습으로만 나타난다 — 빠진 투입 요소, 수확의 걸림돌로. 바로 조금 전까지, 작물과 기생식물과 농민을 둘러싼 대화 전체에서 그들은 한 번도 언급되지 않았다.</p>

<p>이 작은 부재가 여기서의 주제이며, 분명히 말해 둘 만한 하나의 주장을 가리킨다. 우리는 보통 조언이 옳은지로 전문가를 평가한다. 그러나 그 앞에 한 단계가 더 있고, 그것은 좀처럼 검토되지 않는다. 문제를 어떻게 할지 정하기 전에, 전문가는 그것이 누구의 문제인지를 — 누구의 생계를 지켜야 할 대상으로 삼을지를 — 먼저 정한다. 그 결정은 데이터에서 나오지 않는다. 공감에서 나온다. 전문가가 누구에게 자신을 겹쳐 놓는가에서. 그리고 그것은 한 무리의 사람들을 통째로 틀 밖에 둘 수 있다. Amrita Kurian이 이 담배 농민들에게 조언하는 사람들 사이에서 수행한 현지조사는, 그것이 어떻게 작동하는지, 그리고 그 대가가 무엇인지를 보여 준다.</p>

<p>먼저 전문가가 누구이고, 그들이 누구에게 가까움을 느끼는지부터. 그들은 담배위원회의 관리, 주(州)의 과학자, 그리고 담배 회사의 연구원이다. 땅을 가진 농민과 그들이 나누는 것은 기술적 지식만이 아니다. 그들 자신도 대개 땅을 지니고, 같은 우세 카스트 출신이며, 같은 원한을 품고 있다 — 세계 시장이 인도 담배를 이류로 매긴다는 것. 그들의 관심이 이 농민들에게로 흐르는 것은, 이 농민들이 자기편처럼 느껴지기 때문이다. 정작 작물을 다루는 사람들 — 땅 없는 일꾼들, 그 다수는 달리트(Dalit) 여성 — 은 애초에 그 조언의 수신자가 아니다.</p>

<p>여기에는 개인적 이유만이 아니라 구조적 이유가 있다. 담배위원회는 1975년, 담배 농민의 생계를 지키기 위해 세워졌다 — 여기서 농민이란 땅을 소유하고 작물을 파는 사람들을 뜻한다. 전문가가 몸담은 기관 자체가 지주를 중심으로 짜여 있다. 그리하여 동류를 향한 끌림과 그 직무의 설계가 같은 방향을 가리키며 서로를 강화한다.</p>

<p>그 결속은 특정한 방식으로 감정적이기도 하다. 전문가와 지주는 하나의 상처를 공유한다. 세계 시장에서 인도 담배는 저급품으로 취급되고, 경쟁하는 잎담배보다 낮게 값 매겨진다. 이 '낮게 평가받는다'는 공유된 감각이 전문가와 농민에게 공동의 대의를 — 애국심에 가까운 것을 — 준다. 그것은 진짜 원한이다 — 그러나 밭에서 지주 쪽에서만 규정된 원한이다. 일꾼의 더 무거운 원한 — 낮은 임금, 병, 보장 없음 — 은 거기 끼어들지 못한다.</p>

<p>그 배제는 모호하지 않다. 구체적인 결과가 있다. 임금이 오르면 전문가는 일꾼을 탓하며, 높아진 일당을 협상력이 커졌다는 신호가 아니라 노동자 쪽의 결함처럼 다룬다. 그 기생식물을 확실히 없애는 단 하나의 방법은 한 포기씩 손으로 뽑는 것이다 — 그것은 일꾼들이 손으로 익힌 기술이다. 그러나 그 기술은 전문성으로 셈해지지 않고, 그것을 지닌 사람들도 전문가가 섬기는 '공중(公衆)'으로 셈해지지 않는다. 그리고 전문가들은 앞 세대의 '헌신'을 따뜻하게 이야기한다. 존경처럼 들리는 그 향수는, 그러나 과거를 슬며시 고쳐 쓴다. 그 일꾼들이 애초에 어떻게 땅을 잃고 어떻게 종속되었는지를 건너뛴 채.</p>

<p>그 가르침 자체는 무해해 보이고, 심지어 진보적으로까지 보인다. 전문가들은 '경작 방법'에 관한 강습을 연다 — 돌려짓기, 깊이갈이, 쇠똥거름, 독한 약제 대신 인내로 기생식물을 다루기. 말투는 정겹고 안심시킨다. 어느 전문가는 비료 — 질소, 인, 칼륨 — 를 밥과 카레와 요구르트가 고루 갖춰진 한 상에 빗대어, 과학을 당연한 상식처럼 들리게 한다. 그러나 그 조언은 지주에게는 시장에 맞춰 자신을 고치라고 요구하면서, 이 모든 운영이 딛고 선 바로 그것 — 값싸고 카스트에 묶인 노동 — 에는 손대지 않는다. 무엇에 이름이 붙는지에서 그 기울기가 보인다. 완강한 기생식물에는 이름과 대책이 주어진다. 떨어지는 이윤은 날씨 탓으로 — 변해 가는 기후 탓으로 — 돌려진다. 같은 잎에 해마다 조금씩 덜 치르는 구매자 탓이 아니라. 교역의 조건과 밭의 일꾼은 이름 붙여지지 않은 채 남고, 그래서 그들은 아무도 바꾸라고 요구받지 않는 고정된 배경으로 머문다.</p>

<p>이것은 냉혹한 전문가에 관한 이야기가 아니며, 바로 그 점이 불편한 대목이다. 그들의 관심은 진짜다. 그들의 향수는 진심이다. 강습은 선의로 제공된다. 사람을 중요한 이와 흐려져 사라지는 이로 가르는 일은 악의를 통해 일어나지 않는다. 그것은 평범한 따뜻함을 통해 일어난다 — 자기편처럼 느껴지는 사람에게로 향하는 그 끌림으로. 다정한 얼굴과 좋은 뜻은 그 배제를 지우지 못한다. 여기서 그것들은 배제가 작동하는 방식 그 자체다.</p>

<p>한 사람이 어떻게 '자유로운' 존재로 셈해지게 되는지를 알아 두면 도움이 된다. 이 일꾼들이 땅이 없는 것은, 여러 세대에 걸쳐 땅에 대한 발판을 잃고, 그 땅을 지켜 온 농민을 위한 품삯 일에 기대게 되었기 때문이다. 땅이 없다는 것은 떠날 자유가 있다는 뜻이기도 하다 — 그리고 실제로 더 많은 이가 떠난다. 더위에, 농약으로 인한 병에, 적게 주고 몸을 갉아먹는 일에 내몰려서. 그들이 떠나는 것이야말로 '고용할 일꾼이 없다'는 부족을 만들어 낸다. 전문가들은 그 부족을, 자신을 해치는 일에서 사람들이 걸어 나오는 모습이 아니라, 일꾼이 미덥지 못하다는 뜻으로 읽곤 한다.</p>

<p>그리고 그 배제에는 추상적이지 않은 대가가 있다. 어느 한 철, 한 일꾼 — 노무 도급인의 아내 — 이 작물과 그 농약이 가져온 병을 안은 채 계속 일하다가, 수확이 거둬진 뒤에 세상을 떠났다. 일은 잠깐 멈췄다가 다시 돌아갔다. 시장은 제 나름의 일정을 지키기 때문이다. 그녀의 죽음은 전문가들에게 기록되지 않았다. 누군가 그것을 배제해서가 아니라, 하나의 범주 때문이다. 그녀는 '자유로운' 노동자로 셈해져 보호받는 집단 밖에 있었고, 그래서 국가의 재난 구호는 어느 것도 그녀에게 닿지 않았다.</p>

<p>이 이야기 속 기생식물에는 정말로 눈길을 끄는 꽃이 있다 — 연한 줄기 끝의 선명한 보라색 — 그 식물이 땅 밑에서 담배를 빨아 먹으며 사는데도 말이다. Kurian은 그것을 이 전문성을 비추는 거울로 삼는다. 매력적인 표면과, 그 아래 숨은 노동에 대한 의존. 요점은 전문가가 사기꾼이라는 것이 아니다. 도움의 보이는 부분 — 방법, 대책, 강습 — 이 일어나고 있는 일의 전부가 아니라는 것이다.</p>

<p>그러니 쓸모 있는 습관은 전문가를 불신하는 것이 아니다. 늘 하던 그 질문 앞에 질문 하나를 더 얹는 것이다. 전문가의 답이 옳은지를 묻기 전에, 그들이 그 문제를 누구의 것으로 정했는지를 물어라. 그 대책은 누구를 중심으로 세워졌고, 누구를 그것이 벌어지는 배경으로 다루는가? 그 답은 대개 어떤 데이터가 읽히기도 전에 이미 정해져 있다 — 그리고 그것이 도움이 누구에게 닿고 누구를 지나치는지를 정한다.</p>

<p>이 습관은 담배 너머로도, 인도 너머로도 가져갈 수 있다. 무언가를 고치려는 계획이 도착할 때마다, 물어볼 값이 있다. 누가 그것이 향하는 사람으로 세워졌고, 누가 그것이 펼쳐지는 무대로 세워졌는가. 계획 자체는 좀처럼 그것을 말하지 않는다. 그 부분은 우리가 채워 넣을 수밖에 없다.</p>$body_ko$,
  $meta_ko$전문가는 그 문제가 누구의 것인지 이미 정해 둔다 | ONE EIGHT Journal$meta_ko$,
  $sub_ko$인도의 한 담배 산지에서 일어난 작물의 병이, 전문성에 관한 한 가지를 드러냈다 — 문제를 풀기 전에, 그것이 누구의 문제인지를 먼저 고른다는 것$sub_ko$,
  false
FROM art_4
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH art_5 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'who-the-problem-belongs-to'
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
  art_5.id,
  'es',
  'A quién decide el experto que pertenece el problema',
  $sub_es$En un distrito tabacalero de la India, una enfermedad de las plantas dejó al descubierto algo sobre la pericia — antes de resolver un problema, elige de quién es el problema que va a resolver$sub_es$,
  $body_es$<p>En enero de 2016, cerca de la cosecha, funcionarios de la Junta del Tabaco (Tobacco Board) de la India recorrieron un campo de tabaco maduro en el distrito de Prakasam, en Andhra Pradesh, y encontraron un parásito en el suelo. Era <em>Orobanche cernua</em>, una planta sin nada de verde, que se alimenta enganchándose a las raíces del tabaco. Si se la deja, puede reducir una cosecha desde una quinta parte hasta su totalidad. Un funcionario subalterno telefoneó al agricultor para decirle que actuara. El agricultor no quiso cooperar, y un funcionario de mayor rango descartó el problema con un gesto: qué puede hacer el agricultor, si no hay jornaleros a quienes contratar.</p>

<p>Fíjese en quién acaba de aparecer en esa frase, y cómo. Los jornaleros surgen solo como una escasez — un insumo que falta, un estorbo para la cosecha. Un momento antes, en toda la conversación sobre el cultivo, el parásito y el agricultor, no se los mencionaba en absoluto.</p>

<p>Esa pequeña ausencia es el tema aquí, y apunta a una afirmación que vale la pena decir sin rodeos. Solemos juzgar a un experto por si el consejo es correcto. Pero hay un paso anterior, y rara vez se examina. Antes de decidir qué hacer con un problema, un experto decide de quién es el problema — de quién es el sustento que hay que proteger. Esa decisión no se toma a partir de datos. Se toma a partir de la simpatía: de con quién se identifica el experto. Y puede dejar a grupos enteros de personas fuera del encuadre. El trabajo de campo de Amrita Kurian entre quienes asesoran a estos tabacaleros muestra cómo, y qué cuesta.</p>

<p>Empecemos por quiénes son los expertos y con quiénes se sienten cercanos. Son funcionarios de la Junta del Tabaco, científicos del Estado e investigadores de la empresa tabacalera. Lo que comparten con los agricultores propietarios no es solo el conocimiento técnico. Suelen poseer tierra ellos mismos, provienen de las mismas castas dominantes y cargan con el mismo agravio — que el mercado mundial califica al tabaco indio como de segunda. Su preocupación fluye hacia estos agricultores porque estos agricultores les resultan de los suyos. Quienes de hecho manejan el cultivo — jornaleros sin tierra, en su mayoría mujeres dalits — sencillamente no son a quienes va dirigido el consejo.</p>

<p>Hay una razón estructural para esto, no solo personal. La Junta del Tabaco se creó en 1975 para proteger el sustento de los agricultores tabacaleros — es decir, de quienes poseen la tierra y venden el cultivo. La institución para la que trabajan los expertos está construida en torno al terrateniente. Así, el tirón del compañerismo y el diseño del cargo apuntan en la misma dirección y se refuerzan mutuamente.</p>

<p>El vínculo es emocional de una manera concreta, además. Expertos y terratenientes comparten una herida: en el mercado mundial, el tabaco indio se trata como de baja calidad y se cotiza por debajo de la hoja con la que compite. Esa sensación compartida de estar infravalorados les da al experto y al agricultor una causa común, cercana a un patriotismo. Es un agravio real — pero está definido enteramente desde el lado del terrateniente del campo. El agravio más duro del jornalero — paga baja, enfermedad, ninguna seguridad — nunca entra en él.</p>

<p>Esa exclusión no es vaga. Tiene efectos concretos. Cuando suben los salarios, los expertos culpan a los jornaleros, tratando un jornal más alto como un defecto de los trabajadores en vez de como una señal de que su poder de negociación ha crecido. La única manera fiable de eliminar el parásito es arrancarlo a mano, planta por planta — una destreza que los jornaleros llevan en las manos. Pero esa destreza no se cuenta como pericia, y quienes la poseen no se cuentan como el público al que sirven los expertos. Y los expertos hablan con calidez de la "dedicación" de una generación anterior, una nostalgia que suena a respeto pero que reescribe el pasado en voz baja, saltándose cómo aquellos trabajadores perdieron su tierra y fueron vueltos dependientes en primer lugar.</p>

<p>La enseñanza misma parece inofensiva, hasta progresista. Los expertos dan seminarios sobre "métodos culturales" — rotación de cultivos, arado profundo, estiércol de vaca, tratar al parásito con paciencia en vez de con químicos agresivos. El estilo es hogareño y tranquilizador: un experto comparará el fertilizante — nitrógeno, fósforo, potasio — con un plato equilibrado de arroz, curry y yogur, para que la ciencia se sienta como puro sentido común. Pero el consejo le pide al terrateniente que se reforme para el mercado mientras deja intacto aquello sobre lo que se sostiene toda la operación: mano de obra barata y atada a la casta. La inclinación se ve en lo que recibe nombre. El parásito terco recibe un nombre y una estrategia. La caída de las ganancias se le echa la culpa al clima — a un clima cambiante — y no a los compradores que pagan un poco menos cada año por la misma hoja. Los términos del intercambio y los trabajadores del campo quedan sin nombrar, y así siguen siendo un fondo fijo que a nadie se le pide cambiar.</p>

<p>Esto no es una historia sobre expertos crueles, y esa es la parte incómoda. Su preocupación es real. Su nostalgia es sincera. Los seminarios se ofrecen de buena fe. El reparto de las personas entre las que importan y las que se desvanecen no ocurre por maldad. Ocurre por una calidez corriente — el tirón hacia la gente que se siente de los tuyos. Una cara amable y las buenas intenciones no anulan la exclusión. Aquí, son el modo en que opera.</p>

<p>Ayuda saber cómo una persona termina contada como "libre". Estos jornaleros no tienen tierra porque, a lo largo de generaciones, perdieron el acceso a ella y llegaron a depender del trabajo asalariado para los agricultores que la conservaron. No tener tierra también los deja libres para irse — y más de ellos lo hacen, expulsados por el calor, por la enfermedad de los pesticidas, por un trabajo que paga poco y desgasta el cuerpo. Su marcha es exactamente lo que produce la escasez de "no hay jornaleros a quienes contratar". Los expertos tienden a leer esa escasez como trabajadores poco fiables, y no como personas que se apartan de un empleo que las daña.</p>

<p>Y la exclusión tiene un precio que no es abstracto. A lo largo de una temporada, una jornalera — la esposa de un contratista de mano de obra — siguió trabajando pese a la enfermedad que le trajeron el cultivo y sus pesticidas, y murió una vez recogida la cosecha. El trabajo se detuvo brevemente y luego se reanudó, porque el mercado guarda su propio calendario. Su muerte no quedó registrada para los expertos. No porque alguien la descartara, sino por una categoría: contaba como trabajadora "libre", fuera del grupo protegido, así que ninguna de las ayudas estatales por desastre llegó hasta ella.</p>

<p>El parásito de esta historia sí tiene una flor llamativa — de un púrpura vivo, sobre un tallo pálido — aun cuando la planta vive drenando al tabaco bajo tierra. Kurian la usa como espejo de la pericia: una superficie atractiva y una dependencia del trabajo oculto por debajo. La cuestión no es que los expertos sean unos farsantes. Es que la parte visible de la ayuda — el método, la solución, el seminario — no es todo lo que está ocurriendo.</p>

<p>Así que el hábito útil no es desconfiar de los expertos. Es añadir una pregunta antes de la de siempre. Antes de preguntar si la respuesta de un experto es correcta, pregunte de quién decidieron que era el problema. ¿En torno a quién se construye la solución, y a quién se trata como el fondo contra el que sucede? Esa respuesta suele quedar fijada antes de que se lea dato alguno — y decide a quién llega la ayuda y a quién pasa de largo.</p>

<p>El hábito viaja más allá del tabaco, y más allá de la India. Cada vez que llega un plan para arreglar algo, vale la pena preguntar a quién se ha designado como la persona para la que es, y a quién como el escenario en el que transcurre. El plan mismo rara vez lo dice. Esa es la parte que nos toca poner a nosotros.</p>$body_es$,
  $meta_es$A quién decide el experto que pertenece el problema | ONE EIGHT Journal$meta_es$,
  $sub_es$En un distrito tabacalero de la India, una enfermedad de las plantas dejó al descubierto algo sobre la pericia — antes de resolver un problema, elige de quién es el problema que va a resolver$sub_es$,
  false
FROM art_5
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH art_6 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'who-the-problem-belongs-to'
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
  art_6.id,
  'pt-BR',
  'A quem o especialista decide que o problema pertence',
  $sub_pt_br$Num distrito produtor de fumo da Índia, uma doença das plantas expôs algo sobre a perícia — antes de resolver um problema, ela escolhe de quem é o problema a resolver$sub_pt_br$,
  $body_pt_br$<p>Em janeiro de 2016, perto da colheita, funcionários da Junta do Fumo (Tobacco Board) da Índia percorreram um campo de fumo maduro no distrito de Prakasam, em Andhra Pradesh, e encontraram um parasita no solo. Era a <em>Orobanche cernua</em>, uma planta sem nada de verde, que se alimenta fisgando-se às raízes do fumo. Deixada em paz, pode reduzir uma colheita de um quinto até a totalidade. Um funcionário subalterno telefonou ao agricultor para lhe dizer que agisse. O agricultor não quis cooperar, e um funcionário graduado descartou o problema com um gesto: o que pode o agricultor fazer, se não há trabalhadores para contratar.</p>

<p>Repare em quem acabou de aparecer nessa frase, e como. Os trabalhadores surgem apenas como uma escassez — um insumo que falta, um estorvo para a colheita. Um momento antes, em toda a conversa sobre a lavoura, o parasita e o agricultor, eles não eram mencionados de forma alguma.</p>

<p>Essa pequena ausência é o assunto aqui, e aponta para uma afirmação que vale a pena dizer sem rodeios. Costumamos julgar um especialista pela correção do conselho. Mas há um passo anterior, e ele raramente é examinado. Antes de decidir o que fazer com um problema, um especialista decide de quem é o problema — de quem é o sustento que se deve proteger. Essa decisão não se toma a partir de dados. Toma-se a partir da simpatia: de com quem o especialista se identifica. E pode deixar grupos inteiros de pessoas fora do enquadramento. O trabalho de campo de Amrita Kurian entre os que aconselham esses fumicultores mostra como, e o que isso custa.</p>

<p>Comecemos por quem são os especialistas e por quem eles se sentem próximos. São funcionários da Junta do Fumo, cientistas do Estado e pesquisadores da empresa de fumo. O que compartilham com os agricultores proprietários não é só o conhecimento técnico. Costumam eles próprios possuir terra, vêm das mesmas castas dominantes e carregam o mesmo agravo — o de que o mercado mundial classifica o fumo indiano como de segunda. A preocupação deles flui para esses agricultores porque esses agricultores lhes parecem dos seus. Quem de fato lida com a lavoura — trabalhadores sem terra, em sua maioria mulheres dalits — simplesmente não é a quem o conselho se dirige.</p>

<p>Há uma razão estrutural para isso, não apenas pessoal. A Junta do Fumo foi criada em 1975 para proteger o sustento dos fumicultores — ou seja, das pessoas que possuem a terra e vendem a lavoura. A instituição para a qual os especialistas trabalham é construída em torno do proprietário de terra. Assim, o puxão do companheirismo e o desenho do cargo apontam para o mesmo lado e se reforçam mutuamente.</p>

<p>O laço também é emocional de um modo específico. Especialistas e proprietários compartilham uma ferida: no mercado mundial, o fumo indiano é tratado como de baixa qualidade e cotado abaixo da folha com que concorre. Essa sensação compartilhada de ser subvalorizado dá ao especialista e ao agricultor uma causa comum, próxima de um patriotismo. É um agravo real — mas definido inteiramente do lado do proprietário no campo. O agravo mais pesado do trabalhador — pouca paga, doença, nenhuma segurança — nunca entra nele.</p>

<p>Essa exclusão não é vaga. Tem efeitos concretos. Quando os salários sobem, os especialistas culpam os trabalhadores, tratando uma diária mais alta como um defeito dos operários, e não como sinal de que seu poder de barganha cresceu. O único jeito confiável de eliminar o parasita é arrancá-lo à mão, planta por planta — uma habilidade que os trabalhadores carregam nas mãos. Mas essa habilidade não é contada como perícia, e quem a possui não é contado como o público que os especialistas servem. E os especialistas falam com carinho da "dedicação" de uma geração anterior, uma nostalgia que soa a respeito mas reescreve o passado em surdina, pulando como aqueles trabalhadores perderam sua terra e foram tornados dependentes em primeiro lugar.</p>

<p>O próprio ensino parece inofensivo, até progressista. Os especialistas dão seminários sobre "métodos culturais" — rotação de culturas, aração profunda, esterco de gado, lidar com o parasita com paciência em vez de químicos agressivos. O estilo é caseiro e tranquilizador: um especialista comparará o fertilizante — nitrogênio, fósforo, potássio — a um prato equilibrado de arroz, curry e iogurte, para que a ciência soe como puro bom senso. Mas o conselho pede ao proprietário que se reforme para o mercado, deixando intocado aquilo sobre o que toda a operação se apoia: mão de obra barata e presa à casta. A inclinação se vê no que ganha nome. O parasita teimoso ganha um nome e uma estratégia. A queda dos lucros é atribuída ao tempo — a um clima em mudança — e não aos compradores que pagam um pouco menos a cada ano pela mesma folha. Os termos de troca e os trabalhadores do campo ficam sem nome, e assim seguem sendo um pano de fundo fixo que a ninguém se pede que mude.</p>

<p>Esta não é uma história sobre especialistas cruéis, e essa é a parte incômoda. A preocupação deles é real. A nostalgia deles é sincera. Os seminários são oferecidos de boa-fé. A separação das pessoas entre as que importam e as que se apagam não acontece por malícia. Acontece por uma cordialidade comum — o puxão em direção às pessoas que parecem dos seus. Um rosto gentil e boas intenções não anulam a exclusão. Aqui, são o modo como ela opera.</p>

<p>Ajuda saber como uma pessoa acaba contada como "livre". Esses trabalhadores não têm terra porque, ao longo de gerações, perderam o acesso a ela e passaram a depender do trabalho assalariado para os agricultores que a mantiveram. Não ter terra também os deixa livres para partir — e mais deles partem, empurrados pelo calor, pela doença dos agrotóxicos, por um trabalho que paga pouco e desgasta o corpo. A partida deles é exatamente o que produz a escassez de "não há trabalhadores para contratar". Os especialistas tendem a ler essa escassez como trabalhadores pouco confiáveis, e não como pessoas se afastando de um emprego que as machuca.</p>

<p>E a exclusão tem um preço que não é abstrato. Ao longo de uma safra, uma trabalhadora — a esposa de um empreiteiro de mão de obra — continuou trabalhando apesar da doença que a lavoura e seus agrotóxicos lhe trouxeram, e morreu depois de recolhida a colheita. O trabalho parou brevemente e depois recomeçou, porque o mercado guarda seu próprio calendário. A morte dela não se registrou para os especialistas. Não porque alguém a tenha descartado, mas por causa de uma categoria: ela contava como trabalhadora "livre", fora do grupo protegido, de modo que nenhum socorro estatal a desastres chegou até ela.</p>

<p>O parasita desta história tem, de fato, uma flor marcante — de um roxo vivo, sobre um talo pálido — mesmo que a planta viva drenando o fumo debaixo da terra. Kurian a usa como espelho da perícia: uma superfície atraente e uma dependência do trabalho oculto por baixo. A questão não é que os especialistas sejam impostores. É que a parte visível da ajuda — o método, a solução, o seminário — não é tudo o que está acontecendo.</p>

<p>Então o hábito útil não é desconfiar dos especialistas. É acrescentar uma pergunta antes da de sempre. Antes de perguntar se a resposta de um especialista está certa, pergunte de quem eles decidiram que era o problema. Em torno de quem a solução é construída, e quem é tratado como o pano de fundo contra o qual ela acontece? Essa resposta costuma estar fixada antes de qualquer dado ser lido — e decide a quem a ajuda chega e por quem ela passa direto.</p>

<p>O hábito viaja para além do fumo, e para além da Índia. Sempre que chega um plano para consertar alguma coisa, vale perguntar quem foi designado como a pessoa para quem ele é, e quem como o cenário em que ele se desenrola. O próprio plano raramente diz. Essa é a parte que nos cabe fornecer.</p>$body_pt_br$,
  $meta_pt_br$A quem o especialista decide que o problema pertence | ONE EIGHT Journal$meta_pt_br$,
  $sub_pt_br$Num distrito produtor de fumo da Índia, uma doença das plantas expôs algo sobre a perícia — antes de resolver um problema, ela escolhe de quem é o problema a resolver$sub_pt_br$,
  false
FROM art_6
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH art_7 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'who-the-problem-belongs-to'
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
  art_7.id,
  'de',
  'Wem der Experte das Problem zuschreibt',
  $sub_de$In einem Tabakanbaugebiet Indiens legte eine Pflanzenkrankheit etwas über Sachverstand offen — bevor er ein Problem löst, wählt er, wessen Problem er lösen will$sub_de$,
  $body_de$<p>Im Januar 2016, kurz vor der Ernte, gingen Beamte des indischen Tabak-Boards (Tobacco Board) durch ein Feld reifen Tabaks im Distrikt Prakasam in Andhra Pradesh und fanden im Boden einen Schmarotzer. Es war <em>Orobanche cernua</em>, eine Pflanze ohne jedes Grün, die sich nährt, indem sie sich in die Wurzeln des Tabaks krallt. Lässt man sie gewähren, kann sie eine Ernte um ein Fünftel bis um alles schmälern. Ein junger Beamter rief den Bauern an und sagte ihm, er solle handeln. Der Bauer wollte nicht mitziehen, und ein höherer Beamter wischte das Problem beiseite: Was kann der Bauer schon tun, es gibt keine Arbeiter zum Anheuern.</p>

<p>Man beachte, wer da eben in diesem Satz auftauchte, und wie. Die Arbeiter erscheinen nur als ein Mangel — ein fehlender Input, ein Hindernis für die Ernte. Einen Augenblick zuvor, im ganzen Gespräch über die Ernte und den Schmarotzer und den Bauern, wurden sie überhaupt nicht erwähnt.</p>

<p>Diese kleine Abwesenheit ist hier das Thema, und sie deutet auf eine Behauptung, die es sich lohnt klar auszusprechen. Gewöhnlich beurteilen wir einen Experten danach, ob der Rat richtig ist. Doch es gibt einen früheren Schritt, und er wird selten geprüft. Bevor er entscheidet, was gegen ein Problem zu tun ist, entscheidet ein Experte, wessen Problem es ist — wessen Auskommen das zu Schützende ist. Diese Entscheidung wird nicht aus Daten getroffen. Sie wird aus Sympathie getroffen: daraus, mit wem der Experte sich identifiziert. Und sie kann ganze Gruppen von Menschen aus dem Bildausschnitt lassen. Amrita Kurians Feldforschung unter denen, die diese Tabakbauern beraten, zeigt, wie das geschieht und was es kostet.</p>

<p>Beginnen wir damit, wer die Experten sind und wem sie sich nahe fühlen. Es sind Beamte des Tabak-Boards, Wissenschaftler des Staates und Forscher des Tabakunternehmens. Was sie mit den landbesitzenden Bauern teilen, ist nicht nur Fachwissen. Sie besitzen oft selbst Land, stammen aus denselben herrschenden Kasten und tragen denselben Groll — dass der Weltmarkt indischen Tabak als zweitklassig einstuft. Ihre Sorge fließt diesen Bauern zu, weil diese Bauern sich wie die Ihren anfühlen. Diejenigen, die die Ernte tatsächlich anfassen — landlose Arbeiter, die meisten von ihnen Dalit-Frauen — sind schlicht nicht die, an die der Rat gerichtet ist.</p>

<p>Dafür gibt es einen strukturellen Grund, nicht nur einen persönlichen. Das Tabak-Board wurde 1975 geschaffen, um das Auskommen der tabakanbauenden Bauern zu schützen — gemeint sind die, die das Land besitzen und die Ernte verkaufen. Die Institution, für die die Experten arbeiten, ist um den Landbesitzer herum gebaut. So weisen der Sog des Zusammengehörigkeitsgefühls und der Zuschnitt der Aufgabe in dieselbe Richtung und verstärken einander.</p>

<p>Das Band ist zudem auf eine bestimmte Weise emotional. Experten und Landbesitzer teilen eine Wunde: Auf dem Weltmarkt wird indischer Tabak als minderwertig behandelt und unter dem Blatt gehandelt, mit dem er konkurriert. Dieses geteilte Gefühl, unterbewertet zu sein, gibt Experte und Bauer eine gemeinsame Sache, nahe einem Patriotismus. Es ist ein echter Groll — aber er ist ganz von der Seite des Landbesitzers auf dem Feld her definiert. Der härtere Groll des Arbeiters — geringer Lohn, Krankheit, keine Sicherheit — kommt darin nie vor.</p>

<p>Dieser Ausschluss ist nicht vage. Er hat konkrete Folgen. Steigen die Löhne, geben die Experten den Arbeitern die Schuld und behandeln einen höheren Tageslohn als Makel der Arbeiter statt als Zeichen dafür, dass deren Verhandlungsmacht gewachsen ist. Der einzige verlässliche Weg, den Schmarotzer zu beseitigen, ist, ihn von Hand herauszuziehen, Pflanze für Pflanze — eine Fertigkeit, die die Arbeiter in ihren Händen tragen. Doch diese Fertigkeit zählt nicht als Sachverstand, und die, die sie besitzen, zählen nicht als die Öffentlichkeit, der die Experten dienen. Und die Experten sprechen warm von der „Hingabe" einer früheren Generation, eine Nostalgie, die nach Respekt klingt, aber die Vergangenheit still umschreibt und überspringt, wie jene Arbeiter überhaupt erst ihr Land verloren und abhängig gemacht wurden.</p>

<p>Die Lehre selbst wirkt harmlos, sogar fortschrittlich. Die Experten halten Seminare über „kulturelle Methoden" ab — Fruchtwechsel, Tiefpflügen, Rindermist, den Schmarotzer mit Geduld statt mit harten Chemikalien behandeln. Der Ton ist heimelig und beruhigend: Ein Experte vergleicht den Dünger — Stickstoff, Phosphor, Kalium — mit einem ausgewogenen Teller aus Reis, Curry und Joghurt, damit sich die Wissenschaft wie schlichter gesunder Menschenverstand anfühlt. Doch der Rat verlangt vom Landbesitzer, sich für den Markt zu reformieren, während er das unangetastet lässt, worauf der ganze Betrieb läuft: billige, an die Kaste gebundene Arbeit. Die Schieflage zeigt sich daran, was benannt wird. Der hartnäckige Schmarotzer bekommt einen Namen und eine Strategie. Die sinkenden Gewinne werden dem Wetter angelastet — einem sich wandelnden Klima — und nicht den Käufern, die Jahr für Jahr ein wenig weniger für dasselbe Blatt zahlen. Die Handelsbedingungen und die Arbeiter auf dem Feld bleiben unbenannt, und so bleiben sie ein fester Hintergrund, den zu ändern von niemandem verlangt wird.</p>

<p>Dies ist keine Geschichte über grausame Experten, und das ist der unbequeme Teil. Ihre Sorge ist echt. Ihre Nostalgie ist aufrichtig. Die Seminare werden in gutem Glauben angeboten. Das Sortieren der Menschen in solche, die zählen, und solche, die verblassen, geschieht nicht durch Bosheit. Es geschieht durch ganz gewöhnliche Wärme — den Sog hin zu den Menschen, die sich wie die eigenen anfühlen. Ein freundliches Gesicht und gute Absichten heben den Ausschluss nicht auf. Hier sind sie die Art, wie er funktioniert.</p>

<p>Es hilft zu wissen, wie ein Mensch am Ende als „frei" gezählt wird. Diese Arbeiter sind landlos, weil sie über Generationen den Zugang zu Land verloren und darauf angewiesen wurden, Lohnarbeit für die Bauern zu leisten, die es behielten. Landlos zu sein lässt sie auch frei zu gehen — und mehr von ihnen tun es, vertrieben von der Hitze, von der Pestizidkrankheit, von einer Arbeit, die wenig zahlt und den Körper aufreibt. Ihr Weggehen ist genau das, was den Mangel an „keinen Arbeitern zum Anheuern" hervorbringt. Die Experten neigen dazu, diesen Mangel als Unzuverlässigkeit der Arbeiter zu lesen, statt als Menschen, die sich von einer Arbeit abwenden, die ihnen schadet.</p>

<p>Und der Ausschluss hat einen Preis, der nicht abstrakt ist. Über eine Saison hinweg arbeitete eine Arbeiterin — die Frau eines Arbeitsvermittlers — trotz der Krankheit weiter, die die Ernte und ihre Pestizide mit sich brachten, und starb, nachdem die Ernte eingebracht war. Die Arbeit hielt kurz inne und lief dann wieder an, denn der Markt hält seinen eigenen Zeitplan ein. Ihr Tod wurde bei den Experten nicht verzeichnet. Nicht weil jemand ihn ausgeschlossen hätte, sondern wegen einer Kategorie: Sie zählte als „freie" Arbeiterin, außerhalb der geschützten Gruppe, und so erreichte sie keine der staatlichen Katastrophenhilfen.</p>

<p>Der Schmarotzer in dieser Geschichte hat tatsächlich eine auffallende Blüte — leuchtend violett, auf einem blassen Stängel — obwohl die Pflanze lebt, indem sie den Tabak unter der Erde aussaugt. Kurian nutzt sie als Spiegel für den Sachverstand: eine ansprechende Oberfläche und darunter eine Abhängigkeit von verborgener Arbeit. Der Punkt ist nicht, dass die Experten Betrüger wären. Es ist, dass der sichtbare Teil der Hilfe — die Methode, die Lösung, das Seminar — nicht das Ganze dessen ist, was vor sich geht.</p>

<p>Die nützliche Gewohnheit ist also nicht, Experten zu misstrauen. Sie besteht darin, vor die übliche Frage eine weitere zu setzen. Bevor man fragt, ob die Antwort eines Experten richtig ist, frage man, wem sie das Problem zugeschrieben haben. Um wen ist die Lösung herum gebaut, und wer wird als der Hintergrund behandelt, vor dem sie sich abspielt? Diese Antwort ist meist entschieden, bevor irgendwelche Daten gelesen werden — und sie entscheidet, wen die Hilfe erreicht und an wem sie vorbeigeht.</p>

<p>Die Gewohnheit reist über den Tabak hinaus und über Indien hinaus. Wann immer ein Plan eintrifft, um etwas zu richten, lohnt sich die Frage, wer als die Person gesetzt wurde, für die er ist, und wer als der Schauplatz, auf dem er sich abspielt. Der Plan selbst sagt es selten. Das ist der Teil, den wir liefern müssen.</p>$body_de$,
  $meta_de$Wem der Experte das Problem zuschreibt | ONE EIGHT Journal$meta_de$,
  $sub_de$In einem Tabakanbaugebiet Indiens legte eine Pflanzenkrankheit etwas über Sachverstand offen — bevor er ein Problem löst, wählt er, wessen Problem er lösen will$sub_de$,
  false
FROM art_7
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH art_8 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'who-the-problem-belongs-to'
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
  art_8.id,
  'fr',
  'À qui l''expert décide que le problème appartient',
  $sub_fr$Dans un district producteur de tabac en Inde, une maladie des plantes a mis au jour quelque chose sur l'expertise — avant de résoudre un problème, elle choisit le problème de qui elle va résoudre$sub_fr$,
  $body_fr$<p>En janvier 2016, à l'approche de la récolte, des fonctionnaires du Tobacco Board indien ont parcouru un champ de tabac mûr dans le district de Prakasam, en Andhra Pradesh, et ont trouvé un parasite dans le sol. C'était l'<em>Orobanche cernua</em>, une plante sans le moindre vert, qui se nourrit en s'accrochant aux racines du tabac. Laissée faire, elle peut amputer une récolte d'un cinquième à la totalité. Un fonctionnaire subalterne a téléphoné au cultivateur pour lui dire d'agir. Le cultivateur n'a pas voulu coopérer, et un fonctionnaire de rang supérieur a balayé le problème d'un geste : que peut faire le cultivateur, il n'y a pas d'ouvriers à embaucher.</p>

<p>Remarquez qui vient d'apparaître dans cette phrase, et comment. Les ouvriers ne surgissent que comme une pénurie — un intrant manquant, une entrave à la récolte. Un instant plus tôt, dans toute la conversation sur la culture, le parasite et le cultivateur, ils n'étaient pas mentionnés du tout.</p>

<p>Cette petite absence est le sujet ici, et elle pointe vers une affirmation qui mérite d'être dite sans détour. Nous jugeons d'ordinaire un expert à la justesse de son conseil. Mais il y a une étape antérieure, et elle est rarement examinée. Avant de décider quoi faire d'un problème, un expert décide à qui appartient le problème — de quelle subsistance il faut faire la chose à protéger. Cette décision ne se prend pas à partir de données. Elle se prend à partir de la sympathie : de la personne à laquelle l'expert s'identifie. Et elle peut laisser des groupes entiers de gens hors du cadre. Le travail de terrain d'Amrita Kurian parmi ceux qui conseillent ces producteurs de tabac montre comment, et à quel prix.</p>

<p>Commençons par qui sont les experts et par ceux dont ils se sentent proches. Ce sont des fonctionnaires du Tobacco Board, des scientifiques de l'État et des chercheurs de la compagnie de tabac. Ce qu'ils partagent avec les cultivateurs propriétaires, ce n'est pas seulement le savoir technique. Ils possèdent souvent eux-mêmes de la terre, viennent des mêmes castes dominantes et portent le même grief — que le marché mondial classe le tabac indien comme de second rang. Leur souci se porte vers ces cultivateurs parce que ces cultivateurs leur semblent des leurs. Ceux qui manient réellement la culture — des ouvriers sans terre, pour la plupart des femmes dalits — ne sont tout simplement pas ceux à qui le conseil s'adresse.</p>

<p>Il y a à cela une raison structurelle, et pas seulement personnelle. Le Tobacco Board a été créé en 1975 pour protéger la subsistance des cultivateurs de tabac — c'est-à-dire de ceux qui possèdent la terre et vendent la récolte. L'institution pour laquelle travaillent les experts est bâtie autour du propriétaire terrien. Ainsi l'attraction de la solidarité et la conception du poste pointent dans le même sens et se renforcent l'une l'autre.</p>

<p>Le lien est aussi émotionnel d'une manière précise. Experts et propriétaires partagent une blessure : sur le marché mondial, le tabac indien est traité comme de basse qualité et coté au-dessous de la feuille avec laquelle il rivalise. Ce sentiment partagé d'être sous-évalué donne à l'expert et au cultivateur une cause commune, proche d'un patriotisme. C'est un grief réel — mais défini entièrement depuis le côté du propriétaire dans le champ. Le grief plus lourd de l'ouvrier — bas salaire, maladie, aucune sécurité — n'y entre jamais.</p>

<p>Cette exclusion n'est pas vague. Elle a des effets concrets. Quand les salaires montent, les experts en font porter la faute aux ouvriers, traitant un salaire journalier plus élevé comme un défaut des travailleurs plutôt que comme le signe que leur pouvoir de négociation a grandi. Le seul moyen fiable d'éliminer le parasite est de l'arracher à la main, plante par plante — un savoir-faire que les ouvriers portent dans leurs mains. Mais ce savoir-faire n'est pas compté comme de l'expertise, et ceux qui le détiennent ne sont pas comptés comme le public que servent les experts. Et les experts parlent avec chaleur du « dévouement » d'une génération antérieure, une nostalgie qui sonne comme du respect mais réécrit discrètement le passé, sautant par-dessus la façon dont ces travailleurs ont d'abord perdu leur terre et ont été rendus dépendants.</p>

<p>L'enseignement lui-même paraît inoffensif, voire progressiste. Les experts donnent des séminaires sur les « méthodes culturales » — rotation des cultures, labour profond, fumier de bovins, traiter le parasite avec patience plutôt qu'avec des produits chimiques agressifs. Le ton est familier et rassurant : un expert comparera l'engrais — azote, phosphore, potassium — à une assiette équilibrée de riz, de curry et de yaourt, pour que la science ait l'air du simple bon sens. Mais le conseil demande au propriétaire de se réformer pour le marché tout en laissant intact ce sur quoi repose toute l'exploitation : une main-d'œuvre bon marché et liée à la caste. Le déséquilibre se voit dans ce qui est nommé. Le parasite tenace reçoit un nom et une stratégie. La baisse des profits est mise sur le compte du temps — d'un climat qui change — plutôt que sur celui des acheteurs qui paient un peu moins chaque année la même feuille. Les termes de l'échange et les travailleurs du champ restent sans nom, et ils demeurent ainsi un arrière-plan fixe qu'on ne demande à personne de changer.</p>

<p>Ce n'est pas une histoire d'experts cruels, et c'est là la part inconfortable. Leur souci est réel. Leur nostalgie est sincère. Les séminaires sont offerts de bonne foi. Le tri des personnes entre celles qui comptent et celles qui s'effacent ne se fait pas par malveillance. Il se fait par une chaleur ordinaire — l'attraction vers les gens qui semblent les vôtres. Un visage aimable et de bonnes intentions n'annulent pas l'exclusion. Ici, ils en sont le mode de fonctionnement.</p>

<p>Il est utile de savoir comment une personne finit par être comptée comme « libre ». Ces ouvriers sont sans terre parce que, au fil des générations, ils ont perdu l'accès à la terre et en sont venus à dépendre du travail salarié pour les cultivateurs qui l'ont gardée. Être sans terre les laisse aussi libres de partir — et davantage d'entre eux le font, chassés par la chaleur, par la maladie des pesticides, par un travail qui paie peu et use le corps. Leur départ est précisément ce qui produit la pénurie du « pas d'ouvriers à embaucher ». Les experts tendent à lire cette pénurie comme des travailleurs peu fiables, plutôt que comme des gens qui s'éloignent d'un emploi qui leur fait du mal.</p>

<p>Et l'exclusion a un prix qui n'est pas abstrait. Au fil d'une saison, une ouvrière — l'épouse d'un tâcheron — a continué de travailler malgré la maladie qu'ont apportée la culture et ses pesticides, et est morte une fois la récolte rentrée. Le travail s'est brièvement arrêté, puis a repris, car le marché tient son propre calendrier. Sa mort n'a pas été enregistrée par les experts. Non parce que quelqu'un l'aurait écartée, mais à cause d'une catégorie : elle comptait comme une travailleuse « libre », hors du groupe protégé, si bien qu'aucune des aides de l'État aux sinistrés ne l'a atteinte.</p>

<p>Le parasite de cette histoire a bel et bien une fleur frappante — d'un violet vif, sur une tige pâle — alors même que la plante vit en drainant le tabac sous terre. Kurian s'en sert comme d'un miroir de l'expertise : une surface attrayante et, en dessous, une dépendance à un travail caché. Le point n'est pas que les experts soient des imposteurs. C'est que la part visible de l'aide — la méthode, la solution, le séminaire — n'est pas la totalité de ce qui se joue.</p>

<p>L'habitude utile n'est donc pas de se méfier des experts. C'est d'ajouter une question avant la question habituelle. Avant de demander si la réponse d'un expert est juste, demandez à qui ils ont décidé que le problème appartenait. Autour de qui la solution est-elle construite, et qui est traité comme l'arrière-plan sur lequel elle se déroule ? Cette réponse est généralement arrêtée avant qu'aucune donnée ne soit lue — et elle décide qui l'aide atteint, et qui elle laisse de côté.</p>

<p>L'habitude voyage au-delà du tabac, et au-delà de l'Inde. Chaque fois qu'un plan arrive pour réparer quelque chose, il vaut la peine de demander qui a été désigné comme la personne à qui il s'adresse, et qui comme le décor où il se déroule. Le plan lui-même le dit rarement. C'est la part qu'il nous revient de fournir.</p>$body_fr$,
  $meta_fr$À qui l'expert décide que le problème appartient | ONE EIGHT Journal$meta_fr$,
  $sub_fr$Dans un district producteur de tabac en Inde, une maladie des plantes a mis au jour quelque chose sur l'expertise — avant de résoudre un problème, elle choisit le problème de qui elle va résoudre$sub_fr$,
  false
FROM art_8
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

WITH art_9 AS (
  SELECT id FROM public.journal_articles WHERE slug = 'who-the-problem-belongs-to'
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
  art_9.id,
  'it',
  'A chi l''esperto decide che appartenga il problema',
  $sub_it$In un distretto del tabacco in India, una malattia delle piante ha messo a nudo qualcosa sulla competenza — prima di risolvere un problema, sceglie di chi sia il problema da risolvere$sub_it$,
  $body_it$<p>Nel gennaio 2016, vicino al raccolto, funzionari del Tobacco Board indiano attraversarono un campo di tabacco maturo nel distretto di Prakasam, nell'Andhra Pradesh, e trovarono un parassita nel terreno. Era l'<em>Orobanche cernua</em>, una pianta senza un filo di verde, che si nutre agganciandosi alle radici del tabacco. Lasciata fare, può ridurre un raccolto da un quinto fino all'intero. Un funzionario di grado inferiore telefonò all'agricoltore per dirgli di intervenire. L'agricoltore non volle collaborare, e un funzionario anziano scacciò il problema con un gesto: che cosa può fare l'agricoltore, se non ci sono braccianti da assumere.</p>

<p>Si noti chi è appena comparso in quella frase, e come. I braccianti spuntano solo come una carenza — un fattore mancante, un intralcio al raccolto. Un attimo prima, in tutta la conversazione sul raccolto, sul parassita e sull'agricoltore, non erano affatto nominati.</p>

<p>Questa piccola assenza è il tema qui, e indica un'affermazione che vale la pena dire chiaramente. Di solito giudichiamo un esperto da quanto è corretto il consiglio. Ma c'è un passo precedente, e viene esaminato di rado. Prima di decidere che cosa fare di un problema, un esperto decide di chi sia il problema — di chi sia il sostentamento da proteggere. Quella decisione non si prende a partire dai dati. Si prende a partire dalla simpatia: da chi l'esperto sente come simile a sé. E può lasciare interi gruppi di persone fuori dall'inquadratura. Il lavoro sul campo di Amrita Kurian tra coloro che consigliano questi coltivatori di tabacco mostra come, e a quale prezzo.</p>

<p>Cominciamo da chi sono gli esperti e da chi sentono vicino. Sono funzionari del Tobacco Board, scienziati dello Stato e ricercatori dell'azienda del tabacco. Ciò che condividono con gli agricoltori proprietari non è soltanto il sapere tecnico. Tendono a possedere terra essi stessi, provengono dalle stesse caste dominanti e portano lo stesso risentimento — che il mercato mondiale valuti il tabacco indiano come di seconda scelta. La loro premura scorre verso questi agricoltori perché questi agricoltori sembrano loro dei propri. Chi maneggia davvero il raccolto — braccianti senza terra, in maggioranza donne dalit — semplicemente non è colui a cui il consiglio è rivolto.</p>

<p>C'è una ragione strutturale in questo, non solo personale. Il Tobacco Board fu creato nel 1975 per proteggere il sostentamento dei coltivatori di tabacco — cioè di coloro che possiedono la terra e vendono il raccolto. L'istituzione per cui gli esperti lavorano è costruita intorno al proprietario terriero. Così la spinta del cameratismo e il disegno del ruolo puntano nella stessa direzione e si rafforzano a vicenda.</p>

<p>Il legame è anche emotivo in un modo preciso. Esperti e proprietari condividono una ferita: sul mercato mondiale il tabacco indiano è trattato come di bassa qualità e quotato al di sotto della foglia con cui compete. Quel senso condiviso di essere sottovalutati dà all'esperto e all'agricoltore una causa comune, vicina a un patriottismo. È un risentimento reale — ma è definito interamente dal lato del proprietario nel campo. Il risentimento più pesante del bracciante — paga bassa, malattia, nessuna sicurezza — non vi entra mai.</p>

<p>Quell'esclusione non è vaga. Ha effetti concreti. Quando i salari salgono, gli esperti danno la colpa ai braccianti, trattando una paga giornaliera più alta come un difetto dei lavoratori anziché come un segno che il loro potere contrattuale è cresciuto. L'unico modo affidabile per eliminare il parassita è strapparlo a mano, pianta per pianta — un'abilità che i braccianti portano nelle mani. Ma quell'abilità non è contata come competenza, e chi la possiede non è contato come il pubblico che gli esperti servono. E gli esperti parlano con calore della "dedizione" di una generazione precedente, una nostalgia che suona come rispetto ma riscrive di soppiatto il passato, saltando come quei lavoratori abbiano perso la terra e siano stati resi dipendenti in primo luogo.</p>

<p>L'insegnamento stesso appare innocuo, persino progressista. Gli esperti tengono seminari sui "metodi colturali" — rotazione delle colture, aratura profonda, letame bovino, affrontare il parassita con pazienza invece che con sostanze chimiche aggressive. Il tono è familiare e rassicurante: un esperto paragonerà il fertilizzante — azoto, fosforo, potassio — a un piatto equilibrato di riso, curry e yogurt, così che la scienza suoni come puro buonsenso. Ma il consiglio chiede al proprietario di riformare sé stesso per il mercato, lasciando intatto ciò su cui poggia l'intera attività: manodopera a basso costo e vincolata alla casta. L'inclinazione si vede in ciò a cui viene dato un nome. Il parassita ostinato riceve un nome e una strategia. Il calo dei profitti viene attribuito al tempo — a un clima che cambia — e non agli acquirenti che pagano un po' meno ogni anno per la stessa foglia. I termini di scambio e i lavoratori nel campo restano senza nome, e così rimangono uno sfondo fisso che a nessuno viene chiesto di cambiare.</p>

<p>Questa non è una storia di esperti crudeli, ed è questa la parte scomoda. La loro premura è reale. La loro nostalgia è sincera. I seminari sono offerti in buona fede. Lo smistamento delle persone tra quelle che contano e quelle che sbiadiscono non avviene per malizia. Avviene attraverso un calore ordinario — la spinta verso le persone che sembrano le proprie. Un volto gentile e le buone intenzioni non annullano l'esclusione. Qui sono il modo in cui essa opera.</p>

<p>Aiuta sapere come una persona finisca contata come "libera". Questi braccianti sono senza terra perché, nel corso di generazioni, hanno perso l'accesso alla terra e sono arrivati a dipendere dal lavoro salariato per gli agricoltori che l'hanno mantenuta. Essere senza terra li lascia anche liberi di andarsene — e più di loro lo fanno, spinti via dal caldo, dalla malattia da pesticidi, da un lavoro che paga poco e logora il corpo. Il loro andarsene è esattamente ciò che produce la carenza di "nessun bracciante da assumere". Gli esperti tendono a leggere quella carenza come lavoratori inaffidabili, anziché come persone che si allontanano da un impiego che le danneggia.</p>

<p>E l'esclusione ha un prezzo che non è astratto. Nel corso di una stagione, una bracciante — la moglie di un caporale — continuò a lavorare nonostante la malattia che il raccolto e i suoi pesticidi le avevano procurato, e morì dopo che il raccolto fu portato dentro. Il lavoro si fermò brevemente, poi riprese, perché il mercato tiene il proprio calendario. La sua morte non fu registrata dagli esperti. Non perché qualcuno l'avesse esclusa, ma per via di una categoria: contava come lavoratrice "libera", fuori dal gruppo protetto, così che nessuno dei soccorsi statali per le calamità la raggiunse.</p>

<p>Il parassita di questa storia ha davvero un fiore vistoso — di un viola acceso, su uno stelo pallido — anche se la pianta vive prosciugando il tabacco sottoterra. Kurian lo usa come specchio della competenza: una superficie attraente e, sotto, una dipendenza dal lavoro nascosto. Il punto non è che gli esperti siano impostori. È che la parte visibile dell'aiuto — il metodo, il rimedio, il seminario — non è tutto ciò che sta accadendo.</p>

<p>Perciò l'abitudine utile non è diffidare degli esperti. È aggiungere una domanda prima di quella consueta. Prima di chiedere se la risposta di un esperto sia giusta, chiedi a chi hanno deciso che appartenesse il problema. Attorno a chi è costruito il rimedio, e chi è trattato come lo sfondo su cui esso accade? Quella risposta è di solito fissata prima che venga letto qualsiasi dato — e decide chi l'aiuto raggiunge e chi oltrepassa.</p>

<p>L'abitudine viaggia oltre il tabacco, e oltre l'India. Ogni volta che arriva un piano per aggiustare qualcosa, vale la pena chiedere chi sia stato messo come la persona per cui è, e chi come lo scenario in cui si svolge. Il piano stesso lo dice di rado. Quella è la parte che tocca a noi fornire.</p>$body_it$,
  $meta_it$A chi l'esperto decide che appartenga il problema | ONE EIGHT Journal$meta_it$,
  $sub_it$In un distretto del tabacco in India, una malattia delle piante ha messo a nudo qualcosa sulla competenza — prima di risolvere un problema, sceglie di chi sia il problema da risolvere$sub_it$,
  false
FROM art_9
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
WITH art_ref AS (
  SELECT id FROM public.journal_articles WHERE slug = 'who-the-problem-belongs-to'
),
del AS (
  DELETE FROM public.journal_article_references
  WHERE article_id = (SELECT id FROM art_ref)
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
FROM art_ref a
CROSS JOIN (
  VALUES
    (
      1,
      $ref_text$Kurian, Amrita. “Flowers of Deception: The Expert’s Nostalgia for a Future’s Past and its Occlusion of Agrarian Labor.” Cultural Anthropology 39, no. 3 (2024): 455–484. DOI: 10.14506/ca39.3.06. https://doi.org/10.14506/ca39.3.06$ref_text$,
      '10.14506/ca39.3.06',
      'https://doi.org/10.14506/ca39.3.06'
    )
) AS v(sort_order, ref_text, doi, url);

COMMIT;

-- =============================================================================
-- END
-- =============================================================================
