import { CONTACT_EMAIL, REQUEST_HANDLER, RESPONSE_TARGET } from "@/lib/constants";
import { privacyContact } from "@/lib/privacy/config";
import { getPolicySections } from "@/lib/privacy/policy-text";

const MAIL = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

// Default text for the legal / policy pages. Administrators can replace the guidelines and terms from
// /admin/settings (guidelines_md, terms_md). The Privacy Policy cannot be replaced there: it must describe what the code
// really does and is versioned (lib/privacy/). These defaults should be reviewed by legal counsel before launch.
//

export const LEGAL_UPDATED = "29 October 2026";

export const GUIDELINES = [
  {
    heading: "Be a good member of the community",
    body: [
      "UniSphere exists so people on a campus can build, learn and help each other. Treat everyone with respect, assume good intent, and disagree with ideas rather than people.",
    ],
  },
  {
    heading: "What is not allowed",
    list: [
      "Harassment, bullying, threats, hate speech or discrimination of any kind.",
      "Sharing someone's private information (including photos, phone numbers or student records) without their consent.",
      "Impersonating another person, club or official college office.",
      "Spam, scams, misleading offers, or unsolicited promotion.",
      "Sexual content involving minors, graphic violence, or content that promotes self-harm.",
      "Cheating services, sharing exam material, or content that breaks your college's academic integrity rules.",
      "Attempting to access other people's accounts, or abusing the platform's systems.",
    ],
  },
  {
    heading: "Communities and channels",
    body: [
      "Every community has its own rules, written by the people who run it. They add to these guidelines and never replace them. Read them before you post, and follow the channel's topic.",
      "Bullying is not banter. Do not target, mock, exclude or pile on someone, do not post screenshots of private conversations to shame anyone, and stop when someone asks you to. Threats and sexual harassment are never acceptable.",
      "Do not send invitation links to people who did not ask for them, and do not use channels to advertise. Do not mention people repeatedly to get their attention.",
      "Moderators are members who volunteered. Treat them as you would want to be treated. If you think a decision was wrong, use the appeal option rather than arguing in the channel.",
    ],
  },
  {
    heading: "Academy work and certificates",
    body: [
      "On the Academy, hand in only work you made yourself, and credit anything you built on. Do not share course material, answers, recordings or meeting links outside the course. Be courteous to mentors and fellow students in live classes and feedback. Passing off someone else's work, or helping others to, can lead to a failed grade, loss of access and revocation of a certificate. Concerns about a certificate can be reported through the [contact form](/contact).",
    ],
  },
  {
    heading: "Sharing ideas and projects",
    body: [
      "Give credit where it is due. Similar ideas often appear independently; UniSphere shows related work to start conversations, not to accuse anyone. If you believe your work was copied, report it with evidence so a moderator can review it.",
    ],
  },
  {
    heading: "Copyright and intellectual property",
    body: [
      "Only post work you made or have the right to share. If you believe something on UniSphere infringes your copyright, follow the steps in the [copyright policy](/copyright-policy).",
    ],
  },
  {
    heading: "Reporting and moderation",
    body: [
      "Posts, comments, profiles, messages, channel messages, communities and college listings have a report option. Reports about a community's messages go first to that community's moderators; reports about posts, profiles and communities are reviewed by moderators from your college or the UniSphere team. AI may help suggest a category or priority, but a person makes every enforcement decision.",
      "Depending on severity, actions can include a warning, removal of content, a temporary restriction or suspension. You will be told the reason, and you can submit an appeal from your account. The [content policy](/content-policy) explains the process in full.",
    ],
  },
  {
    heading: "Official announcements",
    body: ["Posts from verified college staff and official accounts are clearly marked as announcements and are separate from member-generated posts."],
  },
];

