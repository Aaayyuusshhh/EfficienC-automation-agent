import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface ToastNotification {
  id: string;
  body: string;
  timestamp: number;
}

const DISMISS_MS = 6000;

function SingleToast({
  notification,
  onDismiss,
  index,
}: {
  notification: ToastNotification;
  onDismiss: (id: string) => void;
  index: number;
}) {
  const [hovered, setHovered]   = useState(false);
  const timerRef                = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainRef               = useRef(DISMISS_MS);
  const pausedAtRef             = useRef<number | null>(null);

  const startTimer = (ms: number) => {
    timerRef.current = setTimeout(() => onDismiss(notification.id), ms);
  };

  useEffect(() => {
    startTimer(DISMISS_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseEnter = () => {
    setHovered(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    pausedAtRef.current = Date.now();
  };

  const handleMouseLeave = () => {
    setHovered(false);
    if (pausedAtRef.current !== null) {
      remainRef.current = Math.max(0, remainRef.current - (Date.now() - pausedAtRef.current));
      pausedAtRef.current = null;
    }
    startTimer(remainRef.current);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 52, scale: 0.94 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 52, scale: 0.96, transition: { duration: 0.18, ease: "easeIn" } }}
      transition={{ duration: 0.30, ease: [0, 0, 0.2, 1], delay: index * 0.07 }}
      className="relative flex items-start gap-3.5 px-4 py-4 rounded-2xl overflow-hidden cursor-pointer select-none"
      style={{
        width: 320,
        background: "linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.92) 100%)",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow:
          "0 0 0 1px rgba(99,102,241,0.15), 0 8px 32px rgba(0,0,0,0.55), 0 0 40px rgba(99,102,241,0.20)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
      }}
      onClick={() => { window.focus(); onDismiss(notification.id); }}
      onHoverStart={handleMouseEnter}
      onHoverEnd={handleMouseLeave}
      whileHover={{ scale: 1.02, transition: { duration: 0.15 } }}
    >
      {/* Entry glow pulse — fades out after mount */}
      <motion.div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.75, delay: 0.1, ease: "easeOut" }}
        style={{ boxShadow: "inset 0 0 0 1.5px rgba(129,140,248,0.55)" }}
      />

      {/* Left accent stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: "linear-gradient(180deg, #818cf8 0%, #6366f1 50%, #4f46e5 100%)" }}
      />

      {/* Bell icon */}
      <div
        className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5 ml-1"
        style={{ background: "rgba(99,102,241,0.20)", boxShadow: "0 0 18px rgba(99,102,241,0.32)" }}
      >
        <svg
          width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="#a5b4fc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p
          className="text-[9.5px] font-bold uppercase tracking-[0.14em] mb-1"
          style={{ color: "rgba(165,180,252,0.68)" }}
        >
          EfficienC Reminder
        </p>
        <p
          className="text-[13.5px] leading-snug font-semibold"
          style={{ color: "rgba(241,245,249,0.93)" }}
        >
          {notification.body}
        </p>
        <p
          className="text-[11px] mt-1 font-medium"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          Just now
        </p>
      </div>

      {/* Dismiss ✕ */}
      <button
        className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-colors duration-150 hover:bg-white/10"
        style={{ color: "rgba(255,255,255,0.22)" }}
        onClick={(e) => { e.stopPropagation(); onDismiss(notification.id); }}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Progress bar — CSS animation, pauses on hover */}
      <div
        className="absolute bottom-0 left-0 h-[2.5px]"
        style={{
          right: 0,
          background: "linear-gradient(90deg, #4f46e5, #6366f1, #818cf8, #a5b4fc)",
          transformOrigin: "left",
          animationName: "toast-shrink",
          animationDuration: `${DISMISS_MS}ms`,
          animationTimingFunction: "linear",
          animationFillMode: "forwards",
          animationPlayState: hovered ? "paused" : "running",
        } as React.CSSProperties}
      />
    </motion.div>
  );
}

export default function NotificationToast({
  notifications,
  onDismiss,
}: {
  notifications: ToastNotification[];
  onDismiss: (id: string) => void;
}) {
  return (
    <>
      <style>{`
        @keyframes toast-shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>

      <div
        className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5"
        style={{ pointerEvents: "none" }}
      >
        <AnimatePresence mode="sync">
          {notifications.slice(0, 3).map((n, i) => (
            <div key={n.id} style={{ pointerEvents: "auto" }}>
              <SingleToast notification={n} onDismiss={onDismiss} index={i} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
