ALTER TABLE public.stall_reports
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;
