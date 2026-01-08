/**
 * ⚠️ POTENTIAL DUPLICATE - VERIFY BEFORE USE
 * 
 * There is another ProjectLogin component at: src/pages/ProjectLogin.tsx
 * The pages/ version is currently imported in App.tsx (line 4)
 * 
 * TODO: Verify which version is correct and archive the other
 * - pages/ProjectLogin.tsx (768 lines) - Currently used in App.tsx
 * - components/ProjectLogin.tsx (769 lines) - This file
 * 
 * Action: This components/ version should likely be archived
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useTranslation } from 'react-i18next';
import { API_CONFIG } from '../../config/constants';
import {
  EyeIcon, 
  EyeSlashIcon
} from '@heroicons/react/24/outline';

// Types
interface LoginFormData {
  email: string;
  password: string;
}

interface ProjectBranding {
  projectId: string;
  name: string;
  customUrlPath: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  welcomeText?: string;
  footerText?: string;
}

const ProjectLogin: React.FC = () => {
  const { customUrlPath } = useParams<{ customUrlPath: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState('');
  const [projectBranding, setProjectBranding] = useState<ProjectBranding | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Language options
  const languages = [
    { code: 'en', name: t('english'), flag: '🇮🇳' },
    { code: 'mr', name: t('marathi'), flag: '🇮🇳' }
  ];

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

  // Fetch project branding on mount
  useEffect(() => {
    const fetchProjectBranding = async () => {
      try {
        setProjectLoading(true);
        const response = await fetch(`${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`);
        
        if (!response.ok) {
          throw new Error('Project not found');
        }
        
        const result = await response.json();
        if (result.success && result.data) {
          setProjectBranding(result.data);
        } else {
          throw new Error('Invalid project data');
        }
      } catch (error: any) {
        setProjectError(error.message || 'Failed to load project');
      } finally {
        setProjectLoading(false);
      }
    };

    if (customUrlPath) {
      fetchProjectBranding();
    }
  }, [customUrlPath]);

  // Handle login
  const handleLogin = async (data: LoginFormData) => {
    if (!projectBranding) return;

    setIsLoading(true);
    setErrorMessage('');
    
    try {
      const response = await fetch(`${API_CONFIG.API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          projectId: projectBranding.projectId
        }),
        credentials: 'include',
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Login failed');
      }

      if (result.success) {
        // Store auth data
        localStorage.setItem('authToken', result.data.token);
        localStorage.setItem('userId', result.data.user.id);
        localStorage.setItem('userEmail', result.data.user.email);
        localStorage.setItem('userRole', result.data.user.role);
        localStorage.setItem('projectId', projectBranding.projectId);
        
        // Check if user has accepted EULA
        if (result.data.user.eulaAccepted) {
          // EULA already accepted, go to dashboard
          window.location.href = '/dashboard';
        } else {
          // EULA not accepted, redirect to EULA page
          window.location.href = '/eula';
        }
      }
    } catch (error: any) {
      setErrorMessage(error.message || t('loginFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode);
  };

  // Loading state
  if (projectLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F9FAFB',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '64px',
            height: '64px',
            margin: '0 auto 1rem',
            border: '4px solid #E5E7EB',
            borderTop: '4px solid #2563EB',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}></div>
          <p style={{ color: '#6B7280', fontSize: '0.875rem' }}>Loading project...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (projectError || !projectBranding) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F9FAFB',
      }}>
        <div style={{
          maxWidth: '400px',
          padding: '2rem',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          textAlign: 'center',
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            margin: '0 auto 1rem',
            background: '#FEE2E2',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
            Project Not Found
          </h2>
          <p style={{ color: '#6B7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            {projectError || 'The project you are looking for does not exist or has been removed.'}
          </p>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#2563EB',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  // Extract colors with defaults
  const primaryColor = projectBranding.primaryColor || '#2563EB';
  const secondaryColor = projectBranding.secondaryColor || '#764ba2';
  
  return (
    <div className="min-h-screen flex" style={{ fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif' }}>
      {/* Skip to main content */}
      <a 
        href="#main-content" 
        className="skip-link"
        aria-label={t('skipToMain')}
        style={{
          position: 'absolute',
          left: '-9999px',
          zIndex: 999,
          padding: '1rem',
          background: primaryColor,
          color: 'white',
          textDecoration: 'none',
        }}
      >
        {t('skipToMain')}
      </a>

      {/* Left Side - Project Branding */}
      <div style={{
        flex: 1,
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
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
          {/* Logo */}
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
            overflow: 'hidden',
          }}>
            {projectBranding.logoUrl ? (
              <img 
                src={projectBranding.logoUrl} 
                alt={`${projectBranding.name} logo`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            ) : (
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            )}
          </div>

          {/* Project Name */}
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            marginBottom: '1rem',
            lineHeight: 1.2,
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
          }}>
            {projectBranding.name}
          </h1>

          {/* Welcome Text */}
          <p style={{
            fontSize: '1.125rem',
            marginBottom: '2rem',
            opacity: 0.95,
            lineHeight: 1.6,
          }}>
            {projectBranding.welcomeText || 'Welcome to our helpdesk portal'}
          </p>

          {/* Features List */}
          <div style={{ textAlign: 'left', marginTop: '3rem' }}>
            {[
              { icon: '🎫', text: 'Efficient Ticket Management' },
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

        {/* Footer Text */}
        <div style={{
          position: 'absolute',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '0.875rem',
          opacity: 0.8,
        }}>
          {projectBranding.footerText || `© 2025 ${projectBranding.name}. All rights reserved.`}
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div style={{
        flex: 1,
        background: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}>
        {/* Language Selector - Top Right */}
        <div style={{
          position: 'absolute',
          top: '2rem',
          right: '2rem',
          zIndex: 10,
        }}>
          <label htmlFor="language-select" className="sr-only">
            {t('selectLanguage')}
          </label>
          <select
            id="language-select"
            value={i18n.language}
            onChange={(e) => changeLanguage(e.target.value)}
            style={{
              appearance: 'none',
              background: '#F9FAFB',
              border: '2px solid #E5E7EB',
              borderRadius: '8px',
              padding: '0.5rem 2rem 0.5rem 0.75rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
              outline: 'none',
              fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
            }}
            aria-label={t('selectLanguage')}
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.flag} {lang.name}
              </option>
            ))}
          </select>
        </div>

        {/* Main Content Area */}
        <main 
          id="main-content" 
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
          role="main"
        >
          <div style={{ width: '100%', maxWidth: '440px' }}>
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
                <p style={{ fontSize: '0.875rem', color: '#DC2626', margin: 0 }}>{errorMessage}</p>
              </div>
            )}

            {/* Login Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  margin: '0 auto 1rem',
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <h1 style={{
                  fontSize: '1.875rem',
                  fontWeight: 700,
                  color: '#111827',
                  marginBottom: '0.5rem',
                  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                }}>
                  {t('welcomeTitle')}
                </h1>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#6B7280',
                  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                }}>
                  {t('welcomeSubtitle')}
                </p>
              </div>

              <form onSubmit={loginForm.handleSubmit(handleLogin)} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Email Field */}
                <div>
                  <label 
                    htmlFor="email" 
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '0.5rem',
                      fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }}>
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    {t('emailLabel')}
                    <span style={{ color: '#EF4444', marginLeft: '0.25rem' }}>*</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    {...loginForm.register('email')}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      fontSize: '0.875rem',
                      border: `2px solid ${loginForm.formState.errors.email ? '#EF4444' : '#E5E7EB'}`,
                      borderRadius: '8px',
                      outline: 'none',
                      transition: 'all 0.2s',
                      fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                    placeholder={t('emailPlaceholder')}
                    onFocus={(e) => {
                      if (!loginForm.formState.errors.email) {
                        e.target.style.borderColor = primaryColor;
                        e.target.style.boxShadow = `0 0 0 3px ${primaryColor}1A`;
                      }
                    }}
                    onBlur={(e) => {
                      if (!loginForm.formState.errors.email) {
                        e.target.style.borderColor = '#E5E7EB';
                        e.target.style.boxShadow = 'none';
                      }
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
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '0.5rem',
                      fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    {t('passwordLabel')}
                    <span style={{ color: '#EF4444', marginLeft: '0.25rem' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      {...loginForm.register('password')}
                      style={{
                        width: '100%',
                        padding: '0.75rem 3rem 0.75rem 1rem',
                        fontSize: '0.875rem',
                        border: `2px solid ${loginForm.formState.errors.password ? '#EF4444' : '#E5E7EB'}`,
                        borderRadius: '8px',
                        outline: 'none',
                        transition: 'all 0.2s',
                        fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                      }}
                      placeholder={t('passwordPlaceholder')}
                      onFocus={(e) => {
                        if (!loginForm.formState.errors.password) {
                          e.target.style.borderColor = primaryColor;
                          e.target.style.boxShadow = `0 0 0 3px ${primaryColor}1A`;
                        }
                      }}
                      onBlur={(e) => {
                        if (!loginForm.formState.errors.password) {
                          e.target.style.borderColor = '#E5E7EB';
                          e.target.style.boxShadow = 'none';
                        }
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
                      aria-label={showPassword ? t('hidePassword') : t('showPassword')}
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
                  <button
                    type="button"
                    onClick={() => alert('Forgot password flow not implemented for project login yet')}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '0.875rem',
                      color: primaryColor,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                    }}
                  >
                    {t('forgotPassword')}
                  </button>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '0.875rem 1.5rem',
                    background: primaryColor,
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.6 : 1,
                    boxShadow: `0 2px 6px ${primaryColor}3D`,
                    transition: 'all 0.2s ease',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.opacity = '0.9';
                      e.currentTarget.style.boxShadow = `0 4px 12px ${primaryColor}52`;
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.opacity = '1';
                      e.currentTarget.style.boxShadow = `0 2px 6px ${primaryColor}3D`;
                      e.currentTarget.style.transform = 'translateY(0)';
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
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '1rem',
                fontSize: '0.875rem',
              }}>
                <a 
                  href="#privacy" 
                  style={{
                    color: '#6B7280',
                    textDecoration: 'underline',
                  }}
                >
                  {t('privacyPolicy')}
                </a>
                <a 
                  href="#terms" 
                  style={{
                    color: '#6B7280',
                    textDecoration: 'underline',
                  }}
                >
                  {t('termsOfService')}
                </a>
                <a 
                  href="#help" 
                  style={{
                    color: '#6B7280',
                    textDecoration: 'underline',
                  }}
                >
                  {t('helpSupport')}
                </a>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Add keyframes for loading animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ProjectLogin;
