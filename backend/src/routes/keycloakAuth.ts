import { Router } from "express";
import {
  handleSsoCallback,
  getLogoutUrl,
} from "../controllers/keycloakAuthController";

const router = Router();

/**
 * GET /api/keycloak-auth/callback
 * Main SSO handler — exchanges Keycloak authorization code for a helpdesk JWT.
 * Called by the frontend SsoCallback page.
 * Query: code, code_verifier (PKCE), state (base64url encoded JSON)
 */
router.get("/callback", handleSsoCallback);

/**
 * GET /api/keycloak-auth/logout-url
 * Returns the Keycloak end-session URL for the frontend to redirect to.
 * Query: id_token_hint, post_logout_redirect_uri, project (customUrlPath)
 */
router.get("/logout-url", getLogoutUrl);

export default router;
