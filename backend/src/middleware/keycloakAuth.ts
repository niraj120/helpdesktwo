import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";
import { config } from "../config";

/**
 * Build a JWKS client for a given Keycloak realm.
 * Clients are cached in-process to avoid rebuilding on every request.
 */
const jwksClientCache = new Map<string, ReturnType<typeof jwksRsa>>();

function getJwksClient(keycloakUrl: string, realm: string) {
  const key = `${keycloakUrl}||${realm}`;
  if (!jwksClientCache.has(key)) {
    jwksClientCache.set(
      key,
      jwksRsa({
        jwksUri: `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`,
        cache: true,
        cacheMaxAge: 10 * 60 * 1000, // 10 minutes
        rateLimit: true,
      }),
    );
  }
  return jwksClientCache.get(key)!;
}

/**
 * Verify a Keycloak-issued JWT using JWKS public keys (RS256).
 * Returns the decoded payload or throws on failure.
 */
export async function verifyKeycloakToken(
  token: string,
  keycloakUrl: string,
  realm: string,
): Promise<Record<string, any>> {
  const client = getJwksClient(keycloakUrl, realm);

  return new Promise((resolve, reject) => {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header?.kid) {
      return reject(new Error("Invalid token: missing kid"));
    }

    client.getSigningKey(decoded.header.kid, (err, key) => {
      if (err || !key) {
        return reject(
          new Error(`Failed to fetch signing key: ${err?.message}`),
        );
      }

      const publicKey = key.getPublicKey();
      jwt.verify(
        token,
        publicKey,
        {
          algorithms: ["RS256"],
          issuer: `${keycloakUrl}/realms/${realm}`,
        },
        (verifyErr, payload) => {
          if (verifyErr) return reject(verifyErr);
          resolve(payload as Record<string, any>);
        },
      );
    });
  });
}

/**
 * Express middleware: protects routes that require a valid Keycloak token.
 * Uses the global Keycloak config from environment variables.
 * Attaches the decoded Keycloak payload to req.keycloakUser.
 */
export const requireKeycloakAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = await verifyKeycloakToken(
      token,
      config.keycloak.url,
      config.keycloak.realm,
    );
    (req as any).keycloakUser = payload;
    next();
  } catch (err: any) {
    res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};
