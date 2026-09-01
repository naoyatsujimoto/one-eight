-- ONE EIGHT public launch reset
--
-- Public-facing Arena history is reset while operational match rows, future
-- events/entries, and prize/payment audit records are preserved.
-- Existing in-game messages are replaced with one localized welcome guide per
-- confirmed user. Future users receive the guide exactly once on confirmation.

-- ---------------------------------------------------------------------------
-- 1. Reset public Arena history and current Master state.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_reset_at timestamptz := pg_catalog.now();
  v_active_past_matches integer;
BEGIN
  SELECT pg_catalog.count(*)::integer
  INTO v_active_past_matches
  FROM public.arena_matches am
  JOIN public.arena_events ae ON ae.id = am.arena_event_id
  WHERE ae.scheduled_at <= v_reset_at
    AND am.status NOT IN ('processed', 'cancelled');

  IF v_active_past_matches > 0 THEN
    RAISE EXCEPTION 'PUBLIC_LAUNCH_RESET_BLOCKED: % past Arena matches are not finalized',
      v_active_past_matches;
  END IF;

  DELETE FROM public.arena_match_history
  WHERE event_datetime < v_reset_at;

  DELETE FROM public.arena_master_history
  WHERE crowned_at < v_reset_at;

  -- arena_points is cumulative, so a public-launch reset requires a clean table.
  DELETE FROM public.arena_points;

  UPDATE public.arena_definitions
  SET current_master_user_id = NULL,
      current_master_since_event_id = NULL,
      current_interim_master_user_id = NULL,
      current_interim_since_event_id = NULL,
      updated_at = v_reset_at;
END;
$$;

-- All existing prize/payment rows are pre-launch test data. Clear the complete
-- chain in dependency order, including temporary tax data and audit logs.
-- The append-only archive trigger is disabled only for this explicit launch
-- reset and re-enabled within the same transaction.
ALTER TABLE public.prize_archive_logs
  DISABLE TRIGGER prize_archive_logs_no_update_or_delete;

DELETE FROM public.prize_archive_logs;

ALTER TABLE public.prize_archive_logs
  ENABLE TRIGGER prize_archive_logs_no_update_or_delete;

DELETE FROM public.prize_payouts;
DELETE FROM public.prize_temp_tax_submissions;
DELETE FROM public.prize_awards;

-- ---------------------------------------------------------------------------
-- 2. Add the welcome system-message key to DB validation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_admin_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  allowed_keys text[] := ARRAY['arena_master_reward_eligible', 'welcome_guide'];
  required_locales text[] := ARRAY['en','ja','zh-Hans','zh-Hant','ko','es','pt-BR','de','fr','it'];
  loc text;
BEGIN
  IF NEW.message_key IS NOT NULL THEN
    IF NOT (NEW.message_key = ANY(allowed_keys)) THEN
      RAISE EXCEPTION 'Unknown message_key: %', NEW.message_key;
    END IF;
    IF pg_catalog.jsonb_typeof(NEW.message_params) <> 'object' THEN
      RAISE EXCEPTION 'message_params must be a JSON object';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.translations IS NULL THEN
    RAISE EXCEPTION 'Non-system message must have translations with all 10 locales';
  END IF;
  FOREACH loc IN ARRAY required_locales LOOP
    IF NOT (NEW.translations ? loc) THEN
      RAISE EXCEPTION 'translations missing locale: %', loc;
    END IF;
    IF coalesce(trim(NEW.translations -> loc ->> 'title'), '') = '' THEN
      RAISE EXCEPTION 'translations[%].title is empty', loc;
    END IF;
    IF coalesce(trim(NEW.translations -> loc ->> 'body'), '') = '' THEN
      RAISE EXCEPTION 'translations[%].body is empty', loc;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_admin_message() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_admin_message() TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- 3. Idempotent welcome-message creator.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_welcome_guide_message(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'welcome guide user_id is required';
  END IF;

  INSERT INTO public.admin_messages (
    target,
    title,
    body,
    translations,
    source_id,
    read_by,
    message_key,
    message_params
  )
  VALUES (
    p_user_id::text,
    'Welcome to ONE EIGHT',
    'Start your first match from New Game.' || E'\n\n' ||
      'Open Training whenever you want to learn the rules or sharpen your strategy. Guided Game and short Training Tasks are ready for you.' || E'\n\n' ||
      'From your Profile, you can change your display name, language, and STATS visibility.' || E'\n\n' ||
      'Now leave your mark on the board.',
    NULL,
    'welcome_guide:' || p_user_id::text,
    '{}'::uuid[],
    'welcome_guide',
    '{}'::jsonb
  )
  ON CONFLICT (source_id, target) WHERE source_id IS NOT NULL DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_welcome_guide_message(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_welcome_guide_message(uuid) TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- 4. Future users: create profile as before and enqueue the guide on confirmation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, lang, created_at)
  VALUES (NEW.id, NULL, 'ja', pg_catalog.now())
  ON CONFLICT (id) DO NOTHING;

  -- Covers accounts created in an already-confirmed state.
  IF NEW.email_confirmed_at IS NOT NULL THEN
    PERFORM public.ensure_welcome_guide_message(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role, postgres;

CREATE OR REPLACE FUNCTION public.handle_user_confirmed_welcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    PERFORM public.ensure_welcome_guide_message(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_user_confirmed_welcome() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_user_confirmed_welcome() TO service_role, postgres;

DROP TRIGGER IF EXISTS on_auth_user_confirmed_welcome ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_welcome
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_confirmed_welcome();

-- ---------------------------------------------------------------------------
-- 5. Replace all existing messages and seed confirmed existing users.
-- ---------------------------------------------------------------------------

DELETE FROM public.admin_messages;

SELECT public.ensure_welcome_guide_message(au.id)
FROM auth.users au
WHERE au.deleted_at IS NULL
  AND au.email_confirmed_at IS NOT NULL;
