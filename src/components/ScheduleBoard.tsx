import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Plus,
  Search,
} from 'lucide-react';
import {
  CLINIC_HOURS,
  DENTAL_PROVIDERS,
  formatTime12h,
  minutesToTime,
  timeToMinutes,
  type ClinicAppointment,
} from '../shared/clinicData';

export type ScheduleViewMode = 'day' | 'week' | 'list';

interface ScheduleBoardProps {
  selectedDate: string;
  onChangeDate: (date: string) => void;
  appointments: ClinicAppointment[];
  isLoading: boolean;
  error: string | null;
  isGoogleConnected: boolean;
  onSelectSlot: (providerId: string, date: string, startTime: string) => void;
  onSelectAppointment: (apt: ClinicAppointment) => void;
}

const HOUR_SLOTS = Array.from({ length: 18 }, (_, i) => {
  const mins = (CLINIC_HOURS.openHour * 60 + CLINIC_HOURS.openMinute) + i * 30;
  return minutesToTime(mins);
});

function shiftDate(iso: string, days: number): string {
  const dt = new Date(`${iso}T12:00:00`);
  dt.setDate(dt.getDate() + days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekDates(anchorIso: string): string[] {
  const dt = new Date(`${anchorIso}T12:00:00`);
  const day = dt.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(dt);
  monday.setDate(dt.getDate() + mondayOffset);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  });
}

