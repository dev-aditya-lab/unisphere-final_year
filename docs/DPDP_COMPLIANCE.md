# DPDP Act and Rules: implementation status, gaps and launch checklist

This is an engineering document, not legal advice. Nothing in the app or this file says UniSphere "is compliant". It describes what the code does, what it does not, and what the owner or a lawyer still has to decide. Verified against the official Rules text (G.S.R. published 13/14 November 2025, MeitY PDF) on 2026-10-21.

## 1. What is in force when

From the Rules, rule 1:

| Provision | Commences |
|---|---|
| Rules 1, 2, 17 to 21 (short title, definitions, the Data Protection Board) | On publication, 13/14 Nov 2025 |
| Rule 4 (Consent Managers) | One year after publication: about 13/14 Nov 2026 |
| Rules 3, 5 to 16, 22, 23 (notice, security, breach, retention, child data, rights, transfers, etc.) | Eighteen months after publication: about 13/14 May 2027 |

Which sections of the Act itself are in force today must be confirmed from the Gazette notification of commencement (not verified here: the MeitY server refused the automated fetch of that notice). Treat "about 13 May 2027" as the date for the duties UniSphere has built for, and confirm the exact day.

Rule numbers used in this repo follow the official text: 3 notice, 6 security, 7 breach, 8 retention/erasure/log retention, 9 contact person, 10 verifiable parental consent, 12 and Fourth Schedule child exemptions, 13 Significant Data Fiduciary, 14 rights/grievance (90 days)/nomination, 15 transfers.

## 2. Gap report (what the audit found, and what was done)

| # | Finding in the repository | Status |
|---|---|---|
| 1 | Signup recorded only "I accept Terms + Privacy + Guidelines" in one box; no consent record, no version | **Fixed**: three separate unticked statements; server-side purpose records with notice version and history (migration 0043) |
| 2 | AI assist was ON for everyone by default (`profiles.ai_assist_enabled` default true), writable from the browser | **Fixed**: off by default, consent-backed (`ai_assist`), enforced server-side in `runAiTask`, browser can no longer write it; existing members were switched off and are asked once |
| 3 | Posts, projects and profile text were embedded by an external provider (when configured) with no consent from the author | **Fixed**: only with `ai_discovery_index` consent; withdrawal deletes embeddings; erasure deletes them |
| 4 | Text sent to AI providers had no masking | **Fixed**: emails, phone numbers, Aadhaar/PAN/card-like numbers masked before any prompt or embedding |
| 5 | Identity document upload had no separate consent | **Fixed**: `identity_verification` consent; upload and submit refuse without it; withdrawal deletes the document |
| 6 | No age handling at all | **Fixed (partly)**: 18+ declaration; adults-only policy; under-18 declarations are restricted. Verifiable parental consent is **not built** (see section 6) |
| 7 | Deletion: one click, no re-authentication, direct browser insert into `account_deletion_requests`, no retry state, no completion marker, embeddings and file rows left behind, audit pointer blocked deletion of some members | **Fixed**: password + "DELETE" re-confirmation, server-created request with its own record, retry with back-off, derived data erased, honest outcome (completed vs partially completed with reasons), ledger, completion email |
| 8 | No way to track a rights request; no grievance channel; no nomination | **Fixed**: requests, status history, deadlines, visitor grievances with tracking, nomination (migration 0044) |
| 9 | Data export covered ~12 tables, no explanation of processing | **Fixed**: ~35 sources plus what is collected, why, providers, consents; lists what is not included |
| 10 | No breach process | **Fixed**: restricted incident records, 72-hour clock, drafts that never invent facts, two-person approval, manual Board submission record (migration 0046) |
| 11 | Every global admin could in principle be given anything; no privacy role | **Fixed**: `privacy_officer` role; privacy permissions are not given to any other role; access review page |
| 12 | Six SECURITY DEFINER functions were executable by signed-out visitors (blue tick admin/review functions; `admin_list_deletions` after re-creation) | **Fixed** in 0047, with a self-audit function and a test |
| 13 | Contact messages, AI usage logs, closed requests, reports about erased accounts had no retention | **Fixed**: retention job with configurable windows (placeholders) |
| 14 | `audit_logs` append-only trigger blocked erasing any member who had ever been an audit actor | **Fixed** (0043) |
| 15 | Cookies/trackers | **Finding: none.** No analytics, advertising, pixel or third-party script (Monetag was removed earlier). Therefore **no cookie banner was added** (it would be a consent request for nothing). A test fails if a tracker is ever added. Razorpay's checkout loads only on the pay page; it is disclosed |
| 16 | Admin could overwrite the Privacy Policy text with Markdown from the settings screen, bypassing versioning | **Fixed**: override removed; the policy lives in code and is versioned |
| 17 | Legacy tables `student_id_roster`, `student_id_attempts`, `college_email_challenges`, `college_verifications`, `college_invites` still exist (kept deliberately when college verification was removed) and may hold students' IDs | **Open.** Not dropped, because the owner asked that tables be kept. Decide whether to purge them (data minimisation) |
| 18 | Supabase `config.toml` has `enable_signup = true` (the project may allow sign-up directly through Supabase, bypassing the signup form) | **Mitigated**: a consent gate on every page means such accounts cannot use the app without recording consent. Consider disabling public signup in the Supabase dashboard |
| 19 | Public image buckets: avatars/covers are readable by anyone holding the (random) URL regardless of profile visibility | Documented in the policy. Accepted design; not changed |

