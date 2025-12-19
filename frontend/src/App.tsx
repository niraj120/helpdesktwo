import { Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PERMISSIONS } from './constants/permissions'
import Login from './components/Login'
import ProjectLogin from './pages/ProjectLogin'
import AgentDashboard from './components/AgentDashboard'
import ProjectDashboard from './pages/ProjectDashboard'
import ProjectPortalLogin from './pages/ProjectPortalLogin'
import ProjectForgotPassword from './pages/ProjectForgotPassword'
import ProjectPortalDashboard from './pages/ProjectPortalDashboard'
import StudentPortal from './pages/StudentPortal'
import AuthenticatedStudentSubmitTicket from './pages/AuthenticatedStudentSubmitTicket'
import StudentLayout from './components/StudentLayout';
import ConditionalStudentLayout from './components/ConditionalStudentLayout';
import StudentDashboard from './pages/StudentDashboard';
import SimpleStudentDashboard from './pages/SimpleStudentDashboard';
import StudentTicketDetail from './pages/StudentTicketDetail'
import ForgotPassword from './components/ForgotPassword'
import EULA from './components/EULA'
import ProjectManagement from './components/ProjectManagement'
import MasterDataManagement from './components/MasterDataManagement'
// import RoleManagement from './components/RoleManagement' // UNUSED: Replaced by RBACSetup
import RBACSetup from './pages/RBACSetup'
import UserManagement from './components/UserManagement'
import DashboardLayout from './components/DashboardLayout'
// import { FieldFormManagement } from './components/FieldFormManagement' // TODO: Implement
// import { TicketAutomation } from './components/TicketAutomation' // TODO: Implement
import SLARulesPage from './pages/SLARulesPage'
// import ApprovalWorkflows from './pages/Approvals/ApprovalWorkflows' // HIDDEN: Module not ready
import EscalationMatrixPage from './pages/EscalationMatrixPage'
import TicketListReport from './pages/TicketListReport'
import ActivityLogs from './components/ActivityLogs'
import AccessLogs from './components/AccessLogs'
import KnowledgeBaseManagement from './components/KnowledgeBaseManagement'
import KnowledgeBaseViewer from './components/KnowledgeBaseViewer'
import KBArticleView from './pages/KBArticleView'
import FAQManagement from './components/FAQManagement'
import FAQViewer from './components/FAQViewer'
import FeedbackFormManagement from './components/FeedbackFormManagement'
import FeedbackResponses from './components/FeedbackResponses'
import AssetManagement from './components/AssetManagement'
import CenterAssetMapping from './components/CenterAssetMapping'
import MyAssets from './components/MyAssets'
import MyAssetsStatic from './components/MyAssetsStatic'
import TicketSettings from './components/TicketSettings'
import TicketConfigurationPage from './pages/TicketConfigurationPage'
import AgentTicketDetail from './pages/AgentTicketDetail'
import OfflineModuleSettings from './pages/OfflineModuleSettings'
import OfflineModuleConfigPage from './pages/OfflineModuleConfigPage'
import ProtectedRoute from './components/ProtectedRoute'
import ViewTickets from './pages/ViewTickets'
import TicketAssignment from './pages/TicketAssignment'
import MyTickets from './pages/MyTickets'
import NoAccess from './pages/NoAccess'
import EmailConfigPage from './pages/EmailConfigPage'
import EmailLogsPage from './pages/EmailLogsPage'
import WebhookFailureLogs from './pages/WebhookFailureLogs'
// import BlockedEmailRecipients from './components/BlockedEmailRecipients' // TODO: Implement
// import EmailFailureLogs from './components/EmailFailureLogs' // TODO: Implement
// import IntegrationsManagement from './components/IntegrationsManagement' // TODO: Implement

const Dashboard = () => {
  const { i18n } = useTranslation()
  
  const getText = (en: string, hi: string, mr: string): string => {
    if (i18n.language === 'hi') return hi;
    if (i18n.language === 'mr') return mr;
    return en;
  };
  
  return (
    <DashboardLayout>
      <div style={{ 
        padding: '48px', 
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '36px', fontWeight: '600', color: '#1f2937', marginBottom: '16px' }}>
          {getText('Welcome to SAC Helpdesk Portal', 'SAC हेल्पडेस्क पोर्टल में आपका स्वागत है', 'SAC हेल्पडेस्क पोर्टलमध्ये आपले स्वागत आहे')}
        </h1>
        <p style={{ fontSize: '18px', color: '#6b7280' }}>
          {getText('Navigate using the sidebar to manage your projects and settings.', 'अपने प्रोजेक्ट और सेटिंग्स को प्रबंधित करने के लिए साइडबार का उपयोग करें।', 'तुमचे प्रकल्प आणि सेटिंग्ज व्यवस्थापित करण्यासाठी साइडबार वापरून नेव्हिगेट करा.')}
        </p>
      </div>
    </DashboardLayout>
  )
}

function App() {
  return (
    <div>
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
                <KnowledgeBaseViewer />
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
              <TicketListReport />
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
              <CenterAssetMapping />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/my-assets" 
          element={
            <ProtectedRoute permission="ASSET_MANAGE">
              <MyAssets />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/my-assets-demo" 
          element={<MyAssetsStatic />} 
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
        
        {/* TODO: Implement these routes when components are ready */}
        {/* <Route path="/integrations" element={
          <ProtectedRoute modulePrefix="INTEGRATION_">
            <IntegrationsManagement />
          </ProtectedRoute>
        } /> */}
        
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
        
        {/* Default Route - Redirect to login */}
        <Route path="/" element={<Login />} />
      </Routes>
    </div>
  )
}

export default App