import React, { useState, useEffect } from 'react';
import { useProjectContext } from '../contexts/ProjectContext';
import { ProjectBadge } from './ProjectBadge';
import { MdClose, MdNotifications, MdCheckCircle, MdError, MdInfo, MdWarning } from 'react-icons/md';

/**
 * ProjectNotifications Component
 * 
 * Handles notifications across multiple projects:
 * - Groups notifications by project
 * - Shows project badge in notification
 * - Click notification switches to relevant project context
 * - Real-time updates via WebSocket/polling
 */

interface Notification {
  _id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  projectId: string;
  ticketId?: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

interface NotificationGroup {
  projectId: string;
  projectName: string;
  notifications: Notification[];
}

export const ProjectNotifications: React.FC = () => {
  const { switchProject, userProjects } = useProjectContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch notifications
  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/notifications', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        setNotifications(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);

    // Listen for notification events
    const handleNewNotification = () => {
      fetchNotifications();
    };
    window.addEventListener('newNotification', handleNewNotification);

    return () => {
      clearInterval(interval);
      window.removeEventListener('newNotification', handleNewNotification);
    };
  }, []);

  // Group notifications by project
  const groupedNotifications: NotificationGroup[] = [];
  const notificationsByProject = new Map<string, Notification[]>();

  notifications.forEach(notification => {
    const projectNotifications = notificationsByProject.get(notification.projectId) || [];
    projectNotifications.push(notification);
    notificationsByProject.set(notification.projectId, projectNotifications);
  });

  notificationsByProject.forEach((notifications, projectId) => {
    const project = userProjects.find(p => p._id === projectId);
    if (project) {
      groupedNotifications.push({
        projectId,
        projectName: project.name,
        notifications
      });
    }
  });

  // Count unread notifications
  const unreadCount = notifications.filter(n => !n.read).length;

  // Handle notification click
  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    try {
      const token = localStorage.getItem('authToken');
      await fetch(`/api/notifications/${notification._id}/read`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // Update local state
      setNotifications(prev =>
        prev.map(n =>
          n._id === notification._id ? { ...n, read: true } : n
        )
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }

    // Switch to project context
    await switchProject(notification.projectId, {
      reload: true,
      navigate: true,
      preserveRoute: false
    });

    // Navigate to link if provided
    if (notification.link) {
      window.location.href = notification.link;
    } else if (notification.ticketId) {
      window.location.href = `/tickets/${notification.ticketId}`;
    }

    setIsOpen(false);
  };

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    try {
      const token = localStorage.getItem('authToken');
      await fetch('/api/notifications/mark-all-read', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  // Get icon for notification type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <MdCheckCircle size={20} color="#10b981" />;
      case 'error':
        return <MdError size={20} color="#ef4444" />;
      case 'warning':
        return <MdWarning size={20} color="#f59e0b" />;
      default:
        return <MdInfo size={20} color="#3b82f6" />;
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          backgroundColor: isOpen ? '#667eea' : '#f3f4f6',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
      >
        <MdNotifications size={20} color={isOpen ? '#fff' : '#374151'} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              backgroundColor: '#ef4444',
              color: '#fff',
              fontSize: '11px',
              fontWeight: '600',
              padding: '2px 6px',
              borderRadius: '10px',
              minWidth: '18px',
              textAlign: 'center'
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '48px',
            right: 0,
            width: '400px',
            maxHeight: '600px',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
            zIndex: 1000,
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px',
              borderBottom: '1px solid #e5e7eb'
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                Notifications
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                {unreadCount} unread
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#f3f4f6',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  backgroundColor: '#f3f4f6',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                <MdClose size={16} />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                No notifications
              </div>
            ) : (
              groupedNotifications.map(group => (
                <div key={group.projectId}>
                  {/* Project Group Header */}
                  <div
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#f9fafb',
                      borderBottom: '1px solid #e5e7eb'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ProjectBadge projectId={group.projectId} size="small" variant="initials" />
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                        {group.projectName}
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          backgroundColor: '#e5e7eb',
                          padding: '2px 6px',
                          borderRadius: '10px'
                        }}
                      >
                        {group.notifications.length}
                      </span>
                    </div>
                  </div>

                  {/* Notifications */}
                  {group.notifications.map(notification => (
                    <div
                      key={notification._id}
                      onClick={() => handleNotificationClick(notification)}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        backgroundColor: notification.read ? '#fff' : '#f0f9ff',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f9fafb';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = notification.read ? '#fff' : '#f0f9ff';
                      }}
                    >
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ flexShrink: 0, marginTop: '2px' }}>
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                            <span style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                              {notification.title}
                            </span>
                            {!notification.read && (
                              <span
                                style={{
                                  width: '8px',
                                  height: '8px',
                                  backgroundColor: '#3b82f6',
                                  borderRadius: '50%',
                                  flexShrink: 0
                                }}
                              />
                            )}
                          </div>
                          <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#6b7280' }}>
                            {notification.message}
                          </p>
                          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                            {new Date(notification.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectNotifications;
