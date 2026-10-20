import { NextResponse } from "next/server";
import { getEventBySlug } from "@/lib/services/campus";
import { isValidSlug } from "@/lib/slug";
import { publicEnv } from "@/lib/env-public";

export const dynamic = "force-dynamic";

const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const fold = (line) => line.match(/.{1,73}/g)?.join("\r\n ") ?? line;

/** iCalendar export for events the caller is allowed to see (visibility enforced by RLS). */
export async function GET(_request, { params }) {
  const { eventSlug } = await params;
  if (!isValidSlug(eventSlug)) return new NextResponse("Not found", { status: 404 });
  const e = await getEventBySlug(eventSlug);
  if (!e) return new NextResponse("Not found", { status: 404 });
  const end = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 3600_000).toISOString();
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//UniSphere//Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${e.id}@unisphere`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(e.starts_at)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(`${e.description ?? ""}\n\n${publicEnv.appUrl}/events/${e.slug}`.trim())}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []), `URL:${publicEnv.appUrl}/events/${e.slug}`,
    `STATUS:${e.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT", "END:VCALENDAR",
  ].map(fold);
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${e.slug}.ics"` },
  });
}
