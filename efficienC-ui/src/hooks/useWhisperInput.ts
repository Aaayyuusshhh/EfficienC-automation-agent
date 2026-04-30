/**
 * useWhisperInput
 *
 * MediaRecorder-based voice input that transcribes audio through the local
 * Whisper pipeline (browser → Node /transcribe → Python whisper_server.py).
 *
 * Implements the same public interface as useVoiceInput so CommandInput.tsx
 * only needs a one-line import swap to fall back to the Web Speech API.
 *
 * States
 *   isListening  — mic is open and recording
 *   isProcessing — audio sent, waiting for transcript
 *   isSupported  — browser has MediaRecorder + getUserMedia
 *
 * UX flow
 *   click mic → recording (red)
 *   click mic again → processing (amber)
 *   transcript arrives → captured (emerald) → auto-submit
 */

import { useState, useRef, useEffect } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Auto-stop recording after this long so users can't accidentally record forever */
const MAX_RECORD_MS = 30_000;

/** Wait this long after mic stops before sending audio — lets trailing words register */
const STABILIZE_MS = 1_500;

/** Additional hold for very short clips (< 3 words) — Whisper needs context */
const SHORT_CLIP_EXTRA_MS = 500;

/** Filler words removed from transcripts before they reach the command pipeline */
const FILLER_RE = /\b(um+|uh+|hmm+|err+|like|you know|so|well|okay|ok)\b[,.]?\s*/gi;

function cleanTranscript(text: string): string {
  return text.replace(FILLER_RE, " ").replace(/\s{2,}/g, " ").trim().toLowerCase();
}

// ── Support detection ─────────────────────────────────────────────────────────

function isBrowserSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/** Prefer opus/webm (best compression + quality); fall back to whatever the browser supports */
function getBestMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

// ── Public interface (mirrors UseVoiceInputResult for easy swap) ──────────────

export interface UseWhisperInputResult {
  /** True while the mic is open and recording */
  isListening: boolean;
  /** True while audio is in-flight to the Whisper server */
  isProcessing: boolean;
  /** False when the browser lacks MediaRecorder or getUserMedia */
  isSupported: boolean;
  /** Start recording if idle; stop + transcribe if recording */
  toggle: () => void;
  /** Abort immediately — releases mic, discards audio, resets state */
  stop: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWhisperInput(
  onTranscript: (text: string) => void
): UseWhisperInputResult {
  const [isListening,   setIsListening]   = useState(false);
  const [isProcessing,  setIsProcessing]  = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const autoStopRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef     = useRef(false);   // true when stop() aborts a recording mid-session
  const onTranscriptRef  = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function releaseMic() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function clearAutoStop() {
    if (autoStopRef.current !== null) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }

  // ── Start recording ───────────────────────────────────────────────────────

  async function startRecording() {
    if (isListening || isProcessing) return;
    if (!isBrowserSupported()) return;

    cancelledRef.current = false;
    chunksRef.current    = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Permission denied or hardware error — fail silently
      return;
    }

    streamRef.current = stream;

    const mimeType = getBestMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    // onstop fires when recorder.stop() is called (either by the user or auto-stop)
    recorder.onstop = async () => {
      clearAutoStop();
      releaseMic();

      // If cancelled, discard audio and reset without calling the server
      if (cancelledRef.current) {
        cancelledRef.current = false;
        setIsListening(false);
        setIsProcessing(false);
        return;
      }

      const audioBlob = new Blob(chunksRef.current, {
        type: mimeType || "audio/webm",
      });
      chunksRef.current = [];

      // Skip the server round-trip for empty or near-silent recordings.
      // WebM container overhead alone is ~300–400 bytes, so anything under
      // 600 bytes contains no real audio data (pure silence or mic noise).
      if (audioBlob.size < 600) {
        setIsListening(false);
        setIsProcessing(false);
        return;
      }

      setIsListening(false);

      // Stabilization delay — let the last spoken words fully register
      await new Promise<void>(r => setTimeout(r, STABILIZE_MS));

      setIsProcessing(true);

      try {
        const form = new FormData();
        form.append("audio", audioBlob, "recording.webm");

        const resp = await fetch("/transcribe", {
          method: "POST",
          body: form,
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const { text } = (await resp.json()) as { text: string };
        if (text?.trim()) {
          const cleaned = cleanTranscript(text);
          if (!cleaned) return;

          // Extra hold for very short clips — prevents single-word false triggers
          const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
          if (wordCount < 3) {
            await new Promise<void>(r => setTimeout(r, SHORT_CLIP_EXTRA_MS));
          }

          onTranscriptRef.current(cleaned);
        }
      } catch (err) {
        console.error("[useWhisperInput] transcription failed:", err);
      } finally {
        setIsProcessing(false);
      }
    };

    recorder.start();
    setIsListening(true);

    // Auto-stop to prevent indefinite recording
    autoStopRef.current = setTimeout(() => {
      stopRecording();
    }, MAX_RECORD_MS);
  }

  // ── Stop recording (send for transcription) ───────────────────────────────

  function stopRecording() {
    clearAutoStop();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();  // triggers onstop asynchronously
      mediaRecorderRef.current = null;
    }
  }

  // ── Abort (discard audio, release mic immediately) ────────────────────────

  function stop() {
    cancelledRef.current = true;
    clearAutoStop();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();  // onstop will see cancelledRef=true and bail
      mediaRecorderRef.current = null;
    } else {
      // Recorder was never started or already done — reset state manually
      releaseMic();
      setIsListening(false);
      setIsProcessing(false);
    }
  }

  // ── Toggle ────────────────────────────────────────────────────────────────

  const toggle = () => {
    if (isListening)        stopRecording();   // stop → transcribe
    else if (!isProcessing) startRecording();  // start (blocked while processing)
  };

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearAutoStop();
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      releaseMic();
    };
  }, []);

  return {
    isListening,
    isProcessing,
    isSupported: isBrowserSupported(),
    toggle,
    stop,
  };
}
