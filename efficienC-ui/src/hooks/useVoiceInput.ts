/**
 * useVoiceInput
 *
 * Encapsulates the entire Web Speech API lifecycle so it can be swapped out
 * later for Whisper, AssemblyAI, Deepgram, or a MediaRecorder approach
 * without touching any UI code.
 *
 * To replace the provider:
 *   1. Duplicate this file (e.g. useWhisperInput.ts)
 *   2. Implement the same UseVoiceInputResult interface
 *   3. Swap the import in CommandInput.tsx
 */

import { useState, useRef, useEffect } from "react";

// ── Minimal Web Speech API surface we actually use ────────────────────────────

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as Window & { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
    (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition ??
    null
  );
}

// ── Timing constants ──────────────────────────────────────────────────────────

/** Hard cap on total listening time before auto-stop */
const SAFETY_TIMEOUT_MS = 12_000;

/**
 * Gap between recognition instances.
 * Must exceed Chrome's mic-release latency (~200–300 ms) or start() will throw.
 */
const RESTART_DELAY_MS = 450;

/**
 * Delay before the very first start() call after the user clicks the mic.
 * Prevents Chrome from immediately firing "no-speech" during pipeline warm-up.
 */
const INITIAL_DELAY_MS = 200;

/**
 * If an instance ends in under this many ms, Chrome stopped unusually fast.
 * We add proportional extra delay before restarting to avoid mic collisions.
 */
const MIN_INSTANCE_MS = 1_200;

// ── Public interface ──────────────────────────────────────────────────────────

export interface UseVoiceInputResult {
  /** True while the session is active (survives instance restarts — no flicker) */
  isListening: boolean;
  /** False when the browser does not support SpeechRecognition */
  isSupported: boolean;
  /** Start if idle, stop if listening */
  toggle: () => void;
  /** Explicitly end the session */
  stop: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceInput(
  /** Called once with the final transcript when speech is captured */
  onTranscript: (text: string) => void
): UseVoiceInputResult {
  const [isListening, setIsListening] = useState(false);

  // ── Session-level refs — survive recognition instance restarts ────────────
  const isActiveRef      = useRef(false);  // user still wants to listen
  const hasResultRef     = useRef(false);  // a valid transcript was received
  const instanceStartRef = useRef(0);      // Date.now() when current instance began
  const recognitionRef   = useRef<SpeechRecognitionLike | null>(null);
  const safetyTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the callback reference fresh inside async recognition handlers
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  // ── Session stop ──────────────────────────────────────────────────────────

  function stopSession() {
    isActiveRef.current = false;
    if (safetyTimerRef.current !== null) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    try { recognitionRef.current?.stop(); } catch { /* already stopped — ignore */ }
    recognitionRef.current = null;
    setIsListening(false);
  }

  // ── Session start ─────────────────────────────────────────────────────────

  function startSession() {
    const Ctor = getRecognitionCtor();
    if (!Ctor || isActiveRef.current) return;

    isActiveRef.current  = true;
    hasResultRef.current = false;
    setIsListening(true);  // UI enters listening state immediately — stays there until done

    // Hard cap: if the user never speaks, stop everything after SAFETY_TIMEOUT_MS
    safetyTimerRef.current = setTimeout(stopSession, SAFETY_TIMEOUT_MS);

    /**
     * run() creates one recognition instance and wires up its callbacks.
     * It is called again from onend whenever Chrome's silence timeout fires
     * without capturing a result, keeping the session alive transparently.
     */
    function run() {
      if (!isActiveRef.current) return;

      const recognition = new Ctor!();
      recognition.continuous     = false;  // one utterance per instance
      recognition.interimResults = false;  // final result only
      recognition.lang           = "en-US";

      instanceStartRef.current = Date.now();

      // ── Result ──────────────────────────────────────────────────────────
      recognition.onresult = (event) => {
        const transcript = (event.results[0][0] as { transcript: string }).transcript.trim();
        if (!transcript) return;

        hasResultRef.current   = true;
        isActiveRef.current    = false;
        recognitionRef.current = null;
        if (safetyTimerRef.current !== null) {
          clearTimeout(safetyTimerRef.current);
          safetyTimerRef.current = null;
        }

        setIsListening(false);
        onTranscriptRef.current(transcript);
      };

      // ── Error ────────────────────────────────────────────────────────────
      // "no-speech"  — Chrome's silence timeout.  Expected. onend will restart.
      // "aborted"    — we called .stop() ourselves.  Expected. onend will clean up.
      // anything else — real failure (mic blocked, network, etc.) — stop the session.
      recognition.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        isActiveRef.current    = false;
        recognitionRef.current = null;
        if (safetyTimerRef.current !== null) {
          clearTimeout(safetyTimerRef.current);
          safetyTimerRef.current = null;
        }
        setIsListening(false);
      };

      // ── End ──────────────────────────────────────────────────────────────
      // Fires after every instance stop — result, silence timeout, or .stop() call.
      //
      // Critical rule: NEVER call setIsListening(false) while isActiveRef is true.
      // That would cause the "listening → off → listening" flicker the user sees.
      recognition.onend = () => {
        recognitionRef.current = null;

        // onresult already handled everything
        if (hasResultRef.current) return;

        // stopSession() or safety timer already called setIsListening(false)
        if (!isActiveRef.current) return;

        // Still active, no result — Chrome's silence timeout fired.
        // Compute restart delay with a proportional buffer for instant-stops:
        // the faster Chrome stopped, the longer we wait before the next start()
        // to ensure the mic is fully released and start() won't throw.
        const elapsed    = Date.now() - instanceStartRef.current;
        const extraDelay = elapsed < MIN_INSTANCE_MS
          ? Math.round((MIN_INSTANCE_MS - elapsed) * 0.35)
          : 0;

        setTimeout(run, RESTART_DELAY_MS + extraDelay);
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        // start() throws InvalidStateError if the previous instance's mic hold
        // hasn't been released yet. Stop cleanly — user can click mic to retry.
        isActiveRef.current = false;
        if (safetyTimerRef.current !== null) {
          clearTimeout(safetyTimerRef.current);
          safetyTimerRef.current = null;
        }
        setIsListening(false);
      }
    }

    // Delay the first start() by INITIAL_DELAY_MS.
    // Chrome sometimes fires "no-speech" in < 100 ms on the very first call of
    // a session due to mic pipeline initialisation. The delay avoids this.
    setTimeout(run, INITIAL_DELAY_MS);
  }

  // ── Unmount cleanup ───────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (safetyTimerRef.current !== null) clearTimeout(safetyTimerRef.current);
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    };
  }, []);

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    isListening,
    isSupported: !!getRecognitionCtor(),
    toggle: () => { if (isActiveRef.current) stopSession(); else startSession(); },
    stop:   stopSession,
  };
}
