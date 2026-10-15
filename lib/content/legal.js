import { CONTACT_EMAIL, REQUEST_HANDLER, RESPONSE_TARGET } from "@/lib/constants";

const MAIL = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

// Default text for the legal / policy pages. Administrators can replace each one from
// /admin/settings (guidelines_md, privacy_md, terms_md). These defaults are a starting template
// and should be reviewed by the institution (and legal counsel) before launch.
//
// Sections that depend on how the deployment is configured (advertising) are produced by the get*Sections() helpers,
// so a page never claims something that is not true of the running site.

export const LEGAL_UPDATED = "15 October 2026";

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
      "Only post work you made or have the right to share. If you believe something on UniSphere infringes your copyright, follow the steps in the [copyright policy](/copyright-policy).",
    ],
  },
  {
    heading: "Reporting and moderation",
    body: [
      "Posts, comments, profiles, messages and college listings have a report option. Reports are reviewed by moderators from your college or the UniSphere team. AI may help suggest a category or priority, but a person makes every enforcement decision.",
      "Depending on severity, actions can include a warning, removal of content, a temporary restriction or suspension. You will be told the reason, and you can submit an appeal from your account. The [content policy](/content-policy) explains the process in full.",
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
      "UniSphere uses a small number of cookies and browser storage entries to keep you signed in, remember your appearance setting and keep unsent drafts. Apart from the advertising described in this policy, we do not use analytics or tracking cookies. The full list, with what each one does and how long it lasts, is on the cookie and storage page.",
    ],
  },
  {
    heading: "Service providers",
    body: [
      "We use infrastructure providers to run UniSphere: a managed PostgreSQL and authentication service for data and sign-in, Cloudflare R2 for file storage, a transactional email service for emails, a Redis service for caching and rate limiting, an AI model provider for AI features, and Razorpay to process blue tick payments. They process data only on our behalf.",
    ],
  },
  {
    heading: "Blue tick payments and identity documents",
    body: [
      "If you buy the optional blue tick, the payment is taken by Razorpay. UniSphere never receives your card, UPI or bank details. We keep the order and payment reference, the amount, the date and the status, and link them to your account, so we can give you the blue tick, handle refunds and meet accounting and legal obligations.",
      "To confirm who you are, you send an identity document (an Aadhaar card; a masked Aadhaar with the first 8 digits hidden is enough). We store it in private storage that only administrators can open, use it only to compare your name and photo with your profile, and delete it as soon as a decision is made. We do not keep a copy and we do not record your Aadhaar number. The decision, who made it and when are kept in the audit log.",
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
      "Data is protected with access controls enforced in the database, encrypted connections, and least-privilege access for staff. No system is perfectly secure, so please use a strong, unique password. Account information is kept while your account is active. When you delete your account there is a 14-day grace period, after which your profile and personal data are removed. Limited records may be kept where needed for safety, to resolve a dispute or to meet a legal obligation, for example moderation decisions, the audit log of moderator actions, and messages sent to us through the contact form (which we keep for as long as we need them to handle your request, and delete on request unless we must keep them). Our hosting and infrastructure providers keep ordinary server logs under their own retention rules.",
    ],
  },
  {
    heading: "Contact and privacy requests",
    body: [
      `Questions about privacy, or a request to see, correct or delete information we hold about you? Use the [contact form](/contact?topic=privacy) and choose \u201cPrivacy\u201d, or email ${MAIL}. Say which account or email address it concerns so we can find it. If you have an account, correction and deletion are also available directly in Settings.`,
      `Privacy requests are handled by ${REQUEST_HANDLER}. We aim to reply within ${RESPONSE_TARGET}; a complicated request can take longer, and we will say so. We may need to confirm that you are the person the information is about before we act.`,
    ],
  },
];

/** What the page tag of the advertising network does, in plain words. Used by the privacy and cookie pages. */
const NETWORK_ADS = [
  "A few public pages (the home, about, features and frequently asked questions pages) load a tag from the advertising network Monetag, and only for visitors who are not signed in. Depending on how the network is set up for this site, it may show advertisements, open an advertisement in a new window, or ask you to allow notifications from this site.",
  "Monetag and its advertising partners may set cookies or use identifiers, and receive information such as your IP address, browser details and the page you are on. If you allow notifications, advertising notifications can be sent to that browser until you turn them off in your browser’s site settings. Nothing in UniSphere depends on allowing them, and the tag is never loaded for signed-in members or inside the app.",
];

