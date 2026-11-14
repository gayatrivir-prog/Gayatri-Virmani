import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Send,
  Trash2,
  Volume2,
} from 'lucide-react';
import { formatTime12h, type ClinicAppointment } from '../shared/clinicData';
import type {
  LiveConnectionState,
  PipelineEvent,
  TranscriptTurn,
} from '../hooks/useGeminiLive';

interface VoiceDeskPanelProps {
  connectionState: LiveConnectionState;
  errorMessage: string | null;
  isMuted: boolean;
  onToggleMute: () => void;
  isAiSpeaking: boolean;
  micLevel: number;
  outputLevel: number;
  transcripts: TranscriptTurn[];
  pipelineEvents: PipelineEvent[];
  lastBookedAppointment: ClinicAppointment | null;
  onStartSession: (voiceName: string) => void;
  onStopSession: () => void;
  onSendTextTurn: (text: string) => void;
  onClearLog: () => void;
}

const SAMPLE_PATIENT_UTERANCES = [
  'Hi, I need a routine teeth cleaning with Dr. Evans tomorrow at 10:00 AM. My name is Maya Patel, 415-555-0192.',
  'I have a sharp toothache on my lower molar—do you have any emergency openings today?',
  'Can I check my existing appointment for Marcus Vance?',
];

