// Default text for the legal / policy pages. Administrators can replace each one from
// /admin/settings (guidelines_md, privacy_md, terms_md). These defaults are a starting template
// and should be reviewed by the institution (and legal counsel) before launch.
//
// Sections that depend on how the deployment is configured (advertising) are produced by the get*Sections() helpers,
// so a page never claims something that is not true of the running site.

export const LEGAL_UPDATED = "1 October 2026";

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
    heading: "Sharing ideas and projects",
    body: [
      "Give credit where it is due. Similar ideas often appear independently; UniSphere shows related work to start conversations, not to accuse anyone. If you believe your work was copied, report it with evidence so a moderator can review it.",
    ],
  },
  {
    heading: "Copyright and intellectual property",
    body: [
      "Only post work you made or have the right to share. If you believe something on UniSphere infringes your copyright, report it with a link to the content, a description of your work and how to reach you, through the contact page (choose \u201cReport content\u201d). A moderator will review it and may remove the content while the matter is looked into.",
    ],
  },
  {
    heading: "Reporting and moderation",
    body: [
      "Every post, comment, project and profile has a report option. Reports are reviewed by trained moderators from your college or the UniSphere team. AI may help suggest a category or priority, but a human makes every enforcement decision.",
      "Depending on severity, actions can include a warning, removal of content, a temporary restriction or suspension. You will be told the reason, and you can submit an appeal from your account.",
    ],
  },
  {
    heading: "Official announcements",
    body: ["Posts from verified college staff and official accounts are clearly marked as announcements and are separate from member-generated posts."],
  },
];

const ADVERTISING_MARK = { heading: "__advertising__" };
const PRIVACY_BASE = [
  {
    heading: "What this policy covers",
    body: [
      "This policy explains what personal information UniSphere collects, why we collect it, who can see it, and the choices you have. It applies to the UniSphere website and apps.",
    ],
  },
  {
    heading: "Information we collect",
    list: [
      "Account information: your name, email address, username and password (stored as a secure hash, never in plain text).",
      "Profile information you choose to add: college, department, skills, interests, links, photos and bio.",
      "Content you create: posts, comments, projects, messages, event RSVPs and reports.",
      "Optional verification information: if you choose to verify, the student ID you enter (stored only as a one-way hash, never shown) or any supporting details and documents you upload. Documents are stored privately and visible only to authorised reviewers. College names you add to the directory are visible to other members.",
      "Technical information: IP address and device details used for security, abuse prevention and rate limiting.",
    ],
  },
  {
    heading: "What is visible to others",
    body: [
      "Your email address is never shown on your profile. Your profile and posts are visible according to the visibility settings you choose (all members, college, connections or private). UniSphere is open to anyone who signs up, but none of it is visible to people who are not signed in, and none of it is indexed by search engines. The college you choose is shown on your profile if your profile is visible to the viewer; choosing a college does not mean you are verified. Your current year and semester are hidden unless you turn on “show my class”.",
    ],
  },
  {
    heading: "How we use information",
    list: [
      "To operate the service, show you relevant content and people, and keep the community safe.",
      "To send essential emails such as verification codes, security notices and decisions about your account, and optional notifications you have enabled.",
      "To power AI features you choose to use (see below).",
      "To investigate reports and enforce the community guidelines.",
    ],
  },
  {
    heading: "AI features",
    body: [
      "When you use an AI feature (for example idea discovery or the writing assistant), the text you submit for that request and a small amount of related content that all members can see may be sent to an AI model provider to generate a response. We do not send private posts, private messages or verification documents to AI providers. AI output is a suggestion; you review and approve anything before it is published. If AI is unavailable, the rest of UniSphere keeps working.",
    ],
  },
  {
    heading: "Cookies and similar technologies",
    body: [
      "UniSphere uses a small number of cookies and browser storage entries to keep you signed in, remember your appearance setting and keep unsent drafts. We do not use analytics or tracking cookies. The full list, with what each one does and how long it lasts, is on the cookie and storage page.",
    ],
  },
  {
    heading: "Service providers",
    body: [
      "We use infrastructure providers to run UniSphere: a managed PostgreSQL and authentication service for data and sign-in, Cloudflare R2 for file storage, a transactional email service for emails, a Redis service for caching and rate limiting, and an AI model provider for AI features. They process data only on our behalf.",
    ],
  },
  ADVERTISING_MARK,
  {
    heading: "Your choices and rights",
    list: [
      "Edit or remove most information from Settings at any time.",
      "Choose who sees your profile and who can message you; block or report anyone.",
      "Request deletion of your account from Settings → Security. After a 14-day grace period your profile and personal data are removed; limited records may be kept where needed for safety or legal reasons.",
      "Contact us to ask about the information we hold about you.",
    ],
  },
  {
    heading: "Security and retention",
    body: [
      "Data is protected with access controls enforced in the database, encrypted connections, and least-privilege access for staff. No system is perfectly secure, so please use a strong, unique password. We keep information for as long as your account is active and for a limited period afterwards where required.",
    ],
  },
  {
    heading: "Contact and privacy requests",
    body: [
      "Questions about privacy, or a request to see, correct or delete information we hold about you? Use the contact page and choose \u201cPrivacy\u201d as the subject, and say which account or email address it concerns so we can find it. If you have an account, correction and deletion are also available directly in Settings.",
    ],
  },
];

