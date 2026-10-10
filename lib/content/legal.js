// Default text for the legal / policy pages. Administrators can replace each one from
// /admin/settings (guidelines_md, privacy_md, terms_md). These defaults are a starting template
// and should be reviewed by the institution (and legal counsel) before launch.

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

export const PRIVACY = [
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
      "Verification information: the college email or supporting details you submit, and any document you upload. Documents are stored privately and visible only to authorised verification reviewers.",
      "Technical information: IP address and device details used for security, abuse prevention and rate limiting.",
    ],
  },
  {
    heading: "What is visible to others",
    body: [
      "Your email address is never shown on your profile. Your profile and posts are visible according to the visibility settings you choose (all members, college, connections or private). UniSphere is a private network: none of it is visible to people who are not verified members, and none of it is indexed by search engines. Your current year and semester are hidden unless you turn on “show my class”.",
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
    heading: "Service providers",
    body: [
      "We use infrastructure providers to run UniSphere: a managed PostgreSQL and authentication service for data and sign-in, Cloudflare R2 for file storage, a transactional email service for emails, a Redis service for caching and rate limiting, and an AI model provider for AI features. They process data only on our behalf.",
    ],
  },
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
    heading: "Contact",
    body: ["Questions about privacy? Use the contact page and choose “Privacy” as the subject."],
  },
];

export const TERMS = [
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
