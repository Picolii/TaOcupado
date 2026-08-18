CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.stall_report_reactions
  DROP CONSTRAINT IF EXISTS stall_report_reactions_emoji_check;

ALTER TABLE public.stall_report_reactions
  ADD CONSTRAINT stall_report_reactions_emoji_check
  CHECK (
    emoji IN (
      '🔥', '💀', '🤢', '🧻', '🚨', '👏', '😱', '🤮', '😭', '🫡',
      '🧼', '👀', '⚠️', '🏆', '😂', '😬', '😤', '🙏', '💦', '🧯',
      '🫠', '🧨', '😵‍💫', '🤌', '🧽', '🚽', '🚪', '✨'
    )
  );

ALTER TABLE public.stall_report_reactions
  ADD COLUMN IF NOT EXISTS reactor_owner_hash text;

CREATE TABLE IF NOT EXISTS public.stall_report_comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.stall_report_comments(id) ON DELETE CASCADE,
  reactor_ticket text NOT NULL,
  reactor_owner_hash text NOT NULL,
  emoji text NOT NULL CHECK (
    emoji IN (
      '🔥', '💀', '🤢', '🧻', '🚨', '👏', '😱', '🤮', '😭', '🫡',
      '🧼', '👀', '⚠️', '🏆', '😂', '😬', '😤', '🙏', '💦', '🧯',
      '🫠', '🧨', '😵‍💫', '🤌', '🧽', '🚽', '🚪', '✨'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, reactor_ticket, emoji)
);

CREATE UNIQUE INDEX IF NOT EXISTS stall_report_reactions_owner_unique
  ON public.stall_report_reactions (report_id, reactor_owner_hash, emoji)
  WHERE reactor_owner_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stall_report_comment_reactions_owner_unique
  ON public.stall_report_comment_reactions (comment_id, reactor_owner_hash, emoji);

GRANT SELECT ON public.stall_report_comment_reactions TO anon, authenticated;
GRANT ALL ON public.stall_report_comment_reactions TO service_role;

ALTER TABLE public.stall_report_comment_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can view stall report comment reactions"
  ON public.stall_report_comment_reactions;
DROP POLICY IF EXISTS "anyone can create stall report comment reactions"
  ON public.stall_report_comment_reactions;

CREATE POLICY "anyone can view stall report comment reactions"
  ON public.stall_report_comment_reactions FOR SELECT
  USING (true);

CREATE POLICY "anyone can create stall report comment reactions"
  ON public.stall_report_comment_reactions FOR INSERT
  WITH CHECK (true);

ALTER TABLE public.stall_report_comment_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.stall_report_comment_reactions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.toggle_stall_report_reaction(
  target_report_id uuid,
  actor_ticket text,
  actor_owner_secret text,
  reaction_emoji text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_owner_hash text;
BEGIN
  IF actor_ticket IS NULL OR length(trim(actor_ticket)) = 0 THEN
    RETURN false;
  END IF;

  IF actor_owner_secret IS NULL OR length(trim(actor_owner_secret)) = 0 THEN
    RETURN false;
  END IF;

  IF reaction_emoji NOT IN (
    '🔥', '💀', '🤢', '🧻', '🚨', '👏', '😱', '🤮', '😭', '🫡',
    '🧼', '👀', '⚠️', '🏆', '😂', '😬', '😤', '🙏', '💦', '🧯',
    '🫠', '🧨', '😵‍💫', '🤌', '🧽', '🚽', '🚪', '✨'
  ) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stall_reports WHERE id = target_report_id) THEN
    RETURN false;
  END IF;

  next_owner_hash := encode(extensions.digest(actor_owner_secret, 'sha256'), 'hex');

  DELETE FROM public.stall_report_reactions
  WHERE report_id = target_report_id
    AND reactor_owner_hash = next_owner_hash
    AND emoji = reaction_emoji;

  IF FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.stall_report_reactions (
    report_id,
    reactor_ticket,
    reactor_owner_hash,
    emoji
  )
  VALUES (
    target_report_id,
    actor_ticket,
    next_owner_hash,
    reaction_emoji
  )
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_stall_report_comment_reaction(
  target_comment_id uuid,
  actor_ticket text,
  actor_owner_secret text,
  reaction_emoji text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_owner_hash text;
BEGIN
  IF actor_ticket IS NULL OR length(trim(actor_ticket)) = 0 THEN
    RETURN false;
  END IF;

  IF actor_owner_secret IS NULL OR length(trim(actor_owner_secret)) = 0 THEN
    RETURN false;
  END IF;

  IF reaction_emoji NOT IN (
    '🔥', '💀', '🤢', '🧻', '🚨', '👏', '😱', '🤮', '😭', '🫡',
    '🧼', '👀', '⚠️', '🏆', '😂', '😬', '😤', '🙏', '💦', '🧯',
    '🫠', '🧨', '😵‍💫', '🤌', '🧽', '🚽', '🚪', '✨'
  ) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stall_report_comments WHERE id = target_comment_id) THEN
    RETURN false;
  END IF;

  next_owner_hash := encode(extensions.digest(actor_owner_secret, 'sha256'), 'hex');

  DELETE FROM public.stall_report_comment_reactions
  WHERE comment_id = target_comment_id
    AND reactor_owner_hash = next_owner_hash
    AND emoji = reaction_emoji;

  IF FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.stall_report_comment_reactions (
    comment_id,
    reactor_ticket,
    reactor_owner_hash,
    emoji
  )
  VALUES (
    target_comment_id,
    actor_ticket,
    next_owner_hash,
    reaction_emoji
  )
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_stall_report_reaction(uuid, text, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.toggle_stall_report_comment_reaction(uuid, text, text, text)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.toggle_stall_report_reaction(uuid, text, text, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_stall_report_comment_reaction(uuid, text, text, text)
  TO anon, authenticated;
