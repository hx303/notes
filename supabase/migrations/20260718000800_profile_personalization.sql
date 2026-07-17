-- wouldkeep 扩展个人资料
-- 仅新增可选字段和长度约束，不删除现有账户或资料。

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_signature_length') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_signature_length CHECK (signature IS NULL OR char_length(signature) <= 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_bio_length') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 300);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_location_length') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_location_length CHECK (location IS NULL OR char_length(location) <= 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_website_url_length') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_website_url_length CHECK (website_url IS NULL OR char_length(website_url) <= 2048);
  END IF;
END
$$;

COMMENT ON COLUMN public.profiles.signature IS '用户主动公开的一句话个性签名';
COMMENT ON COLUMN public.profiles.bio IS '用户主动公开的个人简介';
COMMENT ON COLUMN public.profiles.location IS '用户主动公开的所在地文本';
COMMENT ON COLUMN public.profiles.website_url IS '用户主动公开的个人链接';
