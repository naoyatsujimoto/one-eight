# KPI_SPEC.md — ONE EIGHT KPI仕様書 (Phase 1)

作成日: 2026-08-09  
Timezone: JST (Asia/Tokyo)  
バージョン: 1.0  

---

## 前提・除外条件

KPI集計から**デフォルト除外**するもの：

| 除外条件 | 理由 |
|---|---|
| `profiles.is_internal_test_account = true` | AI確認用テストアカウント |
| `profiles.is_admin = true` | 管理者アクセス |
| `route = '/ai-check-login'` | 内部確認経路 |
| `environment IN ('localhost','preview','development','test')` | 非本番環境 |
| `sim_match_logs` | シミュレーション対局（実ユーザー行動ではない） |
| `event_name = 'test_event'` | 明示的なテストevent |

---

## KPI 一覧

---

### KPI-01: Login Page Views / Unique Visitors / Sessions

| 項目 | 内容 |
|---|---|
| **定義** | ログイン前画面（TitleScreen, AiCheckLogin除く通常ルート）へのアクセス指標 |
| **分子(PV)** | `event_name = 'page_view'` のeventカウント |
| **分子(UV)** | `anonymous_id` のユニーク数 |
| **分子(Session)** | `session_id` のユニーク数 |
| **分母** | N/A (絶対値) |
| **正規データソース** | kpi_events（新規KPI event） |
| **集計単位** | 日次・週次・月次 |
| **除外条件** | `route = '/ai-check-login'`、テスト環境、内部アカウント |
| **timezone** | JST |
| **更新頻度** | リアルタイム蓄積、集計は日次 |
| **後続Phase** | Phase 2でダッシュボード可視化 |

---

### KPI-02: Auth開始・成功・失敗

| 項目 | 内容 |
|---|---|
| **定義** | 認証フロー（Supabase Auth）の各ステップ到達・結果 |
| **分子(開始)** | `event_name = 'auth_started'` のカウント |
| **分子(成功)** | `event_name = 'auth_succeeded'` のカウント |
| **分子(失敗)** | `event_name = 'auth_failed'` のカウント |
| **転換率** | 成功数 / 開始数 |
| **正規データソース** | kpi_events（新規KPI event） + auth.users（登録数確認の正本） |
| **集計単位** | 日次 |
| **除外条件** | テスト環境、内部アカウント |
| **timezone** | JST |
| **更新頻度** | 日次 |
| **後続Phase** | Phase 2 |

---

### KPI-03: 登録数

| 項目 | 内容 |
|---|---|
| **定義** | 新規ユーザー登録完了数（auth.usersへの挿入） |
| **分子** | `auth.users.created_at` の日次カウント |
| **分母** | N/A |
| **正規データソース** | **auth.users**（正本）+ kpi_events `auth_succeeded`（補完） |
| **集計単位** | 日次・週次・月次 |
| **除外条件** | is_internal_test_account、is_admin |
| **timezone** | JST |
| **更新頻度** | 日次 |
| **後続Phase** | Phase 2: Admin RPC経由で取得 |
| **注意** | client eventのみで確定しない。auth.usersが正本 |

---

### KPI-04: DAU / WAU / MAU

| 項目 | 内容 |
|---|---|
| **定義** | 各期間内に1回以上アクティブだったユニークユーザー数 |
| **DAU** | 当日に `session_heartbeat` or `page_view` が1件以上あった `user_id` のユニーク数 |
| **WAU** | 当週（月〜日）内に1件以上あった `user_id` のユニーク数 |
| **MAU** | 当月内に1件以上あった `user_id` のユニーク数 |
| **正規データソース** | kpi_sessions（`user_id IS NOT NULL` = 認証済み） |
| **集計単位** | 日次・週次・月次 |
| **除外条件** | 未認証セッション(user_id IS NULL)、内部アカウント、テスト環境 |
| **timezone** | JST |
| **更新頻度** | 日次 |
| **後続Phase** | Phase 2: Admin集計RPC |

---

### KPI-05: Free / Pro ユーザー数

| 項目 | 内容 |
|---|---|
| **定義** | 現時点のプラン別ユーザー数 |
| **Free** | `profiles.plan = 'free'` のカウント |
| **Pro** | `profiles.plan = 'pro' AND profiles.subscription_status = 'active'` のカウント |
| **正規データソース** | **profiles**（正本）+ paddle_webhook_events（更新経路） |
| **集計単位** | スナップショット（日次） |
| **除外条件** | is_internal_test_account、is_admin |
| **timezone** | JST |
| **更新頻度** | 日次スナップショット |
| **後続Phase** | Phase 2 |

---

### KPI-06: Pro転換・解約・更新

