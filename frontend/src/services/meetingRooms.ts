/** Meeting room booking — API client for both the setup and booking screens. */
import { api } from "../utils/api";

export interface RoomPolicy {
  slotMinutes: number;
  minDurationMins: number;
  maxDurationMins: number;
  bufferBeforeMins: number;
  bufferAfterMins: number;
  maxAdvanceDays: number;
  minNoticeMins: number;
  maxActiveBookingsPerUser: number;
  maxHoursPerUserPerWeek: number;
  cancellationCutoffMins: number;
  checkInRequired: boolean;
  checkInWindowMins: number;
  autoReleaseNoShowMins: number;
  allowRecurring: boolean;
  maxOccurrences: number;
  requiresApproval: boolean;
  approverRoleIds: string[];
  approverUserIds: string[];
}

export interface RoomWindow {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export interface MeetingRoom {
  _id: string;
  projectId: string;
  name: string;
  code: string;
  description?: string;
  centreId?: string;
  floor?: string;
  building?: string;
  capacity: number;
  amenities: string[];
  photoUrl?: string;
  colorHex?: string;
  status: "active" | "inactive" | "maintenance";
  allowedDepartmentIds: string[];
  allowedRoleIds: string[];
  allowedCentreIds: string[];
  openingHours?: RoomWindow[];
  policy: RoomPolicy;
  device?: {
    provider: "yealink" | "none";
    enabled: boolean;
    roomAccount?: string;
    deviceId?: string;
    lastSyncAt?: string;
    lastSyncStatus?: "ok" | "failed";
    lastSyncError?: string;
  };
}

export interface BookingAttendee {
  userId?: string;
  name?: string;
  email?: string;
  external?: boolean;
}

export interface MeetingBooking {
  _id: string;
  roomId: any;
  title: string;
  purpose?: string;
  agenda?: string;
  start: string;
  end: string;
  status:
    | "pending_approval"
    | "confirmed"
    | "rejected"
    | "cancelled"
    | "completed"
    | "no_show";
  organizerId: any;
  bookedById: string;
  attendees: BookingAttendee[];
  expectedAttendees?: number;
  seriesId?: string;
  notes?: string;
  checkIn?: { at?: string };
  cancellation?: { at?: string; reason?: string };
  approval?: { decidedAt?: string; remark?: string };
  deviceSync?: { status: string; error?: string };
}

export interface Amenity {
  _id?: string;
  code: string;
  name: string;
  icon?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface Purpose {
  _id?: string;
  code: string;
  name: string;
  colorHex?: string;
  requiresAttendees?: boolean;
  requiresAgenda?: boolean;
  displayOrder?: number;
  isActive?: boolean;
}

export interface Blackout {
  _id?: string;
  roomId?: string;
  floor?: string;
  reason: string;
  start: string;
  end: string;
}

const base = "/meeting-rooms";

export const meetingRoomApi = {
  rooms: {
    list: (params: Record<string, any>) =>
      api.get(base, { params }).then((r) => r.data),
    get: (id: string) => api.get(`${base}/${id}`).then((r) => r.data),
    create: (body: any) => api.post(base, body).then((r) => r.data),
    update: (id: string, body: any) =>
      api.put(`${base}/${id}`, body).then((r) => r.data),
    remove: (id: string) => api.delete(`${base}/${id}`).then((r) => r.data),
    availability: (id: string, date: string) =>
      api.get(`${base}/${id}/availability`, { params: { date } }).then((r) => r.data),
  },
  bookings: {
    list: (params: Record<string, any>) =>
      api.get(`${base}/bookings`, { params }).then((r) => r.data),
    get: (id: string) => api.get(`${base}/bookings/${id}`).then((r) => r.data),
    create: (body: any) => api.post(`${base}/bookings`, body).then((r) => r.data),
    approve: (id: string, body: { approve: boolean; remark?: string }) =>
      api.post(`${base}/bookings/${id}/approve`, body).then((r) => r.data),
    cancel: (id: string, body: { reason?: string; scope?: "one" | "series" }) =>
      api.post(`${base}/bookings/${id}/cancel`, body).then((r) => r.data),
    reschedule: (id: string, body: { start: string; end: string; roomId?: string }) =>
      api.post(`${base}/bookings/${id}/reschedule`, body).then((r) => r.data),
    checkIn: (id: string) =>
      api.post(`${base}/bookings/${id}/check-in`).then((r) => r.data),
    retryDeviceSync: (id: string) =>
      api.post(`${base}/bookings/${id}/device-sync`).then((r) => r.data),
  },
  amenities: {
    list: (projectId: string) =>
      api.get(`${base}/amenities`, { params: { projectId } }).then((r) => r.data),
    save: (body: any) => api.post(`${base}/amenities`, body).then((r) => r.data),
    remove: (id: string, projectId: string) =>
      api.delete(`${base}/amenities/${id}`, { params: { projectId } }).then((r) => r.data),
  },
  purposes: {
    list: (projectId: string) =>
      api.get(`${base}/purposes`, { params: { projectId } }).then((r) => r.data),
    save: (body: any) => api.post(`${base}/purposes`, body).then((r) => r.data),
    remove: (id: string, projectId: string) =>
      api.delete(`${base}/purposes/${id}`, { params: { projectId } }).then((r) => r.data),
  },
  blackouts: {
    list: (params: Record<string, any>) =>
      api.get(`${base}/blackouts`, { params }).then((r) => r.data),
    create: (body: any) => api.post(`${base}/blackouts`, body).then((r) => r.data),
    remove: (id: string, projectId: string) =>
      api.delete(`${base}/blackouts/${id}`, { params: { projectId } }).then((r) => r.data),
  },
  device: {
    get: (projectId: string) =>
      api.get(`${base}/device-config`, { params: { projectId } }).then((r) => r.data),
    update: (body: any) => api.put(`${base}/device-config`, body).then((r) => r.data),
  },
  usage: (params: Record<string, any>) =>
    api.get(`${base}/reports/usage`, { params }).then((r) => r.data),
};

/** Booking status → the colours the calendar and lists use. */
export const BOOKING_STATUS_META: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  pending_approval: { label: "Awaiting approval", color: "#b45309", bg: "#fffbeb" },
  confirmed: { label: "Confirmed", color: "#047857", bg: "#ecfdf5" },
  rejected: { label: "Rejected", color: "#b91c1c", bg: "#fef2f2" },
  cancelled: { label: "Cancelled", color: "#6b7280", bg: "#f3f4f6" },
  completed: { label: "Completed", color: "#1d4ed8", bg: "#eef2ff" },
  no_show: { label: "No show", color: "#b91c1c", bg: "#fef2f2" },
};

export default meetingRoomApi;
