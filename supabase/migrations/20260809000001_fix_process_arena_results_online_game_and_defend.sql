-- =============================================================================
-- Fix: process_arena_results() — 3点修正
--
-- 修正1: Pass 1（片側未入室 forfeit）で online_games を status='finished' へ更新
--        8/9 JAGUAR戦（Master入室・challenger未入室）で online_game が
--        playing 状態のまま残り、Master端末に終局表示が出なかった問題を解消。
--
-- 修正2: RECORD型 IS NOT NULL 安全判定を FOUND フラグ方式に変更
--        PL/pgSQL の複合行（composite row）に対する IS NOT NULL は、
--        行内に NULL 列があると false を返すため、FOUND を使用する。
--        これにより Master 本人（black=Master）勝利が誤って transferred に
--        なっていた問題を解消。
--
-- 修正3（defend判定明確化）:
--        master_subtype='defend' で現 Master 本人（black=Master）が勝者の場合は
--        end_reason が normal / timeout / no_show いずれでも master_effect='defended'
--        挑戦者（white=challenger）が勝者の場合のみ 'transferred'
--
-- 変更しないもの:
--   - ポイント計算ロジック
--   - no_contest / cancelled / draw ブランチ
--   - inaugural / master_succession / interim_set ブランチ
--   - arena_points, arena_match_history, arena_matches 更新ロジック
--   - arena_events completed 化 (Step 10)
--   - SECURITY DEFINER / SET search_path = public
--   - GRANT/REVOKE パターン
-- =============================================================================

DROP FUNCTION IF EXISTS process_arena_results();

CREATE OR REPLACE FUNCTION process_arena_results()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count   int := 0;
  v_processed_count int := 0;
  v_errors          jsonb := '[]'::jsonb;

  -- Pass 1 カーソル用変数
  r_exp             RECORD;
  v_timer_total_sec int;
  v_black_null      bool;
  v_white_null      bool;
  v_new_om_status   text;
  v_new_om_result   text;
  v_new_om_winner   text;
  v_new_om_end_reason text;
  -- FIX(修正1): Pass 1 で online_game_id を保持する変数
  v_online_game_id  uuid;

  -- Pass 2 カーソル用変数
  r_match           RECORD;
  v_om              RECORD;
  v_winner_uid      uuid;
  v_loser_uid       uuid;
  v_arena_end_reason text;
  v_black_delta     int;
  v_white_delta     int;
  v_master_effect   text;
  v_event_datetime  timestamptz;

  -- Master/Interim 用変数
  v_arena_def       RECORD;
  v_active_master   RECORD;
  v_active_interim  RECORD;
  -- FIX(修正2): IS NOT NULL 代替の FOUND フラグ
  v_found_master    boolean;
  v_found_interim   boolean;
  v_is_master_match bool;
  v_new_master_uid  uuid;
  v_new_interim_uid uuid;

  -- arena_events completed化用変数
  v_event_id        uuid;
