import fs from 'node:fs';
import path from 'node:path';
import {
  DENTAL_PROVIDERS,
  generateConfirmationCode,
  minutesToTime,
  timeToMinutes,
  type ClinicAppointment,
} from '../shared/clinicData.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'appointments.json');

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(baseDate: string, days: number): string {
  const dt = new Date(`${baseDate}T12:00:00`);
  dt.setDate(dt.getDate() + days);
  return formatIsoDate(dt);
}

function buildSeedAppointments(): ClinicAppointment[] {
  const today = formatIsoDate(new Date());
  const tomorrow = addDays(today, 1);
  const dayAfter = addDays(today, 2);

  return [
    {
      id: 'seed-1',
      confirmationCode: 'CD-4821K',
      patientName: 'Elena Rostova',
      patientPhone: '(415) 555-0142',
      patientEmail: 'elena.rostova@example.com',
      isNewPatient: false,
      procedure: 'Comprehensive Exam & Digital X-Rays',
      procedureId: 'exam-xray',
      providerId: 'dr-kim',
      providerName: DENTAL_PROVIDERS[0].name,
      operatory: DENTAL_PROVIDERS[0].operatory,
      date: today,
      startTime: '09:00',
      endTime: '10:00',
      durationMinutes: 60,
      status: 'confirmed',
      source: 'manual',
      notes: 'Annual comprehensive recall and crown check on #14.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'seed-2',
      confirmationCode: 'CD-7392M',
      patientName: 'Marcus Vance',
      patientPhone: '(415) 555-0188',
      isNewPatient: true,
      procedure: 'Emergency Toothache Assessment',
      procedureId: 'emergency',
      providerId: 'dr-alvarez',
      providerName: DENTAL_PROVIDERS[1].name,
      operatory: DENTAL_PROVIDERS[1].operatory,
      date: today,
      startTime: '10:30',
      endTime: '11:00',
      durationMinutes: 30,
      status: 'confirmed',
      source: 'voice-ai',
      notes: 'Cold sensitivity on lower right molar; requested morning triage.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'seed-3',
      confirmationCode: 'CD-9154P',
      patientName: 'Priya Nair',
      patientPhone: '(415) 555-0197',
      patientEmail: 'priya.nair@example.com',
      isNewPatient: false,
      procedure: 'Routine Hygiene & Cleaning',
      procedureId: 'cleaning',
      providerId: 'dr-evans',
      providerName: DENTAL_PROVIDERS[2].name,
      operatory: DENTAL_PROVIDERS[2].operatory,
      date: today,
      startTime: '13:30',
      endTime: '14:15',
      durationMinutes: 45,
      status: 'confirmed',
      source: 'manual',
      notes: '6-month recall hygiene.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'seed-4',
      confirmationCode: 'CD-2047R',
      patientName: 'David Chen',
      patientPhone: '(415) 555-0165',
      isNewPatient: false,
      procedure: 'Composite Filling / Crown Prep',
      procedureId: 'filling-crown',
      providerId: 'dr-kim',
      providerName: DENTAL_PROVIDERS[0].name,
      operatory: DENTAL_PROVIDERS[0].operatory,
      date: tomorrow,
      startTime: '11:00',
      endTime: '12:00',
      durationMinutes: 60,
      status: 'confirmed',
      source: 'manual',
      notes: 'Ceramic crown impression on tooth #3.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'seed-5',
      confirmationCode: 'CD-6631W',
      patientName: 'Hannah Brooks',
      patientPhone: '(415) 555-0123',
      isNewPatient: false,
      procedure: 'Orthodontic Aligner Check',
      procedureId: 'ortho-aligner',
      providerId: 'dr-evans',
      providerName: DENTAL_PROVIDERS[2].name,
      operatory: DENTAL_PROVIDERS[2].operatory,
      date: dayAfter,
      startTime: '14:00',
      endTime: '14:30',
      durationMinutes: 30,
      status: 'confirmed',
      source: 'voice-ai',
      notes: 'Tray set #12 progress check.',
      createdAt: new Date().toISOString(),
    },
  ];
}

