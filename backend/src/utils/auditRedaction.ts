import crypto from "crypto";

/**
 * Turns raw before/after documents into a compact, safe `changes[]` array for
 * the audit log. Three jobs, in order of importance:
 *
 *  1. Diff — walk both docs and emit one entry per changed leaf path.
 *  2. Size-cap — never store a multi-megabyte value. The MH CET project's
 *     `branding.logo` is a base64 data URI in the low MBs; a naive diff would
 *     write it into BOTH oldValue and newValue on every project save and blow
 *     past MongoDB's 16MB document ceiling. Oversized values become a stable
 *     `[omitted …]` placeholder carrying the length + a short hash so you can
 *     still tell whether the value actually changed.
 *  3. PII redaction — mask values under keys that carry personal data, so the
 *     audit trail does not itself become an unaudited PII store (DPDP).
 *
 * Everything here is pure and synchronous; the plugin calls it off the request
 * hot path inside the async writer.
 */

/** Max serialized length of a single leaf value before it is replaced. */
const MAX_VALUE_CHARS = 2048;
/** Max number of change entries per audit row; excess is summarized. */
const MAX_CHANGES = 200;
/** Max recursion depth when diffing nested objects. */
const MAX_DEPTH = 6;

/** Keys never worth auditing — noise or framework internals. */
const IGNORED_KEYS = new Set([
  "__v",
  "updatedAt",
  "createdAt",
  "_id",
  "id",
  "password",
  "passwordHash",
  "resetToken",
  "resetTokenExpiry",
  "refreshToken",
]);

/**
 * Keys whose values are secrets — replaced entirely, never shown even masked.
 * Matched case-insensitively as a substring of the key.
 */
const SECRET_KEY_PATTERN =
  /pass(word)?|secret|token|apikey|api_key|credential|privatekey|private_key|clientsecret|client_secret|otp|salt|signature/i;

/**
 * Keys carrying personal data — values are masked (partially preserved) so the
 * log still shows that *something* changed without exposing the full value.
 * Matched case-insensitively as a substring of the key.
 *
 * NOTE: deliberately does NOT match a bare `name`. Entity labels (project /
 * category / status / role / school name) are config, not PII, and masking them
 * would gut the audit log's usefulness. Personal names are matched via the
 * specific first/last/full/guardian/parent variants below.
 */
const PII_KEY_PATTERN =
  /email|phone|mobile|whatsapp|firstname|lastname|fullname|middlename|guardianname|parentname|contactname|aadhaar|aadhar|(^|_)pan$|(^|_)dob$|dateofbirth|birthdate|address|pincode|zipcode|gender/i;

const shortHash = (input: string): string =>
  crypto.createHash("sha256").update(input).digest("hex").slice(0, 8);

const isPlainObject = (v: any): v is Record<string, any> =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  !(v instanceof Date) &&
  !Buffer.isBuffer(v);

/** Mask a scalar PII value, preserving just enough to be useful for forensics. */
const maskPii = (value: any): string => {
  const s = String(value);
  if (s.includes("@")) {
    // email -> f****@domain.com
    const [local, domain] = s.split("@");
    const head = local.slice(0, 1);
    return `${head}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`;
  }
  if (s.length <= 2) return "*".repeat(s.length);
  if (s.length <= 4) return `${s.slice(0, 1)}${"*".repeat(s.length - 1)}`;
  // keep first + last, mask the middle
  return `${s.slice(0, 2)}${"*".repeat(s.length - 4)}${s.slice(-2)}`;
};

/**
 * Normalize a single value for storage: apply secret/PII/size policy.
 * `key` is the leaf field name used to decide redaction class.
 */
const sanitizeValue = (key: string, value: any): any => {
  if (value === undefined || value === null) return value;

  if (SECRET_KEY_PATTERN.test(key)) return "[redacted:secret]";

  // Size cap on strings (covers base64 data URIs, HTML blobs, long JSON).
  if (typeof value === "string" && value.length > MAX_VALUE_CHARS) {
    return `[omitted: ${value.length} chars, sha256:${shortHash(value)}]`;
  }

  if (PII_KEY_PATTERN.test(key) && (typeof value === "string" || typeof value === "number")) {
    return maskPii(value);
  }

  // Cap oversized nested structures by serialized size.
  if (isPlainObject(value) || Array.isArray(value)) {
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      return "[unserializable]";
    }
    if (serialized.length > MAX_VALUE_CHARS) {
      return `[omitted: ${serialized.length} chars, sha256:${shortHash(serialized)}]`;
    }
  }

  return value;
};

export interface Change {
  field: string;
  oldValue: any;
  newValue: any;
}

const equal = (a: any, b: any): boolean => {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  // ObjectId, Decimal128, etc. compare cleanly by string
  if (a != null && b != null && typeof a === "object" && typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
};

/**
 * Recursively diff `before` and `after`, pushing dot-path changes into `out`.
 * Leaves (scalars, arrays, Dates, oversized objects) are compared whole.
 */
const diffInto = (
  before: any,
  after: any,
  path: string,
  depth: number,
  out: Change[],
): void => {
  if (out.length >= MAX_CHANGES) return;

  const leafKey = path.split(".").pop() || path;
  if (IGNORED_KEYS.has(leafKey)) return;

  const bothObjects = isPlainObject(before) && isPlainObject(after);
  if (bothObjects && depth < MAX_DEPTH) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) {
      if (IGNORED_KEYS.has(k)) continue;
      diffInto(before[k], after[k], path ? `${path}.${k}` : k, depth + 1, out);
    }
    return;
  }

  if (!equal(before, after)) {
    out.push({
      field: path,
      oldValue: sanitizeValue(leafKey, before),
      newValue: sanitizeValue(leafKey, after),
    });
  }
};

/**
 * Build the audit `changes[]` for an update. `before`/`after` are plain
 * objects (call `.toObject()` on mongoose docs first).
 */
export const buildChanges = (before: any, after: any): Change[] => {
  const out: Change[] = [];
  diffInto(before ?? {}, after ?? {}, "", 0, out);
  if (out.length >= MAX_CHANGES) {
    out.length = MAX_CHANGES;
    out.push({
      field: "…",
      oldValue: undefined,
      newValue: `[truncated: more than ${MAX_CHANGES} fields changed]`,
    });
  }
  return out;
};

/**
 * Build `changes[]` for a create/delete, where only one side exists. Emits a
 * sanitized snapshot of top-level fields as newValue (create) or oldValue
 * (delete). Deep nesting is size-capped, not expanded field-by-field.
 */
export const snapshotChanges = (
  doc: any,
  side: "new" | "old",
): Change[] => {
  const src = doc ?? {};
  const out: Change[] = [];
  for (const [k, v] of Object.entries(src)) {
    if (IGNORED_KEYS.has(k)) continue;
    const clean = sanitizeValue(k, v);
    out.push({
      field: k,
      oldValue: side === "old" ? clean : undefined,
      newValue: side === "new" ? clean : undefined,
    });
    if (out.length >= MAX_CHANGES) break;
  }
  return out;
};
