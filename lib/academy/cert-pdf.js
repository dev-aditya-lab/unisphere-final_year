import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument, PDFName, StandardFonts, degrees, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { fillText, missingRequired } from "@/lib/academy/cert-vars";

/**
 * Draws a certificate: the uploaded template PDF with the configured fields placed over it.
 *
 * This is an OVERLAY. The template's own pages are copied into a new document unchanged (apart from dropping page annotations,
 * so link or script actions in an uploaded file are not carried into a certificate), and the text and QR code are drawn on top.
 * The original PDF is never edited, and a field's position is a fraction of the page, measured from its top-left corner.
 *
 * Text uses the 14 standard PDF fonts, which print Latin letters (including accents). A name in another script cannot be printed
 * with them; that is reported as `unsupported_characters` so a person can set a Latin certificate name, never printed as boxes.
 */

export class CertificateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CertificateError";
    this.code = code;
  }
}

const FONT = {
  Helvetica: StandardFonts.Helvetica,
  HelveticaBold: StandardFonts.HelveticaBold,
  HelveticaOblique: StandardFonts.HelveticaOblique,
  TimesRoman: StandardFonts.TimesRoman,
  TimesRomanBold: StandardFonts.TimesRomanBold,
  TimesRomanItalic: StandardFonts.TimesRomanItalic,
  Courier: StandardFonts.Courier,
  CourierBold: StandardFonts.CourierBold,
};

const MAX_TEMPLATE_BYTES = 8 * 1024 * 1024;

