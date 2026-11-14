import React from 'react';
import { CalendarCheck, AlertTriangle, X } from 'lucide-react';
import { formatTime12h, type PendingCalendarAction } from '../shared/clinicData';

interface ConfirmationDialogProps {
  action: PendingCalendarAction | null;
  isSubmitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  action,
  isSubmitting = false,
  onConfirm,
  onCancel,
}) => {
  if (!action) return null;

  const isCancel = action.operation === 'cancel';
  const title =
    action.operation === 'create'
      ? 'Confirm Google Calendar Event Creation'
      : action.operation === 'reschedule'
        ? 'Confirm Google Calendar Reschedule'
        : 'Confirm Google Calendar Cancellation';

  const confirmLabel =
    action.operation === 'create'
      ? 'Confirm & Add to Google Calendar'
      : action.operation === 'reschedule'
        ? 'Confirm & Update Google Calendar'
        : 'Confirm & Delete from Google Calendar';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gcal-confirm-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                isCancel ? 'bg-red-50 text-red-600' : 'bg-teal-50 text-teal-700'
              }`}
            >
              {isCancel ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <CalendarCheck className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 id="gcal-confirm-title" className="text-base font-semibold text-slate-900">
                {title}
              </h2>
              <p className="text-xs text-slate-500">
                {action.source === 'voice-ai'
                  ? 'Requested by Gemini Live Voice Receptionist'
                  : 'Requested from Front-Desk Schedule'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close confirmation dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-600">
            {isCancel
              ? 'This action will permanently remove the patient appointment event from your connected Google Calendar.'
              : action.operation === 'reschedule'
                ? 'This action will update the existing appointment date and time on your connected Google Calendar.'
                : 'Review the parsed patient appointment details before creating the event on your connected Google Calendar.'}
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2.5 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Calendar</span>
              <span className="font-medium text-slate-900 text-right">{action.calendarName}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Event Title</span>
              <span className="font-medium text-slate-900 text-right">{action.summary}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Patient</span>
              <span className="font-medium text-slate-900 text-right">
                {action.patientName}
                {action.patientPhone ? ` · ${action.patientPhone}` : ''}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Provider &amp; Room</span>
              <span className="font-medium text-slate-900 text-right">
                {action.providerName} · {action.operatory}
              </span>
            </div>
            {action.operation === 'reschedule' && action.previousDate && action.previousStartTime && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Previous Slot</span>
                <span className="font-mono text-slate-500 line-through text-right">
                  {action.previousDate} · {formatTime12h(action.previousStartTime)}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">
                {isCancel ? 'Scheduled Slot' : action.operation === 'reschedule' ? 'New Slot' : 'Date & Time'}
              </span>
              <span className="font-mono font-medium text-slate-900 text-right">
                {action.date} · {formatTime12h(action.startTime)} – {formatTime12h(action.endTime)} ({action.durationMinutes} min)
              </span>
            </div>
            {action.confirmationCode && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Confirmation Code</span>
                <span className="font-mono font-semibold text-teal-700 text-right">
                  {action.confirmationCode}
                </span>
              </div>
            )}
            {action.notes && (
              <div className="pt-2 border-t border-slate-200 text-xs text-slate-600">
                <span className="font-medium text-slate-700">Notes: </span>
                {action.notes}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className={`h-10 rounded-lg px-4 text-sm font-medium text-white transition-colors whitespace-nowrap disabled:opacity-60 ${
              isCancel ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {isSubmitting ? 'Syncing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
