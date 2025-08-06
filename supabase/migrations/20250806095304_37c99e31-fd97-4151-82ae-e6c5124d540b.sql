-- Add OAuth token storage columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN google_access_token TEXT,
ADD COLUMN google_refresh_token TEXT,
ADD COLUMN google_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN microsoft_access_token TEXT,
ADD COLUMN microsoft_refresh_token TEXT,
ADD COLUMN microsoft_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN google_user_info JSONB DEFAULT '{}'::jsonb,
ADD COLUMN microsoft_user_info JSONB DEFAULT '{}'::jsonb;

-- Add indexes for better performance
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_google_expires ON public.profiles(google_expires_at);
CREATE INDEX idx_profiles_microsoft_expires ON public.profiles(microsoft_expires_at);