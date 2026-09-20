/**
 * The setup side of the meeting-room module: the rooms themselves and the
 * rules each one is booked under, plus the masters those rules draw on
 * (amenities, purposes), the closures that take a room out of service, and the
 * Yealink panels bookings are pushed to.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useProjectContext } from "../../contexts/ProjectContext";
import { usePermissions } from "../../hooks/usePermissions";
import { PERMISSIONS } from "../../constants/permissions";
import {
  meetingRoomApi,
  MeetingRoom,
  Amenity,
  Purpose,
  Blackout,
} from "../../services/meetingRooms";

type Tab = "rooms" | "masters" | "blackouts" | "device";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
const label = "block text-xs font-semibold text-gray-600 mb-1";

const emptyRoom = (): Partial<MeetingRoom> => ({
  name: "",
  code: "",
  floor: "",
  capacity: 8,
  amenities: [],
  colorHex: "#2563eb",
  status: "active",
  openingHours: DAYS.map((_, i) => ({
    dayOfWeek: i,
    isOpen: i !== 0,
    openTime: "09:00",
    closeTime: "18:00",
  })),
  policy: {
    slotMinutes: 30,
    minDurationMins: 30,
    maxDurationMins: 240,
    bufferBeforeMins: 0,
    bufferAfterMins: 0,
    maxAdvanceDays: 60,
    minNoticeMins: 0,
    maxActiveBookingsPerUser: 0,
    maxHoursPerUserPerWeek: 0,
    cancellationCutoffMins: 0,
    checkInRequired: false,
    checkInWindowMins: 15,
    autoReleaseNoShowMins: 15,
    allowRecurring: true,
    maxOccurrences: 12,
    requiresApproval: false,
    approverRoleIds: [],
    approverUserIds: [],
  } as any,
  device: { provider: "none", enabled: false },
});

const MeetingRoomSettings: React.FC = () => {
  const { currentProjectId } = useProjectContext();
  const { hasPermission } = usePermissions();
  const projectId = currentProjectId || "";
  const canManageRooms = hasPermission(PERMISSIONS.MEETING_ROOM_MANAGE_ROOMS);
  const canManageDevice = hasPermission(PERMISSIONS.MEETING_ROOM_MANAGE_DEVICE);

  const [tab, setTab] = useState<Tab>("rooms");
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [device, setDevice] = useState<any>({ enabled: false });
  const [editing, setEditing] = useState<Partial<MeetingRoom> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!projectId) return;
    const [r, a, p, b] = await Promise.allSettled([
      meetingRoomApi.rooms.list({ projectId, status: "all" }),
      meetingRoomApi.amenities.list(projectId),
      meetingRoomApi.purposes.list(projectId),
      meetingRoomApi.blackouts.list({ projectId }),
    ]);
    if (r.status === "fulfilled") setRooms(r.value.data || []);
    if (a.status === "fulfilled") setAmenities(a.value.data || []);
    if (p.status === "fulfilled") setPurposes(p.value.data || []);
    if (b.status === "fulfilled") setBlackouts(b.value.data || []);
    if (canManageDevice) {
      meetingRoomApi.device
        .get(projectId)
        .then((d) => setDevice(d.data || { enabled: false }))
        .catch(() => undefined);
    }
  }, [projectId, canManageDevice]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const run = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
      loadAll();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || "That did not save.");
    }
  };

  const saveRoom = async () => {
    if (!editing?.name || !editing?.code) {
      setMsg("A room needs a name and a code.");
      return;
    }
    await run(
      () =>
        editing._id
          ? meetingRoomApi.rooms.update(editing._id, { ...editing, projectId })
          : meetingRoomApi.rooms.create({ ...editing, projectId }),
      "Room saved.",
    );
    setEditing(null);
  };

  const setPolicy = (key: string, value: any) =>
    setEditing((r) => ({ ...(r || {}), policy: { ...(r?.policy as any), [key]: value } as any }));

  if (!projectId) {
    return <div className="p-6 text-sm text-gray-500">Pick a project first.</div>;
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Meeting room settings</h1>
        <p className="text-sm text-gray-500">
          Rooms and the rules they are booked under, the words the booking form uses, closures,
          and the room panels.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {(["rooms", "masters", "blackouts", "device"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize ${
              tab === t ? "bg-white text-blue-600 shadow-sm" : "text-gray-600"
            }`}
          >
            {t === "masters" ? "Amenities & purposes" : t === "device" ? "Yealink" : t}
          </button>
        ))}
      </div>

      {msg && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {msg}
        </div>
      )}

      {/* ── Rooms ─────────────────────────────────────────────────────────── */}
      {tab === "rooms" && !editing && (
        <div className="space-y-3">
          {canManageRooms && (
            <button
              onClick={() => setEditing(emptyRoom())}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
            >
              + Add room
            </button>
          )}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Room</th>
                  <th className="px-4 py-2">Floor</th>
                  <th className="px-4 py-2">Seats</th>
                  <th className="px-4 py-2">Rules</th>
                  <th className="px-4 py-2">Panel</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rooms.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                      No rooms yet.
                    </td>
                  </tr>
                )}
                {rooms.map((r) => (
                  <tr key={r._id} className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: r.colorHex || "#2563eb" }}
                        />
                        <span className="font-semibold text-gray-900">{r.name}</span>
                        <span className="text-xs text-gray-400">{r.code}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{r.floor || "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{r.capacity || "—"}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {[
                        r.policy?.requiresApproval ? "approval" : "",
                        r.policy?.checkInRequired ? "check-in" : "",
                        r.policy?.maxAdvanceDays ? `${r.policy.maxAdvanceDays}d ahead` : "",
                        r.allowedDepartmentIds?.length || r.allowedRoleIds?.length
                          ? "restricted"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "open"}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {r.device?.enabled ? r.device.roomAccount || "linked" : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          r.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : r.status === "maintenance"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {canManageRooms && (
                        <>
                          <button
                            onClick={() => setEditing(r)}
                            className="mr-2 text-xs font-semibold text-blue-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() =>
                              window.confirm(`Remove ${r.name}?`) &&
                              run(() => meetingRoomApi.rooms.remove(r._id), "Room removed.")
                            }
                            className="text-xs font-semibold text-red-600"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Room editor ───────────────────────────────────────────────────── */}
      {tab === "rooms" && editing && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              {editing._id ? `Edit ${editing.name}` : "New room"}
            </h2>
            <button onClick={() => setEditing(null)} className="text-sm text-gray-500">
              Back
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={label}>Name *</label>
              <input
                className={field}
                value={editing.name || ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div>
              <label className={label}>Code *</label>
              <input
                className={field}
                value={editing.code || ""}
                onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <label className={label}>Status</label>
              <select
                className={field}
                value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: e.target.value as any })}
              >
                <option value="active">Active</option>
                <option value="maintenance">Under maintenance</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className={label}>Floor</label>
              <input
                className={field}
                value={editing.floor || ""}
                onChange={(e) => setEditing({ ...editing, floor: e.target.value })}
              />
            </div>
            <div>
              <label className={label}>Seats</label>
              <input
                type="number"
                min={0}
                className={field}
                value={editing.capacity ?? 0}
                onChange={(e) => setEditing({ ...editing, capacity: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className={label}>Colour</label>
              <input
                type="color"
                className="h-[38px] w-full rounded-lg border border-gray-300"
                value={editing.colorHex || "#2563eb"}
                onChange={(e) => setEditing({ ...editing, colorHex: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className={label}>Amenities</label>
            <div className="flex flex-wrap gap-2">
              {amenities.length === 0 && (
                <p className="text-xs text-gray-400">
                  None yet — add them under Amenities &amp; purposes.
                </p>
              )}
              {amenities.map((a) => {
                const on = (editing.amenities || []).includes(a.code);
                return (
                  <button
                    key={a.code}
                    type="button"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        amenities: on
                          ? (editing.amenities || []).filter((c) => c !== a.code)
                          : [...(editing.amenities || []), a.code],
                      })
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      on
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600"
                    }`}
                  >
                    {a.icon ? `${a.icon} ` : ""}
                    {a.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className={label}>Opening hours</p>
            <div className="space-y-1.5">
              {(editing.openingHours || []).map((w, i) => (
                <div key={w.dayOfWeek} className="flex flex-wrap items-center gap-2">
                  <label className="flex w-24 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={w.isOpen}
                      onChange={(e) => {
                        const next = [...(editing.openingHours || [])];
                        next[i] = { ...w, isOpen: e.target.checked };
                        setEditing({ ...editing, openingHours: next });
                      }}
                    />
                    {DAYS[w.dayOfWeek]}
                  </label>
                  <input
                    type="time"
                    disabled={!w.isOpen}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-50"
                    value={w.openTime}
                    onChange={(e) => {
                      const next = [...(editing.openingHours || [])];
                      next[i] = { ...w, openTime: e.target.value };
                      setEditing({ ...editing, openingHours: next });
                    }}
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="time"
                    disabled={!w.isOpen}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-50"
                    value={w.closeTime}
                    onChange={(e) => {
                      const next = [...(editing.openingHours || [])];
                      next[i] = { ...w, closeTime: e.target.value };
                      setEditing({ ...editing, openingHours: next });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className={label}>Booking rules</p>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["slotMinutes", "Slot (min)"],
                ["minDurationMins", "Shortest (min)"],
                ["maxDurationMins", "Longest (min)"],
                ["bufferBeforeMins", "Buffer before"],
                ["bufferAfterMins", "Buffer after"],
                ["maxAdvanceDays", "Book ahead (days)"],
                ["minNoticeMins", "Notice (min)"],
                ["cancellationCutoffMins", "Cancel cut-off (min)"],
                ["maxActiveBookingsPerUser", "Max live per person"],
                ["maxHoursPerUserPerWeek", "Max hrs/person/week"],
                ["checkInWindowMins", "Check-in opens (min)"],
                ["autoReleaseNoShowMins", "Release after (min)"],
              ].map(([key, text]) => (
                <div key={key}>
                  <label className={label}>{text}</label>
                  <input
                    type="number"
                    min={0}
                    className={field}
                    value={(editing.policy as any)?.[key] ?? 0}
                    onChange={(e) => setPolicy(key, Number(e.target.value))}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              {[
                ["requiresApproval", "Bookings need approval"],
                ["checkInRequired", "Needs check-in (else released)"],
                ["allowRecurring", "Allow repeating bookings"],
              ].map(([key, text]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={!!(editing.policy as any)?.[key]}
                    onChange={(e) => setPolicy(key, e.target.checked)}
                  />
                  {text}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              0 means no limit. Buffers hold the room either side of a meeting, so a clash check
              includes turnaround time.
            </p>
          </div>

          <div>
            <p className={label}>Room panel (Yealink)</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={!!editing.device?.enabled}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      device: {
                        ...(editing.device as any),
                        enabled: e.target.checked,
                        provider: e.target.checked ? "yealink" : "none",
                      },
                    })
                  }
                />
                Push bookings to the panel
              </label>
              <div>
                <label className={label}>Room account</label>
                <input
                  className={field}
                  placeholder="room@company.com"
                  value={editing.device?.roomAccount || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      device: { ...(editing.device as any), roomAccount: e.target.value },
                    })
                  }
                />
              </div>
              <div>
                <label className={label}>Device id</label>
                <input
                  className={field}
                  value={editing.device?.deviceId || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      device: { ...(editing.device as any), deviceId: e.target.value },
                    })
                  }
                />
              </div>
            </div>
            {editing.device?.lastSyncStatus === "failed" && (
              <p className="mt-1 text-xs text-red-600">
                Last push failed: {editing.device.lastSyncError}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
              Cancel
            </button>
            <button
              onClick={saveRoom}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Save room
            </button>
          </div>
        </div>
      )}

      {/* ── Masters ───────────────────────────────────────────────────────── */}
      {tab === "masters" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <MasterList
            title="Amenities"
            hint="What a room has — the booking filters use these."
            rows={amenities.map((a) => ({ id: a._id!, primary: a.name, secondary: a.code }))}
            onAdd={(name, code) =>
              run(
                () => meetingRoomApi.amenities.save({ projectId, name, code }),
                "Amenity saved.",
              )
            }
            onRemove={(id) =>
              run(() => meetingRoomApi.amenities.remove(id, projectId), "Amenity removed.")
            }
          />
          <MasterList
            title="Booking purposes"
            hint="Why the room is booked — shown on the form and the calendar."
            rows={purposes.map((p) => ({ id: p._id!, primary: p.name, secondary: p.code }))}
            onAdd={(name, code) =>
              run(() => meetingRoomApi.purposes.save({ projectId, name, code }), "Purpose saved.")
            }
            onRemove={(id) =>
              run(() => meetingRoomApi.purposes.remove(id, projectId), "Purpose removed.")
            }
          />
        </div>
      )}

      {/* ── Blackouts ─────────────────────────────────────────────────────── */}
      {tab === "blackouts" && (
        <BlackoutPanel
          rooms={rooms}
          blackouts={blackouts}
          onAdd={(body) =>
            run(() => meetingRoomApi.blackouts.create({ ...body, projectId }), "Closure added.")
          }
          onRemove={(id) =>
            run(() => meetingRoomApi.blackouts.remove(id, projectId), "Closure removed.")
          }
        />
      )}

      {/* ── Yealink ───────────────────────────────────────────────────────── */}
      {tab === "device" && (
        <div className="max-w-2xl space-y-3 rounded-xl border border-gray-200 bg-white p-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Yealink room panels</h2>
            <p className="text-sm text-gray-500">
              Where a booking is sent so the panel outside the room shows it. Deployments differ,
              so the endpoint and body are yours to set; a failure never blocks a booking.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={!!device.enabled}
              onChange={(e) => setDevice({ ...device, enabled: e.target.checked })}
            />
            Push bookings to Yealink
          </label>
          {[
            ["createUrl", "Create URL"],
            ["updateUrl", "Update URL (optional)"],
            ["cancelUrl", "Cancel URL (optional)"],
            ["authHeaderName", "Auth header name"],
            ["authHeaderValue", "Auth header value"],
          ].map(([key, text]) => (
            <div key={key}>
              <label className={label}>{text}</label>
              <input
                className={field}
                value={device[key] || ""}
                onChange={(e) => setDevice({ ...device, [key]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <label className={label}>Body template (JSON)</label>
            <textarea
              className={`${field} font-mono text-xs`}
              rows={6}
              placeholder={`{"room":"{{room.account}}","subject":"{{booking.title}}","start_time":"{{booking.start}}","end_time":"{{booking.end}}"}`}
              value={device.bodyTemplate || ""}
              onChange={(e) => setDevice({ ...device, bodyTemplate: e.target.value })}
            />
            <p className="mt-1 text-xs text-gray-400">
              Placeholders: booking.id/title/start/end/status/attendees, room.name/code/account/deviceId,
              organizer.name/email. Leave blank for a standard body.
            </p>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() =>
                run(
                  () => meetingRoomApi.device.update({ ...device, projectId }),
                  "Yealink settings saved.",
                )
              }
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** A small name + code master list, used for amenities and purposes alike. */
const MasterList: React.FC<{
  title: string;
  hint: string;
  rows: Array<{ id: string; primary: string; secondary?: string }>;
  onAdd: (name: string, code: string) => void;
  onRemove: (id: string) => void;
}> = ({ title, hint, rows, onAdd, onRemove }) => {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <p className="mb-3 text-sm text-gray-500">{hint}</p>
      <div className="mb-3 flex gap-2">
        <input
          className={field}
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={`${field} max-w-[140px]`}
          placeholder="CODE"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button
          onClick={() => {
            if (!name.trim() || !code.trim()) return;
            onAdd(name.trim(), code.trim());
            setName("");
            setCode("");
          }}
          className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
        >
          Add
        </button>
      </div>
      <div className="space-y-1">
        {rows.length === 0 && <p className="text-sm text-gray-400">Nothing yet.</p>}
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm"
          >
            <span>
              {r.primary}
              {r.secondary && <span className="ml-2 text-xs text-gray-400">{r.secondary}</span>}
            </span>
            <button onClick={() => onRemove(r.id)} className="text-xs font-semibold text-red-600">
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const BlackoutPanel: React.FC<{
  rooms: MeetingRoom[];
  blackouts: Blackout[];
  onAdd: (body: any) => void;
  onRemove: (id: string) => void;
}> = ({ rooms, blackouts, onAdd, onRemove }) => {
  const [form, setForm] = useState<any>({ roomId: "", reason: "", start: "", end: "" });
  return (
    <div className="max-w-3xl space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Closures</h2>
        <p className="text-sm text-gray-500">
          Take a room out of service for a stretch — maintenance, an audit, an event. Bookings
          cannot be made over a closure.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className={label}>Room</label>
          <select
            className={field}
            value={form.roomId}
            onChange={(e) => setForm({ ...form, roomId: e.target.value })}
          >
            <option value="">Every room</option>
            {rooms.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>From</label>
          <input
            type="datetime-local"
            className={field}
            value={form.start}
            onChange={(e) => setForm({ ...form, start: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>To</label>
          <input
            type="datetime-local"
            className={field}
            value={form.end}
            onChange={(e) => setForm({ ...form, end: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Reason</label>
          <input
            className={field}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <button
          onClick={() => {
            if (!form.start || !form.end || !form.reason.trim()) return;
            onAdd({
              ...form,
              roomId: form.roomId || undefined,
              start: new Date(form.start).toISOString(),
              end: new Date(form.end).toISOString(),
            });
            setForm({ roomId: "", reason: "", start: "", end: "" });
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Add closure
        </button>
      </div>
      <div className="space-y-1">
        {blackouts.length === 0 && <p className="text-sm text-gray-400">No closures.</p>}
        {blackouts.map((b) => (
          <div
            key={b._id}
            className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm"
          >
            <span>
              <strong>{b.reason}</strong>
              <span className="ml-2 text-xs text-gray-500">
                {rooms.find((r) => r._id === b.roomId)?.name || "Every room"} ·{" "}
                {new Date(b.start).toLocaleString()} → {new Date(b.end).toLocaleString()}
              </span>
            </span>
            <button onClick={() => onRemove(b._id!)} className="text-xs font-semibold text-red-600">
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MeetingRoomSettings;
