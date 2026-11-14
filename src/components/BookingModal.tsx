import React, { useEffect, useState } from 'react';
import { Calendar, Clock, Trash2, X } from 'lucide-react';
import {
  DENTAL_PROCEDURES,
  DENTAL_PROVIDERS,
  formatTime12h,
  minutesToTime,
  timeToMinutes,
  type ClinicAppointment,
  type PendingCalendarAction,
} from '../shared/clinicData';

interface BookingModalProps {
  isOpen: boolean;
  initialSlot: { providerId: string; date: string; startTime: string } | null;
  selectedAppointment: ClinicAppointment | null;
  calendarId: string;
  calendarName: string;
  isGoogleConnected: boolean;
  onClose: () => void;
  onSubmitDirect: (payload: {
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
  }) => Promise<void>;
  onRequestGoogleConfirmation: (action: PendingCalendarAction, rawPayload: Record<string, unknown>) => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  initialSlot,
  selectedAppointment,
  calendarId,
  calendarName,
  isGoogleConnected,
  onClose,
  onSubmitDirect,
  onRequestGoogleConfirmation,
}) => {
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [procedureId, setProcedureId] = useState(DENTAL_PROCEDURES[0].id);
  const [providerId, setProviderId] = useState(DENTAL_PROVIDERS[0].id);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [isNewPatient, setIsNewPatient] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setError(null);
    if (selectedAppointment) {
      setPatientName(selectedAppointment.patientName);
      setPatientPhone(selectedAppointment.patientPhone);
      setPatientEmail(selectedAppointment.patientEmail ?? '');
      setProcedureId(selectedAppointment.procedureId ?? DENTAL_PROCEDURES[0].id);
      setProviderId(selectedAppointment.providerId);
      setDate(selectedAppointment.date);
      setStartTime(selectedAppointment.startTime);
      setIsNewPatient(selectedAppointment.isNewPatient);
      setNotes(selectedAppointment.notes ?? '');
    } else if (initialSlot) {
      setPatientName('');
      setPatientPhone('');
      setPatientEmail('');
      setProcedureId(DENTAL_PROCEDURES[0].id);
      setProviderId(initialSlot.providerId);
      setDate(initialSlot.date);
      setStartTime(initialSlot.startTime);
      setIsNewPatient(true);
      setNotes('');
    }
  }, [initialSlot, selectedAppointment, isOpen]);

  if (!isOpen) return null;

  const isEditing = Boolean(selectedAppointment);
  const chosenProcedure =
    DENTAL_PROCEDURES.find((p) => p.id === procedureId) ?? DENTAL_PROCEDURES[0];
  const chosenProvider =
    DENTAL_PROVIDERS.find((p) => p.id === providerId) ?? DENTAL_PROVIDERS[0];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!patientName.trim() || !patientPhone.trim() || !date || !startTime) {
      setError('Patient name, phone, date, and start time are required.');
      return;
    }

    const durationMinutes = selectedAppointment
      ? selectedAppointment.durationMinutes
      : chosenProcedure.durationMinutes;
    const endTime = minutesToTime(timeToMinutes(startTime) + durationMinutes);

    if (isGoogleConnected) {
      const action: PendingCalendarAction = {
        actionId: `manual-${Date.now()}`,
        source: 'manual',
        operation: isEditing ? 'reschedule' : 'create',
        calendarId,
        calendarName,
        summary: `Dental: ${isEditing ? selectedAppointment!.procedure : chosenProcedure.name} — ${patientName}`,
        date,
        startTime,
        endTime,
        durationMinutes,
        patientName,
        patientPhone,
        patientEmail: patientEmail || undefined,
        procedure: isEditing ? selectedAppointment!.procedure : chosenProcedure.name,
        providerId: chosenProvider.id,
        providerName: chosenProvider.name,
        operatory: chosenProvider.operatory,
        notes,
        isNewPatient,
        targetEventId: selectedAppointment?.googleEventId ?? selectedAppointment?.id,
        confirmationCode: selectedAppointment?.confirmationCode,
        previousDate: selectedAppointment?.date,
        previousStartTime: selectedAppointment?.startTime,
      };
      onRequestGoogleConfirmation(action, {
        mode: isEditing ? 'reschedule' : 'create',
        appointmentId: selectedAppointment?.id,
        patientName,
        patientPhone,
        patientEmail,
        procedureId,
        providerId,
        date,
        startTime,
        durationMinutes,
        isNewPatient,
        notes,
      });
      return;
    }

    try {
      setIsSaving(true);
      await onSubmitDirect({
        mode: isEditing ? 'reschedule' : 'create',
        appointmentId: selectedAppointment?.id,
        patientName,
        patientPhone,
        patientEmail: patientEmail || undefined,
        procedureId,
        providerId,
        date,
        startTime,
        durationMinutes,
        isNewPatient,
        notes,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save appointment.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelAppointment = async () => {
    if (!selectedAppointment) return;
    setError(null);

    if (isGoogleConnected) {
      const action: PendingCalendarAction = {
        actionId: `manual-del-${Date.now()}`,
        source: 'manual',
        operation: 'cancel',
        calendarId,
        calendarName,
        summary: `Dental: ${selectedAppointment.procedure} — ${selectedAppointment.patientName}`,
        date: selectedAppointment.date,
        startTime: selectedAppointment.startTime,
        endTime: selectedAppointment.endTime,
        durationMinutes: selectedAppointment.durationMinutes,
        patientName: selectedAppointment.patientName,
        patientPhone: selectedAppointment.patientPhone,
        procedure: selectedAppointment.procedure,
        providerId: selectedAppointment.providerId,
        providerName: selectedAppointment.providerName,
        operatory: selectedAppointment.operatory,
        targetEventId: selectedAppointment.googleEventId ?? selectedAppointment.id,
        confirmationCode: selectedAppointment.confirmationCode,
      };
      onRequestGoogleConfirmation(action, {
        mode: 'cancel',
        appointmentId: selectedAppointment.id,
      });
      return;
    }

    try {
      setIsSaving(true);
      await onSubmitDirect({
        mode: 'cancel',
        appointmentId: selectedAppointment.id,
        patientName: selectedAppointment.patientName,
        patientPhone: selectedAppointment.patientPhone,
        procedureId: selectedAppointment.procedureId ?? DENTAL_PROCEDURES[0].id,
        providerId: selectedAppointment.providerId,
        date: selectedAppointment.date,
        startTime: selectedAppointment.startTime,
        durationMinutes: selectedAppointment.durationMinutes,
        isNewPatient: selectedAppointment.isNewPatient,
        notes: selectedAppointment.notes ?? '',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel appointment.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {isEditing
                ? `Manage Visit · ${selectedAppointment?.confirmationCode}`
                : 'Book Dental Appointment'}
            </h2>
            <p className="text-xs text-slate-500">
              {isGoogleConnected
                ? `Syncs with Google Calendar (${calendarName})`
                : 'Clinic Preview Schedule'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close booking dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-xs font-medium text-slate-700">
              Patient Name
              <input
                type="text"
                required
                disabled={isEditing}
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="e.g. Jordan Rivera"
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-50"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Phone Number
              <input
                type="tel"
                required
                disabled={isEditing}
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                placeholder="(415) 555-0190"
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-50"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-xs font-medium text-slate-700">
              Procedure
              <select
                value={procedureId}
                disabled={isEditing}
                onChange={(e) => setProcedureId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none disabled:bg-slate-50"
              >
                {DENTAL_PROCEDURES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.durationMinutes}m)
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Provider
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                {DENTAL_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}, {p.credentials}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-xs font-medium text-slate-700">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" /> Date
              </span>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-slate-400" /> Start Time
              </span>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              >
                {Array.from({ length: 18 }, (_, i) => minutesToTime(8 * 60 + 30 + i * 30)).map(
                  (t) => (
                    <option key={t} value={t}>
                      {formatTime12h(t)}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          {!isEditing && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <label className="block text-xs font-medium text-slate-700">
                  Patient Email (Optional)
                  <input
                    type="email"
                    value={patientEmail}
                    onChange={(e) => setPatientEmail(e.target.value)}
                    placeholder="patient@example.com"
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </label>
                <label className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={isNewPatient}
                    onChange={(e) => setIsNewPatient(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                  />
                  New patient intake required
                </label>
              </div>

              <label className="block text-xs font-medium text-slate-700">
                Clinical Notes
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Sensitivity, insurance notes, or requested accommodations…"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                />
              </label>
            </>
          )}

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-3">
            {isEditing ? (
              <button
                type="button"
                onClick={handleCancelAppointment}
                disabled={isSaving}
                className="h-10 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Cancel Visit</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="h-10 rounded-lg bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 transition-colors disabled:opacity-60 whitespace-nowrap"
              >
                {isSaving
                  ? 'Saving…'
                  : isEditing
                    ? 'Reschedule Visit'
                    : 'Book Appointment'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