export function getPrivacySections({ adsEnabled = false, networkAds = false } = {}) {
  const advertising = adsEnabled
    ? {
        heading: "Advertising",
        body: [
          "Some public pages of UniSphere (such as the home, about and features pages) show advertisements served by Google AdSense. Advertisements are never shown inside the signed-in app, in messages, on sign-in or registration forms, or in administration screens, and are always labelled \u201cAdvertisement\u201d.",
          "To show and measure advertisements, Google and its advertising partners may set or read cookies and other identifiers on your device and receive information such as your IP address, browser details and the page you are on. Where the law requires your consent, Google\u2019s consent message asks you first and the choice you make is respected; you can change it at any time from \u201cPrivacy and ad choices\u201d in the page footer. You can also manage personalised advertising at adssettings.google.com, and read how Google uses information from sites that use its services at policies.google.com/technologies/partner-sites.",
          ...(networkAds ? NETWORK_ADS : []),
          "We do not send your account information, posts or messages to advertisers.",
        ],
      }
    : networkAds
      ? {
          heading: "Advertising",
          body: [
            "UniSphere does not currently show Google AdSense advertising.",
            ...NETWORK_ADS,
            "We do not send your account information, posts or messages to advertisers. If anything about advertising changes, this policy and the cookie page will be updated before it does.",
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
export function getCookieSections({ adsEnabled = false, networkAds = false } = {}) {
  const sections = [
    {
      heading: "The short version",
      body: [
        "UniSphere uses first-party cookies and browser storage only for things you would expect: keeping you signed in, remembering how you like the site to look, and keeping text you have not sent yet. Apart from the advertising described below, it does not use analytics, social-media pixels or tracking cookies.",
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
            ...(networkAds ? NETWORK_ADS : []),
          ]
        : networkAds
          ? [
              "No Google advertising cookies are set. The advertising network Monetag\u2019s tag, on the pages named below, may set its own cookies or storage and, if you allow it, send notifications.",
              ...NETWORK_ADS,
              "These are not set for signed-in members or inside the app. Blocking third-party cookies or notifications in your browser stops them.",
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
        "Use the control at the bottom of this page to clear what UniSphere stores in this browser (your sign-in is not affected).",
        "Clear site data for this site in your browser settings to remove everything listed above, including the sign-in.",
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
      "UniSphere is free to use. The one paid item is the optional blue tick, a one-time payment processed by Razorpay and confirmed by an administrator against an identity document. Its price is shown on the [pricing](/pricing) page before you pay, and the [refund and cancellation policy](/refund-policy) says when you are refunded. A blue tick can be removed if an account breaks these terms or the document turns out not to be genuine.",
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
        "Signed in: use the Report option on a post, comment, profile, message or college listing and choose the category that fits best.",
        `Not signed in, or reporting on behalf of someone else: use the [contact form](/contact?topic=report-content) and choose \u201cReport content\u201d, or email ${MAIL}. Include a link to the content and what is wrong with it.`,
        "Copyright: follow the [copyright policy](/copyright-policy) instead, which asks for more information.",
        "If someone is in immediate danger, contact your local emergency services first. UniSphere is not an emergency service.",
      ],
    },
    {
      heading: "How reports are reviewed",
      body: [
        `Reports go to moderators for the relevant college or to the UniSphere team, who can see the report, the content and its context, and record their decision with notes. Software may suggest a category or priority to help sort reports; it never makes the decision. A reviewer may ask for more information, take no action, or act. We aim to look at every report within ${RESPONSE_TARGET}; reports of immediate danger or sexual content involving minors are looked at first.`,
      ],
    },
    {
      heading: "What can happen",
      list: [
        "A warning to the member.",
        "Removal of the content. The post or comment shows that it was removed by a moderator, and its author is told the reason.",
        "A temporary restriction on some features, such as posting or messaging.",
        "Suspension of the account, for serious or repeated breaches.",
        "Reinstatement, if a decision is reversed.",
      ],
    },
    {
      heading: "Appeals",
      body: [
        "If a decision affects your account or your content, you will be told what was decided and why. You can appeal from Settings, in your account standing, while the appeal window shown there is open. Appeals are reviewed by staff with the permission to do so. We do not promise a particular outcome or a fixed response time.",
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
        "Third-party services that appear on some pages, such as advertising where it is shown, are outside our control.",
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
