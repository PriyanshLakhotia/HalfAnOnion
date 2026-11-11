import React, { useEffect, useState } from "react";
import { jobSchedules, nextScheduledRun } from "../domain/schedules";
import { TIMEZONE, type Entity } from "../domain/model";
const format = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
export function ScheduleStatus({
  configured,
  connected,
  stores,
  offerJobs,
}: {
  configured: boolean | undefined;
  connected: boolean;
  stores: Entity[];
  offerJobs: Record<string, any>;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  return (
    <section className="schedule-status">
      <div className="section-heading">
        <h3>Scheduled updates</h3>
        <small className="muted">Amsterdam time</small>
      </div>
      {configured === undefined ? <p className="muted">Loading schedules…</p> : configured ? (
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Next scheduled</th>
            </tr>
          </thead>
          <tbody>
            {jobSchedules.map((job) => {
              const selected =
                !job.retailer ||
                stores.some((s) => s.chain === job.retailer && s.discovery);
              const previous = job.retailer ? offerJobs[job.retailer] : null;
              return (
                <tr key={job.id}>
                  <td>
                    {job.label}
                    {!selected && <small>No store enabled</small>}
                    {selected && previous && (
                      <small>
                        {previous.status === "success"
                          ? "Updated"
                          : "Last check: " +
                            previous.status.replaceAll("-", " ")}{" "}
                        · {format.format(new Date(previous.checkedAt))}
                      </small>
                    )}
                  </td>
                  <td>{format.format(nextScheduledRun(job, now))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="muted">Schedules are not configured.</p>
      )}
      {!connected && (
        <p className="fine">Connect ChatGPT to generate suggestions.</p>
      )}
    </section>
  );
}
