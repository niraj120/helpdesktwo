import { Router } from "express";
import express from "express";
import {
  oidcLogin,
  oidcCallback,
  oidcSession,
  oidcLogout,
  oidcBackchannelLogout,
} from "../controllers/oidcAuthController";

/**
 * Phase-3 OIDC SSO routes. Mounted under /api/auth, and only when OIDC is
 * enabled (see server.ts) — an unconfigured deploy never exposes them.
 */
const router = Router();

router.get("/oidc/login", oidcLogin);
router.get("/oidc/callback", oidcCallback);
router.get("/session", oidcSession);
router.post("/logout", oidcLogout);
// Keycloak posts the logout token as application/x-www-form-urlencoded.
router.post(
  "/oidc/backchannel-logout",
  express.urlencoded({ extended: false }),
  oidcBackchannelLogout,
);

export default router;
