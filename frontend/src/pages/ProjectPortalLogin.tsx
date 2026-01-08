import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { getFirstAvailableRoute } from '../utils/loginRedirect';
import { API_CONFIG } from '../config/constants';
import { LanguageToggle } from '../components/LanguageToggle';

interface LoginFormData {
  email: string;
  password: string;
}

interface ProjectBranding {
  projectId: string;
  name: string;
  code: string;
  branding: {
    logo: string | null;
    colorTheme: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
    };
    footerText?: string;
  };
}

const ProjectPortalLogin: React.FC = () => {
  const navigate = useNavigate();
  const { customUrlPath } = useParams<{ customUrlPath: string }>();
  const { t } = useTranslation();

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [projectBranding, setProjectBranding] = useState<ProjectBranding | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  // Validation schema
  const loginSchema = yup.object({
    email: yup
      .string()
      .required(t('emailRequired'))
      .email(t('emailInvalid')),
    password: yup
      .string()
      .required(t('passwordRequired'))
      .min(6, t('passwordMinLengthError'))
  });

  // Form hook
  const loginForm = useForm<LoginFormData>({
    resolver: yupResolver(loginSchema),
    mode: 'onBlur'
  });

  useEffect(() => {
    fetchProjectBranding();
  }, [customUrlPath]);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('authToken');
    if (token) {
      axios
        .get(`${API_CONFIG.API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then(() => {
          // Redirect to first available route based on permissions
          const redirectPath = getFirstAvailableRoute(JSON.parse(localStorage.getItem('userPermissions') || '[]'));
          navigate(`/${customUrlPath}/portal/${redirectPath}`);
        })
        .catch(() => {
          localStorage.removeItem('authToken');
        });
    }
  }, [customUrlPath, navigate]);

  const fetchProjectBranding = async () => {
    try {
      setBrandingLoading(true);
      setErrorMessage(''); // Clear any previous errors
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`,
        {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        }
      );
      
      console.log('Project branding response:', response.data);
      
      if (response.data.success) {
        setProjectBranding(response.data.data);
        
        // Apply theme colors
        if (response.data.data.branding?.colorTheme) {
          const { primary, secondary, accent } = response.data.data.branding.colorTheme;
          document.documentElement.style.setProperty('--primary-main', primary);
          document.documentElement.style.setProperty('--primary-dark', secondary);
          document.documentElement.style.setProperty('--accent-main', accent);
        }
      } else {
        console.error('Failed to fetch project branding:', response.data);
        // Use default branding if API fails
        setProjectBranding({
          projectId: '',
          name: 'Portal',
          code: '',
          branding: {
            logo: null,
            colorTheme: {
              primary: '#667eea',
              secondary: '#1f2937',
              accent: '#764ba2',
              background: '#ffffff',
            },
          },
        });
      }
    } catch (err: any) {
      console.error('Error fetching project branding:', err);
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });
      
      // Use default branding on error
      setProjectBranding({
        projectId: '',
        name: 'Portal',
        code: '',
        branding: {
          logo: null,
          colorTheme: {
            primary: '#667eea',
            secondary: '#1f2937',
            accent: '#764ba2',
            background: '#ffffff',
          },
        },
      });
      
      // Only show error if it's not a connection issue
      if (err.response) {
        setErrorMessage(`Failed to load project information: ${err.response.data?.message || err.message}`);
      } else if (err.request) {
        setErrorMessage('Cannot connect to server. Please check if the backend is running on port 3003.');
      } else {
        setErrorMessage('Failed to load project information. Using default settings.');
      }
    } finally {
      setBrandingLoading(false);
    }
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    fetchProjectBranding();
  };

  const handleLogin = async (data: LoginFormData) => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      const response = await axios.post(
        `${API_CONFIG.API_URL}/auth/project/${customUrlPath}/login`,
        {
          email: data.email,
          password: data.password,
        }
      );

      if (response.data.success) {
        const { token, user } = response.data.data;

        // Store authentication data
        localStorage.setItem('authToken', token);
        localStorage.setItem('userId', user.id);
        localStorage.setItem('userEmail', user.email);
        localStorage.setItem('userName', user.name);
        localStorage.setItem('userRole', user.role.code);
        localStorage.setItem('userRoleName', user.role.name);
        localStorage.setItem('userPermissions', JSON.stringify(user.role.permissions || []));

        setSuccessMessage('Login successful! Redirecting...');
        
        // Redirect to first available route based on permissions
        setTimeout(() => {
          const redirectPath = getFirstAvailableRoute(user.role.permissions || []);
          navigate(`/${customUrlPath}/portal/${redirectPath}`);
        }, 500);
      } else {
        setErrorMessage(response.data.message || 'Login failed');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.response?.data?.message) {
        setErrorMessage(err.response.data.message);
      } else if (err.response?.status === 401) {
        setErrorMessage('Invalid email or password');
      } else if (err.response?.status === 403) {
        setErrorMessage('Access denied. Students cannot access this portal.');
      } else {
        setErrorMessage('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (brandingLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid rgba(255, 255, 255, 0.3)',
          borderTopColor: 'white',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}></div>
      </div>
    );
  }

  const primaryColor = projectBranding?.branding?.colorTheme?.primary || '#667eea';
  const secondaryColor = projectBranding?.branding?.colorTheme?.secondary || '#1f2937';
  const accentColor = projectBranding?.branding?.colorTheme?.accent || '#764ba2';

  return (
    <div className="min-h-screen flex" style={{ fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif' }}>
      {/* Language Toggle - Top Right */}
      <div style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 1000,
      }}>
        <LanguageToggle />
      </div>
      
      {/* Left Side - Branding & Image */}
      <div style={{
        flex: 1,
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '4rem',
        color: 'white',
      }}>
        {/* Decorative Pattern Overlay */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.05\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
          opacity: 0.4,
        }}></div>

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: '500px' }}>
          {/* Logo/Icon */}
          {projectBranding?.branding?.logo ? (
            <div style={{
              margin: '0 auto 2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <img
                src={projectBranding.branding.logo}
                alt={projectBranding.name}
                style={{
                  maxWidth: '200px',
                  maxHeight: '120px',
                  height: 'auto',
                }}
              />
            </div>
          ) : (
            <div style={{
              width: '120px',
              height: '120px',
              margin: '0 auto 2rem',
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              borderRadius: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
            }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
          )}

          {/* Title */}
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            marginBottom: '1rem',
            lineHeight: 1.2,
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
          }}>
            {projectBranding?.name || 'Portal'}
          </h1>

          <p style={{
            fontSize: '1.125rem',
            marginBottom: '2rem',
            opacity: 0.95,
            lineHeight: 1.6,
          }}>
            Streamline your support operations with our comprehensive query and management system
          </p>

          {/* Features List */}
          <div style={{ textAlign: 'left', marginTop: '3rem' }}>
            {[
              { icon: '🎫', text: 'Efficient Query Management' },
              { icon: '📊', text: 'Real-time Analytics Dashboard' },
              { icon: '🔔', text: 'Smart Notifications & Alerts' },
              { icon: '🛡️', text: 'Enterprise-grade Security' },
            ].map((feature, index) => (
              <div key={index} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem',
                marginBottom: '0.75rem',
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}>
                <span style={{ fontSize: '1.5rem' }}>{feature.icon}</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>{feature.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Decoration */}
        <div style={{
          position: 'absolute',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '0.875rem',
          opacity: 0.8,
        }}>
          {projectBranding?.branding?.footerText || `© 2025 ${projectBranding?.name || 'Portal'}. All rights reserved.`}
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#F9FAFB',
        position: 'relative',
      }}>
        {/* Main Content Area */}
        <main 
          id="main-content" 
          style={{
            width: '100%',
            maxWidth: '440px',
          }}
          role="main"
        >
          {/* Success Message */}
          {successMessage && (
            <div 
              style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                background: '#DCFCE7',
                borderLeft: '4px solid #10B981',
                borderRadius: '0 8px 8px 0',
              }}
              role="alert"
              aria-live="polite"
            >
              <p style={{ fontSize: '0.875rem', color: '#047857', margin: 0 }}>{successMessage}</p>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div 
              style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                background: '#FEE2E2',
                borderLeft: '4px solid #EF4444',
                borderRadius: '0 8px 8px 0',
              }}
              role="alert"
              aria-live="polite"
            >
              <p style={{ fontSize: '0.875rem', color: '#DC2626', margin: '0 0 0.5rem 0' }}>{errorMessage}</p>
              {errorMessage.includes('Cannot connect') && (
                <button
                  onClick={handleRetry}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem 1rem',
                    background: '#DC2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}
                >
                  Retry Connection
                </button>
              )}
            </div>
          )}

          {/* Login Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                margin: '0 auto 1rem',
                background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h1 style={{ fontSize: '1.875rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
                Welcome to {projectBranding?.name || 'Portal'}
              </h1>
              <p style={{ fontSize: '0.875rem', color: primaryColor, fontWeight: 500 }}>
                {t('signInToContinue')}
              </p>
            </div>

            <form onSubmit={loginForm.handleSubmit(handleLogin)} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Email Field */}
              <div>
                <label 
                  htmlFor="email" 
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#111827',
                    marginBottom: '0.5rem',
                  }}
                >
                  {t('emailLabel')}
                  <span style={{ color: '#EF4444', marginLeft: '0.25rem' }}>*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  {...loginForm.register('email')}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    fontSize: '0.875rem',
                    border: loginForm.formState.errors.email ? '2px solid #EF4444' : '2px solid #E5E7EB',
                    borderRadius: '8px',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}
                  placeholder={t('emailPlaceholder')}
                  onFocus={(e) => {
                    if (!loginForm.formState.errors.email) {
                      e.currentTarget.style.borderColor = primaryColor;
                      e.currentTarget.style.boxShadow = `0 0 0 3px ${primaryColor}20`;
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = loginForm.formState.errors.email ? '#EF4444' : '#E5E7EB';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                {loginForm.formState.errors.email && (
                  <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#EF4444' }} role="alert">
                    {loginForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div>
                <label 
                  htmlFor="password" 
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: '#111827',
                    marginBottom: '0.5rem',
                  }}
                >
                  {t('passwordLabel')}
                  <span style={{ color: '#EF4444', marginLeft: '0.25rem' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    {...loginForm.register('password')}
                    style={{
                      width: '100%',
                      padding: '0.75rem 3rem 0.75rem 1rem',
                      fontSize: '0.875rem',
                      border: loginForm.formState.errors.password ? '2px solid #EF4444' : '2px solid #E5E7EB',
                      borderRadius: '8px',
                      outline: 'none',
                      transition: 'all 0.2s ease',
                      fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                    placeholder="Enter your password"
                    onFocus={(e) => {
                      if (!loginForm.formState.errors.password) {
                        e.currentTarget.style.borderColor = primaryColor;
                        e.currentTarget.style.boxShadow = `0 0 0 3px ${primaryColor}20`;
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = loginForm.formState.errors.password ? '#EF4444' : '#E5E7EB';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {showPassword ? (
                      <EyeSlashIcon style={{ width: '20px', height: '20px', color: '#6B7280' }} />
                    ) : (
                      <EyeIcon style={{ width: '20px', height: '20px', color: '#6B7280' }} />
                    )}
                  </button>
                </div>
                {loginForm.formState.errors.password && (
                  <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#EF4444' }} role="alert">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              {/* Forgot Password Link */}
              <div style={{ textAlign: 'right' }}>
                <Link
                  to={`/${customUrlPath}/portal/forgot-password`}
                  style={{
                    fontSize: '0.875rem',
                    color: primaryColor,
                    textDecoration: 'underline',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}
                >
                  Forgot your password?
                </Link>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '0.875rem 1.5rem',
                  background: isLoading ? '#9CA3AF' : primaryColor,
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                  boxShadow: `0 2px 6px ${primaryColor}40`,
                  transition: 'all 0.2s ease',
                  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = `0 4px 12px ${primaryColor}50`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = `0 2px 6px ${primaryColor}40`;
                  }
                }}
              >
                {isLoading ? t('signingIn') : t('loginButton')}
              </button>
            </form>
          </div>

          {/* Trust Indicators */}
          <div style={{ marginTop: '2rem', textAlign: 'center' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              color: '#6B7280',
              marginBottom: '1rem',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span>{t('sslSecured')}</span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
              fontSize: '0.75rem',
              color: '#9CA3AF',
            }}>
              <a href="#" style={{ color: '#9CA3AF', textDecoration: 'none' }}>{t('privacyPolicy')}</a>
              <span>•</span>
              <a href="#" style={{ color: '#9CA3AF', textDecoration: 'none' }}>{t('termsOfService')}</a>
              <span>•</span>
              <a href="#" style={{ color: '#9CA3AF', textDecoration: 'none' }}>{t('helpSupport')}</a>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ProjectPortalLogin;
