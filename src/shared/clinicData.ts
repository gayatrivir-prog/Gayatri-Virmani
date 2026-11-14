export interface DentalProvider {
  id: string;
  name: string;
  credentials: string;
  specialty: string;
  operatory: string;
  avatarUrl: string;
  accentHex: string;
  workingDays: number[]; // 0=Sun..6=Sat
}

export interface DentalProcedure {
  id: string;
  name: string;
  category: 'Preventive' | 'Restorative' | 'Emergency' | 'Orthodontics' | 'Cosmetic';
  durationMinutes: number;
  feeUsd: number;
  defaultProviderId: string;
  description: string;
}

export type AppointmentStatus = 'confirmed' | 'pending_sync' | 'cancelled';

export interface ClinicAppointment {
  id: string;
  googleEventId?: string;
  calendarId?: string;
  confirmationCode: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  isNewPatient: boolean;
  procedure: string;
  procedureId?: string;
  providerId: string;
  providerName: string;
  operatory: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm (24h)
  endTime: string; // HH:mm (24h)
  durationMinutes: number;
  status: AppointmentStatus;
  source: 'voice-ai' | 'manual' | 'google-calendar';
  notes?: string;
  htmlLink?: string;
  createdAt: string;
}

export interface GoogleCalendarSummary {
  id: string;
  summary: string;
  primary?: boolean;
  timeZone?: string;
  backgroundColor?: string;
  accessRole?: string;
}

export interface PendingCalendarAction {
  actionId: string;
  source: 'voice-ai' | 'manual';
  operation: 'create' | 'reschedule' | 'cancel';
  calendarId: string;
  calendarName: string;
  summary: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  patientName: string;
  patientPhone?: string;
  patientEmail?: string;
  procedure: string;
  providerId: string;
  providerName: string;
  operatory: string;
  notes?: string;
  isNewPatient?: boolean;
  targetEventId?: string;
  confirmationCode?: string;
  previousDate?: string;
  previousStartTime?: string;
}

export const CLINIC_HOURS = {
  openHour: 8,
  openMinute: 30,
  closeHour: 17,
  closeMinute: 30,
  slotIntervalMinutes: 15,
};

export const DENTAL_PROVIDERS: DentalProvider[] = [
  {
    id: 'dr-kim',
    name: 'Dr. Sarah Kim',
    credentials: 'DDS',
    specialty: 'General & Cosmetic Dentistry',
    operatory: 'Suite 101 · Operatory A',
    avatarUrl: '/src/assets/images/dentist_maya_lin_1794652987128.jpg',
    accentHex: '#0D9488',
    workingDays: [1, 2, 3, 4, 5, 6],
  },
  {
    id: 'dr-alvarez',
    name: 'Dr. Rafael Alvarez',
    credentials: 'DMD',
    specialty: 'Endodontics & Emergency Care',
    operatory: 'Suite 102 · Operatory B',
    avatarUrl: '/src/assets/images/dentist_julian_reyes_1794652987315.jpg',
    accentHex: '#0284C7',
    workingDays: [1, 2, 3, 4, 5, 6],
  },
  {
    id: 'dr-evans',
    name: 'Dr. Sarah Evans',
    credentials: 'DDS',
    specialty: 'Orthodontics & Preventive Hygiene',
    operatory: 'Suite 103 · Operatory C',
    avatarUrl: '/src/assets/images/dentist_claire_vance_1794652987034.jpg',
    accentHex: '#4F46E5',
    workingDays: [1, 2, 3, 4, 5, 6],
  },
];

export const DENTAL_PROCEDURES: DentalProcedure[] = [
  {
    id: 'cleaning',
    name: 'Routine Hygiene & Cleaning',
    category: 'Preventive',
    durationMinutes: 45,
    feeUsd: 145,
    defaultProviderId: 'dr-evans',
    description: 'Ultrasonic scaling, polishing, periodontal check, and fluoride varnish.',
  },
  {
    id: 'exam-xray',
    name: 'Comprehensive Exam & Digital X-Rays',
    category: 'Preventive',
    durationMinutes: 60,
    feeUsd: 210,
    defaultProviderId: 'dr-kim',
    description: 'Full oral examination, bitewing radiographs, and personalized treatment plan.',
  },
  {
    id: 'emergency',
    name: 'Emergency Toothache Assessment',
    category: 'Emergency',
    durationMinutes: 30,
    feeUsd: 125,
    defaultProviderId: 'dr-alvarez',
    description: 'Same-day diagnostic triage for acute dental pain, swelling, or fractured teeth.',
  },
  {
    id: 'filling-crown',
    name: 'Composite Filling / Crown Prep',
    category: 'Restorative',
    durationMinutes: 60,
    feeUsd: 340,
    defaultProviderId: 'dr-kim',
    description: 'Tooth-colored composite restoration or digital scan for ceramic crown.',
  },
  {
    id: 'root-canal',
    name: 'Endodontic Root Canal Consult',
    category: 'Emergency',
    durationMinutes: 45,
    feeUsd: 195,
    defaultProviderId: 'dr-alvarez',
    description: '3D CBCT evaluation and vitality testing for root canal therapy.',
  },
  {
    id: 'whitening',
    name: 'In-Office Whitening & Cosmetic Consult',
    category: 'Cosmetic',
    durationMinutes: 45,
    feeUsd: 390,
    defaultProviderId: 'dr-kim',
    description: 'Enamel-safe chairside whitening or porcelain veneer shade consultation.',
  },
  {
    id: 'ortho-aligner',
    name: 'Orthodontic Aligner Check',
    category: 'Orthodontics',
    durationMinutes: 30,
    feeUsd: 160,
    defaultProviderId: 'dr-evans',
    description: 'Clear aligner progression scan, attachment check, and tray fitting.',
  },
];

