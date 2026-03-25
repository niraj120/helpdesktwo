import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import axios from "axios";
import {
  XMarkIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { API_CONFIG } from "../config/constants";
import { LanguageToggle } from "./LanguageToggle";
import { loginWithSSO } from "../services/ssoService";

interface SsoKeycloakConfig {
  authUrl: string;
  clientId: string;
  redirectUri: string;
}

interface StudentLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  primaryColor: string;
  customUrlPath: string;
  ssoEnabled?: boolean;
  ssoConfig?: SsoKeycloakConfig | null;
}

type Step = "email" | "otp" | "password" | "set-password" | "password-success";

export const StudentLoginModal: React.FC<StudentLoginModalProps> = ({
  isOpen,
  onClose,
  primaryColor,
  customUrlPath,
  ssoEnabled = false,
  ssoConfig = null,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requirePasswordSetup, setRequirePasswordSetup] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [firstName, setFirstName] = useState("");
  const [passwordPolicy, setPasswordPolicy] = useState<any>(null);

  // Fetch password policy when entering set-password step
  useEffect(() => {
    if (step === "set-password") {
      const fetchPolicy = async () => {
        try {
          // Get projectId from localStorage (set at login) or branding API
          let projectId = localStorage.getItem("projectId") || "";
          if (!projectId) {
            const brandingRes = await axios.get(
              `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`,
            );
            projectId = brandingRes.data?.data?.projectId || "";
          }
          if (!projectId) return;
          const res = await axios.get(
            `${API_CONFIG.API_URL}/projects/${projectId}`,
          );
          const policy =
            res.data?.data?.project?.configuration?.securitySettings
              ?.passwordPolicy;
          if (policy) setPasswordPolicy(policy);
        } catch {
          // No policy — basic 8 char validation still applies
        }
      };
      fetchPolicy();
    }
  }, [step, customUrlPath]);

  const resetForm = () => {
    setStep("email");
    setEmail("");
    setOtp("");
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setRequirePasswordSetup(false);
    setTempToken("");
    setFirstName("");
    setPasswordPolicy(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Check if user exists
      const response = await axios.post(
        `${API_CONFIG.API_URL}/student-auth/check-user`,
        {
          email,
        },
      );

      const {
        userExists,
        requirePasswordSetup: needsSetup,
        firstName: name,
      } = response.data.data;

      if (!userExists) {
        setError(
          "No account found. Please submit a ticket first to create an account.",
        );
        setLoading(false);
        return;
      }

      setFirstName(name);
      setRequirePasswordSetup(needsSetup);

      if (needsSetup) {
        // First time user - send OTP
        await axios.post(`${API_CONFIG.API_URL}/student-auth/send-otp`, {
          email,
        });
        setStep("otp");
      } else {
        // Returning user - show password input
        setStep("password");
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Failed to check user. Please try again.",
      );
    }

    setLoading(false);
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(
        `${API_CONFIG.API_URL}/student-auth/verify-otp`,
        {
          email,
          otp,
        },
      );

      const { tempToken: token } = response.data.data;
      setTempToken(token);
      setStep("set-password");
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Invalid or expired OTP. Please try again.",
      );
    }

    setLoading(false);
  };

  const handleSetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // Validate against project password policy
    const minLen = passwordPolicy?.minLength || 8;
    if (password.length < minLen) {
      setError(`Password must be at least ${minLen} characters long`);
      return;
    }
    if (passwordPolicy?.requireUppercase && !/[A-Z]/.test(password)) {
      setError("Password must contain at least one uppercase letter");
      return;
    }
    if (passwordPolicy?.requireLowercase && !/[a-z]/.test(password)) {
      setError("Password must contain at least one lowercase letter");
      return;
    }
    if (passwordPolicy?.requireNumbers && !/[0-9]/.test(password)) {
      setError("Password must contain at least one number");
      return;
    }
    if (
      passwordPolicy?.requireSpecialChars &&
      !/[@!%*?"#$\[\]^~_\-+=]/.test(password)
    ) {
      setError("Password must contain at least one special character");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("🔐 Setting password for:", email);
      const response = await axios.post(
        `${API_CONFIG.API_URL}/student-auth/set-password`,
        { password, confirmPassword },
        {
          headers: {
            Authorization: `Bearer ${tempToken}`,
          },
        },
      );

      const { token } = response.data.data;
      console.log("✅ Password set successfully, token received");

      // Clear old token and permissions cache
      localStorage.removeItem("authToken");
      localStorage.removeItem("userPermissions");

      // Show success message step
      setStep("password-success");
      setLoading(false);
    } catch (err: any) {
      console.error(
        "❌ Set password failed:",
        err.response?.data || err.message,
      );
      setError(
        err.response?.data?.message ||
          "Failed to set password. Please try again.",
      );
    }

    setLoading(false);
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      console.log("🔐 Attempting login with:", email);
      const response = await axios.post(
        `${API_CONFIG.API_URL}/student-auth/login`,
        {
          email,
          password,
        },
      );

      const { token, user } = response.data.data;
      console.log("✅ Login successful, token received");
      console.log("📋 User permissions:", user?.role?.permissions);

      // Clear old token and permissions cache
      localStorage.removeItem("authToken");
      localStorage.removeItem("userPermissions");

      // Store new token
      localStorage.setItem("authToken", token);
      console.log("💾 Token stored in localStorage");

      // Store permissions from response if available
      if (user?.role?.permissions && Array.isArray(user.role.permissions)) {
        localStorage.setItem(
          "userPermissions",
          JSON.stringify(user.role.permissions),
        );
        console.log(
          "💾 Permissions stored in localStorage:",
          user.role.permissions,
        );
      }

      // Close modal first
      handleClose();

      // Navigate to student dashboard with a small delay to ensure token is stored
      setTimeout(() => {
        console.log("🚀 Navigating to dashboard");
        navigate(`/${customUrlPath}/student/dashboard`);
      }, 100);
    } catch (err: any) {
      console.error("❌ Login failed:", err.response?.data || err.message);
      setError(err.response?.data?.message || "Invalid email or password");
    }

    setLoading(false);
  };

  const handleResendOTP = async () => {
    setLoading(true);
    setError(null);

    try {
      await axios.post(`${API_CONFIG.API_URL}/student-auth/send-otp`, {
        email,
      });
      setError(null);
      // Show success message
      alert("OTP sent successfully!");
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to resend OTP");
    }

    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{
            background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
          }}
        >
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">
              {step === "email" && t("studentLogin")}
              {step === "otp" && t("verifyYourEmail")}
              {step === "password" && t("welcomeTitle")}
              {step === "set-password" && t("createYourPassword")}
              {step === "password-success" && t("passwordSetSuccessfully")}
            </h2>
          </div>
          <LanguageToggle />
          <button
            onClick={handleClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Step 1: Email Input */}
          {step === "email" && (
            <form onSubmit={handleEmailSubmit}>
              {/* SSO Login Button */}
              {ssoEnabled && ssoConfig && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      loginWithSSO(
                        ssoConfig!,
                        customUrlPath,
                        "student",
                        `/${customUrlPath}/student/dashboard`,
                      )
                    }
                    className="w-full py-3 rounded-lg font-semibold transition-all duration-200 hover:shadow-lg mb-3 flex items-center justify-center gap-2"
                    style={{ background: primaryColor, color: "white" }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4l3 3" />
                    </svg>
                    Sign in with SSO
                  </button>
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      OR SIGN IN WITH EMAIL
                    </span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                </>
              )}
              <p className="text-gray-600 text-sm mb-4">
                {t("enterEmailToLogin")}
              </p>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:outline-none"
                  placeholder="Enter your email"
                  required
                  disabled={loading}
                />
                <p className="mt-2 text-xs text-gray-500">
                  Enter the email you used to submit your first ticket
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg text-white font-semibold transition-all duration-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: primaryColor }}
              >
                {loading ? "Checking..." : "Continue"}
              </button>
            </form>
          )}

          {/* Step 2: OTP Verification */}
          {step === "otp" && (
            <form onSubmit={handleOTPSubmit}>
              <div className="mb-2">
                <p className="text-sm text-gray-600 mb-4">
                  Hi <span className="font-semibold">{firstName}</span>! We've
                  sent a 6-digit OTP to{" "}
                  <span className="font-semibold">{email}</span>
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter OTP
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:outline-none text-center text-2xl tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  required
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full py-3 rounded-lg text-white font-semibold transition-all duration-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed mb-3"
                style={{ backgroundColor: primaryColor }}
              >
                {loading ? "Verifying..." : "Verify OTP"}
              </button>

              <button
                type="button"
                onClick={handleResendOTP}
                disabled={loading}
                className="w-full py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Didn't receive OTP? Resend
              </button>
            </form>
          )}

          {/* Step 3a: Password Login (Returning Users) */}
          {step === "password" && (
            <form onSubmit={handlePasswordLogin}>
              <div className="mb-2">
                <p className="text-sm text-gray-600 mb-4">
                  Welcome back,{" "}
                  <span className="font-semibold">{firstName}</span>!
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:outline-none"
                  placeholder="Enter your password"
                  required
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg text-white font-semibold transition-all duration-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: primaryColor }}
              >
                {loading ? "Logging in..." : "Login"}
              </button>
            </form>
          )}

          {/* Step 3b: Set Password (First Time Users) */}
          {step === "set-password" && (
            <form onSubmit={handleSetPasswordSubmit}>
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-4">
                  Hi <span className="font-semibold">{firstName}</span>! Please
                  set a password for your account.
                </p>
              </div>

              {/* Password policy requirements */}
              {passwordPolicy && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs font-semibold text-blue-800 mb-2">
                    Password Requirements:
                  </p>
                  <ul className="space-y-1">
                    {[
                      {
                        check:
                          password.length >= (passwordPolicy.minLength || 8),
                        label: `Minimum ${passwordPolicy.minLength || 8} characters`,
                      },
                      ...(passwordPolicy.requireUppercase
                        ? [
                            {
                              check: /[A-Z]/.test(password),
                              label: "At least one uppercase letter (A-Z)",
                            },
                          ]
                        : []),
                      ...(passwordPolicy.requireLowercase
                        ? [
                            {
                              check: /[a-z]/.test(password),
                              label: "At least one lowercase letter (a-z)",
                            },
                          ]
                        : []),
                      ...(passwordPolicy.requireNumbers
                        ? [
                            {
                              check: /[0-9]/.test(password),
                              label: "At least one number (0-9)",
                            },
                          ]
                        : []),
                      ...(passwordPolicy.requireSpecialChars
                        ? [
                            {
                              check: /[@!%*?"#$\[\]^~_\-+=]/.test(password),
                              label: "At least one special character",
                            },
                          ]
                        : []),
                    ].map((req, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-xs">
                        {req.check ? (
                          <CheckCircleIcon className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircleIcon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        )}
                        <span
                          className={
                            req.check ? "text-green-700" : "text-gray-600"
                          }
                        >
                          {req.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:outline-none"
                  placeholder={`Minimum ${passwordPolicy?.minLength || 8} characters`}
                  required
                  disabled={loading}
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 focus:outline-none"
                  placeholder="Re-enter password"
                  required
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg text-white font-semibold transition-all duration-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: primaryColor }}
              >
                {loading ? "Setting Password..." : "Set Password & Login"}
              </button>
            </form>
          )}

          {/* Step 4: Password Success */}
          {step === "password-success" && (
            <div className="text-center">
              <div className="mb-6">
                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <svg
                    className="w-8 h-8 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Password Set Successfully!
                </h3>
                <p className="text-gray-600">
                  Your password has been created. Please login with your email
                  and new password to access your account.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">
                  <strong>Email:</strong> {email}
                </p>
              </div>

              <button
                onClick={() => {
                  handleClose();
                  // Redirect to submit-ticket page where login modal will reopen
                  window.location.href = `/${customUrlPath}/submit-ticket`;
                }}
                className="w-full py-3 rounded-lg text-white font-semibold transition-all duration-200 hover:shadow-lg"
                style={{ backgroundColor: primaryColor }}
              >
                Go to Login Page
              </button>
            </div>
          )}

          {/* Back Button (except on email and success steps) */}
          {step !== "email" && step !== "password-success" && (
            <button
              onClick={() => {
                if (step === "otp" || step === "password") {
                  setStep("email");
                  setError(null);
                } else if (step === "set-password") {
                  setStep("otp");
                  setError(null);
                }
              }}
              className="w-full mt-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              disabled={loading}
            >
              ← Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
