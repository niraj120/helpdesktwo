/**
 * The booking side of the meeting-room module: pick a room, see who has it
 * when, and take a free slot.
 *
 * Day view is the one people book from — it shows the hours down the page and
 * every hold on the room, so a free gap is obvious. Month view answers "when
 * is this room ever free" at a glance. My bookings and Approvals are the same
 * data, filtered, so nothing needs a second screen.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useProjectContext } from "../../contexts/ProjectContext";
import { usePermissions } from "../../hooks/usePermissions";
import { PERMISSIONS } from "../../constants/permissions";
import {
  meetingRoomApi,
  MeetingRoom,
  MeetingBooking,
  Purpose,
  BOOKING_STATUS_META,
} from "../../services/meetingRooms";
import BookingDialog from "./BookingDialog";

type View = "day" | "week" | "month";
type Tab = "calendar" | "mine" | "approvals";

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const hhmm = (d: string | Date) =>
  new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** The range a view covers, so the server sends only what is on screen. */
const rangeFor = (view: View, anchor: Date) => {
  if (view === "day") return { from: startOfDay(anchor), to: addDays(startOfDay(anchor), 1) };
  if (view === "week") {
    const from = addDays(startOfDay(anchor), -anchor.getDay());
    return { from, to: addDays(from, 7) };
  }
  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  return { from, to };
};