export function getPrivacySections({ adsEnabled = false } = {}) {
  const advertising = adsEnabled
    ? {
        heading: "Advertising",
        body: [
          "Some public pages of UniSphere (such as the home, about and features pages) show advertisements served by Google AdSense. Advertisements are never shown inside the signed-in app, in messages, on sign-in or registration forms, or in administration screens, and are always labelled \u201cAdvertisement\u201d.",
          "To show and measure advertisements, Google and its advertising partners may set or read cookies and other identifiers on your device and receive information such as your IP address, browser details and the page you are on. Where the law requires your consent, Google\u2019s consent message asks you first and the choice you make is respected; you can change it at any time from \u201cPrivacy and ad choices\u201d in the page footer. You can also manage personalised advertising at adssettings.google.com, and read how Google uses information from sites that use its services at policies.google.com/technologies/partner-sites.",
          "We do not send your account information, posts or messages to advertisers.",
        ],
      }
    : {
        heading: "Advertising",
        body: [
          "UniSphere does not currently show advertising and does not share your information with advertisers. If that changes, this policy and the cookie page will be updated before any advertisement appears.",
        ],
      };
  return PRIVACY_BASE.flatMap((s) => (s === ADVERTISING_MARK ? [advertising] : [s]));
}

export const COOKIES_UPDATED = LEGAL_UPDATED;

/** What this site stores in your browser. Advertising entries are listed only when advertising is switched on. */
export function getCookieSections({ adsEnabled = false } = {}) {
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
        "Small interface memories (unisphere:install-dismissed, unisphere:celebrate): whether you dismissed the \u201cinstall the app\u201d suggestion, and a one-time celebration after a milestone.",
        "Offline files (the app\u2019s service worker cache): icons, fonts and scripts so the site starts quickly. It never stores your posts, messages or other private pages.",
      ],
    },
    {
      heading: "Advertising",
      body: adsEnabled
        ? [
            "Some public pages show advertisements from Google AdSense. Google and its partners may set advertising cookies or read identifiers on those pages. In regions where consent is required, Google\u2019s message asks for your choice before they are used, and you can change it any time from \u201cPrivacy and ad choices\u201d in the footer. These cookies are not set in the signed-in app.",
          ]
        : ["No advertising cookies are set: UniSphere does not currently show advertisements."],
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
        "Clear site data for this site in your browser settings to remove everything listed above.",
        "Blocking the sign-in cookie means you cannot stay signed in; the public pages work without it.",
      ],
    },
  ];
  return sections;
}

export function getTermsSections({ adsEnabled = false } = {}) {
  if (!adsEnabled) return TERMS;
  const extra = {
    heading: "Advertising and third-party links",
    body: [
      "Some public pages display advertising served by third parties, always labelled as such. Advertisers are not endorsed by UniSphere, and we are not responsible for the content or practices of third-party sites that you reach through links or advertisements.",
    ],
  };
  const i = TERMS.findIndex((s) => s.heading === "Availability and liability");
  return [...TERMS.slice(0, i), extra, ...TERMS.slice(i)];
}

const TERMS = [
  {
    heading: "Agreement",
    body: [
      "By creating an account or using UniSphere you agree to these terms and to the Community Guidelines and Privacy Policy. If you do not agree, please do not use the service.",
    ],
  },
  {
    heading: "Eligibility and accounts",
    list: [
      "You must provide accurate information and keep your login details secure.",
      "You are responsible for activity under your account. Tell us if you suspect unauthorised access.",
      "A college email address allows you to verify membership; it does not give you administrative privileges.",
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
    heading: "AI-generated suggestions",
    body: ["AI features can be wrong or incomplete. They are provided as assistance only; you are responsible for what you choose to publish or act upon."],
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
];

export { TERMS };
