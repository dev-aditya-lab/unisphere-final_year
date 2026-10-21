-- 0040: College ID verification is gone from UniSphere.
--
-- Members can no longer enter a student ID, request a manual review or redeem a college invite code to earn a "Verified"
-- badge, and staff have no student-ID list or verification queue. This removes the functions behind them and the two
-- permissions that guarded them.
--
-- The tables (student_id_roster, student_id_attempts, college_verifications, college_invites) are left in place and
-- unused, because dropping them would destroy imported lists and past decisions that cannot be recovered. They hold only
-- keyed hashes and review records. When you are sure nothing needs them, drop them by hand:
--   drop table public.student_id_attempts, public.student_id_roster, public.college_verifications, public.college_invites cascade;

drop function if exists public.claim_student_id(uuid, uuid, text);
drop function if exists public.import_student_roster(uuid, jsonb);
drop function if exists public.roster_stats(uuid);
drop function if exists public.list_student_roster(uuid, text, text, integer, integer);
drop function if exists public.manage_roster_entry(uuid, text, text);
drop function if exists public.review_college_verification(uuid, text, text, text);
drop function if exists public.list_verification_requests(text, integer, integer);
drop function if exists public.create_college_invite(uuid, text, integer, integer);
drop function if exists public.redeem_college_invite(text);
drop function if exists public.finalize_college_verification(uuid, text, uuid, text, text);

delete from public.role_permissions where permission in ('roster.manage', 'verification.review');
