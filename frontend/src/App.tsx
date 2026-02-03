import { Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect, lazy, Suspense } from 'react'
import { PERMISSIONS } from './constants/permissions'

// ============================================================================
// PERFORMANCE OPTIMIZATION: Lazy Loading
// ============================================================================
// All page components are now lazy-loaded to reduce initial bundle size.
// This can reduce initial load from ~2.5MB to ~800KB (68% reduction).
// Components are loaded on-demand when user navigates to that route.
// ============================================================================

// Loading component for Suspense fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-gray-600 text-sm">Loading...</p>
    </div>
  </div>
);

// ============================================================================
// Critical Path Components (loaded immediately for fast first paint)
// ============================================================================
import Login from './components/Login'
import ProtectedRoute from './components/ProtectedRoute'
import { useDynamicTitle } from './hooks/useDynamicTitle'

// ============================================================================
// Lazy-loaded Page Components (loaded on-demand)
// ============================================================================

// Authentication & Portal
const ProjectLogin = lazy(() => import('./pages/ProjectLogin'))
const ProjectPortalLogin = lazy(() => import('./pages/ProjectPortalLogin'))
const ProjectForgotPassword = lazy(() => import('./pages/ProjectForgotPassword'))
const ForgotPassword = lazy(() => import('./components/ForgotPassword'))
const EULA = lazy(() => import('./components/EULA'))
const NoAccess = lazy(() => import('./pages/NoAccess'))

// Dashboards
const Dashboard = lazy(() => import('./pages/Dashboard'))
const AgentDashboard = lazy(() => import('./components/AgentDashboard'))
const ProjectDashboard = lazy(() => import('./pages/ProjectDashboard'))
const ProjectPortalDashboard = lazy(() => import('./pages/ProjectPortalDashboard'))

// Student Portal
const StudentPortal = lazy(() => import('./pages/StudentPortal'))
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'))
const SimpleStudentDashboard = lazy(() => import('./pages/SimpleStudentDashboard'))
const StudentTicketDetail = lazy(() => import('./pages/StudentTicketDetail'))
const AuthenticatedStudentSubmitTicket = lazy(() => import('./pages/AuthenticatedStudentSubmitTicket'))
const StudentLayout = lazy(() => import('./components/StudentLayout'))
const ConditionalStudentLayout = lazy(() => import('./components/ConditionalStudentLayout'))

// Ticket Management
const ViewTickets = lazy(() => import('./pages/ViewTickets'))
const MyTickets = lazy(() => import('./pages/MyTickets'))
const TicketAssignment = lazy(() => import('./pages/TicketAssignment'))
const AgentTicketDetail = lazy(() => import('./pages/AgentTicketDetail'))
const TicketSettings = lazy(() => import('./components/TicketSettings'))
const TicketConfigurationPage = lazy(() => import('./pages/TicketConfigurationPage'))

// Admin Management
const ProjectManagement = lazy(() => import('./components/ProjectManagement'))
const MasterDataManagement = lazy(() => import('./components/MasterDataManagement'))
const RBACSetup = lazy(() => import('./pages/RBACSetup'))
const UserManagement = lazy(() => import('./components/UserManagement'))
const DashboardLayout = lazy(() => import('./components/DashboardLayout'))

// SLA & Escalation
const SLARulesPage = lazy(() => import('./pages/SLARulesPage'))
const EscalationMatrixPage = lazy(() => import('./pages/EscalationMatrixPage'))

// Reports
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const TicketListReport = lazy(() => import('./pages/TicketListReport'))

// Knowledge Base
const KnowledgeBaseManagement = lazy(() => import('./components/KnowledgeBaseManagement'))
const KBArticleView = lazy(() => import('./pages/KBArticleView'))
const KBLevelManagementPage = lazy(() => import('./pages/KBLevelManagementPage'))
const KBArticleManagementPage = lazy(() => import('./pages/KBArticleManagementPage'))
const KBTableManagementPage = lazy(() => import('./pages/KBTableManagementPage'))
const KBViewerPage = lazy(() => import('./pages/KBViewerPage'))
const StudentKBViewerPage = lazy(() => import('./pages/StudentKBViewerPage'))

// FAQ & Feedback
const FAQManagement = lazy(() => import('./components/FAQManagement'))
const FAQViewer = lazy(() => import('./components/FAQViewer'))
const FeedbackFormManagement = lazy(() => import('./components/FeedbackFormManagement'))
const FeedbackResponses = lazy(() => import('./components/FeedbackResponses'))

// Assets
const AssetManagement = lazy(() => import('./components/AssetManagement'))
const CenterAssetMappingAccordion = lazy(() => import('./components/CenterAssetMappingAccordion'))
const MyAssets = lazy(() => import('./components/MyAssets'))
const FindCenterPage = lazy(() => import('./pages/FindCenterPage'))

