-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

CREATE TABLE IF NOT EXISTS public.fb_marketer_store (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (optional for service_role / anon keys)
ALTER TABLE public.fb_marketer_store ENABLE ROW LEVEL SECURITY;

-- Allow read/write policy for API access
CREATE POLICY "Allow all access to fb_marketer_store"
ON public.fb_marketer_store
FOR ALL
USING (true)
WITH CHECK (true);
