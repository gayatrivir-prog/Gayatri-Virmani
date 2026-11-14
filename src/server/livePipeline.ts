import {
  GoogleGenAI,
  Modality,
  Type,
  type FunctionDeclaration,
  type LiveServerMessage,
} from '@google/genai';
import type { WebSocket } from 'ws';
import {
  CLINIC_HOURS,
  computeOpenSlots,
  DENTAL_PROCEDURES,
  DENTAL_PROVIDERS,
  formatTime12h,
  generateConfirmationCode,
  matchProcedure,
  matchProvider,
  minutesToTime,
  timeToMinutes,
  type ClinicAppointment,
  type PendingCalendarAction,
} from '../shared/clinicData.ts';
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  listGoogleCalendarEvents,
  updateGoogleCalendarEvent,
} from './googleCalendarService.ts';
import {
  createLocalAppointment,
  deleteLocalAppointment,
  listLocalAppointments,
  updateLocalAppointment,
} from './localClinicStore.ts';

interface SessionAuthContext {
  accessToken: string | null;
  calendarId: string;
  calendarName: string;
  timeZone: string;
}

type LiveSession = Awaited<ReturnType<GoogleGenAI['live']['connect']>>;

interface ClientControlMessage {
  type: 'start' | 'audio' | 'text' | 'auth_update' | 'confirm_action' | 'stop';
  data?: string;
  text?: string;
  voiceName?: string;
  accessToken?: string | null;
  calendarId?: string;
  calendarName?: string;
  timeZone?: string;
  actionId?: string;
  approved?: boolean;
}

const CLINIC_TOOLS: FunctionDeclaration[] = [
  {
    name: 'get_clinic_info',
    description:
      'Returns Dant Anand clinic hours, today date/time, list of dentists/providers, and standard dental procedures with durations and pricing.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'check_availability',
    description:
      'Checks open dental appointment time slots for a specific date and procedure, optionally filtered by preferred dentist.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: {
          type: Type.STRING,
          description: 'Target appointment date in YYYY-MM-DD format.',
        },
        procedure: {
          type: Type.STRING,
          description:
            'Requested dental service (e.g., cleaning, exam, emergency toothache, crown, root canal, whitening, aligner check).',
        },
        providerQuery: {
          type: Type.STRING,
          description: 'Optional preferred dentist name or ID (e.g., Dr. Kim, Dr. Alvarez, Dr. Evans).',
        },
      },
      required: ['date', 'procedure'],
    },
  },
  {
    name: 'lookup_appointments',
    description:
      'Searches existing appointments by patient name, phone number, confirmation code, or date.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Patient full/partial name, phone digits, or confirmation code (e.g., CD-4821K).',
        },
        date: {
          type: Type.STRING,
          description: 'Optional specific date in YYYY-MM-DD format.',
        },
      },
    },
  },
  {
    name: 'book_appointment',
    description:
      'Books a new dental clinic appointment and syncs it to the clinic calendar after verifying availability.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        patientName: {
          type: Type.STRING,
          description: 'Full name of the patient.',
        },
        patientPhone: {
          type: Type.STRING,
          description: 'Patient callback phone number.',
        },
        patientEmail: {
          type: Type.STRING,
          description: 'Optional patient email address for calendar invitation.',
        },
        procedure: {
          type: Type.STRING,
          description: 'Dental procedure or reason for visit.',
        },
        date: {
          type: Type.STRING,
          description: 'Appointment date in YYYY-MM-DD format.',
        },
        startTime: {
          type: Type.STRING,
          description: 'Appointment start time in 24-hour HH:mm format (e.g., 10:00, 14:30).',
        },
        providerQuery: {
          type: Type.STRING,
          description: 'Preferred dentist name or ID if specified.',
        },
        isNewPatient: {
          type: Type.BOOLEAN,
          description: 'Whether this is a new patient visiting Dant Anand for the first time.',
        },
        notes: {
          type: Type.STRING,
          description: 'Any symptoms, tooth sensitivity, or patient preferences mentioned.',
        },
      },
      required: ['patientName', 'patientPhone', 'procedure', 'date', 'startTime'],
    },
  },
  {
    name: 'reschedule_appointment',
    description: 'Reschedules an existing appointment to a new date and start time.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appointmentIdOrCode: {
          type: Type.STRING,
          description: 'Confirmation code, Google event ID, or patient name to locate the visit.',
        },
        newDate: {
          type: Type.STRING,
          description: 'New appointment date in YYYY-MM-DD format.',
        },
        newStartTime: {
          type: Type.STRING,
          description: 'New start time in 24-hour HH:mm format.',
        },
        providerQuery: {
          type: Type.STRING,
          description: 'Optional new dentist name if changing provider.',
        },
      },
      required: ['appointmentIdOrCode', 'newDate', 'newStartTime'],
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancels an existing dental appointment.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appointmentIdOrCode: {
          type: Type.STRING,
          description: 'Confirmation code, Google event ID, or patient name.',
        },
        reason: {
          type: Type.STRING,
          description: 'Optional reason for cancellation.',
        },
      },
      required: ['appointmentIdOrCode'],
    },
  },
];

