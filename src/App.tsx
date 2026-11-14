import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { Plus } from 'lucide-react';
import {
  DENTAL_PROVIDERS,
  type ClinicAppointment,
  type GoogleCalendarSummary,
  type PendingCalendarAction,
} from './shared/clinicData';
import { getAccessToken, googleSignIn, initAuth, logout } from './lib/googleAuth';
import { useGeminiLive } from './hooks/useGeminiLive';
import { CalendarSyncBar } from './components/CalendarSyncBar';
import { ScheduleBoard } from './components/ScheduleBoard';
import { VoiceDeskPanel } from './components/VoiceDeskPanel';
import { BookingModal } from './components/BookingModal';
import { ConfirmationDialog } from './components/ConfirmationDialog';
import { ProvidersView, TreatmentsView } from './components/ProvidersAndTreatments';

type NavTab = 'schedule' | 'voice' | 'providers' | 'treatments';

function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function shiftIsoDate(baseIso: string, delta: number): string {
  const dt = new Date(`${baseIso}T12:00:00`);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate(),
  ).padStart(2, '0')}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('schedule');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayIso);

  // Google Calendar OAuth state (token cached strictly in memory via googleAuth.ts)
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendarSummary[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('primary');

  // Schedule state
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Modal & confirmation states
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [initialSlot, setInitialSlot] = useState<{
    providerId: string;
    date: string;
    startTime: string;
  } | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<ClinicAppointment | null>(null);

  const [manualConfirmState, setManualConfirmState] = useState<{
    action: PendingCalendarAction;
    rawPayload: Record<string, unknown>;
  } | null>(null);
  const [isSubmittingConfirm, setIsSubmittingConfirm] = useState(false);

  const selectedCalendarName = useMemo(() => {
    const found = calendars.find((c) => c.id === selectedCalendarId);
    return found?.summary ?? 'Primary Calendar';
  }, [calendars, selectedCalendarId]);

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles',
    [],
  );

  // Initialize Firebase auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser, token) => {
        setUser(authedUser);
        setAccessToken(token);
      },
      () => {
        setAccessToken(null);
        setCalendars([]);
      },
    );
    return unsubscribe;
  }, []);

  // Load Google Calendar list when authenticated
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/google-calendar/calendars', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { calendars?: GoogleCalendarSummary[] };
        if (!cancelled && data.calendars && data.calendars.length > 0) {
          setCalendars(data.calendars);
          const primary = data.calendars.find((c) => c.primary);
          if (primary) setSelectedCalendarId(primary.id);
        }
      } catch {
        // Fallback to primary calendar
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const fetchAppointments = useCallback(async () => {
    setIsLoadingSchedule(true);
    setScheduleError(null);
    const startDate = shiftIsoDate(selectedDate, -3);
    const endDate = shiftIsoDate(selectedDate, 7);
    const token = getAccessToken() ?? accessToken;

    try {
      const qs = new URLSearchParams({
        startDate,
        endDate,
        calendarId: selectedCalendarId,
        timeZone,
      });
      const res = await fetch(`/api/appointments?${qs.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.status === 401 || res.status === 502) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        if (errData.error?.includes('401')) {
          setAccessToken(null);
          setAuthError('Google Calendar session expired. Please sign in again.');
        } else {
          setScheduleError(errData.error ?? 'Unable to load schedule.');
        }
        return;
      }
      const data = (await res.json()) as { appointments?: ClinicAppointment[] };
      setAppointments(data.appointments ?? []);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Unable to load appointments.');
    } finally {
      setIsLoadingSchedule(false);
    }
  }, [accessToken, selectedCalendarId, selectedDate, timeZone]);

  useEffect(() => {
    void fetchAppointments();
  }, [fetchAppointments]);

  const live = useGeminiLive({
    accessToken,
    calendarId: selectedCalendarId,
    calendarName: selectedCalendarName,
    onCalendarUpdated: () => {
      void fetchAppointments();
    },
  });

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
    setCalendars([]);
    setSelectedCalendarId('primary');
  };

  const executeDirectMutation = async (payload: {
    mode: 'create' | 'reschedule' | 'cancel';
    appointmentId?: string;
    patientName: string;
    patientPhone: string;
    patientEmail?: string;
    procedureId: string;
    providerId: string;
    date: string;
    startTime: string;
    durationMinutes: number;
    isNewPatient: boolean;
    notes: string;
  }) => {
    const token = getAccessToken() ?? accessToken;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    if (payload.mode === 'create') {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...payload,
          calendarId: selectedCalendarId,
          timeZone,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Failed to book appointment.');
      }
    } else if (payload.mode === 'reschedule' && payload.appointmentId) {
      const res = await fetch(`/api/appointments/${encodeURIComponent(payload.appointmentId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          date: payload.date,
          startTime: payload.startTime,
          durationMinutes: payload.durationMinutes,
          providerId: payload.providerId,
          calendarId: selectedCalendarId,
          timeZone,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Failed to reschedule appointment.');
      }
    } else if (payload.mode === 'cancel' && payload.appointmentId) {
      const res = await fetch(
        `/api/appointments/${encodeURIComponent(
          payload.appointmentId,
        )}?calendarId=${encodeURIComponent(selectedCalendarId)}`,
        {
          method: 'DELETE',
          headers,
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Failed to cancel appointment.');
      }
    }
    await fetchAppointments();
  };

  const handleConfirmManualGoogleMutation = async () => {
    if (!manualConfirmState) return;
    setIsSubmittingConfirm(true);
    try {
      await executeDirectMutation(
        manualConfirmState.rawPayload as Parameters<typeof executeDirectMutation>[0],
      );
      setManualConfirmState(null);
      setBookingModalOpen(false);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Google Calendar sync failed.');
      setManualConfirmState(null);
    } finally {
      setIsSubmittingConfirm(false);
    }
  };

  const openNewAppointmentModal = (providerId?: string, date?: string, startTime?: string) => {
    setSelectedAppointment(null);
    setInitialSlot({
      providerId: providerId ?? DENTAL_PROVIDERS[0].id,
      date: date ?? selectedDate,
      startTime: startTime ?? '10:00',
    });
    setBookingModalOpen(true);
  };

  // Active confirmation modal prioritizes Voice AI pending tool actions, or manual Google Calendar edits
  const activeConfirmationAction = live.pendingAction ?? manualConfirmState?.action ?? null;

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9FB] text-slate-900">
      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (4 single-line links) — Zone 3 (1 Primary CTA) */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8">
          <a
            href="#schedule"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('schedule');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
          >
            Dant Anand
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
            {(
              [
                { id: 'schedule', label: 'Schedule' },
                { id: 'voice', label: 'Voice Desk' },
                { id: 'providers', label: 'Providers' },
                { id: 'treatments', label: 'Treatments' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === item.id
                    ? 'border-teal-600 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => openNewAppointmentModal()}
              className="h-9 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 text-xs font-medium text-white hover:bg-teal-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Appointment</span>
            </button>
          </div>
        </div>
      </header>

      {/* Google Calendar Sync & Account Bar */}
      <CalendarSyncBar
        user={user}
        accessToken={accessToken}
        isLoggingIn={isLoggingIn}
        isSyncing={isLoadingSchedule}
        calendars={calendars}
        selectedCalendarId={selectedCalendarId}
        onSelectCalendar={setSelectedCalendarId}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onRefresh={() => void fetchAppointments()}
        authError={authError}
      />

      {/* Mobile Nav Switcher */}
      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
        {(
          [
            { id: 'schedule', label: 'Schedule' },
            { id: 'voice', label: 'Voice Desk' },
            { id: 'providers', label: 'Providers' },
            { id: 'treatments', label: 'Treatments' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            className={`h-8 px-3 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
              activeTab === item.id
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {activeTab === 'schedule' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 min-w-0">
              <ScheduleBoard
                selectedDate={selectedDate}
                onChangeDate={setSelectedDate}
                appointments={appointments}
                isLoading={isLoadingSchedule}
                error={scheduleError}
                isGoogleConnected={Boolean(accessToken)}
                onSelectSlot={(providerId, date, startTime) =>
                  openNewAppointmentModal(providerId, date, startTime)
                }
                onSelectAppointment={(apt) => {
                  setInitialSlot(null);
                  setSelectedAppointment(apt);
                  setBookingModalOpen(true);
                }}
              />
            </div>

            <div className="lg:col-span-4 lg:sticky lg:top-6">
              <VoiceDeskPanel
                connectionState={live.connectionState}
                errorMessage={live.errorMessage}
                isMuted={live.isMuted}
                onToggleMute={() => live.setIsMuted(!live.isMuted)}
                isAiSpeaking={live.isAiSpeaking}
                micLevel={live.micLevel}
                outputLevel={live.outputLevel}
                transcripts={live.transcripts}
                pipelineEvents={live.pipelineEvents}
                lastBookedAppointment={live.lastBookedAppointment}
                onStartSession={(voice) => void live.startSession(voice, true)}
                onStopSession={live.stopSession}
                onSendTextTurn={live.sendTextTurn}
                onClearLog={live.clearSessionLog}
              />
            </div>
          </div>
        )}

        {activeTab === 'voice' && (
          <div className="max-w-3xl mx-auto">
            <VoiceDeskPanel
              connectionState={live.connectionState}
              errorMessage={live.errorMessage}
              isMuted={live.isMuted}
              onToggleMute={() => live.setIsMuted(!live.isMuted)}
              isAiSpeaking={live.isAiSpeaking}
              micLevel={live.micLevel}
              outputLevel={live.outputLevel}
              transcripts={live.transcripts}
              pipelineEvents={live.pipelineEvents}
              lastBookedAppointment={live.lastBookedAppointment}
              onStartSession={(voice) => void live.startSession(voice, true)}
              onStopSession={live.stopSession}
              onSendTextTurn={live.sendTextTurn}
              onClearLog={live.clearSessionLog}
            />
          </div>
        )}

        {activeTab === 'providers' && (
          <ProvidersView
            onBookWithProvider={(providerId) => {
              setActiveTab('schedule');
              openNewAppointmentModal(providerId, selectedDate, '10:00');
            }}
          />
        )}

        {activeTab === 'treatments' && (
          <TreatmentsView
            onBookProcedure={(providerId) => {
              setActiveTab('schedule');
              openNewAppointmentModal(providerId, selectedDate, '10:00');
            }}
          />
        )}
      </main>

      {/* Manual Booking / Reschedule / Cancel Modal */}
      <BookingModal
        isOpen={bookingModalOpen}
        initialSlot={initialSlot}
        selectedAppointment={selectedAppointment}
        calendarId={selectedCalendarId}
        calendarName={selectedCalendarName}
        isGoogleConnected={Boolean(accessToken)}
        onClose={() => setBookingModalOpen(false)}
        onSubmitDirect={executeDirectMutation}
        onRequestGoogleConfirmation={(action, rawPayload) => {
          setManualConfirmState({ action, rawPayload });
        }}
      />

      {/* Explicit Confirmation Dialog for Mutating Google Calendar Operations */}
      <ConfirmationDialog
        action={activeConfirmationAction}
        isSubmitting={isSubmittingConfirm}
        onConfirm={() => {
          if (live.pendingAction) {
            live.resolvePendingAction(live.pendingAction.actionId, true);
          } else if (manualConfirmState) {
            void handleConfirmManualGoogleMutation();
          }
        }}
        onCancel={() => {
          if (live.pendingAction) {
            live.resolvePendingAction(live.pendingAction.actionId, false);
          } else if (manualConfirmState) {
            setManualConfirmState(null);
          }
        }}
      />
    </div>
  );
}
