import { Request, Response } from "express";
import axios from "axios";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { Project } from "../models/Project";
import { config } from "../config";
import { generateUserJWT, generateProjectJWT } from "../utils/jwtUtils";
import { verifyKeycloakToken } from "../middleware/keycloakAuth";

interface SsoState {
  project?: string; // customUrlPath of the project
  type: "project" | "student";
  returnUrl?: string;
  nonce: string;
}

/**
 * Safely decode the base64url state parameter back to an object.
 */
function decodeState(raw: string): SsoState | null {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Resolve the effective Keycloak config for a given project.
 * Per-project values override global env defaults.
 */
function resolveKeycloakConfig(projectSso?: any) {
  return {
    url: projectSso?.url || config.keycloak.url,
    realm: projectSso?.realm || config.keycloak.realm,
    clientId: projectSso?.clientId || config.keycloak.clientId,
    clientSecret: projectSso?.clientSecret || config.keycloak.clientSecret,
    redirectUri: config.keycloak.redirectUri,
    userMatchField:
      (projectSso?.userMatchField as "email" | "mobile") || "email",
  };
}

/**
 * GET /api/keycloak-auth/callback
 *
 * Called by the frontend SsoCallback page after Keycloak redirects back.
 * 1. Decodes state to get project context
 * 2. Exchanges authorization code with Keycloak (PKCE + client_secret)
 * 3. Verifies the id_token's signature
 * 4. Looks up the user by email (or mobile) in the helpdesk DB
 * 5. Issues a helpdesk-native JWT using the existing generateProjectJWT utility
 */
export const handleSsoCallback = async (req: Request, res: Response) => {
  const { code, code_verifier, state } = req.query as Record<string, string>;

  if (!code) {
    return res
      .status(400)
      .json({ success: false, message: "Authorization code is required" });
  }

  // --- Decode state ---
  let ssoState: SsoState | null = null;
  if (state) {
    ssoState = decodeState(state);
  }

  try {
    // --- Load project and its SSO config ---
    let project: any = null;
    let ssoConfig = resolveKeycloakConfig();

    if (ssoState?.project) {
      project = await Project.findOne({
        "branding.customUrlPath": ssoState.project.toLowerCase(),
        isActive: true,
        status: "active",
      }).select(
        "+configuration.loginSettings.ssoSettings.keycloak.clientSecret",
      );

      if (!project) {
        return res
          .status(404)
          .json({ success: false, message: "Project not found" });
      }

      const keycloakProjectConfig =
        project.configuration?.loginSettings?.ssoSettings?.keycloak;
      if (!keycloakProjectConfig?.enabled) {
        return res
          .status(403)
          .json({
            success: false,
            message: "SSO is not enabled for this project",
          });
      }

      ssoConfig = resolveKeycloakConfig(keycloakProjectConfig);
    }

    // --- Exchange authorization code for tokens ---
    const tokenEndpoint = `${ssoConfig.url}/realms/${ssoConfig.realm}/protocol/openid-connect/token`;

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ssoConfig.clientId,
      client_secret: ssoConfig.clientSecret,
      code,
      redirect_uri: ssoConfig.redirectUri,
    });

    if (code_verifier) {
      params.set("code_verifier", code_verifier);
    }

    const tokenResponse = await axios.post(tokenEndpoint, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const { access_token, id_token, refresh_token } = tokenResponse.data;

    // --- Verify the id_token signature (Level 1 auth) ---
    const keycloakPayload = await verifyKeycloakToken(
      id_token,
      ssoConfig.url,
      ssoConfig.realm,
    );

    // --- Resolve user identity ---
    const email: string = keycloakPayload.email?.toLowerCase();
    const mobile: string = keycloakPayload.preferred_username;

    if (!email && ssoConfig.userMatchField === "email") {
      return res.status(400).json({
        success: false,
        message: "Keycloak token does not contain an email address",
      });
    }

    // --- Level 2: Look up user in helpdesk DB ---
    const matchQuery =
      ssoConfig.userMatchField === "mobile"
        ? { $or: [{ mobile }, { phone: mobile }] }
        : { email };

    const user = await User.findOne({ ...matchQuery, isActive: true }).populate(
      {
        path: "role",
        populate: { path: "permissions" },
      },
    );

    if (!user) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. Your account is not registered in the portal. Please contact your administrator.",
      });
    }

    // --- Generate helpdesk-native JWT (token bridge) ---
    let helpdeskToken: string;
    if (project) {
      helpdeskToken = await generateProjectJWT(user, project);
    } else {
      helpdeskToken = await generateUserJWT(user);
    }

    // --- Gather permissions for frontend storage ---
    const roleData = user.role as any;
    const permissions: string[] = Array.isArray(roleData?.permissions)
      ? roleData.permissions
          .map((p: any) => (typeof p === "string" ? p : p.code))
          .filter(Boolean)
      : [];

    console.log(
      `✅ [SSO] Login successful for ${user.email} via Keycloak (project: ${project?.name || "N/A"})`,
    );

    return res.json({
      success: true,
      data: {
        token: helpdeskToken,
        keycloakIdToken: id_token, // Needed by frontend for Keycloak logout
        keycloakRefreshToken: refresh_token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: roleData
            ? { _id: roleData._id, code: roleData.code, name: roleData.name }
            : null,
        },
        permissions,
        projectId: project?._id,
        projectName: project?.name,
        returnUrl: ssoState?.returnUrl,
      },
    });
  } catch (error: any) {
    const status = error.response?.status;
    if (status === 400 || status === 401) {
      return res.status(401).json({
        success: false,
        message: "SSO authentication failed. Please try again.",
      });
    }
    console.error("[SSO] Callback error:", error.message);
    return res
      .status(500)
      .json({
        success: false,
        message: "Internal server error during SSO login",
      });
  }
};

/**
 * GET /api/keycloak-auth/logout-url
 *
 * Returns the Keycloak end-session URL. The frontend redirects the user here
 * after clearing local session data, which terminates the Keycloak SSO session.
 *
 * Query params:
 *   id_token_hint  - The Keycloak id_token stored by the frontend
 *   post_logout_redirect_uri - Where Keycloak should redirect after logout
 *   project        - customUrlPath to resolve per-project Keycloak config
 */
export const getLogoutUrl = async (req: Request, res: Response) => {
  const {
    id_token_hint,
    post_logout_redirect_uri,
    project: customUrlPath,
  } = req.query as Record<string, string>;

  let ssoConfig = resolveKeycloakConfig();

  if (customUrlPath) {
    const project = await Project.findOne({
      "branding.customUrlPath": customUrlPath.toLowerCase(),
      isActive: true,
    }).select("+configuration.loginSettings.ssoSettings.keycloak.clientSecret");

    const keycloakProjectConfig =
      project?.configuration?.loginSettings?.ssoSettings?.keycloak;
    if (keycloakProjectConfig?.enabled) {
      ssoConfig = resolveKeycloakConfig(keycloakProjectConfig);
    }
  }

  const logoutUrl = new URL(
    `${ssoConfig.url}/realms/${ssoConfig.realm}/protocol/openid-connect/logout`,
  );

  if (id_token_hint) logoutUrl.searchParams.set("id_token_hint", id_token_hint);
  if (post_logout_redirect_uri) {
    logoutUrl.searchParams.set(
      "post_logout_redirect_uri",
      post_logout_redirect_uri,
    );
  }
  logoutUrl.searchParams.set("client_id", ssoConfig.clientId);

  return res.json({ success: true, data: { logoutUrl: logoutUrl.toString() } });
};