BEGIN

  -- ================================================================
  -- Pass 1: Arena専用 expiry / no-show 解決
  --
  --   check_official_match_expiry() は auth.uid() 依存で service_role から呼べないため
  --   inline 実装する。
  --
  --   Pass 1 では official_matches と online_games を更新する。
  --   arena_matches は Pass 2 で処理（Pass 1 で OM を completed/no_contest にすると
  --   Pass 2 の WHERE 条件に引っかかり、同一 RPC 実行内で処理される設計）。
  -- ================================================================

  FOR r_exp IN
    SELECT
      am.id                   AS arena_match_id,
      am.official_match_id,
      am.online_game_id,                    -- FIX(修正1): online_game_id を取得
      am.arena_event_id,
      om.starts_at,
      om.timer_config,
      om.black_user_id,
      om.white_user_id,
      om.black_entered_at,
      om.white_entered_at,
      om.status               AS om_status
    FROM arena_matches am
    JOIN official_matches om ON om.id = am.official_match_id
    WHERE am.status = 'pending'
      AND am.official_match_id IS NOT NULL
      AND om.source_kind = 'arena'
      AND om.status IN ('scheduled','joinable','live')
  LOOP
    -- totalSeconds を timer_config から取得（fallback: 600秒）
    v_timer_total_sec := COALESCE(
      (r_exp.timer_config->>'totalSeconds')::int,
      600
    );

    -- タイムアウト未達 → スキップ
    IF clock_timestamp() <= r_exp.starts_at + (v_timer_total_sec * interval '1 second') THEN
      CONTINUE;
    END IF;

    v_black_null := (r_exp.black_entered_at IS NULL);
    v_white_null := (r_exp.white_entered_at IS NULL);
    v_online_game_id := r_exp.online_game_id;  -- FIX(修正1)

    IF v_black_null AND v_white_null THEN
      -- 両者未入室 → no_contest
      v_new_om_status     := 'no_contest';
      v_new_om_result     := NULL;
      v_new_om_winner     := NULL;
      v_new_om_end_reason := 'no_contest';
    ELSIF v_black_null AND NOT v_white_null THEN
      -- black未入室 / white入室済み → forfeit_black
      v_new_om_status     := 'completed';
      v_new_om_result     := 'white';
      v_new_om_winner     := 'white_user';
      v_new_om_end_reason := 'forfeit_black';
    ELSIF v_white_null AND NOT v_black_null THEN
      -- white未入室 / black入室済み → forfeit_white
      v_new_om_status     := 'completed';
      v_new_om_result     := 'black';
      v_new_om_winner     := 'black_user';
      v_new_om_end_reason := 'forfeit_white';
    ELSE
      -- 両者入室済み → Pass 1 では処理しない
      CONTINUE;
    END IF;

    UPDATE official_matches
    SET
      status     = v_new_om_status,
      result     = v_new_om_result,
      winner     = v_new_om_winner,
      end_reason = v_new_om_end_reason,
      ends_at    = clock_timestamp(),
      updated_at = clock_timestamp()
    WHERE id = r_exp.official_match_id;

    -- FIX(修正1): online_game が存在し playing 状態の場合も終了させる
    IF v_online_game_id IS NOT NULL THEN
      IF v_new_om_end_reason = 'forfeit_white' THEN
        -- black（Master）入室・white（challenger）未入室
        UPDATE online_games
        SET
          status           = 'finished',
          winner           = 'black',
          end_reason       = 'forfeit_white',
          timeout_player   = NULL,
          turn_started_at  = NULL,
          server_updated_at = NOW(),
          updated_at       = NOW()
        WHERE id = v_online_game_id
          AND status = 'playing';

      ELSIF v_new_om_end_reason = 'forfeit_black' THEN
        -- white（challenger）入室・black（Master）未入室
        UPDATE online_games
        SET
          status           = 'finished',
          winner           = 'white',
          end_reason       = 'forfeit_black',
          timeout_player   = NULL,
          turn_started_at  = NULL,
          server_updated_at = NOW(),
          updated_at       = NOW()
        WHERE id = v_online_game_id
          AND status = 'playing';
      END IF;
      -- no_contest（両者未入室）は online_games を変更しない
    END IF;

    v_expired_count := v_expired_count + 1;
  END LOOP;

  -- ================================================================
  -- Pass 2: Arena result processing
  --   arena_matches に arena_id 列はないため arena_events から JOIN して取得
  --   FOR UPDATE SKIP LOCKED で二重処理防止
  -- ================================================================

  FOR r_match IN
    SELECT
      am.id                   AS arena_match_id,
      ae.arena_id             AS arena_id,
      am.arena_event_id,
      am.official_match_id,
      am.round,
      am.match_kind,
      am.master_subtype,
      am.scheduled_start_at,
      am.black_user_id,
      am.white_user_id
    FROM arena_matches am
    JOIN arena_events ae   ON ae.id = am.arena_event_id
    JOIN official_matches om ON om.id = am.official_match_id
    WHERE am.status = 'pending'
      AND am.processed_at IS NULL
      AND am.official_match_id IS NOT NULL
      AND om.source_kind = 'arena'
      AND om.status IN ('completed','no_contest','cancelled','forfeited')
    FOR UPDATE OF am SKIP LOCKED
  LOOP
    BEGIN

      -- official_match を取得
      SELECT * INTO v_om
      FROM official_matches
      WHERE id = r_match.official_match_id;

      -- ----------------------------------------------------------------
      -- 4. official_matches → Arena result 正規化
      -- ----------------------------------------------------------------
      v_winner_uid       := NULL;
      v_loser_uid        := NULL;
      v_arena_end_reason := NULL;
      v_black_delta      := 0;
      v_white_delta      := 0;
      v_master_effect    := 'none';

      -- 4.4 no_contest / cancelled → 先に判定
      IF v_om.status = 'no_contest'
         OR v_om.end_reason IN ('forfeit_both','no_contest')
      THEN
        v_winner_uid       := NULL;
        v_loser_uid        := NULL;
        v_arena_end_reason := 'no_contest';
        v_black_delta      := 0;
        v_white_delta      := 0;
        v_master_effect    := 'no_change';

      ELSIF v_om.status = 'cancelled'
            OR v_om.end_reason = 'cancelled'
      THEN
        v_winner_uid       := NULL;
        v_loser_uid        := NULL;
        v_arena_end_reason := 'cancelled';
        v_black_delta      := 0;
        v_white_delta      := 0;
        v_master_effect    := 'no_change';

      -- 4.3 forfeit_black（black no-show）
      ELSIF v_om.end_reason = 'forfeit_black' AND v_om.winner = 'white_user' THEN
        v_winner_uid       := r_match.white_user_id;
        v_loser_uid        := r_match.black_user_id;
        v_arena_end_reason := 'no_show';
        v_black_delta      := -3;
        v_white_delta      := 3;

      -- 4.3 forfeit_white（white no-show）
      ELSIF v_om.end_reason = 'forfeit_white' AND v_om.winner = 'black_user' THEN
        v_winner_uid       := r_match.black_user_id;
        v_loser_uid        := r_match.white_user_id;
        v_arena_end_reason := 'no_show';
        v_black_delta      := 3;
        v_white_delta      := -3;

      -- 4.2 draw
      ELSIF v_om.result = 'draw' OR v_om.winner = 'draw' THEN
        v_winner_uid       := NULL;
        v_loser_uid        := NULL;
        v_arena_end_reason := CASE
          WHEN v_om.end_reason = 'draw_agreement' THEN 'draw_agreement'
          ELSE 'draw'
        END;
        v_black_delta := 1;
        v_white_delta := 1;

      -- 4.1 normal / timeout / resign（completed）
      ELSIF v_om.status IN ('completed','forfeited')
            AND v_om.end_reason IN ('normal','timeout','resign')
      THEN
        IF v_om.winner = 'black_user' THEN
          v_winner_uid       := r_match.black_user_id;
          v_loser_uid        := r_match.white_user_id;
          v_arena_end_reason := v_om.end_reason;
          v_black_delta      := 3;
          v_white_delta      := 1;
        ELSIF v_om.winner = 'white_user' THEN
          v_winner_uid       := r_match.white_user_id;
          v_loser_uid        := r_match.black_user_id;
          v_arena_end_reason := v_om.end_reason;
          v_black_delta      := 1;
          v_white_delta      := 3;
        ELSE
          -- 想定外 winner → no_contest 扱い
          v_arena_end_reason := 'no_contest';
          v_master_effect    := 'no_change';
          v_black_delta      := 0;
          v_white_delta      := 0;
        END IF;

      ELSE
        -- 未知パターン → no_contest として処理
        v_arena_end_reason := 'no_contest';
        v_master_effect    := 'no_change';
        v_black_delta      := 0;
        v_white_delta      := 0;
      END IF;

      -- ----------------------------------------------------------------
      -- 5. arena_points 更新
      -- ----------------------------------------------------------------
      IF v_arena_end_reason NOT IN ('no_contest','cancelled') THEN

        -- black 側
        INSERT INTO arena_points (
          arena_id, user_id, season,
          points, win_count, loss_count, draw_count, no_show_losses,
          participations, matches_played, last_played_event_id
        ) VALUES (
          r_match.arena_id,
          r_match.black_user_id,
          'default',
          v_black_delta,
          CASE WHEN v_winner_uid = r_match.black_user_id THEN 1 ELSE 0 END,
          CASE WHEN v_loser_uid = r_match.black_user_id
                    AND v_arena_end_reason <> 'no_show'
                    AND v_arena_end_reason NOT IN ('draw','draw_agreement')
               THEN 1 ELSE 0 END,
          CASE WHEN v_arena_end_reason IN ('draw','draw_agreement') THEN 1 ELSE 0 END,
          CASE WHEN v_arena_end_reason = 'no_show' AND v_loser_uid = r_match.black_user_id
               THEN 1 ELSE 0 END,
          1,
          1,
          r_match.arena_event_id
        )
        ON CONFLICT (arena_id, user_id, season)
        DO UPDATE SET
          points         = arena_points.points + v_black_delta,
          win_count      = arena_points.win_count
                           + CASE WHEN v_winner_uid = r_match.black_user_id THEN 1 ELSE 0 END,
          loss_count     = arena_points.loss_count
                           + CASE WHEN v_loser_uid = r_match.black_user_id
                                       AND v_arena_end_reason <> 'no_show'
                                       AND v_arena_end_reason NOT IN ('draw','draw_agreement')
                                  THEN 1 ELSE 0 END,
          draw_count     = arena_points.draw_count
                           + CASE WHEN v_arena_end_reason IN ('draw','draw_agreement') THEN 1 ELSE 0 END,
          no_show_losses = arena_points.no_show_losses
                           + CASE WHEN v_arena_end_reason = 'no_show'
                                       AND v_loser_uid = r_match.black_user_id
                                  THEN 1 ELSE 0 END,
          participations = arena_points.participations + 1,
          matches_played = arena_points.matches_played + 1,
          last_played_event_id = r_match.arena_event_id,
          updated_at     = now();

        -- white 側
        INSERT INTO arena_points (
          arena_id, user_id, season,
          points, win_count, loss_count, draw_count, no_show_losses,
          participations, matches_played, last_played_event_id
        ) VALUES (
          r_match.arena_id,
          r_match.white_user_id,
          'default',
          v_white_delta,
          CASE WHEN v_winner_uid = r_match.white_user_id THEN 1 ELSE 0 END,
          CASE WHEN v_loser_uid = r_match.white_user_id
                    AND v_arena_end_reason <> 'no_show'
                    AND v_arena_end_reason NOT IN ('draw','draw_agreement')
               THEN 1 ELSE 0 END,
          CASE WHEN v_arena_end_reason IN ('draw','draw_agreement') THEN 1 ELSE 0 END,
          CASE WHEN v_arena_end_reason = 'no_show' AND v_loser_uid = r_match.white_user_id
               THEN 1 ELSE 0 END,
          1,
          1,
          r_match.arena_event_id
        )
        ON CONFLICT (arena_id, user_id, season)
        DO UPDATE SET
          points         = arena_points.points + v_white_delta,
          win_count      = arena_points.win_count
                           + CASE WHEN v_winner_uid = r_match.white_user_id THEN 1 ELSE 0 END,
          loss_count     = arena_points.loss_count
                           + CASE WHEN v_loser_uid = r_match.white_user_id
                                       AND v_arena_end_reason <> 'no_show'
                                       AND v_arena_end_reason NOT IN ('draw','draw_agreement')
                                  THEN 1 ELSE 0 END,
          draw_count     = arena_points.draw_count
                           + CASE WHEN v_arena_end_reason IN ('draw','draw_agreement') THEN 1 ELSE 0 END,
          no_show_losses = arena_points.no_show_losses
                           + CASE WHEN v_arena_end_reason = 'no_show'
                                       AND v_loser_uid = r_match.white_user_id
                                  THEN 1 ELSE 0 END,
          participations = arena_points.participations + 1,
          matches_played = arena_points.matches_played + 1,
          last_played_event_id = r_match.arena_event_id,
          updated_at     = now();

      END IF;

      -- ----------------------------------------------------------------
      -- 8. Master/Interim 更新（match_kind = 'master' のみ）
      -- ----------------------------------------------------------------
      IF r_match.match_kind = 'master' THEN

        IF v_arena_end_reason IS NULL THEN
          v_master_effect := 'none';

        ELSIF v_arena_end_reason IN ('no_contest','cancelled') THEN
          -- 8.1 no_contest / cancelled → no_change
          v_master_effect := 'no_change';

        ELSIF v_winner_uid IS NULL AND v_arena_end_reason IN ('draw','draw_agreement') THEN
          -- 8.2 draw
          IF r_match.master_subtype = 'defend' THEN
            v_master_effect := 'defended';
          ELSE
            v_master_effect := 'no_change';
          END IF;

        ELSIF v_winner_uid IS NOT NULL THEN
          -- 勝者あり → master_subtype に応じて処理

          -- arena_definitions を FOR UPDATE でロック
          SELECT * INTO v_arena_def
          FROM arena_definitions
          WHERE id = r_match.arena_id
          FOR UPDATE;

          -- FIX(修正2): FOUND フラグを使って active master/interim を安全に取得
          -- RECORD 型の IS NOT NULL は NULL 列があると false になるため FOUND を使用する
          SELECT * INTO v_active_master
          FROM arena_master_history
          WHERE arena_id = r_match.arena_id
            AND season = 'default'
            AND status = 'official'
            AND dethroned_at IS NULL;
          v_found_master := FOUND;

          SELECT * INTO v_active_interim
          FROM arena_master_history
          WHERE arena_id = r_match.arena_id
            AND season = 'default'
            AND status = 'interim'
            AND dethroned_at IS NULL;
          v_found_interim := FOUND;

          -- 8.3 inaugural
          IF r_match.master_subtype = 'inaugural' THEN
            v_master_effect := 'inaugural_set';

            INSERT INTO arena_master_history (
              arena_id, status, reason, user_id, title_name, season,
              crowned_at,
              source_arena_event_id, source_arena_match_id, source_official_match_id
            )
            SELECT
              r_match.arena_id,
              'official',
              'inaugural',
              v_winner_uid,
              ad.title_name,
              'default',
              now(),
              r_match.arena_event_id,
              r_match.arena_match_id,
              r_match.official_match_id
            FROM arena_definitions ad
            WHERE ad.id = r_match.arena_id;

            UPDATE arena_definitions SET
              current_master_user_id         = v_winner_uid,
              current_master_since_event_id   = r_match.arena_event_id,
              current_interim_master_user_id  = NULL,
              current_interim_since_event_id  = NULL,
              updated_at = now()
            WHERE id = r_match.arena_id;

          -- 8.4 defend
          ELSIF r_match.master_subtype = 'defend' THEN

            -- FIX(修正2+3): v_found_master と user_id 比較で安全に判定
            -- 現 Master 本人（black=Master）が勝者 → defended
            -- end_reason が normal / timeout / no_show いずれでも defended
            IF v_found_master AND v_winner_uid = v_active_master.user_id THEN
              -- 現 Master が防衛 → 何もしない（history 再作成・definition 更新不要）
              v_master_effect := 'defended';

            ELSE
              -- 挑戦者が勝利 → Master 交代
              v_master_effect := 'transferred';

              -- active official を全件失冠（v_active_master.id への依存を排除）
              UPDATE arena_master_history SET dethroned_at = now()
              WHERE arena_id = r_match.arena_id
                AND season   = 'default'
                AND status   = 'official'
                AND dethroned_at IS NULL;

              -- active interim も全件失冠
              UPDATE arena_master_history SET dethroned_at = now()
              WHERE arena_id = r_match.arena_id
                AND season   = 'default'
                AND status   = 'interim'
                AND dethroned_at IS NULL;

              -- 新 Master を INSERT（上の UPDATE で unique constraint 解消済み）
              INSERT INTO arena_master_history (
                arena_id, status, reason, user_id, title_name, season,
                crowned_at,
                source_arena_event_id, source_arena_match_id, source_official_match_id
              )
              SELECT
                r_match.arena_id,
                'official',
                CASE WHEN v_om.end_reason = 'no_show' THEN 'forfeit_win' ELSE 'defeated_master' END,
                v_winner_uid,
                ad.title_name,
                'default',
                now(),
                r_match.arena_event_id,
                r_match.arena_match_id,
                r_match.official_match_id
              FROM arena_definitions ad
              WHERE ad.id = r_match.arena_id;

              UPDATE arena_definitions SET
                current_master_user_id         = v_winner_uid,
                current_master_since_event_id   = r_match.arena_event_id,
                current_interim_master_user_id  = NULL,
                current_interim_since_event_id  = NULL,
                updated_at = now()
              WHERE id = r_match.arena_id;
            END IF;

          -- 8.5 master_succession
          ELSIF r_match.master_subtype = 'master_succession' THEN

            -- FIX: id依存をやめて arena_id/season 条件で確実に失冠させる
            -- interim を全件失冠
            UPDATE arena_master_history SET dethroned_at = now()
            WHERE arena_id = r_match.arena_id
              AND season   = 'default'
              AND status   = 'interim'
              AND dethroned_at IS NULL;

            -- official を全件失冠
            UPDATE arena_master_history SET dethroned_at = now()
            WHERE arena_id = r_match.arena_id
              AND season   = 'default'
              AND status   = 'official'
              AND dethroned_at IS NULL;

            -- FIX(修正2): v_found_interim フラグで安全判定
            IF v_found_interim AND v_winner_uid = v_active_interim.user_id THEN
              v_master_effect := 'interim_confirmed_official';

              INSERT INTO arena_master_history (
                arena_id, status, reason, user_id, title_name, season,
                crowned_at,
                source_arena_event_id, source_arena_match_id, source_official_match_id
              )
              SELECT
                r_match.arena_id,
                'official',
                'interim_confirmed',
                v_winner_uid,
                ad.title_name,
                'default',
                now(),
                r_match.arena_event_id,
                r_match.arena_match_id,
                r_match.official_match_id
              FROM arena_definitions ad
              WHERE ad.id = r_match.arena_id;

            ELSE
              v_master_effect := 'transferred';

              INSERT INTO arena_master_history (
                arena_id, status, reason, user_id, title_name, season,
                crowned_at,
                source_arena_event_id, source_arena_match_id, source_official_match_id
              )
              SELECT
                r_match.arena_id,
                'official',
                CASE WHEN v_om.end_reason = 'no_show' THEN 'forfeit_win' ELSE 'defeated_master' END,
                v_winner_uid,
                ad.title_name,
                'default',
                now(),
                r_match.arena_event_id,
                r_match.arena_match_id,
                r_match.official_match_id
              FROM arena_definitions ad
              WHERE ad.id = r_match.arena_id;
            END IF;

            UPDATE arena_definitions SET
              current_master_user_id         = v_winner_uid,
              current_master_since_event_id   = r_match.arena_event_id,
              current_interim_master_user_id  = NULL,
              current_interim_since_event_id  = NULL,
              updated_at = now()
            WHERE id = r_match.arena_id;

          -- 8.6 interim_set
          ELSIF r_match.master_subtype = 'interim_set' THEN

            v_new_interim_uid := v_winner_uid;

            -- FIX: id依存をやめて arena_id/season 条件で確実に失冠させる
            UPDATE arena_master_history SET dethroned_at = now()
            WHERE arena_id = r_match.arena_id
              AND season   = 'default'
              AND status   = 'interim'
              AND dethroned_at IS NULL;

            -- FIX(修正2): v_found_interim フラグで安全判定
            IF v_found_interim THEN
              v_master_effect := 'interim_replaced';
            ELSE
              v_master_effect := 'interim_set';
            END IF;

            INSERT INTO arena_master_history (
              arena_id, status, reason, user_id, title_name, season,
              crowned_at,
              source_arena_event_id, source_arena_match_id, source_official_match_id
            )
            SELECT
              r_match.arena_id,
              'interim',
              'master_absent_interim',
              v_new_interim_uid,
              ad.title_name,
              'default',
              now(),
              r_match.arena_event_id,
              r_match.arena_match_id,
              r_match.official_match_id
            FROM arena_definitions ad
            WHERE ad.id = r_match.arena_id;

            UPDATE arena_definitions SET
              current_interim_master_user_id  = v_new_interim_uid,
              current_interim_since_event_id  = r_match.arena_event_id,
              updated_at = now()
            WHERE id = r_match.arena_id;
            -- current_master_user_id は変更しない

          END IF;  -- master_subtype 分岐

        END IF;  -- 勝者あり

      END IF;  -- match_kind = 'master'

      -- ----------------------------------------------------------------
      -- 6. arena_match_history 保存（ON CONFLICT DO NOTHING で冪等）
      -- ----------------------------------------------------------------
      v_event_datetime := COALESCE(r_match.scheduled_start_at, v_om.starts_at);

      INSERT INTO arena_match_history (
        arena_id,
        arena_event_id,
        arena_match_id,
        official_match_id,
        round,
        match_kind,
        master_subtype,
        event_datetime,
        black_user_id,
        white_user_id,
        winner_user_id,
        loser_user_id,
        end_reason,
        black_point_delta,
        white_point_delta,
        master_effect
      ) VALUES (
        r_match.arena_id,
        r_match.arena_event_id,
        r_match.arena_match_id,
        r_match.official_match_id,
        r_match.round,
        r_match.match_kind,
        r_match.master_subtype,
        v_event_datetime,
        r_match.black_user_id,
        r_match.white_user_id,
        v_winner_uid,
        v_loser_uid,
        v_arena_end_reason,
        v_black_delta,
        v_white_delta,
        v_master_effect
      )
      ON CONFLICT (arena_match_id) DO NOTHING;

      -- ----------------------------------------------------------------
      -- 7. arena_matches 更新（処理成功後）
      -- ----------------------------------------------------------------
      UPDATE arena_matches SET
        status            = 'processed',
        winner_user_id    = v_winner_uid,
        loser_user_id     = v_loser_uid,
        end_reason        = v_arena_end_reason,
        black_point_delta = v_black_delta,
        white_point_delta = v_white_delta,
        master_effect     = v_master_effect,
        processed_at      = now(),
        updated_at        = now()
      WHERE id = r_match.arena_match_id;

      v_processed_count := v_processed_count + 1;

    EXCEPTION WHEN OTHERS THEN
      -- RAISE WARNING でpg_cronログにエラーが見えるようにする（機微情報含まず）
      RAISE WARNING 'process_arena_results: arena_match % failed [%]', r_match.arena_match_id, SQLERRM;
      v_errors := v_errors || jsonb_build_object(
        'arena_match_id', r_match.arena_match_id::text,
        'error',          SQLERRM
      );
    END;
  END LOOP;

  -- ================================================================
  -- 10. arena_events completed 化
  --   全 arena_matches が processed / cancelled になった event を completed にする
  -- ================================================================
  FOR v_event_id IN
    SELECT ae.id
    FROM arena_events ae
    WHERE ae.status NOT IN ('completed','cancelled')
      AND EXISTS (
        SELECT 1 FROM arena_matches am
        WHERE am.arena_event_id = ae.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM arena_matches am
        WHERE am.arena_event_id = ae.id
          AND am.status NOT IN ('processed','cancelled')
      )
  LOOP
    UPDATE arena_events SET
      status               = 'completed',
      results_processed_at = now(),
      updated_at           = now()
    WHERE id = v_event_id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',              jsonb_array_length(v_errors) = 0,
    'expired_count',   v_expired_count,
    'processed_count', v_processed_count,
    'errors_count',    jsonb_array_length(v_errors),
    'errors',          v_errors
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',    false,
    'error', SQLERRM,
    'errors', '[]'::jsonb
  );
END;
$$;

-- ================================================================
-- SECURITY / GRANT（前バージョンと同一パターンを維持）
-- ================================================================
REVOKE EXECUTE ON FUNCTION process_arena_results() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION process_arena_results() TO service_role, postgres;
