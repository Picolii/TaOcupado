ALTER TABLE public.stalls
  ADD COLUMN IF NOT EXISTS paper_1 text NOT NULL DEFAULT 'cheio',
  ADD COLUMN IF NOT EXISTS paper_2 text NOT NULL DEFAULT 'cheio';

CREATE TABLE IF NOT EXISTS public.bathroom_state (
  id text PRIMARY KEY,
  cleaning boolean NOT NULL DEFAULT false,
  cleaning_since timestamptz,
  lat double precision,
  lng double precision,
  radius_m integer NOT NULL DEFAULT 80,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bathroom_state TO anon, authenticated;
GRANT ALL ON public.bathroom_state TO service_role;
ALTER TABLE public.bathroom_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can view bathroom state" ON public.bathroom_state FOR SELECT USING (true);
CREATE POLICY "anyone can update bathroom state" ON public.bathroom_state FOR UPDATE USING (true) WITH CHECK (true);

INSERT INTO public.bathroom_state (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.queue_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.queue_tickets TO anon, authenticated;
GRANT ALL ON public.queue_tickets TO service_role;
ALTER TABLE public.queue_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can view queue" ON public.queue_tickets FOR SELECT USING (true);
CREATE POLICY "anyone can join queue" ON public.queue_tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone can leave queue" ON public.queue_tickets FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.bathroom_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_tickets;