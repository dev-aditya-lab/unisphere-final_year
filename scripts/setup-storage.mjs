// Ensures the R2 bucket(s) the app uses exist and applies CORS (needed for browser uploads).
// The public bucket (optional) additionally gets a public-read policy.
// This changes bucket configuration in your Cloudflare account, so it is only run on request:
//   npm run setup:storage
import { config } from "dotenv";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";

// Same precedence as `next dev`: development overrides first, then .env.local, then .env.
config({ path: ".env.development.local", quiet: true });
config({ path: ".env.local", quiet: true });
config({ quiet: true });

const env = process.env;
const endpoint = env.CLOUDFLARE_R2_ENDPOINT || (env.CLOUDFLARE_ACCOUNT_ID ? `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
if (!endpoint || !env.CLOUDFLARE_R2_ACCESS_KEY_ID || !env.CLOUDFLARE_R2_SECRET_ACCESS_KEY) {
  console.error("R2 is not configured. Set CLOUDFLARE_* variables (see .env.example).");
  process.exit(1);
}

const s3 = new S3Client({
  region: env.CLOUDFLARE_R2_REGION || "auto",
  endpoint,
  forcePathStyle: env.CLOUDFLARE_R2_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID, secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const appOrigin = (env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const privateBucket = env.CLOUDFLARE_R2_BUCKET_NAME || "unisphere-private";
const publicBucket = env.CLOUDFLARE_R2_PUBLIC_BUCKET_NAME || null; // optional

async function ensureBucket(name) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: name }));
    console.log(`✓ bucket exists: ${name}`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: name }));
    console.log(`✓ bucket created: ${name}`);
  }
}

async function tryStep(label, fn) {
  try {
    await fn();
    console.log(`✓ ${label}`);
  } catch (err) {
    console.warn(`! ${label} — skipped (${err.name || err.message}). On Cloudflare R2 do this in the dashboard.`);
  }
}

await ensureBucket(privateBucket);
if (publicBucket) await ensureBucket(publicBucket);

if (publicBucket) await tryStep(`public read policy on ${publicBucket}`, () =>
  s3.send(
    new PutBucketPolicyCommand({
      Bucket: publicBucket,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          { Effect: "Allow", Principal: "*", Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${publicBucket}/*`] },
        ],
      }),
    }),
  ),
);

for (const bucket of [privateBucket, publicBucket].filter(Boolean)) {
  await tryStep(`CORS on ${bucket} (browser uploads from ${appOrigin})`, () =>
    s3.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [appOrigin],
              AllowedMethods: ["PUT", "GET", "HEAD"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    ),
  );
}

console.log("Storage setup finished.");