const MeetingRoomBooking: React.FC<{ embedded?: boolean }> = () => {
  const { currentProjectId } = useProjectContext();
  const { hasPermission } = usePermissions();
  const projectId = currentProjectId || "";

  const canBook = hasPermission(PERMISSIONS.MEETING_ROOM_BOOK);
  const canBookForOthers = hasPermission(PERMISSIONS.MEETING_ROOM_BOOK_FOR_OTHERS);
  const canApprove = hasPermission(PERMISSIONS.MEETING_ROOM_APPROVE);
  const canCancelAny = hasPermission(PERMISSIONS.MEETING_ROOM_CANCEL_ANY);

  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [roomId, setRoomId] = useState("");
  const [floor, setFloor] = useState("");
  const [minCapacity, setMinCapacity] = useState<number | "">("");
  const [view, setView] = useState<View>("day");
  const [tab, setTab] = useState<Tab>("calendar");
  const [anchor, setAnchor] = useState(new Date());
  const [bookings, setBookings] = useState<MeetingBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dialogStart, setDialogStart] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const room = rooms.find((r) => r._id === roomId);
  const floors = Array.from(new Set(rooms.map((r) => r.floor).filter(Boolean))) as string[];

  useEffect(() => {
    if (!projectId) return;
    meetingRoomApi.rooms
      .list({ projectId, status: "active" })
      .then((r) => {
        const list: MeetingRoom[] = r.data || [];
        setRooms(list);
        setRoomId((current) => current || list[0]?._id || "");
      })
      .catch(() => setRooms([]));
    meetingRoomApi.purposes
      .list(projectId)
      .then((r) => setPurposes((r.data || []).filter((p: Purpose) => p.isActive !== false)))
      .catch(() => setPurposes([]));
  }, [projectId]);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { from, to } = rangeFor(view, anchor);
      const params: Record<string, any> = {
        projectId,
        from: from.toISOString(),
        to: to.toISOString(),
        includeClosed: true,
      };
      if (tab === "calendar" && roomId) params.roomId = roomId;
      if (tab === "mine") {
        params.scope = "mine";
        delete params.from;
        delete params.to;
      }
      if (tab === "approvals") {
        params.status = "pending_approval";
        delete params.from;
        delete params.to;
      }
      const r = await meetingRoomApi.bookings.list(params);
      setBookings(r.data || []);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, roomId, view, anchor, tab]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleRooms = useMemo(
    () =>
      rooms.filter(
        (r) =>
          (!floor || r.floor === floor) &&
          (minCapacity === "" || r.capacity >= Number(minCapacity)),
      ),
    [rooms, floor, minCapacity],
  );

  const act = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "That did not work.");
    }
  };

  const cancel = (b: MeetingBooking) => {
    const reason = window.prompt("Why is it being cancelled?") || "";
    if (reason === null) return;
    act(
      () =>
        meetingRoomApi.bookings.cancel(b._id, {
          reason,
          scope: b.seriesId && window.confirm("Cancel the whole series?") ? "series" : "one",
        }),
      "Booking cancelled.",
    );
  };

  // ── Views ──────────────────────────────────────────────────────────────────

  const dayView = () => {
    const hours = Array.from({ length: 15 }, (_, i) => 7 + i); // 07:00 → 21:00
    const dayBookings = bookings.filter((b) => sameDay(new Date(b.start), anchor));
    return (
      <div className="rounded-xl border border-gray-200 bg-white">
        {hours.map((h) => {
          const slotStart = new Date(anchor);
          slotStart.setHours(h, 0, 0, 0);
          const inHour = dayBookings.filter((b) => new Date(b.start).getHours() === h);
          return (
            <div key={h} className="flex border-b border-gray-100 last:border-0">
              <div className="w-16 shrink-0 px-3 py-3 text-xs font-semibold text-gray-400">
                {String(h).padStart(2, "0")}:00
              </div>
              <div className="flex-1 space-y-1 p-2">
                {inHour.length === 0 ? (
                  canBook && room ? (
                    <button
                      onClick={() => {
                        setDialogStart(slotStart);
                        setDialogOpen(true);
                      }}
                      className="w-full rounded-lg border border-dashed border-gray-200 py-2 text-left text-xs text-gray-400 hover:border-blue-300 hover:text-blue-600"
                    >
                      + Book {String(h).padStart(2, "0")}:00
                    </button>
                  ) : (
                    <div className="py-2 text-xs text-gray-300">Free</div>
                  )
                ) : (
                  inHour.map((b) => bookingChip(b))
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const monthView = () => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = addDays(startOfDay(first), -first.getDay());
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-500">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day) => {
            const dayBookings = bookings.filter((b) => sameDay(new Date(b.start), day));
            const otherMonth = day.getMonth() !== anchor.getMonth();
            return (
              <div
                key={day.toISOString()}
                className={`min-h-[96px] border-b border-r border-gray-100 p-1.5 ${
                  otherMonth ? "bg-gray-50/60" : ""
                } ${sameDay(day, new Date()) ? "bg-amber-50/50" : ""}`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className={`text-xs ${otherMonth ? "text-gray-300" : "text-gray-500"}`}>
                    {day.getDate()}
                  </span>
                  {canBook && room && !otherMonth && (
                    <button
                      onClick={() => {
                        const s = new Date(day);
                        s.setHours(10, 0, 0, 0);
                        setDialogStart(s);
                        setDialogOpen(true);
                      }}
                      className="text-xs text-gray-300 hover:text-blue-600"
                      title="Book this day"
                    >
                      +
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {dayBookings.slice(0, 3).map((b) => {
                    const meta = BOOKING_STATUS_META[b.status] || BOOKING_STATUS_META.confirmed;
                    return (
                      <div
                        key={b._id}
                        title={`${b.title} — ${hhmm(b.start)}`}
                        className="truncate rounded px-1.5 py-0.5 text-[11px] font-medium"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        {hhmm(b.start)} {b.title}
                      </div>
                    );
                  })}
                  {dayBookings.length > 3 && (
                    <div className="text-[11px] text-gray-400">
                      +{dayBookings.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const weekView = () => {
    const from = addDays(startOfDay(anchor), -anchor.getDay());
    const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
        {days.map((day) => {
          const dayBookings = bookings.filter((b) => sameDay(new Date(b.start), day));
          return (
            <div key={day.toISOString()} className="rounded-xl border border-gray-200 bg-white p-2">
              <div className="mb-2 text-xs font-semibold text-gray-500">
                {day.toLocaleDateString([], { weekday: "short", day: "numeric" })}
              </div>
              <div className="space-y-1">
                {dayBookings.length === 0 && (
                  <p className="text-xs text-gray-300">Nothing booked</p>
                )}
                {dayBookings.map((b) => bookingChip(b, true))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const bookingChip = (b: MeetingBooking, compact = false) => {
    const meta = BOOKING_STATUS_META[b.status] || BOOKING_STATUS_META.confirmed;
    const organizer =
      typeof b.organizerId === "object"
        ? b.organizerId?.fullName ||
          `${b.organizerId?.firstName || ""} ${b.organizerId?.lastName || ""}`.trim()
        : "";
    return (
      <div
        key={b._id}
        className="rounded-lg border px-2.5 py-2"
        style={{ borderColor: meta.bg, background: meta.bg }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" style={{ color: meta.color }}>
              {b.title}
            </p>
            <p className="text-xs text-gray-600">
              {hhmm(b.start)}–{hhmm(b.end)}
              {organizer ? ` · ${organizer}` : ""}
              {typeof b.roomId === "object" && b.roomId?.name ? ` · ${b.roomId.name}` : ""}
            </p>
            {b.status !== "confirmed" && (
              <p className="text-[11px] font-semibold" style={{ color: meta.color }}>
                {meta.label}
              </p>
            )}
          </div>
          {!compact && (
            <div className="flex shrink-0 gap-1">
              {canApprove && b.status === "pending_approval" && (
                <>
                  <button
                    onClick={() =>
                      act(
                        () => meetingRoomApi.bookings.approve(b._id, { approve: true }),
                        "Booking approved.",
                      )
                    }
                    className="rounded border border-emerald-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() =>
                      act(
                        () =>
                          meetingRoomApi.bookings.approve(b._id, {
                            approve: false,
                            remark: window.prompt("Why is it rejected?") || undefined,
                          }),
                        "Booking rejected.",
                      )
                    }
                    className="rounded border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700"
                  >
                    Reject
                  </button>
                </>
              )}
              {["confirmed", "pending_approval"].includes(b.status) && (
                <>
                  {room?.policy?.checkInRequired && b.status === "confirmed" && !b.checkIn?.at && (
                    <button
                      onClick={() =>
                        act(() => meetingRoomApi.bookings.checkIn(b._id), "Checked in.")
                      }
                      className="rounded border border-blue-200 bg-white px-2 py-1 text-xs font-semibold text-blue-700"
                    >
                      Check in
                    </button>
                  )}
                  <button
                    onClick={() => cancel(b)}
                    className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-600"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const title =
    view === "month"
      ? anchor.toLocaleDateString([], { month: "long", year: "numeric" })
      : view === "week"
        ? `Week of ${addDays(startOfDay(anchor), -anchor.getDay()).toLocaleDateString()}`
        : anchor.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  const step = (dir: number) =>
    setAnchor((d) =>
      view === "month"
        ? new Date(d.getFullYear(), d.getMonth() + dir, 1)
        : addDays(d, dir * (view === "week" ? 7 : 1)),
    );

  if (!projectId) {
    return (
      <div className="p-6 text-sm text-gray-500">
        Pick a project to see its meeting rooms.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Meeting rooms</h1>
          <p className="text-sm text-gray-500">
            Book a room, see what is held, and manage your own bookings.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {(["calendar", "mine", ...(canApprove ? ["approvals"] : [])] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                tab === t ? "bg-white text-blue-600 shadow-sm" : "text-gray-600"
              }`}
            >
              {t === "calendar" ? "Calendar" : t === "mine" ? "My bookings" : "Approvals"}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {msg}
        </div>
      )}

      {tab === "calendar" && (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* Rooms */}
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Filter
              </p>
              <select
                className="mb-2 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
              >
                <option value="">All floors</option>
                {floors.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                placeholder="Seats at least…"
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={minCapacity}
                onChange={(e) =>
                  setMinCapacity(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </div>

            <div className="space-y-1.5">
              {visibleRooms.length === 0 && (
                <p className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-400">
                  No rooms match. Add rooms in Meeting Room Settings.
                </p>
              )}
              {visibleRooms.map((r) => (
                <button
                  key={r._id}
                  onClick={() => setRoomId(r._id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left ${
                    roomId === r._id
                      ? "border-blue-300 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: r.colorHex || "#2563eb" }}
                    />
                    <span className="truncate text-sm font-semibold text-gray-900">{r.name}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {[r.floor, r.capacity ? `${r.capacity} seats` : ""].filter(Boolean).join(" · ")}
                  </p>
                  {r.amenities?.length > 0 && (
                    <p className="mt-1 truncate text-[11px] text-gray-400">
                      {r.amenities.join(" · ")}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Calendar */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
              <div className="flex items-center gap-2">
                <button onClick={() => step(-1)} className="rounded border border-gray-200 px-2 py-1 text-sm">
                  ‹
                </button>
                <button
                  onClick={() => setAnchor(new Date())}
                  className="rounded border border-gray-200 px-2 py-1 text-sm"
                >
                  Today
                </button>
                <button onClick={() => step(1)} className="rounded border border-gray-200 px-2 py-1 text-sm">
                  ›
                </button>
                <span className="ml-1 text-sm font-semibold text-gray-900">{title}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
                  {(["day", "week", "month"] as View[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${
                        view === v ? "bg-white text-blue-600 shadow-sm" : "text-gray-600"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                {canBook && room && (
                  <button
                    onClick={() => {
                      setDialogStart(null);
                      setDialogOpen(true);
                    }}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
                  >
                    Book {room.name}
                  </button>
                )}
              </div>
            </div>

            {room && (
              <div className="flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                <span>
                  <strong>{room.name}</strong>
                  {room.floor ? ` · ${room.floor}` : ""}
                </span>
                {room.capacity > 0 && <span>Seats {room.capacity}</span>}
                {room.policy?.requiresApproval && <span>Needs approval</span>}
                {room.policy?.checkInRequired && (
                  <span>Check in within {room.policy.autoReleaseNoShowMins}m</span>
                )}
                {room.device?.enabled && <span>Yealink panel linked</span>}
              </div>
            )}

            {loading ? (
              <p className="p-6 text-sm text-gray-400">Loading…</p>
            ) : view === "day" ? (
              dayView()
            ) : view === "week" ? (
              weekView()
            ) : (
              monthView()
            )}
          </div>
        </div>
      )}

      {tab !== "calendar" && (
        <div className="space-y-2">
          {loading && <p className="text-sm text-gray-400">Loading…</p>}
          {!loading && bookings.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-400">
              {tab === "mine" ? "You have no bookings." : "Nothing is waiting for approval."}
            </p>
          )}
          {bookings.map((b) => bookingChip(b))}
        </div>
      )}

      {dialogOpen && room && (
        <BookingDialog
          room={room}
          purposes={purposes}
          projectId={projectId}
          initialStart={dialogStart || undefined}
          canBookForOthers={canBookForOthers}
          onClose={() => setDialogOpen(false)}
          onBooked={() => {
            setDialogOpen(false);
            setMsg(
              room.policy?.requiresApproval
                ? "Requested — it holds the room once approved."
                : "Room booked.",
            );
            load();
          }}
        />
      )}
      {canCancelAny && tab === "calendar" && (
        <p className="text-xs text-gray-400">
          You can cancel anyone's booking, including inside the cut-off.
        </p>
      )}
    </div>
  );
};

export default MeetingRoomBooking;
