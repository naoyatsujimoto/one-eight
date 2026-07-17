-- corrective migration: restore 'forfeit' to arena_matches_end_reason_check
-- This migration re-adds 'forfeit' which was omitted in the previous constraint definition.
-- All 9 allowed values: normal, timeout, resign, draw, draw_agreement, no_show, forfeit, no_contest, cancelled

ALTER TABLE public.arena_matches
  DROP CONSTRAINT arena_matches_end_reason_check;

ALTER TABLE public.arena_matches
  ADD CONSTRAINT arena_matches_end_reason_check
  CHECK (
    end_reason IS NULL OR
    end_reason = ANY (ARRAY[
      'normal',
      'timeout',
      'resign',
      'draw',
      'draw_agreement',
      'no_show',
      'forfeit',
      'no_contest',
      'cancelled'
    ])
  );
