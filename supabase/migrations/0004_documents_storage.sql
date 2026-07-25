-- VERITY 0004_documents_storage
-- The canonical private bucket for source documents, decreed in
-- docs/contract-spec.md §3c: "The Supabase storage bucket is named
-- `documents`. Private, never public." Written by upload flows via the
-- service-role client; read only through the 60s signed URLs minted in
-- app/api/sources/[id]/open — the one sanctioned service-role read path.
-- `public: false` with no anon/authenticated storage.objects policies
-- means only the service role touches it. Additive only, per repository
-- convention (0002+ are additive-only migrations on top of 0001_init).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  4194304, -- 4MB, matches MAX_UPLOAD_BYTES in lib/ai/documents.ts (under Vercel's 4.5MB body ceiling)
  array['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;
