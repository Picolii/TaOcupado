UPDATE public.bathroom_state
SET radius_m = 5,
    changed_at = now()
WHERE id = 'main';

ALTER TABLE public.bathroom_state
  ALTER COLUMN radius_m SET DEFAULT 5;
