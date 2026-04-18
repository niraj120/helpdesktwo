/**
 * normaliseMobile — normalise Indian mobile numbers to 12-digit format: 91XXXXXXXXXX
 *
 * Rules applied in order:
 *  1. Strip all non-digit characters (spaces, dashes, parens, +)
 *  2. If 10 digits starting with 6–9 → prepend "91"
 *  3. If 11 digits starting with "0" → replace leading 0 with "91"
 *  4. If already 12 digits starting with "91" → use as-is
 *  5. Otherwise → return null (invalid)
 */
export function normaliseMobile(input: string): string | null {
  if (!input || typeof input !== "string") return null;

  // Strip all non-digit characters
  const digits = input.replace(/\D/g, "");

  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return "91" + digits;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return "91" + digits.slice(1);
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }

  // 13-digit e.g. "091XXXXXXXXXX"
  if (digits.length === 13 && digits.startsWith("091")) {
    return digits.slice(1);
  }

  return null; // Invalid
}
