# Administrator guide (for college staff and platform administrators)

This guide is for the people who run UniSphere day to day: administrators, moderators and support agents. You do not need to be technical. Everything is in the **Admin console**, reached from your profile menu (top right)
or at `/admin`.

## Open to join, private to view

UniSphere is not a public website. Logged-out visitors see only the home, about and legal pages. **Anyone can sign up**
with an email address (no college or role is required) and then use everything; search engines are
told to stay away. Your job as staff is to keep it healthy: handle reports, keep the college directory tidy, and remove
members who break the guidelines.

### The college directory

Members list the schools and colleges they belong to (optional, up to eight: where they study now, studied before, or teach or work) by
searching, or add one by name when it is missing, and say whether they are a student, alumnus, teacher or staff member at each. Nothing
waits for approval. This is only an association: it never verifies anyone and never gives a badge.

- **Community-added** listings are labelled as such everywhere. **Verified listing** means staff reviewed the record
  (staff checked the details). Only a global/college administrator can mark a
  listing verified.
- Admin → **Colleges** shows open reports first: corrections (accept to apply), duplicates, inaccurate information and
  abuse. Moderators can correct and hide listings; **merging** two records needs a college administrator.
- **Merge** moves members and content to the record you keep and leaves the other as a redirect, so old links work.
  Add **aliases** (abbreviations, former names) so search finds the right record.
- Hiding a listing removes it from search without touching its members.

## Who can do what

| Role | Can | Cannot |
| --- | --- | --- |
| **Global admin** | Everything, for every college: settings, feature flags, roles, releases, AI status | Act on another global admin (remove the role first) |
| **College admin** | Run one college: members, moderation, announcements, events/communities, analytics, audit log, appoint moderators | Change platform settings; appoint administrators |
| **Moderator** | Review reports and appeals, remove or restore content, warn, restrict | See member emails, suspend, change roles |
| **Support agent** | Answer the contact inbox and triage product feedback | See member data |

Rules that always apply: you cannot act on yourself; only a global admin can act on an administrator; you cannot decide an
appeal against your own decision (a global admin can); every action is written to the audit log, which nobody can edit.

## Departments and courses

Members also add the department or course their college is missing, the same way they add colleges: type the name and it is
there for everyone from then on. Admin → **Departments & courses** lists them all (the ones the college set up and the ones
members added) with who added each and how many members use it.

- **Rename** fixes a typo; everyone who chose the item sees the new name.
- **Offered** switched off hides it from the pickers. Profiles that already use it keep it.
- **Remove** deletes it. Profiles that used it keep their college and role and just lose that line.
- A member can add at most 20 departments and courses a day.

## Skills and interests

The pickers on profiles, onboarding, projects and opportunities suggest names from a list you manage in Admin →
**Skills & interests**. The list is broad on purpose: technology, design, writing, business, science and engineering, health,
arts and music, languages, leadership, sports and hands-on trades. Members can always type their own.

- **Typed by members, not listed yet** shows what members use most that is not in the list; choose a category and add each
  with one click.
- **Add**, **Edit** (name, category, skill or interest), the **Suggested** switch (hide without losing it) and **Remove**.
  Removing never changes anyone's profile.
- The members column shows how many profiles use each item.

## Moderation

**Reports** (Admin → Reports) are sorted by severity then age. Open one to see what was reported *as it was when
reported*, the member's history and any AI suggestion. Press **Take this report** so colleagues know you have it, then
choose:

| Decision | Effect | The member is told |
| --- | --- | --- |
| Dismiss | Nothing changes. Reporter is told it was reviewed | No |
| Warn | A notification with your reason | Yes |
| Remove content | Post/comment disappears for everyone but its author | Yes, with the reason |
| Restrict account | Profile hidden, cannot post or message; can still read and appeal | Yes |
| Suspend account | Signed out of the app; can only read the decision and appeal | Yes (on the suspended page) |

Always write the reason as if the member will read it, because they will. Internal notes are never shown to them. The AI
suggestion is a second opinion only; it is not shown to members and never acts by itself. It is not used for content that
is not public, so for those you decide from the content alone.

