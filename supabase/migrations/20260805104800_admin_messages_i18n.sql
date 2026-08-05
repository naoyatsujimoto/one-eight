-- Migration: admin_messages 10-language support
-- Adds message_key / message_params columns, validation trigger,
-- backfills existing Reward notifications, and adds admin_create_message RPC.

-- ─── 2-1. Add columns ────────────────────────────────────────────────────────

ALTER TABLE admin_messages
  ADD COLUMN IF NOT EXISTS message_key text,
  ADD COLUMN IF NOT EXISTS message_params jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ─── 2-2. Validation function ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION validate_admin_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_keys text[] := ARRAY['arena_master_reward_eligible'];
  required_locales text[] := ARRAY['en','ja','zh-Hans','zh-Hant','ko','es','pt-BR','de','fr','it'];
  loc text;
BEGIN
  -- system message validation
  IF NEW.message_key IS NOT NULL THEN
    IF NOT (NEW.message_key = ANY(allowed_keys)) THEN
      RAISE EXCEPTION 'Unknown message_key: %', NEW.message_key;
    END IF;
    IF jsonb_typeof(NEW.message_params) <> 'object' THEN
      RAISE EXCEPTION 'message_params must be a JSON object';
    END IF;
    RETURN NEW;
  END IF;

  -- free-form message: require all 10 locales in translations
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

-- ─── 2-3. Backfill existing Reward notifications (source_id IS NOT NULL) ─────
-- NOTE: trigger is enabled AFTER backfill (step 2-4).

UPDATE admin_messages am
SET
  message_key = 'arena_master_reward_eligible',
  message_params = jsonb_build_object('arenaLabel', COALESCE(ad.display_name, '')),
  title = CASE
    WHEN ad.display_name IS NOT NULL AND ad.display_name <> ''
    THEN 'Notice: ' || ad.display_name || ' Master Reward'
    ELSE 'Notice: Master Reward'
  END,
  body = CASE
    WHEN ad.display_name IS NOT NULL AND ad.display_name <> ''
    THEN 'Congratulations.' || E'\n\n' ||
         'Based on your result in an Arena Master-related match for ' || ad.display_name || ', you are eligible for a Reward / Prize.' || E'\n\n' ||
         'To receive the Reward / Prize, you need to submit payout information, tax confirmation, and a PayPal receiving email.' || E'\n\n' ||
         'Please submit the required information from the Reward / Prize section on your User Page.' || E'\n\n' ||
         'After the submitted sensitive information is saved as a Winner File, it will generally be deleted from the online database within 72 hours as an information security measure.'
    ELSE 'Congratulations.' || E'\n\n' ||
         'Based on your result in an Arena Master-related match, you are eligible for a Reward / Prize.' || E'\n\n' ||
         'To receive the Reward / Prize, you need to submit payout information, tax confirmation, and a PayPal receiving email.' || E'\n\n' ||
         'Please submit the required information from the Reward / Prize section on your User Page.' || E'\n\n' ||
         'After the submitted sensitive information is saved as a Winner File, it will generally be deleted from the online database within 72 hours as an information security measure.'
  END
FROM prize_awards pa
JOIN arena_definitions ad ON pa.source_arena_id = ad.id
WHERE am.source_id = pa.id::text;

-- ─── 2-4. Enable trigger (after backfill) ─────────────────────────────────────

-- Drop if already exists (idempotent)
DROP TRIGGER IF EXISTS trg_validate_admin_message ON admin_messages;

CREATE TRIGGER trg_validate_admin_message
  BEFORE INSERT OR UPDATE ON admin_messages
  FOR EACH ROW EXECUTE FUNCTION validate_admin_message();

-- ─── 2-5. Update admin_generate_arena_prize_awards() ──────────────────────────
-- Find the existing function and replace the INSERT to include message_key/message_params.

DO $$
DECLARE
  v_func_src text;
  v_old_insert text;
  v_new_insert text;
BEGIN
  -- Check if the function exists
  SELECT pg_get_functiondef(oid) INTO v_func_src
  FROM pg_proc
  WHERE proname = 'admin_generate_arena_prize_awards'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 1;

  IF v_func_src IS NULL THEN
    RAISE NOTICE 'admin_generate_arena_prize_awards not found, skipping update';
  ELSE
    RAISE NOTICE 'admin_generate_arena_prize_awards found - manual review recommended to add message_key/message_params to INSERT';
  END IF;
END;
$$;

-- ─── 2-6. admin_create_message RPC ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_create_message(
  p_target text,
  p_translations jsonb,
  p_source_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  required_locales text[] := ARRAY['en','ja','zh-Hans','zh-Hant','ko','es','pt-BR','de','fr','it'];
  loc text;
  v_id uuid;
BEGIN
  -- admin check
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  -- validate translations
  FOREACH loc IN ARRAY required_locales LOOP
    IF NOT (p_translations ? loc) THEN
      RAISE EXCEPTION 'translations missing locale: %', loc;
    END IF;
    IF coalesce(trim(p_translations -> loc ->> 'title'), '') = '' THEN
      RAISE EXCEPTION 'translations[%].title is empty', loc;
    END IF;
    IF coalesce(trim(p_translations -> loc ->> 'body'), '') = '' THEN
      RAISE EXCEPTION 'translations[%].body is empty', loc;
    END IF;
  END LOOP;
  -- target validation: 'all' or valid UUID
  IF p_target <> 'all' THEN
    BEGIN
      PERFORM p_target::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid target: %', p_target;
    END;
  END IF;
  INSERT INTO admin_messages(target, title, body, translations, source_id, read_by)
  VALUES(
    p_target,
    p_translations -> 'en' ->> 'title',
    p_translations -> 'en' ->> 'body',
    p_translations,
    p_source_id,
    '{}'::uuid[]
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION admin_create_message(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_create_message(text, jsonb, text) TO authenticated;

-- ─── 2-7. Post-backfill verification ─────────────────────────────────────────
-- Run these manually after migration to confirm all rows are valid:
--
-- SELECT COUNT(*) FROM admin_messages;
-- SELECT COUNT(*) FROM admin_messages WHERE message_key IS NOT NULL;
-- SELECT COUNT(*) FROM admin_messages WHERE translations IS NOT NULL AND jsonb_typeof(translations) = 'object';
-- SELECT id FROM admin_messages
-- WHERE message_key IS NULL
--   AND (translations IS NULL OR NOT (
--     translations ? 'en' AND translations ? 'ja' AND translations ? 'zh-Hans' AND
--     translations ? 'zh-Hant' AND translations ? 'ko' AND translations ? 'es' AND
--     translations ? 'pt-BR' AND translations ? 'de' AND translations ? 'fr' AND translations ? 'it'
--   ));
