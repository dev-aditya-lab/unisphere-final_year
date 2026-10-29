# Processors, AI and cross-border handling

Verified from the code on 2026-10-21. The public list on `/privacy-notice` is generated from the environment, so it shows only what is switched on. **What each provider keeps, whether it trains on inputs, and where it processes data is not verified by the code**; the "Verify" column is homework for the operator, and the public pages make no claim about it.

| Provider | Sent | Purpose | Personal data? | Minimisation | Verify |
|---|---|---|---|---|---|
| Supabase | Everything stored: account, content, messages, consents, requests | Database, auth, realtime | Yes, all of it | RLS; service key only on the server | Region, backup window, DPA |
| Hosting (Render per `render.yaml`, or Vercel) | Request logs (IP, browser) | Serving the site | Yes (IP) | none beyond logs | Log retention, region (Render is set to Singapore) |
| Cloudflare R2 | Uploaded files | Storage | Yes (photos, attachments, ID docs) | Private bucket, signed short-lived links; ID docs deleted after review | Bucket public-access setting, region |
| Resend | Recipient email, name, email text | Transactional mail | Yes | Notifications never carry request text | Retention of message content, DPA |
| Redis (REDIS_URL) | IP/account-id rate counters, cached settings, cached AI results keyed by a hash | Rate limiting, caching | Pseudonymous | TTLs of seconds to minutes | Region, persistence |
| Groq | Text of an AI request, masked, only with `ai_assist` consent | Writing help, discovery, summaries | Possibly (member's own text) | Masking of emails/phones/IDs; trimmed; no messages, no private/connections-only posts; summaries only of platform- or college-visible content | Data retention and training settings on the account; US processing |
| Backup AI provider (`AI_FALLBACK_*`) | Same as Groq, only on failure | Availability | Same | Same | Same |
| Embeddings provider (NVIDIA, Gemini or OpenAI-compatible) | Public/college posts, projects, profile summary with `ai_discovery_index`; masked search text with `ai_assist` | Related-idea search | Yes | Consent per member; withdrawal deletes vectors | Retention/training; region |
| NVIDIA hosted models (chat) | No member data | Drafting the Daily Challenge | No | n/a | n/a |
| The payment gateway in use (`PAYMENT_GATEWAY`) | Name and email passed when a payment starts; what the member enters on the gateway's own page (UniSphere receives only order/payment reference, amount, status) | Blue tick payment | Yes, at the gateway | The member is sent to the gateway's own page; no gateway code loads on UniSphere and the CSP admits none | The gateway's DPA; their cookies |
| Google (Sign in with Google, via Supabase Auth) | Name, email address and profile picture, only when the member chooses Sign in with Google | Creating the account / signing in | Yes | Optional: email and password work too | Google's terms and privacy policy apply |
| Google (Calendar and Meet; Academy live classes) | The email address of each student enrolled in a live class that uses Google Meet, plus the class title and time | Inviting students to the class and creating the call | Yes | Needed to be invited by email; the course page also shows the link | Google's terms and privacy policy apply; guests cannot see each other |
| Browser push service | Push address and notification text | Notifications the member enables | Pseudonymous | Opt-in in the browser | n/a |
| Google, Firebase Cloud Messaging (`FIREBASE_SERVICE_ACCOUNT`; Android app only) | A token that identifies the app on one phone, and the notification text (never message text) | Notifications the member enables in the app | Pseudonymous | Opt-in in the app (Android also asks for the notification permission); the member can switch it off in the app or the phone's settings | Google's Firebase terms; Google's data processing terms for Firebase apply |

## What the AI code does (`lib/ai`)

- `runAiTask` refuses unless the member has granted `ai_assist` (checked in the database, fails closed). It also applies admin feature flags, rate limits and a daily budget, a request timeout, bounded retries and schema validation.
- Member text is wrapped by `untrusted()`, which masks emails, phone numbers, Aadhaar/PAN/card-like numbers and neutralises prompt-injection tags.
- Summaries load only posts already visible platform-wide (and college-wide if `ai_share_college_content` is on); private posts are refused; comments are clipped.
- The usage log stores task, provider, model, status, token counts and latency. Never the prompt or the output. (Cached outputs live in Redis for minutes, keyed by a hash of the full prompt.)
- Embedding jobs re-check the owner's `ai_discovery_index` consent every time and delete the vector if consent is absent.
- UniSphere does not train or fine-tune any model on member content.

Not done: redaction cannot find names or free-form details; that is why consent is the control. Provider-side retention cannot be changed from here.

## Cross-border

Groq, NVIDIA and many embedding/mail providers are outside India; Render's region is Singapore. Rule 15 allows transfers subject to requirements the Government may set by order. None were found as of this review; re-check before launch.
