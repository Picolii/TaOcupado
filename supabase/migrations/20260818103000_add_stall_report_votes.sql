CREATE TABLE IF NOT EXISTS public.stall_report_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.stall_reports(id) ON DELETE CASCADE,
  voter_ticket text NOT NULL,
  voter_owner_hash text NOT NULL,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, voter_owner_hash)
);

CREATE INDEX IF NOT EXISTS stall_report_votes_report_id_idx
  ON public.stall_report_votes (report_id);

REVOKE ALL ON public.stall_report_votes FROM anon, authenticated;
GRANT SELECT (
  id,
  report_id,
  voter_ticket,
  value,
  created_at,
  updated_at
) ON public.stall_report_votes TO anon, authenticated;
GRANT ALL ON public.stall_report_votes TO service_role;

ALTER TABLE public.stall_report_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can view stall report votes"
  ON public.stall_report_votes;

CREATE POLICY "anyone can view stall report votes"
  ON public.stall_report_votes FOR SELECT
  USING (true);

ALTER TABLE public.stall_report_votes REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.stall_report_votes;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.toggle_stall_report_vote(
  target_report_id uuid,
  actor_ticket text,
  actor_owner_secret text,
  next_value smallint
)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_owner_hash text;
  previous_value smallint;
BEGIN
  IF actor_ticket IS NULL OR length(trim(actor_ticket)) = 0 THEN
    RETURN 0;
  END IF;

  IF actor_owner_secret IS NULL OR length(trim(actor_owner_secret)) = 0 THEN
    RETURN 0;
  END IF;

  IF next_value NOT IN (-1, 1) THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stall_reports WHERE id = target_report_id) THEN
    RETURN 0;
  END IF;

  next_owner_hash := encode(extensions.digest(actor_owner_secret, 'sha256'), 'hex');

  SELECT value
  INTO previous_value
  FROM public.stall_report_votes
  WHERE report_id = target_report_id
    AND voter_owner_hash = next_owner_hash;

  IF FOUND AND previous_value = next_value THEN
    DELETE FROM public.stall_report_votes
    WHERE report_id = target_report_id
      AND voter_owner_hash = next_owner_hash;

    RETURN 0;
  END IF;

  INSERT INTO public.stall_report_votes (
    report_id,
    voter_ticket,
    voter_owner_hash,
    value
  )
  VALUES (
    target_report_id,
    actor_ticket,
    next_owner_hash,
    next_value
  )
  ON CONFLICT (report_id, voter_owner_hash)
  DO UPDATE SET
    voter_ticket = EXCLUDED.voter_ticket,
    value = EXCLUDED.value,
    updated_at = now();

  RETURN next_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_downvoted_stall_report(
  target_report_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  downvote_count integer;
BEGIN
  SELECT count(*)::integer
  INTO downvote_count
  FROM public.stall_report_votes
  WHERE report_id = target_report_id
    AND value = -1;

  IF downvote_count < 10 THEN
    RAISE EXCEPTION 'report_not_downvoted_enough' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.stall_reports
  WHERE id = target_report_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'report_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN target_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_stall_report_vote(uuid, text, text, smallint)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_downvoted_stall_report(uuid)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.toggle_stall_report_vote(uuid, text, text, smallint)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_downvoted_stall_report(uuid)
  TO anon, authenticated;
