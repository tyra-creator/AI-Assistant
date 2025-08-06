-- Add OAuth token storage columns to profiles table (if they don't exist)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS google_access_token TEXT,
ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS google_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS microsoft_access_token TEXT,
ADD COLUMN IF NOT EXISTS microsoft_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS microsoft_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS google_user_info JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS microsoft_user_info JSONB DEFAULT '{}'::jsonb;

-- Add indexes for better performance (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_profiles_google_expires ON public.profiles(google_expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_microsoft_expires ON public.profiles(microsoft_expires_at);