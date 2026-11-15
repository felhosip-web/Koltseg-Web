-- Keep the cloud schema aligned with incoming records created by the app.
ALTER TABLE public.incomings
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
