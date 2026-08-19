import { env } from "@/env";

// ─── Token Cache ─────────────────────────────────────────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getOutlookToken(): Promise<string> {
  const clientId = env.AZURE_AD_CLIENT_ID;
  const clientSecret = env.AZURE_AD_CLIENT_SECRET;
  const tenantId = env.AZURE_AD_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error("Outlook calendar credentials not configured");
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.value;
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Outlook token error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return cachedToken.value;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CalendarEventInput {
  subject: string;
  body?: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  attendeeEmails: string[];
  location?: string;
  reminderMinutes?: number;
  isAllDay?: boolean;
  categories?: string[];
}

interface GraphEvent {
  id: string;
  webLink: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a rich HTML body for the calendar event with audit details.
 */
export function buildEventBody(opts: {
  auditTitle: string;
  description?: string;
  frontRooms?: number;
  backRooms?: number;
  assignees?: Array<{ name: string; role?: string }>;
}): string {
  const lines: string[] = [];
  if (opts.description) {
    lines.push(`<p>${opts.description}</p>`);
  }
  if (opts.frontRooms || opts.backRooms) {
    lines.push(`<p><strong>Rooms:</strong> ${opts.frontRooms ?? 0} Front Room(s) / ${opts.backRooms ?? 0} Back Room(s)</p>`);
  }
  if (opts.assignees && opts.assignees.length > 0) {
    lines.push(`<p><strong>Participants:</strong></p><ul>`);
    for (const a of opts.assignees) {
      lines.push(`<li>${a.name}${a.role ? ` - <em>${a.role}</em>` : ""}</li>`);
    }
    lines.push(`</ul>`);
  }
  lines.push(`<hr/><p><em>This event is managed by the Audits Management Tool.</em></p>`);
  return lines.join("\n");
}

// ─── Create Event ────────────────────────────────────────────────────────────

export async function createCalendarEvent(input: CalendarEventInput): Promise<GraphEvent | null> {
  const organizerEmail = env.OUTLOOK_ORGANIZER_EMAIL;
  if (!organizerEmail) return null;

  try {
    const token = await getOutlookToken();

    const eventPayload: Record<string, unknown> = {
      subject: input.subject,
      body: {
        contentType: "HTML",
        content: input.body ?? "",
      },
      start: {
        dateTime: input.startAt.toISOString(),
        timeZone: input.timezone || "UTC",
      },
      end: {
        dateTime: input.endAt.toISOString(),
        timeZone: input.timezone || "UTC",
      },
      attendees: input.attendeeEmails.map((email) => ({
        emailAddress: { address: email },
        type: "required" as const,
      })),
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      isAllDay: input.isAllDay ?? false,
      isReminderOn: true,
      reminderMinutesBeforeStart: input.reminderMinutes ?? 15,
    };

    if (input.location) {
      eventPayload.location = { displayName: input.location };
    }

    if (input.categories && input.categories.length > 0) {
      eventPayload.categories = input.categories;
    }

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventPayload),
      }
    );

    if (!res.ok) {
      console.error("Failed to create calendar event:", res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as GraphEvent;
    return { id: data.id, webLink: data.webLink };
  } catch (err) {
    console.error("Calendar event creation error:", err);
    return null;
  }
}

// ─── Update Event ────────────────────────────────────────────────────────────

