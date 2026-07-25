-- VERITY 0003_voice_storage
-- Lane E: private storage bucket for voice-note captures written by
-- POST /api/voice/upload. Additive only, per repository convention
-- (0002+ are additive-only migrations on top of 0001_init).
--
-- Every write to this bucket goes through the service-role Supabase client
-- in app/api/voice/upload/route.ts (same client pattern as
-- app/demo/_lib/dal.ts's getServiceClient). The service role bypasses
-- storage RLS entirely, so this migration adds no anon/authenticated
-- storage.objects policies for this bucket — `public: false` plus "no
-- policies" means only the service role can read or write it. If a client
-- ever needs to read a recording directly (e.g. a signed playback URL),
-- that is a deliberate follow-up policy, not an oversight here.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio',
  'audio',
  false,
  26214400, -- 25MB, matches MAX_AUDIO_BYTES in lib/voice/audio.ts
  array['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav']
)
on conflict (id) do nothing;