| 項目 | 内容 |
|---|---|
| **定義** | Paddleサブスクリプション変化イベント |
| **Pro転換率** | 新規Pro / (Free + 新規Pro) の期間内比率 |
| **解約数** | `paddle_webhook_events.event_type IN ('subscription.canceled','subscription.past_due')` |
| **更新数** | `paddle_webhook_events.event_type = 'subscription.updated'` (renewal) |
| **正規データソース** | **paddle_webhook_events**（正本）、profiles（現状確認） |
| **集計単位** | 月次 |
| **除外条件** | is_internal_test_account |
| **timezone** | JST |
| **更新頻度** | Webhook受信時 |
| **後続Phase** | Phase 2 |

---

### KPI-07: 対局数と全内訳

| 項目 | 内容 |
|---|---|
| **定義** | 完了した対局の総数と種別内訳 |
| **CPU戦** | `match_logs.mode = 'human_vs_cpu'` のカウント（winner IS NOT NULL） |
| **オンライン** | `match_logs.mode = 'online'` or `online_games` テーブルの完了レコード |
| **公式** | `official_matches.status = 'completed'` のカウント |
| **Arena** | `arena_match_history` のカウント |
| **総数** | 上記全て合算 |
| **正規データソース** | **match_logs**（CPU・オンライン正本）、**official_matches**（公式正本）、**arena_match_history**（Arena正本） |
| **集計単位** | 日次・週次・月次 |
| **除外条件** | is_internal_test_account、sim_match_logs |
| **timezone** | JST |
| **更新頻度** | 日次 |
| **後続Phase** | Phase 2 |
| **注意** | client eventだけで確定しない。DBレコードが正本 |

---

### KPI-08: 対局品質

| 項目 | 内容 |
|---|---|
| **定義** | 対局の質を示す指標群 |
| **完了率** | winner IS NOT NULL の対局 / 全対局開始数 |
| **平均手数** | `match_logs.full_record` のJSONB配列長 の平均 |
| **平均時間** | `match_logs` のcreated_at〜updated_atの差（推定） |
| **正規データソース** | **match_logs**（正本）、official_matches |
| **集計単位** | 週次・月次 |
| **除外条件** | is_internal_test_account、sim_match_logs |
| **timezone** | JST |
| **更新頻度** | 週次 |
| **後続Phase** | Phase 3 |

---

### KPI-09: Arena Funnel / No-Show

| 項目 | 内容 |
|---|---|
| **定義** | Arenaへの参加funnel（エントリー〜対局完了）とNo-Show率 |
| **Funnel** | arena_entries(エントリー) → arena_matches(対局割当) → arena_match_history(完了) |
| **No-Show率** | No-showレコード / arena_matches の割合 |
| **正規データソース** | **arena_entries**、**arena_matches**、**arena_match_history**（全て正本） |
| **集計単位** | イベント単位・月次 |
| **除外条件** | is_internal_test_account |
| **timezone** | JST |
| **更新頻度** | Arena終了後 |
| **後続Phase** | Phase 2 |

---

### KPI-10: Training 開始・完了・再開・脱落・Move別詳細

| 項目 | 内容 |
|---|---|
| **定義** | Trainingの各ステップ到達・完了・脱落の詳細 |
| **開始** | `event_name = 'training_started'` |
| **Step到達** | `event_name = 'training_step_reached'` (props: move_id, step) |
| **完了** | `event_name = 'training_completed'` or `training_progress.completed_at` |
| **再開** | `event_name = 'training_resumed'` |
| **脱落定義** | Move Nへ到達後、完了せず次Moveへも進まず、最終活動から**24時間以上**経過したセッション |
| **Move N脱落率** | Move N脱落セッション数 / Move Nへ到達したセッション数 |
| **正規データソース** | kpi_events（開始・進行・脱落検知）、**training_progress**（完了の正本） |
| **集計単位** | Move単位・週次 |
| **除外条件** | is_internal_test_account |
| **timezone** | JST |
| **更新頻度** | 日次（脱落は24時間後に確定） |
| **後続Phase** | Phase 2: 脱落分析ダッシュボード |
| **注意** | training_progressが完了の正本。client eventは補完情報 |

---

### KPI-11: Activation

| 項目 | 内容 |
|---|---|
| **定義** | **登録後7日以内**に、完了対局またはTraining完了へ到達したユーザー比率 |
| **分子** | 登録後7日以内に `match_logs.winner IS NOT NULL` または `training_progress.completed_at` が存在するユーザー数 |
| **分母** | 対象コホートの登録ユーザー数（auth.users.created_at基準） |
| **正規データソース** | **auth.users**（登録日正本）、**match_logs**（対局完了正本）、**training_progress**（Training完了正本） |
| **集計単位** | 登録週コホート |
| **除外条件** | is_internal_test_account、is_admin |
| **timezone** | JST |
| **更新頻度** | 週次（コホート7日後に確定） |
| **後続Phase** | Phase 3 |

