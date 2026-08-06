ALTER TABLE public.bathroom_state
  ADD COLUMN IF NOT EXISTS location_required boolean NOT NULL DEFAULT true;

UPDATE public.bathroom_state
SET location_required = true
WHERE id = 'main'
  AND location_required IS DISTINCT FROM true;