// What the Academy adds to the privacy policy. Kept here (not in the versioned policy text) because it describes a feature and is
// updated with it.
const ACADEMY_PRIVACY = {
  heading: "UniSphere Academy",
  body: ["The Academy uses your existing UniSphere account. This is what it adds to what is described above."],
  list: [
    "Your enrolments, lesson progress, quiz results, submissions (links, notes and files) and the grades and comments you receive: to run the course and give you feedback. Mentors see this only for the courses they teach.",
    "Your orders and payment references (amount, date, the payment provider's reference; the same payment provider described above, which takes payment for paid courses as well as the blue tick): to take payment, give refunds and keep the financial records the law requires. We do not receive your card, UPI or bank details. Order records are kept as long as financial and tax rules require, without your name once you delete your account.",
    "Your name as you want it on a certificate, and your agreement to show it on the public verification page. Anyone who enters a certificate ID or scans its QR code sees your name, the course, the dates and the issuing organisation, and your score and project link only if you switch them on in Settings, Academy. Never your email or phone number. If you delete your account, your name on a certificate is withdrawn and the page says so; the certificate stays valid.",
    "Live classes are recorded only after participants are told. A recording is available to that course's students for a limited time and is then deleted.",
    "Live classes on Google Meet: for a class that uses it, the email address of each student enrolled in that course is sent to Google (Calendar) so Google can email the invitation and create the video call. Students cannot see each other's addresses. Students on the list join the call directly; anyone else has to ask to be let in. Google handles that data under its own terms and privacy policy. Payment receipts and Academy notification emails are sent from UniSphere Academy.",
    "Offers that apply automatically (a scheduled price, or a welcome offer you qualify for) are worked out on our servers from your order history and the offer's own rules, for example \"first purchase only\". The countdown and the number of places left are the real ones.",
    "Academy notifications (enrolment and payment receipts, refund updates, class and deadline reminders, mentor feedback, completion, certificates, announcements) have their own switches in Settings, Notifications. Lock-screen text never contains your feedback or answers.",
  ],
};

// Sign in with Google is optional and added with the Academy release. Described here, next to the feature, like the Academy part above.
const GOOGLE_PRIVACY = {
  heading: "Sign in with Google",
  body: [
    "You can create an account or sign in with your Google account instead of an email and password. If you do, Google tells UniSphere (through our sign-in provider) your name, email address and profile picture, and that the email address is verified. UniSphere never receives your Google password, contacts, mail or files, and asks Google for nothing else. You can still add or change a password and use your email whenever you like.",
    "A new account made this way is treated like any other: you are asked to review the privacy choices and agree to the terms before you use the site, and an administrator can switch off new sign-ups, which applies here too.",
  ],
};

/** The Privacy Policy. Its text lives in lib/privacy/policy-text.js so it can be versioned and tested. */
export function getPrivacySections() {
  return [...getPolicySections({
    email: privacyContact.email,
    handler: privacyContact.name,
    entity: privacyContact.entity,
    dpo: privacyContact.dpo?.name ?? null,
    responseTarget: privacyContact.responseTarget,
    maxDays: privacyContact.grievanceMaxDays,
  }), ACADEMY_PRIVACY, GOOGLE_PRIVACY];
}

export const COOKIES_UPDATED = "27 October 2026";

