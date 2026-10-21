// Frequently asked questions: the single source for the /faq page, the short list on the home page and their
// FAQPage structured data. Answers describe what UniSphere actually does today.

export function getFaq({ adsEnabled = false } = {}) {
  return [
    {
      id: "who-can-join",
      q: "Is UniSphere only for students?",
      a: "No. It is open to anyone who wants to join: students, alumni, teachers, makers, anyone. You never have to say what you are. If you like, you can describe yourself as a student, alumnus, teacher or staff member, and it is shown as something you said, not something we checked. Mentoring is opt-in.",
    },
    {
      id: "college-required",
      q: "Do I need to belong to a college?",
      a: "No. You can sign up with any email address and use everything without choosing a college. If you want, you can connect your profile to a college: search for it, or add it by name if nobody has yet. That only says which college you chose; it does not prove you study or work there, and a college listed by members is clearly marked as community-added. You can add more than one: a college you study at now, one you studied at before, or one where you teach or work.",
    },
    {
      id: "ai",
      q: "What does the AI actually do?",
      a: "When you describe an idea, UniSphere searches posts, projects and discussions that exist on the platform and explains why each result is related. It can also suggest ways to sharpen or extend your idea. Suggestions are never published for you, and the basic social features work even when AI is unavailable.",
    },
    {
      id: "copied",
      q: "Will AI tell me my idea was copied?",
      a: "No. Similar content is a prompt to talk to people who are working on related things, not an accusation. The originality check shows what overlaps and what is different, and leaves the decision to you.",
    },
    {
      id: "visibility",
      q: "Who can see my profile and posts?",
      a: "You need to be signed in to see anything: posts, profiles and projects are not public and are not searchable on Google. Inside UniSphere you choose: your profile can be visible to all members, to your college, to your connections only, or just to you, and every post has its own visibility. Your email address is never shown, and your year and semester stay hidden unless you allow them.",
    },
    {
      id: "messages",
      q: "Can people message me without my consent?",
      a: "Only if you allow it. You set who may message you (any member, your college, connections only, or nobody), and anyone you block can never contact you.",
    },
    {
      id: "cost",
      q: "Does it cost anything?",
      a: adsEnabled
        ? "No. UniSphere is free to use. Some public pages, such as the home page, show advertising; there is no advertising inside the signed-in app, in messages or on sign-in forms."
        : "No. UniSphere is free to use and currently shows no advertising.",
    },
    {
      id: "logged-out",
      q: "Can anyone look without joining?",
      a: "No. Anyone can join, but you need an account to see or post anything. The public pages only explain what UniSphere is; the feed, profiles, projects and messages are never visible to visitors or search engines.",
    },
    {
      id: "report",
      q: "How do I report something, or ask for content to be removed?",
      a: "Members can use the Report option on posts, comments, profiles, messages and college listings. If you do not have an account, or you are a rights holder, use the contact form and choose the topic that fits. The content policy and the copyright policy explain what happens next.",
    },
    {
      id: "delete",
      q: "How do I delete my account?",
      a: "From Settings, Security. After a 14-day grace period your profile and personal data are removed; limited records may be kept where needed for safety or legal reasons. The privacy policy has the details.",
    },
  ];
}

/** The questions shown on the home page; the rest are on /faq. */
export const HOME_FAQ_IDS = ["who-can-join", "college-required", "visibility", "cost", "report"];
