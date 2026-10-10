import { headers } from "next/headers";

/**
 * Renders schema.org JSON-LD. `<` is escaped so content can never close the script tag, and the script carries the
 * request's CSP nonce so the strict Content-Security-Policy allows it.
 */
export async function JsonLd({ data }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
