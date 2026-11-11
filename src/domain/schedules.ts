import definitions from "../../companion/schedules.json";
import { TIMEZONE, today, plusDays } from "./model";
export const jobSchedules = definitions;
type Schedule = (typeof jobSchedules)[number];
const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function localTime(date: string, hour: number, minute: number) {
  const target = Date.parse(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`,
  );
  let value = target;
  // Resolve the Amsterdam offset for the target day, including DST changes.
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(
      parts.formatToParts(new Date(value)).map((p) => [p.type, p.value]),
    );
    const displayed = Date.parse(
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
    );
    value += target - displayed;
  }
  return new Date(value);
}
export function nextScheduledRun(schedule: Schedule, now = new Date()) {
  for (let i = 0; i <= 7; i++) {
    const date = plusDays(today(now), i);
    if (
      schedule.weekday !== null &&
      new Date(date + "T12:00:00Z").getUTCDay() !== schedule.weekday
    )
      continue;
    const candidate = localTime(date, schedule.hour, schedule.minute);
    if (candidate > now) return candidate;
  }
  throw new Error("Invalid job schedule");
}
