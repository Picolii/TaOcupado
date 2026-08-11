CREATE TABLE IF NOT EXISTS public.stall_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stall_id text NOT NULL REFERENCES public.stalls(id) ON DELETE CASCADE,
  stall_label text NOT NULL,
  reporter_ticket text NOT NULL,
  image_data_url text CHECK (
    image_data_url IS NULL OR (
      image_data_url LIKE 'data:image/%' AND char_length(image_data_url) <= 220000
    )
  ),
  message text NOT NULL DEFAULT '' CHECK (
    char_length(trim(message)) <= 220 AND (
      char_length(trim(message)) >= 2 OR image_data_url IS NOT NULL
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.stall_reports TO anon, authenticated;
GRANT ALL ON public.stall_reports TO service_role;

ALTER TABLE public.stall_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can view stall reports"
  ON public.stall_reports FOR SELECT
  USING (true);

CREATE POLICY "anyone can create stall reports"
  ON public.stall_reports FOR INSERT
  WITH CHECK (true);

ALTER TABLE public.stall_reports REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stall_reports;

CREATE TABLE IF NOT EXISTS public.stall_report_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.stall_reports(id) ON DELETE CASCADE,
  commenter_ticket text NOT NULL,
  image_data_url text CHECK (
    image_data_url IS NULL OR (
      image_data_url LIKE 'data:image/%' AND char_length(image_data_url) <= 220000
    )
  ),
  message text NOT NULL DEFAULT '' CHECK (
    char_length(trim(message)) <= 180 AND (
      char_length(trim(message)) >= 1 OR image_data_url IS NOT NULL
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.stall_report_comments TO anon, authenticated;
GRANT ALL ON public.stall_report_comments TO service_role;

ALTER TABLE public.stall_report_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can view stall report comments"
  ON public.stall_report_comments FOR SELECT
  USING (true);

CREATE POLICY "anyone can create stall report comments"
  ON public.stall_report_comments FOR INSERT
  WITH CHECK (true);

ALTER TABLE public.stall_report_comments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stall_report_comments;

CREATE TABLE IF NOT EXISTS public.stall_report_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.stall_reports(id) ON DELETE CASCADE,
  reactor_ticket text NOT NULL,
  emoji text NOT NULL CHECK (emoji IN ('🔥', '💀', '🤢', '🧻', '🚨', '👏', '😱', '🤮', '😭', '🫡', '🧼', '👀', '⚠️', '🏆')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, reactor_ticket, emoji)
);

GRANT SELECT, INSERT ON public.stall_report_reactions TO anon, authenticated;
GRANT ALL ON public.stall_report_reactions TO service_role;

ALTER TABLE public.stall_report_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can view stall report reactions"
  ON public.stall_report_reactions FOR SELECT
  USING (true);

CREATE POLICY "anyone can create stall report reactions"
  ON public.stall_report_reactions FOR INSERT
  WITH CHECK (true);

ALTER TABLE public.stall_report_reactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stall_report_reactions;
