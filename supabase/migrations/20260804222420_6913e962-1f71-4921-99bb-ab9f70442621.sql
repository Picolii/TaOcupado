CREATE TABLE public.stalls (
  id text PRIMARY KEY,
  label text NOT NULL,
  occupied boolean NOT NULL DEFAULT false,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.stalls TO anon;
GRANT SELECT, UPDATE ON public.stalls TO authenticated;
GRANT ALL ON public.stalls TO service_role;

ALTER TABLE public.stalls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can view stalls" ON public.stalls FOR SELECT USING (true);
CREATE POLICY "anyone can toggle stalls" ON public.stalls FOR UPDATE USING (true) WITH CHECK (true);

INSERT INTO public.stalls (id, label, occupied) VALUES
  ('vaso-1', 'Vaso 1', false),
  ('vaso-2', 'Vaso 2', false);

ALTER TABLE public.stalls REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stalls;