---

### KPI-12: D1 / D7 / D30 Retention

| 項目 | 内容 |
|---|---|
| **定義** | 登録後D1/D7/D30日に再来訪したユーザーの比率 |
| **D1** | 登録翌日にsessionが存在するユーザー / コホート登録数 |
| **D7** | 登録7日後（±1日）にsessionが存在するユーザー / コホート登録数 |
| **D30** | 登録30日後（±3日）にsessionが存在するユーザー / コホート登録数 |
| **正規データソース** | **auth.users**（登録日）、**kpi_sessions**（再来訪確認） |
| **集計単位** | 登録日コホート |
| **除外条件** | is_internal_test_account |
| **timezone** | JST |
| **更新頻度** | D1は翌日、D7は8日後、D30は31日後に確定 |
| **後続Phase** | Phase 3 |

---

### KPI-13: Cohort

| 項目 | 内容 |
|---|---|
| **定義** | 登録週コホート別の継続率・対局数推移 |
| **コホート軸** | 登録週（ISO week） |
| **指標** | 各週の継続率（DAU/登録数）、累積対局数 |
| **正規データソース** | **auth.users**（コホート基点）、**kpi_sessions**、**match_logs** |
| **集計単位** | 週次コホート × 経過週 |
| **除外条件** | is_internal_test_account |
| **timezone** | JST |
| **更新頻度** | 週次 |
| **後続Phase** | Phase 3 |

---

### KPI-14: Postmortem

| 項目 | 内容 |
|---|---|
| **定義** | Postmortem機能の利用指標 |
| **開始** | `event_name = 'postmortem_started'` |
| **完了** | `event_name = 'postmortem_completed'` |
| **失敗** | `event_name = 'postmortem_failed'` |
| **再取得** | `event_name = 'postmortem_refreshed'` |
| **候補表示** | `event_name = 'postmortem_candidates_opened'` |
| **完了率** | 完了数 / 開始数 |
| **正規データソース** | kpi_events（新規KPI event）、match_logs（対局との突合） |
| **集計単位** | 日次 |
| **除外条件** | is_internal_test_account |
| **timezone** | JST |
| **更新頻度** | 日次 |
| **後続Phase** | Phase 2 |
| **注意** | 既存Postmortemロジック変更禁止。eventのみ追加 |

---

### KPI-15: Locale / Device

| 項目 | 内容 |
|---|---|
| **定義** | ユーザーの言語・デバイス分布 |
| **Locale** | kpi_events.locale の分布 |
| **Device** | kpi_events.device_class の分布（desktop/mobile/tablet/unknown） |
| **OS** | kpi_events.os_family の分布 |
| **Browser** | kpi_events.browser_family の分布 |
| **正規データソース** | kpi_events |
| **集計単位** | 月次 |
| **除外条件** | is_internal_test_account |
| **timezone** | JST |
| **更新頻度** | 月次 |
| **注意** | User-Agent全文保存禁止。粗い分類のみ |
| **後続Phase** | Phase 2 |

---

### KPI-16: System Health

| 項目 | 内容 |
|---|---|
| **定義** | フロントエンド・RPC・Realtimeのエラー率 |
| **Frontend Error率** | `event_name = 'frontend_error'` 数 / DAU |
| **RPC Error率** | `event_name = 'rpc_error'` 数 / total RPC calls（推定） |
| **Realtime再接続数** | `event_name = 'realtime_reconnected'` のカウント |
| **Performance** | `event_name = 'performance_measure'` のprops.value統計 |
| **正規データソース** | kpi_events |
| **集計単位** | 日次 |
| **除外条件** | テスト環境 |
| **timezone** | JST |
| **更新頻度** | 日次 |
| **後続Phase** | Phase 2: アラート設定 |
| **注意** | errorのstack全文保存禁止 |

---

## 各KPI 正本データソース早見表

| KPI | 正本 | 補完 |
|---|---|---|
| PV/UV/Session | kpi_events | kpi_sessions |
| Auth | kpi_events | auth.users |
| 登録数 | auth.users | kpi_events |
| DAU/WAU/MAU | kpi_sessions | kpi_events |
| Free/Pro数 | profiles | paddle_webhook_events |
| Pro転換/解約 | paddle_webhook_events | profiles |
| 対局数 | match_logs, official_matches, arena_match_history | kpi_events |
| 対局品質 | match_logs | — |
| Arena Funnel | arena_entries/matches/history | kpi_events |
| Training | training_progress | kpi_events |
| Activation | auth.users + match_logs + training_progress | kpi_events |
| D1/D7/D30 | auth.users + kpi_sessions | — |
| Cohort | auth.users + kpi_sessions + match_logs | — |
| Postmortem | kpi_events | match_logs |
| Locale/Device | kpi_events | — |
| System Health | kpi_events | — |