function getTodayIso(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function addDays(baseIso: string, delta: number): string {
  const dt = new Date(`${baseIso}T12:00:00`);
  dt.setDate(dt.getDate() + delta);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildSystemInstruction(authCtx: SessionAuthContext): string {
  const today = getTodayIso(authCtx.timeZone);
  const nowDisplay = new Intl.DateTimeFormat('en-US', {
    timeZone: authCtx.timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());

  const calendarLabel = authCtx.accessToken
    ? `Live Google Calendar (${authCtx.calendarName})`
    : 'Dant Anand Clinic Schedule (Preview Mode)';

  return [
    'You are Maya, the warm, efficient, and clinically knowledgeable front-desk voice coordinator at Dant Anand.',
    `Current date and time: ${nowDisplay} (ISO date: ${today}, Timezone: ${authCtx.timeZone}).`,
    `Active calendar backend: ${calendarLabel}.`,
    `Clinic hours: Monday through Saturday, 8:30 AM to 5:30 PM. Closed Sundays.`,
    'Providers:',
    ...DENTAL_PROVIDERS.map(
      (p) => `- ${p.name}, ${p.credentials} (${p.id}): ${p.specialty}, ${p.operatory}`,
    ),
    'Procedures & Durations:',
    ...DENTAL_PROCEDURES.map(
      (proc) => `- ${proc.name} (${proc.durationMinutes} min, $${proc.feeUsd}, default: ${proc.defaultProviderId})`,
    ),
    'Conversation & Scheduling Rules:',
    '1. Speak naturally, concisely, and warmly—like an experienced dental front-desk coordinator on the phone. Keep spoken turns crisp (1-3 sentences) so the patient never waits.',
    '2. Always call check_availability before promising or booking a slot. If a patient mentions "tomorrow", "Monday", or "next week", resolve the exact YYYY-MM-DD date relative to today.',
    '3. Before calling book_appointment, gather or confirm: patient full name, callback phone number, dental procedure/reason, date, and preferred time. If they have an emergency toothache, prioritize Dr. Rafael Alvarez and earliest same-day triage.',
    '4. When booking, rescheduling, or canceling on a connected Google Calendar, let the patient know you are sending the final confirmation to the clinic desk/calendar and read back the confirmation code, date, time, provider, and suite once confirmed.',
    '5. Never fabricate confirmation codes or claim an appointment is booked unless book_appointment returned booked: true.',
  ].join('\n');
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function attachLiveWebSocket(clientWs: WebSocket): void {
  let session: LiveSession | null = null;
  let isClosing = false;

  const authCtx: SessionAuthContext = {
    accessToken: null,
    calendarId: 'primary',
    calendarName: 'Primary Calendar',
    timeZone: 'America/Los_Angeles',
  };

  const pendingApprovals = new Map<string, (approved: boolean) => void>();

  const sendToClient = (payload: Record<string, unknown>) => {
    if (clientWs.readyState === clientWs.OPEN) {
      clientWs.send(JSON.stringify(payload));
    }
  };

  const fetchAppointmentsForRange = async (startDate: string, endDate: string): Promise<ClinicAppointment[]> => {
    if (authCtx.accessToken) {
      return listGoogleCalendarEvents({
        accessToken: authCtx.accessToken,
        calendarId: authCtx.calendarId,
        startDate,
        endDate,
        timeZone: authCtx.timeZone,
      });
    }
    return listLocalAppointments(startDate, endDate);
  };

  const requestUserConfirmation = (action: PendingCalendarAction): Promise<boolean> => {
    return new Promise((resolve) => {
      pendingApprovals.set(action.actionId, resolve);
      sendToClient({
        type: 'pending_confirmation',
        action,
      });
    });
  };

  const executeToolCall = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const startedAt = Date.now();
    sendToClient({
      type: 'pipeline_event',
      stage: 'tool_start',
      toolName: name,
      args,
      timestamp: new Date().toISOString(),
    });

    let result: Record<string, unknown>;

    try {
      if (name === 'get_clinic_info') {
        const today = getTodayIso(authCtx.timeZone);
        result = {
          today,
          timeZone: authCtx.timeZone,
          hours: 'Monday–Saturday 08:30–17:30',
          calendarConnected: Boolean(authCtx.accessToken),
          calendarName: authCtx.calendarName,
          providers: DENTAL_PROVIDERS.map((p) => ({
            id: p.id,
            name: `${p.name}, ${p.credentials}`,
            specialty: p.specialty,
            operatory: p.operatory,
          })),
          procedures: DENTAL_PROCEDURES.map((pr) => ({
            id: pr.id,
            name: pr.name,
            durationMinutes: pr.durationMinutes,
            feeUsd: pr.feeUsd,
            defaultProviderId: pr.defaultProviderId,
          })),
        };
      } else if (name === 'check_availability') {
        const date = String(args.date || getTodayIso(authCtx.timeZone));
        const proc = matchProcedure(String(args.procedure || 'cleaning'));
        const preferredProvider = args.providerQuery
          ? matchProvider(String(args.providerQuery), proc.defaultProviderId)
          : undefined;

        const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
        if (dayOfWeek === 0) {
          result = {
            date,
            closed: true,
            message: 'Dant Anand is closed on Sundays. Please check Monday through Saturday.',
            openSlots: [],
          };
        } else {
          const existing = await fetchAppointmentsForRange(date, date);
          const openSlots = computeOpenSlots({
            date,
            durationMinutes: proc.durationMinutes,
            providerId: preferredProvider?.id,
            appointments: existing,
          });
          result = {
            date,
            procedure: proc.name,
            durationMinutes: proc.durationMinutes,
            estimatedFeeUsd: proc.feeUsd,
            preferredProvider: preferredProvider?.name ?? 'Any available provider',
            totalOpenSlots: openSlots.length,
            openSlots: openSlots.slice(0, 10).map((s) => ({
              startTime: s.startTime,
              startTime12h: formatTime12h(s.startTime),
              endTime: s.endTime,
              providerId: s.providerId,
              providerName: s.providerName,
              operatory: s.operatory,
            })),
          };
        }
      } else if (name === 'lookup_appointments') {
        const today = getTodayIso(authCtx.timeZone);
        const targetDate = args.date ? String(args.date) : undefined;
        const startDate = targetDate ?? addDays(today, -7);
        const endDate = targetDate ?? addDays(today, 21);
        const list = await fetchAppointmentsForRange(startDate, endDate);
        const query = String(args.query || '').trim().toLowerCase();

        const matches = query
          ? list.filter(
              (a) =>
                a.patientName.toLowerCase().includes(query) ||
                a.confirmationCode.toLowerCase() === query ||
                a.patientPhone.replace(/\D/g, '').includes(query.replace(/\D/g, '')) ||
                a.id.toLowerCase() === query,
            )
          : list;

        result = {
          count: matches.length,
          appointments: matches.slice(0, 10).map((a) => ({
            id: a.id,
            confirmationCode: a.confirmationCode,
            patientName: a.patientName,
            patientPhone: a.patientPhone,
            procedure: a.procedure,
            providerName: a.providerName,
            operatory: a.operatory,
            date: a.date,
            startTime: a.startTime,
            startTime12h: formatTime12h(a.startTime),
            endTime: a.endTime,
            durationMinutes: a.durationMinutes,
          })),
        };
      } else if (name === 'book_appointment') {
        const patientName = String(args.patientName || '').trim();
        const patientPhone = String(args.patientPhone || '').trim();
        const patientEmail = args.patientEmail ? String(args.patientEmail).trim() : undefined;
        const proc = matchProcedure(String(args.procedure || 'cleaning'));
        const provider = matchProvider(
          args.providerQuery ? String(args.providerQuery) : undefined,
          proc.defaultProviderId,
        );
        const date = String(args.date || getTodayIso(authCtx.timeZone));
        const startTime = String(args.startTime || '09:00').slice(0, 5);
        const isNewPatient = Boolean(args.isNewPatient);
        const notes = args.notes ? String(args.notes) : '';

        // Validate clinic hours & conflicts first
        const startMin = timeToMinutes(startTime);
        const endMin = startMin + proc.durationMinutes;
        const openMin = CLINIC_HOURS.openHour * 60 + CLINIC_HOURS.openMinute;
        const closeMin = CLINIC_HOURS.closeHour * 60 + CLINIC_HOURS.closeMinute;

        if (startMin < openMin || endMin > closeMin) {
          const existing = await fetchAppointmentsForRange(date, date);
          const suggestions = computeOpenSlots({
            date,
            durationMinutes: proc.durationMinutes,
            providerId: provider.id,
            appointments: existing,
          }).slice(0, 5);
          result = {
            booked: false,
            error: `Requested time ${startTime} is outside clinic hours (08:30 to 17:30).`,
            suggestedSlots: suggestions,
          };
        } else {
          const existing = await fetchAppointmentsForRange(date, date);
          const conflict = existing.find(
            (a) =>
              a.status !== 'cancelled' &&
              a.providerId === provider.id &&
              startMin < timeToMinutes(a.endTime) &&
              endMin > timeToMinutes(a.startTime),
          );

          if (conflict) {
            const suggestions = computeOpenSlots({
              date,
              durationMinutes: proc.durationMinutes,
              providerId: provider.id,
              appointments: existing,
            }).slice(0, 5);
            result = {
              booked: false,
              conflict: true,
              error: `${provider.name} is already booked from ${conflict.startTime} to ${conflict.endTime} on ${date}.`,
              suggestedSlots: suggestions,
            };
          } else if (authCtx.accessToken) {
            const confirmationCode = generateConfirmationCode();
            const action: PendingCalendarAction = {
              actionId: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              source: 'voice-ai',
              operation: 'create',
              calendarId: authCtx.calendarId,
              calendarName: authCtx.calendarName,
              summary: `Dental: ${proc.name} — ${patientName}`,
              date,
              startTime,
              endTime: minutesToTime(endMin),
              durationMinutes: proc.durationMinutes,
              patientName,
              patientPhone,
              patientEmail,
              procedure: proc.name,
              providerId: provider.id,
              providerName: provider.name,
              operatory: provider.operatory,
              notes,
              isNewPatient,
              confirmationCode,
            };

            const approved = await requestUserConfirmation(action);
            if (!approved) {
              result = {
                booked: false,
                cancelledByOperator: true,
                message: 'The clinic coordinator declined syncing this appointment to Google Calendar.',
              };
            } else {
              const created = await createGoogleCalendarEvent({
                accessToken: authCtx.accessToken,
                calendarId: authCtx.calendarId,
                timeZone: authCtx.timeZone,
                patientName,
                patientPhone,
                patientEmail,
                procedure: proc.name,
                procedureId: proc.id,
                providerId: provider.id,
                providerName: provider.name,
                operatory: provider.operatory,
                date,
                startTime,
                durationMinutes: proc.durationMinutes,
                isNewPatient,
                notes,
                source: 'voice-ai',
                confirmationCode,
              });
              sendToClient({ type: 'calendar_updated', appointment: created, operation: 'create' });
              result = {
                booked: true,
                syncedToGoogleCalendar: true,
                confirmationCode: created.confirmationCode,
                googleEventId: created.googleEventId,
                patientName: created.patientName,
                procedure: created.procedure,
                providerName: created.providerName,
                operatory: created.operatory,
                date: created.date,
                startTime: created.startTime,
                startTime12h: formatTime12h(created.startTime),
                endTime: created.endTime,
              };
            }
          } else {
            const created = createLocalAppointment({
              patientName,
              patientPhone,
              patientEmail,
              isNewPatient,
              procedure: proc.name,
              procedureId: proc.id,
              providerId: provider.id,
              providerName: provider.name,
              operatory: provider.operatory,
              date,
              startTime,
              durationMinutes: proc.durationMinutes,
              notes,
              source: 'voice-ai',
            });
            sendToClient({ type: 'calendar_updated', appointment: created, operation: 'create' });
            result = {
              booked: true,
              syncedToGoogleCalendar: false,
              confirmationCode: created.confirmationCode,
              patientName: created.patientName,
              procedure: created.procedure,
              providerName: created.providerName,
              operatory: created.operatory,
              date: created.date,
              startTime: created.startTime,
              startTime12h: formatTime12h(created.startTime),
              endTime: created.endTime,
            };
          }
        }
      } else if (name === 'reschedule_appointment') {
        const ref = String(args.appointmentIdOrCode || '').trim().toLowerCase();
        const newDate = String(args.newDate || '');
        const newStartTime = String(args.newStartTime || '').slice(0, 5);
        const today = getTodayIso(authCtx.timeZone);
        const all = await fetchAppointmentsForRange(addDays(today, -7), addDays(today, 30));
        const target = all.find(
          (a) =>
            a.id.toLowerCase() === ref ||
            a.confirmationCode.toLowerCase() === ref ||
            a.patientName.toLowerCase().includes(ref),
        );

        if (!target) {
          result = {
            rescheduled: false,
            error: `Could not find an appointment matching "${args.appointmentIdOrCode}".`,
          };
        } else {
          const provider = args.providerQuery
            ? matchProvider(String(args.providerQuery), target.providerId)
            : matchProvider(target.providerId);
          const dayExisting = await fetchAppointmentsForRange(newDate, newDate);
          const newStartMin = timeToMinutes(newStartTime);
          const newEndMin = newStartMin + target.durationMinutes;
          const conflict = dayExisting.find(
            (a) =>
              a.id !== target.id &&
              a.status !== 'cancelled' &&
              a.providerId === provider.id &&
              newStartMin < timeToMinutes(a.endTime) &&
              newEndMin > timeToMinutes(a.startTime),
          );

          if (conflict) {
            result = {
              rescheduled: false,
              conflict: true,
              error: `${provider.name} has a conflict from ${conflict.startTime} to ${conflict.endTime} on ${newDate}.`,
            };
          } else if (authCtx.accessToken && target.googleEventId) {
            const action: PendingCalendarAction = {
              actionId: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              source: 'voice-ai',
              operation: 'reschedule',
              calendarId: authCtx.calendarId,
              calendarName: authCtx.calendarName,
              summary: `Dental: ${target.procedure} — ${target.patientName}`,
              date: newDate,
              startTime: newStartTime,
              endTime: minutesToTime(newEndMin),
              durationMinutes: target.durationMinutes,
              patientName: target.patientName,
              patientPhone: target.patientPhone,
              procedure: target.procedure,
              providerId: provider.id,
              providerName: provider.name,
              operatory: provider.operatory,
              targetEventId: target.googleEventId,
              confirmationCode: target.confirmationCode,
              previousDate: target.date,
              previousStartTime: target.startTime,
            };

            const approved = await requestUserConfirmation(action);
            if (!approved) {
              result = {
                rescheduled: false,
                cancelledByOperator: true,
                message: 'The clinic coordinator declined rescheduling this Google Calendar event.',
              };
            } else {
              const updated = await updateGoogleCalendarEvent({
                accessToken: authCtx.accessToken,
                calendarId: authCtx.calendarId,
                eventId: target.googleEventId,
                timeZone: authCtx.timeZone,
                date: newDate,
                startTime: newStartTime,
                durationMinutes: target.durationMinutes,
                providerId: provider.id,
                providerName: provider.name,
                operatory: provider.operatory,
              });
              sendToClient({ type: 'calendar_updated', appointment: updated, operation: 'reschedule' });
              result = {
                rescheduled: true,
                syncedToGoogleCalendar: true,
                confirmationCode: updated.confirmationCode,
                date: updated.date,
                startTime: updated.startTime,
                startTime12h: formatTime12h(updated.startTime),
                providerName: updated.providerName,
              };
            }
          } else {
            const updated = updateLocalAppointment(target.id, {
              date: newDate,
              startTime: newStartTime,
              durationMinutes: target.durationMinutes,
              providerId: provider.id,
              providerName: provider.name,
              operatory: provider.operatory,
            });
            sendToClient({ type: 'calendar_updated', appointment: updated, operation: 'reschedule' });
            result = {
              rescheduled: true,
              confirmationCode: updated.confirmationCode,
              date: updated.date,
              startTime: updated.startTime,
              startTime12h: formatTime12h(updated.startTime),
              providerName: updated.providerName,
            };
          }
        }
      } else if (name === 'cancel_appointment') {
        const ref = String(args.appointmentIdOrCode || '').trim().toLowerCase();
        const today = getTodayIso(authCtx.timeZone);
        const all = await fetchAppointmentsForRange(addDays(today, -7), addDays(today, 30));
        const target = all.find(
          (a) =>
            a.id.toLowerCase() === ref ||
            a.confirmationCode.toLowerCase() === ref ||
            a.patientName.toLowerCase().includes(ref),
        );

        if (!target) {
          result = {
            cancelled: false,
            error: `Could not find an appointment matching "${args.appointmentIdOrCode}".`,
          };
        } else if (authCtx.accessToken && target.googleEventId) {
          const action: PendingCalendarAction = {
            actionId: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            source: 'voice-ai',
            operation: 'cancel',
            calendarId: authCtx.calendarId,
            calendarName: authCtx.calendarName,
            summary: `Dental: ${target.procedure} — ${target.patientName}`,
            date: target.date,
            startTime: target.startTime,
            endTime: target.endTime,
            durationMinutes: target.durationMinutes,
            patientName: target.patientName,
            patientPhone: target.patientPhone,
            procedure: target.procedure,
            providerId: target.providerId,
            providerName: target.providerName,
            operatory: target.operatory,
            targetEventId: target.googleEventId,
            confirmationCode: target.confirmationCode,
          };

          const approved = await requestUserConfirmation(action);
          if (!approved) {
            result = {
              cancelled: false,
              cancelledByOperator: true,
              message: 'The clinic coordinator declined deleting this Google Calendar event.',
            };
          } else {
            await deleteGoogleCalendarEvent({
              accessToken: authCtx.accessToken,
              calendarId: authCtx.calendarId,
              eventId: target.googleEventId,
            });
            sendToClient({ type: 'calendar_updated', appointmentId: target.id, operation: 'cancel' });
            result = {
              cancelled: true,
              syncedToGoogleCalendar: true,
              confirmationCode: target.confirmationCode,
              patientName: target.patientName,
            };
          }
        } else {
          deleteLocalAppointment(target.id);
          sendToClient({ type: 'calendar_updated', appointmentId: target.id, operation: 'cancel' });
          result = {
            cancelled: true,
            confirmationCode: target.confirmationCode,
            patientName: target.patientName,
          };
        }
      } else {
        result = { error: `Unknown tool: ${name}` };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Tool execution error';
      result = { error: msg };
    }

    sendToClient({
      type: 'pipeline_event',
      stage: 'tool_result',
      toolName: name,
      durationMs: Date.now() - startedAt,
      result,
      timestamp: new Date().toISOString(),
    });

    return result;
  };

  const startLiveSession = async (voiceName = 'Zephyr') => {
    try {
      const ai = getGeminiClient();
      const connectedSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: [{ functionDeclarations: CLINIC_TOOLS }],
          systemInstruction: buildSystemInstruction(authCtx),
        },
        callbacks: {
          onopen: () => {
            sendToClient({ type: 'ready', voiceName });
          },
          onmessage: (message: LiveServerMessage) => {
            if (isClosing) return;

            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              sendToClient({
                type: 'input_transcript',
                text: content.inputTranscription.text,
              });
            }
            if (content?.outputTranscription?.text) {
              sendToClient({
                type: 'output_transcript',
                text: content.outputTranscription.text,
              });
            }
            if (content?.interrupted) {
              sendToClient({ type: 'interrupted' });
            }
            if (content?.turnComplete) {
              sendToClient({ type: 'turn_complete' });
            }

            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                sendToClient({
                  type: 'audio',
                  data: part.inlineData.data,
                });
              }
            }

            const functionCalls = message.toolCall?.functionCalls;
            if (functionCalls && functionCalls.length > 0) {
              void (async () => {
                const functionResponses = await Promise.all(
                  functionCalls.map(async (call) => {
                    const toolName = call.name ?? 'unknown';
                    const args = (call.args ?? {}) as Record<string, unknown>;
                    const response = await executeToolCall(toolName, args);
                    return {
                      id: call.id,
                      name: toolName,
                      response,
                    };
                  }),
                );

                if (session && !isClosing) {
                  session.sendToolResponse({ functionResponses });
                }
              })();
            }
          },
          onerror: (err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Gemini Live connection error';
            sendToClient({ type: 'error', message: msg });
          },
          onclose: () => {
            if (!isClosing) {
              sendToClient({ type: 'closed' });
            }
          },
        },
      });

      session = connectedSession;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to start Gemini Live session';
      sendToClient({ type: 'error', message: msg });
    }
  };

  clientWs.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientControlMessage;

      if (msg.type === 'start') {
        authCtx.accessToken = msg.accessToken ?? null;
        authCtx.calendarId = msg.calendarId || 'primary';
        authCtx.calendarName = msg.calendarName || 'Primary Calendar';
        authCtx.timeZone = msg.timeZone || 'America/Los_Angeles';
        void startLiveSession(msg.voiceName || 'Zephyr');
      } else if (msg.type === 'auth_update') {
        authCtx.accessToken = msg.accessToken ?? null;
        authCtx.calendarId = msg.calendarId || 'primary';
        authCtx.calendarName = msg.calendarName || 'Primary Calendar';
        authCtx.timeZone = msg.timeZone || authCtx.timeZone;
      } else if (msg.type === 'audio' && session && msg.data) {
        session.sendRealtimeInput({
          audio: {
            data: msg.data,
            mimeType: 'audio/pcm;rate=16000',
          },
        });
      } else if (msg.type === 'text' && session && msg.text) {
        sendToClient({ type: 'input_transcript', text: msg.text });
        session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: msg.text }] }],
          turnComplete: true,
        });
      } else if (msg.type === 'confirm_action' && msg.actionId) {
        const resolver = pendingApprovals.get(msg.actionId);
        if (resolver) {
          pendingApprovals.delete(msg.actionId);
          resolver(Boolean(msg.approved));
        }
      } else if (msg.type === 'stop') {
        isClosing = true;
        session?.close();
        session = null;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Invalid WebSocket message';
      sendToClient({ type: 'error', message: msg });
    }
  });

  clientWs.on('close', () => {
    isClosing = true;
    for (const [, resolve] of pendingApprovals.entries()) {
      resolve(false);
    }
    pendingApprovals.clear();
    try {
      session?.close();
    } catch {
      // Ignore cleanup errors
    }
    session = null;
  });
}
