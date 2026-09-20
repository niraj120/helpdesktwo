/**
 * Booking a room: the form, the rules it has to satisfy, and the reason the
 * server gives when it will not take it.
 *
 * The room's own policy drives the form — slot length, how long a meeting may
 * run, whether it repeats, whether it needs approval — so the person booking
 * sees the same rules the server enforces rather than finding out on submit.
 */
import React, { useEffect, useMemo, useState } from "react";
import { meetingRoomApi, MeetingRoom, Purpose } from "../../services/meetingRooms";

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;

const BookingDialog: React.FC<{
  room: MeetingRoom;
  purposes: Purpose[];
  /** Pre-filled when a slot was clicked on the calendar. */
  initialStart?: Date;
  projectId: string;
  canBookForOthers: boolean;
  onClose: () => void;
  onBooked: () => void;
}> = ({ room, purposes, initialStart, projectId, canBookForOthers, onClose, onBooked }) => {
  const policy = room.policy || ({} as any);
  const start0 = initialStart || new Date(Date.now() + 15 * 60000);
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState(purposes[0]?.code || "");
  const [agenda, setAgenda] = useState("");
  const [start, setStart] = useState(toLocalInput(start0));
  const [durationMins, setDurationMins] = useState(
    Math.max(policy.minDurationMins || 30, policy.slotMinutes || 30),
  );
  const [expected, setExpected] = useState<number | "">("");
  const [attendeeText, setAttendeeText] = useState("");
  const [organizerEmail, setOrganizerEmail] = useState("");
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly">("none");
  const [occurrences, setOccurrences] = useState(4);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPurpose = purposes.find((p) => p.code === purpose);
  const end = useMemo(
    () => new Date(new Date(start).getTime() + durationMins * 60000),
    [start, durationMins],
  );

  const durations = useMemo(() => {
    const step = policy.slotMinutes || 30;
    const max = policy.maxDurationMins || 240;
    const min = policy.minDurationMins || step;
    const out: number[] = [];
    for (let m = min; m <= max; m += step) out.push(m);
    return out.length ? out : [30];
  }, [policy.slotMinutes, policy.maxDurationMins, policy.minDurationMins]);

  useEffect(() => {
    if (selectedPurpose && !title) setTitle(selectedPurpose.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose]);

  const submit = async () => {
    setError(null);
    if (!title.trim()) return setError("Give the meeting a title.");
    if (selectedPurpose?.requiresAgenda && !agenda.trim()) {
      return setError("This kind of meeting needs an agenda.");
    }
    setSaving(true);
    try {
      const attendees = attendeeText
        .split(/[,\n]/)
        .map((v) => v.trim())
        .filter(Boolean)
        .map((value) =>
          value.includes("@")
            ? { email: value, external: !value.endsWith(window.location.hostname) }
            : { name: value, external: true },
        );
      await meetingRoomApi.bookings.create({
        projectId,
        roomId: room._id,
        title: title.trim(),
        purpose: purpose || undefined,
        agenda: agenda.trim() || undefined,
        start: new Date(start).toISOString(),
        end: end.toISOString(),
        expectedAttendees: expected === "" ? undefined : Number(expected),
        attendees,
        organizerEmail: organizerEmail.trim() || undefined,
        recurrence:
          repeat === "none"
            ? undefined
            : { frequency: repeat, interval: 1, count: occurrences },
      });
      onBooked();
    } catch (e: any) {
      setError(e?.response?.data?.message || "The room could not be booked.");
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
  const label = "block text-xs font-semibold text-gray-600 mb-1";

  return (
    <div className="fixed inset-0 z-[1200]">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[480px] sm:rounded-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Book {room.name}</h2>
            <p className="text-xs text-gray-500">
              {[room.floor, room.capacity ? `seats ${room.capacity}` : ""]
                .filter(Boolean)
                .join(" · ")}
              {policy.requiresApproval ? " · needs approval" : ""}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100">
            ×
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {purposes.length > 0 && (
            <div>
              <label className={label}>Purpose</label>
              <select className={field} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                <option value="">—</option>
                {purposes.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={label}>Title *</label>
            <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Starts *</label>
              <input
                type="datetime-local"
                className={field}
                value={start}
                step={(policy.slotMinutes || 30) * 60}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <label className={label}>For</label>
              <select
                className={field}
                value={durationMins}
                onChange={(e) => setDurationMins(Number(e.target.value))}
              >
                {durations.map((m) => (
                  <option key={m} value={m}>
                    {m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m} min`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            {new Date(start).toLocaleString()} → {end.toLocaleTimeString()}
          </p>

          <div>
            <label className={label}>
              Agenda{selectedPurpose?.requiresAgenda ? " *" : ""}
            </label>
            <textarea
              className={field}
              rows={2}
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>People expected</label>
              <input
                type="number"
                min={0}
                className={field}
                value={expected}
                onChange={(e) => setExpected(e.target.value === "" ? "" : Number(e.target.value))}
              />
              {expected !== "" && room.capacity > 0 && Number(expected) > room.capacity && (
                <p className="mt-1 text-xs text-amber-600">
                  More people than the room seats ({room.capacity}).
                </p>
              )}
            </div>
            {canBookForOthers && (
              <div>
                <label className={label}>Organiser (email)</label>
                <input
                  className={field}
                  placeholder="Leave blank for yourself"
                  value={organizerEmail}
                  onChange={(e) => setOrganizerEmail(e.target.value)}
                />
              </div>
            )}
          </div>

          <div>
            <label className={label}>
              Attendees{selectedPurpose?.requiresAttendees ? " *" : ""}
            </label>
            <textarea
              className={field}
              rows={2}
              placeholder="Emails or names, comma separated"
              value={attendeeText}
              onChange={(e) => setAttendeeText(e.target.value)}
            />
          </div>

          {policy.allowRecurring && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Repeat</label>
                <select
                  className={field}
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value as any)}
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                </select>
              </div>
              {repeat !== "none" && (
                <div>
                  <label className={label}>Occurrences</label>
                  <input
                    type="number"
                    min={2}
                    max={policy.maxOccurrences || 12}
                    className={field}
                    value={occurrences}
                    onChange={(e) => setOccurrences(Number(e.target.value))}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Up to {policy.maxOccurrences || 12}; every date has to be free.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Booking…" : policy.requiresApproval ? "Request room" : "Book room"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookingDialog;
