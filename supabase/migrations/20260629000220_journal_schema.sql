-- =============================================================================
-- Journal Schema (DRAFT) — Step B-1
-- Created: 2026-06-29
-- !! DO NOT APPLY TO DB — For review only !!
-- =============================================================================
-- Tables:
--   1. journal_articles               記事メタ情報
--   2. journal_article_translations   記事本文・翻訳
--   3. journal_article_references     参考文献
--   4. journal_mail_issues            月次メールIssue
--   5. journal_delivery_history       メール配信履歴（PII含む・service_role専用）
--   6. journal_email_preferences      Journal購読設定 / unsubscribe（emailなし）
-- =============================================================================
-- Design principles:
--   - email は auth.users.email にのみ存在する（PII分離）
--   - anon/authenticated に公開するのは published 記事のみ
--   - admin 操作 / 配信操作は後続 RPC / Edge Function 前提
--   - RLS enabled on all tables; direct INSERT/UPDATE/DELETE policy なし
-- =============================================================================

-- ---------------------------------------------------------------------------
-- shared: updated_at 自動更新トリガー関数
-- 既存 migration に同名関数なし（grep 確認済み）
-- ---------------------------------------------------------------------------
create or replace function public.journal_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- 1. journal_articles
--    記事本体のメタ情報を管理する（本文は journal_article_translations に置く）
-- =============================================================================
create table if not exists public.journal_articles (
  id                    uuid        primary key default gen_random_uuid(),
  slug                  text        not null unique,
  status                text        not null,
  author_label          text        not null default 'ONE EIGHT Journal',
  tags                  text[]      not null default '{}',
  published_at          timestamptz,
  created_by_user_id    uuid        references auth.users(id) on delete set null,
  approved_by_user_id   uuid        references auth.users(id) on delete set null,
  approved_at           timestamptz,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint journal_articles_status_check
    check (status in ('draft', 'review', 'approved', 'published', 'archived')),

  constraint journal_articles_slug_nonempty
    check (char_length(slug) > 0)
);

comment on table  public.journal_articles                     is 'Journal記事メタ情報。本文は journal_article_translations に格納する。';
comment on column public.journal_articles.slug                is 'URL用スラッグ。一意・運用原則として変更不可。';
comment on column public.journal_articles.status              is 'draft | review | approved | published | archived';
comment on column public.journal_articles.published_at        is 'NULL なら未公開。公開判定は status=published かつ published_at IS NOT NULL かつ published_at <= now() を基本とする。';
comment on column public.journal_articles.archived_at         is '論理アーカイブ日時。status が archived になった時刻を記録する。';

-- slug は unique 制約で自動インデックス済み
-- 公開記事一覧クエリ用インデックス
create index if not exists journal_articles_status_published_at_idx
  on public.journal_articles (status, published_at);

create trigger journal_articles_set_updated_at
  before update on public.journal_articles
  for each row execute function public.journal_set_updated_at();

-- RLS
alter table public.journal_articles enable row level security;

-- anon / authenticated: published 記事のみ SELECT 可
create policy "journal_articles_select_published"
  on public.journal_articles for select
  using (
    status = 'published'
    and published_at is not null
    and published_at <= now()
  );

-- INSERT / UPDATE / DELETE は直接許可しない（後続 RPC / service_role 前提）

-- =============================================================================
-- 2. journal_article_translations
--    記事本文・タイトル・excerpt を言語ごとに管理する
-- =============================================================================
create table if not exists public.journal_article_translations (
  id               uuid        primary key default gen_random_uuid(),
  article_id       uuid        not null references public.journal_articles(id) on delete cascade,
  lang             text        not null,
  title            text        not null,
  excerpt          text,
  body_html        text        not null,
  meta_title       text,
  meta_description text,
  is_primary       boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- 1 記事につき言語は 1 レコードのみ（unique 制約で自動インデックス済み）
  constraint journal_article_translations_article_lang_unique
    unique (article_id, lang),

  constraint journal_article_translations_lang_check
    check (lang in ('en', 'ja'))
);

comment on table  public.journal_article_translations              is 'Journal記事翻訳。body_html は承認済み HTML を格納する（sanitize はアプリ/運用側実施）。';
comment on column public.journal_article_translations.lang         is 'en または ja';
comment on column public.journal_article_translations.body_html    is '承認済み HTML 本文。XSS 対策 sanitize はアプリ側実施前提。';
comment on column public.journal_article_translations.is_primary   is 'この言語が当該記事の primary 翻訳かどうか。partial unique index で 1 記事 1 件に制約する。';

