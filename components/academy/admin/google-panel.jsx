import { Panel, fmtDateTime } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { ActionDialog } from "@/components/admin/action-dialog";
import { disconnectGoogleAction } from "@/lib/actions/academy-admin";
import { googleCredentials, googleRedirectUri } from "@/lib/services/academy-google";

// What the settings page says when it is opened again after the trip to Google. The word comes from our own callback, never from Google.
const NOTE = {
  connected: ["ok", "Google is connected. Live classes can now create a Google Meet and invite students."],
  cancelled: ["warn", "You cancelled at Google. Nothing was connected."],
  denied: ["warn", "Only someone who may change Academy settings can connect Google."],
  invalid: ["warn", "That return from Google could not be checked (it expired or did not start here). Please press Connect again."],
  no_refresh_token: ["warn", "Google did not give lasting access. Open myaccount.google.com/permissions, remove access for this app, then connect again."],
  missing_scope: ["warn", "The calendar permission was not ticked. Connect again and tick it."],
  exchange_failed: ["warn", "Google would not complete the sign-in. Please try again."],
  save_failed: ["warn", "Connected, but saving failed. Please try again."],
  not_configured: ["warn", "Google is not set up on this server yet (see docs/GOOGLE.md)."],
  slow_down: ["warn", "Too many tries. Please wait a few minutes."],
};

/** The Academy's Google account: connect, see who is connected, disconnect. Shows no secret. */
export function GooglePanel({ status, flash }) {
  const configured = Boolean(googleCredentials());
  const note = NOTE[flash];
  return (
    <Panel
      title="Google Calendar and Meet"
      description="Connect one Google account (a free Gmail works). Live classes can then create a Google Meet and email the invitation to every enrolled student; invited students join directly, everyone else has to ask to be let in."
      className="mb-6"
    >
      {note && <p role="status" className={`mb-4 rounded-lg px-3 py-2 text-sm ${note[0] === "ok" ? "bg-success-soft text-[var(--success-text)]" : "bg-muted"}`}>{note[1]}</p>}
      {!configured ? (
        <p className="text-sm">Google is not set up on this server. Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> (see docs/GOOGLE.md), then come back.</p>
      ) : status?.connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm"><strong>Connected as {status.email}</strong><span className="text-muted-foreground"> · since {fmtDateTime(status.connected_at)}</span></p>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm"><a href="/api/academy/google/connect">Reconnect</a></Button>
            <ActionDialog label="Disconnect" destructive askReason={false} title="Disconnect Google?" description="No new Meet links or invitations will be made until it is connected again. Events already on the calendar stay." action={disconnectGoogleAction} args={{}} confirmLabel="Disconnect" />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{status?.status === "needs_reconnect" ? <>Google stopped accepting the connection{status.email ? ` for ${status.email}` : ""}. Please connect again.</> : "Not connected yet."}</p>
          <Button asChild size="sm"><a href="/api/academy/google/connect">Connect Google</a></Button>
        </div>
      )}
      <details className="text-muted-foreground mt-4 text-xs">
        <summary className="cursor-pointer font-semibold">Limits and what Google can see</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Google lets one event have up to 200 guests, and a free Gmail Meet allows up to 100 people, with group calls of three or more limited to 60 minutes. A Google Workspace account removes the time limit.</li>
          <li>Enrolled students&apos; email addresses are sent to Google to invite them. Guests cannot see each other&apos;s addresses. The Privacy Policy says so.</li>
          <li>The Academy asks only for permission to manage calendar events. It cannot read your email, files or contacts.</li>
          <li>Redirect address to allow in the Google Cloud console: <code className="break-all">{googleRedirectUri()}</code></li>
        </ul>
      </details>
    </Panel>
  );
}
