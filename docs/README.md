# Documentation Index

This folder contains all project documentation organized for easy reference.

## 📂 Documentation Categories

### Performance & Optimization
- [PERFORMANCE_OPTIMIZATION.md](PERFORMANCE_OPTIMIZATION.md) - Database query optimization, rate limiting improvements (Dec 2025)
- [PERFORMANCE_TESTING.md](PERFORMANCE_TESTING.md) - Testing guide and benchmarks
- [TICKET_SUBMISSION_OPTIMIZATION.md](TICKET_SUBMISSION_OPTIMIZATION.md) - Ticket submission flow improvements
- [MULTIPLE_API_CALLS_FIX.md](MULTIPLE_API_CALLS_FIX.md) - API call optimization

### Deployment & Production
- [PRODUCTION_DEPLOYMENT_GUIDE.md](PRODUCTION_DEPLOYMENT_GUIDE.md) - Complete production deployment steps
- [PRODUCTION_CONFIG_AUDIT.md](PRODUCTION_CONFIG_AUDIT.md) - Production configuration review
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment procedures
- [DEPLOYMENT_AUDIT.md](DEPLOYMENT_AUDIT.md) - Deployment audit report
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - Pre-deployment checklist
- [VM_DEPLOYMENT_FIX.md](VM_DEPLOYMENT_FIX.md) - VM deployment troubleshooting
- [NGINX_PROXY_CONFIG.md](NGINX_PROXY_CONFIG.md) - Nginx configuration guide

### RBAC & Permissions
- [RBAC_PERMISSION_MAPPING.md](RBAC_PERMISSION_MAPPING.md) - Complete permission mapping
- [RBAC_IMPLEMENTATION_SUMMARY.md](RBAC_IMPLEMENTATION_SUMMARY.md) - RBAC implementation overview
- [RBAC_VALIDATION_GUIDE.md](RBAC_VALIDATION_GUIDE.md) - How to validate permissions
- [SUPER_ADMIN_RBAC_SCREEN_MAPPING.md](SUPER_ADMIN_RBAC_SCREEN_MAPPING.md) - Super admin screens
- [CENTER_MANAGER_RBAC_MAPPING.md](CENTER_MANAGER_RBAC_MAPPING.md) - Center manager permissions
- [TICKET_MODULE_RBAC_FIXES.md](TICKET_MODULE_RBAC_FIXES.md) - Ticket module permission fixes

### Student Portal & Workflow
- [STUDENT_WORKFLOW_QUICK_START.md](STUDENT_WORKFLOW_QUICK_START.md) - Quick start guide
- [STUDENT_WORKFLOW_IMPLEMENTATION.md](STUDENT_WORKFLOW_IMPLEMENTATION.md) - Implementation details
- [STUDENT_PORTAL_IMPLEMENTATION.md](STUDENT_PORTAL_IMPLEMENTATION.md) - Student portal setup
- [STUDENT_REGISTRATION_LOGIN_FLOW.md](STUDENT_REGISTRATION_LOGIN_FLOW.md) - Registration flow
- [AGENT_STUDENT_REGISTRATION_FLOW.md](AGENT_STUDENT_REGISTRATION_FLOW.md) - Agent-initiated registration

### Security & Authentication
- [SECURITY_URGENT_ACTION_REQUIRED.md](SECURITY_URGENT_ACTION_REQUIRED.md) - Security recommendations
- [JWT_TOKEN_COMPREHENSIVE_FIX.md](JWT_TOKEN_COMPREHENSIVE_FIX.md) - JWT implementation
- [AUTH_TOKEN_STANDARDIZATION.md](AUTH_TOKEN_STANDARDIZATION.md) - Token standardization
- [MOBILE_VERIFICATION_SECURITY.md](MOBILE_VERIFICATION_SECURITY.md) - Mobile OTP security
- [DATABASE_OTP_GUIDE.md](DATABASE_OTP_GUIDE.md) - OTP implementation guide

### Architecture & Technical
- [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md) - Technical overview
- [API.md](API.md) - API reference
- [PROJECT_LAYOUT_ARCHITECTURE_FIX.md](PROJECT_LAYOUT_ARCHITECTURE_FIX.md) - Project structure
- [SMART_URL_AUTO_DETECTION.md](SMART_URL_AUTO_DETECTION.md) - URL detection system
- [MONGODB_CONDITIONAL_LOGIC.md](MONGODB_CONDITIONAL_LOGIC.md) - MongoDB query patterns
- [MASTER_TABLES_REFERENCE.md](MASTER_TABLES_REFERENCE.md) - Database reference

