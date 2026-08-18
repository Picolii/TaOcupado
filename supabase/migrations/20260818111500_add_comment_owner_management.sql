CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.stall_report_comments
  ADD COLUMN IF NOT EXISTS owner_hash text;

ALTER TABLE public.stall_report_comments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

REVOKE SELECT ON public.stall_report_comments FROM anon, authenticated;
GRANT SELECT (
  id,
  report_id,
  commenter_ticket,
  image_data_url,
  message,
  created_at,
  updated_at
) ON public.stall_report_comments TO anon, authenticated;

REVOKE INSERT ON public.stall_report_comments FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_stall_report_comment(
  target_report_id uuid,
  actor_ticket text,
  actor_owner_secret text,
  next_message text,
  next_image_data_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_comment public.stall_report_comments;
  clean_message text;
  next_owner_hash text;
BEGIN
  IF actor_ticket IS NULL OR length(trim(actor_ticket)) = 0 THEN
    RAISE EXCEPTION 'comment_forbidden' USING ERRCODE = '42501';
  END IF;

  IF actor_owner_secret IS NULL OR length(trim(actor_owner_secret)) = 0 THEN
    RAISE EXCEPTION 'comment_forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stall_reports WHERE id = target_report_id) THEN
    RAISE EXCEPTION 'report_not_found' USING ERRCODE = 'P0002';
  END IF;

  clean_message := regexp_replace(trim(coalesce(next_message, '')), '\s+', ' ', 'g');

  IF char_length(clean_message) > 180
    OR (char_length(clean_message) < 1 AND next_image_data_url IS NULL) THEN
    RAISE EXCEPTION 'comment_invalid_message' USING ERRCODE = '22023';
  END IF;

  IF next_image_data_url IS NOT NULL
    AND (
      next_image_data_url NOT LIKE 'data:image/%'
      OR char_length(next_image_data_url) > 220000
    ) THEN
    RAISE EXCEPTION 'comment_invalid_image' USING ERRCODE = '22023';
  END IF;

  next_owner_hash := encode(extensions.digest(actor_owner_secret, 'sha256'), 'hex');

  INSERT INTO public.stall_report_comments (
    report_id,
    commenter_ticket,
    owner_hash,
    message,
    image_data_url
  )
  VALUES (
    target_report_id,
    actor_ticket,
    next_owner_hash,
    clean_message,
    next_image_data_url
  )
  RETURNING * INTO inserted_comment;

  RETURN jsonb_build_object(
    'id', inserted_comment.id,
    'report_id', inserted_comment.report_id,
    'commenter_ticket', inserted_comment.commenter_ticket,
    'message', inserted_comment.message,
    'image_data_url', inserted_comment.image_data_url,
    'created_at', inserted_comment.created_at,
    'updated_at', inserted_comment.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_stall_report_comment(
  target_comment_id uuid,
  actor_ticket text,
  actor_owner_secret text,
  admin_token text,
  next_message text,
  next_image_data_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_comment public.stall_report_comments;
  updated_comment public.stall_report_comments;
  clean_message text;
BEGIN
  DELETE FROM public.admin_sessions
  WHERE expires_at <= now();

  SELECT *
  INTO existing_comment
  FROM public.stall_report_comments
  WHERE id = target_comment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (
      existing_comment.owner_hash IS NOT NULL
      AND existing_comment.owner_hash = encode(extensions.digest(actor_owner_secret, 'sha256'), 'hex')
    )
    OR (
      existing_comment.owner_hash IS NULL
      AND existing_comment.commenter_ticket = actor_ticket
    )
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_sessions
      WHERE token = admin_token
        AND expires_at > now()
    ) THEN
    RAISE EXCEPTION 'comment_forbidden' USING ERRCODE = '42501';
  END IF;

  clean_message := regexp_replace(trim(coalesce(next_message, '')), '\s+', ' ', 'g');

  IF char_length(clean_message) > 180
    OR (char_length(clean_message) < 1 AND next_image_data_url IS NULL) THEN
    RAISE EXCEPTION 'comment_invalid_message' USING ERRCODE = '22023';
  END IF;

  IF next_image_data_url IS NOT NULL
    AND (
      next_image_data_url NOT LIKE 'data:image/%'
      OR char_length(next_image_data_url) > 220000
    ) THEN
    RAISE EXCEPTION 'comment_invalid_image' USING ERRCODE = '22023';
  END IF;

  UPDATE public.stall_report_comments
  SET
    message = clean_message,
    image_data_url = next_image_data_url,
    updated_at = now()
  WHERE id = target_comment_id
  RETURNING * INTO updated_comment;

  RETURN jsonb_build_object(
    'id', updated_comment.id,
    'report_id', updated_comment.report_id,
    'commenter_ticket', updated_comment.commenter_ticket,
    'message', updated_comment.message,
    'image_data_url', updated_comment.image_data_url,
    'created_at', updated_comment.created_at,
    'updated_at', updated_comment.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_stall_report_comment_owned(
  target_comment_id uuid,
  actor_ticket text,
  actor_owner_secret text,
  admin_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_comment public.stall_report_comments;
BEGIN
  DELETE FROM public.admin_sessions
  WHERE expires_at <= now();

  SELECT *
  INTO existing_comment
  FROM public.stall_report_comments
  WHERE id = target_comment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'comment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    (
      existing_comment.owner_hash IS NOT NULL
      AND existing_comment.owner_hash = encode(extensions.digest(actor_owner_secret, 'sha256'), 'hex')
    )
    OR (
      existing_comment.owner_hash IS NULL
      AND existing_comment.commenter_ticket = actor_ticket
    )
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_sessions
      WHERE token = admin_token
        AND expires_at > now()
    ) THEN
    RAISE EXCEPTION 'comment_forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.stall_report_comments
  WHERE id = target_comment_id;

  RETURN target_comment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_stall_report_comment(uuid, text, text, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_stall_report_comment(uuid, text, text, text, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_stall_report_comment_owned(uuid, text, text, text)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_stall_report_comment(uuid, text, text, text, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_stall_report_comment(uuid, text, text, text, text, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_stall_report_comment_owned(uuid, text, text, text)
  TO anon, authenticated;
