import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  EnvelopeIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { getFirstAvailableRoute } from '../utils/loginRedirect';
import { API_CONFIG } from '../config/constants';

interface ProjectBranding {
  projectId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
}

const AgentLogin: React.FC = () => {
  const navigate = useNavigate();
  const { customUrlPath } = useParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectBranding, setProjectBranding] = useState<ProjectBranding | null>(null);
  const [loadingBranding, setLoadingBranding] = useState(true);

  useEffect(() => {
    // Check if already logged in
    const token = localStorage.getItem('authToken');
    if (token) {
      // Verify it's an agent token by checking role
      verifyTokenAndRedirect(token);
    } else {
      fetchProjectBranding();
    }
  }, [customUrlPath, navigate]);

  const verifyTokenAndRedirect = async (token: string) => {
    try {
      const response = await axios.get(`${API_CONFIG.API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const user = response.data.data;
      
      // Route protection will handle access control based on permissions
      const redirectPath = getFirstAvailableRoute(user.role.permissions || []);
      navigate(`/${customUrlPath}/portal/${redirectPath}`);
    } catch (error) {
      console.error('Token verification failed:', error);
      localStorage.removeItem('authToken');
    }
    
    fetchProjectBranding();
  };

  const fetchProjectBranding = async () => {
    try {
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`
      );
      const brandingData = response.data.success ? response.data.data : response.data;
      setProjectBranding(brandingData);
    } catch (error) {
      console.error('Error fetching project branding:', error);
      setError('Project not found');
    } finally {
      setLoadingBranding(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(
        `${API_CONFIG.API_URL}/auth/project/${customUrlPath}/login`,
        { email, password }
      );

      const { token, user } = response.data.data;
      
      // Store token and let route protection handle access control
      localStorage.setItem('authToken', token);
      localStorage.setItem('userPermissions', JSON.stringify(user.role.permissions || []));

      // Redirect to first available route based on permissions
      const redirectPath = getFirstAvailableRoute(user.role.permissions || []);
      navigate(`/${customUrlPath}/portal/${redirectPath}`);
    } catch (error: any) {
      console.error('Login error:', error);
      setError(
        error.response?.data?.message || 'Login failed. Please check your credentials.'
      );
      setLoading(false);
    }
  };

  if (loadingBranding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !projectBranding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <ExclamationCircleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Project Not Found</h2>
          <p className="text-gray-600 mb-4">The project you're looking for doesn't exist.</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Main Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Left Side - Branding */}
      <div
        className="hidden lg:flex lg:w-1/2 items-center justify-center p-12"
        style={{
          background: projectBranding
            ? `linear-gradient(135deg, ${projectBranding.primaryColor} 0%, ${projectBranding.secondaryColor} 100%)`
            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
      >
        <div className="text-center text-white">
          {projectBranding?.logoUrl && (
            <img
              src={projectBranding.logoUrl}
              alt={projectBranding.name}
              className="h-32 w-auto mx-auto mb-8 drop-shadow-lg"
            />
          )}
          <h1 className="text-5xl font-bold mb-4">{projectBranding?.name || 'Helpdesk'}</h1>
          <p className="text-xl opacity-90">Agent Portal</p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            {projectBranding?.logoUrl && (
              <img
                src={projectBranding.logoUrl}
                alt={projectBranding.name}
                className="h-20 w-auto mx-auto mb-4"
              />
            )}
            <h2 className="text-2xl font-bold text-gray-900">{projectBranding?.name}</h2>
            <p className="text-gray-600">Agent Portal</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="mb-6">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h2>
              <p className="text-gray-600">Sign in to access your dashboard</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
                <ExclamationCircleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="agent@example.com"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <LockClosedIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
                    ) : (
                      <EyeIcon className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors" />
                    )}
                  </button>
                </div>
              </div>

              {/* Forgot Password */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                    Remember me
                  </label>
                </div>
                <a
                  href={`/${customUrlPath}/forgot-password`}
                  className="text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
                >
                  Forgot password?
                </a>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-lg text-white font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: projectBranding
                    ? `linear-gradient(135deg, ${projectBranding.primaryColor} 0%, ${projectBranding.secondaryColor} 100%)`
                    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                }}
              >
                {loading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Signing in...</span>
                  </div>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            {/* Footer Links */}
            <div className="mt-6 pt-6 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-600">
                Are you a student?{' '}
                <a
                  href={`/${customUrlPath}/submit-ticket`}
                  className="font-medium text-blue-600 hover:text-blue-500 transition-colors"
                >
                  Go to Student Portal
                </a>
              </p>
            </div>
          </div>

          {/* Help Text */}
          <p className="mt-6 text-center text-sm text-gray-600">
            Need help? Contact your system administrator
          </p>
        </div>
      </div>
    </div>
  );
};

export default AgentLogin;
