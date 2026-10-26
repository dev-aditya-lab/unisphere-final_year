// The Privacy Policy text. A pure function of its context, so it can be rendered, versioned and tested.
// Every statement here describes something the code actually does. Where a safeguard is not in place, the text says so.
// Changing this text is a notice change: bump NOTICE_VERSIONS in lib/privacy/registry.js (a test enforces it).
//
// Written in English first. The structure ({ heading, body[], list[] }) is language-neutral: another language is a
// parallel function with the same shape, selected in lib/privacy/copy.js.

import { MIN_AGE, OPTIONAL_PURPOSES } from "@/lib/privacy/registry";

export function getPolicySections(ctx) {
  const MAIL = `[${ctx.email}](mailto:${ctx.email})`;
  return [
    {
      heading: "What this policy covers",
      body: [
        "This policy explains what personal information UniSphere collects, why, who can see it, who else handles it, how long it is kept and how you can use your rights. It applies to the UniSphere website and apps.",
        "It is written to follow India's Digital Personal Data Protection Act, 2023 and the Digital Personal Data Protection Rules, 2025. Some of the Rules' duties are not yet in force: the main ones begin eighteen months after the Rules were published (about May 2027). UniSphere has built its tools ahead of that date. Nothing here is legal advice, and nothing in it says a lawyer or regulator has approved UniSphere.",
        "A shorter, itemised version is the [privacy notice](/privacy-notice). Every page about your privacy rights is listed in the [privacy centre](/privacy-centre).",
      ],
    },
    {
      heading: "Who is responsible",
      body: [
        ctx.entity
          ? `UniSphere is run by ${ctx.entity}. UniSphere decides why and how your personal information is used, which makes it the “Data Fiduciary” under the law.`
          : "UniSphere is run by the UniSphere team. UniSphere decides why and how your personal information is used, which makes it the “Data Fiduciary” under the law. The name and registered address of the operating organisation are published here once the owner has supplied them.",
        `Privacy questions, requests and grievances are answered by ${ctx.handler}. Write to ${MAIL}, use the [contact form](/contact?topic=privacy), or use the [grievance form](/grievance).`,
        ctx.dpo
          ? `UniSphere has appointed ${ctx.dpo} as its Data Protection Officer.`
          : "UniSphere has not appointed a Data Protection Officer. The person above answers instead.",
      ],
    },
    {
      heading: "Information we collect",
      body: ["The full, itemised list is in the [privacy notice](/privacy-notice). In short:"],
      list: [
        "To make an account: your name, username, email address and a password (kept only as a one-way hash), and a statement that you are 18 or older.",
        "What you add: profile details, photos, posts, comments, projects, events, messages, attachments, connections, Daily Challenge answers and Orbits.",
        "In communities: the messages you post in channels (with the files you attach, who you replied to and who you mentioned), your role and any warning, timeout or ban in a community, the point up to which you have read each channel, your notification and mute choices for it, and the invitation links you create or use (only a one-way hash of an invitation code is kept).",
        "If you use Refer & Earn: your invite code and, for each person who joins through it, whether and when they became active. You are never shown who they are. For someone who joins through an invite link: the code on the link (kept on their device for up to 30 days) and a keyed one-way hash of their network address at sign-up, used only to notice abuse and deleted within 90 days.",
        "What helps run and protect the service: IP address and device details of requests, rate-limit counters, security logs, and a push notification address if you switch notifications on.",
        "If you apply for the blue tick: a masked identity document, and the order and payment reference from the payment gateway.",
        "If you write to us: the name, email address and message you send.",
      ],
    },
    {
      heading: "Why we use it, and what we ask your consent for",
      body: [
        "UniSphere asks for your consent for each purpose separately. Accepting the Terms of Service is a separate step and is never treated as privacy consent.",
        "Required to have an account: using the information you give us to run your account and the features you use, and confirming that you are an adult. Without these we cannot offer an account.",
        "Everything else is optional and off until you turn it on. None of it is a condition of using UniSphere:",
      ],
      list: OPTIONAL_PURPOSES.map((p) => `${p.label}: ${p.summary}`),
    },
    {
      heading: "Changing your mind (withdrawing consent)",
      body: [
        "You can withdraw an optional consent at any time in Settings → Privacy, as easily as you gave it. Withdrawing one purpose does not affect the others or your account.",
        "Withdrawing the consent your account rests on means leaving UniSphere, so that is done by deleting your account. The privacy notice explains what each withdrawal switches off. Processing done before you withdraw stays lawful.",
      ],
    },
    {
      heading: "What is visible to others",
      body: [
        "Your email address is never shown on your profile. Your profile and posts are visible according to the settings you choose (all members, your college, connections or only you). UniSphere is open to anyone who signs up, but nothing on it is visible to people who are not signed in, and none of it is indexed by search engines. Choosing a college on your profile does not prove you belong to it. Your year and semester are hidden unless you turn on “show my class”.",
        "Profile photos, cover images and community icons and banners are stored in public image storage under random addresses. Anyone who has the exact address can open the image, even if your profile or the community is hidden from them. Message attachments, channel attachments, post attachments and identity documents are in private storage and open only through short-lived links given to people allowed to see them: a link to a channel file works only for someone who can read that channel, and stops working when the message is deleted.",
      ],
    },
    {
      heading: "Communities, channels and moderation",
      body: [
        "A community has channels. Who can read and who can post in a channel is set by the community's owner and administrators, and enforced by the database, not only by the interface. A message in a channel is visible to every member who can read that channel, for as long as it exists. Members-only communities are not listed in discovery. Staff-only channels are not visible to ordinary members at all, and their messages are left out of search, notifications and exports for them.",
        "A community's owner, administrators and moderators can see its member list (including people who asked to join and people who were banned). Ordinary members see active members only. The community keeps an audit log of changes to roles, channels, settings, invitations and moderation, which records who did what and never the text of a message. It cannot be edited.",
        "When someone reports a message or a member, UniSphere keeps a copy of the reported message and the two messages before it, so the report can be reviewed even if the message is deleted. Community moderators who rank above the person reported can read that copy and the report; the person reported cannot, and is not told who reported them. Moderators can also write private notes, which are not shown to the person they concern. A moderator can pass a report to the UniSphere team; staff of the UniSphere team see only reports that were passed on or that concern a community's owner, and the copy attached to them, not the rest of a private channel.",
        "Moderator decisions (a warning, a timeout, removal from the community, a ban, removal of a message) are shown to the person they concern with the reason, and can be appealed for 30 days. The copy of a reported message is erased once the report has been closed for a retention period set by the privacy team (the outcome of the report is kept). Deleting a message erases its text at once and removes its files from storage within about a day. Removing a message as a moderator erases the text too.",
        "Leaving a community, or being removed from it, ends your access. Your messages remain in the channels, attributed to you, unless you delete them. If you delete your account and ask for your messages to go with it, your community messages are deleted; if you do not, they stay without your name, in the same way as messages already delivered to other people.",
      ],
    },
    {
      heading: "AI features",
      body: [
        "AI features are off until you allow them. When you use one (writing help, idea discovery, summaries) the text you submit for that request is sent to an AI provider, with obvious email addresses, phone numbers and ID-like numbers masked first, to get a result. A summary of a post or discussion sends only content that is already visible to the whole platform or to your college (and only if the college setting allows it), plus the question you asked.",
        "If you ask for a summary of a community channel, the recent messages in that channel, without names (people appear as “Member 1”, “Member 2”), are sent to the AI provider. This is only offered for channels that every member of a public community can read; direct messages, members-only communities and staff-only channels are never sent. A moderator can ask for a second opinion on a report: the reported message is sent in the same way, only for public communities. An organiser can ask for a draft of a description or rules from their own notes. None of these is run automatically, and moderators decide every outcome themselves.",
        "UniSphere does not send private messages, private posts, connections-only posts or identity documents to any AI provider. UniSphere does not use your content to train or fine-tune any model of its own. The AI providers are listed in the [privacy notice](/privacy-notice#processors); they handle the text under their own terms, which UniSphere does not control, so it sends as little as it can.",
        "If you also allow AI indexing, your public or college-visible posts, projects and profile summary are turned into numeric embeddings by an embedding provider so related work can be found. This only happens when an embedding provider is configured, and only after you allow it. Turning it off deletes the embeddings made from your content.",
        "AI output is a suggestion. You approve anything before it is published. If AI is unavailable, the rest of UniSphere keeps working.",
      ],
    },
    {
      heading: "Cookies and similar technologies",
      body: [
        "UniSphere uses a small number of cookies and browser storage entries to keep you signed in, remember your appearance setting and keep unsent drafts. It does not use analytics, advertising or tracking cookies, so there is no cookie banner and nothing to switch off. When you pay for a blue tick you are taken to the payment gateway's own page, which may set its own cookies; UniSphere does not load any payment code on its own pages. The full list is on the [cookies page](/cookies).",
      ],
    },
    {
      heading: "Who else handles your information",
      body: [
        "UniSphere uses service providers (“Data Processors”) who handle information only on UniSphere's behalf, for the purposes in this policy: a database and sign-in service, file storage, a transactional email service, a hosting platform, a rate-limiting cache, AI providers (only if you allow AI), and the payment provider (blue tick only). The [privacy notice](/privacy-notice#processors) lists the ones switched on for this site right now, what each receives and why.",
        "Some of these providers process information outside India. The law allows this, subject to restrictions the Government may set for particular countries. UniSphere will follow them.",
        "UniSphere does not sell personal information. It may disclose information where a law, court or authority requires it, and says so in the record it keeps.",
      ],
    },
    {
      heading: "Blue tick payments and identity documents",
      body: [
        "If you buy the optional blue tick, a payment gateway takes the payment on its own page. UniSphere passes it your name and email address when the payment starts, and never receives your card, UPI or bank details. It keeps the order and payment reference, amount, date and status so it can give you the blue tick, handle refunds and meet accounting and tax duties. Those records are kept even after you delete your account.",
        "To confirm who you are, you send an identity document (a masked Aadhaar with the first 8 digits hidden is enough). It is stored in private storage that only blue tick reviewers can open, used only to compare your name and photo with your profile, and deleted when a decision is made. UniSphere does not record your Aadhaar number. You consent to this separately when you apply, and the decision, who made it and when stay in the audit log.",
      ],
    },
    {
      heading: "Advertising",
      body: [
        "UniSphere does not currently show advertising and does not share your information with advertisers. If that changes, this policy and the cookies page will be updated, and anything that needs your consent will ask for it, before any advertisement appears.",
      ],
    },
    {
      heading: "Children",
      body: [
        `UniSphere is for people aged ${MIN_AGE} and over. The law treats anyone under 18 as a child and requires a parent's verifiable consent before a child's information is processed; UniSphere has not built that process, so it does not offer accounts to under-18s. When you sign up, you declare that you are ${MIN_AGE} or older. That is a declaration, not a check: UniSphere does not ask for a date of birth or an identity document to test it.`,
        "If someone tells UniSphere, or it becomes clear, that an account belongs to someone under 18, the account is restricted and the person is offered deletion. UniSphere does not track or monitor children's behaviour and does not aim advertising at them.",
      ],
    },
    {
      heading: "How long we keep information",
      body: [
        "UniSphere keeps information only as long as it is needed for the purpose it was collected for. There is no single period; it depends on the kind of record. The privacy notice lists each kind and how it ends.",
      ],
      list: [
        "Your account, profile, posts, messages and files: while your account is active.",
        "Community channel messages: while the community and the message exist. A deleted or removed message loses its text at once and its files within about a day. Invitation links stop working when they expire or are revoked, and only their hash is stored. A community's audit log is kept with the community.",
        "Closed community reports: the copy of the reported message is erased after a retention period (the outcome and category stay). Reports of an erased account follow the same rule.",
        "When you delete your account: a 14-day grace period in which you can change your mind, then erasure. Your files are removed from storage and your account and the content you own are deleted.",
        "Kept after deletion, because another law or someone else's safety requires it: payment records (accounting and tax law), reports made about the account with the content they quoted (community safety), messages already delivered to other people if you chose to keep them (they no longer show your name), and entries in the audit log, which carry only an anonymous id.",
        "Support messages and closed requests: removed or anonymised after a retention window the privacy team sets and publishes in the privacy notice. These windows are being reviewed and may change; changes are announced in the notice.",
        "Logs: UniSphere's own audit log is kept, and the Rules ask for logs of processing to be kept for at least a year once they apply.",
        "Backups kept by the database provider expire on the provider's schedule. A record of erased accounts is kept so an erased account cannot come back if a backup is restored. See the privacy notice.",
      ],
    },
    {
      heading: "How we protect information",
      body: ["What is in place today:"],
      list: [
        "Encrypted connections (HTTPS) between you and UniSphere.",
        "Access rules enforced inside the database, not only in the interface, so one member cannot read another's private data.",
        "Passwords stored only as one-way hashes. Sign-in, password and request attempts are rate limited.",
        "Private storage with short-lived links for attachments and identity documents.",
        "Staff access is limited by role. Privacy records are open only to named privacy staff, not to every administrator, and staff actions are written to an audit log that cannot be edited.",
        "A written process for handling a personal data breach, including telling affected people and the Data Protection Board.",
      ],
    },
    {
      heading: "What is not in place",
      body: [
        "UniSphere has not had an independent security audit and holds no security or privacy certification. No system is perfectly secure; please use a strong, unique password. If you find a weakness, tell us through the contact form.",
      ],
    },
    {
      heading: "Your rights and how to use them",
      body: [
        "Under the law you can ask UniSphere to give you a summary of your information and how it is used, correct or complete it, erase it, and withdraw consent; you can have a grievance heard; and you can nominate someone to exercise your rights if you die or cannot. Signed-in members can do each of these themselves:",
      ],
      list: [
        "Get a copy of your data: Settings → Privacy requests (you must be signed in). The [privacy centre](/privacy-centre) explains each step.",
        "Correct your data: edit your profile in Settings, or send a correction request for what you cannot edit yourself.",
        "Delete your account and data: Settings → Privacy requests → Delete account. You confirm with your password.",
        "Withdraw a consent: Settings → Privacy.",
        "Nominate someone: Settings → Privacy requests.",
        `Raise a grievance: the [grievance form](/grievance), open to everyone, including people without an account. You get a reference number and can follow its progress. We aim to reply within ${ctx.responseTarget} and commit to resolving it within ${ctx.maxDays} days.`,
      ],
    },
    {
      heading: "If you are not satisfied",
      body: [
        "If your grievance is not resolved, you can complain to the Data Protection Board of India. The law expects you to use UniSphere's grievance process first. The Board publishes how to file a complaint; UniSphere does not control that process.",
      ],
    },
    {
      heading: "If there is a data breach",
      body: [
        "If personal information held by UniSphere is breached, UniSphere will tell each affected person, in plain language and without delay, what happened, what it may mean for them, what has been done and what they can do, and will report to the Data Protection Board within the times the Rules set. UniSphere does not publish incident details on public pages.",
      ],
    },
    {
      heading: "Changes to this policy",
      body: [
        "Every version of this policy and the privacy notice is kept, with its date, so you can see what applied when. When a change affects what you have agreed to, UniSphere tells you in the app and asks for your consent again only where the law requires it. It never changes a choice you made without asking you.",
      ],
    },
    {
      heading: "Contact",
      body: [
        `Questions about this policy, or a request about your information? Use the [contact form](/contact?topic=privacy), the [grievance form](/grievance), or email ${MAIL}. Say which account or email address it concerns so we can find it. We may need to confirm that you are the person the information is about before we act. We will not give one person another person's information.`,
      ],
    },
  ];
}
