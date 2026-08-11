CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.stall_reports
  ADD COLUMN IF NOT EXISTS owner_secret text CHECK (
    owner_secret IS NULL OR char_length(owner_secret) BETWEEN 24 AND 96
  );

REVOKE SELECT ON public.stall_reports FROM anon, authenticated;
GRANT SELECT (
  id,
  stall_id,
  stall_label,
  reporter_ticket,
  image_data_url,
  message,
  created_at,
  updated_at
) ON public.stall_reports TO anon, authenticated;

REVOKE INSERT ON public.stall_reports FROM anon, authenticated;
GRANT INSERT (
  stall_id,
  stall_label,
  reporter_ticket,
  owner_secret,
  image_data_url,
  message
) ON public.stall_reports TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  token text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_sessions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_admin(admin_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_salt constant text := 'taocupado-admin-v1';
  admin_hash constant text := '9368d7d24896c4b03c42d5214a366c5a6d0ec27cf09b788e063b25b9de594185';
  next_token text;
BEGIN
  DELETE FROM public.admin_sessions
  WHERE expires_at <= now();

  IF encode(extensions.digest(coalesce(admin_password, '') || admin_salt, 'sha256'), 'hex') <> admin_hash THEN
    RAISE EXCEPTION 'admin_forbidden' USING ERRCODE = '42501';
  END IF;

  next_token := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.admin_sessions (token, expires_at)
  VALUES (next_token, now() + interval '12 hours');

  RETURN next_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_stall_report(
  report_id uuid,
  actor_owner_secret text,
  admin_token text,
  next_message text,
  next_image_data_url text
)
RETURNS public.stall_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_report public.stall_reports;
  updated_report public.stall_reports;
  clean_message text;
BEGIN
  DELETE FROM public.admin_sessions
  WHERE expires_at <= now();

  SELECT *
  INTO existing_report
  FROM public.stall_reports
  WHERE id = report_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'report_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    existing_report.owner_secret IS NOT NULL
    AND existing_report.owner_secret = actor_owner_secret
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_sessions
      WHERE token = admin_token
        AND expires_at > now()
    ) THEN
    RAISE EXCEPTION 'report_forbidden' USING ERRCODE = '42501';
  END IF;

  clean_message := regexp_replace(trim(coalesce(next_message, '')), '\s+', ' ', 'g');

  IF char_length(clean_message) > 220
    OR (char_length(clean_message) < 2 AND next_image_data_url IS NULL) THEN
    RAISE EXCEPTION 'report_invalid_message' USING ERRCODE = '22023';
  END IF;

  IF next_image_data_url IS NOT NULL
    AND (
      next_image_data_url NOT LIKE 'data:image/%'
      OR char_length(next_image_data_url) > 220000
    ) THEN
    RAISE EXCEPTION 'report_invalid_image' USING ERRCODE = '22023';
  END IF;

  UPDATE public.stall_reports
  SET
    message = clean_message,
    image_data_url = next_image_data_url,
    updated_at = now()
  WHERE id = report_id
  RETURNING * INTO updated_report;

  RETURN updated_report;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_stall_report(
  report_id uuid,
  actor_owner_secret text,
  admin_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_report public.stall_reports;
BEGIN
  DELETE FROM public.admin_sessions
  WHERE expires_at <= now();

  SELECT *
  INTO existing_report
  FROM public.stall_reports
  WHERE id = report_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'report_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    existing_report.owner_secret IS NOT NULL
    AND existing_report.owner_secret = actor_owner_secret
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_sessions
      WHERE token = admin_token
        AND expires_at > now()
    ) THEN
    RAISE EXCEPTION 'report_forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.stall_reports
  WHERE id = report_id;

  RETURN report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_stall_report(uuid, text, text, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_stall_report(uuid, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_admin(text)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_stall_report(uuid, text, text, text, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_stall_report(uuid, text, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin(text)
  TO anon, authenticated;
