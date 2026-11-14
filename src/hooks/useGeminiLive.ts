import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClinicAppointment, PendingCalendarAction } from '../shared/clinicData';

export interface TranscriptTurn {
  id: string;
  speaker: 'patient' | 'receptionist';
  text: string;
  timestamp: string;
}

export interface PipelineEvent {
  id: string;
  stage: 'tool_start' | 'tool_result';
  toolName: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  durationMs?: number;
  timestamp: string;
}

export type LiveConnectionState = 'idle' | 'connecting' | 'live' | 'error';

interface UseGeminiLiveOptions {
  accessToken: string | null;
  calendarId: string;
  calendarName: string;
  onCalendarUpdated: () => void;
}

function float32ToBase64Pcm16(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = view.getInt16(i * 2, true) / 32768;
  }
  return samples;
}

function computeRms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i];
  }
  return Math.min(1, Math.sqrt(sum / Math.max(1, samples.length)) * 3.5);
}

export function useGeminiLive(options: UseGeminiLiveOptions) {
  const { accessToken, calendarId, calendarName, onCalendarUpdated } = options;

  const [connectionState, setConnectionState] = useState<LiveConnectionState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [transcripts, setTranscripts] = useState<TranscriptTurn[]>([]);
  const [pipelineEvents, setPipelineEvents] = useState<PipelineEvent[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingCalendarAction | null>(null);
  const [lastBookedAppointment, setLastBookedAppointment] = useState<ClinicAppointment | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMutedRef = useRef(false);
  const onCalendarUpdatedRef = useRef(onCalendarUpdated);
  const authRef = useRef({ accessToken, calendarId, calendarName });

  useEffect(() => {
    onCalendarUpdatedRef.current = onCalendarUpdated;
  }, [onCalendarUpdated]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    authRef.current = { accessToken, calendarId, calendarName };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'auth_update',
          accessToken,
          calendarId,
          calendarName,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles',
        }),
      );
    }
  }, [accessToken, calendarId, calendarName]);

  const stopOutputPlayback = useCallback(() => {
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Ignore already stopped sources
      }
    }
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setIsAiSpeaking(false);
    setOutputLevel(0);
  }, []);

  const schedulePcmPlayback = useCallback((base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const samples = base64Pcm16ToFloat32(base64Audio);
    setOutputLevel(computeRms(samples));
    setIsAiSpeaking(true);

    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.copyToChannel(new Float32Array(samples), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.02, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setIsAiSpeaking(false);
        setOutputLevel(0);
      }
    };
  }, []);

  const appendTranscript = useCallback((speaker: 'patient' | 'receptionist', text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTranscripts((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        const needsSpace =
          !last.text.endsWith(' ') &&
          !trimmed.startsWith(' ') &&
          !/^[.,!?;:]/.test(trimmed);
        const updated = {
          ...last,
          text: `${last.text}${needsSpace ? ' ' : ''}${trimmed}`,
        };
        return [...prev.slice(0, -1), updated];
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          speaker,
          text: trimmed,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        },
      ];
    });
  }, []);

  const cleanupAudioAndSocket = useCallback(() => {
    stopOutputPlayback();
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    if (inputCtxRef.current) {
      void inputCtxRef.current.close();
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      void outputCtxRef.current.close();
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'stop' }));
        }
        wsRef.current.close();
      } catch {
        // Ignore close errors
      }
      wsRef.current = null;
    }
    setMicLevel(0);
    setOutputLevel(0);
    setIsAiSpeaking(false);
  }, [stopOutputPlayback]);

  const stopSession = useCallback(() => {
    cleanupAudioAndSocket();
    setPendingAction(null);
    setConnectionState('idle');
  }, [cleanupAudioAndSocket]);

  const startSession = useCallback(
    async (voiceName = 'Zephyr', enableMicrophone = true) => {
      cleanupAudioAndSocket();
      setErrorMessage(null);
      setConnectionState('connecting');

      try {
        const outputCtx = new AudioContext({ sampleRate: 24000 });
        outputCtxRef.current = outputCtx;

        if (enableMicrophone && navigator.mediaDevices?.getUserMedia) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
            mediaStreamRef.current = stream;

            const inputCtx = new AudioContext({ sampleRate: 16000 });
            inputCtxRef.current = inputCtx;
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(2048, 1, 1);
            processorRef.current = processor;

            // Connect through a zero-gain node to prevent local mic echo
            const silentGain = inputCtx.createGain();
            silentGain.gain.value = 0;

            source.connect(processor);
            processor.connect(silentGain);
            silentGain.connect(inputCtx.destination);

            processor.onaudioprocess = (event) => {
              if (isMutedRef.current) {
                setMicLevel(0);
                return;
              }
              const channel = event.inputBuffer.getChannelData(0);
              setMicLevel(computeRms(channel));
              const ws = wsRef.current;
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'audio',
                    data: float32ToBase64Pcm16(channel),
                  }),
                );
              }
            };
          } catch {
            // Mic permission denied or unavailable: keep session alive for text turn testing
            setErrorMessage('Microphone unavailable — connected in text + audio playback mode.');
          }
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live`);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: 'start',
              voiceName,
              accessToken: authRef.current.accessToken,
              calendarId: authRef.current.calendarId,
              calendarName: authRef.current.calendarName,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles',
            }),
          );
        };

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            data?: string;
            text?: string;
            message?: string;
            stage?: 'tool_start' | 'tool_result';
            toolName?: string;
            args?: Record<string, unknown>;
            result?: Record<string, unknown>;
            durationMs?: number;
            timestamp?: string;
            action?: PendingCalendarAction;
            appointment?: ClinicAppointment;
          };

          if (msg.type === 'ready') {
            setConnectionState('live');
          } else if (msg.type === 'audio' && msg.data) {
            schedulePcmPlayback(msg.data);
          } else if (msg.type === 'interrupted') {
            stopOutputPlayback();
          } else if (msg.type === 'input_transcript' && msg.text) {
            appendTranscript('patient', msg.text);
          } else if (msg.type === 'output_transcript' && msg.text) {
            appendTranscript('receptionist', msg.text);
          } else if (msg.type === 'pipeline_event' && msg.toolName && msg.stage) {
            setPipelineEvents((prev) => [
              {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                stage: msg.stage!,
                toolName: msg.toolName!,
                args: msg.args,
                result: msg.result,
                durationMs: msg.durationMs,
                timestamp: msg.timestamp ?? new Date().toISOString(),
              },
              ...prev.slice(0, 29),
            ]);
          } else if (msg.type === 'pending_confirmation' && msg.action) {
            setPendingAction(msg.action);
          } else if (msg.type === 'calendar_updated') {
            if (msg.appointment) {
              setLastBookedAppointment(msg.appointment);
            }
            onCalendarUpdatedRef.current();
          } else if (msg.type === 'error') {
            setErrorMessage(msg.message ?? 'Gemini Live pipeline error.');
            setConnectionState('error');
          } else if (msg.type === 'closed') {
            setConnectionState('idle');
          }
        };

        ws.onerror = () => {
          setErrorMessage('WebSocket connection to Gemini Live pipeline failed.');
          setConnectionState('error');
        };

        ws.onclose = () => {
          setConnectionState((prev) => (prev === 'error' ? 'error' : 'idle'));
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to start voice session.';
        setErrorMessage(msg);
        setConnectionState('error');
      }
    },
    [appendTranscript, cleanupAudioAndSocket, schedulePcmPlayback, stopOutputPlayback],
  );

  const sendTextTurn = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text: trimmed }));
    }
  }, []);

  const resolvePendingAction = useCallback((actionId: string, approved: boolean) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'confirm_action',
          actionId,
          approved,
        }),
      );
    }
    setPendingAction(null);
  }, []);

  const clearSessionLog = useCallback(() => {
    setTranscripts([]);
    setPipelineEvents([]);
    setLastBookedAppointment(null);
  }, []);

  useEffect(() => {
    return () => {
      cleanupAudioAndSocket();
    };
  }, [cleanupAudioAndSocket]);

  return {
    connectionState,
    errorMessage,
    isMuted,
    setIsMuted,
    isAiSpeaking,
    micLevel,
    outputLevel,
    transcripts,
    pipelineEvents,
    pendingAction,
    lastBookedAppointment,
    startSession,
    stopSession,
    sendTextTurn,
    resolvePendingAction,
    clearSessionLog,
  };
}
