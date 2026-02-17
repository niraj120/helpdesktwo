import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import DashboardLayout from '../components/DashboardLayout';
import { API_CONFIG } from '../config/constants';
import {
  Calendar,
  Clock,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Star,
  AlertCircle,
} from 'lucide-react';

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

const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WorkingCalendarManagement: React.FC = () => {
  const navigate = useNavigate();
  const [calendars, setCalendars] = useState<WorkingCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<WorkingCalendar | null>(null);
  const [projectId, setProjectId] = useState<string>(''); // Current user's project context
  const [projects, setProjects] = useState<Project[]>([]); // All projects for Super Admin
  const [isSuperAdmin, setIsSuperAdmin] = useState(false); // Flag to determine if Super Admin

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    timezone: 'Asia/Kolkata',
    selectedProjectId: '', // Project selected in form
    workingHours: Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      isWorkingDay: i >= 1 && i <= 5, // Mon-Fri by default
      startTime: '09:00',
      endTime: '18:00',
      breaks: [] as Array<{ startTime: string; endTime: string }>,
    })),
    holidays: [] as Holiday[],
  });

  const [newHoliday, setNewHoliday] = useState({
    date: '',
    name: '',
    description: '',
    isRecurring: false,
  });

  useEffect(() => {
    const projectContext = JSON.parse(localStorage.getItem('projectContext') || '{}');
    if (projectContext.projectId) {
      setProjectId(projectContext.projectId);
      setIsSuperAdmin(false);
      fetchCalendars(projectContext.projectId);
    } else {
      // Super Admin - fetch all calendars and projects
      setIsSuperAdmin(true);
      fetchAllCalendars();
      fetchProjects();
    }
  }, []);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.success) {
        // Handle different API response formats
        const projectsData = response.data.data?.projects || response.data.data || [];
        setProjects(projectsData);
      }
    } catch (error: any) {
      console.error('Error fetching projects:', error);
    }
  };

  const fetchAllCalendars = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/working-calendars/all`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.success) {
        setCalendars(response.data.data || []);
      }
    } catch (error: any) {
      console.error('Error fetching all working calendars:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCalendars = async (projId: string) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/working-calendars/project/${projId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.success) {
        setCalendars(response.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching calendars:', error);
      alert('Failed to fetch working calendars');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingCalendar(null);
    setFormData({
      name: '',
      description: '',
      timezone: 'Asia/Kolkata',
      selectedProjectId: projectId || '', // Use current project or empty for Super Admin
      workingHours: Array.from({ length: 7 }, (_, i) => ({
        dayOfWeek: i,
        isWorkingDay: i >= 1 && i <= 5,
        startTime: '09:00',
        endTime: '18:00',
        breaks: [] as Array<{ startTime: string; endTime: string }>,
      })),
      holidays: [],
    });
    setShowModal(true);
  };

  const handleEdit = (calendar: WorkingCalendar) => {
    const calendarProjectId = typeof calendar.projectId === 'object' 
      ? calendar.projectId._id 
      : calendar.projectId;
      
    setEditingCalendar(calendar);
    setFormData({
      name: calendar.name,
      description: calendar.description || '',
      timezone: calendar.timezone,
      selectedProjectId: calendarProjectId,
      workingHours: calendar.workingHours.map(day => ({
        ...day,
        breaks: day.breaks || [],
      })),
      holidays: calendar.holidays,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      // Validate project selection for Super Admin
      if (isSuperAdmin && !formData.selectedProjectId) {
        alert('Please select a project');
        return;
      }

      const token = localStorage.getItem('authToken');
      const targetProjectId = formData.selectedProjectId || projectId;
      
      const payload = {
        ...formData,
        projectId: targetProjectId,
        isDefault: calendars.filter(c => {
          const calendarProjId = typeof c.projectId === 'object' ? c.projectId._id : c.projectId;
          return calendarProjId === targetProjectId;
        }).length === 0, // First calendar for this project is default
      };

      if (editingCalendar) {
        // Update
        await axios.put(
          `${API_CONFIG.API_URL}/working-calendars/${editingCalendar._id}`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        alert('Working calendar updated successfully');
      } else {
        // Create
        await axios.post(
          `${API_CONFIG.API_URL}/working-calendars`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        alert('Working calendar created successfully');
      }

      setShowModal(false);
      
      // Refresh data based on mode
      if (isSuperAdmin) {
        fetchAllCalendars();
      } else {
        fetchCalendars(projectId);
      }
    } catch (error: any) {
      console.error('Error saving calendar:', error);
      alert(error.response?.data?.message || 'Failed to save working calendar');
    }
  };

  const handleDelete = async (calendarId: string) => {
    if (!confirm('Are you sure you want to delete this working calendar?')) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      await axios.delete(
        `${API_CONFIG.API_URL}/working-calendars/${calendarId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      alert('Working calendar deleted successfully');
      fetchCalendars(projectId);
    } catch (error: any) {
      console.error('Error deleting calendar:', error);
      alert(error.response?.data?.message || 'Failed to delete working calendar');
    }
  };

  const handleSetDefault = async (calendarId: string) => {
    try {
      const token = localStorage.getItem('authToken');
      await axios.put(
        `${API_CONFIG.API_URL}/working-calendars/${calendarId}/set-default`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      alert('Default calendar updated successfully');
      fetchCalendars(projectId);
    } catch (error: any) {
      console.error('Error setting default:', error);
      alert(error.response?.data?.message || 'Failed to set default calendar');
    }
  };

  const handleAddHoliday = () => {
    if (!newHoliday.date || !newHoliday.name) {
      alert('Date and name are required');
      return;
    }

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
      date: '',
      name: '',
      description: '',
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
        i === dayIndex ? { ...day, [field]: value } : day
      ),
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-600">Loading working calendars...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation - Consistent with SLA pages */}
        <div style={{ 
          display: 'flex', 
          gap: '4px', 
          marginBottom: '24px',
          borderBottom: '2px solid #e5e7eb'
        }}>
          <button
            onClick={() => navigate('/sla')}
            className="btn btn-text"
            style={{
              borderBottom: '3px solid transparent',
              color: '#6b7280',
              marginBottom: '-2px',
              textTransform: 'none',
              borderRadius: 0,
              padding: '12px 24px',
              background: 'none',
              border: 'none',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Priority
          </button>
          <button
            onClick={() => navigate('/escalation-matrix')}
            className="btn btn-text"
            style={{
              borderBottom: '3px solid transparent',
              color: '#6b7280',
              marginBottom: '-2px',
              textTransform: 'none',
              borderRadius: 0,
              padding: '12px 24px',
              background: 'none',
              border: 'none',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Escalation Matrix
          </button>
          <button
            className="btn btn-text"
            style={{
              borderBottom: '3px solid #7c3aed',
              color: '#7c3aed',
              marginBottom: '-2px',
              textTransform: 'none',
              borderRadius: 0,
              padding: '12px 24px',
              background: 'none',
              border: 'none',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Working Calendar
          </button>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Working Calendars</h1>
            <p className="text-sm text-gray-600 mt-1">
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Working Calendars</h3>
            <p className="text-gray-600 mb-4">
              Create a working calendar to manage SLA calculations with business hours and holidays.
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
                      {isSuperAdmin && typeof calendar.projectId === 'object' && (
                        <p className="text-xs text-gray-500 mt-1">
                          Project: {calendar.projectId.name}
                        </p>
                      )}
                      {calendar.description && (
                        <p className="text-sm text-gray-600 mt-1">{calendar.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>
                        {calendar.workingHours.filter((d) => d.isWorkingDay).length} working days
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
                  {editingCalendar ? 'Edit Working Calendar' : 'New Working Calendar'}
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
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                      onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                      <option value="Australia/Sydney">Australia/Sydney (AEDT)</option>
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
                      onChange={(e) => setFormData({ ...formData, selectedProjectId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={!!editingCalendar} // Disable when editing
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
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={2}
                    placeholder="Optional description"
                  />
                </div>

                {/* Working Hours */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Working Hours</h3>
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
                            updateWorkingDay(index, 'isWorkingDay', e.target.checked)
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
                                updateWorkingDay(index, 'startTime', e.target.value)
                              }
                              className="px-3 py-1 border border-gray-300 rounded text-sm"
                            />
                            <span className="text-gray-500">to</span>
                            <input
                              type="time"
                              value={day.endTime}
                              onChange={(e) =>
                                updateWorkingDay(index, 'endTime', e.target.value)
                              }
                              className="px-3 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">Non-working day</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Holidays */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Holidays</h3>
                  
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
                          setNewHoliday({ ...newHoliday, description: e.target.value })
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
                          setNewHoliday({ ...newHoliday, isRecurring: e.target.checked })
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
                              {holiday.isRecurring && ' (Recurring)'}
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
                  {editingCalendar ? 'Update Calendar' : 'Create Calendar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default WorkingCalendarManagement;
