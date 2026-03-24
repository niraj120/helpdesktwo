/**
 * WorkingCalendarContent
 * Content component for managing working calendars (no DashboardLayout wrapper)
 * Can be embedded in SLARulesPage tabs for smooth transitions
 */
import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_CONFIG } from "../../config/constants";
import {
  Calendar,
  Clock,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Star,
} from "lucide-react";

interface WorkingDay {
  dayOfWeek: number;
  isWorkingDay: boolean;
  startTime: string;
  endTime: string;
  breaks?: Array<{
    startTime: string;
    endTime: string;
  }>;
}

interface Holiday {
  _id?: string;
  date: Date;
  name: string;
  description?: string;
  isRecurring: boolean;
}

interface WorkingCalendar {
  _id: string;
  projectId: string | { _id: string; name: string };
  name: string;
  description?: string;
  workingHours: WorkingDay[];
  holidays: Holiday[];
  timezone: string;
  isDefault: boolean;
}

interface Project {
  _id: string;
  name: string;
  code?: string;
}

const daysOfWeek = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const WorkingCalendarContent: React.FC = () => {
  const [calendars, setCalendars] = useState<WorkingCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCalendar, setEditingCalendar] =
    useState<WorkingCalendar | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    timezone: "Asia/Kolkata",
    selectedProjectId: "",
    workingHours: Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      isWorkingDay: i >= 1 && i <= 5,
      startTime: "09:00",
      endTime: "18:00",
      breaks: [] as Array<{ startTime: string; endTime: string }>,
    })),
    holidays: [] as Holiday[],
  });

  const [newHoliday, setNewHoliday] = useState({
    date: "",
    name: "",
    description: "",
    isRecurring: false,
  });

  useEffect(() => {
    const projectContext = JSON.parse(
      localStorage.getItem("projectContext") || "{}",
    );
    if (projectContext.projectId) {
      setProjectId(projectContext.projectId);
      setIsSuperAdmin(false);
      fetchCalendars(projectContext.projectId);
    } else {
      setIsSuperAdmin(true);
      fetchAllCalendars();
      fetchProjects();
    }
  }, []);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(`${API_CONFIG.API_URL}/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        const projectsData =
          response.data.data?.projects || response.data.data || [];
        setProjects(projectsData);
      }
    } catch (error: any) {
      console.error("Error fetching projects:", error);
    }
  };

  const fetchCalendars = async (projectIdParam?: string) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const url = projectIdParam
        ? `${API_CONFIG.API_URL}/working-calendars?projectId=${projectIdParam}`
        : `${API_CONFIG.API_URL}/working-calendars`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        setCalendars(response.data.data || []);
      }
    } catch (error: any) {
      console.error("Error fetching calendars:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllCalendars = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_CONFIG.API_URL}/working-calendars`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data.success) {
        setCalendars(response.data.data || []);
      }
    } catch (error: any) {
      console.error("Error fetching all calendars:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingCalendar(null);
    setFormData({
      name: "",
      description: "",
      timezone: "Asia/Kolkata",
      selectedProjectId: projectId || "",
      workingHours: Array.from({ length: 7 }, (_, i) => ({
        dayOfWeek: i,
        isWorkingDay: i >= 1 && i <= 5,
        startTime: "09:00",
        endTime: "18:00",
        breaks: [],
      })),
      holidays: [],
    });
    setShowModal(true);
  };

  const handleEdit = (calendar: WorkingCalendar) => {
    setEditingCalendar(calendar);
    const calendarProjectId =
      typeof calendar.projectId === "object"
        ? calendar.projectId._id
        : calendar.projectId;

    // Normalize workingHours to ensure breaks is always an array
    const normalizedWorkingHours = (calendar.workingHours || []).map((day) => ({
      dayOfWeek: day.dayOfWeek,
      isWorkingDay: day.isWorkingDay,
      startTime: day.startTime,
      endTime: day.endTime,
      breaks: day.breaks || [],
    }));

    // Fill in missing days if needed
    const workingHours =
      normalizedWorkingHours.length === 7
        ? normalizedWorkingHours
        : Array.from(
            { length: 7 },
            (_, i) =>
              normalizedWorkingHours.find((d) => d.dayOfWeek === i) || {
                dayOfWeek: i,
                isWorkingDay: i >= 1 && i <= 5,
                startTime: "09:00",
                endTime: "18:00",
                breaks: [],
              },
          );

    setFormData({
      name: calendar.name,
      description: calendar.description || "",
      timezone: calendar.timezone,
      selectedProjectId: calendarProjectId,
      workingHours,
      holidays: calendar.holidays || [],
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const effectiveProjectId = isSuperAdmin
        ? formData.selectedProjectId
        : projectId;

      const data = {
        name: formData.name,
        description: formData.description,
        timezone: formData.timezone,
        projectId: effectiveProjectId,
        workingHours: formData.workingHours,
        holidays: formData.holidays,
      };

      if (editingCalendar) {
        await axios.put(
          `${API_CONFIG.API_URL}/working-calendars/${editingCalendar._id}`,
          data,
          { headers: { Authorization: `Bearer ${token}` } },
        );
      } else {
        await axios.post(`${API_CONFIG.API_URL}/working-calendars`, data, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      setShowModal(false);
      if (isSuperAdmin) {
        fetchAllCalendars();
      } else {
        fetchCalendars(projectId);
      }
    } catch (error: any) {
      console.error("Error saving calendar:", error);
      alert(error.response?.data?.message || "Error saving calendar");
    }
  };

  const handleDelete = async (calendarId: string) => {
    if (!confirm("Are you sure you want to delete this calendar?")) return;

    try {
      const token = localStorage.getItem("authToken");
      await axios.delete(
        `${API_CONFIG.API_URL}/working-calendars/${calendarId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (isSuperAdmin) {
        fetchAllCalendars();
      } else {
        fetchCalendars(projectId);
      }
    } catch (error: any) {
      console.error("Error deleting calendar:", error);
      alert(error.response?.data?.message || "Error deleting calendar");
    }
  };

  const handleSetDefault = async (calendarId: string) => {
    try {
      const token = localStorage.getItem("authToken");
      await axios.patch(
        `${API_CONFIG.API_URL}/working-calendars/${calendarId}/set-default`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (isSuperAdmin) {
        fetchAllCalendars();
      } else {
        fetchCalendars(projectId);
      }
    } catch (error: any) {
      console.error("Error setting default calendar:", error);
      alert(error.response?.data?.message || "Error setting default");
    }
  };

  const handleAddHoliday = () => {
    if (!newHoliday.date || !newHoliday.name) return;

    setFormData({
      ...formData,
      holidays: [
        ...formData.holidays,
        {
          date: new Date(newHoliday.date),
          name: newHoliday.name,
          description: newHoliday.description,
          isRecurring: newHoliday.isRecurring,
        },
      ],
    });

    setNewHoliday({
      date: "",
      name: "",
      description: "",
      isRecurring: false,
    });
  };

  const handleRemoveHoliday = (index: number) => {
    setFormData({
      ...formData,
      holidays: formData.holidays.filter((_, i) => i !== index),
    });
  };

  const updateWorkingDay = (dayIndex: number, field: string, value: any) => {
    setFormData({
      ...formData,
      workingHours: formData.workingHours.map((day, i) =>
        i === dayIndex ? { ...day, [field]: value } : day,
      ),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading working calendars...</div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-gray-600">
            Manage working hours, holidays, and SLA calculations
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          New Calendar
        </button>
      </div>

      {/* Calendar List */}
      {calendars.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Working Calendars
          </h3>
          <p className="text-gray-600 mb-4">
            Create a working calendar to manage SLA calculations with business
            hours and holidays.
          </p>
          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Create First Calendar
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {calendars.map((calendar) => (
            <div
              key={calendar._id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {calendar.name}
                      </h3>
                      {calendar.isDefault && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                          <Star className="w-3 h-3" />
                          Default
                        </span>
                      )}
                    </div>
                    {isSuperAdmin &&
                      calendar.projectId !== null &&
                      typeof calendar.projectId === "object" && (
                        <p className="text-xs text-gray-500 mt-1">
                          Project: {calendar.projectId.name}
                        </p>
                      )}
                    {calendar.description && (
                      <p className="text-sm text-gray-600 mt-1">
                        {calendar.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span>
                      {
                        calendar.workingHours.filter((d) => d.isWorkingDay)
                          .length
                      }{" "}
                      working days
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span>{calendar.holidays.length} holidays configured</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Timezone: {calendar.timezone}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t">
                  <button
                    onClick={() => handleEdit(calendar)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-700 bg-blue-50 rounded hover:bg-blue-100"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                  {!calendar.isDefault && (
                    <>
                      <button
                        onClick={() => handleSetDefault(calendar._id)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-700 bg-gray-50 rounded hover:bg-gray-100"
                      >
                        <Star className="w-4 h-4" />
                        Set Default
                      </button>
                      <button
                        onClick={() => handleDelete(calendar._id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Calendar Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editingCalendar
                  ? "Edit Working Calendar"
                  : "New Working Calendar"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Calendar Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Standard Business Hours"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Timezone
                  </label>
                  <select
                    value={formData.timezone}
                    onChange={(e) =>
                      setFormData({ ...formData, timezone: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    <option value="America/New_York">
                      America/New_York (EST)
                    </option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                    <option value="Australia/Sydney">
                      Australia/Sydney (AEDT)
                    </option>
                  </select>
                </div>
              </div>

              {/* Project Selector (Super Admin only) */}
              {isSuperAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project *
                  </label>
                  <select
                    value={formData.selectedProjectId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        selectedProjectId: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={!!editingCalendar}
                  >
                    <option value="">Select a project</option>
                    {projects.map((project) => (
                      <option key={project._id} value={project._id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  {editingCalendar && (
                    <p className="text-xs text-gray-500 mt-1">
                      Project cannot be changed after creation
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                  placeholder="Optional description"
                />
              </div>

              {/* Working Hours */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Working Hours
                </h3>
                <div className="space-y-2">
                  {formData.workingHours.map((day, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <input
                        type="checkbox"
                        checked={day.isWorkingDay}
                        onChange={(e) =>
                          updateWorkingDay(
                            index,
                            "isWorkingDay",
                            e.target.checked,
                          )
                        }
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="w-24 text-sm font-medium text-gray-700">
                        {daysOfWeek[index]}
                      </span>
                      {day.isWorkingDay ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="time"
                            value={day.startTime}
                            onChange={(e) =>
                              updateWorkingDay(
                                index,
                                "startTime",
                                e.target.value,
                              )
                            }
                            className="px-3 py-1 border border-gray-300 rounded text-sm"
                          />
                          <span className="text-gray-500">to</span>
                          <input
                            type="time"
                            value={day.endTime}
                            onChange={(e) =>
                              updateWorkingDay(index, "endTime", e.target.value)
                            }
                            className="px-3 py-1 border border-gray-300 rounded text-sm"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">
                          Non-working day
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Holidays */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Holidays
                </h3>

                {/* Add Holiday Form */}
                <div className="bg-blue-50 rounded-lg p-4 mb-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                    <input
                      type="date"
                      value={newHoliday.date}
                      onChange={(e) =>
                        setNewHoliday({ ...newHoliday, date: e.target.value })
                      }
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="text"
                      value={newHoliday.name}
                      onChange={(e) =>
                        setNewHoliday({ ...newHoliday, name: e.target.value })
                      }
                      placeholder="Holiday name"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="text"
                      value={newHoliday.description}
                      onChange={(e) =>
                        setNewHoliday({
                          ...newHoliday,
                          description: e.target.value,
                        })
                      }
                      placeholder="Description (optional)"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <button
                      onClick={handleAddHoliday}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={newHoliday.isRecurring}
                      onChange={(e) =>
                        setNewHoliday({
                          ...newHoliday,
                          isRecurring: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    Recurring annually
                  </label>
                </div>

                {/* Holiday List */}
                {formData.holidays.length > 0 ? (
                  <div className="space-y-2">
                    {formData.holidays.map((holiday, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {holiday.name}
                          </div>
                          <div className="text-xs text-gray-600">
                            {new Date(holiday.date).toLocaleDateString()}
                            {holiday.isRecurring && " (Recurring)"}
                          </div>
                          {holiday.description && (
                            <div className="text-xs text-gray-500 mt-1">
                              {holiday.description}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveHoliday(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    No holidays added yet
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Save className="w-4 h-4" />
                {editingCalendar ? "Update Calendar" : "Create Calendar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WorkingCalendarContent;
