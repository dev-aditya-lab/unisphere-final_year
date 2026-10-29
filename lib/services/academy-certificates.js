import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok } from "@/lib/actions/result";
import { verifyUrl } from "@/lib/academy/urls";
import { getIntegrations } from "@/lib/env";
import { getObjectBytes, putObject } from "@/lib/storage/r2";
import { CertificateError, inspectTemplatePdf, renderCertificate } from "@/lib/academy/cert-pdf";
import { certificateData, sampleData } from "@/lib/academy/cert-vars";
import { academyRpc, rpcFailure } from "@/lib/services/academy";
import { hasPermission } from "@/lib/auth/session";

/**
 * Making a certificate takes two database steps with the PDF between them:
 *   academy_begin_certificate  (as the staff member: checks eligibility, takes the snapshot, reserves the public ID)
 *   -> draw the PDF over the template and store it privately
 *   academy_finish_certificate (service role: the certificate becomes real, the student is told)
 * If drawing fails, the certificate stays "failed" with its ID, can be retried, and is visible to staff as a failed attempt.
 */

const BEGIN_ERRORS = {
  not_found: "That enrolment no longer exists.",
  enrollment_not_active: "This student's access has ended, so a certificate cannot be issued.",
  approval_required: "This course needs a person to approve the certificate first.",
  consent_required: "The student has not yet agreed to the public verification terms. Ask them to confirm on their Certificates page.",
  no_template: "No active certificate template is set for this course. Activate a template and assign it, or set a default.",
  cannot_replace: "That certificate cannot be replaced.",
};
const MISSING = { lessons: "the lessons", assignments: "the required assignments", score: "the minimum score", no_lessons: "any lessons" };

export const verifyUrlFor = verifyUrl;
export const certificateKey = (id) => `academy/certificates/${id}.pdf`;

async function loadTemplateBytes(version) {
  const admin = createAdminClient();
  const { data: file } = await admin.from("files").select("bucket, storage_key, status").eq("id", version.file_id).maybeSingle();
  if (!file || file.status !== "ready") throw new CertificateError("template_missing", "The template file is not available.");
  return getObjectBytes({ visibility: file.bucket, key: file.storage_key, maxBytes: 9 * 1024 * 1024 });
}

/** Issue (or re-issue as a correction) one certificate. `actorId` is the signed-in staff member. */
export async function issueCertificate({ enrollmentId, actorId, replaces = null, note = null }) {
  if (!getIntegrations().r2) return fail("File storage is not configured, so certificates cannot be stored.", { code: "storage_unconfigured" });
  const supabase = await createClient();
  const { data: begun, error } = await supabase.rpc("academy_begin_certificate", { p_enrollment: enrollmentId, p_replaces: replaces, p_note: note });
  if (error) return rpcFailure(error);
  if (!begun?.ok) {
    const missing = (begun?.missing ?? []).map((m) => MISSING[m] ?? m);
    return fail(begun?.error === "not_eligible" ? `The student has not finished ${missing.join(", ") || "the requirements"} yet.` : (BEGIN_ERRORS[begun?.error] ?? "A certificate cannot be issued right now."), { code: begun?.error });
  }
  if (begun.existing) return ok({ certificateId: begun.certificate_id, id: begun.id, existing: true });

  const admin = createAdminClient();
  try {
    const { data: version } = await admin.from("academy_cert_template_versions").select("id, file_id, fields").eq("id", begun.template_version_id).single();
    const templateBytes = await loadTemplateBytes(version);
    const rendered = await renderCertificate({
      templateBytes, fields: version.fields, data: certificateData(begun.snapshot, begun.certificate_id), verifyUrl: verifyUrlFor(begun.certificate_id),
    });
    await putObject({ visibility: "private", key: certificateKey(begun.id), body: rendered.bytes, contentType: "application/pdf", cacheControl: "private, no-store" });
    const finished = await admin.rpc("academy_finish_certificate", { p_id: begun.id, p_pdf_key: certificateKey(begun.id), p_sha256: rendered.sha256, p_bytes: rendered.bytes.length, p_actor: actorId });
    if (finished.error || finished.data?.ok === false) throw new Error(finished.error?.message ?? finished.data?.error);
    return ok({ certificateId: begun.certificate_id, id: begun.id });
  } catch (err) {
    const known = err instanceof CertificateError;
    await admin.rpc("academy_fail_certificate", { p_id: begun.id, p_error: known ? `${err.code}: ${err.message}` : String(err?.message ?? "error").slice(0, 200), p_actor: actorId });
    if (!known) console.error("[academy] certificate generation failed:", err?.name, String(err?.message ?? "").slice(0, 160));
    return fail(known ? err.message : "The certificate could not be generated. It is saved as failed and can be retried.", { code: known ? err.code : "generation_failed", certificateId: begun.certificate_id });
  }
}

