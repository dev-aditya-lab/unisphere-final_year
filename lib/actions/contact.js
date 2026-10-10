"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, getClientIp } from "@/lib/rate-limit";
import { fail, ok, parseInput } from "@/lib/actions/result";
import { emailSchema } from "@/lib/validators/auth";
import { sendEmail } from "@/lib/email";
import { contactReceiptEmail } from "@/lib/email/templates";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: emailSchema,
  subject: z.enum(["General", "Support", "Privacy", "Report a problem", "Partnerships"]),
  message: z.string().trim().min(10, "Please write at least 10 characters").max(4000),
  // Honeypot: real users never see or fill this field.
  website: z.string().max(0).optional(),
});

export async function submitContactAction(input) {
  const { data, failure } = parseInput(contactSchema, input);
  if (failure) {
    // A filled honeypot gets a silent "success" so bots learn nothing.
    if (input?.website) return ok({ message: "Thanks, your message has been sent." });
    return failure;
  }

  const ip = await getClientIp();
  const limited = await enforceRateLimit("contact", ip, { limit: 4, windowSec: 3600 });
  if (limited) return limited;

  const { error } = await createAdminClient().from("contact_messages").insert({
    name: data.name,
    email: data.email,
    subject: data.subject,
    message: data.message,
  });
  if (error) {
    console.error("[contact] insert failed:", error.message);
    return fail("We could not send your message. Please try again in a moment.", { code: "db_error" });
  }

  // Receipt email is best-effort; the message itself is already stored.
  sendEmail({ to: data.email, ...contactReceiptEmail({ name: data.name }) }).catch(() => {});
  return ok({ message: "Thanks, your message has been sent. We will reply by email." });
}