/** What this site stores in your browser. */
export function getCookieSections() {
  const sections = [
    {
      heading: "The short version",
      body: [
        "UniSphere uses first-party cookies and browser storage only for things you would expect: keeping you signed in, remembering how you like the site to look, and keeping text you have not sent yet. It does not use analytics, social-media pixels or tracking cookies.",
      ],
    },
    {
      heading: "What is stored on your device",
      list: [
        "Sign-in session (a cookie whose name starts with sb- and ends with -auth-token): keeps you signed in, including when you reopen the installed app. Strictly necessary. It lasts up to about 400 days or until you log out, and is only sent to UniSphere.",
        "Appearance (browser storage entry unisphere-theme): your light, dark or match-device choice. Stays on your device until you clear site data.",
        "Unsent drafts (entries starting with unisphere:draft:): text you were typing in a post box, so a refresh does not lose it. Never sent anywhere until you post; expires after seven days and is removed when you log out.",
        "Small interface memories (unisphere:install-dismissed, unisphere:first-post-seen, unisphere:first-post-snoozed, unisphere:celebrate): whether you dismissed the \u201cinstall the app\u201d suggestion or the \u201cwrite your first post\u201d prompt, and a one-time celebration after a milestone.",
        "Android app notifications (browser storage entries unisphere:native-push, unisphere:fcm-token and unisphere:native-push-nudge, and, for the rest of a session, unisphere:launch-url-handled): only in the Android app. Whether you turned notifications on, this phone's notification token (kept so signing out can remove it from our server straight away), and how many times the “turn on notifications” pop-up has been shown, so it never nags. Removed when you sign out or switch notifications off, except the pop-up count, which is what stops it coming back.",
        "Invite link memory (a first-party cookie named us_ref, set only if you open someone's invite link while signed out): the invite code on the link and the time you opened it, so the person who invited you can be recorded when you create an account. It cannot be read by page scripts, is only sent to UniSphere, expires after 30 days at most, and is removed when you sign up.",
        "Refer & Earn reminder (browser storage entry unisphere:refprompt-session): remembers for the rest of this browser session that the reminder was already handled, so it is not shown twice. Removed when you close the tab.",
        "Sign in with Google (a short-lived cookie set by our sign-in provider while you are on Google's page, and removed when you return): lets only this browser complete the sign-in you started. Used only if you choose Sign in with Google.",
        "Academy offers (browser storage entries starting with ac-offer-seen:): remembers for the rest of this browser session that the celebration for an offer you qualified for has already played, so it is not repeated. Removed when you close the tab.",
        "Academy administrators only: connecting a Google account sets a sealed, short-lived cookie (ac_g_state, ten minutes, only sent to the connection address) that ties the return from Google to the browser that started it.",
        "Opening animation on the home page (browser storage entry unisphere:intro-seen): remembers for the rest of this browser session that the short loading animation has already played, so it is not repeated. Removed when you close the tab.",
        "Offline files (the app\u2019s service worker cache): icons, fonts and scripts so the site starts quickly. It never stores your posts, messages or other private pages.",
      ],
    },
    {
      heading: "Payment checkout",
      body: [
        "When you pay (for a blue tick or an Academy course), UniSphere sends you to the payment gateway's own page. The gateway is a separate company and may set its own cookies or use device information to process and secure the payment. UniSphere loads no payment code on its own pages, so nothing from a payment company runs on UniSphere.",
      ],
    },
    {
      heading: "Advertising and analytics",
      body: ["No advertising or analytics cookies are set: UniSphere does not currently show advertisements and does not use third-party analytics. That is why there is no cookie banner: there is nothing optional to ask you about. If that changes, this page will say so and tracking will stay off until you agree."],
    },
    {
      heading: "Our hosting and service providers",
      body: [
        "The providers that run UniSphere (hosting, database, file storage, email) may keep ordinary server logs such as IP address and request time for security and reliability. The privacy policy lists them.",
      ],
    },
    {
      heading: "Your choices",
      list: [
        "Log out to remove drafts and end your session on that device.",
        "Use the control at the bottom of this page to clear what UniSphere stores in this browser (your sign-in is not affected).",
        "Clear site data for this site in your browser settings to remove everything listed above, including the sign-in.",
        "Blocking the sign-in cookie means you cannot stay signed in; the public pages work without it.",
      ],
    },
  ];
  return sections;
}

export function getTermsSections() {
  return TERMS;
}

