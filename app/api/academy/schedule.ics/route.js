import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { escapeIcs as esc, foldIcsLine as fold, icsStamp as stamp } from "@/lib/ics";
import { getSchedule } from "@/lib/services/academy";
import { publicEnv } from "@/lib/env-public";

export const dynamic = "force-dynamic";

/**
 * The signed-in student's classes and deadlines as a calendar file they can open in Google Calendar, Apple Calendar or Outlook. It
 * holds only titles, times and a link to the course page on this site: never a meeting link, which is shown to the student only from
 * an hour before the class.
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return new NextResponse("Sign in to download your schedule.", { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const limit = await rateLimit({ key: `acad-ics:${user.id}`, limit: 20, windowSec: 600 });
  if (!limit.ok) return new NextResponse("Too many requests", { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": String(limit.resetSec) } });

  const { sessions, deadlines } = await getSchedule(user.id);
  const now = stamp(new Date().toISOString());
  const events = [
    ...sessions.filter((s) => new Date(s.ends_at) > new Date()).map((s) => ({
      uid: `class-${s.id}@unisphere`, start: s.starts_at, end: s.ends_at,
      summary: `${s.course?.title ?? "Course"}: ${s.title}`, url: `${publicEnv.appUrl}/academy/learn/${s.course_id}`,
    })),
    ...deadlines.map((a) => ({
      uid: `due-${a.id}@unisphere`, start: a.due_at, end: new Date(new Date(a.due_at).getTime() + 30 * 60_000).toISOString(),
      summary: `Due: ${a.title}`, url: `${publicEnv.appUrl}/academy/assignments`,
    })),
  ];
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//UniSphere Academy//Schedule//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:UniSphere Academy"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${now}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`, `SUMMARY:${esc(e.summary)}`, `URL:${e.url}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new NextResponse(lines.map(fold).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="unisphere-academy-schedule.ics"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