-- 同一記事で is_primary=true が 1 件のみになるよう partial unique index
create unique index if not exists journal_article_translations_one_primary_per_article
  on public.journal_article_translations (article_id)
  where is_primary = true;

create trigger journal_article_translations_set_updated_at
  before update on public.journal_article_translations
  for each row execute function public.journal_set_updated_at();

-- RLS
alter table public.journal_article_translations enable row level security;

-- anon / authenticated: 親 article が published の場合のみ SELECT 可
create policy "journal_article_translations_select_published"
  on public.journal_article_translations for select
  using (
    exists (
      select 1
      from public.journal_articles a
      where a.id = article_id
        and a.status = 'published'
        and a.published_at is not null
        and a.published_at <= now()
    )
  );

-- INSERT / UPDATE / DELETE は直接許可しない

-- =============================================================================
-- 3. journal_article_references
--    記事末尾の参考文献を表示順付きで管理する
-- =============================================================================
create table if not exists public.journal_article_references (
  id         uuid        primary key default gen_random_uuid(),
  article_id uuid        not null references public.journal_articles(id) on delete cascade,
  sort_order int         not null default 0,
  ref_text   text        not null,
  doi        text,
  url        text,
  created_at timestamptz not null default now(),

  -- 同一記事内で sort_order は一意（unique 制約で自動インデックス済み）
  constraint journal_article_references_article_order_unique
    unique (article_id, sort_order)
);

comment on table  public.journal_article_references             is '記事末尾の参考文献リスト。書誌の詳細構造化は不要。ref_text が主。';
comment on column public.journal_article_references.sort_order  is '表示順（昇順）。記事内で一意。';
comment on column public.journal_article_references.ref_text    is '参考文献テキスト本体（著者・タイトル・出版情報等を自由形式で記載）。';
comment on column public.journal_article_references.doi         is 'DOI（任意）。';
comment on column public.journal_article_references.url         is 'URL（任意）。';

-- RLS
alter table public.journal_article_references enable row level security;

-- anon / authenticated: 親 article が published の場合のみ SELECT 可
create policy "journal_article_references_select_published"
  on public.journal_article_references for select
  using (
    exists (
      select 1
      from public.journal_articles a
      where a.id = article_id
        and a.status = 'published'
        and a.published_at is not null
        and a.published_at <= now()
    )
  );

-- INSERT / UPDATE / DELETE は直接許可しない