export const VoiceDeskPanel: React.FC<VoiceDeskPanelProps> = ({
  connectionState,
  errorMessage,
  isMuted,
  onToggleMute,
  isAiSpeaking,
  micLevel,
  outputLevel,
  transcripts,
  pipelineEvents,
  lastBookedAppointment,
  onStartSession,
  onStopSession,
  onSendTextTurn,
  onClearLog,
}) => {
  const [voiceName, setVoiceName] = useState('Zephyr');
  const [textInput, setTextInput] = useState('');
  const [activeTab, setActiveTab] = useState<'transcript' | 'pipeline'>('transcript');
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const isLive = connectionState === 'live';
  const isConnecting = connectionState === 'connecting';

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || !isLive) return;
    onSendTextTurn(textInput);
    setTextInput('');
  };

  const activeLevel = isAiSpeaking ? outputLevel : micLevel;
  const barHeights = Array.from({ length: 18 }, (_, i) => {
    const centerBias = 1 - Math.abs(i - 8.5) / 9.5;
    const harmonic = Math.abs(Math.sin((i + 1) * 0.9 + activeLevel * 10));
    const heightPct = isLive
      ? Math.max(14, Math.min(100, Math.round((0.18 + activeLevel * 0.95 * centerBias * harmonic) * 100)))
      : 14;
    return heightPct;
  });

  return (
    <aside className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Live Voice Receptionist
          </h2>
          <p className="text-xs text-slate-500">
            Gemini Live real-time audio &amp; calendar parsing
          </p>
        </div>

        <div className="text-xs font-medium">
          {connectionState === 'live' ? (
            <span className="text-teal-700">
              {isAiSpeaking ? 'Speaking' : isMuted ? 'Mic Muted' : 'Listening'}
            </span>
          ) : connectionState === 'connecting' ? (
            <span className="text-amber-700">Connecting…</span>
          ) : connectionState === 'error' ? (
            <span className="text-red-600">Attention</span>
          ) : (
            <span className="text-slate-500">Standby</span>
          )}
        </div>
      </div>

      {/* Audio Engine & Controls */}
      <div className="border-b border-slate-200 bg-slate-50/70 p-5 space-y-4">
        {/* Real-time Audio Waveform */}
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs text-slate-600 shrink-0">
            {isAiSpeaking ? (
              <Volume2 className="h-4 w-4 text-teal-600" />
            ) : (
              <Mic className={`h-4 w-4 ${isLive && !isMuted ? 'text-teal-600' : 'text-slate-400'}`} />
            )}
            <span className="font-medium text-slate-800">
              {isLive
                ? isAiSpeaking
                  ? 'Coordinator Output (24 kHz)'
                  : isMuted
                    ? 'Patient Mic Muted'
                    : 'Patient Mic (16 kHz)'
                : 'Audio Stream Idle'}
            </span>
          </div>

          <div className="flex items-center gap-1 h-8" aria-hidden="true">
            {barHeights.map((h, idx) => (
              <span
                key={idx}
                className={`w-1 rounded-full transition-[height] duration-100 ${
                  isLive
                    ? isAiSpeaking
                      ? 'bg-teal-600'
                      : isMuted
                        ? 'bg-slate-300'
                        : 'bg-slate-800'
                    : 'bg-slate-200'
                }`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        {/* Primary Session Actions */}
        <div className="flex items-center gap-2.5">
          {!isLive && !isConnecting ? (
            <>
              <select
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                aria-label="Receptionist voice"
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-teal-600 focus:outline-none"
              >
                <option value="Zephyr">Voice: Zephyr</option>
                <option value="Kore">Voice: Kore</option>
                <option value="Puck">Voice: Puck</option>
                <option value="Charon">Voice: Charon</option>
              </select>
              <button
                type="button"
                onClick={() => onStartSession(voiceName)}
                className="flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 transition-colors whitespace-nowrap"
              >
                <PhoneCall className="h-4 w-4" />
                <span>Start Voice Call</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleMute}
                disabled={!isLive}
                className={`h-10 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  isMuted
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                <span>{isMuted ? 'Unmute' : 'Mute'}</span>
              </button>
              <button
                type="button"
                onClick={onStopSession}
                className="flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 transition-colors whitespace-nowrap"
              >
                <PhoneOff className="h-4 w-4" />
                <span>{isConnecting ? 'Cancel' : 'End Call'}</span>
              </button>
            </>
          )}
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorMessage}
          </div>
        )}

        {lastBookedAppointment && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
            <div className="min-w-0 text-xs">
              <div className="font-semibold text-emerald-900">
                Booked · {lastBookedAppointment.confirmationCode}
              </div>
              <div className="text-emerald-800 truncate">
                {lastBookedAppointment.patientName} · {lastBookedAppointment.date} at{' '}
                {formatTime12h(lastBookedAppointment.startTime)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sub-navigation between Transcript and Parsed Pipeline */}
      <div className="border-b border-slate-200 px-5 py-2 flex items-center justify-between">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('transcript')}
            className={`h-7 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'transcript'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Transcript ({transcripts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pipeline')}
            className={`h-7 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'pipeline'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tool Pipeline ({pipelineEvents.length})
          </button>
        </div>

        {(transcripts.length > 0 || pipelineEvents.length > 0) && (
          <button
            type="button"
            onClick={onClearLog}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700"
            title="Clear session log"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Scrollable Transcript or Tool Trace */}
      <div className="flex-1 min-h-[300px] max-h-[380px] overflow-y-auto p-5 space-y-3">
        {activeTab === 'transcript' ? (
          transcripts.length === 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 leading-relaxed">
                Start a voice call to speak naturally with Maya, Dant Anand&apos;s Gemini Live
                coordinator. She checks real-time slot availability, parses treatment needs, and
                syncs confirmed bookings to Google Calendar.
              </p>
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-slate-700">
                  Sample patient requests (available once call is active):
                </div>
                {SAMPLE_PATIENT_UTERANCES.map((sample, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={!isLive}
                    onClick={() => onSendTextTurn(sample)}
                    className="w-full text-left rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 hover:border-teal-300 hover:bg-teal-50/40 transition-colors disabled:opacity-55 disabled:cursor-not-allowed"
                  >
                    &ldquo;{sample}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {transcripts.map((turn) => (
                <div
                  key={turn.id}
                  className={`rounded-lg border px-3.5 py-2.5 text-sm ${
                    turn.speaker === 'patient'
                      ? 'border-slate-200 bg-slate-50 ml-4'
                      : 'border-teal-200 bg-teal-50/50 mr-4'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">
                      {turn.speaker === 'patient' ? 'Patient' : 'Maya (Coordinator)'}
                    </span>
                    <span className="font-mono tabular-nums">{turn.timestamp}</span>
                  </div>
                  <p className="mt-1 text-slate-800 leading-relaxed">{turn.text}</p>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </>
          )
        ) : pipelineEvents.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            Parsed Gemini Live scheduling calls (`check_availability`, `book_appointment`,
            `reschedule_appointment`) will appear here in real time.
          </div>
        ) : (
          pipelineEvents.map((ev) => (
            <div
              key={ev.id}
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-slate-900">{ev.toolName}</span>
                <span className="font-mono text-slate-500 tabular-nums">
                  {ev.stage === 'tool_start'
                    ? 'Executing…'
                    : `${ev.durationMs ?? 0} ms`}
                </span>
              </div>
              {ev.args && Object.keys(ev.args).length > 0 && (
                <pre className="overflow-x-auto rounded bg-white border border-slate-200 p-2 font-mono text-[11px] text-slate-700">
                  {JSON.stringify(ev.args, null, 2)}
                </pre>
              )}
              {ev.result && (
                <pre className="overflow-x-auto rounded bg-white border border-slate-200 p-2 font-mono text-[11px] text-teal-800">
                  {JSON.stringify(ev.result, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
      </div>

      {/* Text Turn Input Bar */}
      <form
        onSubmit={handleSendText}
        className="border-t border-slate-200 p-3 bg-slate-50/50 flex items-center gap-2"
      >
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          disabled={!isLive}
          placeholder={
            isLive
              ? 'Type a patient message or speak into mic…'
              : 'Start voice call to speak or type…'
          }
          className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={!isLive || !textInput.trim()}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors disabled:opacity-40"
          aria-label="Send message to live session"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </aside>
  );
};
