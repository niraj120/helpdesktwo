import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { ArrowLeftIcon, KeyIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { API_CONFIG } from '../config/constants';

interface ProjectBranding {
  projectId: string;
  name: string;
  branding: {
    logo?: string | null;
    colorTheme: {
      primary: string;
      secondary: string;
      accent: string;
      background: string;
    };
    headerText?: string;
    footerText?: string;
  };
}

interface ForgotPasswordFormData {
  email: string;
}

interface VerifyOTPFormData {
  otp: string;
}

interface ResetPasswordFormData {
  newPassword: string;
  confirmPassword: string;
}

type Step = 'forgot-password' | 'verify-otp' | 'reset-password' | 'success';

const ProjectForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const { customUrlPath } = useParams<{ customUrlPath: string }>();

  const [currentStep, setCurrentStep] = useState<Step>('forgot-password');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [projectBranding, setProjectBranding] = useState<ProjectBranding | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [otpId, setOtpId] = useState('');

  // Primary color for theming
  const primaryColor = projectBranding?.branding?.colorTheme?.primary || '#667eea';
  const accentColor = projectBranding?.branding?.colorTheme?.accent || '#764ba2';

  // Form schemas
  const forgotPasswordSchema = yup.object({
    email: yup
      .string()
      .required('Email is required')
      .email('Invalid email address')
  });

  const verifyOTPSchema = yup.object({
    otp: yup
      .string()
      .required('OTP is required')
      .length(6, 'OTP must be 6 digits')
  });

  const resetPasswordSchema = yup.object({
    newPassword: yup
      .string()
      .required('Password is required')
      .min(6, 'Password must be at least 6 characters'),
    confirmPassword: yup
      .string()
      .required('Please confirm your password')
      .oneOf([yup.ref('newPassword')], 'Passwords must match')
  });

  // Form hooks
  const forgotPasswordForm = useForm<ForgotPasswordFormData>({
    resolver: yupResolver(forgotPasswordSchema),
    mode: 'onBlur'
  });

  const verifyOTPForm = useForm<VerifyOTPFormData>({
    resolver: yupResolver(verifyOTPSchema),
    mode: 'onBlur'
  });

  const resetPasswordForm = useForm<ResetPasswordFormData>({
    resolver: yupResolver(resetPasswordSchema),
    mode: 'onBlur'
  });

  useEffect(() => {
    fetchProjectBranding();
  }, [customUrlPath]);

  const fetchProjectBranding = async () => {
    try {
      setBrandingLoading(true);
      const response = await axios.get(
        `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`
      );
      
      if (response.data.success) {
        setProjectBranding(response.data.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch project branding:', err);
      // Set default branding
      setProjectBranding({
        projectId: '',
        name: 'Portal',
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
    } finally {
      setBrandingLoading(false);
    }
  };

  const handleForgotPassword = async (data: ForgotPasswordFormData) => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      const response = await axios.post(
        `${API_CONFIG.API_URL}/project-auth/${customUrlPath}/forgot-password`,
        { email: data.email }
      );

      if (response.data.success) {
        setUserEmail(data.email);
        setOtpId(response.data.data.otpId);
        setSuccessMessage('OTP has been sent to your email address');
        setCurrentStep('verify-otp');
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async (data: VerifyOTPFormData) => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      const response = await axios.post(
        `${API_CONFIG.API_URL}/project-auth/${customUrlPath}/verify-otp`,
        {
          email: userEmail,
          otp: data.otp
        }
      );

      if (response.data.success) {
        setSuccessMessage('OTP verified successfully');
        setCurrentStep('reset-password');
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || 'Invalid OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (data: ResetPasswordFormData) => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      const response = await axios.post(
        `${API_CONFIG.API_URL}/project-auth/${customUrlPath}/reset-password`,
        {
          email: userEmail,
          newPassword: data.newPassword
        }
      );

      if (response.data.success) {
        setSuccessMessage('Password has been reset successfully!');
        setCurrentStep('success');
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || 'Failed to reset password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const resendOTP = async () => {
    setErrorMessage('');
    setIsLoading(true);

    try {
      const response = await axios.post(
        `${API_CONFIG.API_URL}/project-auth/${customUrlPath}/forgot-password`,
        { email: userEmail }
      );

      if (response.data.success) {
        setOtpId(response.data.data.otpId);
        setSuccessMessage('New OTP has been sent to your email address');
      }
    } catch (err: any) {
      setErrorMessage('Failed to resend OTP. Please try again.');
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
          borderTop: '4px solid white',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
      </div>
    );
  }

  const renderForgotPasswordStep = () => (
    <form onSubmit={forgotPasswordForm.handleSubmit(handleForgotPassword)} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
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
          <KeyIcon style={{ width: '32px', height: '32px', color: 'white' }} />
        </div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
          Forgot Password?
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>
          Enter your email address and we'll send you an OTP to reset your password.
        </p>
      </div>

      {/* Email Field */}
      <div>
        <label style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 500,
          color: '#374151',
          marginBottom: '0.5rem',
        }}>
          Email Address
          <span style={{ color: '#EF4444', marginLeft: '0.25rem' }}>*</span>
        </label>
        <input
          type="email"
          {...forgotPasswordForm.register('email')}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            fontSize: '0.875rem',
            border: forgotPasswordForm.formState.errors.email ? '2px solid #EF4444' : '2px solid #E5E7EB',
            borderRadius: '8px',
            outline: 'none',
            transition: 'all 0.2s ease',
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          }}
          placeholder="Enter your email address"
          onFocus={(e) => {
            if (!forgotPasswordForm.formState.errors.email) {
              e.currentTarget.style.borderColor = primaryColor;
              e.currentTarget.style.boxShadow = `0 0 0 3px ${primaryColor}20`;
            }
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = forgotPasswordForm.formState.errors.email ? '#EF4444' : '#E5E7EB';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
        {forgotPasswordForm.formState.errors.email && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#EF4444' }}>
            {forgotPasswordForm.formState.errors.email.message}
          </p>
        )}
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
          transition: 'all 0.2s ease',
          fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
        }}
      >
        {isLoading ? 'Sending OTP...' : 'Send OTP'}
      </button>
    </form>
  );

  const renderVerifyOTPStep = () => (
    <form onSubmit={verifyOTPForm.handleSubmit(handleVerifyOTP)} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
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
          <KeyIcon style={{ width: '32px', height: '32px', color: 'white' }} />
        </div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
          Verify OTP
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>
          We've sent a 6-digit OTP to <strong>{userEmail}</strong>
        </p>
      </div>

      {/* OTP Field */}
      <div>
        <label style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 500,
          color: '#374151',
          marginBottom: '0.5rem',
        }}>
          Enter OTP
          <span style={{ color: '#EF4444', marginLeft: '0.25rem' }}>*</span>
        </label>
        <input
          type="text"
          maxLength={6}
          {...verifyOTPForm.register('otp')}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            fontSize: '1.25rem',
            textAlign: 'center',
            letterSpacing: '0.5rem',
            border: verifyOTPForm.formState.errors.otp ? '2px solid #EF4444' : '2px solid #E5E7EB',
            borderRadius: '8px',
            outline: 'none',
            transition: 'all 0.2s ease',
            fontFamily: '"Courier New", monospace',
          }}
          placeholder="123456"
          onFocus={(e) => {
            if (!verifyOTPForm.formState.errors.otp) {
              e.currentTarget.style.borderColor = primaryColor;
              e.currentTarget.style.boxShadow = `0 0 0 3px ${primaryColor}20`;
            }
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = verifyOTPForm.formState.errors.otp ? '#EF4444' : '#E5E7EB';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
        {verifyOTPForm.formState.errors.otp && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#EF4444' }}>
            {verifyOTPForm.formState.errors.otp.message}
          </p>
        )}
      </div>

      {/* Resend OTP */}
      <div style={{ textAlign: 'center' }}>
        <button
          type="button"
          onClick={resendOTP}
          disabled={isLoading}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '0.875rem',
            color: primaryColor,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            textDecoration: 'underline',
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
            opacity: isLoading ? 0.6 : 1,
          }}
        >
          Didn't receive OTP? Resend
        </button>
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
          transition: 'all 0.2s ease',
          fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
        }}
      >
        {isLoading ? 'Verifying...' : 'Verify OTP'}
      </button>
    </form>
  );

  const renderResetPasswordStep = () => (
    <form onSubmit={resetPasswordForm.handleSubmit(handleResetPassword)} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
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
          <KeyIcon style={{ width: '32px', height: '32px', color: 'white' }} />
        </div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
          Reset Password
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>
          Enter your new password below
        </p>
      </div>

      {/* New Password Field */}
      <div>
        <label style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 500,
          color: '#374151',
          marginBottom: '0.5rem',
        }}>
          New Password
          <span style={{ color: '#EF4444', marginLeft: '0.25rem' }}>*</span>
        </label>
        <input
          type="password"
          {...resetPasswordForm.register('newPassword')}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            fontSize: '0.875rem',
            border: resetPasswordForm.formState.errors.newPassword ? '2px solid #EF4444' : '2px solid #E5E7EB',
            borderRadius: '8px',
            outline: 'none',
            transition: 'all 0.2s ease',
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          }}
          placeholder="Enter new password"
        />
        {resetPasswordForm.formState.errors.newPassword && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#EF4444' }}>
            {resetPasswordForm.formState.errors.newPassword.message}
          </p>
        )}
      </div>

      {/* Confirm Password Field */}
      <div>
        <label style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 500,
          color: '#374151',
          marginBottom: '0.5rem',
        }}>
          Confirm Password
          <span style={{ color: '#EF4444', marginLeft: '0.25rem' }}>*</span>
        </label>
        <input
          type="password"
          {...resetPasswordForm.register('confirmPassword')}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            fontSize: '0.875rem',
            border: resetPasswordForm.formState.errors.confirmPassword ? '2px solid #EF4444' : '2px solid #E5E7EB',
            borderRadius: '8px',
            outline: 'none',
            transition: 'all 0.2s ease',
            fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
          }}
          placeholder="Confirm your password"
        />
        {resetPasswordForm.formState.errors.confirmPassword && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#EF4444' }}>
            {resetPasswordForm.formState.errors.confirmPassword.message}
          </p>
        )}
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
          transition: 'all 0.2s ease',
          fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
        }}
      >
        {isLoading ? 'Resetting...' : 'Reset Password'}
      </button>
    </form>
  );

  const renderSuccessStep = () => (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: '80px',
        height: '80px',
        margin: '0 auto 2rem',
        background: '#10B981',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M9 12l2 2 4-4"></path>
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
      </div>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 600, color: '#111827', marginBottom: '0.5rem' }}>
        Password Reset Successful!
      </h1>
      <p style={{ fontSize: '0.875rem', color: '#6B7280', marginBottom: '2rem' }}>
        Your password has been successfully reset. You can now login with your new password.
      </p>
      <Link
        to={`/${customUrlPath}/portal/login`}
        style={{
          display: 'inline-block',
          padding: '0.875rem 1.5rem',
          background: primaryColor,
          color: 'white',
          textDecoration: 'none',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: 600,
          transition: 'all 0.2s ease',
          fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
        }}
      >
        Back to Login
      </Link>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '440px',
        background: 'white',
        borderRadius: '16px',
        padding: '2rem',
        boxShadow: '0 25px 50px rgba(0, 0, 0, 0.15)',
      }}>
        {/* Back Link */}
        {currentStep === 'forgot-password' && (
          <div style={{ marginBottom: '1.5rem' }}>
            <Link
              to={`/${customUrlPath}/portal/login`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: '#6B7280',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: 500,
                fontFamily: '"Noto Sans", system-ui, -apple-system, sans-serif',
              }}
            >
              <ArrowLeftIcon style={{ width: '16px', height: '16px' }} />
              Back to Login
            </Link>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            background: '#FEF2F2',
            borderLeft: '4px solid #EF4444',
            borderRadius: '6px',
          }}>
            <p style={{ fontSize: '0.875rem', color: '#DC2626', margin: 0 }}>
              {errorMessage}
            </p>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            background: '#F0FDF4',
            borderLeft: '4px solid #10B981',
            borderRadius: '6px',
          }}>
            <p style={{ fontSize: '0.875rem', color: '#059669', margin: 0 }}>
              {successMessage}
            </p>
          </div>
        )}

        {/* Step Content */}
        {currentStep === 'forgot-password' && renderForgotPasswordStep()}
        {currentStep === 'verify-otp' && renderVerifyOTPStep()}
        {currentStep === 'reset-password' && renderResetPasswordStep()}
        {currentStep === 'success' && renderSuccessStep()}

        {/* Footer */}
        <div style={{
          marginTop: '2rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid #E5E7EB',
          textAlign: 'center',
        }}>
          <p style={{
            fontSize: '0.75rem',
            color: '#9CA3AF',
            margin: 0,
          }}>
            {projectBranding?.branding?.footerText || `© 2025 ${projectBranding?.name || 'Portal'}. All rights reserved.`}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProjectForgotPassword;
