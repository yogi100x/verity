-- VERITY 0002_harden_has_care_access
-- Security-lint hardening, no behaviour change:
--  1. Pin search_path so a malicious schema cannot shadow care_relationships
--     inside the SECURITY DEFINER function.
--  2. Revoke EXECUTE from anon + public. NOT from authenticated: RLS policy
--     expressions call this function as the querying role, and Supabase
--     anonymous sign-ins run as `authenticated`, so revoking there would
--     break every policy for every user.

alter function public.has_care_access(uuid) set search_path = public;

revoke execute on function public.has_care_access(uuid) from anon;
revoke execute on function public.has_care_access(uuid) from public;
