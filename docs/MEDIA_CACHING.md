# Media storage, caching and what Cloudflare still needs

How UniSphere stores and serves files from Cloudflare R2, what was changed to cut repeated storage reads, and the parts that
only you can do in the Cloudflare dashboard. Statements are marked **measured** (observed while building this) or
**by design** (follows from the code, not yet observed in production).

## 1. What was audited

Code read end to end: `lib/storage/{r2,uploads,policy,client}.js`, `lib/media.js`, `app/api/{upload,media,files}`,
`lib/actions/profile.js` (image replacement), `lib/services/{maintenance,account-deletion}.js`, `components/{user-avatar,
profile/image-upload,posts/post-media,posts/composer,messages/message-row,messages/composer,orbits/reward-icon}.jsx`,
`app/(member)/(content)/u/[username]/page.js`, `lib/orbits/card-canvas.js`, `next.config.mjs`, `lib/security/csp.js`,
`scripts/setup-storage.mjs`, and the `files` table, its policies and `orphan_files()` in `supabase/migrations`.

### Finding that needs action first: the media domain exposes the private bucket

Checked on 2026-10-21 with the app's own R2 credentials (a bucket list and one `HEAD` per prefix, no file contents read): the
account has **one** UniSphere bucket, `unisphere` (it is `CLOUDFLARE_R2_BUCKET_NAME`, the "private" bucket), and there is **no**
public bucket. `https://unimedia.unispheres.in/<key>` answered `200` without any login for an object under `avatar/`, `cover/`,
`orbit_badge/`, **`post_attachment/` and `message_attachment/`**. So `unimedia.unispheres.in` is bound to the bucket that holds
private attachments. The keys contain two random UUIDs, so they cannot be guessed, but anyone who obtains one URL can open the
file with no authorization, which the application's own rules do not allow. The app itself never gives members that URL (it
uses `/api/files`), so this is a configuration problem, not a code bug. Also, `cf-cache-status` was `DYNAMIC` on those `HEAD`
requests, so do not assume the Cache Rule is serving hits; check it with a `GET` (section 6).

Fix (section 5): a WAF block rule on the media host for everything except the public folders, or a second bucket. Until then
the code cannot make those files private. Re-checked later the same day: still `200` for `post_attachment/` and
`message_attachment/`, while `avatar/` and `cover/` returned `cf-cache-status: HIT` on `GET` with `cache-control: max-age=14400`
(your 4-hour browser TTL), so the Cache Rule works.

### Findings