/** Issue every eligible student's certificate in a course (or all), up to `limit` in one go. */
export async function bulkIssue({ courseId = null, actorId, limit = 25 }) {
  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("academy_issuable_enrollments", { p_course: courseId, p_limit: limit });
  if (error) return fail("You do not have permission to do that.", { code: "forbidden" });
  let issued = 0;
  const failures = [];
  for (const r of rows ?? []) {
    const res = await issueCertificate({ enrollmentId: r.enrollment_id, actorId });
    if (res.ok) issued += 1;
    else failures.push({ name: r.full_name, course: r.course_code, error: res.error });
  }
  return ok({ found: rows?.length ?? 0, issued, failures });
}

/** A sample render of a template version with sample data, for the editor. `fields` may be unsaved. Staff with template access only. */
export async function previewTemplate({ versionId, fields }) {
  const supabase = await createClient();
  const { data: version } = await supabase.from("academy_cert_template_versions").select("id, file_id, fields").eq("id", versionId).maybeSingle();
  if (!version) return fail("That template version was not found.", { code: "not_found" });
  try {
    const templateBytes = await loadTemplateBytes(version);
    const data = sampleData();
    const rendered = await renderCertificate({ templateBytes, fields: fields ?? version.fields, data, verifyUrl: verifyUrlFor(data.certificate_id), preview: true });
    return ok({ pdfBase64: Buffer.from(rendered.bytes).toString("base64") });
  } catch (err) {
    if (err instanceof CertificateError) return fail(err.message, { code: err.code });
    console.error("[academy] template preview failed:", err?.name, String(err?.message ?? "").slice(0, 160));
    return fail("The preview could not be drawn.", { code: "preview_failed" });
  }
}

/** Read the uploaded PDF's page count and size and register it as a new draft version of the template. */
export async function createTemplateVersion({ templateId, fileId, notes }) {
  if (!getIntegrations().r2) return fail("File storage is not configured.", { code: "storage_unconfigured" });
  const supabase = await createClient();
  const { data: file } = await supabase.from("files").select("id, bucket, storage_key, mime_type, status, purpose").eq("id", fileId).maybeSingle();
  if (!file || file.purpose !== "academy_template" || file.status !== "ready") return fail("That file could not be used. Upload the PDF again.", { code: "invalid_file" });
  let info;
  try {
    const bytes = await getObjectBytes({ visibility: file.bucket, key: file.storage_key, maxBytes: 9 * 1024 * 1024 });
    info = await inspectTemplatePdf(bytes);
  } catch (err) {
    return fail(err instanceof CertificateError ? err.message : "The PDF could not be read.", { code: err.code ?? "unreadable" });
  }
  return academyRpc("academy_new_template_version", { p_template: templateId, p_file: fileId, p_pages: info.pageCount, p_width: info.width, p_height: info.height, p_notes: notes ?? null });
}

/** The bytes of the PDF behind a template version, for the editor. The version is read through the caller's session, so permission is the database's. */
export async function getTemplatePdf(versionId) {
  const supabase = await createClient();
  const { data: version } = await supabase.from("academy_cert_template_versions").select("id, file_id").eq("id", versionId).maybeSingle();
  if (!version) return null;
  return loadTemplateBytes(version);
}

/** The stored PDF of an issued certificate the caller may see (the holder, or certificate staff). */
export async function getCertificatePdf(certificateRowId) {
  const supabase = await createClient();
  const { data: cert } = await supabase.from("academy_certificates").select("id, certificate_id, status, pdf_key").eq("id", certificateRowId).maybeSingle();
  if (!cert || !cert.pdf_key || !["issued", "revoked"].includes(cert.status)) return null;
  // A holder can download only a certificate that is still valid; certificate staff can open a revoked one to review it.
  if (cert.status === "revoked" && !(await hasPermission("academy.certificates.issue")) && !(await hasPermission("academy.certificates.revoke"))) return null;
  const bytes = await getObjectBytes({ visibility: "private", key: cert.pdf_key });
  return { bytes, certificateId: cert.certificate_id };
}
