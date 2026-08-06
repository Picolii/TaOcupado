UPDATE public.bathroom_state
SET lat = -27.124368,
    lng = -48.604723,
    radius_m = 5,
    changed_at = now()
WHERE id = 'main';

ALTER TABLE public.bathroom_state
  ALTER COLUMN lat SET DEFAULT -27.124368,
  ALTER COLUMN lng SET DEFAULT -48.604723,
  ALTER COLUMN radius_m SET DEFAULT 5;
