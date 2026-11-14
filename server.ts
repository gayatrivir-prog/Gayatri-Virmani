import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import {
  computeOpenSlots,
  DENTAL_PROCEDURES,
  DENTAL_PROVIDERS,
  matchProcedure,
  matchProvider,
  type ClinicAppointment,
} from './src/shared/clinicData.ts';
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  listGoogleCalendarEvents,
  listGoogleCalendars,
  updateGoogleCalendarEvent,
} from './src/server/googleCalendarService.ts';
import {
  createLocalAppointment,
  deleteLocalAppointment,
  listLocalAppointments,
  updateLocalAppointment,
} from './src/server/localClinicStore.ts';
import { attachLiveWebSocket } from './src/server/livePipeline.ts';

const PORT = 3000;

function extractBearerToken(req: express.Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function escapeIcsText(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, geminiConfigured: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.get('/api/clinic/metadata', (_req, res) => {
    res.json({
      providers: DENTAL_PROVIDERS,
      procedures: DENTAL_PROCEDURES,
    });
  });

  app.get('/api/google-calendar/calendars', async (req, res) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Google Calendar authorization required.' });
      return;
    }
    try {
      const calendars = await listGoogleCalendars(token);
      res.json({ calendars });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list calendars';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/appointments', async (req, res) => {
    const startDate = String(req.query.startDate || new Date().toISOString().slice(0, 10));
    const endDate = String(req.query.endDate || startDate);
    const calendarId = String(req.query.calendarId || 'primary');
    const timeZone = String(req.query.timeZone || 'America/Los_Angeles');
    const token = extractBearerToken(req);

    try {
      if (token) {
        const appointments = await listGoogleCalendarEvents({
          accessToken: token,
          calendarId,
          startDate,
          endDate,
          timeZone,
        });
        res.json({ mode: 'google-calendar', appointments });
      } else {
        const appointments = listLocalAppointments(startDate, endDate);
        res.json({ mode: 'clinic-preview', appointments });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch appointments';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/appointments/availability', async (req, res) => {
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));
    const procedureQuery = String(req.query.procedure || 'cleaning');
    const providerId = req.query.providerId ? String(req.query.providerId) : undefined;
    const calendarId = String(req.query.calendarId || 'primary');
    const timeZone = String(req.query.timeZone || 'America/Los_Angeles');
    const token = extractBearerToken(req);

    try {
      const proc = matchProcedure(procedureQuery);
      const appointments = token
        ? await listGoogleCalendarEvents({
            accessToken: token,
            calendarId,
            startDate: date,
            endDate: date,
            timeZone,
          })
        : listLocalAppointments(date, date);

      const slots = computeOpenSlots({
        date,
        durationMinutes: proc.durationMinutes,
        providerId,
        appointments,
      });
      res.json({ date, procedure: proc, slots });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to compute availability';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/appointments', async (req, res) => {
    const token = extractBearerToken(req);
    const {
      patientName,
      patientPhone,
      patientEmail,
      procedureId,
      procedure,
      providerId,
      date,
      startTime,
      isNewPatient,
      notes,
      calendarId = 'primary',
      timeZone = 'America/Los_Angeles',
    } = req.body as Record<string, unknown>;

    if (!patientName || !patientPhone || !date || !startTime) {
      res.status(400).json({ error: 'Patient name, phone, date, and start time are required.' });
      return;
    }

    try {
      const proc = matchProcedure(String(procedureId || procedure || 'cleaning'));
      const provider = matchProvider(providerId ? String(providerId) : undefined, proc.defaultProviderId);

      let created: ClinicAppointment;
      if (token) {
        created = await createGoogleCalendarEvent({
          accessToken: token,
          calendarId: String(calendarId),
          timeZone: String(timeZone),
          patientName: String(patientName),
          patientPhone: String(patientPhone),
          patientEmail: patientEmail ? String(patientEmail) : undefined,
          procedure: proc.name,
          procedureId: proc.id,
          providerId: provider.id,
          providerName: provider.name,
          operatory: provider.operatory,
          date: String(date),
          startTime: String(startTime),
          durationMinutes: proc.durationMinutes,
          isNewPatient: Boolean(isNewPatient),
          notes: notes ? String(notes) : '',
          source: 'manual',
        });
      } else {
        created = createLocalAppointment({
          patientName: String(patientName),
          patientPhone: String(patientPhone),
          patientEmail: patientEmail ? String(patientEmail) : undefined,
          isNewPatient: Boolean(isNewPatient),
          procedure: proc.name,
          procedureId: proc.id,
          providerId: provider.id,
          providerName: provider.name,
          operatory: provider.operatory,
          date: String(date),
          startTime: String(startTime),
          durationMinutes: proc.durationMinutes,
          notes: notes ? String(notes) : '',
          source: 'manual',
        });
      }
      res.status(201).json({ appointment: created });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to book appointment';
      res.status(409).json({ error: message });
    }
  });

  app.patch('/api/appointments/:id', async (req, res) => {
    const token = extractBearerToken(req);
    const id = req.params.id;
    const {
      date,
      startTime,
      durationMinutes,
      providerId,
      calendarId = 'primary',
      timeZone = 'America/Los_Angeles',
    } = req.body as Record<string, unknown>;

    if (!date || !startTime) {
      res.status(400).json({ error: 'New date and startTime are required.' });
      return;
    }

    try {
      const provider = providerId ? matchProvider(String(providerId)) : undefined;
      const dur = Number(durationMinutes || 45);
      let updated: ClinicAppointment;

      if (token) {
        updated = await updateGoogleCalendarEvent({
          accessToken: token,
          calendarId: String(calendarId),
          eventId: id,
          timeZone: String(timeZone),
          date: String(date),
          startTime: String(startTime),
          durationMinutes: dur,
          providerId: provider?.id,
          providerName: provider?.name,
          operatory: provider?.operatory,
        });
      } else {
        updated = updateLocalAppointment(id, {
          date: String(date),
          startTime: String(startTime),
          durationMinutes: dur,
          providerId: provider?.id,
          providerName: provider?.name,
          operatory: provider?.operatory,
        });
      }
      res.json({ appointment: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reschedule appointment';
      res.status(409).json({ error: message });
    }
  });

  app.delete('/api/appointments/:id', async (req, res) => {
    const token = extractBearerToken(req);
    const id = req.params.id;
    const calendarId = String(req.query.calendarId || 'primary');

    try {
      if (token) {
        await deleteGoogleCalendarEvent({
          accessToken: token,
          calendarId,
          eventId: id,
        });
      } else {
        deleteLocalAppointment(id);
      }
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel appointment';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/appointments/:id/ics', (req, res) => {
    const date = String(req.query.date || '');
    const startTime = String(req.query.startTime || '09:00');
    const endTime = String(req.query.endTime || '09:45');
    const summary = String(req.query.summary || 'Dant Anand Appointment');
    const location = String(req.query.location || 'Dant Anand');

    const dtStart = `${date.replace(/-/g, '')}T${startTime.replace(':', '')}00`;
    const dtEnd = `${date.replace(/-/g, '')}T${endTime.replace(':', '')}00`;

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Dant Anand//Voice Desk//EN',
      'BEGIN:VEVENT',
      `UID:${req.params.id}@dantanand`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `LOCATION:${escapeIcsText(location)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dant-anand-${req.params.id}.ics"`);
    res.send(ics);
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', `http://${request.headers.host}`).pathname;
    if (pathname === '/ws/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        attachLiveWebSocket(ws);
      });
    } else {
      socket.destroy();
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Dant Anand Voice Desk running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