-- =============================================================================
-- 4. journal_mail_issues
--    月次 Journal メール Issue を管理する
-- =============================================================================
create table if not exists public.journal_mail_issues (
  id                  uuid        primary key default gen_random_uuid(),
  issue_number        int         not null unique,
  issue_year_month    text        not null,              -- 'YYYY-MM' 形式
  selected_article_id uuid        references public.journal_articles(id) on delete set null,
  status              text        not null default 'draft',
  approved_by_user_id uuid        references auth.users(id) on delete set null,
  approved_at         timestamptz,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint journal_mail_issues_status_check
    check (status in ('draft', 'approved', 'sending', 'sent', 'cancelled')),

  -- 'YYYY-MM' 形式チェック
  constraint journal_mail_issues_year_month_format
    check (issue_year_month ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

comment on table  public.journal_mail_issues                     is '月次 Journal メール Issue。1 Issue = 1 記事送信を基本とする。sent 後の再送防止は後続 RPC / Edge Function で厳密化する。';
comment on column public.journal_mail_issues.issue_number        is '発行番号（通算）。一意・単調増加。';
comment on column public.journal_mail_issues.issue_year_month    is '対象年月（YYYY-MM 形式）。';
comment on column public.journal_mail_issues.selected_article_id is '送付する記事の ID。NULL の場合は記事未選定。';
comment on column public.journal_mail_issues.status              is 'draft | approved | sending | sent | cancelled';
comment on column public.journal_mail_issues.sent_at             is '送信完了日時。NULL なら未送信。';

-- issue_number は unique 制約で自動インデックス済み
create index if not exists journal_mail_issues_year_month_idx
  on public.journal_mail_issues (issue_year_month);

create index if not exists journal_mail_issues_status_idx
  on public.journal_mail_issues (status);

create trigger journal_mail_issues_set_updated_at
  before update on public.journal_mail_issues
  for each row execute function public.journal_set_updated_at();

-- RLS: enabled だがポリシーなし = anon / authenticated は一切参照不可
-- admin 操作 / 配信操作は service_role 経由の後続 RPC 前提
alter table public.journal_mail_issues enable row level security;

-- =============================================================================
-- 5. journal_delivery_history
--    メール配信履歴と二重送信防止を管理する
--    !! email カラム PII 含む。anon / authenticated 公開禁止 !!
-- =============================================================================
create table if not exists public.journal_delivery_history (
  id            uuid        primary key default gen_random_uuid(),
  issue_id      uuid        not null references public.journal_mail_issues(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  -- 送信時点のアドレスをスナップショット（後で auth.users が変更されても履歴を保持する）
  email         text        not null,
  lang          text        not null,
  status        text        not null,
  error_message text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),

  -- 1 Issue につき 1 ユーザーへの送信は 1 レコードのみ（二重送信防止）
  -- unique 制約で自動インデックス済み（(issue_id, user_id) の複合インデックス）
  constraint journal_delivery_history_issue_user_unique
    unique (issue_id, user_id),

  constraint journal_delivery_history_lang_check
    check (lang in ('en', 'ja')),

  constraint journal_delivery_history_status_check
    check (status in ('sent', 'failed', 'skipped'))
);

comment on table  public.journal_delivery_history               is 'メール配信履歴。unique(issue_id, user_id) により二重送信を防止する。email はPIIのため anon / authenticated アクセス禁止。';
comment on column public.journal_delivery_history.email         is '送信時点のメールアドレスのスナップショット（PII）。service_role / admin 専用。';
comment on column public.journal_delivery_history.lang          is '送信時に使用した言語（en | ja）。';
comment on column public.journal_delivery_history.status        is 'sent | failed | skipped';
comment on column public.journal_delivery_history.error_message is 'status が failed の場合のエラー詳細。';

-- user_id 単体インデックス（ユーザー別配信履歴参照用）
-- (issue_id, user_id) は unique 制約で自動インデックス済み
create index if not exists journal_delivery_history_user_id_idx
  on public.journal_delivery_history (user_id);

-- RLS: enabled だがポリシーなし = anon / authenticated は一切参照不可
-- email PII を含む。service_role 経由の後続 RPC 専用。
alter table public.journal_delivery_history enable row level security;

-- =============================================================================
-- 6. journal_email_preferences
--    Journal メールの購読状態と unsubscribe token を管理する
--    email カラムなし（email は auth.users.email を参照する設計）
-- =============================================================================
create table if not exists public.journal_email_preferences (
  id                uuid        primary key default gen_random_uuid(),
  -- ログイン必須（1 ユーザーにつき 1 行）
  user_id           uuid        not null unique references auth.users(id) on delete cascade,
  subscribed        boolean     not null default true,
  -- unsubscribe リンク用トークン。メール本文に埋め込む。認証不要解除 RPC で使用。
  -- 型を uuid にすることで gen_random_uuid() の出力をそのまま使用可能
  unsubscribe_token uuid        not null unique default gen_random_uuid(),
  unsubscribed_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table  public.journal_email_preferences                    is 'Journal メール購読設定。email は auth.users.email を使うため本テーブルに email カラムなし。1 ユーザー 1 行。';
comment on column public.journal_email_preferences.user_id            is 'auth.users.id に対応。一意（1 ユーザー 1 行）。';
comment on column public.journal_email_preferences.subscribed         is 'true = 購読中 / false = unsubscribe 済み。';
comment on column public.journal_email_preferences.unsubscribe_token  is 'unsubscribe リンク用の一意 UUID トークン。メール本文に埋め込む。変更は後続 RPC 経由のみ。';
comment on column public.journal_email_preferences.unsubscribed_at    is 'unsubscribe した日時（subscribed が false になった時刻）。';

-- user_id / unsubscribe_token は unique 制約で自動インデックス済み

create trigger journal_email_preferences_set_updated_at
  before update on public.journal_email_preferences
  for each row execute function public.journal_set_updated_at();

-- RLS
alter table public.journal_email_preferences enable row level security;

-- authenticated user: 自分の行のみ SELECT 可
-- UPDATE は後続 RPC 経由（unsubscribe_token を自分で書き換えられないよう直接 UPDATE policy は付与しない）
create policy "journal_email_preferences_select_own"
  on public.journal_email_preferences for select
  to authenticated
  using (user_id = auth.uid());

-- INSERT / UPDATE / DELETE は直接許可しない（後続 RPC 前提）
-- anon は一切アクセス不可

-- =============================================================================
-- END OF DRAFT
-- =============================================================================
-- 次ステップ（Step B-2 以降の候補）:
--   - 既存ユーザーへの default opt-in バックフィル（後続 Step）
--   - 配信用 RPC（issue 送信 / unsubscribe 処理）
--   - Edge Function（メール送信基盤）
--   - admin 管理 UI（記事管理・Issue 管理）
--   - 購読フォーム UI
-- =============================================================================
