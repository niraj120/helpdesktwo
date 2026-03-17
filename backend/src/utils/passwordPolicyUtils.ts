export interface PasswordPolicy {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
}

/**
 * Validates a password against a project-level password policy.
 * If no policy is provided, a default minimum of 8 characters is enforced.
 */
export function validatePasswordPolicy(
  password: string,
  policy: PasswordPolicy | null | undefined,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const minLen = policy?.minLength ?? 8;

  if (password.length < minLen) {
    errors.push(`Password must be at least ${minLen} characters long`);
  }

  if (policy?.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter (A-Z)");
  }

  if (policy?.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter (a-z)");
  }

  if (policy?.requireNumbers && !/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number (0-9)");
  }

  if (
    policy?.requireSpecialChars &&
    !/[@!%*?"#$\[\]^~_\-+=]/.test(password)
  ) {
    errors.push(
      'Password must contain at least one special character (@!%*?"#$?[]^~_-+=)',
    );
  }

  return { valid: errors.length === 0, errors };
}
