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
