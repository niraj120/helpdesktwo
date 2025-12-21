import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import { API_CONFIG } from '../config/constants';
import KBChatbot from './KBChatbot';
import {
  EyeIcon, 
  EyeSlashIcon, 
  ShieldCheckIcon,
  LockClosedIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';

// Types
interface LoginFormData {
  email: string;
  password: string;
}

interface ForgotPasswordFormData {
  email: string;
}

interface OTPFormData {
  otp: string;
}

interface ResetPasswordFormData {
  newPassword: string;
  confirmPassword: string;
}

type LoginStep = 'login' | 'forgot-password' | 'otp-verification' | 'reset-password' | '2fa-verification';

const Login: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [currentStep, setCurrentStep] = useState<LoginStep>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [twoFactorData, setTwoFactorData] = useState<{
    email: string;
    password: string;
    tempToken: string;
  } | null>(null);
  const [twoFactorOtp, setTwoFactorOtp] = useState('');
  const [announcementBanner, setAnnouncementBanner] = useState<{
    message: string;
    type: 'plain' | 'rich';
  } | null>(null);
  const [loginBackgroundImage, setLoginBackgroundImage] = useState<string>('');
  const [projectFavicon, setProjectFavicon] = useState<string>('');

  // Fetch project configuration (announcement banner, background image, favicon)
  // Only for project-specific login pages, not for super admin login
  useEffect(() => {
    const fetchProjectConfiguration = async () => {
      try {
        // Get the current hostname
        const hostname = window.location.hostname;
        
        // Skip project configuration fetch for:
        // 1. Super admin login (main domain without project path)
        // 2. localhost (development environment)
        // Only fetch for production domains that should have project-specific branding
        if (hostname === 'localhost' || hostname === 'helpdesk.hubblehox.ai') {
          console.log('Skipping project configuration fetch for super admin/main domain');
          return;
        }
        
        const response = await fetch(`${API_CONFIG.BASE_URL}/api/projects/by-domain/${hostname}`);
        if (response.ok) {
          const project = await response.json();
          
          // Set announcement banner
          if (project?.configuration?.announcementBanner?.message) {
            setAnnouncementBanner({
              message: project.configuration.announcementBanner.message,
              type: project.configuration.announcementBanner.type || 'plain'
            });
          }
          
          // Set login background image
          if (project?.configuration?.customizationSettings?.loginPageBackgroundImage) {
            setLoginBackgroundImage(project.configuration.customizationSettings.loginPageBackgroundImage);
          }
          
          // Set favicon
          if (project?.branding?.favicon) {
            setProjectFavicon(project.branding.favicon);
          }
        }
      } catch (error) {
        console.error('Failed to fetch project configuration:', error);
      }
    };

    fetchProjectConfiguration();
  }, []);

  // Update favicon dynamically
  useEffect(() => {
    if (projectFavicon) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
      
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      
      link.href = projectFavicon;
    }
  }, [projectFavicon]);

  // Language options
  const languages = [
    { code: 'en', name: t('english'), flag: '🇮🇳' },
    { code: 'mr', name: t('marathi'), flag: '🇮🇳' }
  ];

  // Validation schemas
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

  const forgotPasswordSchema = yup.object({
    email: yup
      .string()
      .required(t('emailRequired'))
      .email(t('emailInvalid'))
  });

  const otpSchema = yup.object({
    otp: yup
      .string()
      .required(t('otpRequired'))
      .matches(/^\d{6}$/, t('otpInvalid'))
  });

  const resetPasswordSchema = yup.object({
    newPassword: yup
      .string()
      .required(t('passwordRequired'))
      .min(6, t('passwordMinLengthError')),
    confirmPassword: yup
      .string()
      .required(t('passwordRequired'))
      .oneOf([yup.ref('newPassword')], t('passwordMismatch'))
  });

  // Form hooks
  const loginForm = useForm<LoginFormData>({
    resolver: yupResolver(loginSchema),
    mode: 'onBlur'
  });

  const forgotPasswordForm = useForm<ForgotPasswordFormData>({
    resolver: yupResolver(forgotPasswordSchema),
    mode: 'onBlur'
  });

  const otpForm = useForm<OTPFormData>({
    resolver: yupResolver(otpSchema),
    mode: 'onBlur'
  });

  const resetPasswordForm = useForm<ResetPasswordFormData>({
    resolver: yupResolver(resetPasswordSchema),
    mode: 'onBlur'
  });

  // API functions
  const apiCall = async (endpoint: string, data: any) => {
    const response = await fetch(`${API_CONFIG.API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      credentials: 'include',
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Request failed');
    }
    return result;
  };

  // Form handlers
  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    setErrorMessage('');
    
    try {
      const result = await apiCall('/auth/login', data);
      console.log('🔐 Login response:', result);
      
      // Check if 2FA is required
      if (result.require2FA) {
        // Store temporary data for 2FA verification
        setTwoFactorData({
          email: data.email,
          password: data.password,
          tempToken: result.tempToken
        });
        setCurrentStep('2fa-verification');
        setSuccessMessage('OTP has been sent to your registered mobile number');
        return;
      }
      
      console.log('🔐 User data:', result.data?.user);
      console.log('🔐 Permissions from response:', result.data?.user?.permissions);
      
      if (result.success) {
        // Store auth data
        const token = result.data.token;
        localStorage.setItem('authToken', token);
        localStorage.setItem('userId', result.data.user.id);
        localStorage.setItem('userEmail', result.data.user.email);
        localStorage.setItem('user', JSON.stringify(result.data.user));
        localStorage.setItem('userRole', result.data.user.role?.code || result.data.user.role);
        
        // Store user permissions - ALWAYS extract from token (primary source)
        let permissions: string[] = [];
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            permissions = payload.role?.permissions || [];
            console.log('✅ Extracted', permissions.length, 'permissions from token');
          }
        } catch (e) {
          console.error('❌ Failed to extract permissions from token:', e);
          // Fallback to response if token decode fails
          permissions = result.data.user.permissions || [];
        }
        
        console.log('💾 Storing permissions:', permissions.length, 'items');
        localStorage.setItem('userPermissions', JSON.stringify(permissions));
        
        // Check if user has accepted EULA
        if (result.data.user.eulaAccepted) {
          // EULA already accepted, redirect to user's default accessible route
          const { getDefaultRoute } = await import('../utils/routeUtils');
          const defaultRoute = getDefaultRoute(permissions);
          window.location.href = defaultRoute;
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

  const handleTwoFactorVerification = async () => {
    if (!twoFactorData || !twoFactorOtp) {
      setErrorMessage('Please enter the OTP');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const result = await apiCall('/auth/verify-2fa', {
        email: twoFactorData.email,
        tempToken: twoFactorData.tempToken,
        otp: twoFactorOtp
      });

      if (result.success) {
        // Store auth data
        const token = result.data.token;
        localStorage.setItem('authToken', token);
        localStorage.setItem('userId', result.data.user.id);
        localStorage.setItem('userEmail', result.data.user.email);
        localStorage.setItem('user', JSON.stringify(result.data.user));
        localStorage.setItem('userRole', result.data.user.role?.code || result.data.user.role);
        
        // Store user permissions
        let permissions: string[] = [];
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            permissions = payload.role?.permissions || [];
          }
        } catch (e) {
          permissions = result.data.user.permissions || [];
        }
        
        localStorage.setItem('userPermissions', JSON.stringify(permissions));
        
        // Redirect
        if (result.data.user.eulaAccepted) {
          const { getDefaultRoute } = await import('../utils/routeUtils');
          const defaultRoute = getDefaultRoute(permissions);
          window.location.href = defaultRoute;
        } else {
          window.location.href = '/eula';
        }
      }
    } catch (error: any) {
      setErrorMessage(error.message || 'Invalid OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);
    setErrorMessage('');
    
    try {
      const result = await apiCall('/auth/forgot-password', data);
      if (result.success) {
        setOtpEmail(data.email);
        setSuccessMessage(t('otpSent'));
        setCurrentStep('otp-verification');
      }
    } catch (error: any) {
      setErrorMessage(error.message || t('emailNotFound'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPVerification = async (data: OTPFormData) => {
    setIsLoading(true);
    setErrorMessage('');
    
    try {
      const result = await apiCall('/auth/verify-otp', {
        email: otpEmail,
        otp: data.otp
      });
      if (result.success) {
        setSuccessMessage('');
        setCurrentStep('reset-password');
      }
    } catch (error: any) {
      setErrorMessage(error.message || t('invalidOtp'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (data: ResetPasswordFormData) => {
    setIsLoading(true);
    setErrorMessage('');
    
    try {
      const result = await apiCall('/auth/reset-password', {
        email: otpEmail,
        newPassword: data.newPassword
      });
      if (result.success) {
        setSuccessMessage(t('passwordResetSuccess'));
        setTimeout(() => {
          setCurrentStep('login');
          setSuccessMessage('');
        }, 3000);
      }
    } catch (error: any) {
      setErrorMessage(error.message || t('passwordResetFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode);
  };

  const resetToLogin = () => {
    setCurrentStep('login');
    setErrorMessage('');
    setSuccessMessage('');
    setOtpEmail('');
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 'login':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                margin: '0 auto 1rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
                      e.target.style.borderColor = '#2563EB';
                      e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)';
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
                        e.target.style.borderColor = '#2563EB';
                        e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)';
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
                  onClick={() => setCurrentStep('forgot-password')}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '0.875rem',
                    color: '#2563EB',
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
                  background: '#2563EB',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.24)',
                  transition: 'all 0.2s ease',
                  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.background = '#1d4ed8';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.32)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.background = '#2563EB';
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(37, 99, 235, 0.24)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                {isLoading ? t('signingIn') : t('loginButton')}
              </button>
            </form>
          </div>
        );

      case '2fa-verification':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
            <button
              onClick={resetToLogin}
              style={{
                position: 'absolute',
                top: '-1rem',
                left: '-1rem',
                padding: '0.5rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
              }}
              aria-label="Back to login"
            >
              <ArrowLeftIcon style={{ width: '20px', height: '20px', color: '#6B7280' }} />
            </button>

            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                margin: '0 auto 1rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <LockClosedIcon style={{ width: '32px', height: '32px', color: 'white' }} />
              </div>
              <h1 style={{
                fontSize: '1.875rem',
                fontWeight: 700,
                color: '#111827',
                marginBottom: '0.5rem',
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}>
                Two-Factor Authentication
              </h1>
              <p style={{
                fontSize: '0.875rem',
                color: '#6B7280',
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}>
                Enter the OTP sent to your registered mobile number
              </p>
            </div>

            <div>
              <label htmlFor="2fa-otp" style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#374151',
                marginBottom: '0.5rem',
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}>
                OTP
              </label>
              <input
                id="2fa-otp"
                type="text"
                value={twoFactorOtp}
                onChange={(e) => setTwoFactorOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                maxLength={6}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  outline: 'none',
                  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  boxSizing: 'border-box',
                  letterSpacing: '0.5em',
                  textAlign: 'center'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#2563EB'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#D1D5DB'}
              />
            </div>

            <button
              onClick={handleTwoFactorVerification}
              disabled={isLoading || twoFactorOtp.length !== 6}
              style={{
                width: '100%',
                padding: '0.875rem 1.5rem',
                background: twoFactorOtp.length === 6 ? '#2563EB' : '#9CA3AF',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: twoFactorOtp.length === 6 && !isLoading ? 'pointer' : 'not-allowed',
                opacity: isLoading ? 0.6 : 1,
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.24)',
                transition: 'all 0.2s ease',
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}
            >
              {isLoading ? 'Verifying...' : 'Verify OTP'}
            </button>
          </div>
        );

      case 'forgot-password':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
            <button
              onClick={resetToLogin}
              style={{
                position: 'absolute',
                top: '-1rem',
                left: '-1rem',
                padding: '0.5rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
              }}
              aria-label={t('backToLogin')}
            >
              <ArrowLeftIcon style={{ width: '20px', height: '20px', color: '#6B7280' }} />
            </button>

            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                margin: '0 auto 1rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h1 style={{
                fontSize: '1.875rem',
                fontWeight: 700,
                color: '#111827',
                marginBottom: '0.5rem',
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}>
                {t('forgotPasswordTitle')}
              </h1>
              <p style={{
                fontSize: '0.875rem',
                color: '#6B7280',
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}>
                {t('forgotPasswordSubtitle')}
              </p>
            </div>

            <form onSubmit={forgotPasswordForm.handleSubmit(handleForgotPassword)} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label 
                  htmlFor="forgot-email" 
                  style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '0.5rem',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}
                >
                  {t('emailLabel')}
                  <span style={{ color: '#EF4444', marginLeft: '0.25rem' }}>*</span>
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  {...forgotPasswordForm.register('email')}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    fontSize: '0.875rem',
                    border: `2px solid ${forgotPasswordForm.formState.errors.email ? '#EF4444' : '#E5E7EB'}`,
                    borderRadius: '8px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                  }}
                  placeholder={t('emailPlaceholder')}
                />
                {forgotPasswordForm.formState.errors.email && (
                  <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#EF4444' }} role="alert">
                    {forgotPasswordForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '0.875rem 1.5rem',
                  background: '#2563EB',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.6 : 1,
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.24)',
                  transition: 'all 0.2s ease',
                  fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.background = '#1d4ed8';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.background = '#2563EB';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }
                }}
              >
                {isLoading ? t('sendingOtp') : t('sendOtp')}
              </button>
            </form>
          </div>
        );

      case 'otp-verification':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto h-16 w-16 bg-gradient-to-br from-accent-500 to-primary-600 rounded-full flex items-center justify-center mb-4">
                <ShieldCheckIcon className="h-8 w-8 text-white" aria-hidden="true" />
              </div>
              <h1 className="text-headline-medium font-semibold text-neutral-900 mb-2">
                {t('otpVerificationTitle')}
              </h1>
              <p className="text-body-medium text-neutral-600">
                {t('otpVerificationSubtitle')}
              </p>
              <p className="text-body-small text-primary-600 mt-2">
                {otpEmail}
              </p>
            </div>

            <form onSubmit={otpForm.handleSubmit(handleOTPVerification)} className="space-y-6">
              <div>
                <label 
                  htmlFor="otp" 
                  className="block text-label-large font-medium text-neutral-900 mb-2"
                >
                  OTP
                  <span className="text-error-600 ml-1" aria-label={t('requiredField')}>*</span>
                </label>
                <input
                  id="otp"
                  type="text"
                  maxLength={6}
                  {...otpForm.register('otp')}
                  className={`input text-center text-2xl tracking-widest ${otpForm.formState.errors.otp ? 'input-error' : ''}`}
                  placeholder="000000"
                  aria-invalid={otpForm.formState.errors.otp ? 'true' : 'false'}
                />
                {otpForm.formState.errors.otp && (
                  <p className="mt-2 text-body-small text-error-600" role="alert">
                    {otpForm.formState.errors.otp.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full"
              >
                {isLoading ? t('verifyingOtp') : t('verifyOtp')}
              </button>

              <button
                type="button"
                onClick={() => setCurrentStep('forgot-password')}
                className="btn-outline w-full"
              >
                {t('backToLogin')}
              </button>
            </form>
          </div>
        );

      case 'reset-password':
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto h-16 w-16 bg-gradient-to-br from-accent-500 to-primary-600 rounded-full flex items-center justify-center mb-4">
                <LockClosedIcon className="h-8 w-8 text-white" aria-hidden="true" />
              </div>
              <h1 className="text-headline-medium font-semibold text-neutral-900 mb-2">
                {t('newPasswordTitle')}
              </h1>
              <p className="text-body-medium text-neutral-600">
                {t('newPasswordSubtitle')}
              </p>
            </div>

            <form onSubmit={resetPasswordForm.handleSubmit(handleResetPassword)} className="space-y-6">
              <div>
                <label 
                  htmlFor="new-password" 
                  className="block text-label-large font-medium text-neutral-900 mb-2"
                >
                  {t('newPasswordLabel')}
                  <span className="text-error-600 ml-1" aria-label={t('requiredField')}>*</span>
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    {...resetPasswordForm.register('newPassword')}
                    className={`input pr-12 ${resetPasswordForm.formState.errors.newPassword ? 'input-error' : ''}`}
                    placeholder={t('passwordPlaceholder')}
                    aria-invalid={resetPasswordForm.formState.errors.newPassword ? 'true' : 'false'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 focus:outline-none focus:ring-2 focus:ring-primary-600 rounded-r-gov"
                    aria-label={showNewPassword ? t('hidePassword') : t('showPassword')}
                  >
                    {showNewPassword ? (
                      <EyeSlashIcon className="h-5 w-5 text-neutral-500" aria-hidden="true" />
                    ) : (
                      <EyeIcon className="h-5 w-5 text-neutral-500" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {resetPasswordForm.formState.errors.newPassword && (
                  <p className="mt-2 text-body-small text-error-600" role="alert">
                    {resetPasswordForm.formState.errors.newPassword.message}
                  </p>
                )}
              </div>

              <div>
                <label 
                  htmlFor="confirm-password" 
                  className="block text-label-large font-medium text-neutral-900 mb-2"
                >
                  {t('confirmPasswordLabel')}
                  <span className="text-error-600 ml-1" aria-label={t('requiredField')}>*</span>
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    {...resetPasswordForm.register('confirmPassword')}
                    className={`input pr-12 ${resetPasswordForm.formState.errors.confirmPassword ? 'input-error' : ''}`}
                    placeholder={t('passwordPlaceholder')}
                    aria-invalid={resetPasswordForm.formState.errors.confirmPassword ? 'true' : 'false'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 focus:outline-none focus:ring-2 focus:ring-primary-600 rounded-r-gov"
                    aria-label={showConfirmPassword ? t('hidePassword') : t('showPassword')}
                  >
                    {showConfirmPassword ? (
                      <EyeSlashIcon className="h-5 w-5 text-neutral-500" aria-hidden="true" />
                    ) : (
                      <EyeIcon className="h-5 w-5 text-neutral-500" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {resetPasswordForm.formState.errors.confirmPassword && (
                  <p className="mt-2 text-body-small text-error-600" role="alert">
                    {resetPasswordForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full"
              >
                {isLoading ? t('resettingPassword') : t('resetPassword')}
              </button>
            </form>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif' }}>
      {/* Announcement Banner */}
      {announcementBanner && announcementBanner.message && (
        <div style={{
          backgroundColor: '#fef3c7',
          borderBottom: '1px solid #fbbf24',
          padding: '12px 16px',
          color: '#92400e',
          textAlign: 'center'
        }}>
          {announcementBanner.type === 'rich' ? (
            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(announcementBanner.message) }} style={{ fontSize: '14px', lineHeight: '1.5' }} />
          ) : (
            <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>
              {announcementBanner.message}
            </p>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex">
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
            background: '#2563EB',
            color: 'white',
            textDecoration: 'none',
          }}
        >
          {t('skipToMain')}
        </a>

        {/* Left Side - Branding & Image */}
        <div style={{
        flex: 1,
        background: loginBackgroundImage 
          ? `url(${loginBackgroundImage}) center/cover no-repeat` 
          : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '4rem',
        color: 'white',
      }}>
        {/* Decorative Pattern Overlay - only show when no background image */}
        {!loginBackgroundImage && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.05\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
            opacity: 0.4,
          }}></div>
        )}

        {/* Dark overlay for better text readability when background image is present */}
        {loginBackgroundImage && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.4)',
          }}></div>
        )}

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: '500px' }}>
          {/* Logo/Icon */}
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

          {/* Title */}
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 700,
            marginBottom: '1rem',
            lineHeight: 1.2,
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
          }}>
            SAC Helpdesk Portal
          </h1>

          <p style={{
            fontSize: '1.125rem',
            marginBottom: '2rem',
            opacity: 0.95,
            lineHeight: 1.6,
          }}>
            Streamline your support operations with our comprehensive ticketing and management system
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

        {/* Bottom Decoration */}
        <div style={{
          position: 'absolute',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '0.875rem',
          opacity: 0.8,
        }}>
          © 2025 SAC Helpdesk. All rights reserved.
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

            {/* Step Content */}
            {renderStepContent()}

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
      </div>

      {/* KB Chatbot */}
      <KBChatbot />
    </div>
  );
};

export default Login;
