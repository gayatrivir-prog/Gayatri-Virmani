import {
  DENTAL_PROVIDERS,
  generateConfirmationCode,
  matchProvider,
  minutesToTime,
  timeToMinutes,
  type ClinicAppointment,
  type GoogleCalendarSummary,
} from '../shared/clinicData.ts';

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

interface GoogleEventDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  htmlLink?: string;
  created?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  attendees?: Array<{ email?: string; displayName?: string }>;
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

function getTzOffsetString(dateStr: string, timeZone: string): string {
  try {
    const dt = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(dt);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-08:00';
    const match = offsetPart.match(/GMT([+-]\d{2}:\d{2})/);
    if (match) return match[1];
    if (offsetPart === 'GMT') return '+00:00';
  } catch {
    // Fallback below
  }
  return '-08:00';
}

function extractLocalDateAndTime(isoOrDate: GoogleEventDateTime | undefined, timeZone: string): {
  date: string;
  time: string;
} {
  if (!isoOrDate) return { date: '', time: '09:00' };
  if (isoOrDate.dateTime) {
    try {
      const dt = new Date(isoOrDate.dateTime);
      const formatted = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(dt);
      const get = (type: string) => formatted.find((p) => p.type === type)?.value ?? '';
      const hour = get('hour') === '24' ? '00' : get('hour');
      return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        time: `${hour}:${get('minute')}`,
      };
    } catch {
      const [d, tPart] = isoOrDate.dateTime.split('T');
      return { date: d, time: (tPart ?? '09:00').slice(0, 5) };
    }
  }
  return { date: isoOrDate.date ?? '', time: '09:00' };
}

function mapGoogleEventToAppointment(
  event: GoogleCalendarEvent,
  calendarId: string,
  timeZone: string,
): ClinicAppointment | null {
  if (event.status === 'cancelled') return null;

  const priv = event.extendedProperties?.private ?? {};
  const startInfo = extractLocalDateAndTime(event.start, timeZone);
  const endInfo = extractLocalDateAndTime(event.end, timeZone);
  if (!startInfo.date) return null;

  const startMin = timeToMinutes(startInfo.time);
  const endMin = Math.max(startMin + 15, timeToMinutes(endInfo.time));
  const durationMinutes = endMin - startMin;

  // Determine provider from private metadata or fallback to matching summary/location
  let provider = DENTAL_PROVIDERS.find((p) => p.id === priv.providerId);
  if (!provider && priv.providerName) {
    provider = matchProvider(priv.providerName);
  }
  if (!provider && event.location) {
    provider = DENTAL_PROVIDERS.find((p) =>
      event.location!.toLowerCase().includes(p.operatory.toLowerCase()),
    );
  }
  if (!provider) {
    // Spread non-clinic calendar events onto Dr. Kim's conflict lane or mark unassigned
    provider = DENTAL_PROVIDERS[0];
  }

  const summary = event.summary ?? 'Scheduled Event';
  let patientName = priv.patientName ?? '';
  let procedure = priv.procedure ?? '';

  if (!patientName) {
    const dashSplit = summary.split('—');
    if (dashSplit.length >= 2) {
      procedure = procedure || dashSplit[0].replace(/^Dental:\s*/i, '').trim();
      patientName = dashSplit[1].trim();
    } else {
      patientName = summary;
      procedure = procedure || 'Calendar Event (Busy)';
    }
  }

  return {
    id: event.id,
    googleEventId: event.id,
    calendarId,
    confirmationCode: priv.confirmationCode ?? `GC-${event.id.slice(0, 5).toUpperCase()}`,
    patientName,
    patientPhone: priv.patientPhone ?? 'Synced via Google Calendar',
    patientEmail: priv.patientEmail || event.attendees?.[0]?.email,
    isNewPatient: priv.isNewPatient === 'true',
    procedure: procedure || 'Dental Visit',
    procedureId: priv.procedureId,
    providerId: priv.providerId ? provider.id : 'dr-kim',
    providerName: priv.providerName ?? provider.name,
    operatory: priv.operatory ?? event.location ?? provider.operatory,
    date: startInfo.date,
    startTime: startInfo.time,
    endTime: minutesToTime(endMin),
    durationMinutes,
    status: 'confirmed',
    source: priv.source === 'voice-ai' ? 'voice-ai' : 'google-calendar',
    notes: priv.notes ?? event.description,
    htmlLink: event.htmlLink,
    createdAt: event.created ?? new Date().toISOString(),
  };
}

export async function listGoogleCalendars(accessToken: string): Promise<GoogleCalendarSummary[]> {
  const res = await fetch(`${GCAL_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Calendar list failed (${res.status}): ${errText}`);
  }
  const data = (await res.json()) as { items?: GoogleCalendarSummary[] };
  return (data.items ?? []).filter((c) => c.accessRole !== 'freeBusyReader');
}

