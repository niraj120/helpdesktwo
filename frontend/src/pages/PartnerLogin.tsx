/**
 * Partner login handoff page — /:customUrlPath/partner-login?token=…
 *
 * BBP's backend mints a short-lived handoff token via POST /v1/auth/login-url
 * and opens that URL in the user's browser. This page trades the token for a
 * real session and forwards the user into the portal.
 *
 * The token is stripped from the address bar BEFORE the network call, so it
 * never lingers in browser history or leaks through a Referer header.
 * Modelled on SsoCallback.tsx.
 */
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { API_CONFIG } from "../config/constants";
import authTokenUtils from "../utils/authToken";

const PartnerLogin: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { customUrlPath } = useParams<{ customUrlPath: string }>();
  const [error, setError] = useState<string | null>(null);
  // The ticket is single-use, so it may be redeemed exactly once per page load.
  // React StrictMode runs effects twice in development, and a stale token stays
  // readable from searchParams after replaceState — without this guard the
  // second run redeems the already-consumed ticket and paints a failure over a
  // login that actually worked.
  const redeemStarted = useRef(false);

  useEffect(() => {
    if (redeemStarted.current) return;
    redeemStarted.current = true;

    const token = searchParams.get("token");

    // Strip the token from the URL first — before any await — so it is never
    // written to history and never sent as a Referer to third-party assets.
    if (typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (!token) {
      setError("This login link is missing its token.");
      return;
    }

    const redeem = async () => {
      try {
        const { data } = await axios.post(
          `${API_CONFIG.API_URL}/auth/handoff/redeem`,
          { token },
        );

        if (!data?.success || !data?.data?.token) {
          throw new Error(data?.message || "Login failed.");
        }

        const payload = data.data;

        // Replace any existing session outright — a second BBP user opening the
        // same browser must not inherit the first user's session.
        authTokenUtils.clearAllAuthData();
        authTokenUtils.setToken(payload.token);
        localStorage.setItem("userId", payload.user.id);
        localStorage.setItem("userEmail", payload.user.email || "");
        localStorage.setItem("userName", payload.user.name || "");
        localStorage.setItem("user", JSON.stringify(payload.user));
        localStorage.setItem("userRole", payload.user.role?.code || "");
        if (payload.projectId) {
          localStorage.setItem("projectId", payload.projectId);
        }
        if (payload.permissions) {
          localStorage.setItem(
            "userPermissions",
            JSON.stringify(payload.permissions),
          );
        }

        // returnPath arrives already resolved to an absolute in-app path — the
        // staff Service Request hub sits at the app root while the requester
        // portal sits under the project prefix, and the backend allowlist is
        // what knows which is which. Do not prefix it here.
        const project = payload.projectPath || customUrlPath || "";
        const returnPath =
          payload.returnPath || (project ? `/${project}/student/dashboard` : "/");
        navigate(returnPath, { replace: true });
      } catch (err: any) {
        // Never echo the token into the error text or any error reporting.
        setError(
          err?.response?.data?.message ||
            "This login link is invalid or has expired. Please open the Helpdesk again from BBP.",
        );
      }
    };

    redeem();
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
          <p className="text-gray-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600 font-medium">
          Signing you in, please wait…
        </p>
      </div>
    </div>
  );
};

export default PartnerLogin;
