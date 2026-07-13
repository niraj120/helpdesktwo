# SAC Helpdesk - GIGW Compliance Assessment

## Assessment Summary

This is a compliance readiness assessment for the Production SAC Helpdesk deployment.

- Assessment date: 10 July 2026
- Environment assessed: Production SAC Helpdesk
- Scope: frontend, backend, public assets, security middleware, accessibility support, policy/footer support, logging/audit evidence, and configuration hygiene
- Standard baseline: GIGW 3.0 / Guidelines for Indian Government Websites and Apps
- Production security evidence: Prod SAC VAPT has been completed.

This assessment is not a formal GIGW/STQC certification. It is a readiness and gap check to identify what must be fixed or evidenced before sharing a compliance position with government stakeholders.

## Overall Readiness

Current status: **Not ready to claim full GIGW compliance yet**

Reason: The application has several good foundations, but there are high-priority gaps that must be closed before any formal compliance statement:

1. Production credentials are maintained server-side through environment configuration, which is the correct deployment pattern.
2. API rate limiting is enabled on MHCET VMK.
3. Accessibility implementation exists.
4. Public governance artifacts such as accessibility statement, website policies, sitemap, and robots file are incomplete or not evidenced in code.
5. VAPT has already been completed for MHCET VMK.

## Key Findings

| Area                            |         Status | Evidence / Gap                                                                                                                                                                                               |
| ------------------------------- | -------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Secure headers                  |        Partial | `backend/src/server.ts` uses Helmet with explicit HSTS (1-year, includeSubDomains, preload) + CSP defaults. Still need to verify live production headers from the deployed URL.                                |
| CORS                            |        Partial | Production origin allow-list is configured. Attach production CORS/header evidence to confirm only approved origins are allowed.                                                                             |
| Rate limiting                   |           Good | API rate limiting is enabled on Production SAC. Attach production gateway/server rate-limit evidence.                                                                                                        |
| Secrets management              |           Good | Production credentials are maintained server-side in environment configuration and are not stored in the production application bundle. Attach server-side configuration/control evidence where appropriate. |
| Input sanitization              |        Partial | DOMPurify and backend sanitization utilities exist. Need endpoint-level validation coverage review.                                                                                                          |
| Authentication / RBAC           |        Partial | JWT, role/permission controls, protected routes, project scope, and audit logs exist. Need formal access-control test evidence.                                                                              |
| Audit logs                      |           Good | Audit logs are maintained for platform/user activity and DPDP-related data access.                                                                                                                           |
| Accessibility                   |        Partial | `lang="en"`, i18n, skip link, focus-visible styles, ARIA usage, and keyboard shortcut support exist. Need automated WCAG 2.1 AA/GIGW test reports.                                                           |
| Multilingual support            |        Partial | English, Hindi, and Marathi i18n resources exist. Need content completeness and translation QA.                                                                                                              |
| Public policy links             |           Good | Privacy Policy and Terms & Conditions have been updated on the Production SAC login page.                                                                                                                    |
| Privacy / consent               |           Good | DPDP controls are in place: audit logs are maintained, passwords are hashed, and data is not exposed publicly.                                                                                               |
| Sitemap / robots                |           Good | `frontend/public/robots.txt` + `sitemap.xml` added — robots blocks the authenticated app + API and allows only public login/feedback pages; sitemap lists public pages (host editable for the public SAC domain). |
| Error handling                  |           Good | Global `errorHandler` hardened: 5xx returns a generic "Internal Server Error" in production (full detail logged server-side only); stack traces only outside production.                                     |
| Source maps                     |           Good | Vite production build disables sourcemaps.                                                                                                                                                                   |
| VAPT / vulnerability assessment |           Good | Prod SAC VAPT has been completed.                                                                                                                                                                            |
| Service worker                  |           Good | Reviewed: `frontend/public/sw.js` is push-notification-only — no `fetch` handler, no content caching, so it cannot serve stale government content (documented in-file).                                       |
| Content governance              | Needs Evidence | Need content review ownership, update history, archival policy, and approval workflow evidence.                                                                                                              |

## Critical Blockers Before Government Sharing

### 1. Attach production credential-management evidence

Production credentials are maintained in server-side environment files. This is the correct approach for Production SAC.

Required actions:

- Attach confirmation that production credentials are stored only in server-side environment configuration.
- Confirm access to production environment files is restricted to authorized DevOps/admin users.
- Confirm credential rotation and secret backup procedures are documented.
- Keep secret scanning/credential review as part of the release checklist.

### 2. Attach production rate-limit evidence

API rate limiting is enabled on Production SAC. Compliance evidence should be based on the live production gateway/server configuration.

Required actions:

- Attach DevOps proof, gateway/WAF/Nginx configuration, or screenshots showing production API rate limits.
- Confirm stricter limits exist for OTP, login, password reset, email conversion, public ticket creation, and file upload.
- Keep auth route `authRateLimiter` evidence as application-level support.

### 3. Produce accessibility evidence

The code has accessibility foundations, but GIGW requires demonstrable accessibility conformance.

Required actions:

- Run automated checks using axe/Lighthouse on public pages and key authenticated flows.
- Manually verify keyboard navigation, focus order, labels, color contrast, error messages, skip links, and screen reader flow.
- Fix missing labels/ARIA issues discovered by tools.
- Keep reports as compliance artifacts.

### 4. Add public governance files/pages

Required actions:

- Add/configure `robots.txt`.
- Add/configure `sitemap.xml` for public routes, if public indexing is intended.
- Privacy Policy and Terms & Conditions are already updated on the Production SAC login page.
- Confirm any remaining public governance links such as Contact, Help/FAQ, and Accessibility Statement are available where required.

### 5. Verify live production deployment controls

Code review alone cannot prove deployment compliance.

Required evidence:

- HTTPS certificate and TLS configuration.
- HSTS header.
- Live CSP/header report.
- Prod SAC VAPT has been completed.
- Backup and restore policy.
- Log retention policy.
- Incident response and vulnerability disclosure process.
- STQC/security audit evidence if formally required.

## Positive Controls Already Present

- Helmet security middleware and CSP are configured in backend.
- CORS uses an allow-list from environment/config.
- Auth routes use rate limiter middleware.
- JWT secret validation warns/fails for missing production secrets.
- Project-scoped access and RBAC structures are present.
- Audit and access log modules are present.
- DPDP controls are in place: audit logs are maintained, passwords are hashed, and data is not exposed publicly.
- Email/SMS/WhatsApp integration secrets are encrypted in several models.
- DOMPurify is used before rendering HTML in multiple frontend views.
- Production Vite config disables source maps.
- Prod SAC VAPT has been completed.
- i18n resources exist for English, Hindi, and Marathi.
- Skip link and focus-visible styles exist for keyboard accessibility.
- Privacy Policy and Terms & Conditions are updated on the Production SAC login page.

## Recommended Compliance Work Plan

### Phase 1 - Immediate Blockers

1. Attach production credential-management evidence.
2. Confirm Production SAC reads credentials only from server-side environment configuration.
3. Attach production API rate-limit evidence from gateway/WAF/Nginx/server configuration.
4. Verify production security headers using the deployed SAC URL.
5. Add `robots.txt`, `sitemap.xml`, and any remaining public accessibility/help/contact pages or configured URLs if required.

### Phase 2 - Accessibility and UI Evidence

1. Run Lighthouse and axe on:
   - SAC login page
   - Student/applicant ticket submission page
   - Student dashboard
   - Ticket detail page
   - Knowledge base/FAQ page
2. Fix all critical/serious accessibility issues.
3. Document manual keyboard and screen-reader test results.

### Phase 3 - Security and Operational Evidence

1. Record Prod SAC VAPT completion in the compliance tracker.
2. Attach dependency audit, SAST, and secret-scan reports from the Production SAC release process.
3. Confirm encrypted credential storage in production.
4. Document backup, restore, monitoring, log retention, and incident response.
5. Validate RBAC/project-scope controls with test cases.
6. Keep deployment architecture note and VAPT completion reference together.

### Phase 4 - Formal GIGW Evidence Pack

Create a shareable folder containing:

- GIGW checklist mapped to evidence.
- Accessibility test report.
- Security header report.
- VAPT completion reference.
- Privacy Policy and Terms & Conditions login-page screenshots/links.
- Deployment and hosting evidence.
- Backup/DR and log retention SOP.
- Screenshots of public pages and footer links.

## Suggested Statement for Stakeholders

Use this only after the remaining GIGW evidence items are fixed/attached:

> SAC Helpdesk has been reviewed against GIGW 3.0 readiness areas covering security headers, access control, audit logging, accessibility support, multilingual support, privacy controls, and public policy links. Prod SAC has completed VAPT. The application has implemented key technical controls, and remaining GIGW-specific accessibility/content/deployment evidence is being validated before formal compliance submission.

Do not state "GIGW compliant" until accessibility, deployment-header, public-policy/content governance, and operational evidence is complete. Completed VAPT is a strong cybersecurity artifact, but it does not by itself certify full GIGW compliance.

## References

- Official GIGW portal: https://guidelines.india.gov.in/
- GIGW conformity matrix: https://guidelines.india.gov.in/annexure-ii-matrix-to-check-conformity/
