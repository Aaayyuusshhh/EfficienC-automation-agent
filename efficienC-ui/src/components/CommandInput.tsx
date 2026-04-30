import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWhisperInput } from "../hooks/useWhisperInput";

// To revert to Web Speech API: import { useVoiceInput as useWhisperInput } from "../hooks/useVoiceInput";

interface Props {
  onSubmit: (command: string) => void;
  isProcessing: boolean;
  /** When seq changes, pre-fill the input with text and focus it */
  fillRequest?: { text: string; seq: number };
}

const CAPTURE_PREVIEW_MS = 1_500; // show transcript to user before auto-submit

// ── Rotating AI hints ─────────────────────────────────────────────────────────
const AI_HINTS = [
  'Try: "schedule a meeting with Aayush tomorrow at 5 PM"',
  'Try: "remind me daily at 9 PM to study"',
  'Try: "send email to Kimya about the reports"',
  'Try: "what tasks do I have pending?"',
  'Try: "message Aayush about the project update"',
] as const;

function RotatingHint({ visible }: { visible: boolean }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % AI_HINTS.length), 5000);
    return () => clearInterval(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-3 text-center pointer-events-none"
        >
          <AnimatePresence mode="wait">
            <motion.p
              key={idx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="text-[11px] tracking-wide select-none"
              style={{
                color: "rgba(255,255,255,0.35)",
                textShadow: "0 0 16px rgba(139,92,246,0.3)",
              }}
            >
              {AI_HINTS[idx]}
            </motion.p>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Quick-action chips ────────────────────────────────────────────────────────
const SUGGESTIONS = [
  { label: "Schedule meeting", icon: "📅", prompt: "Schedule a meeting with " },
  { label: "Send email",       icon: "📧", prompt: "Send email to "          },
  { label: "Add task",         icon: "✓",  prompt: "Remind me to "           },
  { label: "Show tasks",       icon: "⊞",  prompt: "Show my tasks"           },
];

// ── Main component ────────────────────────────────────────────────────────────
export default function CommandInput({ onSubmit, isProcessing, fillRequest }: Props) {
  const [value, setValue]           = useState("");
  const [isFocused, setIsFocused]   = useState(false);
  const [isCaptured, setIsCaptured] = useState(false);

  const inputRef        = useRef<HTMLInputElement>(null);
  const onSubmitRef     = useRef(onSubmit);
  const isProcessingRef = useRef(isProcessing);
  const prevFillSeq     = useRef<number>(-1);

  useEffect(() => { onSubmitRef.current     = onSubmit;      }, [onSubmit]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  // ── Fill request (from follow-up chips) ───────────────────────────────────
  useEffect(() => {
    if (!fillRequest || fillRequest.seq === prevFillSeq.current) return;
    prevFillSeq.current = fillRequest.seq;
    setValue(fillRequest.text);
    // Small delay so the value renders before focus
    setTimeout(() => inputRef.current?.focus(), 40);
  }, [fillRequest]);

  // ── Voice hook ────────────────────────────────────────────────────────────
  const voice = useWhisperInput((transcript) => {
    setValue(transcript);
    setIsCaptured(true);
    setTimeout(() => {
      onSubmitRef.current(transcript);
      setValue("");
      setIsCaptured(false);
    }, CAPTURE_PREVIEW_MS);
  });

  const handleToggle = () => {
    if (isProcessingRef.current) return;
    voice.toggle();
  };

  useEffect(() => {
    if (!voice.isListening && !voice.isProcessing) setIsCaptured(false);
  }, [voice.isListening, voice.isProcessing]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = (text?: string) => {
    const trimmed = (text ?? value).trim();
    if (!trimmed || isProcessingRef.current) return;
    onSubmitRef.current(trimmed);
    setValue("");
  };

  const handleSuggestion = (prompt: string) => {
    if (isProcessingRef.current) return;
    if (prompt.endsWith(" ")) {
      setValue(prompt);
      inputRef.current?.focus();
    } else {
      onSubmit(prompt);
    }
  };

  // ── Hint phase ────────────────────────────────────────────────────────────
  type HintPhase = "recording" | "processing" | "captured" | "keyboard" | "hidden";
  const hintPhase: HintPhase =
    voice.isListening  ? "recording"  :
    voice.isProcessing ? "processing" :
    isCaptured         ? "captured"   :
    isFocused          ? "keyboard"   :
                         "hidden";

  const isIdle = !isFocused && !voice.isListening && !voice.isProcessing && !isProcessing && !isCaptured;
  const showChips = !value && !voice.isListening && !voice.isProcessing && !isProcessing;

  // ── Border/shadow state ────────────────────────────────────────────────────
  const boxShadowValue = isIdle
    ? [
        "0 0 0 1px rgba(51,65,85,0.7), 0 2px 8px rgba(0,0,0,0.35)",
        "0 0 0 1px rgba(109,40,217,0.30), 0 0 36px rgba(109,40,217,0.12), 0 2px 8px rgba(0,0,0,0.35)",
        "0 0 0 1px rgba(51,65,85,0.7), 0 2px 8px rgba(0,0,0,0.35)",
      ]
    : voice.isListening
      ? "0 0 0 1.5px rgba(239,68,68,0.40), 0 0 36px rgba(239,68,68,0.14), 0 4px 24px rgba(0,0,0,0.5)"
    : voice.isProcessing
      ? "0 0 0 1.5px rgba(251,191,36,0.35), 0 0 36px rgba(251,191,36,0.10), 0 4px 24px rgba(0,0,0,0.5)"
    : isCaptured
      ? "0 0 0 1.5px rgba(52,211,153,0.35), 0 0 36px rgba(52,211,153,0.10), 0 4px 24px rgba(0,0,0,0.5)"
    : isProcessing
      ? "0 0 0 1.5px rgba(139,92,246,0.50), 0 0 52px rgba(139,92,246,0.18), 0 0 90px rgba(109,40,217,0.08), 0 4px 24px rgba(0,0,0,0.5)"
      : "0 0 0 1.5px rgba(124,58,237,0.45), 0 0 52px rgba(124,58,237,0.18), 0 0 90px rgba(109,40,217,0.08), 0 4px 24px rgba(0,0,0,0.5)";

  const borderColor =
    voice.isListening   ? "rgba(239,68,68,0.3)"    :
    voice.isProcessing  ? "rgba(251,191,36,0.28)"   :
    isCaptured          ? "rgba(52,211,153,0.28)"   :
    isProcessing        ? "rgba(139,92,246,0.35)"   :
    isFocused           ? "rgba(124,58,237,0.32)"   :
                          "rgba(51,65,85,0.65)";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Outer aura — soft violet halo behind the input */}
      <div className="relative">
        <motion.div
          className="absolute -inset-[6px] rounded-3xl pointer-events-none"
          animate={{
            opacity: isFocused || isProcessing || voice.isListening ? [0.5, 0.85, 0.5] : [0.15, 0.28, 0.15],
          }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background:
              "radial-gradient(ellipse at 50% 60%, rgba(109,40,217,0.22) 0%, rgba(139,92,246,0.08) 55%, transparent 75%)",
            filter: "blur(10px)",
          }}
        />

      {/* Input card */}
      <motion.div
        animate={{ boxShadow: boxShadowValue }}
        transition={{
          boxShadow: isIdle
            ? { duration: 4, repeat: Infinity, ease: "easeInOut", times: [0, 0.5, 1] }
            : { duration: 0.22 },
        }}
        className="rounded-2xl overflow-hidden cursor-text relative"
        style={{
          background: "linear-gradient(135deg, rgba(22,32,48,0.97), rgba(12,18,32,0.99))",
          border: `1px solid ${borderColor}`,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          transition: "border-color 0.22s",
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {/* Processing shimmer */}
        {isProcessing && (
          <div className="absolute inset-0 pointer-events-none animate-shimmer rounded-2xl z-0" />
        )}

        <div className="relative z-10 flex items-center gap-3 px-4 py-4">
          {/* Left icon */}
          <motion.div
            animate={{ color: isProcessing ? "#a78bfa" : isFocused ? "#7c3aed" : "#475569" }}
            transition={{ duration: 0.15 }}
            className="flex-shrink-0"
          >
            {isProcessing ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </motion.div>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            )}
          </motion.div>

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder={
              isProcessing       ? "AI thinking…"   :
              voice.isListening  ? "Recording…"     :
              voice.isProcessing ? "Transcribing…"  :
                                   "Type a command or use voice"
            }
            disabled={isProcessing}
            className={[
              "flex-1 text-sm outline-none bg-transparent leading-relaxed transition-all duration-300",
              isCaptured
                ? "text-slate-500 italic placeholder:text-slate-700"
                : isProcessing
                ? "text-white/40 placeholder:text-violet-400/40"
                : "text-slate-200 placeholder:text-slate-600",
            ].join(" ")}
          />

          {/* Processing dots */}
          {isProcessing && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ opacity: [0.2, 1, 0.2], y: [0, -2, 0] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
                  className="w-1 h-1 rounded-full bg-violet-400 inline-block"
                />
              ))}
            </div>
          )}

          {/* Mic button */}
          {!isProcessing && (
            <motion.button
              onClick={(e) => { e.stopPropagation(); handleToggle(); }}
              whileTap={!voice.isProcessing ? { scale: 0.88 } : {}}
              disabled={voice.isProcessing}
              title={
                !voice.isSupported  ? "Voice input not supported" :
                voice.isListening   ? "Stop recording"            :
                voice.isProcessing  ? "Transcribing…"             :
                                      "Voice input"
              }
              className={[
                "relative flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-150",
                voice.isListening  ? "text-red-400" :
                voice.isProcessing ? "text-amber-400 cursor-not-allowed" :
                                     "text-slate-500 hover:text-slate-400 hover:bg-slate-800",
              ].join(" ")}
            >
              {voice.isListening && (
                <>
                  <motion.span className="absolute inset-0 rounded-lg bg-red-500/15" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
                  <motion.span className="absolute inset-0 rounded-lg border border-red-400/40" animate={{ scale: [1, 2.0], opacity: [0.5, 0] }} transition={{ duration: 2.2, repeat: Infinity }} />
                  <motion.span className="absolute inset-0 rounded-lg border border-red-400/25" animate={{ scale: [1, 2.0], opacity: [0.35, 0] }} transition={{ duration: 2.2, repeat: Infinity, delay: 0.9 }} />
                </>
              )}
              {voice.isProcessing && (
                <motion.span className="absolute inset-0 rounded-lg bg-amber-500/15" animate={{ opacity: [0.4, 0.9, 0.4] }} transition={{ duration: 1.2, repeat: Infinity }} />
              )}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "relative" }}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </motion.button>
          )}

          {/* Submit */}
          <AnimatePresence>
            {value.trim() && !voice.isListening && !voice.isProcessing && !isCaptured && !isProcessing && (
              <motion.button
                initial={{ opacity: 0, scale: 0.75 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.75 }}
                transition={{ duration: 0.12 }}
                onClick={(e) => { e.stopPropagation(); handleSubmit(); }}
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 hover:scale-105"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
                  boxShadow: "0 0 12px rgba(124,58,237,0.4)",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Hint bar */}
        <AnimatePresence>
          {hintPhase !== "hidden" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="relative z-10 px-4 pb-3 overflow-hidden"
            >
              <AnimatePresence mode="wait">
                {hintPhase === "recording" && (
                  <motion.div key="rec" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} className="flex items-center gap-1.5">
                    <motion.span animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    <span className="text-[10px] text-red-400/80">Recording — click mic to stop</span>
                  </motion.div>
                )}
                {hintPhase === "processing" && (
                  <motion.div key="proc" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} className="flex items-center gap-1.5">
                    <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.9, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    <span className="text-[10px] text-amber-400/80">Processing audio…</span>
                  </motion.div>
                )}
                {hintPhase === "captured" && (
                  <motion.div key="cap" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span className="text-[10px] text-emerald-400/70">Got it — sending…</span>
                  </motion.div>
                )}
                {hintPhase === "keyboard" && (
                  <motion.div key="kb" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} className="flex items-center gap-1.5">
                    <kbd className="text-[10px] text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded-md font-mono border border-slate-700">↵</kbd>
                    <span className="text-[10px] text-slate-600">to execute</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      </div>{/* end outer aura wrapper */}

      {/* ── Rotating AI hint (above chips) ── */}
      <RotatingHint visible={showChips} />

      {/* ── Quick-action chips ── */}
      <AnimatePresence>
        {showChips && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            className="flex flex-wrap gap-2 mt-3"
          >
            {SUGGESTIONS.map((s) => (
              <motion.button
                key={s.label}
                onClick={() => handleSuggestion(s.prompt)}
                whileHover={{ y: -1, scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium transition-all duration-150"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(255,255,255,0.35)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(109,40,217,0.10)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(139,92,246,0.2)";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(196,181,253,0.8)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.07)";
                  (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.35)";
                }}
              >
                <span className="text-[11px]">{s.icon}</span>
                {s.label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {!voice.isSupported && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[10px] text-slate-600 mt-2 ml-1">
          Voice input requires a browser with MediaRecorder support (Chrome, Firefox, Edge).
        </motion.p>
      )}
    </div>
  );
}