---

## official_kpi_start_at について

`kpi_settings.official_kpi_start_at` は **NULL** で初期化する。  
この値が設定されるまで、KPIは「参考値（データ収集フェーズ）」として扱う。  
値の設定はNaoyaの明示的な指示による。

---

## Phase別実装計画

| Phase | 内容 |
|---|---|
| Phase 1（本）| KPI仕様書、Event catalog、DB migration、Tracker基盤 |
| Phase 2 | Admin KPIダッシュボード、集計RPC、可視化 |
| Phase 3 | Retention/Cohort分析、Activation詳細、自動アラート |
| Phase 4 | 外部BI連携（検討） |

---

## Phase 2 実装記録（2026-08-09）

### Phase 2 接続済みevent

| Event | 送信タイミング | 送信箇所 | 除外 |
|---|---|---|---|
| `session_started` | 初回アクセス時・30分inactivity後 | useKpiLifecycle | /ai-check-login |
| `session_heartbeat` | 60秒間隔・visible+activity有 | useKpiLifecycle | hidden/no activity |
| `page_view` | ログイン画面表示時（1回のみ） | AuthGate | 認証済みユーザー・/ai-check-login |
| `auth_started` | Magic Link / OTP送信直前 | AuthGate | /ai-check-login |
| `auth_succeeded` | SIGNED_IN event受信後 | useAuthSucceededWatcher | INITIAL_SESSION・token refresh・reload |
| `auth_failed` | 認証要求失敗時 | AuthGate | /ai-check-login |
| `language_changed` | locale実際変更時 | LangProvider | 初期読込・同一locale再選択 |

### Phase 2 Session定義

| 要素 | 仕様 |
|---|---|
| 開始 | 初回アクセス時・30分以上inactivity後の活動 |
| 終了 | ログアウト時（次回は新session） |
| anonymous_id | localStorage永続（logout後も維持） |
| session_id | sessionStorage（logout/user切替でリセット） |
| 30分inactivity | localStorage保存のlast_activity_atで判定 |

### Phase 2 認証二重計上防止

| ケース | 対策 |
|---|---|
| INITIAL_SESSION (page reload) | auth_succeededを送信しない |
| SIGNED_IN重複 | 同一userId・5秒以内はスキップ |
| token refresh | TOKEN_REFRESHED eventは無視 |
| auth button二重tap | pendingAuthRef フラグで排除 |

### Phase 2 登録正本

- 正本: `auth.users` テーブル
- 除外: `is_admin=true` / `is_internal_test_account=true`
- 集計RPC: `admin_get_kpi_acquisition_auth_summary`

### Phase 2 Pro正本・分類

| 分類 | 条件 |
|---|---|
| `free` | plan != 'pro' |
| `active_pro` | plan='pro' + status='active' + period_end未来 |
| `canceled_but_active_until_period_end` | plan='pro' + status='canceled' + period_end未来 |
| `inactive_expired` | その他のpro状態 |
| `excluded` | is_internal_test_account=true または internal_plan_override IS NOT NULL |

DB関数: `_kpi_is_pro_active()` / `_kpi_classify_pro_status()`

### Phase 2 追加RPC

| RPC | 用途 |
|---|---|
| `admin_get_kpi_acquisition_auth_summary(p_from, p_to, p_timezone, p_include_internal)` | 集客・認証・登録・Pro集計 |
| `_kpi_is_pro_active()` | Pro有効判定（DB側） |
| `_kpi_classify_pro_status()` | Pro状態4分類 |
| `_kpi_require_admin()` | Admin確認ヘルパー |
| `admin_kpi_users_view` | PIIなしAdmin用ユーザービュー |

### Phase 2 プライバシー確認事項（法務確認待ち）

以下の項目は法務確認事項として記録のみ。Terms/Privacy文言は未変更：
- session tracking（anonymous_id）のcookieless計測
- heartbeatによる滞在時間推計
- auth_started/succeeded/failedによるログインfunnel計測

### Phase 3 引継ぎ事項

- 対局・Arena計測接続（後続Phase）
- Training計測接続（後続Phase）
- Postmortem計測接続（後続Phase）
- system health接続（後続Phase）
- Admin Dashboard UI（後続Phase）
