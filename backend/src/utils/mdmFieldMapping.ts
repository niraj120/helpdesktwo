export const normalizeMdmFieldMapping = (
  fieldMapping: unknown,
): Record<string, string> => {
  if (!fieldMapping || typeof fieldMapping !== "object" || Array.isArray(fieldMapping)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(fieldMapping as Record<string, unknown>)
      .map(([key, value]) => [String(key).trim(), String(value ?? "").trim()])
      .filter(([key, value]) => Boolean(key) && Boolean(value)),
  );
};
