#!/usr/bin/env python3
"""
gen_salamander_seed.py
salamander記事の10言語seed SQLを生成する。
入力: approved multilingualファイル
出力: supabase/seeds/journal_salamander_seed.sql
"""
import re
import sys
import html

APPROVED_FILE = "/Users/nt/Desktop/ONE_EIGHT_JOURNAL/approved/oej-2026-salamander-community-science_when-rare-ones-get-recorded_REVIEWED_multilingual.md"

def paragraphs_to_html(text: str) -> str:
    """改行2つ以上で区切られた段落をHTMLの<p>タグに変換する。"""
    text = text.strip()
    # 段落分割（連続する改行）
    paragraphs = re.split(r'\n{2,}', text)
    html_parts = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        # 区切り線（---）はスキップ
        if re.match(r'^-{3,}$', para):
            continue
        # 単一の改行は<br>に変換
        para = para.replace('\n', '<br>\n')
        html_parts.append(f'<p>{para}</p>')
    return '\n\n'.join(html_parts)

def extract_section(content: str, start_marker: str, end_marker: str) -> str:
    """start_marker から end_marker までのテキストを抽出する。"""
    start_idx = content.find(start_marker)
    if start_idx == -1:
        return ""
    start_idx += len(start_marker)
    end_idx = content.find(end_marker, start_idx)
    if end_idx == -1:
        return content[start_idx:].strip()
    return content[start_idx:end_idx].strip()

def sql_escape(s: str) -> str:
    """PostgreSQL dollar-quoting用にそのまま返す（$body_html$デリミタを使用）。"""
    # dollar-quotingを使うので特別なエスケープ不要
    return s

def extract_title_subtitle(body: str) -> tuple[str, str]:
    """本文先頭の **タイトル** と **サブタイトル** を抽出する。"""
    title = ""
    subtitle = ""
    lines = body.split('\n')
    for line in lines:
        line = line.strip()
        if line.startswith('**') and line.endswith('**') and not title:
            # **Title: xxx** or **タイトル: xxx** patterns
            content = line[2:-2].strip()
            # "Title: " "Título: " etc を取り除く
            # Remove label prefixes
            for prefix in ['Title: ', 'Título: ', 'Titre\u00a0: ', 'Titolo: ', 'Titel: ',
                           '제목: ', '标题：', '標題：', 'Título:', 'title:',
                           'Título\u00a0: ', 'Titre : ']:
                if content.startswith(prefix):
                    content = content[len(prefix):]
                    break
            title = content
        elif line.startswith('**') and line.endswith('**') and title and not subtitle:
            content = line[2:-2].strip()
            # Remove subtitle label prefixes
            for prefix in ['Subtitle: ', 'Subtítulo: ', 'Sous-titre\u00a0: ', 'Sottotitolo: ',
                           'Untertitel: ', '부제: ', '副标题：', '副標題：',
                           'Sous-titre : ', 'Subtítulo:']:
                if content.startswith(prefix):
                    content = content[len(prefix):]
                    break
            subtitle = content
            break
    return title, subtitle

with open(APPROVED_FILE, 'r', encoding='utf-8') as f:
    full_content = f.read()

# ─── 各言語のセクションを抽出 ───────────────────────────────────────────────────

# EN section: ## 1. English article draft → ## 2. Japanese article draft
en_body_raw = extract_section(
    full_content,
    "## 1. English article draft\n",
    "## 2. Japanese article draft"
).strip()

# JA section: ## 2. Japanese article draft → ## 3. References
ja_body_raw = extract_section(
    full_content,
    "## 2. Japanese article draft\n",
    "## 3. References"
).strip()

# Multilingual sections: ## 9. Multilingual versions → ## 10. Multilingual metadata
multilingual_section = extract_section(
    full_content,
    "## 9. Multilingual versions\n",
    "## 10. Multilingual metadata"
).strip()

def extract_lang_body(section: str, lang_header: str, next_lang_header: str) -> str:
    """言語セクションの本文を抽出する。"""
    body = extract_section(section, lang_header, next_lang_header)
    return body.strip()

# en/jaは既にあるので9-3以降を取得
zh_hant_body = extract_lang_body(multilingual_section, "### 9-3. Traditional Chinese / zh-Hant\n", "### 9-4. Simplified Chinese / zh-Hans")
zh_hans_body = extract_lang_body(multilingual_section, "### 9-4. Simplified Chinese / zh-Hans\n", "### 9-5. Korean / ko")
ko_body      = extract_lang_body(multilingual_section, "### 9-5. Korean / ko\n", "### 9-6. Spanish / es")
es_body      = extract_lang_body(multilingual_section, "### 9-6. Spanish / es\n", "### 9-7. Brazilian Portuguese / pt-BR")
pt_br_body   = extract_lang_body(multilingual_section, "### 9-7. Brazilian Portuguese / pt-BR\n", "### 9-8. German / de")
de_body      = extract_lang_body(multilingual_section, "### 9-8. German / de\n", "### 9-9. French / fr")
fr_body      = extract_lang_body(multilingual_section, "### 9-9. French / fr\n", "### 9-10. Italian / it")
it_body      = extract_lang_body(multilingual_section, "### 9-10. Italian / it\n", "---\n")

# en_bodyからタイトル・サブタイトルを抽出したあと、本文のみ抜く
def remove_title_lines(body: str) -> str:
    """先頭の **xxx** 行を2行除去する。"""
    lines = body.split('\n')
    removed = 0
    result = []
    for line in lines:
        stripped = line.strip()
        if removed < 2 and stripped.startswith('**') and stripped.endswith('**'):
            removed += 1
            continue
        result.append(line)
    return '\n'.join(result).strip()