const TERMS = [
  {
    heading: "Agreement",
    body: [
      "By creating an account or using UniSphere you agree to these terms and to the Community Guidelines. How your personal information is used is explained in the [Privacy Policy](/privacy), and the choices about it are separate: agreeing to these terms is not your consent to any use of your personal information. If you do not agree, please do not use the service.",
    ],
  },
  {
    heading: "Eligibility and accounts",
    list: [
      "You must be 18 or older. UniSphere does not currently offer accounts to anyone younger.",
      "You must provide accurate information and keep your login details secure.",
      "You are responsible for activity under your account. Tell us if you suspect unauthorised access.",
    ],
  },
  {
    heading: "Your content",
    body: [
      "You keep ownership of what you post. You give UniSphere a limited licence to host, display and distribute it as needed to operate the service, according to the visibility you choose. You are responsible for having the right to share it.",
    ],
  },
  {
    heading: "Acceptable use",
    body: ["You agree not to break the law, violate the Community Guidelines, interfere with the service, scrape private data, or attempt to bypass security or rate limits."],
  },
  {
    heading: "Moderation",
    body: ["We and your college's moderators may remove content, restrict features or suspend accounts that break these terms. Where possible we will explain why and let you appeal."],
  },
  {
    heading: "Communities and messaging",
    list: [
      "Anyone can create a community and becomes its owner. Owners, administrators and moderators are members who run their community; they are not employees or representatives of UniSphere, and UniSphere is not responsible for what they decide, though you can appeal and report to us.",
      "Within a community, its owner and administrators decide who may read and post in each channel, and its moderators can remove messages, time members out, remove or ban them, and read reports about members who rank below them. They must give a reason for what they do to you, and you can appeal for 30 days.",
      "What you post in a channel is visible to everyone who can read that channel for as long as it exists. People may copy it, so post only what you are happy for them to see. Deleting a message removes it from UniSphere; it cannot recall a copy someone made.",
      "Files you attach must be your own or shared with permission, and only JPEG, PNG, WebP and PDF files are accepted. UniSphere checks that an image is a real image and removes location data from it. It does not scan PDFs for malware unless a scanning service has been connected, so open files from people you do not know with care.",
      "Invitation links give access to a community. Do not share a link for a members-only community with people the owner would not want. Whoever holds a valid link can use it, up to the limit set when it was made.",
      "Notifications about mentions, replies and announcements can be turned down or muted for a community or a channel. Delivery of push notifications depends on your device, browser or the Android app, and is not guaranteed.",
      "In Settings, Notifications, you choose for every kind of notification whether it appears in the app, on your phone or browser (push), and by email. Staff of UniSphere or of your college can send an official notice to everyone, to a college, to a community or to named people, for example about an event, a safety matter or a change to the service; those follow the switch for official announcements. A notice about your own account, such as a moderation decision, a privacy request or a personal data breach, is always shown in the app.",
      "UniSphere may act in a community directly, for example by hiding it or removing a message, if it breaks these terms or the law, and does not read private channels as a matter of routine.",
    ],
  },
  {
    heading: "Other policies that apply",
    list: [
      "[Community guidelines](/guidelines): how we expect people to treat each other.",
      "[Content policy](/content-policy): what content is not allowed, how reports are reviewed, and how to appeal.",
      "[Copyright policy](/copyright-policy): how to report copyright infringement.",
      "[Brand policy](/brand-policy): how the UniSphere name and logo may be used.",
      "[Privacy policy](/privacy) and [cookies and browser storage](/cookies).",
    ],
  },
  {
    heading: "AI-generated suggestions",
    body: ["AI features can be wrong or incomplete. They are provided as assistance only; you are responsible for what you choose to publish or act upon."],
  },
  {
    heading: "Pricing and payments",
    body: [
      "UniSphere is free to use. The one paid item is the optional blue tick, a one-time payment processed by a payment gateway and confirmed by an administrator against an identity document. Its price is shown on the [pricing](/pricing) page before you pay, and the [refund and cancellation policy](/refund-policy) says when you are refunded. A blue tick can be removed if an account breaks these terms or the document turns out not to be genuine.",
    ],
  },
  {
    heading: "Refer & Earn and Orbits",
    list: [
      "Orbits are recognition for taking part. They have no cash value, cannot be bought, sold, transferred or exchanged, and UniSphere may correct them if they were awarded by mistake.",
      "You earn 100 Orbits once for each person who joins UniSphere through your invite link and then becomes an active member, as the Refer & Earn page explains (the person confirms their email address, finishes setting up their profile and uses UniSphere on the stated number of different days, within the stated time). Opening, sharing or installing from a link earns nothing.",
      "Each account can have only one inviter. You cannot invite yourself, create or use accounts you control to earn rewards, pay or pressure people to sign up, or send invitations as spam. A reward held back for review, or taken back through a compensating Orbits entry after a review, does not count toward the referral leaderboard.",
      "Referral Orbits count toward your Orbit balance and the Orbit leaderboards. They do not count toward badges, streaks or the Daily Challenge.",
      "We may change, pause or end Refer & Earn, or its reminders and announcements, at any time. Rewards already credited to you stay unless they were obtained in breach of these terms.",
    ],
  },
  {
    heading: "UniSphere Academy",
    body: [
      "The Academy is part of UniSphere and uses your UniSphere account. These terms and the [community guidelines](/guidelines) apply to everything you do there, together with the following.",
    ],
    list: [
      "Courses, programs and project internships are made of lessons, quizzes, assignments, mentor feedback and live classes. A project internship is a structured training programme run by UniSphere Academy. It is training, not employment: you are not an employee, contractor or intern of any company by taking part, and nothing promises a job, a placement or recognition by an employer.",
      "Prices are set by the Academy and worked out on our servers when you check out. You see the total, with any sale, coupon and tax, before you confirm. Your enrolment starts only after the payment provider confirms the payment to us. Refunds follow the [refund and cancellation policy](/refund-policy).",
      "Enrolment gives you access to that course for the period stated on its page. Access can end or be suspended, for example after a refund or a breach of these terms. Course content is for your own learning: do not copy, resell or share lessons, resources, recordings or meeting links.",
      "A certificate is issued only when you meet the requirements on the course page. It has a unique ID and a QR code that opens a public page showing whether it is valid or revoked, with your name, the course, the dates and the issuing organisation, and your score and project link only if you switch them on. By enrolling you agree to your name and the course appearing there if a certificate is issued to you. A certificate can be revoked, for example if work was not your own or it was issued in error; the page then says so. Certificates are not degrees, diplomas or accredited qualifications.",
      "Assignments must be your own work. Copying, hiring someone else or submitting work you have no right to share can lead to a failed grade, loss of access and revocation of a certificate.",
      "A live class is recorded only if participants were told beforehand. Recordings are available only to that course's students, for a limited time.",
      "Live classes may be held on Google Meet. If so, Google emails an invitation to the address on your UniSphere account when you are enrolled, and you can join directly from it. Do not forward the invitation or share the meeting link: people you did not enrol are asked to wait and may be refused. Google Meet's own limits (for example the length of a free group call) apply.",
      "Some prices and offers apply automatically, for example a limited-time price or a welcome offer for a first purchase. They apply only while their stated conditions are met (dates, number of places, who qualifies), are shown with the real end time and places left, and cannot be combined unless the checkout shows both. Only one coupon code can be used on an order.",
    ],
  },
  {
    heading: "Availability and liability",
    body: [
      "We work to keep UniSphere available but do not guarantee uninterrupted service. To the extent permitted by law, UniSphere is provided “as is” and is not liable for indirect or consequential losses.",
    ],
  },
  {
    heading: "Changes",
    body: ["We may update these terms. If changes are significant we will notify you in the app or by email. Continuing to use UniSphere means you accept the updated terms."],
  },
  {
    heading: "Contact",
    body: [`Questions about these terms? Use the [contact form](/contact) or email ${MAIL}.`],
  },
];

