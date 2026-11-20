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
  onManageStores,
}: {
  configured: boolean | undefined;
  connected: boolean;
  stores: Entity[];
  offerJobs: Record<string, any>;
  onManageStores: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const enabledRetailers = new Set(
    stores.filter((store) => store.discovery).map((store) => store.chain),
  );
  const isPaused = (retailer: string | null) =>
    retailer !== null && !enabledRetailers.has(retailer);
  return (
    <section className="schedule-status">
      <div className="section-heading">
        <h3>Scheduled updates</h3>
        <small className="muted">Amsterdam time</small>
      </div>
      {configured === undefined ? (
        <p className="muted">Loading schedules…</p>
      ) : configured ? (
        <>
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Next scheduled</th>
              </tr>
            </thead>
            <tbody>
              {jobSchedules.map((job) => {
                const paused = isPaused(job.retailer);
                const previous = job.retailer ? offerJobs[job.retailer] : null;
                return (
                  <tr key={job.id}>
                    <td>
                      {job.label}
                      {!paused && previous && (
                        <small>
                          {previous.status === "success"
                            ? "Updated"
                            : "Last check: " +
                              previous.status.replaceAll("-", " ")}{" "}
                          · {format.format(new Date(previous.checkedAt))}
                        </small>
                      )}
                    </td>
                    <td className={paused ? "muted" : undefined}>
                      {paused ? "Paused" : format.format(nextScheduledRun(job, now))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {jobSchedules.some((job) => isPaused(job.retailer)) && (
            <div className="schedule-help">
              <p className="muted">
                To turn on automatic offers for a retailer, add or edit a store
                for that retailer and check “Include in automatic offer discovery”.
              </p>
              <button
                type="button"
                className="text-button"
                onClick={onManageStores}
              >
                Manage stores
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="muted">Schedules are not configured.</p>
      )}
      {!connected && (
        <p className="fine">Connect ChatGPT to generate suggestions.</p>
      )}
    </section>
  );
}
