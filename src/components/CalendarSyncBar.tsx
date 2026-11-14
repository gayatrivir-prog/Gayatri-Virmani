import React from 'react';
import { Calendar, LogOut, RefreshCw } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { GoogleCalendarSummary } from '../shared/clinicData';
import { GoogleSignInButton } from './GoogleSignInButton';

interface CalendarSyncBarProps {
  user: User | null;
  accessToken: string | null;
  isLoggingIn: boolean;
  isSyncing: boolean;
  calendars: GoogleCalendarSummary[];
  selectedCalendarId: string;
  onSelectCalendar: (id: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onRefresh: () => void;
  authError: string | null;
}

export const CalendarSyncBar: React.FC<CalendarSyncBarProps> = ({
  user,
  accessToken,
  isLoggingIn,
  isSyncing,
  calendars,
  selectedCalendarId,
  onSelectCalendar,
  onSignIn,
  onSignOut,
  onRefresh,
  authError,
}) => {
  const isConnected = Boolean(accessToken);

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-2.5">
      <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
          {isConnected ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span className="font-medium text-emerald-700">Google Calendar Connected</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-slate-600 truncate max-w-[220px]">
                {user?.email ?? 'Authorized Account'}
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-xs text-slate-500">Live availability &amp; event sync active</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span className="font-medium text-slate-900">Clinic Preview Schedule</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-slate-500">
                Sign in with Google to sync patient bookings directly with your Google Calendar
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {authError && (
            <span className="text-xs text-red-600 max-w-[260px] truncate" title={authError}>
              {authError}
            </span>
          )}

          {isConnected ? (
            <>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <span className="whitespace-nowrap">Target Calendar</span>
                <select
                  value={selectedCalendarId}
                  onChange={(e) => onSelectCalendar(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-800 focus:border-teal-600 focus:outline-none"
                >
                  {calendars.length === 0 ? (
                    <option value="primary">Primary Calendar</option>
                  ) : (
                    calendars.map((cal) => (
                      <option key={cal.id} value={cal.id}>
                        {cal.primary ? `${cal.summary} (Primary)` : cal.summary}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <button
                type="button"
                onClick={onRefresh}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sync</span>
              </button>

              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </>
          ) : (
            <GoogleSignInButton
              onClick={onSignIn}
              disabled={isLoggingIn}
              label={isLoggingIn ? 'Connecting…' : 'Sign in with Google'}
            />
          )}
        </div>
      </div>
    </div>
  );
};