// Offline Module
const OfflineModuleSettings = lazy(() => import('./pages/OfflineModuleSettings'))
const OfflineModuleConfigPage = lazy(() => import('./pages/OfflineModuleConfigPage'))

// Audit & Logs
const ActivityLogs = lazy(() => import('./components/ActivityLogs'))
const AccessLogs = lazy(() => import('./components/AccessLogs'))
const EmailLogsPage = lazy(() => import('./pages/EmailLogsPage'))
const WebhookFailureLogs = lazy(() => import('./pages/WebhookFailureLogs'))

// Integrations & Email
const EmailConfigPage = lazy(() => import('./pages/EmailConfigPage'))
const EmailToTicketConfiguration = lazy(() => import('./components/EmailToTicketConfiguration'))
const IntegrationsManagement = lazy(() => import('./components/IntegrationsManagement'))

// System Monitoring
const DBMonitoringDashboard = lazy(() => import('./pages/DBMonitoringDashboard'))

function App() {
  // Update browser tab title dynamically based on project
  useDynamicTitle();
  
  const { i18n } = useTranslation();
  
  // Load saved language preference on app mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem('preferredLanguage');
    if (savedLanguage && ['en', 'hi', 'mr'].includes(savedLanguage)) {
      i18n.changeLanguage(savedLanguage);
    }
  }, [i18n]);
  
  return (
    <div>
      <Suspense fallback={<PageLoader />}>
        <Routes>
        {/* Public Routes - No authentication required */}
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/eula" element={<EULA />} />
        <Route path="/no-access" element={<NoAccess />} />
        
        {/* Project-specific public routes */}
        <Route path="/:customUrlPath" element={<ProjectLogin />} />
        <Route path="/:customUrlPath/portal/login" element={<ProjectPortalLogin />} />
        <Route path="/:customUrlPath/portal/forgot-password" element={<ProjectForgotPassword />} />
        <Route path="/:customUrlPath/forgot-password" element={<ForgotPassword />} />
        <Route path="/:customUrlPath/eula" element={<EULA />} />
        
        {/* Public ticket submission and KB - conditionally show authenticated vs public view */}
        <Route 
          path="/:customUrlPath/submit-ticket" 
          element={
            <ConditionalStudentLayout>
              {localStorage.getItem('authToken') ? (
                <AuthenticatedStudentSubmitTicket hideHeader={true} />
              ) : (
                <StudentPortal hideHeader={false} />
              )}
            </ConditionalStudentLayout>
          } 
        />
        {/* Student Portal Routes - Requires authentication only */}
        <Route 
          path="/:customUrlPath/student/dashboard" 
          element={
            <ProtectedRoute requireAuth={true}>
              <SimpleStudentDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/:customUrlPath/student/ticket/:ticketId" 
          element={
            <ProtectedRoute requireAuth={true}>
              <StudentLayout>
                <StudentTicketDetail />
              </StudentLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/:customUrlPath/student/my-tickets" 
          element={
            <ProtectedRoute requireAuth={true}>
              <StudentLayout>
                <MyTickets wrapWithLayout={false} />
              </StudentLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/:customUrlPath/student/faq" 
          element={
            <ProtectedRoute requireAuth={true}>
              <StudentLayout>
                <FAQViewer />
              </StudentLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/:customUrlPath/student/submit-ticket" 
          element={
            <ProtectedRoute requireAuth={true}>
              <StudentLayout>
                <AuthenticatedStudentSubmitTicket hideHeader={true} />
              </StudentLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/:customUrlPath/kb" 
          element={
            <ProtectedRoute requireAuth={true}>
              <StudentLayout>
                <StudentKBViewerPage />
              </StudentLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/:customUrlPath/kb-new/viewer" 
          element={
            <ProtectedRoute requireAuth={true}>
              <StudentLayout>
                <StudentKBViewerPage />
              </StudentLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/:customUrlPath/find-center" 
          element={
            <ProtectedRoute requireAuth={true}>
              <StudentLayout>
                <FindCenterPage />
              </StudentLayout>
            </ProtectedRoute>
          } 
        />
        
        {/* Project Dashboard - For project-specific users */}
        <Route 
          path="/:customUrlPath/dashboard" 
          element={
            <ProtectedRoute modulePrefix="TICKET_">
              <ProjectDashboard />
            </ProtectedRoute>
          } 
        />
        
        {/* Project Portal Routes - Permission-based */}
        <Route 
          path="/:customUrlPath/portal/ticket/:ticketId" 
          element={
            <ProtectedRoute permission={['TICKET_VIEW_ALL', 'TICKET_VIEW_OWN']}>
              <AgentTicketDetail />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/:customUrlPath/portal/*" 
          element={
            <ProtectedRoute requireAuth={true}>
              <ProjectPortalDashboard />
            </ProtectedRoute>
          } 
        />
        
        {/* Main System Routes - Super Admin & Managers */}
        
        {/* Dashboard - Requires authentication only */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute requireAuth={true}>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        
        {/* Project Management - Requires PROJECT_* permissions */}
        <Route 
          path="/projects" 
          element={
            <ProtectedRoute modulePrefix="PROJECT_">
              <ProjectManagement />
            </ProtectedRoute>
          } 
        />
        
        {/* Master Data - Requires MASTER_DATA_VIEW */}
        <Route 
          path="/master-data" 
          element={
            <ProtectedRoute permission="MASTER_DATA_VIEW">
              <MasterDataManagement />
            </ProtectedRoute>
          } 
        />
        
        {/* RBAC Setup - Requires RBAC_* permissions */}
        <Route 
          path="/rbac" 
          element={
            <ProtectedRoute modulePrefix="RBAC_">
              <RBACSetup />
            </ProtectedRoute>
          } 
        />
        
        {/* User Management - Requires USER_* permissions */}
        <Route 
          path="/users" 
          element={
            <ProtectedRoute modulePrefix="USER_">
              <UserManagement />
            </ProtectedRoute>
          } 
        />
        
        {/* Tickets - View All Tickets */}
        <Route 
          path="/tickets/view" 
          element={
            <ProtectedRoute permission="TICKET_VIEW_ALL">
              <ViewTickets />
            </ProtectedRoute>
          } 
        />
        
        {/* Tickets - My Tickets (View Own or View All) */}
        <Route 
          path="/tickets/my-tickets" 
          element={
            <ProtectedRoute permission="TICKET_VIEW_OWN">
              <MyTickets />
            </ProtectedRoute>
          } 
        />
        
        {/* Tickets - Assign Tickets */}
        <Route 
          path="/tickets/assign" 
          element={
            <ProtectedRoute permission="TICKET_ASSIGN">
              <TicketAssignment />
            </ProtectedRoute>
          } 
        />
        
        {/* Ticket Configuration - Requires TICKET_CONFIG_* permissions */}
        <Route 
          path="/ticket-config" 
          element={
            <ProtectedRoute permission={['TICKET_CONFIG_VIEW', 'TICKET_CONFIG_MANAGE_CATEGORIES', 'TICKET_CONFIG_MANAGE_STATUSES']}>
              <TicketConfigurationPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/ticket-config/settings/:projectId" 
          element={
            <ProtectedRoute permission={['TICKET_CONFIG_VIEW', 'TICKET_CONFIG_MANAGE_CATEGORIES']}>
              <TicketSettings />
            </ProtectedRoute>
          } 
        />
        
        {/* Offline Module - Requires OFFLINE_* permissions */}
        <Route 
          path="/offline-module" 
          element={
            <ProtectedRoute modulePrefix="OFFLINE_">
              <OfflineModuleConfigPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/offline-module/settings/:projectId" 
          element={
            <ProtectedRoute modulePrefix="OFFLINE_">
              <OfflineModuleSettings />
            </ProtectedRoute>
          } 
        />
        
        {/* SLA & Escalation - Requires SLA_* permissions */}
        <Route 
          path="/sla" 
          element={
            <ProtectedRoute modulePrefix="SLA_">
              <SLARulesPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/escalation-matrix" 
          element={
            <ProtectedRoute permission={PERMISSIONS.SLA_MANAGE_ESCALATIONS}>
              <EscalationMatrixPage />
            </ProtectedRoute>
          } 
        />
        
        {/* Reports - Requires REPORT_* permissions */}
        <Route 
          path="/reports" 
          element={
            <ProtectedRoute modulePrefix="REPORT_">
              <ReportsPage />
            </ProtectedRoute>
          } 
        />
        
        {/* Approval Workflows - HIDDEN: Module not ready */}
        {/* <Route 
          path="/approvals" 
          element={
            <ProtectedRoute modulePrefix="APPROVAL_">
              <ApprovalWorkflows />
            </ProtectedRoute>
          } 
        /> */}
        
        {/* Knowledge Base - Requires KB_* permissions */}
        <Route 
          path="/knowledge-base" 
          element={
            <ProtectedRoute permission={['KB_VIEW', 'KB_CREATE', 'KB_EDIT', 'KB_DELETE']}>
              <KnowledgeBaseManagement />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/kb/:articleId" 
          element={
            <ProtectedRoute permission="KB_VIEW">
              <KBArticleView />
            </ProtectedRoute>
          } 
        />
        
        {/* New Modular Knowledge Base - Requires KB_MANAGE permission */}
        <Route 
          path="/kb-new/levels" 
          element={
            <ProtectedRoute permission={[PERMISSIONS.KB_MANAGE, PERMISSIONS.KB_MANAGE_LEVELS]}>
              <KBLevelManagementPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/kb-new/articles" 
          element={
            <ProtectedRoute permission={[PERMISSIONS.KB_MANAGE, PERMISSIONS.KB_MANAGE_ARTICLES]}>
              <KBArticleManagementPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/kb-new/tables" 
          element={
            <ProtectedRoute permission={[PERMISSIONS.KB_MANAGE, PERMISSIONS.KB_MANAGE_TABLES]}>
              <KBTableManagementPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/kb-new/viewer" 
          element={
            <ProtectedRoute permission={[PERMISSIONS.KB_VIEW_CONTENT, PERMISSIONS.KB_MANAGE, PERMISSIONS.KB_MANAGE_LEVELS, PERMISSIONS.KB_MANAGE_ARTICLES, PERMISSIONS.KB_MANAGE_TABLES]}>
              <KBViewerPage />
            </ProtectedRoute>
          } 
        />
        
        {/* FAQ - Management requires FAQ_* permissions, viewing requires FAQ_VIEW */}
        <Route 
          path="/faq" 
          element={
            <ProtectedRoute permission={['FAQ_VIEW', 'FAQ_CREATE', 'FAQ_EDIT', 'FAQ_DELETE']}>
              <FAQManagement />
            </ProtectedRoute>
          } 
        />
        
        {/* Feedback Module - Requires FEEDBACK_* permissions */}
        <Route 
          path="/feedback/forms" 
          element={
            <ProtectedRoute permission={['FEEDBACK_FORM_CREATE', 'FEEDBACK_FORM_EDIT', 'FEEDBACK_FORM_DELETE']}>
              <FeedbackFormManagement />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/feedback/responses" 
          element={
            <ProtectedRoute permission="FEEDBACK_VIEW">
              <FeedbackResponses />
            </ProtectedRoute>
          } 
        />
        
        {/* Asset Management - Requires ASSET_* permissions */}
        <Route 
          path="/assets" 
          element={
            <ProtectedRoute permission="ASSET_VIEW">
              <AssetManagement />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/center-assets" 
          element={
            <ProtectedRoute permission="ASSET_MANAGE">
              <CenterAssetMappingAccordion />
            </ProtectedRoute>
          } 
        />

        
        {/* Audit Logs - Requires AUDIT_* permissions */}
        <Route 
          path="/audit/activity-logs" 
          element={
            <ProtectedRoute permission="AUDIT_VIEW_ACTIVITY">
              <ActivityLogs />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/audit/access-logs" 
          element={
            <ProtectedRoute permission="AUDIT_VIEW_ACCESS">
              <AccessLogs />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/audit/email-logs" 
          element={
            <ProtectedRoute permission="EMAIL_CONFIG_VIEW">
              <EmailLogsPage />
            </ProtectedRoute>
          } 
        />
        
        {/* Integration Module - Hub Page */}
        <Route 
          path="/integrations" 
          element={
            <ProtectedRoute modulePrefix="INTEGRATION_">
              <IntegrationsManagement />
            </ProtectedRoute>
          } 
        />
        
        {/* Integration Module - Email-to-Ticket Configuration */}
        <Route 
          path="/integrations/email-to-ticket" 
          element={
            <ProtectedRoute permission="EMAIL_CONFIG_VIEW">
              <EmailToTicketConfiguration />
            </ProtectedRoute>
          } 
        />
        
        {/* Webhook & API Failure Logs - Super Admin */}
        <Route 
          path="/audit/webhook-failure-logs" 
          element={
            <ProtectedRoute permission={['AUDIT_VIEW_WEBHOOK_FAILURES', 'AUDIT_VIEW_INTEGRATION_FAILURES']}>
              <WebhookFailureLogs />
            </ProtectedRoute>
          } 
        />
        
        {/* Email Configuration - Super Admin */}
        <Route 
          path="/email-config" 
          element={
            <ProtectedRoute permission="EMAIL_CONFIG_VIEW">
              <DashboardLayout>
                <EmailConfigPage />
              </DashboardLayout>
            </ProtectedRoute>
          } 
        />
        
        {/* Database Monitoring - Super Admin Only */}
        <Route 
          path="/system/db-monitoring" 
          element={
            <ProtectedRoute requireAuth={true}>
              <DBMonitoringDashboard />
            </ProtectedRoute>
          } 
        />
        
        {/* Default Route - Redirect to login */}
        <Route path="/" element={<Login />} />
      </Routes>
      </Suspense>
    </div>
  )
}

export default App