## 3. What was built (by feature)

- **Notice and consent**: `lib/privacy/registry.js` (purposes, itemised data, versions), `policy-text.js`, `/privacy-notice`, `/privacy`, signup form, `/privacy-review`, Settings → Privacy. Consent is per purpose, server-written, auditable, and history survives erasure with the member link cleared.
- **Versioning**: every notice version is archived immutably (`privacy_notice_versions`); a unit test fails if the content changes without a new version; `/privacy-centre/versions/<v>` shows archived text.
- **Older members**: soft banner by default (`privacy_review_mode = soft`); accounts created after the cutover, or everyone once the privacy team switches to `required`, must complete `/privacy-review`. Delete/withdraw/download pages are never gated.
- **Cookies**: audit finding above; `/cookies` updated.
- **Rights**: `/privacy-requests` (copy, correct, withdraw, delete, nominate, other), `/delete-account`, `/grievance`, `/grievance/track`, `/privacy-contact`, `/privacy-centre`.
- **Erasure and retention**: `lib/services/account-deletion.js`, migration 0045, `docs/DPDP_RETENTION.md`.
- **AI**: consent gate, masking, no private content, no training on member content by UniSphere, usage log without prompts. `docs/DPDP_PROCESSORS.md`.
- **Breach**: `/admin/privacy/incidents`.
- **Admin**: `/admin/privacy` (overview, requests, incidents, notices and consent, retention, access review, settings).
- **Security**: RLS verified on every public table; definer-function exposure closed; tests for cross-user denial.

