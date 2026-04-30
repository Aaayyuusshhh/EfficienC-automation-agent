import { useState, useEffect } from "react";
import { motion } from "framer-motion";

const API_KEY = import.meta.env.VITE_WEATHER_API_KEY as string | undefined;
const CITY = "Gurgaon,IN";

interface WeatherData { temp: number; condition: string; icon: string; }

const EASE: [number, number, number, number] = [0, 0, 0.2, 1];

export default function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!API_KEY) {
      setUnavailable(true);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    const timeout = setTimeout(() => {
      ctrl.abort();
      setUnavailable(true);
      setLoading(false);
    }, 5000);
    fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${CITY}&units=metric&appid=${API_KEY}`,
      { signal: ctrl.signal }
    )
      .then((r) => r.json())
      .then((data) => {
        if (Number(data.cod) !== 200) {
          throw new Error("Weather API error");
        }

        const desc = data.weather?.[0]?.description ?? "clear";

        setWeather({
          temp: Math.round(data.main.temp),
          condition: desc.charAt(0).toUpperCase() + desc.slice(1),
          icon: data.weather?.[0]?.icon ?? "01d",
        });

        setUnavailable(false);
      })
      .catch((err) => {
        console.error("Weather error:", err);
        setUnavailable(true);
      })
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.90 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
      className="flex-shrink-0 relative overflow-hidden"
      style={{
        width: 128,
        height: 128,
        borderRadius: 16,
        background:
          "linear-gradient(145deg, rgba(6,182,212,0.08) 0%, rgba(109,40,217,0.07) 50%, rgba(8,14,28,0.72) 100%)",
        border: "1px solid rgba(6,182,212,0.14)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow:
          "0 0 32px rgba(6,182,212,0.07), 0 4px 18px rgba(0,0,0,0.32), inset 0 1px 0 rgba(6,182,212,0.18)",
      }}
    >
      {/* Top edge glow */}
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(6,182,212,0.45), rgba(139,92,246,0.3), transparent)",
        }}
      />

      {loading ? (
        /* Skeleton */
        <div className="w-full h-full flex flex-col items-center justify-center gap-2.5">
          <div className="w-11 h-11 rounded-xl bg-white/[0.06] animate-pulse" />
          <div className="w-14 h-3 rounded bg-white/[0.05] animate-pulse" />
          <div className="w-10 h-2 rounded bg-white/[0.04] animate-pulse" />
        </div>
      ) : unavailable ? (
        /* Unavailable state */
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-4">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
          </svg>
          <p
            className="text-[9px] text-center leading-relaxed"
            style={{ color: "rgba(255,255,255,0.22)" }}
          >
            Weather<br />unavailable
          </p>
        </div>
      ) : (
        /* Weather data */
        <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 pb-1">

          {/* Icon */}
          <div className="relative mb-0.5">
            <img
              src={`https://openweathermap.org/img/wn/${weather!.icon}@2x.png`}
              alt={weather!.condition}
              className="w-12 h-12 animate-float relative z-10"
              style={{
                filter:
                  "drop-shadow(0 0 8px rgba(6,182,212,0.6)) drop-shadow(0 0 4px rgba(139,92,246,0.35))",
              }}
            />
            {/* Glow beneath icon */}
            <div
              className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-2 pointer-events-none"
              style={{
                background: "rgba(6,182,212,0.32)",
                filter: "blur(6px)",
                borderRadius: "50%",
              }}
            />
          </div>

          {/* Temperature */}
          <div className="relative">
            <div
              className="absolute -inset-2 pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, rgba(6,182,212,0.18) 0%, transparent 70%)",
                filter: "blur(5px)",
              }}
            />
            <span
              className="relative text-[22px] font-bold leading-none tabular-nums"
              style={{
                color: "rgba(255,255,255,0.92)",
                textShadow: "0 0 16px rgba(6,182,212,0.6)",
              }}
            >
              {weather!.temp}°C
            </span>
          </div>

          {/* Condition */}
          <p
            className="text-[10px] leading-none mt-1"
            style={{ color: "rgba(255,255,255,0.38)" }}
          >
            {weather!.condition}
          </p>
        </div>
      )}
    </motion.div>
  );
}
