// NEXT_PUBLIC_* values must be referenced as literal `process.env.NEXT_PUBLIC_X`
// so the bundler can inline them. Safe to import from client and server code.

export const publicEnv = {
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  // Shows "Continue with Google". Turn on only after the Google provider is enabled in Supabase (docs/GOOGLE.md).
  googleSignin: process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "true",
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
};
