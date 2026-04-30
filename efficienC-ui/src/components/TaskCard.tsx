import { useState } from "react";
import { motion } from "framer-motion";

export interface Task {
  id: string;
  title: string;
  status: "pending" | "completed";
  createdAt: Date;
}

interface Props {
  task: Task;
  onComplete: (title: string) => void;
  onDelete: (title: string) => void;
  index?: number;
}

function getAgeLabel(createdAt: Date): { label: string; urgent: boolean } {
  const diffH = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  if (diffH < 1)  return { label: "Just added",  urgent: false };
  if (diffH < 24) return { label: "Today",        urgent: false };
  if (diffH < 48) return { label: "Yesterday",    urgent: false };
  if (diffH < 72) return { label: "2 days old",   urgent: true  };
  return { label: `${Math.floor(diffH / 24)}d old`, urgent: true };
}

export default function TaskCard({ task, onComplete, onDelete, index = 0 }: Props) {
  const [isHovered, setIsHovered] = useState(false);
  const isCompleted = task.status === "completed";
  const { label: ageLabel, urgent } = getAgeLabel(task.createdAt);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      whileHover={!isCompleted ? {
        y: -2,
        boxShadow: urgent
          ? "0 6px 28px rgba(0,0,0,0.45), 0 0 16px rgba(245,158,11,0.10)"
          : "0 6px 28px rgba(0,0,0,0.45), 0 0 16px rgba(109,40,217,0.10)",
      } : undefined}
      transition={{ duration: 0.22, ease: [0, 0, 0.2, 1], delay: index * 0.04 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="group relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
      style={
        isCompleted
          ? {
              background: "rgba(12,18,30,0.6)",
              border: "1px solid rgba(255,255,255,0.04)",
              opacity: 0.6,
              backdropFilter: "blur(8px)",
            }
          : {
              background: isHovered
                ? "rgba(22,32,52,0.92)"
                : "rgba(18,26,42,0.82)",
              border: isHovered
                ? urgent
                  ? "1px solid rgba(245,158,11,0.22)"
                  : "1px solid rgba(109,40,217,0.22)"
                : "1px solid rgba(51,65,85,0.6)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              boxShadow: isHovered ? "none" : "0 2px 8px rgba(0,0,0,0.2)",
            }
      }
    >
      {/* Urgency left bar */}
      {!isCompleted && urgent && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
          style={{ background: "linear-gradient(180deg, #f59e0b, #d97706)" }}
        />
      )}

      {/* Active left accent — shows on hover for non-urgent */}
      {!isCompleted && !urgent && isHovered && (
        <motion.div
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          exit={{ scaleY: 0, opacity: 0 }}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full origin-center"
          style={{ background: "linear-gradient(180deg, #8b5cf6, #6366f1)" }}
        />
      )}

      {/* Checkbox */}
      <motion.button
        onClick={() => !isCompleted && onComplete(task.title)}
        disabled={isCompleted}
        whileTap={!isCompleted ? { scale: 0.85 } : {}}
        className="flex-shrink-0 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all duration-200"
        style={
          isCompleted
            ? { background: "#10b981", borderColor: "#10b981", boxShadow: "0 0 8px rgba(16,185,129,0.4)" }
            : {
                borderColor: isHovered ? (urgent ? "#f59e0b" : "#7c3aed") : "#475569",
                background: isHovered ? (urgent ? "rgba(245,158,11,0.1)" : "rgba(124,58,237,0.1)") : "transparent",
              }
        }
      >
        {isCompleted && (
          <motion.svg
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.25, ease: "backOut" }}
            width="8" height="8" viewBox="0 0 24 24"
            fill="none" stroke="white" strokeWidth="3.5"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </motion.svg>
        )}
      </motion.button>

      {/* Title */}
      <span
        className="flex-1 text-[13px] leading-snug select-none transition-all duration-200"
        style={{
          color: isCompleted ? "rgba(45,63,85,0.85)" : "rgba(226,232,240,0.88)",
          textDecoration: isCompleted ? "line-through" : "none",
          textShadow: isHovered && !isCompleted ? "0 0 20px rgba(139,92,246,0.15)" : "none",
        }}
      >
        {task.title}
      </span>

      {/* Right: badge + delete */}
      <div className="flex items-center gap-2">
        {!isCompleted && (
          <span
            className="text-[9px] font-semibold px-2 py-0.5 rounded-full transition-all duration-200"
            style={
              urgent
                ? {
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.22)",
                    color: "#fbbf24",
                    boxShadow: isHovered ? "0 0 8px rgba(245,158,11,0.2)" : "none",
                  }
                : {
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    color: "rgba(255,255,255,0.22)",
                  }
            }
          >
            {ageLabel}
          </span>
        )}

        <motion.button
          animate={{ opacity: isCompleted ? 0 : 1 }}
          transition={{ duration: 0.15 }}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onDelete(task.title)}
          className="w-5 h-5 flex items-center justify-center rounded-md transition-all duration-150"
          style={{ color: "rgba(51,65,85,0.8)" }}
          tabIndex={-1}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#f87171";
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "rgba(51,65,85,0.8)";
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </motion.button>
      </div>
    </motion.div>
  );
}
