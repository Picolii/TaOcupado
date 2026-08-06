ALTER TABLE public.bathroom_state
  ADD COLUMN IF NOT EXISTS location_required boolean NOT NULL DEFAULT true;

UPDATE public.bathroom_state
SET
  location_required = radius_m <> 0,
  radius_m = CASE WHEN radius_m = 0 THEN 5 ELSE radius_m END
WHERE id = 'main';
