const PERIOD_HOURS = {
  morning: 9,
  noon: 12,
  afternoon: 14,
  evening: 18,
  night: 22,   // 10 PM
  midnight: 0,
};

function parsePeriodHour(str) {
  for (const [keyword, hour] of Object.entries(PERIOD_HOURS)) {
    if (str.includes(keyword)) return hour;
  }
  return null;
}

function parseExplicitTime(str) {
  const match = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const min = parseInt(match[2] || "0", 10);
  const period = (match[3] || "").toLowerCase();

  if (period === "pm" && hour < 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;

  return { hour, min };
}

export function parseTime(input) {
  if (!input || typeof input !== "string" || input.trim() === "") {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString();
  }

  const lower = input.toLowerCase();

  // "later" is intentionally ambiguous — return sentinel so caller can clarify
  if (/^\s*later\s*$/i.test(lower)) return "LATER";

  // Relative time: "in X seconds / minutes / hours"
  const relMatch = lower.match(/in\s+(\d+)\s+(second|minute|hour)s?/);
  if (relMatch) {
    const amount = parseInt(relMatch[1], 10);
    const unit = relMatch[2];

    const ms =
      unit.startsWith("s") ? amount * 1_000 :
        unit.startsWith("m") ? amount * 60_000 :
          amount * 3_600_000;

    const future = new Date(Date.now() + ms);

    return future.toISOString();
  }
  const now = new Date();
  const result = new Date(now);
  result.setSeconds(0, 0);

  // Determine the date
  if (lower.includes("tomorrow")) {
    result.setDate(result.getDate() + 1);
  } else if (lower.includes("next")) {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    for (let i = 0; i < days.length; i++) {
      if (lower.includes(days[i])) {
        const diff = ((i - now.getDay() + 7) % 7) || 7;
        result.setDate(result.getDate() + diff);
        break;
      }
    }
  }

  // Determine the time
  const explicit = parseExplicitTime(lower);
  if (explicit) {
    result.setHours(explicit.hour, explicit.min, 0, 0);
  } else {
    const periodHour = parsePeriodHour(lower);
    if (periodHour !== null) {
      result.setHours(periodHour, 0, 0, 0);
    } else {
      // No time info — default to +1 hour from now
      result.setTime(now.getTime() + 60 * 60 * 1000);
      result.setMinutes(0, 0, 0);
    }
  }

  return result.toISOString();
}
