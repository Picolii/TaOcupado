INSERT INTO public.bathroom_state (id, lat, lng, radius_m)
VALUES ('main', -27.124368, -48.604723, 5)
ON CONFLICT (id) DO UPDATE
SET lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    radius_m = EXCLUDED.radius_m;

ALTER TABLE public.bathroom_state
  ALTER COLUMN lat SET DEFAULT -27.124368,
  ALTER COLUMN lng SET DEFAULT -48.604723,
  ALTER COLUMN radius_m SET DEFAULT 5;

DROP TRIGGER IF EXISTS enforce_fixed_bathroom_location ON public.bathroom_state;
DROP FUNCTION IF EXISTS public.enforce_fixed_bathroom_location();