export { TERMS };


// ── Content policy ────────────────────────────────────────────────────────────────────────────────────────────

export function getContentPolicySections() {
  return [
    {
      heading: "What this policy covers",
      body: [
        "This policy sets out which content is not allowed on UniSphere, how it is reported and reviewed, what can happen to content and accounts, and how a decision can be appealed. It applies to everything members can create or upload: posts, comments, projects, events, opportunities, profiles, messages, files, communities and college listings. It works together with the [community guidelines](/guidelines) and the [terms of service](/terms).",
      ],
    },
    {
      heading: "Content that is not allowed",
      list: [
        "Spam, scams, deceptive offers, or repeated unsolicited promotion.",
        "Harassment, bullying, threats, or encouraging violence.",
        "Hate speech or discrimination against people because of who they are.",
        "Sexual content. Any sexual content involving minors is removed at once and may be reported to the authorities.",
        "Content that promotes or encourages self-harm.",
        "Impersonation of a person, a club, a college office or UniSphere itself.",
        "Sharing someone's private information without their consent, including contact details, photos and student records.",
        "Misleading content presented as fact, where it could cause harm.",
        "Cheating services, exam material, or content that breaks academic integrity rules.",
        "Content that infringes someone's copyright or other rights (see the [copyright policy](/copyright-policy)).",
        "Malware, attempts to access other people's accounts, or abuse of the platform's systems.",
        "Anything that is illegal where it is posted or viewed.",
      ],
    },
    {
      heading: "Context we take into account",
      body: [
        "Official announcements from college staff and club accounts are labelled as announcements. Colleges added to the directory by members are labelled as community-added and are not verified affiliations. Text written with AI assistance is the responsibility of the member who publishes it. A reviewer looks at context, intent and impact, not only at keywords.",
      ],
    },
    {
      heading: "How to report something",
      list: [
        "Signed in: use the Report option on a post, comment, profile, message, channel message, community or college listing and choose the category that fits best. In a community channel the report goes to that community's moderators.",
        `Not signed in, or reporting on behalf of someone else: use the [contact form](/contact?topic=report-content) and choose \u201cReport content\u201d, or email ${MAIL}. Include a link to the content and what is wrong with it.`,
        "Copyright: follow the [copyright policy](/copyright-policy) instead, which asks for more information.",
        "If someone is in immediate danger, contact your local emergency services first. UniSphere is not an emergency service.",
      ],
    },
    {
      heading: "How reports are reviewed",
      body: [
        `Reports go to moderators for the relevant college or to the UniSphere team, who can see the report, the content and its context, and record their decision with notes. A report about a channel message goes first to the moderators of that community (those who rank above the person reported); they can pass it to the UniSphere team, and a report about a community's owner goes straight to the UniSphere team. Software may suggest a category or priority to help sort reports; it never makes the decision. A reviewer may ask for more information, take no action, or act. We aim to look at every report within ${RESPONSE_TARGET}; reports of immediate danger or sexual content involving minors are looked at first.`,
      ],
    },
    {
      heading: "What can happen",
      list: [
        "A warning to the member.",
        "Removal of the content. The post or comment shows that it was removed by a moderator, and its author is told the reason.",
        "A temporary restriction on some features, such as posting or messaging.",
        "Inside a community: a warning, a timeout (the member can read but not post), removal of a message, removal from the community or a ban, decided by that community's moderators or administrators, each with a reason the member can see.",
        "Suspension of the account, for serious or repeated breaches.",
        "Reinstatement, if a decision is reversed.",
      ],
    },
    {
      heading: "Appeals",
      body: [
        "If a decision affects your account or your content, you will be told what was decided and why. You can appeal from Settings, in your account standing, while the appeal window shown there is open. For a decision inside a community (a timeout, removal, ban or removed message) you can appeal for 30 days from that community's page; a different administrator reviews it, and an appeal about the owner's own decision goes to the UniSphere team. Appeals are reviewed by staff with the permission to do so. We do not promise a particular outcome or a fixed response time.",
      ],
    },
    {
      heading: "Records and fairness",
      body: [
        "Moderation actions are recorded in an audit log so that decisions can be reviewed. Rules are applied the same way whoever the member is, including administrators and moderators.",
      ],
    },
    {
      heading: "Changes",
      body: ["We may update this policy as the platform changes. The date at the top shows when it was last revised."],
    },
  ];
}

