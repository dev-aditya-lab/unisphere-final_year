-- 0022: a college that runs a student-ID verification process is a verified listing.
--
-- 0018 marked listings "verified" only when a roster already existed at migration time, which is data-dependent
-- (a fresh database has no roster yet). The college this project was built at, RGEC, is configured for student-ID
-- verification by the people who run UniSphere, so its listing is verified regardless. Member-added colleges are
-- always created as "community" with verification mode "manual", so they can never match this.
update public.colleges
   set listing_status = 'verified'
 where verification_mode = 'student_id'
   and created_by is null
   and listing_status <> 'verified';