## 4. Environment variables (no secrets)

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_PRIVACY_CONTACT_NAME` | Person who answers privacy questions (default: `REQUEST_HANDLER` in `lib/constants.js`) |
| `NEXT_PUBLIC_PRIVACY_CONTACT_TITLE` | Their role, e.g. "Grievance Officer" |
| `NEXT_PUBLIC_PRIVACY_EMAIL` | Dedicated privacy mailbox (default: `hello@unispheres.in`) |
| `NEXT_PUBLIC_PRIVACY_PHONE` | Optional phone |
| `NEXT_PUBLIC_DPO_NAME`, `NEXT_PUBLIC_DPO_EMAIL` | Set **only** if a Data Protection Officer is really appointed |
| `NEXT_PUBLIC_BUSINESS_LEGAL_NAME`, `NEXT_PUBLIC_BUSINESS_ADDRESS`, `NEXT_PUBLIC_BUSINESS_PHONE` | Operating entity (existing) |
| `CRON_SECRET` | Required for the worker (erasure, retention) and the replay endpoint |

## 5. Manual setup

1. Apply migrations 0043 to 0047 to the **remote** Supabase project (not done by this work). The app is written to degrade (no lock-outs) while they are missing, but erasure, requests and consent need them.
2. Name at least two privacy officers: `npm run privacy:grant-officer -- person@example.com`.
3. Make sure the worker calls `/api/cron/tick` (erasure and retention run there). The Vercel cron in `vercel.json` runs once a day; erasure then waits up to a day. Use a 5-minute external monitor or `npm run worker` as in `docs/DEPLOYMENT.md`.
4. Supabase dashboard: consider disabling public sign-ups (the app creates accounts itself); check the backup retention window and write it into `docs/DPDP_RETENTION.md`.
5. Export the erasure ledger regularly to storage that is not restored with the database: `npm run privacy:export-ledger`.
6. For each processor in `docs/DPDP_PROCESSORS.md`, verify in the provider's own console/contract: retention, training use, region, DPA.
7. Cloudflare R2: confirm the private bucket has no public access and that the public bucket holds only the six public image purposes.
8. Email provider (Resend): verify the sending domain; breach and grievance mail depend on it.
9. Search Console: resubmit the sitemap after deploying (`/sitemap.xml` is now allowed in robots.txt).

## 6. Children

The Act treats anyone under 18 as a child. Verifiable parental consent (Rule 10) needs identity and age details of the parent from a legally authorised source or a Digital Locker token. That integration does not exist, so a self-declared "I am a parent" tick would be worthless and was not built. UniSphere therefore offers accounts to adults only, records an 18+ declaration (no date of birth, no document), restricts accounts that declare under 18, offers them deletion, and does no tracking, behavioural monitoring or targeted advertising of anyone. The Fourth Schedule exemption for "educational institutions" is for institutions of learning; UniSphere is a social platform, and nobody should assume it applies. The setting `privacy_minors_policy` exists so this can change when a verification route is added. A declaration is not verification: some under-18s will tick the box.

## 7. Information the business still has to supply

- Registered legal entity name and address (none is invented; pages omit them until set).
- Confirmation that UniSphere has not been notified as a Significant Data Fiduciary (the policy says no DPO is appointed).
- Retention periods: all numbers are placeholders (365 days). Payment records: the legal period under tax/accounting law. Backups: provider's window.
- Whether response-time targets (30 days for rights requests, 14 days for grievances) are acceptable; the Rule 14(3) ceiling for a grievance is 90 days.
- Provider contracts/DPAs and regions (see processors doc).
- Name and confirmation of the second privacy officer.
- Confirmation of the Gazette commencement notification for the Act's sections.

## 8. Needs confirmation or a lawyer

1. Exact commencement dates (13 vs 14 Nov 2025 publication; sections of the Act).
2. Rule 8(3): a minimum one-year retention of personal data, traffic data and logs "for the purposes in the Seventh Schedule". How this squares with erasure on request is unsettled; UniSphere erases account data on request and keeps limited records, and has not retained full content "for the State". A lawyer should decide the position.
3. Whether keeping delivered messages (default) is acceptable, or whether erasing them should be the default.
4. Whether UniSphere is a "social media intermediary" and what the Third Schedule means for it (thresholds are 2 crore users; not applicable at this size).
5. Legal basis wording for processing needed for security, abuse prevention and legal obligations under s. 7 rather than consent.
6. Cross-border transfer: AI and email providers are outside India; Rule 15 and any future Government orders.
7. Whether the grievance-before-Board sequence and wording match the Board's published procedure.
8. Backup expiry and the restore procedure as a response to s. 8(7).

## 9. Test, lint and build results (2026-10-21)

See the final report in the conversation; commands: `npx eslint .`, `npx vitest run --project unit`, `npx vitest run --project integration` (local Supabase only; see `docs/SETUP.md`), `npx next build`.

## 10. Launch-readiness checklist

- [ ] Migrations 0043 to 0047 applied to production.
- [ ] Two privacy officers named; one reads the privacy mailbox daily.
- [ ] Contact email, person, entity details confirmed and published.
- [ ] Worker runs at least every 5 minutes; `CRON_SECRET` set.
- [ ] Email delivery verified with a real grievance, an erasure and a test breach notice (to yourself).
- [ ] File storage configured; an erasure rehearsed on a test account, including a stored image.
- [ ] Processor checklist completed; AI provider terms read.
- [ ] Retention windows reviewed by a lawyer.
- [ ] Backup window written down; first ledger export taken.
- [ ] Decision on legacy student-ID tables.
- [ ] `privacy_review_mode` plan: switch to `required` before 13 May 2027.
- [ ] Lawyer review of section 8 items.