export async function updateCalendarEvent(
  eventId: string,
  input: Partial<CalendarEventInput>
): Promise<boolean> {
  const organizerEmail = env.OUTLOOK_ORGANIZER_EMAIL;
  if (!organizerEmail || !eventId) return false;

  try {
    const token = await getOutlookToken();

    const patch: Record<string, unknown> = {};

    if (input.subject !== undefined) {
      patch.subject = input.subject;
    }

    // If body is provided, fetch the existing event body to preserve the Teams meeting section
    if (input.body !== undefined) {
      const existingRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}/events/${encodeURIComponent(eventId)}?$select=body`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (existingRes.ok) {
        const existingData = (await existingRes.json()) as { body?: { content?: string } };
        const existingBody = existingData.body?.content ?? "";

        // Teams meeting info is typically in a div with class="me-email-text" or
        // contains "Microsoft Teams" / "Join Microsoft Teams Meeting"
        const teamsMarkers = [
          "<!-- Teams meeting -->",
          "Join Microsoft Teams Meeting",
          "teams.microsoft.com",
          "skype.com/l/meetup-join",
        ];
        const teamsIdx = teamsMarkers.reduce((minIdx, marker) => {
          const idx = existingBody.indexOf(marker);
          return idx >= 0 && (minIdx < 0 || idx < minIdx) ? idx : minIdx;
        }, -1);

        if (teamsIdx > 0) {
          // Preserve the Teams meeting block at the end
          const teamsSection = existingBody.slice(teamsIdx);
          patch.body = { contentType: "HTML", content: `${input.body}<br/>${teamsSection}` };
        } else {
          // No Teams section found — safe to replace entirely
          patch.body = { contentType: "HTML", content: input.body };
        }
      }
      // If fetch fails, skip body update to avoid losing Teams link
    }

    if (input.startAt) {
      patch.start = {
        dateTime: input.startAt.toISOString(),
        timeZone: input.timezone || "UTC",
      };
    }
    if (input.endAt) {
      patch.end = {
        dateTime: input.endAt.toISOString(),
        timeZone: input.timezone || "UTC",
      };
    }
    // Always include attendees in the patch to force Graph to send
    // meeting update notifications to all participants (overrides previous version)
    if (input.attendeeEmails) {
      patch.attendees = input.attendeeEmails.map((email) => ({
        emailAddress: { address: email },
        type: "required",
      }));
    }
    // Only update location if explicitly provided (non-empty string)
    // Avoid sending location at all to preserve the Teams meeting link/location
    if (input.location) {
      patch.location = { displayName: input.location };
    }
    if (input.isAllDay !== undefined) {
      patch.isAllDay = input.isAllDay;
    }
    if (input.reminderMinutes !== undefined) {
      patch.reminderMinutesBeforeStart = input.reminderMinutes;
    }

    // DO NOT send isOnlineMeeting or onlineMeetingProvider in PATCH —
    // Graph does not support changing these after creation and sending them
    // can strip the existing Teams meeting link.

    // Ensure attendees receive the update notification
    patch.responseRequested = true;

    console.log("[Outlook] Updating event", eventId, "patch keys:", Object.keys(patch));

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: 'outlook.timezone="UTC"',
        },
        body: JSON.stringify(patch),
      }
    );

    if (!res.ok) {
      console.error("Failed to update calendar event:", res.status, await res.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error("Calendar event update error:", err);
    return false;
  }
}

// ─── Cancel Event ────────────────────────────────────────────────────────────

/**
 * Cancel a calendar event — sends cancellation notices to all attendees.
 * Use this when an audit is marked COMPLETED or cancelled.
 */
export async function cancelCalendarEvent(
  eventId: string,
  comment?: string
): Promise<boolean> {
  const organizerEmail = env.OUTLOOK_ORGANIZER_EMAIL;
  if (!organizerEmail || !eventId) return false;

  try {
    const token = await getOutlookToken();

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}/events/${encodeURIComponent(eventId)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comment: comment || "This audit has been completed/cancelled.",
        }),
      }
    );

    if (!res.ok && res.status !== 404) {
      console.error("Failed to cancel calendar event:", res.status, await res.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error("Calendar event cancel error:", err);
    return false;
  }
}

// ─── Delete Event ────────────────────────────────────────────────────────────

/**
 * Delete a calendar event silently (no cancellation notice sent).
 * Use this only when deleting an audit entirely.
 */
export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  const organizerEmail = env.OUTLOOK_ORGANIZER_EMAIL;
  if (!organizerEmail || !eventId) return false;

  try {
    const token = await getOutlookToken();

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(organizerEmail)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    return res.ok || res.status === 404;
  } catch (err) {
    console.error("Calendar event delete error:", err);
    return false;
  }
}