function formatReadableDate(iso: string): string {
  const dt = new Date(`${iso}T12:00:00`);
  return dt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const ScheduleBoard: React.FC<ScheduleBoardProps> = ({
  selectedDate,
  onChangeDate,
  appointments,
  isLoading,
  error,
  isGoogleConnected,
  onSelectSlot,
  onSelectAppointment,
}) => {
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('day');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const todayIso = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
  }, []);

  const dayAppointments = useMemo(
    () =>
      appointments.filter(
        (a) =>
          a.date === selectedDate &&
          a.status !== 'cancelled' &&
          (providerFilter === 'all' || a.providerId === providerFilter),
      ),
    [appointments, selectedDate, providerFilter],
  );

  const filteredListAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return appointments
      .filter((a) => a.status !== 'cancelled')
      .filter((a) => providerFilter === 'all' || a.providerId === providerFilter)
      .filter((a) => {
        if (!q) return true;
        return (
          a.patientName.toLowerCase().includes(q) ||
          a.procedure.toLowerCase().includes(q) ||
          a.confirmationCode.toLowerCase().includes(q) ||
          a.providerName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
  }, [appointments, providerFilter, searchQuery]);

  const visibleProviders = useMemo(
    () =>
      providerFilter === 'all'
        ? DENTAL_PROVIDERS
        : DENTAL_PROVIDERS.filter((p) => p.id === providerFilter),
    [providerFilter],
  );

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const selectedDayOfWeek = new Date(`${selectedDate}T12:00:00`).getDay();
  const isSunday = selectedDayOfWeek === 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="border-b border-slate-200 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => onChangeDate(shiftDate(selectedDate, -1))}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onChangeDate(todayIso)}
              className="h-8 px-3 text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-900 rounded-md transition-colors whitespace-nowrap"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => onChangeDate(shiftDate(selectedDate, 1))}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              {formatReadableDate(selectedDate)}
            </h2>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && onChangeDate(e.target.value)}
              aria-label="Jump to date"
              className="h-8 rounded-lg border border-slate-200 px-2 text-xs font-mono text-slate-600 focus:border-teal-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            aria-label="Filter by dentist"
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-teal-600 focus:outline-none"
          >
            <option value="all">All Providers (3)</option>
            {DENTAL_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center rounded-lg bg-slate-100 p-1">
            {(
              [
                { id: 'day', label: 'Provider Grid' },
                { id: 'week', label: 'Week' },
                { id: 'list', label: 'List' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setViewMode(tab.id)}
                className={`h-7 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary metrics row (unboxed tabular figures with clean dividers) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border-b border-slate-200 bg-slate-50/60">
        <div className="px-5 py-3">
          <div className="text-xs text-slate-500">Scheduled Visits</div>
          <div className="mt-0.5 text-lg font-semibold font-mono text-slate-900 tabular-nums">
            {dayAppointments.length}
          </div>
        </div>
        <div className="px-5 py-3">
          <div className="text-xs text-slate-500">Voice AI Booked</div>
          <div className="mt-0.5 text-lg font-semibold font-mono text-teal-700 tabular-nums">
            {dayAppointments.filter((a) => a.source === 'voice-ai').length}
          </div>
        </div>
        <div className="px-5 py-3">
          <div className="text-xs text-slate-500">Clinic Hours</div>
          <div className="mt-0.5 text-sm font-medium font-mono text-slate-800 tabular-nums">
            {isSunday ? 'Closed (Sunday)' : '08:30 – 17:30'}
          </div>
        </div>
        <div className="px-5 py-3">
          <div className="text-xs text-slate-500">Calendar Backend</div>
          <div className="mt-0.5 text-sm font-medium text-slate-800">
            {isGoogleConnected ? 'Google Calendar Live' : 'Clinic Preview'}
          </div>
        </div>
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Day Provider Grid */}
      {viewMode === 'day' && (
        <div className="overflow-x-auto">
          {isSunday ? (
            <div className="px-6 py-16 text-center">
              <p className="text-base font-medium text-slate-900">
                Dant Anand is closed on Sundays
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Select Monday through Saturday to view provider chairs or schedule a patient visit.
              </p>
              <button
                type="button"
                onClick={() => onChangeDate(shiftDate(selectedDate, 1))}
                className="mt-4 h-9 rounded-lg bg-teal-600 px-4 text-xs font-medium text-white hover:bg-teal-700 transition-colors"
              >
                Jump to Monday
              </button>
            </div>
          ) : (
            <div className="min-w-[720px]">
              {/* Provider Column Headers */}
              <div
                className="grid border-b border-slate-200 bg-slate-50/40"
                style={{
                  gridTemplateColumns: `84px repeat(${visibleProviders.length}, minmax(0, 1fr))`,
                }}
              >
                <div className="px-3 py-3 text-xs font-medium text-slate-500 border-r border-slate-200">
                  Time
                </div>
                {visibleProviders.map((prov) => (
                  <div
                    key={prov.id}
                    className="px-4 py-3 border-r last:border-r-0 border-slate-200 flex items-center gap-3"
                  >
                    <img
                      src={prov.avatarUrl}
                      alt={`${prov.name}, ${prov.credentials}`}
                      referrerPolicy="no-referrer"
                      className="h-9 w-9 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {prov.name}, {prov.credentials}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {prov.operatory} · {prov.specialty}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Time Rows */}
              <div className="divide-y divide-slate-100">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="grid h-12 animate-pulse"
                      style={{
                        gridTemplateColumns: `84px repeat(${visibleProviders.length}, minmax(0, 1fr))`,
                      }}
                    >
                      <div className="px-3 py-3 border-r border-slate-200 bg-slate-50/40" />
                      {visibleProviders.map((p) => (
                        <div key={p.id} className="p-2 border-r last:border-r-0 border-slate-100">
                          <div className="h-7 rounded bg-slate-100" />
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  HOUR_SLOTS.map((slotTime) => {
                    const slotStartMin = timeToMinutes(slotTime);
                    const isHourMark = slotTime.endsWith(':00');

                    return (
                      <div
                        key={slotTime}
                        className="grid min-h-[54px]"
                        style={{
                          gridTemplateColumns: `84px repeat(${visibleProviders.length}, minmax(0, 1fr))`,
                        }}
                      >
                        <div
                          className={`px-3 py-2 border-r border-slate-200 font-mono text-xs tabular-nums ${
                            isHourMark
                              ? 'font-medium text-slate-700 bg-slate-50/50'
                              : 'text-slate-400'
                          }`}
                        >
                          {formatTime12h(slotTime)}
                        </div>

                        {visibleProviders.map((prov) => {
                          const startingHere = dayAppointments.find((apt) => {
                            if (apt.providerId !== prov.id) return false;
                            const aptStart = timeToMinutes(apt.startTime);
                            return aptStart >= slotStartMin && aptStart < slotStartMin + 30;
                          });

                          const occupiedThrough = dayAppointments.find((apt) => {
                            if (apt.providerId !== prov.id) return false;
                            const aptStart = timeToMinutes(apt.startTime);
                            const aptEnd = timeToMinutes(apt.endTime);
                            return aptStart < slotStartMin && aptEnd > slotStartMin;
                          });

                          if (startingHere) {
                            const isVoice = startingHere.source === 'voice-ai';
                            return (
                              <div
                                key={prov.id}
                                className="p-1.5 border-r last:border-r-0 border-slate-100"
                              >
                                <button
                                  type="button"
                                  onClick={() => onSelectAppointment(startingHere)}
                                  className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                                    isVoice
                                      ? 'border-teal-200 bg-teal-50/70 hover:bg-teal-50'
                                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100/80'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-slate-900 truncate">
                                      {startingHere.patientName}
                                    </span>
                                    <span className="font-mono text-[11px] font-medium text-slate-600 shrink-0 tabular-nums">
                                      {startingHere.confirmationCode}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-xs text-slate-600 truncate">
                                    {startingHere.procedure}
                                  </div>
                                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 font-mono tabular-nums">
                                    <span>
                                      {formatTime12h(startingHere.startTime)} –{' '}
                                      {formatTime12h(startingHere.endTime)}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    <span>
                                      {startingHere.source === 'voice-ai'
                                        ? 'Voice AI'
                                        : startingHere.source === 'google-calendar'
                                          ? 'Google Cal'
                                          : 'Desk'}
                                    </span>
                                  </div>
                                </button>
                              </div>
                            );
                          }

                          if (occupiedThrough) {
                            return (
                              <div
                                key={prov.id}
                                className="px-3 py-2 border-r last:border-r-0 border-slate-100 bg-slate-50/40 flex items-center"
                              >
                                <span className="text-[11px] text-slate-400 truncate">
                                  In chair · {occupiedThrough.patientName}
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={prov.id}
                              className="p-1 border-r last:border-r-0 border-slate-100 group"
                            >
                              <button
                                type="button"
                                onClick={() => onSelectSlot(prov.id, selectedDate, slotTime)}
                                className="w-full h-full min-h-[42px] rounded-md flex items-center justify-between px-2.5 text-xs text-transparent group-hover:text-teal-700 group-hover:bg-teal-50/50 transition-colors"
                              >
                                <span>Book {formatTime12h(slotTime)}</span>
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Week Overview */}
      {viewMode === 'week' && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {weekDates.map((d) => {
            const dt = new Date(`${d}T12:00:00`);
            const list = appointments
              .filter((a) => a.date === d && a.status !== 'cancelled')
              .filter((a) => providerFilter === 'all' || a.providerId === providerFilter)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));
            const isSelected = d === selectedDate;

            return (
              <div key={d} className={`min-h-[340px] flex flex-col ${isSelected ? 'bg-teal-50/25' : ''}`}>
                <button
                  type="button"
                  onClick={() => {
                    onChangeDate(d);
                    setViewMode('day');
                  }}
                  className="w-full text-left border-b border-slate-200 px-3.5 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="text-xs font-medium text-slate-500">
                    {dt.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between">
                    <span
                      className={`text-sm font-semibold font-mono tabular-nums ${
                        isSelected ? 'text-teal-700' : 'text-slate-900'
                      }`}
                    >
                      {dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-xs font-mono text-slate-500 tabular-nums">
                      {list.length} visits
                    </span>
                  </div>
                </button>

                <div className="p-2.5 space-y-2 flex-1">
                  {list.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">Open schedule</div>
                  ) : (
                    list.map((apt) => (
                      <button
                        key={apt.id}
                        type="button"
                        onClick={() => onSelectAppointment(apt)}
                        className="w-full text-left rounded-lg border border-slate-200 bg-white p-2.5 hover:border-teal-300 transition-colors"
                      >
                        <div className="font-mono text-[11px] font-medium text-teal-700 tabular-nums">
                          {formatTime12h(apt.startTime)}
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-900 truncate">
                          {apt.patientName}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{apt.procedure}</div>
                        <div className="mt-1 text-[11px] text-slate-400 truncate">
                          {apt.providerName}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* High-Density List View */}
      {viewMode === 'list' && (
        <div>
          <div className="border-b border-slate-200 px-5 py-3 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patient, code, or procedure…"
                className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
              />
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {filteredListAppointments.length} scheduled
            </span>
          </div>

          {filteredListAppointments.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-medium text-slate-800">No matching appointments found</p>
              <p className="mt-1 text-xs text-slate-500">
                Try clearing your search filter or book a visit via Voice AI or the New Appointment button.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Code</th>
                    <th className="py-2.5 px-4">Date &amp; Time</th>
                    <th className="py-2.5 px-4">Patient</th>
                    <th className="py-2.5 px-4">Procedure</th>
                    <th className="py-2.5 px-4">Provider</th>
                    <th className="py-2.5 px-4">Source</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredListAppointments.map((apt) => (
                    <tr
                      key={apt.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-700 tabular-nums whitespace-nowrap">
                        {apt.confirmationCode}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-800 tabular-nums whitespace-nowrap">
                        {apt.date} · {formatTime12h(apt.startTime)} ({apt.durationMinutes}m)
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{apt.patientName}</div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums">
                          {apt.patientPhone}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 max-w-[220px] truncate">
                        {apt.procedure}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">
                        {apt.providerName}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {apt.source === 'voice-ai'
                          ? 'Voice AI'
                          : apt.source === 'google-calendar'
                            ? 'Google Calendar'
                            : 'Front Desk'}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectAppointment(apt)}
                            className="text-xs font-medium text-teal-700 hover:underline"
                          >
                            Manage
                          </button>
                          <a
                            href={`/api/appointments/${encodeURIComponent(apt.id)}/ics?date=${encodeURIComponent(
                              apt.date,
                            )}&startTime=${encodeURIComponent(
                              apt.startTime,
                            )}&endTime=${encodeURIComponent(
                              apt.endTime,
                            )}&summary=${encodeURIComponent(
                              `Dental: ${apt.procedure} — ${apt.patientName}`,
                            )}&location=${encodeURIComponent(
                              `Dant Anand · ${apt.operatory}`,
                            )}`}
                            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"
                            title="Download .ics calendar file"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                          {apt.htmlLink && (
                            <a
                              href={apt.htmlLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center text-xs text-slate-500 hover:text-slate-900"
                              title="Open in Google Calendar"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