export function timeToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr ?? 0);
  const m = Number(mStr ?? 0);
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  let h = Number(hStr ?? 0);
  const m = Number(mStr ?? 0);
  const suffix = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function matchProcedure(query: string): DentalProcedure {
  const q = query.toLowerCase();
  const found = DENTAL_PROCEDURES.find(
    (p) =>
      p.id.toLowerCase() === q ||
      p.name.toLowerCase().includes(q) ||
      q.includes(p.id) ||
      (q.includes('clean') && p.id === 'cleaning') ||
      (q.includes('hygiene') && p.id === 'cleaning') ||
      (q.includes('exam') && p.id === 'exam-xray') ||
      (q.includes('x-ray') && p.id === 'exam-xray') ||
      (q.includes('checkup') && p.id === 'exam-xray') ||
      (q.includes('pain') && p.id === 'emergency') ||
      (q.includes('toothache') && p.id === 'emergency') ||
      (q.includes('emergency') && p.id === 'emergency') ||
      (q.includes('urgent') && p.id === 'emergency') ||
      (q.includes('crown') && p.id === 'filling-crown') ||
      (q.includes('filling') && p.id === 'filling-crown') ||
      (q.includes('cavity') && p.id === 'filling-crown') ||
      (q.includes('root') && p.id === 'root-canal') ||
      (q.includes('whiten') && p.id === 'whitening') ||
      (q.includes('cosmetic') && p.id === 'whitening') ||
      (q.includes('ortho') && p.id === 'ortho-aligner') ||
      (q.includes('aligner') && p.id === 'ortho-aligner') ||
      (q.includes('braces') && p.id === 'ortho-aligner'),
  );
  return found ?? DENTAL_PROCEDURES[0];
}

export function matchProvider(query?: string, fallbackProviderId?: string): DentalProvider {
  if (query) {
    const q = query.toLowerCase();
    const found = DENTAL_PROVIDERS.find(
      (p) =>
        p.id.toLowerCase() === q ||
        p.name.toLowerCase().includes(q) ||
        (q.includes('kim') && p.id === 'dr-kim') ||
        (q.includes('alvarez') && p.id === 'dr-alvarez') ||
        (q.includes('rafael') && p.id === 'dr-alvarez') ||
        (q.includes('evans') && p.id === 'dr-evans'),
    );
    if (found) return found;
  }
  if (fallbackProviderId) {
    const fallback = DENTAL_PROVIDERS.find((p) => p.id === fallbackProviderId);
    if (fallback) return fallback;
  }
  return DENTAL_PROVIDERS[0];
}

export function generateConfirmationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'CD-';
  for (let i = 0; i < 5; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function computeOpenSlots(params: {
  date: string;
  durationMinutes: number;
  providerId?: string;
  appointments: ClinicAppointment[];
}): Array<{ providerId: string; providerName: string; operatory: string; startTime: string; endTime: string }> {
  const { date, durationMinutes, providerId, appointments } = params;
  const openMin = CLINIC_HOURS.openHour * 60 + CLINIC_HOURS.openMinute;
  const closeMin = CLINIC_HOURS.closeHour * 60 + CLINIC_HOURS.closeMinute;

  const targetProviders = providerId
    ? DENTAL_PROVIDERS.filter((p) => p.id === providerId)
    : DENTAL_PROVIDERS;

  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
  const slots: Array<{
    providerId: string;
    providerName: string;
    operatory: string;
    startTime: string;
    endTime: string;
  }> = [];

  for (const provider of targetProviders) {
    if (!provider.workingDays.includes(dayOfWeek)) {
      continue;
    }

    const busyIntervals = appointments
      .filter((apt) => apt.date === date && apt.status !== 'cancelled' && apt.providerId === provider.id)
      .map((apt) => ({
        start: timeToMinutes(apt.startTime),
        end: timeToMinutes(apt.endTime),
      }));

    // Also include un-attributed Google Calendar events as clinic-wide busy blocks if providerId === 'dr-kim'
    const sharedBusy = appointments
      .filter(
        (apt) =>
          apt.date === date &&
          apt.status !== 'cancelled' &&
          apt.providerId === 'unassigned' &&
          provider.id === 'dr-kim',
      )
      .map((apt) => ({
        start: timeToMinutes(apt.startTime),
        end: timeToMinutes(apt.endTime),
      }));

    const allBusy = [...busyIntervals, ...sharedBusy];

    for (let t = openMin; t + durationMinutes <= closeMin; t += 30) {
      const candidateEnd = t + durationMinutes;
      const overlaps = allBusy.some((b) => t < b.end && candidateEnd > b.start);
      if (!overlaps) {
        slots.push({
          providerId: provider.id,
          providerName: provider.name,
          operatory: provider.operatory,
          startTime: minutesToTime(t),
          endTime: minutesToTime(candidateEnd),
        });
      }
    }
  }

  return slots;
}
