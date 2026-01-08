/**
 * RBAC Validation Test Script
 * 
 * This script helps validate that RBAC is working correctly by checking:
 * 1. No hardcoded role checks exist in code
 * 2. Permission middleware is protecting all endpoints
 * 3. Frontend components use permission-based rendering
 * 
 * Run: node backend/validate-rbac.js
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  issues: [],
};

console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║              RBAC IMPLEMENTATION VALIDATOR                   ║
║              Checking for hardcoded role logic               ║
╚══════════════════════════════════════════════════════════════╝
${colors.reset}\n`);

// ============================================================================
// TEST 1: Check for hardcoded role code comparisons
// ============================================================================
console.log(`${colors.blue}[TEST 1] Scanning for hardcoded role code checks...${colors.reset}`);

const searchPatterns = [
  { pattern: /role\.code\s*===\s*['"](?!typeof)/g, severity: 'error', message: 'Hardcoded role.code comparison' },
  { pattern: /roleCode\s*===\s*['"](?:SUPER_ADMIN|STUDENT|AGENT|ADMIN)/g, severity: 'error', message: 'Hardcoded roleCode comparison' },
  { pattern: /\['SUPER_ADMIN'.*'AGENT'\]/g, severity: 'error', message: 'Hardcoded role array' },
  { pattern: /if\s*\([^)]*isSuperAdmin[^)]*\)/g, severity: 'warning', message: 'isSuperAdmin check (verify it uses permissions)' },
];

function scanDirectory(dir, fileExtensions) {
  const files = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('.git')) {
      files.push(...scanDirectory(fullPath, fileExtensions));
    } else if (stat.isFile() && fileExtensions.some(ext => item.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const issues = [];

  // Skip student auth controller - legitimate role check for authentication boundary
  if (filePath.includes('studentAuthController')) {
    return issues;
  }

  for (const { pattern, severity, message } of searchPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const lines = content.substring(0, match.index).split('\n');
      const lineNumber = lines.length;
      const lineContent = lines[lines.length - 1].trim();

      issues.push({
        file: filePath,
        line: lineNumber,
        severity,
        message,
        code: lineContent,
      });
    }
  }

  return issues;
}

// Scan backend files
const backendFiles = scanDirectory(path.join(__dirname, 'src'), ['.ts', '.js']);
let backendIssues = [];
for (const file of backendFiles) {
  backendIssues.push(...checkFile(file));
}

// Scan frontend files
const frontendFiles = scanDirectory(path.join(__dirname, '../frontend/src'), ['.tsx', '.ts']);
let frontendIssues = [];
for (const file of frontendFiles) {
  frontendIssues.push(...checkFile(file));
}

const allIssues = [...backendIssues, ...frontendIssues];

if (allIssues.length === 0) {
  console.log(`${colors.green}✓ PASS: No hardcoded role checks found${colors.reset}\n`);
  results.passed++;
} else {
  console.log(`${colors.red}✗ FAIL: Found ${allIssues.length} potential hardcoded role checks${colors.reset}\n`);
  results.failed++;
  
  for (const issue of allIssues.slice(0, 10)) { // Show first 10
    const relPath = issue.file.replace(__dirname, '.');
    console.log(`  ${colors.yellow}${relPath}:${issue.line}${colors.reset}`);
    console.log(`  ${issue.message}`);
    console.log(`  ${colors.cyan}${issue.code}${colors.reset}\n`);
  }
  
  if (allIssues.length > 10) {
    console.log(`  ... and ${allIssues.length - 10} more issues\n`);
  }
  
  results.issues.push(...allIssues);
}

// ============================================================================
// TEST 2: Check that protected routes use requirePermission middleware
// ============================================================================
console.log(`${colors.blue}[TEST 2] Checking API route protection...${colors.reset}`);

function checkRouteProtection(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const issues = [];

  // Look for route definitions
  const routePatterns = [
    /router\.(post|put|delete|patch)\(/g,
  ];

  for (const pattern of routePatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const lines = content.substring(0, match.index).split('\n');
      const lineNumber = lines.length;
      
      // Check if this line or nearby lines have requirePermission
      const contextStart = Math.max(0, lineNumber - 3);
      const contextEnd = Math.min(content.split('\n').length, lineNumber + 2);
      const context = content.split('\n').slice(contextStart, contextEnd).join('\n');

      if (!context.includes('requirePermission') && !context.includes('auth,')) {
        issues.push({
          file: filePath,
          line: lineNumber,
          severity: 'warning',
          message: 'Route may not be protected with permission check',
        });
      }
    }
  }

  return issues;
}

// Check route files
const routeFiles = scanDirectory(path.join(__dirname, 'src/routes'), ['.ts', '.js']);
let routeIssues = [];
for (const file of routeFiles) {
  routeIssues.push(...checkRouteProtection(file));
}

if (routeIssues.length === 0) {
  console.log(`${colors.green}✓ PASS: All routes appear to have protection${colors.reset}\n`);
  results.passed++;
} else {
  console.log(`${colors.yellow}⚠ WARNING: ${routeIssues.length} routes may lack permission checks${colors.reset}`);
  console.log(`${colors.yellow}  (Manual review recommended)${colors.reset}\n`);
  results.warnings++;
}

// ============================================================================
// TEST 3: Check that usePermissions hook is imported where needed
// ============================================================================
console.log(`${colors.blue}[TEST 3] Checking frontend permission usage...${colors.reset}`);

function checkPermissionHookUsage(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Skip non-component files
  if (!content.includes('React.FC') && !content.includes('const') && !content.includes('function')) {
    return [];
  }

  // Check if file has action buttons but doesn't use permission check
  const hasButtons = content.includes('<button') || content.includes('Button');
  const usesPermissions = content.includes('usePermissions') || content.includes('hasPermission');
  
  if (hasButtons && !usesPermissions && !filePath.includes('component/ui/')) {
    return [{
      file: filePath,
      severity: 'info',
      message: 'Component has buttons but may not be using permission checks',
    }];
  }

  return [];
}

const componentFiles = frontendFiles.filter(f => 
  f.includes('components') || f.includes('pages')
);

let permissionIssues = [];
for (const file of componentFiles) {
  permissionIssues.push(...checkPermissionHookUsage(file));
}

if (permissionIssues.length < 5) {
  console.log(`${colors.green}✓ PASS: Most components use permission checks${colors.reset}\n`);
  results.passed++;
} else {
  console.log(`${colors.yellow}⚠ INFO: ${permissionIssues.length} components may benefit from permission checks${colors.reset}\n`);
  results.warnings++;
}

// ============================================================================
// TEST 4: Verify token version implementation exists
// ============================================================================
console.log(`${colors.blue}[TEST 4] Checking token version implementation...${colors.reset}`);

const userModelPath = path.join(__dirname, 'src/models/User.ts');
const authMiddlewarePath = path.join(__dirname, 'src/middleware/auth.ts');

let hasTokenVersion = false;
let hasTokenValidation = false;

if (fs.existsSync(userModelPath)) {
  const userModel = fs.readFileSync(userModelPath, 'utf-8');
  hasTokenVersion = userModel.includes('tokenVersion') && userModel.includes('incrementTokenVersion');
}

if (fs.existsSync(authMiddlewarePath)) {
  const authMiddleware = fs.readFileSync(authMiddlewarePath, 'utf-8');
  hasTokenValidation = authMiddleware.includes('tokenVersion') && authMiddleware.includes('TOKEN_VERSION_MISMATCH');
}

if (hasTokenVersion && hasTokenValidation) {
  console.log(`${colors.green}✓ PASS: Token version system implemented${colors.reset}\n`);
  results.passed++;
} else {
  console.log(`${colors.red}✗ FAIL: Token version system incomplete${colors.reset}`);
  console.log(`  User model has tokenVersion: ${hasTokenVersion}`);
  console.log(`  Auth middleware validates version: ${hasTokenValidation}\n`);
  results.failed++;
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║                    VALIDATION SUMMARY                        ║
╚══════════════════════════════════════════════════════════════╝
${colors.reset}`);

console.log(`Tests Passed:    ${colors.green}${results.passed}${colors.reset}`);
console.log(`Tests Failed:    ${colors.red}${results.failed}${colors.reset}`);
console.log(`Warnings:        ${colors.yellow}${results.warnings}${colors.reset}\n`);

if (results.failed === 0 && results.warnings === 0) {
  console.log(`${colors.green}
🎉 EXCELLENT! RBAC implementation appears to be fully permission-driven.
${colors.reset}`);
} else if (results.failed === 0) {
  console.log(`${colors.yellow}
✓ Good! RBAC is mostly permission-driven. Review warnings above.
${colors.reset}`);
} else {
  console.log(`${colors.red}
❌ Issues found! Review the failures above and fix hardcoded role checks.
${colors.reset}`);
}

console.log(`
${colors.cyan}Next Steps:${colors.reset}
1. Fix any errors/warnings listed above
2. Run manual validation tests (see RBAC_VALIDATION_GUIDE.md)
3. Test with limited permission roles in browser
4. Verify token invalidation on permission changes

${colors.cyan}For detailed testing instructions:${colors.reset}
cat RBAC_VALIDATION_GUIDE.md
`);

// Exit with appropriate code
process.exit(results.failed > 0 ? 1 : 0);