function ensureStore(): ClinicAppointment[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      const seed = buildSeedAppointments();
      fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), 'utf8');
      return seed;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as ClinicAppointment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return buildSeedAppointments();
  }
}

function saveStore(items: ClinicAppointment[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
}

export function listLocalAppointments(startDate?: string, endDate?: string): ClinicAppointment[] {
  const all = ensureStore().filter((a) => a.status !== 'cancelled');
  return all
    .filter((a) => {
      if (startDate && a.date < startDate) return false;
      if (endDate && a.date > endDate) return false;
      return true;
    })
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
}

export function createLocalAppointment(input: {
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  isNewPatient?: boolean;
  procedure: string;
  procedureId?: string;
  providerId: string;
  providerName: string;
  operatory: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  notes?: string;
  source: 'voice-ai' | 'manual';
  confirmationCode?: string;
}): ClinicAppointment {
  const items = ensureStore();
  const startMin = timeToMinutes(input.startTime);
  const endTime = minutesToTime(startMin + input.durationMinutes);

  const conflict = items.find(
    (a) =>
      a.status !== 'cancelled' &&
      a.date === input.date &&
      a.providerId === input.providerId &&
      startMin < timeToMinutes(a.endTime) &&
      startMin + input.durationMinutes > timeToMinutes(a.startTime),
  );
  if (conflict) {
    throw new Error(
      `${input.providerName} already has an appointment from ${conflict.startTime} to ${conflict.endTime} on ${input.date}.`,
    );
  }

  const created: ClinicAppointment = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    confirmationCode: input.confirmationCode ?? generateConfirmationCode(),
    patientName: input.patientName,
    patientPhone: input.patientPhone,
    patientEmail: input.patientEmail,
    isNewPatient: Boolean(input.isNewPatient),
    procedure: input.procedure,
    procedureId: input.procedureId,
    providerId: input.providerId,
    providerName: input.providerName,
    operatory: input.operatory,
    date: input.date,
    startTime: input.startTime,
    endTime,
    durationMinutes: input.durationMinutes,
    status: 'confirmed',
    source: input.source,
    notes: input.notes,
    createdAt: new Date().toISOString(),
  };

  items.push(created);
  saveStore(items);
  return created;
}

export function updateLocalAppointment(
  id: string,
  patch: {
    date: string;
    startTime: string;
    durationMinutes: number;
    providerId?: string;
    providerName?: string;
    operatory?: string;
  },
): ClinicAppointment {
  const items = ensureStore();
  const idx = items.findIndex((a) => a.id === id || a.confirmationCode === id);
  if (idx === -1) {
    throw new Error(`Appointment ${id} not found.`);
  }
  const existing = items[idx];
  const providerId = patch.providerId ?? existing.providerId;
  const startMin = timeToMinutes(patch.startTime);
  const endTime = minutesToTime(startMin + patch.durationMinutes);

  const conflict = items.find(
    (a) =>
      a.id !== existing.id &&
      a.status !== 'cancelled' &&
      a.date === patch.date &&
      a.providerId === providerId &&
      startMin < timeToMinutes(a.endTime) &&
      startMin + patch.durationMinutes > timeToMinutes(a.startTime),
  );
  if (conflict) {
    throw new Error(
      `Time slot ${patch.startTime} on ${patch.date} conflicts with an existing visit.`,
    );
  }

  const updated: ClinicAppointment = {
    ...existing,
    date: patch.date,
    startTime: patch.startTime,
    endTime,
    durationMinutes: patch.durationMinutes,
    providerId,
    providerName: patch.providerName ?? existing.providerName,
    operatory: patch.operatory ?? existing.operatory,
  };
  items[idx] = updated;
  saveStore(items);
  return updated;
}

export function deleteLocalAppointment(id: string): ClinicAppointment {
  const items = ensureStore();
  const idx = items.findIndex((a) => a.id === id || a.confirmationCode === id);
  if (idx === -1) {
    throw new Error(`Appointment ${id} not found.`);
  }
  const [removed] = items.splice(idx, 1);
  saveStore(items);
  return removed;
}
