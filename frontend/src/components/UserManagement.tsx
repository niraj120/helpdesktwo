import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from './DashboardLayout';
import { getText } from '../utils/language';
import { usePermissions } from '../hooks/usePermissions';
import { API_CONFIG } from '../config/constants';


interface Role {
  _id: string;
  name: string;
  code: string;
}

interface Project {
  _id: string;
  name: string;
  code: string;
  status?: string;
}

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  employeeCode?: string;
  hrmsId?: number;
  role: Role | null;
  department?: string;
  designation?: string;
  joiningDate?: string;
  reportingManager?: User;
  projects?: Project[];
  isActive: boolean;
  createdAt: string;
}

interface HRMSEmployee {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  department: string;
  designation: string;
}

interface UserManagementProps {
  wrapWithLayout?: boolean; // If false, renders content only without DashboardLayout
}

const UserManagement: React.FC<UserManagementProps> = ({ wrapWithLayout = true }) => {
  const { i18n } = useTranslation();
  const { hasPermission } = usePermissions();
  
  // State management
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  // Modal states
  const [showUserModal, setShowUserModal] = useState(false);
  const [showHRMSModal, setShowHRMSModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [selectedUserForCredentials, setSelectedUserForCredentials] = useState<User | null>(null);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Form data
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    password: '',
    employeeCode: '',
    hrmsId: '',
    role: '',
    department: '',
    designation: '',
    joiningDate: '',
    reportingManager: '',
    projects: [] as string[],
  });
  
  // HRMS data for bulk selection
  const [hrmsEmployees, setHrmsEmployees] = useState<HRMSEmployee[]>([]);
  const [hrmsEmployeeCodes, setHrmsEmployeeCodes] = useState(''); // For initial employee code input
  const [hrmsSearchQuery, setHrmsSearchQuery] = useState(''); // For filtering loaded employees
  const [hrmsLoading, setHrmsLoading] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]); // Array of employee IDs
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  
  const [saving, setSaving] = useState(false);
  
  // Ref to prevent duplicate API calls from React.StrictMode
  const hasFetchedInitialData = useRef(false);

  // Generate a secure random password
  const generateSecurePassword = (): string => {
    const length = 12;
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '@#$%&*!';
    const allChars = uppercase + lowercase + numbers + special;
    
    // Ensure at least one of each type
    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  // Helper function to get default password based on user (for display only)
  const getDefaultPassword = (user: User | null): string => {
    // In production, passwords are generated randomly and sent via email
    // This is just for display purposes during user creation
    return generateSecurePassword();
  };

  // Fetch users
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (filterRole) params.append('role', filterRole);
      if (filterStatus) params.append('isActive', filterStatus);
      
      // Get projectId if in project portal context
      const projectContextStr = localStorage.getItem('projectContext');
      const projectId = projectContextStr ? JSON.parse(projectContextStr).projectId : null;
      if (projectId) params.append('project', projectId); // Backend uses 'project' not 'projectId'
      
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/users?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setUsers(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch users');
      }
    } catch (error: any) {
      console.error('Error fetching users:', error);
      alert(`Failed to fetch users: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch roles and projects
  const fetchRolesAndProjects = async () => {
    try {
      const token = localStorage.getItem('authToken');
      
      // Check if we're in project portal context
      const projectContextStr = localStorage.getItem('projectContext');
      const isProjectPortal = !!projectContextStr;
      const projectContext = projectContextStr ? JSON.parse(projectContextStr) : null;
      
      // Fetch roles with project filter if in project portal
      const rolesUrl = isProjectPortal && projectContext?.projectId
        ? `${API_CONFIG.API_URL}/roles?projectId=${projectContext.projectId}`
        : `${API_CONFIG.API_URL}/roles`;
      
      const rolesRes = await fetch(rolesUrl, { 
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      const rolesData = await rolesRes.json();
      
      if (rolesData.success && Array.isArray(rolesData.data)) {
        setRoles(rolesData.data);
      }
      
      // Only fetch projects if in super admin portal
      if (!isProjectPortal) {
        const projectsRes = await fetch(`${API_CONFIG.API_URL}/projects`, { 
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        const projectsData = await projectsRes.json();
        
        if (projectsData.success && projectsData.data && Array.isArray(projectsData.data.projects)) {
          setProjects(projectsData.data.projects);
        }
      } else {
        // In project portal, set the current project from context
        setProjects([{
          _id: projectContext.projectId,
          name: projectContext.projectName,
          code: projectContext.projectCode,
        }]);
      }
    } catch (error) {
      console.error('Error fetching roles/projects:', error);
    }
  };

  useEffect(() => {
    // Prevent duplicate calls from React.StrictMode on initial load
    if (!hasFetchedInitialData.current && !searchQuery && !filterRole && !filterStatus) {
      console.log('🔄 Initial load: Fetching users and roles/projects...');
      hasFetchedInitialData.current = true;
      fetchUsers();
      fetchRolesAndProjects();
    } else if (searchQuery || filterRole || filterStatus) {
      // Allow re-fetching when filters change
      console.log('🔍 Filters changed: Re-fetching users...');
      fetchUsers();
      fetchRolesAndProjects();
    } else {
      console.log('⏭️ Skipping duplicate initial fetch (already loaded)');
    }
  }, [searchQuery, filterRole, filterStatus]);

  // Handle create user
  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      mobile: '',
      password: '',
      employeeCode: '',
      hrmsId: '',
      role: '',
      department: '',
      designation: '',
      joiningDate: '',
      reportingManager: '',
      projects: [],
    });
    setShowUserModal(true);
  };

  // Handle edit user
  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setFormData({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      mobile: user.mobile || '',
      password: '',
      employeeCode: user.employeeCode || '',
      hrmsId: user.hrmsId?.toString() || '',
      role: user.role?._id || '',
      department: user.department || '',
      designation: user.designation || '',
      joiningDate: user.joiningDate ? user.joiningDate.split('T')[0] : '',
      reportingManager: user.reportingManager?._id || '',
      projects: user.projects?.map(p => p._id) || [],
    });
    setShowUserModal(true);
  };

  // Handle view credentials
  const handleViewCredentials = (user: User) => {
    setSelectedUserForCredentials(user);
    setShowCredentialsModal(true);
  };

  // Handle save user
  const handleSaveUser = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.role) {
      alert(getText('Please fill all required fields', 'कृपया सर्व आवश्यक फील्ड भरा', 'कृपया सर्व आवश्यक फील्ड भरा'));
      return;
    }

    if (!editingUser && !formData.password) {
      alert(getText('Password is required for new users', 'नवीन वापरकर्त्यांसाठी पासवर्ड आवश्यक आहे', 'नवीन वापरकर्त्यांसाठी पासवर्ड आवश्यक आहे'));
      return;
    }

    try {
      setSaving(true);
      const url = editingUser
        ? `${API_CONFIG.API_URL}/users/${editingUser._id}`
        : `${API_CONFIG.API_URL}/users`;
      
      const method = editingUser ? 'PUT' : 'POST';
      
      const payload: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        mobile: formData.mobile,
        role: formData.role,
        employeeCode: formData.employeeCode,
        hrmsId: formData.hrmsId ? parseInt(formData.hrmsId) : undefined,
        department: formData.department,
        designation: formData.designation,
        joiningDate: formData.joiningDate || undefined,
        reportingManager: formData.reportingManager || undefined,
        projects: formData.projects,
      };
      
      if (!editingUser && formData.password) {
        payload.password = formData.password;
      }
      
      const token = localStorage.getItem('authToken');
      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(editingUser 
          ? (getText('User updated successfully', 'वापरकर्ता यशस्वीरित्या अद्यतनित केला', 'वापरकर्ता यशस्वीरित्या अद्यतनित केला'))
          : (getText('User created successfully', 'वापरकर्ता यशस्वीरित्या तयार केला', 'वापरकर्ता यशस्वीरित्या तयार केला'))
        );
        setShowUserModal(false);
        fetchUsers();
      } else {
        // Show detailed error message from backend
        const errorMessage = data.error || 'Failed to save user';
        alert(getText(`Error: ${errorMessage}`, `त्रुटी: ${errorMessage}`, `त्रुटी: ${errorMessage}`)
        );
      }
    } catch (error) {
      console.error('Error saving user:', error);
      alert(getText('Failed to save user. Please check your input and try again.', 'वापरकर्ता जतन करण्यात अयशस्वी. कृपया तुमचा इनपुट तपासा आणि पुन्हा प्रयत्न करा.', 'वापरकर्ता जतन करण्यात अयशस्वी. कृपया तुमचा इनपुट तपासा आणि पुन्हा प्रयत्न करा.')
      );
    } finally {
      setSaving(false);
    }
  };

  // Handle HRMS fetch - Load all employees
  const handleFetchFromHRMS = async () => {
    try {
      setHrmsLoading(true);
      
      // Build query based on employee codes input
      let queryParam = '';
      if (hrmsEmployeeCodes.trim()) {
        // Split by comma and trim each code
        const codes = hrmsEmployeeCodes.split(',').map(c => c.trim()).filter(c => c);
        if (codes.length > 0) {
          // Use first code as search query (HRMS API searches across all fields)
          queryParam = codes[0];
        }
      } else {
        // If no codes provided, use 'emp' to get all employees (matches all employeeCodes)
        queryParam = 'emp';
      }
      
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/users/hrms/search?query=${encodeURIComponent(queryParam)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });
      
      const data = await response.json();
      
      if (data.success && data.data) {
        // API already searches across all fields, just use the results
        setHrmsEmployees(data.data);
        
        // Show message if no results found
        if (data.data.length === 0) {
          const searchTerm = hrmsEmployeeCodes.trim() || 'employees';
          alert(getText(
            `No employees found for: ${searchTerm}`, 
            `${searchTerm} साठी कर्मचारी आढळले नाहीत`, 
            `${searchTerm} साठी कर्मचारी आढळले नाहीत`
          ));
        }
        
        // Clear the employee codes input after loading
        setHrmsEmployeeCodes('');
      } else {
        alert(data.error || 'Failed to fetch employees from HRMS');
        setHrmsEmployees([]);
      }
    } catch (error) {
      console.error('Error fetching from HRMS:', error);
      alert('Failed to fetch from HRMS');
      setHrmsEmployees([]);
    } finally {
      setHrmsLoading(false);
    }
  };

  // Handle HRMS confirm - Add selected employees
  const handleConfirmHRMS = async () => {
    if (selectedEmployees.length === 0) {
      alert(getText('Please select at least one employee', 'कृपया किमान एक कर्मचारी निवडा', 'कृपया किमान एक कर्मचारी निवडा'));
      return;
    }

    if (!selectedRole) {
      alert(getText('Please select a role', 'कृपया रोल निवडा', 'कृपया रोल निवडा'));
      return;
    }

    try {
      setSaving(true);
      let successCount = 0;
      let failCount = 0;

      // Add each selected employee
      for (const employeeId of selectedEmployees) {
        const employee = hrmsEmployees.find(emp => emp.employeeCode === employeeId);
        if (!employee) continue;

        try {
          const token = localStorage.getItem('authToken');
          const response = await fetch(`${API_CONFIG.API_URL}/users`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            credentials: 'include',
            body: JSON.stringify({
              employeeCode: employee.employeeCode,
              role: selectedRole,
              projects: selectedProjects,
              syncFromHRMS: true,
            }),
          });
          
          const data = await response.json();
          
          if (data.success) {
            successCount++;
          } else {
            failCount++;
            console.error(`Failed to add ${employee.employeeCode}:`, data.error);
          }
        } catch (error) {
          failCount++;
          console.error(`Error adding ${employee.employeeCode}:`, error);
        }
      }

      const message = getText(
        `Added ${successCount} user(s) successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
        `${successCount} वापरकर्ते यशस्वीरित्या जोडले${failCount > 0 ? `, ${failCount} अयशस्वी` : ''}`,
        `${successCount} वापरकर्ते यशस्वीरित्या जोडले${failCount > 0 ? `, ${failCount} अयशस्वी` : ''}`
      );
      
      alert(message);
      
      setShowHRMSModal(false);
      setHrmsEmployees([]);
      setSelectedEmployees([]);
      setSelectedRole('');
      setSelectedProjects([]);
      fetchUsers();
    } catch (error) {
      console.error('Error adding users from HRMS:', error);
      alert('Failed to add users');
    } finally {
      setSaving(false);
    }
  };

  // Handle delete user
  const handleDeleteUser = async (userId: string) => {
    if (!confirm(getText('Are you sure you want to delete this user?', 'तुम्हाला खात्री आहे की तुम्ही हा वापरकर्ता हटवू इच्छिता?', 'तुम्हाला खात्री आहे की तुम्ही हा वापरकर्ता हटवू इच्छिता?'))) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(getText('User deleted successfully', 'वापरकर्ता यशस्वीरित्या हटवला', 'वापरकर्ता यशस्वीरित्या हटवला'));
        fetchUsers();
      } else {
        alert(data.error || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    }
  };

  // Handle toggle status
  const handleToggleStatus = async (userId: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/users/${userId}/toggle-status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });
      
      const data = await response.json();
      
      if (data.success) {
        fetchUsers();
      } else {
        alert(data.error || 'Failed to toggle status');
      }
    } catch (error) {
      console.error('Error toggling status:', error);
      alert('Failed to toggle status');
    }
  };

  // Handle reset password
  const handleResetPassword = async () => {
    if (!resetPasswordUser) return;

    // Validation
    if (!newPassword || newPassword.length < 6) {
      alert(getText('Password must be at least 6 characters long', 'पासवर्ड किमान 6 वर्णांचा असणे आवश्यक आहे', 'पासवर्ड किमान 6 वर्णांचा असणे आवश्यक आहे'));
      return;
    }

    if (newPassword !== confirmPassword) {
      alert(getText('Passwords do not match', 'पासवर्ड जुळत नाहीत', 'पासवर्ड जुळत नाहीत'));
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/users/${resetPasswordUser._id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ newPassword }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(getText('Password reset successfully!', 'पासवर्ड यशस्वीरित्या रीसेट केला!', 'पासवर्ड यशस्वीरित्या रीसेट केला!'));
        setShowResetPasswordModal(false);
        setResetPasswordUser(null);
        setNewPassword('');
        setConfirmPassword('');
      } else {
        alert(data.error || 'Failed to reset password');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      alert('Failed to reset password');
    }
  };

  const handleAssignRole = async (userId: string, roleId: string) => {
    if (!roleId) return;
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_CONFIG.API_URL}/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ role: roleId }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        fetchUsers();
        alert(getText('Role assigned successfully!', 'भूमिका यशस्वीरित्या नियुक्त केली!', 'भूमिका यशस्वीरित्या नियुक्त केली!'));
      } else {
        alert(data.error || 'Failed to assign role');
      }
    } catch (error) {
      console.error('Error assigning role:', error);
      alert('Failed to assign role');
    }
  };

  const filteredUsers = users;

  if (loading) {
    const loadingContent = (
      <div style={{ 
        padding: '80px 40px', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '400px',
        background: '#F9FAFB',
      }}>
        <div style={{ 
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '3px solid #E5E7EB',
            borderTop: '3px solid #2563EB',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}></div>
          <p style={{ 
            color: '#6B7280', 
            fontSize: '14px',
            margin: 0,
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          }}>
            {getText('Loading users...', 'वापरकर्ते लोड करत आहे...', 'वापरकर्ते लोड करत आहे...')}
          </p>
        </div>
      </div>
    );

    return wrapWithLayout ? (
      <DashboardLayout>
        {loadingContent}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </DashboardLayout>
    ) : (
      <>
        {loadingContent}
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </>
    );
  }

  const mainContent = (
    <div style={{ 
      padding: '32px 24px', 
      maxWidth: '1440px', 
      margin: '0 auto',
      background: '#F9FAFB',
      minHeight: '100vh',
      fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
    }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ 
            margin: '0 0 8px 0',
            fontSize: '28px', 
            fontWeight: 700, 
            color: '#111827',
            letterSpacing: '-0.02em',
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          }}>
            {getText('User Management', 'वापरकर्ता व्यवस्थापन', 'वापरकर्ता व्यवस्थापन')}
          </h1>
          <p style={{ 
            margin: 0,
            fontSize: '14px', 
            color: '#6B7280',
            fontWeight: 400,
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          }}>
            {getText('Manage system users and their access', 'सिस्टम वापरकर्ते आणि त्यांचा प्रवेश व्यवस्थापित करा', 'सिस्टम वापरकर्ते आणि त्यांचा प्रवेश व्यवस्थापित करा')}
          </p>
        </div>

        {/* Actions Bar */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '24px', 
          gap: '16px', 
          flexWrap: 'wrap' 
        }}>
          <div style={{ display: 'flex', gap: '12px', flex: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: '1', minWidth: '250px', maxWidth: '400px' }}>
              <svg 
                width="18" 
                height="18" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="#6B7280" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              >
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder={getText('Search users...', 'वापरकर्ते शोधा...', 'वापरकर्ते शोधा...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '10px 16px 10px 44px', 
                  border: '1.5px solid #E5E7EB', 
                  borderRadius: '8px', 
                  fontSize: '14px', 
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  background: 'white',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#2563EB';
                  e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#E5E7EB';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Role Filter */}
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              style={{ 
                padding: '10px 16px', 
                border: '1.5px solid #E5E7EB', 
                borderRadius: '8px', 
                fontSize: '14px', 
                outline: 'none', 
                backgroundColor: 'white',
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#2563EB';
                e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#E5E7EB';
                e.target.style.boxShadow = 'none';
              }}
            >
              <option value="">{getText('All Roles', 'सर्व रोल', 'सर्व रोल')}</option>
              {roles.map(role => (
                <option key={role._id} value={role._id}>{role.name}</option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ 
                padding: '10px 16px', 
                border: '1.5px solid #E5E7EB', 
                borderRadius: '8px', 
                fontSize: '14px', 
                outline: 'none', 
                backgroundColor: 'white',
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#2563EB';
                e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#E5E7EB';
                e.target.style.boxShadow = 'none';
              }}
            >
              <option value="">{getText('All Status', 'सर्व स्थिती', 'सर्व स्थिती')}</option>
              <option value="true">{getText('Active', 'सक्रिय', 'सक्रिय')}</option>
              <option value="false">{getText('Inactive', 'निष्क्रिय', 'निष्क्रिय')}</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            {hasPermission('USER_CREATE') && (
              <button
                onClick={() => setShowHRMSModal(true)}
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(16, 185, 129, 0.24)',
                  transition: 'all 0.2s ease',
                  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#059669';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.32)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#10b981';
                  e.currentTarget.style.boxShadow = '0 2px 6px rgba(16, 185, 129, 0.24)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              {getText('Add from HRMS', 'HRMS मधून जोडा', 'HRMS मधून जोडा')}
            </button>
            )}
            {hasPermission('USER_CREATE') && (
            <button
              onClick={handleOpenCreateModal}
              style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                background: '#2563EB',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.24)',
                transition: 'all 0.2s ease',
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#1d4ed8';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.32)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#2563EB';
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(37, 99, 235, 0.24)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {getText('Create User', 'वापरकर्ता तयार करा', 'वापरकर्ता तयार करा')}
            </button>
            )}
          </div>
        </div>

        {/* Users Table */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #E5E7EB',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
        }}>
          {filteredUsers.length === 0 ? (
            <div style={{
              padding: '80px 40px',
              textAlign: 'center',
            }}>
              <div style={{
                width: '96px',
                height: '96px',
                margin: '0 auto 24px',
                background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <h3 style={{ 
                margin: '0 0 12px 0', 
                fontSize: '20px', 
                fontWeight: 700,
                color: '#111827',
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}>
                {getText('No Users Found', 'वापरकर्ते आढळले नाहीत', 'वापरकर्ते आढळले नाहीत')}
              </h3>
              <p style={{ 
                margin: '0', 
                color: '#6B7280', 
                fontSize: '14px',
                maxWidth: '420px',
                marginLeft: 'auto',
                marginRight: 'auto',
                lineHeight: '1.6',
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}>
                {getText('Get started by adding users to your system', 'तुमच्या सिस्टममध्ये वापरकर्ते जोडून प्रारंभ करा', 'तुमच्या सिस्टममध्ये वापरकर्ते जोडून प्रारंभ करा')}
              </p>
            </div>
          ) : (
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
            }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ 
                    padding: '12px 24px', 
                    textAlign: 'left', 
                    fontSize: '12px', 
                    fontWeight: 600, 
                    color: '#6B7280', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}>
                    {getText('Name', 'नाव', 'नाव')}
                  </th>
                  <th style={{ 
                    padding: '12px 24px', 
                    textAlign: 'left', 
                    fontSize: '12px', 
                    fontWeight: 600, 
                    color: '#6B7280', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}>
                    {getText('Email', 'ईमेल', 'ईमेल')}
                  </th>
                  <th style={{ 
                    padding: '12px 24px', 
                    textAlign: 'left', 
                    fontSize: '12px', 
                    fontWeight: 600, 
                    color: '#6B7280', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}>
                    {getText('Employee Code', 'कर्मचारी कोड', 'कर्मचारी कोड')}
                  </th>
                  <th style={{ 
                    padding: '12px 24px', 
                    textAlign: 'left', 
                    fontSize: '12px', 
                    fontWeight: 600, 
                    color: '#6B7280', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}>
                    {getText('Role', 'रोल', 'रोल')}
                  </th>
                  <th style={{ 
                    padding: '12px 24px', 
                    textAlign: 'left', 
                    fontSize: '12px', 
                    fontWeight: 600, 
                    color: '#6B7280', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}>
                    {getText('Projects', 'प्रकल्प', 'प्रकल्प')}
                  </th>
                  <th style={{ 
                    padding: '12px 24px', 
                    textAlign: 'left', 
                    fontSize: '12px', 
                    fontWeight: 600, 
                    color: '#6B7280', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}>
                    {getText('Status', 'स्थिती', 'स्थिती')}
                  </th>
                  <th style={{ 
                    padding: '12px 24px', 
                    textAlign: 'left', 
                    fontSize: '12px', 
                    fontWeight: 600, 
                    color: '#6B7280', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}>
                    {getText('Actions', 'कृती', 'कृती')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, index) => (
                  <tr 
                    key={user._id} 
                    style={{ 
                      borderBottom: index < filteredUsers.length - 1 ? '1px solid #E5E7EB' : 'none',
                      background: 'white',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F9FAFB';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'white';
                    }}
                  >
                    <td style={{ padding: '16px 24px' }}>
                      <div>
                        <div style={{ 
                          fontWeight: 600, 
                          color: '#111827',
                          fontSize: '14px',
                          fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                        }}>
                          {user.firstName} {user.lastName}
                        </div>
                        {user.mobile && (
                          <div style={{ 
                            fontSize: '12px', 
                            color: '#6B7280', 
                            marginTop: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                              <line x1="12" y1="18" x2="12.01" y2="18"/>
                            </svg>
                            {user.mobile}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ 
                      padding: '16px 24px', 
                      fontSize: '14px', 
                      color: '#6B7280',
                      fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}>
                      {user.email}
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      {user.employeeCode ? (
                        <span style={{ 
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 10px', 
                          backgroundColor: '#EFF6FF', 
                          color: '#1d4ed8', 
                          borderRadius: '6px', 
                          fontSize: '12px', 
                          fontWeight: 600,
                          fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                        }}>
                          {user.employeeCode}
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: '14px' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      {user.role ? (
                        <span style={{ 
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 10px', 
                          backgroundColor: '#F3E8FF', 
                          color: '#7e22ce', 
                          borderRadius: '6px', 
                          fontSize: '12px', 
                          fontWeight: 600,
                          fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                        }}>
                          {user.role.name}
                        </span>
                      ) : (
                        <span style={{ 
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 10px', 
                          backgroundColor: '#FEF2F2', 
                          color: '#dc2626', 
                          borderRadius: '6px', 
                          fontSize: '12px', 
                          fontWeight: 600,
                          fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                        }}>
                          {getText('No Role', 'भूमिका नाही', 'भूमिका नाही')}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      {user.projects && user.projects.length > 0 ? (
                        <div style={{ 
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          background: '#F0FDF4',
                          borderRadius: '6px',
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                            <polyline points="9 22 9 12 15 12 15 22"/>
                          </svg>
                          <span style={{ 
                            fontSize: '12px', 
                            fontWeight: 600, 
                            color: '#16a34a',
                            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                          }}>
                            {user.projects.length}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: '14px' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ 
                          position: 'relative', 
                          display: 'inline-block', 
                          width: '44px', 
                          height: '24px',
                          cursor: hasPermission('USER_EDIT') ? 'pointer' : 'not-allowed',
                        }}>
                          <input
                            type="checkbox"
                            checked={user.isActive}
                            onChange={() => handleToggleStatus(user._id)}
                            disabled={!hasPermission('USER_EDIT')}
                            style={{ 
                              opacity: 0, 
                              width: 0, 
                              height: 0,
                              position: 'absolute',
                            }}
                          />
                          <span style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: user.isActive ? '#10B981' : '#D1D5DB',
                            borderRadius: '24px',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            opacity: hasPermission('USER_EDIT') ? 1 : 0.5,
                          }}>
                            <span style={{
                              position: 'absolute',
                              height: '18px',
                              width: '18px',
                              left: user.isActive ? '23px' : '3px',
                              bottom: '3px',
                              backgroundColor: 'white',
                              borderRadius: '50%',
                              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                            }}></span>
                          </span>
                        </label>
                        <span style={{
                          backgroundColor: user.isActive ? '#DCFCE7' : '#F3F4F6',
                          color: user.isActive ? '#047857' : '#6B7280',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                        }}>
                          {user.isActive 
                            ? (getText('Active', 'सक्रिय', 'सक्रिय'))
                            : (getText('Inactive', 'निष्क्रिय', 'निष्क्रिय'))}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {hasPermission('USER_EDIT') && (
                          <button
                            onClick={() => handleEditUser(user)}
                            style={{
                              padding: '8px',
                              width: '36px',
                              height: '36px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'white',
                              border: '1.5px solid #E5E7EB',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              outline: 'none',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#EFF6FF';
                              e.currentTarget.style.borderColor = '#2563EB';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'white';
                              e.currentTarget.style.borderColor = '#E5E7EB';
                            }}
                            title={getText('Edit', 'संपादित करा', 'संपादित करा')}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                        )}
                        {hasPermission('USER_VIEW_ALL') && (
                          <button
                            onClick={() => handleViewCredentials(user)}
                            style={{
                              padding: '8px',
                              width: '36px',
                              height: '36px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'white',
                              border: '1.5px solid #E5E7EB',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              outline: 'none',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#F0FDF4';
                              e.currentTarget.style.borderColor = '#10B981';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'white';
                              e.currentTarget.style.borderColor = '#E5E7EB';
                            }}
                            title={getText('View Credentials', 'क्रेडेन्शियल पहा', 'क्रेडेन्शियल पहा')}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                          </button>
                        )}
                        {hasPermission('USER_DELETE') && (
                          <button
                            onClick={() => handleDeleteUser(user._id)}
                            style={{
                              padding: '8px',
                              width: '36px',
                              height: '36px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'white',
                              border: '1.5px solid #E5E7EB',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              outline: 'none',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#FEF2F2';
                              e.currentTarget.style.borderColor = '#DC2626';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'white';
                              e.currentTarget.style.borderColor = '#E5E7EB';
                            }}
                            title={getText('Delete', 'हटवा', 'हटवा')}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18"/>
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Create/Edit User Modal */}
        {showUserModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', maxWidth: '700px', width: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
                  {editingUser 
                    ? (getText('Edit User', 'वापरकर्ता संपादित करा', 'वापरकर्ता संपादित करा'))
                    : (getText('Create User', 'वापरकर्ता तयार करा', 'वापरकर्ता तयार करा'))}
                </h2>
                <button onClick={() => setShowUserModal(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
              </div>
              
              <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                      {getText('First Name', 'पहिले नाव', 'पहिले नाव')} <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input type="text" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                      {getText('Last Name', 'आडनाव', 'आडनाव')} <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input type="text" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                    {getText('Email', 'ईमेल', 'ईमेल')} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                      {getText('Mobile', 'मोबाईल', 'मोबाईल')}
                    </label>
                    <input 
                      type="tel" 
                      value={formData.mobile} 
                      onChange={(e) => setFormData({ ...formData, mobile: e.target.value })} 
                      placeholder={getText('10-digit number (starts with 6-9)', '10-अंकी क्रमांक (6-9 ने सुरू)', '10-अंकी क्रमांक (6-9 ने सुरू)')} 
                      pattern="[6-9][0-9]{9}"
                      maxLength={10}
                      style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} 
                    />
                    <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      {getText('Example: 9876543210', 'उदाहरण: 9876543210', 'उदाहरण: 9876543210')}
                    </p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                      {getText('Employee Code', 'कर्मचारी कोड', 'कर्मचारी कोड')}
                    </label>
                    <input type="text" value={formData.employeeCode} onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                      {getText('HRMS ID', 'HRMS ID', 'HRMS ID')}
                    </label>
                    <input type="number" value={formData.hrmsId} onChange={(e) => setFormData({ ...formData, hrmsId: e.target.value })} placeholder="PeopleStrong Employee ID" style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                      {getText('Joining Date', 'सामील होण्याचा दिनांक', 'सामील होण्याचा दिनांक')}
                    </label>
                    <input type="date" value={formData.joiningDate} onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                {!editingUser && (
                  <div style={{ marginTop: '16px' }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                      {getText('Password', 'पासवर्ड', 'पासवर्ड')} <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input 
                      type="password" 
                      value={formData.password} 
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
                      placeholder={getText('Minimum 8 characters', 'किमान 8 वर्ण', 'किमान 8 वर्ण')}
                      minLength={8}
                      style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} 
                    />
                    <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      {getText('Must be at least 8 characters long', 'किमान 8 वर्ण लांब असणे आवश्यक आहे', 'किमान 8 वर्ण लांब असणे आवश्यक आहे')}
                    </p>
                  </div>
                )}

                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                    {getText('Role', 'रोल', 'रोल')} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}>
                    <option value="">{getText('Select Role', 'रोल निवडा', 'रोल निवडा')}</option>
                    {roles.map(role => (
                      <option key={role._id} value={role._id}>{role.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                      {getText('Department', 'विभाग', 'विभाग')}
                    </label>
                    <input type="text" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                      {getText('Designation', 'पदनाम', 'पदनाम')}
                    </label>
                    <input type="text" value={formData.designation} onChange={(e) => setFormData({ ...formData, designation: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                    {getText('Reporting Manager', 'रिपोर्टिंग मॅनेजर', 'रिपोर्टिंग मॅनेजर')}
                  </label>
                  <select value={formData.reportingManager} onChange={(e) => setFormData({ ...formData, reportingManager: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}>
                    <option value="">{getText('Select Reporting Manager', 'रिपोर्टिंग मॅनेजर निवडा', 'रिपोर्टिंग मॅनेजर निवडा')}</option>
                    {users
                      .filter(u => u.isActive && (!editingUser || u._id !== editingUser._id))
                      .map(user => (
                        <option key={user._id} value={user._id}>
                          {user.firstName} {user.lastName} ({user.email})
                        </option>
                      ))}
                  </select>
                </div>

                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '10px' }}>
                    {getText('Assigned Projects', 'नियुक्त प्रकल्प', 'नियुक्त प्रकल्प')}
                  </label>
                  <div style={{ 
                    border: '1px solid #d1d5db', 
                    borderRadius: '6px', 
                    padding: '12px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    backgroundColor: '#f9fafb'
                  }}>
                    {projects && projects.length > 0 ? (
                      projects.map(project => (
                        <label 
                          key={project._id} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            padding: '8px',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            transition: 'background-color 0.2s',
                            marginBottom: '4px'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <input
                            type="checkbox"
                            value={project._id}
                            checked={formData.projects.includes(project._id)}
                            onChange={(e) => {
                              const projectId = e.target.value;
                              const isChecked = e.target.checked;
                              setFormData({
                                ...formData,
                                projects: isChecked
                                  ? [...formData.projects, projectId]
                                  : formData.projects.filter(id => id !== projectId)
                              });
                            }}
                            style={{
                              width: '16px',
                              height: '16px',
                              marginRight: '8px',
                              cursor: 'pointer',
                              accentColor: '#7c3aed'
                            }}
                          />
                          <span style={{ fontSize: '14px', color: '#374151' }}>
                            {project.name}
                          </span>
                        </label>
                      ))
                    ) : (
                      <p style={{ fontSize: '14px', color: '#6b7280', textAlign: 'center', padding: '12px' }}>
                        {getText('No projects available', 'कोणतेही प्रकल्प उपलब्ध नाहीत', 'कोणतेही प्रकल्प उपलब्ध नाहीत')}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button onClick={() => setShowUserModal(false)} disabled={saving} style={{ padding: '10px 20px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: 'white', color: '#374151', fontSize: '14px', fontWeight: '500', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>
                  {getText('Cancel', 'रद्द करा', 'रद्द करा')}
                </button>
                <button onClick={handleSaveUser} disabled={saving || !formData.firstName || !formData.lastName || !formData.email || !formData.role} style={{ padding: '10px 20px', border: 'none', borderRadius: '6px', backgroundColor: (!formData.firstName || !formData.lastName || !formData.email || !formData.role || saving) ? '#d1d5db' : '#a855f7', color: 'white', fontSize: '14px', fontWeight: '500', cursor: (!formData.firstName || !formData.lastName || !formData.email || !formData.role || saving) ? 'not-allowed' : 'pointer' }}>
                  {saving ? (getText('Saving...', 'जतन करत आहे...', 'जतन करत आहे...')) : (editingUser ? (getText('Update User', 'वापरकर्ता अद्यतनित करा', 'वापरकर्ता अद्यतनित करा')) : (getText('Create User', 'वापरकर्ता तयार करा', 'वापरकर्ता तयार करा')))}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add from HRMS Modal */}
        {showHRMSModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '12px', maxWidth: '1000px', width: '100%', height: '85vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
                  {getText('Add Users from HRMS', 'HRMS मधून वापरकर्ते जोडा', 'HRMS मधून वापरकर्ते जोडा')}
                </h2>
                <button onClick={() => { setShowHRMSModal(false); setHrmsEmployees([]); setSelectedEmployees([]); setSelectedRole(''); setSelectedProjects([]); setHrmsEmployeeCodes(''); setHrmsSearchQuery(''); }} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
              </div>

              {hrmsEmployees.length === 0 ? (
                <div style={{ padding: '32px' }}>
                  <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px', textAlign: 'center' }}>
                    {getText('Enter employee code(s) or load all employees from HRMS (PeopleStrong)', 'कर्मचारी कोड प्रविष्ट करा किंवा HRMS (PeopleStrong) मधून सर्व कर्मचारी लोड करा', 'कर्मचारी कोड प्रविष्ट करा किंवा HRMS (PeopleStrong) मधून सर्व कर्मचारी लोड करा')}
                  </p>
                  
                  <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    {/* Employee Code Input */}
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                        {getText('Search Employees', 'कर्मचारी शोधा', 'कर्मचारी शोधा')}
                      </label>
                      <input
                        type="text"
                        placeholder={getText('Search by name, code, designation, or department', 'नाव, कोड, पदनाम किंवा विभागाद्वारे शोधा', 'नाव, कोड, पदनाम किंवा विभागाद्वारे शोधा')}
                        value={hrmsEmployeeCodes}
                        onChange={(e) => setHrmsEmployeeCodes(e.target.value)}
                        style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                      />
                      <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                        {getText('💡 Tip: Enter search term (e.g., "District Coordinator", "EMP001", "ICT") or leave blank to load all', '💡 सूचना: शोध शब्द प्रविष्ट करा (उदा., "District Coordinator", "EMP001", "ICT") किंवा सर्व लोड करण्यासाठी रिक्त सोडा', '💡 सूचना: शोध शब्द प्रविष्ट करा (उदा., "District Coordinator", "EMP001", "ICT") किंवा सर्व लोड करण्यासाठी रिक्त सोडा')}
                      </p>
                    </div>

                    {/* Load Button */}
                    <div style={{ textAlign: 'center' }}>
                      <button
                        onClick={handleFetchFromHRMS}
                        disabled={hrmsLoading}
                        style={{ padding: '12px 32px', backgroundColor: '#f97316', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: hrmsLoading ? 'not-allowed' : 'pointer', opacity: hrmsLoading ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                      >
                        <span>🔍</span>
                        {hrmsLoading ? (getText('Loading...', 'लोड करत आहे...', 'लोड करत आहे...')) : (getText('Load Employees from HRMS', 'HRMS मधून कर्मचारी लोड करा', 'HRMS मधून कर्मचारी लोड करा'))}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Search and Selection Controls - Fixed Header */}
                  <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                    {/* Search box */}
                    <div style={{ position: 'relative', marginBottom: '16px' }}>
                      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: '18px' }}>🔍</span>
                      <input
                        type="text"
                        placeholder={getText('Search by name, email, or employee code...', 'नाव, ईमेल किंवा कर्मचारी कोडद्वारे शोधा...', 'नाव, ईमेल किंवा कर्मचारी कोडद्वारे शोधा...')}
                        value={hrmsSearchQuery}
                        onChange={(e) => setHrmsSearchQuery(e.target.value)}
                        style={{ width: '100%', padding: '12px 12px 12px 40px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>

                    {/* Selection Controls */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div>
                        <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                          {getText('Selected', 'निवडले', 'निवडले')}: <span style={{ color: '#7c3aed', fontWeight: '600' }}>{selectedEmployees.length}</span> / {hrmsEmployees.filter(emp => {
                            if (!hrmsSearchQuery) return true;
                            const search = hrmsSearchQuery.toLowerCase();
                            return (
                              emp.employeeCode?.toLowerCase().includes(search) ||
                              emp.firstName?.toLowerCase().includes(search) ||
                              emp.lastName?.toLowerCase().includes(search) ||
                              emp.email?.toLowerCase().includes(search) ||
                              emp.designation?.toLowerCase().includes(search)
                            );
                          }).length}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          const filtered = hrmsEmployees.filter(emp => {
                            if (!hrmsSearchQuery) return true;
                            const search = hrmsSearchQuery.toLowerCase();
                            return (
                              emp.employeeCode?.toLowerCase().includes(search) ||
                              emp.firstName?.toLowerCase().includes(search) ||
                              emp.lastName?.toLowerCase().includes(search) ||
                              emp.email?.toLowerCase().includes(search) ||
                              emp.designation?.toLowerCase().includes(search)
                            );
                          });
                          if (selectedEmployees.length === filtered.length) {
                            setSelectedEmployees([]);
                          } else {
                            setSelectedEmployees(filtered.map(emp => emp.employeeCode));
                          }
                        }}
                        style={{ padding: '8px 20px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
                      >
                        {selectedEmployees.length === hrmsEmployees.filter(emp => {
                          if (!hrmsSearchQuery) return true;
                          const search = hrmsSearchQuery.toLowerCase();
                          return (
                            emp.employeeCode?.toLowerCase().includes(search) ||
                            emp.firstName?.toLowerCase().includes(search) ||
                            emp.lastName?.toLowerCase().includes(search) ||
                            emp.email?.toLowerCase().includes(search) ||
                            emp.designation?.toLowerCase().includes(search)
                          );
                        }).length && selectedEmployees.length > 0 ? (getText('✓ Deselect All', '✓ सर्व अनिवडा', '✓ सर्व अनिवडा')) : (getText('Select All', 'सर्व निवडा', 'सर्व निवडा'))}
                      </button>
                    </div>
                  </div>

                  {/* Employee List - Scrollable Area */}
                  <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '0', minHeight: '200px', backgroundColor: '#f9fafb' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                          <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', width: '40px' }}></th>
                          <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                            {getText('Employee Code', 'कर्मचारी कोड', 'कर्मचारी कोड')}
                          </th>
                          <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                            {getText('Name', 'नाव', 'नाव')}
                          </th>
                          <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                            {getText('Email', 'ईमेल', 'ईमेल')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {hrmsEmployees
                          .filter(emp => {
                            if (!hrmsSearchQuery) return true;
                            const search = hrmsSearchQuery.toLowerCase();
                            return (
                              emp.employeeCode?.toLowerCase().includes(search) ||
                              emp.firstName?.toLowerCase().includes(search) ||
                              emp.lastName?.toLowerCase().includes(search) ||
                              emp.email?.toLowerCase().includes(search) ||
                              emp.designation?.toLowerCase().includes(search)
                            );
                          })
                          .map(employee => (
                            <tr 
                              key={employee.employeeCode} 
                              style={{ 
                                borderBottom: '1px solid #e5e7eb', 
                                cursor: 'pointer',
                                backgroundColor: selectedEmployees.includes(employee.employeeCode) ? '#fef3c7' : 'transparent'
                              }} 
                              onClick={() => {
                                const empId = employee.employeeCode;
                                setSelectedEmployees(prev => 
                                  prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
                                );
                              }}
                            >
                              <td style={{ padding: '12px 8px' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedEmployees.includes(employee.employeeCode)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    const empId = employee.employeeCode;
                                    setSelectedEmployees(prev => 
                                      e.target.checked ? [...prev, empId] : prev.filter(id => id !== empId)
                                    );
                                  }}
                                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                />
                              </td>
                              <td style={{ padding: '12px 8px', fontSize: '14px', color: '#374151', fontWeight: '500' }}>
                                {employee.employeeCode || '-'}
                              </td>
                              <td style={{ padding: '12px 8px', fontSize: '14px', color: '#374151' }}>
                                {employee.firstName} {employee.lastName}
                              </td>
                              <td style={{ padding: '12px 8px', fontSize: '14px', color: '#6b7280' }}>
                                {employee.email || '-'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {hrmsEmployees.filter(emp => {
                      if (!hrmsSearchQuery) return true;
                      const search = hrmsSearchQuery.toLowerCase();
                      return (
                        emp.employeeCode?.toLowerCase().includes(search) ||
                        emp.firstName?.toLowerCase().includes(search) ||
                        emp.lastName?.toLowerCase().includes(search) ||
                        emp.email?.toLowerCase().includes(search) ||
                        emp.designation?.toLowerCase().includes(search)
                      );
                    }).length === 0 && (
                      <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af' }}>
                        {getText('No employees found', 'कर्मचारी आढळले नाहीत', 'कर्मचारी आढळले नाहीत')}
                      </div>
                    )}
                  </div>

                  {/* Role and Project Assignment - Fixed Footer */}
                  {selectedEmployees.length > 0 && (
                    <div style={{ padding: '16px 24px', borderTop: '2px solid #e5e7eb', backgroundColor: '#fefce8', flexShrink: 0, maxHeight: '35vh', overflowY: 'auto' }}>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#854d0e', marginBottom: '6px' }}>
                          📋 {getText('Assign Role to Selected Employees', 'निवडलेल्या कर्मचाऱ्यांना रोल नियुक्त करा', 'निवडलेल्या कर्मचाऱ्यांना रोल नियुक्त करा')} <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <select 
                          value={selectedRole} 
                          onChange={(e) => setSelectedRole(e.target.value)} 
                          style={{ 
                            width: '100%', 
                            padding: '10px', 
                            border: '2px solid #ca8a04', 
                            borderRadius: '6px', 
                            fontSize: '14px', 
                            outline: 'none',
                            backgroundColor: 'white',
                            fontWeight: '500'
                          }}
                        >
                          <option value="">{getText('⚠️ Select Role for All Selected Employees', '⚠️ सर्व निवडलेल्या कर्मचाऱ्यांसाठी रोल निवडा', '⚠️ सर्व निवडलेल्या कर्मचाऱ्यांसाठी रोल निवडा')}</option>
                          {roles.map(role => (
                            <option key={role._id} value={role._id}>{role.name}</option>
                          ))}
                        </select>
                        <p style={{ fontSize: '12px', color: '#92400e', marginTop: '6px', fontStyle: 'italic' }}>
                          💡 {getText('Tip: Employees with the same HRMS code (designation) should typically get the same role.', 'टीप: समान HRMS कोड (पदनाम) असलेल्या कर्मचाऱ्यांना सामान्यतः समान रोल मिळावी.', 'टीप: समान HRMS कोड (पदनाम) असलेल्या कर्मचाऱ्यांना सामान्यतः समान रोल मिळावी.')}
                        </p>
                      </div>
                      
                      {/* Project Assignment */}
                      <div style={{ marginTop: '16px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#854d0e', marginBottom: '6px' }}>
                          🏢 {getText('Assign Projects (Optional)', 'प्रकल्प नियुक्त करा (वैकल्पिक)', 'प्रकल्प नियुक्त करा (वैकल्पिक)')}
                        </label>
                        <div style={{ border: '2px solid #ca8a04', borderRadius: '6px', backgroundColor: 'white', maxHeight: '120px', overflowY: 'auto', padding: '8px' }}>
                          {projects.length === 0 ? (
                            <div style={{ padding: '12px', textAlign: 'center', color: '#92400e', fontSize: '13px' }}>
                              {getText('No projects available', 'कोणतेही प्रकल्प उपलब्ध नाहीत', 'कोणतेही प्रकल्प उपलब्ध नाहीत')}
                            </div>
                          ) : (
                            projects.map(project => (
                              <label 
                                key={project._id} 
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  padding: '8px', 
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef9c3'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedProjects.includes(project._id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedProjects([...selectedProjects, project._id]);
                                    } else {
                                      setSelectedProjects(selectedProjects.filter(id => id !== project._id));
                                    }
                                  }}
                                  style={{ width: '16px', height: '16px', marginRight: '10px', cursor: 'pointer' }}
                                />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                                    {project.name}
                                  </div>
                                  {project.code && (
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                      {getText('Code', 'कोड', 'कोड')}: {project.code}
                                    </div>
                                  )}
                                </div>
                                <span style={{ 
                                  fontSize: '11px', 
                                  padding: '2px 8px', 
                                  borderRadius: '12px',
                                  backgroundColor: project.status === 'active' ? '#dcfce7' : '#fee2e2',
                                  color: project.status === 'active' ? '#166534' : '#991b1b',
                                  fontWeight: '500'
                                }}>
                                  {project.status}
                                </span>
                              </label>
                            ))
                          )}
                        </div>
                        <p style={{ fontSize: '12px', color: '#92400e', marginTop: '6px', fontStyle: 'italic' }}>
                          💡 {getText('Select one or more projects to assign to the selected employees.', 'निवडलेल्या कर्मचाऱ्यांना नियुक्त करण्यासाठी एक किंवा अधिक प्रकल्प निवडा.', 'निवडलेल्या कर्मचाऱ्यांना नियुक्त करण्यासाठी एक किंवा अधिक प्रकल्प निवडा.')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons - Fixed Footer */}
                  <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexShrink: 0, backgroundColor: 'white' }}>
                    <button onClick={() => { setShowHRMSModal(false); setHrmsEmployees([]); setSelectedEmployees([]); setSelectedRole(''); setSelectedProjects([]); setHrmsEmployeeCodes(''); setHrmsSearchQuery(''); }} disabled={saving} style={{ padding: '10px 20px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: 'white', color: '#374151', fontSize: '14px', fontWeight: '500', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>
                      {getText('Cancel', 'रद्द करा', 'रद्द करा')}
                    </button>
                    <button onClick={handleConfirmHRMS} disabled={saving || selectedEmployees.length === 0 || !selectedRole} style={{ padding: '10px 32px', border: 'none', borderRadius: '6px', backgroundColor: (selectedEmployees.length === 0 || !selectedRole || saving) ? '#d1d5db' : '#f97316', color: 'white', fontSize: '14px', fontWeight: '500', cursor: (selectedEmployees.length === 0 || !selectedRole || saving) ? 'not-allowed' : 'pointer' }}>
                      {saving ? getText('Adding...', 'जोडत आहे...', 'जोडत आहे...') : getText(`Add ${selectedEmployees.length} User(s)`, `${selectedEmployees.length} वापरकर्ते जोडा`, `${selectedEmployees.length} वापरकर्ते जोडा`)}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* View Credentials Modal */}
        {showCredentialsModal && selectedUserForCredentials && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}>
              {/* Header */}
              <div style={{
                padding: '24px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: 0 }}>
                      {getText('User Login Credentials', 'वापरकर्ता लॉगिन क्रेडेन्शियल', 'वापरकर्ता लॉगिन क्रेडेन्शियल')}
                    </h2>
                    <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0 0' }}>
                      {selectedUserForCredentials.firstName} {selectedUserForCredentials.lastName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowCredentialsModal(false);
                    setSelectedUserForCredentials(null);
                  }}
                  style={{
                    padding: '8px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div style={{ padding: '24px' }}>
                {/* Project URLs */}
                {selectedUserForCredentials.projects && selectedUserForCredentials.projects.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
                      🌐 {getText('Project Login URLs', 'प्रोजेक्ट लॉगिन URLs', 'प्रोजेक्ट लॉगिन URLs')}
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedUserForCredentials.projects.map((project) => {
                        const projectData = projects.find(p => p._id === project._id);
                        const customPath = (projectData as any)?.branding?.customUrlPath || project.name.toLowerCase().replace(/\s+/g, '');
                        const loginUrl = `${window.location.origin}/${customPath}/portal/login`;
                        
                        return (
                          <div key={project._id} style={{
                            padding: '12px',
                            backgroundColor: '#f9fafb',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px'
                          }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                                {project.name}
                              </div>
                              <div style={{ fontSize: '12px', color: '#10B981', fontFamily: 'monospace' }}>
                                {loginUrl}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(loginUrl);
                                alert(getText('URL copied to clipboard!', 'URL क्लिपबोर्डवर कॉपी केले!', 'URL क्लिपबोर्डवर कॉपी केले!'));
                              }}
                              style={{
                                padding: '6px 12px',
                                border: '1px solid #10B981',
                                borderRadius: '6px',
                                backgroundColor: 'white',
                                color: '#10B981',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {getText('Copy', 'कॉपी', 'कॉपी')}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Username */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                    👤 {getText('Username (Email)', 'वापरकर्तानाव (ईमेल)', 'वापरकर्तानाव (ईमेल)')}
                  </label>
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#111827',
                    fontFamily: 'monospace',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}>
                    <span>{selectedUserForCredentials.email}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedUserForCredentials.email);
                        alert(getText('Email copied to clipboard!', 'ईमेल क्लिपबोर्डवर कॉपी केले!', 'ईमेल क्लिपबोर्डवर कॉपी केले!'));
                      }}
                      style={{
                        padding: '4px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      {getText('Copy', 'कॉपी', 'कॉपी')}
                    </button>
                  </div>
                </div>

                {/* Password - Development Phase */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                    🔐 {getText('Password', 'पासवर्ड', 'पासवर्ड')}
                  </label>
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#111827',
                    fontFamily: 'monospace',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}>
                    <span>{getDefaultPassword(selectedUserForCredentials)}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(getDefaultPassword(selectedUserForCredentials));
                        alert(getText('Password copied to clipboard!', 'पासवर्ड क्लिपबोर्डवर कॉपी केले!', 'पासवर्ड क्लिपबोर्डवर कॉपी केले!'));
                      }}
                      style={{
                        padding: '4px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      {getText('Copy', 'कॉपी', 'कॉपी')}
                    </button>
                  </div>
                </div>

                {/* Dev Phase Notice */}
                <div style={{
                  padding: '12px',
                  backgroundColor: '#DBEAFE',
                  border: '1px solid #3B82F6',
                  borderRadius: '8px',
                  marginBottom: '20px'
                }}>
                  <p style={{ fontSize: '12px', color: '#1E40AF', margin: 0, lineHeight: '1.5' }}>
                    ℹ️ {getText(`Development Phase: Default password is "${getDefaultPassword(selectedUserForCredentials)}". Users can change it after first login.`, `विकास टप्पा: डीफॉल्ट पासवर्ड "${getDefaultPassword(selectedUserForCredentials)}" आहे. वापरकर्ते पहिल्या लॉगिननंतर ते बदलू शकतात.`, `विकास टप्पा: डीफॉल्ट पासवर्ड "${getDefaultPassword(selectedUserForCredentials)}" आहे. वापरकर्ते पहिल्या लॉगिननंतर ते बदलू शकतात.`)}
                  </p>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => {
                      setShowCredentialsModal(false);
                      setSelectedUserForCredentials(null);
                    }}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      color: '#374151',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {getText('Close', 'बंद करा', 'बंद करा')}
                  </button>
                  {hasPermission('USER_RESET_PASSWORD') && (
                    <button
                      onClick={() => {
                        setShowCredentialsModal(false);
                        setResetPasswordUser(selectedUserForCredentials);
                        setShowResetPasswordModal(true);
                        setSelectedUserForCredentials(null);
                        setNewPassword('');
                        setConfirmPassword('');
                      }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        border: 'none',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #2563EB 0%, #1d4ed8 100%)',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      {getText('Reset Password', 'पासवर्ड रीसेट करा', 'पासवर्ड रीसेट करा')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reset Password Modal */}
        {showResetPasswordModal && resetPasswordUser && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              maxWidth: '450px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}>
              {/* Header */}
              <div style={{
                padding: '24px',
                borderBottom: '1px solid #e5e7eb'
              }}>
                <h3 style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#111827',
                  margin: 0
                }}>
                  {getText('Reset Password', 'पासवर्ड रीसेट करा', 'पासवर्ड रीसेट करा')}
                </h3>
                <p style={{
                  fontSize: '14px',
                  color: '#6B7280',
                  margin: '8px 0 0 0'
                }}>
                  {getText('Set new password for', 'यासाठी नवीन पासवर्ड सेट करा', 'यासाठी नवीन पासवर्ड सेट करा')}: {resetPasswordUser.firstName} {resetPasswordUser.lastName}
                </p>
              </div>

              {/* Form */}
              <div style={{ padding: '24px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    {getText('New Password', 'नवीन पासवर्ड', 'नवीन पासवर्ड')} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={getText('Enter new password (min. 6 characters)', 'नवीन पासवर्ड एंटर करा (किमान 6 वर्ण)', 'नवीन पासवर्ड एंटर करा (किमान 6 वर्ण)')}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    {getText('Confirm Password', 'पासवर्डची पुष्टी करा', 'पासवर्डची पुष्टी करा')} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={getText('Re-enter new password', 'नवीन पासवर्ड पुन्हा एंटर करा', 'नवीन पासवर्ड पुन्हा एंटर करा')}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => {
                      setShowResetPasswordModal(false);
                      setResetPasswordUser(null);
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      color: '#374151',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {getText('Cancel', 'रद्द करा', 'रद्द करा')}
                  </button>
                  <button
                    onClick={handleResetPassword}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: 'none',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #2563EB 0%, #1d4ed8 100%)',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {getText('Reset Password', 'पासवर्ड रीसेट करा', 'पासवर्ड रीसेट करा')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );

  if (wrapWithLayout) {
    return <DashboardLayout>{mainContent}</DashboardLayout>;
  }
  
  return mainContent;
};

export default UserManagement;