# タイトル・サブタイトル・本文を言語ごとに準備
langs = {
    'en': {
        'raw': en_body_raw,
        'title_en': 'When the Rare Ones Get Recorded, How Does Nature Look?',
        'subtitle': 'Salamanders under the leaf litter of New Brunswick, and the gap between what is there and what gets photographed',
        'is_primary': True,
    },
    'ja': {
        'raw': ja_body_raw,
        'title_en': '珍しい個体ばかりが記録されると、自然はどう見え変わるか',
        'subtitle': 'ニュー・ブランズウィックの落ち葉の下のサンショウウオと、そこにいるものと撮られるもののあいだ',
        'is_primary': False,
    },
    'zh-Hant': {
        'raw': zh_hant_body,
        'title_en': '當被記錄下來的總是罕見的那些，自然看起來會是什麼樣子？',
        'subtitle': '新伯倫瑞克落葉層下的蠑螈，以及「實際存在的」與「被拍下的」之間的落差',
        'is_primary': False,
    },
    'zh-Hans': {
        'raw': zh_hans_body,
        'title_en': '当被记录下来的总是那些罕见的个体，自然看起来会是什么样子？',
        'subtitle': '新不伦瑞克落叶层下的蝾螈，以及"实际存在的"与"被拍下的"之间的落差',
        'is_primary': False,
    },
    'ko': {
        'raw': ko_body,
        'title_en': '드문 것들만 기록될 때, 자연은 어떻게 보이는가?',
        'subtitle': '뉴브런즈윅 낙엽층 아래의 도롱뇽, 그리고 실제로 그곳에 있는 것과 사진에 찍히는 것 사이의 간극',
        'is_primary': False,
    },
    'es': {
        'raw': es_body,
        'title_en': 'Cuando lo que se registra son siempre los raros, ¿cómo se ve la naturaleza?',
        'subtitle': 'Salamandras bajo la hojarasca de Nuevo Brunswick, y la distancia entre lo que hay y lo que se fotografía',
        'is_primary': False,
    },
    'pt-BR': {
        'raw': pt_br_body,
        'title_en': 'Quando os registrados são sempre os raros, como a natureza aparece?',
        'subtitle': 'Salamandras sob a serapilheira de Nova Brunswick, e a distância entre o que está lá e o que é fotografado',
        'is_primary': False,
    },
    'de': {
        'raw': de_body,
        'title_en': 'Wenn immer nur die seltenen aufgenommen werden – wie sieht die Natur dann aus?',
        'subtitle': 'Salamander unter dem Falllaub von New Brunswick, und der Abstand zwischen dem, was da ist, und dem, was fotografiert wird',
        'is_primary': False,
    },
    'fr': {
        'raw': fr_body,
        'title_en': 'Quand ce sont toujours les rares qu\'on enregistre, à quoi ressemble la nature ?',
        'subtitle': 'Des salamandres sous la litière du Nouveau-Brunswick, et l\'écart entre ce qui est là et ce qui est photographié',
        'is_primary': False,
    },
    'it': {
        'raw': it_body,
        'title_en': 'Quando a essere registrati sono sempre i rari, come appare la natura?',
        'subtitle': 'Salamandre sotto la lettiera del New Brunswick, e la distanza tra ciò che c\'è e ciò che viene fotografato',
        'is_primary': False,
    },
}

# 各言語の本文をHTMLに変換
for lang, data in langs.items():
    raw = data['raw']
    # タイトル行を除去
    body_only = remove_title_lines(raw)
    data['body_html'] = paragraphs_to_html(body_only)
    # excerptは最初の段落から先頭200文字
    first_para = re.split(r'\n{2,}', body_only)[0].strip() if body_only else ''
    # **bold** 除去
    first_para = re.sub(r'\*\*(.+?)\*\*', r'\1', first_para)
    data['excerpt'] = first_para[:200]

# SQLを生成
sql_parts = ["""-- =============================================================================
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

"""]

# 2. journal_article_translations - 10言語
sql_parts.append("-- ─────────────────────────────────────────────────────────────────────────────\n-- 2. journal_article_translations (10 languages)\n-- ─────────────────────────────────────────────────────────────────────────────\n")

for lang, data in langs.items():
    title = data['title_en'].replace("'", "''")
    excerpt = data['excerpt'].replace("'", "''")
    body_html = data['body_html']
    is_primary = 'TRUE' if data['is_primary'] else 'FALSE'

    sql_parts.append(f"""WITH article_{lang.replace('-', '_')} AS (
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
  article_{lang.replace('-', '_')}.id,
  '{lang}',
  '{title}',
  '{excerpt}',
  $body_html_{lang.replace('-', '_')}${body_html}$body_html_{lang.replace('-', '_')}$,
  '{title}',
  '{excerpt[:160]}',
  {is_primary}
FROM article_{lang.replace('-', '_')}
ON CONFLICT (article_id, lang) DO UPDATE
  SET
    title            = EXCLUDED.title,
    excerpt          = EXCLUDED.excerpt,
    body_html        = EXCLUDED.body_html,
    meta_title       = EXCLUDED.meta_title,
    meta_description = EXCLUDED.meta_description,
    is_primary       = EXCLUDED.is_primary,
    updated_at       = now();

""")

# 3. journal_article_references
sql_parts.append("""-- ─────────────────────────────────────────────────────────────────────────────
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
""")

output = '\n'.join(sql_parts)

output_path = "/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/supabase/seeds/journal_salamander_seed.sql"
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(output)

print(f"Generated: {output_path}")
print(f"Total chars: {len(output)}")
print("Languages included:", list(langs.keys()))
