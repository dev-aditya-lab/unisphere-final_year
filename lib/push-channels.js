/**
 * Android notification channels. A channel is what the phone's own settings list ("UniSphere > Notifications > Messages"), so a member
 * can silence one kind without turning the app off. The app creates them (components/native/native-bridge.jsx) and the server names
 * one in every push (lib/push-fcm.js). The three here cover the notification categories (lib/notification-text.js).
 *
 * `importance` is Android's own scale: 3 shows in the shade with a sound, 4 also slides in over the screen.
 */
export const PUSH_CHANNELS = [
  { id: "messages", name: "Messages", description: "New direct messages.", importance: 4 },
  { id: "social", name: "Replies and connections", description: "Reactions, comments, mentions, connection requests, projects, mentoring and communities.", importance: 3 },
  { id: "updates", name: "Events and account", description: "Event reminders, announcements, rewards and account decisions.", importance: 3 },
];

const CHANNEL_BY_CATEGORY = {
  messages: "messages",
  social: "social",
  connections: "social",
  projects: "social",
  mentorship: "social",
  communities: "social",
  events: "updates",
  moderation: "updates",
  announcements: "updates",
  rewards: "updates",
  academy: "updates",
  promotions: "updates",
};

/** The channel for a notification category; anything unknown goes to "updates". */
export const channelForCategory = (category) => CHANNEL_BY_CATEGORY[category] ?? "updates";
