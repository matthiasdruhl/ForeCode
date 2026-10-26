"use client";
import { useState } from "react";
import type { Booking } from "../domain/booking";

export function BookingDemo({
  resources,
}: {
  resources: readonly { id: string; name: string }[];
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [resourceId, setResourceId] = useState("room-1");
  const [startAt, setStartAt] = useState("2026-11-10T11:00");
  const [endAt, setEndAt] = useState("2026-11-10T12:00");
  async function call(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? "Request failed.");
    return data;
  }
  async function refresh() {
    setBookings((await call("/api/bookings")).bookings);
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  function startSession() {
    void perform(async () => {
      await call("/api/session", { method: "POST" });
      await refresh();
      setReady(true);
      setMessage("Alice's demo session is ready.");
    });
  }
  function create(event: React.FormEvent) {
    event.preventDefault();
    void perform(async () => {
      await call("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          resourceId,
          startAt: new Date(`${startAt}Z`).toISOString(),
          endAt: new Date(`${endAt}Z`).toISOString(),
        }),
      });
      await refresh();
      setTitle("");
      setMessage("Booking created.");
    });
  }
  const displayTime = (value: string) =>
    new Date(value).toLocaleString("en-GB", {
      timeZone: "UTC",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  return (
    <main>
      <header>
        <span className="wordmark">
          forecode<span>.</span>
        </span>
        <span className="tag">Booking v1 / Baseline A</span>
      </header>
      <p className="eyebrow">Controlled fixture</p>
      <h1>Booking lab.</h1>
      <p className="lede">
        A small room-booking app for testing architectural changes.
      </p>
      <div className="notice">
        <strong>Synthetic local demo.</strong> Sessions represent Alice. Data
        resets when this process restarts. This is not production authentication
        or an experiment result.
      </div>
      {!ready && (
        <button
          className="primary session"
          disabled={busy}
          onClick={startSession}
        >
          {busy ? "Starting…" : "Start Alice’s demo session"}
        </button>
      )}
      <div className="columns">
        <section aria-labelledby="new-heading">
          <h2 id="new-heading">New booking</h2>
          <form onSubmit={create}>
            <fieldset disabled={!ready || busy}>
              <label htmlFor="title">Title</label>
              <input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                required
                placeholder="What is the room for?"
              />
              <label htmlFor="resource">Room</label>
              <select
                id="resource"
                value={resourceId}
                onChange={(event) => setResourceId(event.target.value)}
              >
                {resources.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.name}
                  </option>
                ))}
              </select>
              <label htmlFor="start">Start (UTC)</label>
              <input
                id="start"
                type="datetime-local"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
                required
              />
              <label htmlFor="end">End (UTC)</label>
              <input
                id="end"
                type="datetime-local"
                value={endAt}
                onChange={(event) => setEndAt(event.target.value)}
                required
              />
              <button className="primary" type="submit">
                {busy ? "Working…" : "Create booking"}
              </button>
            </fieldset>
          </form>
        </section>
        <section aria-labelledby="list-heading">
          <div className="list-heading">
            <h2 id="list-heading">Alice’s bookings</h2>
            <span>{bookings.length.toString().padStart(2, "0")}</span>
          </div>
          {!ready ? (
            <p className="empty">Start a demo session to view your bookings.</p>
          ) : bookings.length === 0 ? (
            <p className="empty">No bookings yet.</p>
          ) : (
            <ul>
              {bookings.map((booking) => (
                <li key={booking.id}>
                  <div className="booking-head">
                    <h3>{booking.title}</h3>
                    <span className={`status ${booking.status}`}>
                      {booking.status}
                    </span>
                  </div>
                  <p>
                    {
                      resources.find(
                        (resource) => resource.id === booking.resourceId,
                      )?.name
                    }
                  </p>
                  <p>
                    <time dateTime={booking.startAt}>
                      {displayTime(booking.startAt)}
                    </time>
                    <br />
                    to{" "}
                    <time dateTime={booking.endAt}>
                      {displayTime(booking.endAt)}
                    </time>{" "}
                    UTC
                  </p>
                  {booking.status === "active" && (
                    <button
                      className="cancel"
                      disabled={busy}
                      onClick={() => {
                        void perform(async () => {
                          await call(
                            `/api/bookings/${encodeURIComponent(booking.id)}`,
                            { method: "DELETE" },
                          );
                          await refresh();
                          setMessage("Booking cancelled.");
                        });
                      }}
                      aria-label={`Cancel ${booking.title}`}
                    >
                      Cancel booking
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="result" role="status">
        {message}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <footer>
        All times are UTC. Only active bookings block a room. Adjacent bookings
        are allowed.
      </footer>
    </main>
  );
}