**Appeals** (Admin → Appeals): each decision can be appealed once within 30 days. A different reviewer reads the original
decision and the member's message and chooses **Uphold** (the decision is reversed: restrictions are lifted, removed
content restored) or **Deny**. Both need a note the member will see.

**Members** (Admin → Members): search by name, username or email; open a record for history and direct actions (warn,
restrict, suspend, reinstate). Reinstating closes any pending appeal.

## Communication

- **Announcements**: notifies every member of the college. Use sparingly; pinned ones stay on top; you can archive but not
  unsend notifications.
- **Broadcast** (Admin → Broadcast; needs the announcements permission): a notification to exactly the people you choose,
  in the bell and, if you leave it on, on their phones. Pick any mix of **everyone** (global admins only), **colleges**,
  **communities** (by address, e.g. `robotics-club`) and **named people** (usernames), then narrow by account type
  (students, alumni, faculty, staff). The page shows how many people it reaches before you send, asks once more with that
  number, and records the send in the audit log. College admins can only reach members of their own colleges, even if they
  ask for everyone. Each member's own settings still apply (someone who switched off *Official announcements* is not
  notified, and someone who switched off its *Push* sees it in the bell only). You can send ten an hour; it cannot be
  unsent, so keep it short, useful and rare. Optionally add a link to a page on UniSphere (for example `/events`) that opens
  when the notification is tapped.
- **Support inbox**: messages from the public contact form. Reply from your email; mark as *in progress* / *resolved* /
  *spam* here.
- **Feedback** (global admins and support): bug reports with severity and automatic context (page, version, browser),
  ideas with votes, general feedback. Set a status and write a public reply; the member is notified. Merge duplicates
  (votes move to the original). Ideas marked *planned*, *in progress* or *shipped* appear on the public **Roadmap**.
- **Releases** (global admins): write release notes for the public **Changelog**. Save a draft, then Publish.

## Account deletion

Members can ask to delete their account. It is erased automatically after 14 days unless they cancel. In Admin →
**Account deletion** you can **Erase now** (permanent) or **Reject**. Administrators' own deletion requests are never
processed automatically.

## Settings and feature flags (global admins)

Changes apply within about 30 seconds and are audit-logged.

- **Open registration**: turn off to stop new sign-ups.
- **Maintenance mode**: only administrators can use the app. Use during incidents or migrations.
- **Rate limits**, **upload limits**, **AI daily limit**: tighten if you see abuse or cost.
- **Feature flags**: switch whole features (messaging, events, AI assistants…) off without a deployment.
- **Legal text**: guidelines, privacy and terms (Markdown). Empty uses the built-in text.

## Refer & Earn (global admins)

**Admin → Refer & Earn** shows how invitations are going and lets you act on the few that need a human.

* **Held for review**: a member whose friends qualify faster than the daily limit (10 in 24 hours by default) has the extra ones held. Open
  one, read the evidence (each qualification condition is checked for you), then **Approve** (pays the 100 Orbits, once) or **Reject**.
  A reason is required and goes in the audit log. Holding is not a penalty: it only asks a person to look.
* **Abuse signals**: for example several referrals from one network. Shared hostel Wi-Fi is normal, so a signal never withholds a reward
  by itself. It is a prompt to look.
* **Reverse reward**: for confirmed abuse. It adds a compensating Orbits entry (never below zero, never other Orbits) and removes the
  referral from the leaderboard. If the member already has fewer Orbits than the reward, the shortfall is recorded.
* **Program settings**: switch the program, the reminder popup and the launch announcement on or off, and change how often the reminder
  may appear. The 100 Orbit reward is fixed. **Export CSV** has ids, statuses and dates only: no names or emails.
* Staff see usernames and dates, not emails or network data. Only global admins have these permissions.

## Analytics and audit

**Analytics** shows counts only (members, posts, comments, messages, reports) for a date range and college, with CSV
download. Message and post *content* is never used. **Audit log** records who did what and when (roles, moderation,
settings, imports, deletions); filter it, or export CSV. It cannot be edited.

## Etiquette for staff

- Do not discuss a member's case outside the console; do not screenshot private content.
- Use the least severe action that protects people. Warn before you suspend, unless the harm is serious.
- If you know the member personally, hand the report to someone else.
- When unsure, ask another moderator: reports can be released and re-taken.
