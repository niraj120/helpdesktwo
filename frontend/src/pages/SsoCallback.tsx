import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  handleCallback,
  storeLoginData,
  clearPkceSession,
  decodeState,
} from "../services/ssoService";

const SsoCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const exchange = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const errorParam = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      // Keycloak returned an error (e.g., user cancelled login)
      if (errorParam) {
        clearPkceSession();
        setError(errorDescription || errorParam);
        return;
      }

      if (!code) {
        setError("No authorization code received from the identity provider.");
        return;
      }

      try {
        const result = await handleCallback(code, state || "");

        if (!result.success) {
          throw new Error(result.message || "SSO authentication failed");
        }

        storeLoginData(result.data);
        clearPkceSession();

        // Determine where to navigate
        const ssoState = state ? decodeState(state) : null;
        const returnUrl = result.data.returnUrl || ssoState?.returnUrl;

        if (returnUrl) {
          navigate(returnUrl, { replace: true });
        } else if (result.data.projectId && ssoState?.project) {
          // Navigate to dashboard for project/student logins
          if (ssoState.type === "student") {
            navigate(`/${ssoState.project}/student/dashboard`, {
              replace: true,
            });
          } else {
            navigate(`/${ssoState.project}/dashboard`, { replace: true });
          }
        } else {
          navigate("/dashboard", { replace: true });
        }
      } catch (err: any) {
        clearPkceSession();
        const message: string =
          err?.response?.data?.message ||
          err?.message ||
          "Login failed. Please try again.";
        setError(message);
      }
    };

    exchange();
  }, []); // run once on mount

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Login Failed</h2>
          <p className="text-gray-600 mb-6 text-sm">{error}</p>
          <button
            onClick={() => {
              // Go back to last project login page or global login
              const state = sessionStorage.getItem("sso_state");
              const decoded = state ? decodeState(state) : null;
              if (decoded?.project) {
                navigate(`/${decoded.project}`, { replace: true });
              } else {
                navigate("/login", { replace: true });
              }
              clearPkceSession();
            }}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600 font-medium">
          Completing login, please wait…
        </p>
      </div>
    </div>
  );
};

export default SsoCallback;