| Topic | What the code does | Verdict |
|---|---|---|
| Public vs private | `lib/storage/policy.js` puts avatar, cover, project_asset, community_image, event_banner, orbit_badge in the **public** bucket; post_attachment, message_attachment, verification_document in the **private** bucket. A unit test pins the three private ones. | Separated **in code**. In the Cloudflare account it is not: see the finding below. |
| Object keys | `purpose/<user id>/<random uuid>.<ext>`. A replacement is a **new** key and the old object is deleted (`setProfileImageAction`). | The bytes at a key never change, so public images can be cached as immutable. |
| Who can read what | `files` RLS: public purposes readable by anyone once `ready`; attachments only where `can_read_attached_file()` allows (post visibility, conversation membership); identity documents only by owner and staff. Private objects are only ever reached through `/api/files/<id>`, which asks the database first. | Correct. `/api/media` refuses every key that is not a public purpose before touching the database. |
| Upload | Server-relayed (`/api/upload`): type decided from magic bytes, size from settings, 20 uploads per 5 minutes per member. No `HEAD`, no listing. | Sound. Gap: no `Cache-Control` was stored with objects. |
| Reads that cost an R2 operation | Render path: none (URLs are built from stored keys). `headObject`, `readHead`, `presignUpload` exist but nothing calls them. **No `ListObjects` anywhere in the app.** | Nothing to remove. |
| Private images | Each `<img>` hit `/api/files/<id>` (function + database + signing) and was redirected to a signed URL **different every time**, so the browser could never reuse a picture it had; every refetch was an R2 read. | Main source of repeated reads. Fixed, see 2.3. |
| Public images, no public bucket | `/api/media` signed a new URL per request and cached the redirect for 5 minutes. | Fixed, see 2.4 (only used when no public bucket is configured, e.g. local development). |
| Avatars | Original stored at 256, 512 or 1024 px (member's choice) shown at 24 to 96 px. | Smaller copies available, see 2.5. |
| Abandoned objects | Unfinished uploads and unattached attachments were cleaned up. Avatars and covers that were uploaded but never attached were not. | Fixed, see 2.7. |
| Image hosts | `next.config.mjs` allowed every `*.r2.dev` and `*.r2.cloudflarestorage.com` host for the image optimiser. Nothing uses the optimiser for remote images. | Narrowed to your own media domain, see 2.6. |
| Used public purposes | The interface only uploads avatar, cover and orbit_badge. project_asset, community_image and event_banner are allowed by policy but have no upload screen yet. | Matches your three-path Cache Rule today. |

## 2. What changed

1. **`lib/storage/cache.js`** (new): the cache policy in one place. Public images: `public, max-age=31536000, immutable`.
   Post and chat images: `private, max-age=300`. Identity documents and PDFs: `private, no-store`.
2. **Uploads store `Cache-Control`** (`lib/storage/r2.js` `putObject`, `lib/storage/uploads.js`). Existing objects do not have it
   until you run the backfill (section 4).
3. **Private files** (`getReadableFile`, `app/api/files/[fileId]/route.js`). Authorization is unchanged and still first. For an
   attachment *image* the signed URL is now signed as of the start of a five-minute window, so everyone asking in that window gets
   the **same** URL; storage tells the browser to keep the picture for five minutes and the redirect is cached for two. Result:
   scrolling or reopening a feed or conversation inside the window reads storage once per picture (by design). Documents and
   identity documents get a fresh two-minute URL with `no-store`, as before. Nothing private is ever `public`, `s-maxage` or
   `immutable`; refusals are `no-store`.
4. **`/api/media`** (public images when no public bucket exists): one signed URL per day per picture, redirect cached an hour,
   validators (`ETag`, `Last-Modified`) passed through when streaming, missing keys cached for a minute.
5. **`lib/media.js`**: `mediaUrl(key, { width })`. Without options the output is byte-for-byte what it was, so stored records keep
   working. It never calls storage. Unsafe keys (host change, query, `..`, backslash, spaces) return `null` so the avatar fallback
   shows. With `NEXT_PUBLIC_MEDIA_RESIZE=cloudflare` (off by default) requested widths are rounded up to 48, 96, 160, 320, 640 or
   1280 and served through Cloudflare Image Transformations; avatars and the profile cover ask for the size they are shown at.
6. **`next.config.mjs`**: remote image hosts are now `localhost` plus the exact host of `NEXT_PUBLIC_MEDIA_URL`.
7. **`lib/storage/client.js`**: an upload that is already running for the same picked file and purpose is shared, not repeated
   (double click, effect re-run, retry before the first answer). Entries are removed when an upload ends, so a deliberate second
   upload always runs.
8. **Migration `20260134000042_orphan_public_images.sql`**: `orphan_files()` also returns avatars and covers older than 24 hours that
   no profile or community uses, plus two partial indexes. Backward compatible (same signature; only more rows can be returned;
   nothing is deleted by the migration). **Apply it to the remote database with the other pending ones.**
9. **`scripts/backfill-media-cache-control.mjs`**: gives existing public objects the header (section 4).

Not done, on purpose: server-made thumbnails for private attachments (would need a second object per file and a way to know it
exists, i.e. a schema change, for no measured need), IndexedDB or localStorage image storage, Redis, a new CDN, hash-based
cross-upload dedupe (needs a column and shares bytes across accounts), changes to chat bubble layout.

## 3. What you must do in Cloudflare (code cannot do this)

I had no dashboard access and changed nothing there.

1. **Keep private files off the media domain. Do this first (section 5).** Today `unimedia.unispheres.in` is bound to the only
   bucket, which also holds private attachments. Add the WAF block rule from section 5 (or use a second bucket) and keep `r2.dev`
   off. A Cache Rule never makes an object private.
2. **Cache Rule `UniSphere Public Media Cache`**: match the whole host instead of three paths, so `project_asset/`,
   `community_image/` and `event_banner/` are covered when those screens ship: `Hostname equals unimedia.unispheres.in`.
   (Today only avatar, cover and orbit_badge exist, so nothing is missing yet.) Keep: Eligible for cache.
3. **Browser TTL.** Currently *Override, 4 hours*. Once the backfill has run, change it to **Respect origin Cache-Control** so
   the one-year immutable header reaches browsers (4 hours keeps working until then, at the cost of a revalidation per picture
   every 4 hours). Edge TTL *1 month* is fine.
4. **Deleted pictures stay cached** at the edge for up to the Edge TTL after the object is removed from R2 (replaced avatar, deleted
   account). If you need one gone sooner, purge it by URL (Caching, Configuration, Purge).
5. **Optional resizing.** Turn on Images, Transformations for the zone, **test** `https://unimedia.unispheres.in/cdn-cgi/image/width=96/<an avatar key>` in a browser (it must show a small image, not a 404), and only then set `NEXT_PUBLIC_MEDIA_RESIZE=cloudflare`. Checked 2026-10-21: it was not enabled (that URL answered 404). Avatars and covers fall back to the stored original if a resized copy fails, but each failed request is still a wasted round trip. Extend the Cache Rule to `/cdn-cgi/image/` paths too. Check
   Cloudflare's current free allowance and pricing for unique transformations first; the width steps are limited to six so one
   picture is at most six variants.
6. **Environment (production).** Set `CLOUDFLARE_R2_PUBLIC_BUCKET_NAME`, `CLOUDFLARE_R2_PUBLIC_URL` and `NEXT_PUBLIC_MEDIA_URL`
   together or not at all. With only the media URL set, public images are stored in the private bucket and the URL cannot find
   them (a warning is logged once per server process).

## 4. Backfill existing objects (one time)

```bash
node scripts/backfill-media-cache-control.mjs            # dry run: counts
node scripts/backfill-media-cache-control.mjs --apply    # copies each object onto itself with the new Cache-Control
```

It reads the object list from the `files` table (no bucket listing), only touches the public bucket, skips objects that already
have the header and can be run again. Keys, bytes and Content-Type do not change, so every stored URL still works.

## 5. One bucket: keep private files unreachable on the media domain

If you keep a single bucket (as today), the app works as long as the public-bucket name is the **same** bucket:
`CLOUDFLARE_R2_PUBLIC_BUCKET_NAME` = `CLOUDFLARE_R2_BUCKET_NAME`, plus `CLOUDFLARE_R2_PUBLIC_URL` and `NEXT_PUBLIC_MEDIA_URL`
(all three, production and `.env.local`). Public images then carry `files.bucket = 'public'`, which resolves to the same
physical bucket, and every existing row and URL keeps working with no copy and no SQL.

What a single bucket cannot do is keep `post_attachment/`, `message_attachment/` and `verification_document/` away from the media
domain by itself: a custom domain exposes the whole bucket. Close that at the edge with a **WAF custom rule** on the zone
(Security, WAF, Custom rules), action **Block**:

```
(http.host eq "unimedia.unispheres.in" and not starts_with(http.request.uri.path, "/avatar/")
  and not starts_with(http.request.uri.path, "/cover/") and not starts_with(http.request.uri.path, "/orbit_badge/")
  and not starts_with(http.request.uri.path, "/project_asset/") and not starts_with(http.request.uri.path, "/community_image/")
  and not starts_with(http.request.uri.path, "/event_banner/"))
```

Also make sure `r2.dev` access is off for the bucket. A block rule answers at Cloudflare, before R2. Verify afterwards that
`curl -sI https://unimedia.unispheres.in/post_attachment/x` is blocked (403), while an avatar still returns 200 (section 6).
Cloudflare's own docs describe the exact expression syntax; check it in the rule editor's preview before saving. The stronger
option (a second bucket) remains available: copy only the public prefixes to it under the same keys, set
`files.bucket = 'public'` (already the case for new uploads), bind the domain to it, and remove the domain from the old bucket.

## 6. Verifying

Public picture (expect `cf-cache-status: HIT` after the second request, `age` growing, `etag` present, `content-type` correct):

```bash
curl -sI https://unimedia.unispheres.in/avatar/<user>/<file>.webp | grep -iE "cache-control|cf-cache-status|age|etag|content-type"
```

Private file (needs a signed-in cookie): `/api/files/<id>` must answer `302` with `cache-control: private, max-age=120`, and
the target must carry `cache-control: private, max-age=300`. Check this on R2 once: it relies on R2 honouring
`response-cache-control` on a signed `GET`; if it does not, the stored `Cache-Control` set at upload (same value) still applies
to new files.

In Cloudflare: R2, Metrics (Class A and B operations, per bucket) and Caching, Analytics (cache hit ratio) before and after
deploying. Compare a few days of each.

### What was measured in this work, and what was not

| | Result |
|---|---|
| Unit tests (cache policy, signed-URL stability and expiry, `Cache-Control` stored on upload, private-file authorization, public route refusals, URL backward compatibility, unsafe keys, upload dedupe) | passed, see section 7 |
| Integration test for `orphan_files()` on the local database | passed |
| Production build and a running server on a local port: `/api/files/<unknown id>` and malformed ids answered `404` with `cache-control: private, no-store`; a private purpose requested through `/api/media` answered `404` | **measured** |
| The media domain serving private-bucket objects: `HEAD` on one object per prefix returned `200` with no login (including `post_attachment/` and `message_attachment/`) | **measured**, see the finding above |
| Cloudflare cache hit ratio, R2 operation counts, page load times, bytes saved | **not measured**: needs production traffic. No percentage is claimed. |
| R2 honouring `response-cache-control` on signed reads | **not measured**: check as above. |

## 7. Tests

`tests/unit/storage-cache.test.js`, `media-url.test.js`, `private-files.test.js`, `media-proxy.test.js`, `upload-dedupe.test.js`,
`tests/integration/orphan-public-images.test.js`. Run `npm run test:unit`; the integration test needs the local database (see
`docs/SETUP.md`) and must not be pointed at the remote project.