// ── Copyright policy ──────────────────────────────────────────────────────────────────────────────────────────

export function getCopyrightSections() {
  return [
    {
      heading: "Your work stays yours",
      body: [
        "Members keep the rights in what they post. By posting, a member lets UniSphere host and display it as needed to run the service, according to the visibility they chose (see the [terms of service](/terms)). Members must only post work they made or have permission to share.",
      ],
    },
    {
      heading: "Reporting a copyright concern",
      body: [
        `If you are the rights holder, or you act for the rights holder, and you believe content on UniSphere infringes the copyright in your work, send a complaint through the [contact form](/contact?topic=copyright) and choose \u201cCopyright complaint\u201d, or email ${MAIL}. Copyright complaints are handled by ${REQUEST_HANDLER}. Please include:`,
      ],
      list: [
        "A description of the work you say has been copied, and where it can be found (a link or a clear description).",
        "A link to the UniSphere content you believe infringes it.",
        "Your name and an email address where we can reach you.",
        "A statement that you believe in good faith that the use is not authorised by the owner, the owner's agent, or the law.",
        "A statement that the information you gave is accurate, and that you are the owner or authorised to act for the owner.",
        "Your typed name as a signature.",
      ],
    },
    {
      heading: "What happens next",
      list: [
        `A reviewer with moderation permissions reads the complaint and looks at the content. We aim to reply within ${RESPONSE_TARGET}.`,
        "While a complaint is reviewed, the content may be hidden or removed.",
        "The member who posted it is told what was reported and why any action was taken, and may respond or appeal from their account. We may share the substance of your complaint, which can include your name, with that member.",
        "If the content is removed, it is replaced by a notice that a moderator removed it.",
        "Accounts that repeatedly post infringing content may be restricted or suspended.",
      ],
    },
    {
      heading: "If your own content was removed",
      body: [
        "You will be notified with the reason. If you believe the complaint is mistaken, for example because you own the work, have permission, or the use is allowed, appeal from Settings while the appeal window is open and explain why. Do not re-post removed content while an appeal is pending.",
      ],
    },
    {
      heading: "Complaints that are not genuine",
      body: [
        "Please only send a complaint you believe is accurate. Knowingly false complaints can have legal consequences for the sender, and we may disregard complaints that are abusive or repeated without basis.",
      ],
    },
    {
      heading: "Limits of this page",
      body: [
        "This describes how UniSphere handles copyright complaints in practice. It is not legal advice and does not promise any legal outcome. Other rights, such as trademarks, privacy or personal rights, are handled through the [content policy](/content-policy).",
      ],
    },
  ];
}