export async function listGoogleCalendarEvents(params: {
  accessToken: string;
  calendarId: string;
  startDate: string;
  endDate: string;
  timeZone: string;
}): Promise<ClinicAppointment[]> {
  const { accessToken, calendarId, startDate, endDate, timeZone } = params;
  const offset = getTzOffsetString(startDate, timeZone);
  const timeMin = `${startDate}T00:00:00${offset}`;
  const timeMax = `${endDate}T23:59:59${offset}`;

  const qs = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin,
    timeMax,
    maxResults: '250',
  });

  const res = await fetch(
    `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${qs.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Calendar events fetch failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { items?: GoogleCalendarEvent[] };
  const mapped: ClinicAppointment[] = [];
  for (const item of data.items ?? []) {
    const apt = mapGoogleEventToAppointment(item, calendarId, timeZone);
    if (apt) mapped.push(apt);
  }
  return mapped;
}

export async function createGoogleCalendarEvent(params: {
  accessToken: string;
  calendarId: string;
  timeZone: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  procedure: string;
  procedureId?: string;
  providerId: string;
  providerName: string;
  operatory: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  isNewPatient?: boolean;
  notes?: string;
  source: 'voice-ai' | 'manual';
  confirmationCode?: string;
}): Promise<ClinicAppointment> {
  const {
    accessToken,
    calendarId,
    timeZone,
    patientName,
    patientPhone,
    patientEmail,
    procedure,
    procedureId,
    providerId,
    providerName,
    operatory,
    date,
    startTime,
    durationMinutes,
    isNewPatient = false,
    notes = '',
    source,
  } = params;

  const confirmationCode = params.confirmationCode ?? generateConfirmationCode();
  const startMin = timeToMinutes(startTime);
  const endTime = minutesToTime(startMin + durationMinutes);
  const offset = getTzOffsetString(date, timeZone);

  const eventBody: Record<string, unknown> = {
    summary: `Dental: ${procedure} — ${patientName}`,
    location: `Dant Anand · ${operatory}`,
    description: [
      `Confirmation Code: ${confirmationCode}`,
      `Patient: ${patientName} (${isNewPatient ? 'New Patient' : 'Returning Patient'})`,
      `Phone: ${patientPhone}`,
      patientEmail ? `Email: ${patientEmail}` : null,
      `Provider: ${providerName}`,
      `Procedure: ${procedure} (${durationMinutes} min)`,
      notes ? `Clinical Notes: ${notes}` : null,
      `Scheduled via: ${source === 'voice-ai' ? 'Dant Anand Voice AI Receptionist' : 'Dant Anand Desk'}`,
    ]
      .filter(Boolean)
      .join('\n'),
    start: {
      dateTime: `${date}T${startTime}:00${offset}`,
      timeZone,
    },
    end: {
      dateTime: `${date}T${endTime}:00${offset}`,
      timeZone,
    },
    extendedProperties: {
      private: {
        confirmationCode,
        patientName,
        patientPhone,
        patientEmail: patientEmail ?? '',
        isNewPatient: String(isNewPatient),
        procedure,
        procedureId: procedureId ?? '',
        providerId,
        providerName,
        operatory,
        source,
        notes,
      },
    },
  };

  if (patientEmail && patientEmail.includes('@')) {
    eventBody.attendees = [{ email: patientEmail, displayName: patientName }];
  }

  const res = await fetch(`${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create Google Calendar event (${res.status}): ${errText}`);
  }

  const created = (await res.json()) as GoogleCalendarEvent;
  const mapped = mapGoogleEventToAppointment(created, calendarId, timeZone);
  if (!mapped) {
    throw new Error('Google Calendar created event could not be parsed.');
  }
  return mapped;
}

export async function updateGoogleCalendarEvent(params: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  timeZone: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  providerId?: string;
  providerName?: string;
  operatory?: string;
}): Promise<ClinicAppointment> {
  const {
    accessToken,
    calendarId,
    eventId,
    timeZone,
    date,
    startTime,
    durationMinutes,
    providerId,
    providerName,
    operatory,
  } = params;

  const existingRes = await fetch(
    `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!existingRes.ok) {
    const errText = await existingRes.text();
    throw new Error(`Could not load existing Google Calendar event (${existingRes.status}): ${errText}`);
  }
  const existing = (await existingRes.json()) as GoogleCalendarEvent;

  const startMin = timeToMinutes(startTime);
  const endTime = minutesToTime(startMin + durationMinutes);
  const offset = getTzOffsetString(date, timeZone);

  const priv = { ...(existing.extendedProperties?.private ?? {}) };
  if (providerId) priv.providerId = providerId;
  if (providerName) priv.providerName = providerName;
  if (operatory) priv.operatory = operatory;

  const patchBody: Record<string, unknown> = {
    start: {
      dateTime: `${date}T${startTime}:00${offset}`,
      timeZone,
    },
    end: {
      dateTime: `${date}T${endTime}:00${offset}`,
      timeZone,
    },
    location: operatory ? `Dant Anand · ${operatory}` : existing.location,
    extendedProperties: { private: priv },
  };

  const res = await fetch(
    `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patchBody),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to reschedule Google Calendar event (${res.status}): ${errText}`);
  }

  const updated = (await res.json()) as GoogleCalendarEvent;
  const mapped = mapGoogleEventToAppointment(updated, calendarId, timeZone);
  if (!mapped) {
    throw new Error('Updated Google Calendar event could not be parsed.');
  }
  return mapped;
}

export async function deleteGoogleCalendarEvent(params: {
  accessToken: string;
  calendarId: string;
  eventId: string;
}): Promise<void> {
  const { accessToken, calendarId, eventId } = params;
  const res = await fetch(
    `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const errText = await res.text();
    throw new Error(`Failed to cancel Google Calendar event (${res.status}): ${errText}`);
  }
}
