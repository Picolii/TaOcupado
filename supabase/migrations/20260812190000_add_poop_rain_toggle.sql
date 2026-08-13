ALTER TABLE public.bathroom_state
  ADD COLUMN IF NOT EXISTS poop_rain_enabled boolean NOT NULL DEFAULT true;

UPDATE public.bathroom_state
SET poop_rain_enabled = true
WHERE poop_rain_enabled IS NULL;