const hex = (c) => {
  const m = /^#([0-9a-f]{6})$/i.exec(c ?? "");
  const n = m ? parseInt(m[1], 16) : 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** Pages and first-page size of an uploaded template, or a reason it cannot be used. */
export async function inspectTemplatePdf(bytes) {
  if (!bytes || bytes.length > MAX_TEMPLATE_BYTES) throw new CertificateError("too_large", "The template is too large (8 MB at most).");
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch {
    throw new CertificateError("unreadable", "That PDF could not be read. Encrypted or damaged files are not supported.");
  }
  const count = doc.getPageCount();
  if (count < 1 || count > 20) throw new CertificateError("page_count", "A template needs between 1 and 20 pages.");
  const { width, height } = doc.getPage(0).getSize();
  if (width < 100 || height < 100 || width > 5000 || height > 5000) throw new CertificateError("page_size", "The page size is not usable.");
  return { pageCount: count, width: Math.round(width * 100) / 100, height: Math.round(height * 100) / 100 };
}

/** Wrap `text` into lines no wider than `maxWidth` at `size`. Words longer than a line are cut. */
function wrap(font, text, size, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  const width = (t) => font.widthOfTextAtSize(t, size);
  for (let word of words) {
    while (width(word) > maxWidth && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && width(word.slice(0, cut)) > maxWidth) cut -= 1;
      if (line) { lines.push(line); line = ""; }
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const next = line ? `${line} ${word}` : word;
    if (width(next) <= maxWidth) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest size from `size` down to `min` at which the text fits in `maxLines` lines. At the floor it is shortened with an ellipsis. */
function fit(font, text, size, min, maxWidth, maxLines) {
  for (let s = size; s >= min - 0.001; s -= 0.5) {
    const lines = wrap(font, text, s, maxWidth);
    if (lines.length <= maxLines) return { size: s, lines };
  }
  const lines = wrap(font, text, min, maxWidth).slice(0, maxLines);
  let last = lines[lines.length - 1] ?? "";
  while (last.length > 1 && font.widthOfTextAtSize(`${last}…`, min) > maxWidth) last = last.slice(0, -1);
  lines[lines.length - 1] = `${last}…`;
  return { size: min, lines };
}

/**
 * @param templateBytes  the uploaded PDF
 * @param fields         the template version's field list
 * @param data           variable values (lib/academy/cert-vars.js certificateData)
 * @param verifyUrl      the address the QR code opens
 * @param preview        draws a "SAMPLE" mark across each page, so a test render can never pass for a certificate
 */
export async function renderCertificate({ templateBytes, fields, data, verifyUrl, preview = false }) {
  if (!preview) {
    const missing = missingRequired(data);
    if (missing.length) throw new CertificateError("missing_data", `Missing: ${missing.join(", ")}.`);
  }
  let src;
  try {
    src = await PDFDocument.load(templateBytes, { ignoreEncryption: false, updateMetadata: false });
  } catch {
    throw new CertificateError("unreadable", "The template PDF could not be read.");
  }
  const doc = await PDFDocument.create();
  const copied = await doc.copyPages(src, src.getPageIndices());
  for (const page of copied) {
    page.node.delete(PDFName.of("Annots"));
    doc.addPage(page);
  }
  const pages = doc.getPages();
  const fonts = {};
  const fontFor = async (name) => (fonts[name] ??= await doc.embedFont(FONT[name] ?? StandardFonts.Helvetica));

  for (const f of fields ?? []) {
    const page = pages[f.page];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();
    const x = f.x * pw;
    const top = ph - f.y * ph;
    const boxW = f.w * pw;

    if (f.kind === "qr") {
      const png = await QRCode.toBuffer(verifyUrl, { type: "png", errorCorrectionLevel: "M", margin: 1, width: 600, color: { dark: "#000000", light: "#ffffff" } });
      const img = await doc.embedPng(png);
      page.drawRectangle({ x, y: top - boxW, width: boxW, height: boxW, color: rgb(1, 1, 1) });
      page.drawImage(img, { x, y: top - boxW, width: boxW, height: boxW });
      continue;
    }

    const { text: raw, missing } = fillText(f.text, data);
    if (f.required && missing.length && !preview) throw new CertificateError("missing_data", `A required field has no value for: ${missing.join(", ")}.`);
    const text = f.uppercase ? raw.toUpperCase() : raw;
    if (!text) continue;
    const font = await fontFor(f.font);
    try {
      font.encodeText(text);
    } catch {
      throw new CertificateError("unsupported_characters", "The certificate font cannot print some characters in this text. Ask the student to set a certificate name in Latin letters.");
    }
    const size = Number(f.size) || 16;
    const min = Math.max(6, Number(f.min_size) || Math.floor(size * 0.55));
    const maxLines = f.h ? Math.max(1, Math.floor((f.h * ph) / (size * 1.25))) : f.max_lines ? Number(f.max_lines) : 2;
    const { size: s, lines } = fit(font, text, size, min, boxW, maxLines);
    const lineHeight = s * 1.25;
    const ascent = font.heightAtSize(s, { descender: false });
    const color = hex(f.color);
    lines.forEach((line, i) => {
      const w = font.widthOfTextAtSize(line, s);
      const lx = f.align === "center" ? x + (boxW - w) / 2 : f.align === "right" ? x + boxW - w : x;
      page.drawText(line, { x: lx, y: top - ascent - i * lineHeight, size: s, font, color });
    });
  }

  if (preview) {
    const mark = await fontFor("HelveticaBold");
    for (const page of pages) {
      const { width, height } = page.getSize();
      page.drawText("SAMPLE · NOT A CERTIFICATE", { x: width * 0.12, y: height * 0.18, size: Math.min(width, height) * 0.07, font: mark, color: rgb(0.85, 0.1, 0.1), opacity: 0.35, rotate: degrees(24) });
    }
  }

  doc.setTitle(preview ? "Certificate preview" : `Certificate ${data.certificate_id}`);
  doc.setProducer("UniSphere Academy");
  doc.setCreator("UniSphere Academy");
  doc.setSubject(preview ? "Sample" : cleanMeta(data.course_title));
  const bytes = await doc.save();
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

const cleanMeta = (v) => String(v ?? "").replace(/[^\x20-\x7e]/g, "").slice(0, 120);
