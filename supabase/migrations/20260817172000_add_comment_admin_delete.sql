CREATE OR REPLACE FUNCTION public.delete_stall_report_comment(
  target_comment_id uuid,
  admin_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.admin_sessions
  WHERE expires_at <= now();

  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_sessions
    WHERE token = admin_token
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'comment_forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stall_report_comments
    WHERE id = target_comment_id
  ) THEN
    RAISE EXCEPTION 'comment_not_found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.stall_report_comments
  WHERE id = target_comment_id;

  RETURN target_comment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_stall_report_comment(uuid, text)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_stall_report_comment(uuid, text)
  TO anon, authenticated;