// ── Brand policy ──────────────────────────────────────────────────────────────────────────────────────────────

export function getBrandSections() {
  return [
    {
      heading: "What is covered",
      body: [
        "The name UniSphere, the UniSphere logo and mark, and the look of the product are the property of the UniSphere project. This policy explains how others may refer to them.",
      ],
    },
    {
      heading: "You may",
      list: [
        "Refer to UniSphere by name in plain text, for example to say that your club uses it or to link to it.",
        "Link to UniSphere's public pages.",
        "Use unaltered screenshots of public pages in news, reviews, teaching or commentary, as long as you do not suggest endorsement.",
      ],
    },
    {
      heading: "You may not",
      list: [
        "Suggest that UniSphere sponsors, endorses or is partnered with you, your club or your college without our written agreement.",
        "Present yourself, your account or your service as UniSphere or as an official UniSphere channel.",
        "Alter, recolour, distort or combine the logo with other marks.",
        "Use the name or logo in a company, app, domain, social-media handle or store listing name, or on goods for sale.",
        "Use the name or logo in a way that could mislead people, including in phishing or fake support messages.",
      ],
    },
    {
      heading: "Colleges and other third parties",
      body: [
        "UniSphere is an independent platform. It is not an official service of any college, and it does not represent any college. The names, logos and trademarks of colleges, clubs and other organisations belong to their respective owners and appear on UniSphere only to identify them. Colleges that members add to the directory are labelled community-added until they are reviewed, and listing a college does not mean the college has approved or joined UniSphere.",
        "If you represent an organisation and want a listing corrected or removed, use the [contact form](/contact?topic=general).",
      ],
    },
    {
      heading: "Asking for permission",
      body: [
        `If you want to do something this policy does not allow, ask through the [contact form](/contact?topic=partnerships) or at ${MAIL} before you do it. We do not currently publish a downloadable brand kit.`,
      ],
    },
    {
      heading: "Reporting misuse",
      body: ["If you see the UniSphere name or logo used to mislead people, tell us through the [contact form](/contact?topic=report-content)."],
    },
  ];
}

// ── Accessibility ─────────────────────────────────────────────────────────────────────────────────────────────

export function getAccessibilitySections() {
  return [
    {
      heading: "Our approach",
      body: [
        "UniSphere should be usable by as many people as possible, on phones and computers, with a keyboard, a pointer, touch or assistive technology. We build with accessibility in mind and we fix problems when we find or are told about them.",
      ],
    },
    {
      heading: "What we do",
      list: [
        "Pages use semantic HTML with a logical heading order and landmarks, and a \u201cSkip to content\u201d link at the top of every page.",
        "Everything interactive can be reached and used with a keyboard, and keyboard focus is clearly visible.",
        "Form fields have labels, and error messages are written as text next to the field, not conveyed by colour alone.",
        "Icon-only buttons have accessible names, and decorative graphics are hidden from screen readers.",
        "Text colours are chosen to be readable against their backgrounds, in both the light and dark appearance. You can pick light, dark or match your device in the account menu or the theme control.",
        "Animation is kept short, and movement is switched off when your device asks for reduced motion.",
        "Layouts adapt to small screens and to browser zoom and larger text.",
        "Our automated tests include accessibility scans of key pages.",
      ],
    },
    {
      heading: "Where we fall short",
      list: [
        "We have not had an independent accessibility audit, and we do not claim conformance with WCAG or any other standard.",
        "Automated checks catch only some problems. There will be issues they do not find.",
        "Members write the content. Images that members attach may not have a useful description, and uploaded documents may not be accessible.",
        "Third-party services that appear on some pages are outside our control.",
      ],
    },
    {
      heading: "Tell us about a problem",
      body: [
        `If something is hard or impossible to use, please [tell us through the contact form](/contact?topic=accessibility) and choose \u201cAccessibility\u201d. Describe the page, what you were trying to do, and the device, browser or assistive technology you use if you know it. You can also email ${MAIL}, and members can use the feedback option inside the app. We will look at every report and aim to reply within ${RESPONSE_TARGET}.`,
      ],
    },
  ];
}
