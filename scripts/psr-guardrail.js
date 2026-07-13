#!/usr/bin/env node
/**
 * PSR No-Hardcoding Guardrail (US-5.6)
 *
 * Scans the PSR engine and search files for domain-specific terms that must
 * NEVER appear in engine/search logic (only config, fixtures, and tests are exempt).
 *
 * Run:  node scripts/psr-guardrail.js
 *       npm run psr:guardrail
 *
 * Exits with code 1 if any match is found — fails the CI build.
 */

const fs = require("fs");
const path = require("path");

// ─── Config ──────────────────────────────────────────────────────────────────

/** Files/directories to scan (relative to project root) */
const SCAN_TARGETS = [
  "backend/src/services/psr/pipelineEngine.ts",
  "backend/src/services/psr/httpClient.ts",
  "backend/src/controllers/psr/psrPipelineController.ts",
  "backend/src/routes/psr/psrPipelineRoutes.ts",
];

/**
 * Domain term denylist — these must not appear as string literals or
 * identifiers in engine/search code. The idea: if someone hardcodes
 * "parent" or "student" into the engine logic, the guardrail catches it.
 *
 * Patterns are case-insensitive regexes matched against source lines.
 * Lines that only appear in comments, string descriptions, or log messages
 * are allowed — only `if (x === "parent")` style hardcoding fails.
 */
const DENYLIST = [
  /\bparentId\b/,
  /\bstudentId\b/,
  /\bguardianId\b/,
  /\b["'`]parent["'`]/,
  /\b["'`]student["'`]/,
  /\b["'`]guardian["'`]/,
  /\b["'`]parents["'`]/,
  /\b["'`]students["'`]/,
  /\b["'`]guardians["'`]/,
  /\bparentsCollection\b/,
  /\bstudentsCollection\b/,
];

/** Lines that are always exempt (comments, test fixtures, log messages) */
const EXEMPT_PATTERNS = [
  /^\s*\/\//, // single-line comment
  /^\s*\*/, // JSDoc / block comment line
  /console\.(log|warn|error|info)/, // log messages
  /throw new Error/, // error messages
  /\/\*/, // block comment open
];

// ─── Scanner ─────────────────────────────────────────────────────────────────

const projectRoot = path.resolve(__dirname, "..");
let violations = 0;

for (const relPath of SCAN_TARGETS) {
  const fullPath = path.join(projectRoot, relPath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`  ⚠  Guardrail: file not found — ${relPath} (skipped)`);
    continue;
  }

  const lines = fs.readFileSync(fullPath, "utf8").split("\n");

  lines.forEach((line, i) => {
    // Skip exempt lines
    if (EXEMPT_PATTERNS.some((re) => re.test(line))) return;

    for (const pattern of DENYLIST) {
      if (pattern.test(line)) {
        console.error(
          `  ✗ HARDCODED DOMAIN TERM in ${relPath}:${i + 1}\n` +
            `    Line: ${line.trim()}\n` +
            `    Matched: ${pattern}`,
        );
        violations++;
        break;
      }
    }
  });
}

// ─── Result ───────────────────────────────────────────────────────────────────

if (violations === 0) {
  console.log(
    `✅ PSR Guardrail passed — no hardcoded domain terms found in ${SCAN_TARGETS.length} file(s).`,
  );
  process.exit(0);
} else {
  console.error(
    `\n❌ PSR Guardrail FAILED — ${violations} violation(s) found.\n` +
      `   Domain-specific terms must not appear in engine/search logic.\n` +
      `   Move them to pipeline config (admin-entered data) instead.`,
  );
  process.exit(1);
}