### Development & Setup
- [DEVELOPMENT.md](DEVELOPMENT.md) - Development setup guide
- [ENVIRONMENT_GUIDE.md](ENVIRONMENT_GUIDE.md) - Environment configuration
- [ENV_FILES_EXPLANATION.md](ENV_FILES_EXPLANATION.md) - Environment variables explained
- [BITBUCKET_QUICKSTART.md](BITBUCKET_QUICKSTART.md) - Git workflow

### Code Quality & Refactoring
- [CODE_CLEANUP_SUMMARY.md](CODE_CLEANUP_SUMMARY.md) - Code cleanup report
- [CODE_AUDIT_CLEANUP_REPORT.md](CODE_AUDIT_CLEANUP_REPORT.md) - Audit findings
- [REFACTOR_IMPLEMENTATION_GUIDE.md](REFACTOR_IMPLEMENTATION_GUIDE.md) - Refactoring guidelines
- [USER_SEARCH_REFACTOR_SUMMARY.md](USER_SEARCH_REFACTOR_SUMMARY.md) - User search optimization

### UI/UX & Frontend
- [FRONTEND_404_FIX.md](FRONTEND_404_FIX.md) - 404 error resolution
- [SUBMENU_ACCORDION_FIX.md](SUBMENU_ACCORDION_FIX.md) - Navigation fixes
- [HUBBLEHOX_DESIGN_GUIDELINES.md](HUBBLEHOX_DESIGN_GUIDELINES.md) - Design system
- [ACCESSIBILITY.md](ACCESSIBILITY.md) - Accessibility implementation

### Features & Enhancements
- [OFFLINE_CENTERS_ENHANCEMENT.md](OFFLINE_CENTERS_ENHANCEMENT.md) - Offline centers feature
- [FORM_FIELDS_ENHANCEMENT_SUMMARY.md](FORM_FIELDS_ENHANCEMENT_SUMMARY.md) - Form improvements
- [CONDITION_BASED_ASSIGNMENT.md](CONDITION_BASED_ASSIGNMENT.md) - Auto-assignment logic
- [SLA_SETUP_COMPLETE.md](SLA_SETUP_COMPLETE.md) - SLA configuration

### Project Management
- [SAC_Helpdesk_Portal_Presentation.md](SAC_Helpdesk_Portal_Presentation.md) - Project overview
- [AUDIT_REPORT.md](AUDIT_REPORT.md) - System audit
- [COMPLETION_STATUS.md](COMPLETION_STATUS.md) - Feature completion tracking

## 📋 Quick Reference

### For Developers
1. Start with [DEVELOPMENT.md](DEVELOPMENT.md) for local setup
2. Check [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md) for architecture
3. Review [API.md](API.md) for endpoint reference

### For Deployment
1. Follow [PRODUCTION_DEPLOYMENT_GUIDE.md](PRODUCTION_DEPLOYMENT_GUIDE.md)
2. Use [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) before deployment
3. Review [ENVIRONMENT_GUIDE.md](ENVIRONMENT_GUIDE.md) for configuration

### For Testing
1. [RBAC_VALIDATION_GUIDE.md](RBAC_VALIDATION_GUIDE.md) - Test permissions
2. [PERFORMANCE_TESTING.md](PERFORMANCE_TESTING.md) - Performance benchmarks
3. [QUICK_RBAC_TEST.md](QUICK_RBAC_TEST.md) - Quick permission tests

### For Troubleshooting
1. [FRONTEND_404_FIX.md](FRONTEND_404_FIX.md) - Frontend routing issues
2. [VM_DEPLOYMENT_FIX.md](VM_DEPLOYMENT_FIX.md) - Server deployment issues
3. [SECURITY_URGENT_ACTION_REQUIRED.md](SECURITY_URGENT_ACTION_REQUIRED.md) - Security concerns

---

## 🎯 Recent Updates (Dec 2025)

### Performance Optimization
- Rate limiting increased from 100 → 500 requests/15min
- Database queries optimized (7 calls → 1 aggregate)
- Added 14 database indexes for faster lookups
- See [PERFORMANCE_OPTIMIZATION.md](PERFORMANCE_OPTIMIZATION.md) for details

### Code Organization
- All test scripts moved to `backend/test-scripts/`
- Documentation consolidated in `docs/` folder
- Unnecessary files removed from root
- Clean project structure for deployment

---

**Note:** This documentation is version-controlled but NOT deployed to production servers. 
See `../.gitignore` for files excluded from deployment.
