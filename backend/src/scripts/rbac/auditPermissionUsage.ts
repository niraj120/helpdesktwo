/**
 * Audit every permission in the database against the source tree.
 *
 * A permission only means something if some route, middleware, controller or
 * screen actually tests for it. This walks backend/ and frontend/ sources,
 * records where each permission code appears, and classifies it:
 *
 *   ENFORCED   - gated in backend code (checkPermission/requirePermission/hasPerm/…)
 *   UI_ONLY    - only drives frontend visibility (menu, route guard, button)
 *   DECLARED   - appears solely in the permission catalogues (seed / constants)
 *   ORPHAN     - referenced nowhere in either codebase
 *
 * DECLARED and ORPHAN codes gate nothing: granting them changes no behaviour,
 * which is what makes an RBAC screen misleading.
 *
 * Read-only. Writes a JSON report next to the RBAC snapshots.
 *
 * Run:  npx tsx src/scripts/rbac/auditPermissionUsage.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../../..");
const BACKEND_SRC = path.join(ROOT, "backend", "src");
const FRONTEND_SRC = path.join(ROOT, "frontend", "src");

/**
 * Directories whose whole point is to list permission codes (migration and
 * audit scripts). A hit there is bookkeeping, not enforcement, and counting it
 * makes a dead code look alive.
 */
const SCRIPT_DIRS = [
  path.join(BACKEND_SRC, "scripts"),
].map((p) => p.toLowerCase());

/** Files that merely declare the catalogue — a hit here is not a usage. */
const CATALOGUE_FILES = [
  path.join(BACKEND_SRC, "utils", "seedRolesPermissions.ts"),
  path.join(BACKEND_SRC, "constants", "permissions.ts"),
  path.join(FRONTEND_SRC, "constants", "permissions.ts"),
].map((p) => p.toLowerCase());

/** Backend call sites that constitute real enforcement. */
const ENFORCEMENT_HINTS = [
  "checkpermission",
  "requirepermission",
  "requireanypermission",
  "hasperm",
  "haspermission",
  "permissioncodes.includes",
  "requires:",
];

type Hit = { file: string; line: number; text: string };

/**
 * Some screens are gated by prefix rather than by an exact code
 * (`<ProtectedRoute modulePrefix="OFFLINE_">`, `modulePrefix: "SLA_"`). Every
 * code under such a prefix does grant access to that area, so collect the
 * prefixes actually in use rather than reporting those codes as dead.
 */
function collectModulePrefixes(files: string[]): string[] {
  const prefixes = new Set<string>();
  const pattern = /modulePrefix[=:]\s*["'`]([A-Z0-9_]+)["'`]/g;
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(pattern)) prefixes.add(m[1]);
  }
  return [...prefixes];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "build", ".git"].includes(entry.name)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;
  const permissions = await db.collection("permissions").find({}).toArray();

  const files = [...walk(BACKEND_SRC), ...walk(FRONTEND_SRC)];
  console.log(`Scanning ${files.length} source files for ${permissions.length} permission codes…\n`);

  // One pass over the tree: remember every line that mentions an upper-snake token.
  const hitsByCode = new Map<string, Hit[]>();
  const codes = new Set(permissions.map((p: any) => p.code));
  const token = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

  for (const file of files) {
    const lower = file.toLowerCase();
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((text, i) => {
      const seen = new Set<string>();
      for (const m of text.matchAll(token)) {
        const code = m[0];
        if (!codes.has(code) || seen.has(code)) continue;
        seen.add(code);
        const list = hitsByCode.get(code) || [];
        list.push({ file: lower, line: i + 1, text: text.trim().slice(0, 160) });
        hitsByCode.set(code, list);
      }
    });
  }

  const modulePrefixes = collectModulePrefixes(files);
  console.log(`Prefix-gated areas: ${modulePrefixes.join(", ")}
`);

  const report: any[] = [];
  for (const perm of permissions as any[]) {
    // A permission document with no code cannot gate anything and cannot be
    // matched against the source tree — surface it rather than crashing.
    if (!perm.code) {
      report.push({
        code: "(missing code)",
        name: perm.name || "(unnamed)",
        module: perm.module || "(no module)",
        category: perm.category || "(no category)",
        prefixGated: null,
        isActive: perm.isActive !== false,
        status: "MALFORMED",
        roleCount: await db.collection("roles").countDocuments({ permissions: perm._id }),
        backendHits: 0,
        frontendHits: 0,
        sample: null,
        _id: perm._id.toString(),
      });
      continue;
    }
    const hits = hitsByCode.get(perm.code) || [];
    const real = hits.filter(
      (h) =>
        !CATALOGUE_FILES.includes(h.file) &&
        !SCRIPT_DIRS.some((dir) => h.file.startsWith(dir)),
    );
    const backend = real.filter((h) => h.file.includes(`${path.sep}backend${path.sep}`.toLowerCase()));
    const frontend = real.filter((h) => h.file.includes(`${path.sep}frontend${path.sep}`.toLowerCase()));
    const enforced = backend.filter((h) =>
      ENFORCEMENT_HINTS.some((hint) => h.text.toLowerCase().includes(hint)),
    );

    const prefixGated = modulePrefixes.find((prefix) => perm.code.startsWith(prefix));

    let status: string;
    if (enforced.length) status = "ENFORCED";
    else if (backend.length) status = "BACKEND_REF";
    else if (frontend.length) status = "UI_ONLY";
    else if (prefixGated) status = "PREFIX_GATED";
    else if (hits.length) status = "DECLARED";
    else status = "ORPHAN";

    const roleCount = await db.collection("roles").countDocuments({ permissions: perm._id });

    report.push({
      code: perm.code,
      name: perm.name || perm.code,
      module: perm.module || "(no module)",
      category: perm.category || "(no category)",
      prefixGated: prefixGated || null,
      isActive: perm.isActive !== false,
      status,
      roleCount,
      backendHits: backend.length,
      frontendHits: frontend.length,
      sample: (enforced[0] || backend[0] || frontend[0])
        ? `${(enforced[0] || backend[0] || frontend[0])!.file.split(/[\/]/).slice(-2).join("/")}:${(enforced[0] || backend[0] || frontend[0])!.line}`
        : null,
    });
  }

  const order = ["ENFORCED", "BACKEND_REF", "UI_ONLY", "PREFIX_GATED", "DECLARED", "ORPHAN", "MALFORMED"];
  const byStatus: Record<string, any[]> = {};
  for (const r of report) (byStatus[r.status] = byStatus[r.status] || []).push(r);

  for (const status of order) {
    const rows = byStatus[status] || [];
    console.log(`\n=== ${status} (${rows.length}) ===`);
    if (status === "ENFORCED" || status === "BACKEND_REF" || status === "UI_ONLY") {
      console.log(`   (listing suppressed — these are wired up)`);
      continue;
    }
    for (const r of rows.sort((a, b) => a.module.localeCompare(b.module) || a.code.localeCompare(b.code))) {
      console.log(
        `  ${r.code.padEnd(34)} roles=${String(r.roleCount).padStart(3)} ${r.module}${r.sample ? "  <- " + r.sample : ""}`,
      );
    }
  }

  const dir = path.join(ROOT, "backend", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `permission-usage-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));

  console.log("\n--- summary ---");
  for (const status of order) console.log(`${status.padEnd(12)} ${(byStatus[status] || []).length}`);
  console.log(`total        ${report.length}`);
  console.log(`report:      ${file}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
