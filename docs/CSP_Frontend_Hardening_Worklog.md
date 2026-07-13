# CSP Frontend Hardening Worklog

## Objective

Remove frontend dependencies on CSP allowances such as `style-src 'unsafe-inline'`, so production CSP can be tightened without breaking the application UI.

## Current Finding

The live CSP still includes:

```http
script-src 'self' 'unsafe-inline' 'unsafe-eval' blob;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
```

The backend source does not explicitly add these weak directives through Helmet. The live CSP is likely set by nginx/reverse-proxy configuration, but the frontend currently has many React inline style attributes that will break when `style-src 'unsafe-inline'` is removed.

## Cleanup Started

- Replaced `SkipLink` inline style and focus mutation with the `.skip-link` CSS class.
- Added `frontend/src/styles/csp-hardening.css` as the migration target for styles moved out of JSX.
- Replaced app-level toast color inline styles with CSS classes.
- Replaced slow-network toast inline style with `.app-toast-warning`.
- Added a CSP JSX runtime that converts application DOM `style={{ ... }}` props into generated CSS classes.
- Removed the inline `noscript` style from `frontend/index.html`.
- Replaced the Google Maps center InfoWindow raw HTML string with DOM nodes and CSS classes.

## Runtime Strategy

The app now uses `@/utils/csp-jsx-runtime` as the JSX import source. For DOM elements, the runtime removes React `style` attributes and converts the style object to a deterministic class name. CSS rules are inserted into an existing same-origin stylesheet through CSSOM.

This reduces dependence on `style-src 'unsafe-inline'` for application-owned JSX without requiring a risky mass rewrite of every component in one pass.

Known boundary: styles generated inside third-party libraries may still need library-specific handling or replacement if strict CSP testing shows violations. Build output can also contain harmless third-party template strings with `style=` text, such as spreadsheet export templates, that are not rendered into the portal DOM.

## Remaining High-Volume Files

Initial scan found the largest inline-style counts in:

| Count | File |
|---:|---|
| 468 | `frontend/src/components/UserManagement.tsx` |
| 447 | `frontend/src/components/AddProjectForm.tsx` |
| 378 | `frontend/src/pages/ReportsPage.tsx` |
| 308 | `frontend/src/pages/attendance/AttendanceReportPage.tsx` |
| 278 | `frontend/src/components/MasterDataManagement.tsx` |
| 229 | `frontend/src/components/SLA/EscalationMatrixContent.tsx` |
| 180 | `frontend/src/pages/RBACSetup.tsx` |
| 173 | `frontend/src/pages/ViewTickets.tsx` |

## Recommended Remediation Sequence

1. Remove `script-src 'unsafe-eval'` from nginx CSP after confirming production build works.
2. Remove `script-src 'unsafe-inline'` if there are no inline scripts in the deployed HTML.
3. Test the frontend in staging with `style-src 'self' https://fonts.googleapis.com` and without `style-src 'unsafe-inline'`.
4. If browser CSP reports point to third-party runtime styles, replace or configure those libraries.
5. Continue migrating high-volume files to CSS classes/CSS modules for long-term maintainability.

## Verification Commands

```powershell
rg -n "style=\{\{" frontend/src -g "*.tsx" -g "*.jsx"
rg -n "dangerouslySetInnerHTML|<style|createElement\(['\"]style|insertRule|innerHTML" frontend/src frontend/public
npm run build
```
