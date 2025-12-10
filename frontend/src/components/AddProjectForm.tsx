import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MdSettings, MdLock, MdShield, MdPalette, MdConfirmationNumber } from 'react-icons/md';
import DOMPurify from 'dompurify';
import { getText } from '../utils/language';
import API_BASE_URL from '../config/api';


interface AddProjectFormProps {
  project?: any | null;
  onClose: () => void;
  onSave: () => void;
}

const AddProjectForm = ({ project, onClose, onSave }: AddProjectFormProps) => {
  const { i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  
  // Toast notification state
  const [toast, setToast] = useState<{
    show: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
  }>({ show: false, type: 'success', message: '' });

  // Form validation errors
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  
  // Knowledge Base expandable sections
  const [kbHomeExpanded, setKbHomeExpanded] = useState(true);
  const [articleConfigExpanded, setArticleConfigExpanded] = useState(false);
  const [seoExpanded, setSeoExpanded] = useState(false);

  // Customization modals
  const [showCustomCSSModal, setShowCustomCSSModal] = useState(false);
  const [showCustomJSModal, setShowCustomJSModal] = useState(false);
  const [showBannerPreview, setShowBannerPreview] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    // General Tab - Portal Settings
    portalName: project?.name || project?.branding?.headerText || '',
    portalUrl: project?.branding?.domainUrl || '',
    displayPortalNameInNav: true,
    
    // Logo and Favicon
    logo: project?.branding?.logo || '',
    favicon: project?.branding?.favicon || '',
    logoFile: null as File | null,
    faviconFile: null as File | null,
    
    // Logo Linkback URL
    logoLinkbackUrl: project?.branding?.logoLinkbackUrl || '',
    
    // Footer Links
    copyrightUrl: '',
    termsOfUseUrl: '',
    privacyPolicyUrl: '',
    cookiePolicyUrl: '',
    
    // Announcement Banner
    announcementBannerMessage: '',
    announcementBannerType: 'plain' as 'plain' | 'rich',
    
    // Ticket Assignment Settings
    enableAutoAssignment: false,
    assignmentType: 'manual' as 'round-robin' | 'load-balanced' | 'manual' | 'condition-based',
    assignToUsers: [] as string[],
    assignToRoles: [] as string[],
    reassignOnEscalation: false,
    notifyOnAssignment: true,
    // Condition-based assignment rules
    conditionRules: [] as Array<{
      field: string;
      operator: string;
      categories: string[];
      assignToAgents: string[];
    }>,
    // Manual assignment permissions
    manualAssignmentPermissions: [] as Array<{
      roleId: string;
      canAssignToRoles: string[];
    }>,
    
    // Ticket Submission Settings (for Student Portal)
    ticketSubmissionMode: 'both' as 'online' | 'offline' | 'both',
    enableOnlineTicketForm: true,
    enableOfflineCenter: true,
    ticketSubmissionAnnouncement: '',
    ticketWelcomeMessage: 'Welcome! Submit your query below and our team will assist you.',
    ticketSuccessMessage: 'Your ticket has been successfully submitted. We will get back to you soon.',
    allowTicketAttachments: true,
    maxTicketAttachmentSize: 10, // in MB
    allowedTicketFileTypes: ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'],
    onlineFormFields: [] as Array<{
      fieldName: string;
      fieldType: 'text' | 'number' | 'date' | 'email' | 'phone' | 'url' | 'textarea' | 'dropdown' | 'multiselect' | 'radio' | 'checkbox' | 'file';
      required: boolean;
      placeholder: string;
      options?: string[];
      allowedFileTypes?: string[];
      maxFileSizeMB?: number;
      allowMultiple?: boolean;
    }>,
    offlineCenters: [] as Array<{
      centerName: string;
      address: string;
      city: string;
      state: string;
      pincode: string;
      phone: string;
      email: string;
      workingHours: string;
      latitude?: number;
      longitude?: number;
      features?: string[];
      mapLink?: string;
    }>,
    
    // File Download Settings
    fileDownloadPermission: 'logged-in-permission' as 'logged-in-permission' | 'logged-in' | 'anyone',
    inlineImageAttachment: false,
    
    // Email Attachment Settings
    attachFilesToEmails: false,
    
    // Google Tag Manager
    googleTagManagerId: '',

    // Login Tab Settings
    enableFormLogin: true,
    enableGoogleRecaptcha: false,
    socialLogins: {
      google: false,
      facebook: false,
      microsoft: false
    },
    ssoSettings: {
      oauth20: false,
      openIdConnect: false,
      jwt: false
    },

    // Security Tab Settings
    allowUserSignup: true,
    restrictSignupViaSocial: false,
    enforceTwoFactorAuth: false,
    passwordPolicy: 'default' as 'default' | 'custom',
    requireLowerCase: false,
    requireUpperCase: false,
    requireNumber: false,
    requireSpecialChar: false,
    minimumPasswordLength: 8,
    passwordExpiration: 'never' as 'never' | '30' | '60' | '90' | '180',

    // Knowledge Base Tab Settings
    enableKB: true,
    kbHomeConfiguration: {
      bannerHeading: 'How can we help you?',
      bannerDescription: '',
      bannerTextColor: '#008000',
      bannerBackgroundType: 'color' as 'color' | 'image',
      bannerBackgroundColor: '#4B0082',
      bannerBackgroundImage: null as File | null,
      showPopularArticles: true,
      popularArticlesCount: 10,
      portalViewableBy: 'all' as 'all' | 'loggedin'
    },
    articleConfiguration: {
      showAuthorName: false,
      showPublishedDate: true,
      showLastUpdatedDate: false,
      enableTableOfContents: false,
      showRelatedArticles: true,
      relatedArticlesCount: 5,
      showRecentArticles: true,
      recentArticlesCount: 5,
      showSameCategoryArticles: true,
      excludeAgentViewCount: false,
      showArticleTags: true,
      enableStatusIndicator: true,
      showShareOption: true,
      shareOnFacebook: true,
      shareOnTwitter: true,
      shareOnLinkedIn: true,
      shareViaEmail: true,
      showEstimatedReadTime: false,
      showComments: false,
      showPreviousNextNavigation: false
    },
    enableAIAssistance: false,
    enableSatisfactionFeedback: true,
    satisfactionFeedback: {
      infoMessage: 'Was this article useful?',
      voteType: 'like' as 'like' | 'upvote' | 'yesno',
      voteLabels: {
        positive: 'Like',
        negative: 'Dislike'
      },
      feedbackMessages: [
        'Correct inaccurate or outdated content',
        'Improve illustrations or images',
        'Fix typos or broken links',
        'Need more information',
        'Correct inaccurate or outdated code samples'
      ],
      successMessage: 'Thank you for your feedback!',
      consentMessage: 'Can we contact you about this feedback?'
    },
    seoSettings: {
      changeFrequency: 'weekly' as 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never',
      sitemapUrl: '',
      robotsTxt: '',
      robotsTxtUrl: '',
      metaTitle: '',
      metaDescription: '',
      sameAsMetaTitleDescription: true,
      ogTitle: '',
      ogDescription: '',
      ogImage: null as File | null
    },

    // Customization Tab Settings
    loginPageBackgroundImage: null as File | null,
    loginPageBackgroundImageUrl: '',
    themeMode: 'light' as 'light' | 'dark',
    themeColor: '#444ce7',
    customCSS: '',
    customJS: '',

    // Contact Information
    address: {
      street: project?.address?.street || '',
      city: project?.address?.city || '',
      state: project?.address?.state || '',
      country: project?.address?.country || 'India',
      pincode: project?.address?.pincode || ''
    },
    contactInfo: {
      phone: project?.contactInfo?.phone || '',
      email: project?.contactInfo?.email || '',
      website: project?.contactInfo?.website || ''
    },
    primaryContact: {
      name: project?.primaryContact?.name || '',
      title: project?.primaryContact?.designation || '',
      email: project?.primaryContact?.email || '',
      phone: project?.primaryContact?.phone || ''
    },

    // Branding
    branding: {
      primaryColor: project?.branding?.colorTheme?.primary || '#f97316',
      secondaryColor: project?.branding?.colorTheme?.secondary || '#64748b',
      footerText: project?.branding?.footerText || '© 2025 Your Organization. All rights reserved.',
      customUrlPath: project?.branding?.customUrlPath || ''
    },

    // Modules
    modules: {
      tickets: project?.modules?.tickets ?? true,
      knowledgeBase: project?.modules?.knowledgeBase ?? true,
      reports: project?.modules?.reports ?? true,
      assets: project?.modules?.assets ?? false,
      communication: project?.modules?.communication ?? true,
      analytics: project?.modules?.analytics ?? true,
      userManagement: project?.modules?.userManagement ?? true,
      workflows: project?.modules?.workflows ?? false,
      approvals: project?.modules?.approvals ?? false,
      notifications: project?.modules?.notifications ?? true
    },

    // Settings
    settings: {
      defaultLanguage: project?.settings?.defaultLanguage || 'en',
      timezone: project?.settings?.timezone || 'Asia/Kolkata',
      dateFormat: project?.settings?.dateFormat || 'DD/MM/YYYY',
      timeFormat: project?.settings?.timeFormat || '12h',
      currency: project?.settings?.currency || 'INR'
    }
  });

  // Master data states
  const [countries, setCountries] = useState<Array<{ key: string; value: string }>>([]);
  const [states, setStates] = useState<Array<{ key: string; value: string }>>([]);
  const [cities, setCities] = useState<Array<{ key: string; value: string }>>([]);
  const [users, setUsers] = useState<Array<{ 
    _id: string; 
    name: string; 
    email: string; 
    role: string | { _id: string; code: string; name: string; permissions?: string[] }; 
    roleId?: string; 
    projects?: string[] 
  }>>([]);
  const [roles, setRoles] = useState<Array<{ 
    _id: string; 
    name: string; 
    code: string; 
    projectId?: string; 
    projects?: string[]; 
    type?: string;
    isActive?: boolean;
    permissions?: Array<{ _id: string; code: string; name: string }> | string[];
    isAgent?: boolean;
  }>>([]);
  const [agentRoleId, setAgentRoleId] = useState<string>('');

  // Computed: Filter roles for current project  
  const projectRoles = roles.filter(role => {
    // Get project ID from either _id or id field
    const projectId = project?._id || project?.id;
    
    // When creating new project, show all active roles for selection
    if (!projectId) return role.isActive !== false;
    
    // For existing projects, show ALL active roles (not just mapped ones)
    // This allows mapping roles during project edit
    return role.isActive !== false;
  });
  
  // Computed: Check which roles are actually mapped to this project
  const getMappedStatus = (role: any) => {
    const projectId = project?._id || project?.id;
    if (!projectId) return false;
    
    if (role.projects && Array.isArray(role.projects) && role.projects.length > 0) {
      return role.projects.some((p: any) => String(p) === String(projectId));
    }
    
    if (role.projectId) {
      return String(role.projectId) === String(projectId);
    }
    
    return false;
  };
  
  // Helper: Check if role has TICKET_ASSIGN permission
  const hasAssignTicketPermission = (role: any) => {
    if (!role.permissions || !Array.isArray(role.permissions)) return false;
    
    return role.permissions.some((perm: any) => {
      const permCode = typeof perm === 'string' ? perm : perm.code;
      return permCode === 'TICKET_ASSIGN';
    });
  };
  
  // Computed: Filter roles that can manually assign tickets (have TICKET_ASSIGN permission)
  const rolesWithAssignPermission = projectRoles.filter(role => hasAssignTicketPermission(role));

  // DEBUG: Log roles data
  useEffect(() => {
    console.log('🔍 DEBUG - Full Project Object:', project);
    console.log('🔍 DEBUG - Roles State:', roles.length, roles);
    console.log('🔍 DEBUG - Project ID:', project?._id);
    console.log('🔍 DEBUG - Project id (lowercase):', project?.id);
    console.log('🔍 DEBUG - Project ID Type:', typeof project?._id);
    const actualProjectId = project?._id || project?.id;
    console.log('🔍 DEBUG - Actual Project ID to use:', actualProjectId);
    roles.forEach(role => {
      console.log(`   Role: ${role.name}, Type: ${role.type}, Projects:`, role.projects, 'ProjectId:', role.projectId);
      if (role.projects && Array.isArray(role.projects)) {
        console.log(`      Projects array length:`, role.projects.length);
        console.log(`      Projects types:`, role.projects.map(p => typeof p));
        role.projects.forEach((p, i) => {
          console.log(`      Project[${i}]:`, p, '| String:', String(p), '| Match:', String(p) === String(actualProjectId));
        });
      }
      if (role.projectId) {
        console.log(`      ProjectId match:`, String(role.projectId) === String(actualProjectId));
      }
    });
    console.log('🔍 DEBUG - Filtered ProjectRoles:', projectRoles.length, projectRoles);
    console.log('🔍 DEBUG - ProjectRoles names:', projectRoles.map(r => r.name));
  }, [roles, project, projectRoles]);

  // Computed: Filter users mapped to current project
  const projectUsers = users.filter(user => {
    // When creating new project, show all users
    if (!project?._id) return true;
    
    // Show users whose projects array includes this project
    return user.projects && user.projects.includes(project._id);
  });

  // Computed: Get agents only (with Agent role and mapped to project)
  const projectAgents = projectUsers.filter(user => {
    // Check by roleId first
    if (user.roleId === agentRoleId) return true;
    
    // Check by role object (new JWT structure)
    if (typeof user.role === 'object' && user.role?.code) {
      return user.role.code.toLowerCase() === 'agent';
    }
    
    // Fallback for old string-based role (backward compatibility)
    if (typeof user.role === 'string') {
      return user.role.toLowerCase() === 'agent';
    }
    
    return false;
  });

  // Fetch master data, users, and roles
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const headers = {
          'Authorization': `Bearer ${token}`,
        };
        
        // Fetch ALL roles regardless of project - let client-side filter handle it
        const rolesUrl = `${API_BASE_URL}/roles`;
        
        const [countriesRes, statesRes, citiesRes, usersRes, rolesRes] = await Promise.all([
          fetch(`${API_BASE_URL}/masters/countries`, { headers, credentials: 'include' }),
          fetch(`${API_BASE_URL}/masters/states`, { headers, credentials: 'include' }),
          fetch(`${API_BASE_URL}/masters/cities`, { headers, credentials: 'include' }),
          fetch(`${API_BASE_URL}/users`, { headers, credentials: 'include' }),
          fetch(rolesUrl, { headers, credentials: 'include' })
        ]);

        const [countries, statesData, citiesData, usersData, rolesData] = await Promise.all([
          countriesRes.json(),
          statesRes.json(),
          citiesRes.json(),
          usersRes.json(),
          rolesRes.json()
        ]);

        if (countries.success) setCountries(countries.data);
        if (statesData.success) setStates(statesData.data.map((item: any) => ({ key: item.key, value: item.value })));
        if (citiesData.success) setCities(citiesData.data.map((item: any) => ({ key: item.key, value: item.value })));
        if (usersData.success) setUsers(usersData.data);
        if (rolesData.success) {
          console.log('🔍 DEBUG - Roles API Response:', rolesData.data);
          console.log('🔍 DEBUG - Total roles fetched:', rolesData.data.length);
          setRoles(rolesData.data);
          // Role IDs no longer needed for filtering - permissions handle access control
        }
      } catch (error) {
        console.error('Error fetching master data:', error);
      }
    };

    fetchMasterData();
  }, []); // Only fetch once on mount

  // Update form data when project changes (for edit mode)
  useEffect(() => {
    if (project) {
      console.log('Loading project data:', project); // Debug log
      
      setFormData(prevData => ({
        ...prevData,
        
        // Basic Information
        portalName: project?.name || project?.branding?.headerText || '',
        portalUrl: project?.branding?.domainUrl || '',
        displayPortalNameInNav: true,
        
        // Branding
        logo: project?.branding?.logo || '',
        favicon: project?.branding?.favicon || '',
        logoLinkbackUrl: project?.branding?.logoLinkbackUrl || '',
        
        // Footer Links
        copyrightUrl: project?.configuration?.footerLinks?.copyright || '',
        termsOfUseUrl: project?.configuration?.footerLinks?.termsOfUse || '',
        privacyPolicyUrl: project?.configuration?.footerLinks?.privacyPolicy || '',
        cookiePolicyUrl: project?.configuration?.footerLinks?.cookiePolicy || '',
        
        // Announcement Banner
        announcementBannerMessage: project?.configuration?.announcementBanner?.message || '',
        announcementBannerType: project?.configuration?.announcementBanner?.type || 'plain',
        
        // Ticket Assignment Settings
        enableAutoAssignment: project?.configuration?.ticketAssignmentSettings?.enabled ?? false,
        assignmentType: project?.configuration?.ticketAssignmentSettings?.assignmentType || 'manual',
        assignToUsers: project?.configuration?.ticketAssignmentSettings?.assignToUsers || [],
        assignToRoles: project?.configuration?.ticketAssignmentSettings?.assignToRoles || [],
        reassignOnEscalation: project?.configuration?.ticketAssignmentSettings?.reassignOnEscalation ?? false,
        notifyOnAssignment: project?.configuration?.ticketAssignmentSettings?.notifyOnAssignment ?? true,
        conditionRules: project?.configuration?.ticketAssignmentSettings?.conditionRules || [],
        manualAssignmentPermissions: project?.configuration?.ticketAssignmentSettings?.manualAssignmentPermissions || [],
        
        // Ticket Submission Settings (Student Portal)
        ticketSubmissionMode: project?.configuration?.ticketSubmissionSettings?.mode || 'both',
        enableOnlineTicketForm: project?.configuration?.ticketSubmissionSettings?.enableOnlineForm ?? true,
        enableOfflineCenter: project?.configuration?.ticketSubmissionSettings?.enableOfflineCenter ?? true,
        ticketSubmissionAnnouncement: project?.configuration?.ticketSubmissionSettings?.announcement || '',
        ticketWelcomeMessage: project?.configuration?.ticketSubmissionSettings?.welcomeMessage || 'Welcome! Submit your query below and our team will assist you.',
        ticketSuccessMessage: project?.configuration?.ticketSubmissionSettings?.successMessage || 'Your query has been successfully submitted. We will get back to you soon.',
        allowTicketAttachments: project?.configuration?.ticketSubmissionSettings?.allowAttachments ?? true,
        maxTicketAttachmentSize: project?.configuration?.ticketSubmissionSettings?.maxAttachmentSize || 10,
        allowedTicketFileTypes: project?.configuration?.ticketSubmissionSettings?.allowedFileTypes || ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'],
        onlineFormFields: project?.configuration?.ticketSubmissionSettings?.onlineFormFields || [],
        offlineCenters: project?.configuration?.ticketSubmissionSettings?.offlineCenters || [],
        
        // File Settings
        fileDownloadPermission: project?.configuration?.fileSettings?.downloadPermission || 'logged-in-permission',
        inlineImageAttachment: project?.configuration?.fileSettings?.inlineImageAttachment ?? false,
        attachFilesToEmails: project?.configuration?.fileSettings?.attachToEmails ?? false,
        
        // Login Settings
        enableFormLogin: project?.configuration?.loginSettings?.enableFormLogin ?? true,
        enableGoogleRecaptcha: project?.configuration?.loginSettings?.enableGoogleRecaptcha ?? false,
        
        // Security Settings
        allowUserSignup: project?.configuration?.securitySettings?.allowUserSignup ?? true,
        restrictSignupViaSocial: project?.configuration?.securitySettings?.restrictSignupViaSocial ?? false,
        enforceTwoFactorAuth: project?.configuration?.securitySettings?.mfaRequired ?? false,
        passwordPolicy: project?.configuration?.securitySettings?.passwordPolicy ? 'custom' : 'default',
        requireLowerCase: project?.configuration?.securitySettings?.passwordPolicy?.requireLowercase ?? false,
        requireUpperCase: project?.configuration?.securitySettings?.passwordPolicy?.requireUppercase ?? false,
        requireNumber: project?.configuration?.securitySettings?.passwordPolicy?.requireNumbers ?? false,
        requireSpecialChar: project?.configuration?.securitySettings?.passwordPolicy?.requireSpecialChars ?? false,
        minimumPasswordLength: project?.configuration?.securitySettings?.passwordPolicy?.minLength || 8,
        passwordExpiration: (() => {
          const days = project?.configuration?.securitySettings?.passwordPolicy?.expiryDays;
          if (days === 30 || days === 60 || days === 90 || days === 180) return String(days) as '30' | '60' | '90' | '180';
          return 'never';
        })(),
        
        // Knowledge Base Settings
        enableKB: project?.configuration?.knowledgeBaseSettings?.enabled ?? true,
        kbHomeConfiguration: project?.configuration?.knowledgeBaseSettings?.kbHomeConfiguration || prevData.kbHomeConfiguration,
        articleConfiguration: project?.configuration?.knowledgeBaseSettings?.articleConfiguration || prevData.articleConfiguration,
        enableAIAssistance: project?.configuration?.knowledgeBaseSettings?.enableAIAssistance ?? false,
        enableSatisfactionFeedback: project?.configuration?.knowledgeBaseSettings?.enableSatisfactionFeedback ?? true,
        satisfactionFeedback: project?.configuration?.knowledgeBaseSettings?.satisfactionFeedback || prevData.satisfactionFeedback,
        seoSettings: project?.configuration?.knowledgeBaseSettings?.seoSettings || prevData.seoSettings,
        
        // Customization Settings
        loginPageBackgroundImageUrl: project?.configuration?.customizationSettings?.loginPageBackgroundImage || '',
        themeMode: project?.configuration?.customizationSettings?.themeMode || 'light',
        themeColor: project?.configuration?.customizationSettings?.themeColor || '#444ce7',
        customCSS: project?.configuration?.customizationSettings?.customCSS || '',
        customJS: project?.configuration?.customizationSettings?.customJS || '',
        
        // Address
        address: {
          street: project?.address?.street || '',
          city: project?.address?.city || '',
          state: project?.address?.state || '',
          country: project?.address?.country || 'India',
          pincode: project?.address?.pincode || ''
        },
        
        // Contact Info
        contactInfo: {
          phone: project?.contactInfo?.phone || '',
          email: project?.contactInfo?.email || '',
          website: project?.contactInfo?.website || ''
        },
        
        // Primary Contact
        primaryContact: {
          name: project?.primaryContact?.name || '',
          title: project?.primaryContact?.designation || '',
          email: project?.primaryContact?.email || '',
          phone: project?.primaryContact?.phone || ''
        },
        
        // Branding
        branding: {
          primaryColor: project?.branding?.colorTheme?.primary || '#f97316',
          secondaryColor: project?.branding?.colorTheme?.secondary || '#64748b',
          footerText: project?.branding?.footerText || '© 2025 Your Organization. All rights reserved.',
          customUrlPath: project?.branding?.customUrlPath || ''
        },
        
        // Modules
        modules: project?.modules || prevData.modules,
        
        // Settings
        settings: project?.settings || prevData.settings
      }));
    }
  }, [project]);

  // Initialize default form fields for new projects
  useEffect(() => {
    if (!project && formData.onlineFormFields.length === 0) {
      setFormData(prevData => ({
        ...prevData,
        onlineFormFields: [
          {
            fieldName: 'Name',
            fieldType: 'text',
            required: true,
            placeholder: 'Enter your full name'
          },
          {
            fieldName: 'Category',
            fieldType: 'dropdown',
            required: true,
            placeholder: 'Select category',
            options: ['Technical Support', 'Account Issues', 'Billing', 'General Inquiry', 'Feature Request']
          },
          {
            fieldName: 'Email',
            fieldType: 'email',
            required: true,
            placeholder: 'your.email@example.com'
          },
          {
            fieldName: 'Phone',
            fieldType: 'phone',
            required: false,
            placeholder: '+91 98765 43210'
          },
          {
            fieldName: 'Subject',
            fieldType: 'text',
            required: true,
            placeholder: 'Brief description of your issue'
          },
          {
            fieldName: 'Description',
            fieldType: 'textarea',
            required: true,
            placeholder: 'Please provide detailed information about your request'
          }
        ]
      }));
    }
  }, [project, formData.onlineFormFields.length]);

  const handleFileUpload = async (file: File, type: 'logo' | 'favicon') => {
    // TODO: Implement file upload to server
    // For now, we'll use base64
    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === 'logo') {
        setFormData({ ...formData, logo: reader.result as string, logoFile: file });
      } else {
        setFormData({ ...formData, favicon: reader.result as string, faviconFile: file });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    const newErrors: {[key: string]: string} = {};
    if (!formData.portalName.trim()) {
      newErrors.portalName = 'Portal name is required';
    }
    if (!formData.branding?.customUrlPath?.trim()) {
      newErrors.portalUrl = 'Custom URL path is required';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setToast({
        show: true,
        type: 'error',
        message: 'Please fill in all required fields'
      });
      setTimeout(() => setToast({ show: false, type: 'success', message: '' }), 4000);
      return;
    }
    
    setErrors({});
    setSaving(true);

    try {

      // Generate code from portal name (remove spaces, convert to uppercase, take first 10 chars)
      const generatedCode = formData.portalName.replace(/\s+/g, '').toUpperCase().substring(0, 10);

      // Prepare the data according to the Project model structure
      const projectData = {
        name: formData.portalName,
        code: generatedCode,
        description: `Portal for ${formData.portalName}`,
        
        address: formData.address,
        contactInfo: formData.contactInfo,
        primaryContact: {
          name: formData.primaryContact.name,
          email: formData.primaryContact.email,
          phone: formData.primaryContact.phone,
          designation: formData.primaryContact.title
        },
        
        branding: {
          logo: formData.logo,
          favicon: formData.favicon,
          logoLinkbackUrl: formData.logoLinkbackUrl,
          colorTheme: {
            primary: formData.themeColor || formData.branding.primaryColor,
            secondary: formData.branding.secondaryColor,
            accent: '#3b82f6',
            background: '#ffffff'
          },
          headerText: formData.portalName,
          footerText: formData.branding.footerText,
          domainUrl: formData.portalUrl,
          customUrlPath: formData.branding.customUrlPath
        },
        
        modules: formData.modules,
        settings: formData.settings,
        
        configuration: {
          announcementBanner: {
            message: formData.announcementBannerMessage,
            type: formData.announcementBannerType
          },
          ticketAssignmentSettings: {
            enabled: formData.assignmentType === 'round-robin', // Auto-enable for round-robin
            assignmentType: formData.assignmentType,
            assignToUsers: formData.assignToUsers,
            assignToRoles: formData.assignToRoles,
            reassignOnEscalation: formData.reassignOnEscalation,
            notifyOnAssignment: formData.notifyOnAssignment,
            conditionRules: formData.conditionRules,
            manualAssignmentPermissions: formData.manualAssignmentPermissions
          },
          ticketSubmissionSettings: {
            mode: formData.ticketSubmissionMode,
            enableOnlineForm: formData.enableOnlineTicketForm,
            enableOfflineCenter: formData.enableOfflineCenter,
            onlineFormFields: formData.onlineFormFields,
            offlineCenters: formData.offlineCenters,
            welcomeMessage: formData.ticketWelcomeMessage,
            successMessage: formData.ticketSuccessMessage,
            announcement: formData.ticketSubmissionAnnouncement,
            allowAttachments: formData.allowTicketAttachments,
            maxAttachmentSize: formData.maxTicketAttachmentSize,
            allowedFileTypes: formData.allowedTicketFileTypes
          },
          fileSettings: {
            downloadPermission: formData.fileDownloadPermission,
            inlineImageAttachment: formData.inlineImageAttachment,
            attachToEmails: formData.attachFilesToEmails
          },
          footerLinks: {
            copyright: formData.copyrightUrl,
            termsOfUse: formData.termsOfUseUrl,
            privacyPolicy: formData.privacyPolicyUrl,
            cookiePolicy: formData.cookiePolicyUrl
          },
          loginSettings: {
            enableFormLogin: formData.enableFormLogin,
            enableGoogleRecaptcha: formData.enableGoogleRecaptcha
          },
          securitySettings: {
            allowUserSignup: formData.allowUserSignup,
            restrictSignupViaSocial: formData.restrictSignupViaSocial,
            mfaRequired: formData.enforceTwoFactorAuth,
            passwordPolicy: formData.passwordPolicy === 'custom' ? {
              minLength: formData.minimumPasswordLength,
              requireUppercase: formData.requireUpperCase,
              requireLowercase: formData.requireLowerCase,
              requireNumbers: formData.requireNumber,
              requireSpecialChars: formData.requireSpecialChar,
              expiryDays: formData.passwordExpiration === 'never' ? 0 : parseInt(formData.passwordExpiration)
            } : {
              minLength: 8,
              requireUppercase: true,
              requireLowercase: true,
              requireNumbers: true,
              requireSpecialChars: false,
              expiryDays: 90
            }
          },
          knowledgeBaseSettings: {
            enabled: formData.enableKB,
            kbHomeConfiguration: formData.kbHomeConfiguration,
            articleConfiguration: formData.articleConfiguration,
            enableAIAssistance: formData.enableAIAssistance,
            enableSatisfactionFeedback: formData.enableSatisfactionFeedback,
            satisfactionFeedback: formData.satisfactionFeedback,
            seoSettings: formData.seoSettings
          },
          customizationSettings: {
            loginPageBackgroundImage: formData.loginPageBackgroundImageUrl,
            themeMode: formData.themeMode,
            themeColor: formData.themeColor,
            customCSS: formData.customCSS,
            customJS: formData.customJS
          }
        }
      };

      const url = project
        ? `${API_BASE_URL}/api/projects/${project._id}`
        : `${API_BASE_URL}/api/projects`;

      const method = project ? 'PUT' : 'POST';

      const token = localStorage.getItem('authToken');
      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify(projectData),
      });

      const data = await response.json();
      if (data.success) {
        setToast({
          show: true,
          type: 'success',
          message: project ? 'Project updated successfully!' : 'Project created successfully!'
        });
        setTimeout(() => {
          setToast({ show: false, type: 'success', message: '' });
          onSave();
        }, 2000);
      } else {
        setToast({
          show: true,
          type: 'error',
          message: data.message || 'Failed to save project'
        });
        setTimeout(() => setToast({ show: false, type: 'success', message: '' }), 4000);
      }
    } catch (error) {
      console.error('Error saving project:', error);
      setToast({
        show: true,
        type: 'error',
        message: 'An error occurred while saving the project'
      });
      setTimeout(() => setToast({ show: false, type: 'success', message: '' }), 4000);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'General', labelMr: 'सामान्य', icon: <MdSettings /> },
    { id: 'login', label: 'Login', labelMr: 'लॉगिन', icon: <MdLock /> },
    { id: 'security', label: 'Security', labelMr: 'सुरक्षा', icon: <MdShield /> },
    { id: 'ticketportal', label: 'Ticket Portal', labelMr: 'टिकट पोर्टल', icon: <MdConfirmationNumber /> },
    { id: 'customization', label: 'Customization', labelMr: 'सानुकूलीकरण', icon: <MdPalette /> }
  ];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '1400px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', margin: 0 }}>
            {project
              ? (getText('Edit Project', 'प्रकल्प संपादित करा', 'प्रकल्प संपादित करा'))
              : (getText('Add New Project', 'नवीन प्रकल्प जोडा', 'नवीन प्रकल्प जोडा'))}
          </h2>
          <button
            onClick={onClose}
            type="button"
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              background: 'transparent',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '20px',
              color: '#6b7280',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            ✕
          </button>
        </div>

        {/* Main Content Area with Sidebar */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left Sidebar Navigation */}
          <div style={{
            width: '240px',
            borderRight: '1px solid #e5e7eb',
            padding: '16px 0',
            overflowY: 'auto'
          }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 20px',
                  border: 'none',
                  background: activeTab === tab.id ? 'rgba(63, 65, 209, 0.1)' : 'transparent',
                  color: activeTab === tab.id ? '#3F41D1' : '#6b7280',
                  fontWeight: activeTab === tab.id ? '600' : '400',
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'left',
                  borderLeft: activeTab === tab.id ? '3px solid #3F41D1' : '3px solid transparent'
                }}
                onMouseOver={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.02)';
                    e.currentTarget.style.color = '#111827';
                  }
                }}
                onMouseOut={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#6b7280';
                  }
                }}
              >
                <span style={{ fontSize: '20px', display: 'flex', alignItems: 'center' }}>
                  {tab.icon}
                </span>
                <span>{i18n.language === 'mr' && tab.labelMr ? tab.labelMr : tab.label}</span>
              </button>
            ))}
          </div>

          {/* Right Content Area */}
          <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
              {activeTab === 'general' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '900px', minHeight: '500px' }}>
                  {/* Required Fields Note */}
                  <div style={{ 
                    padding: '12px 16px', 
                    backgroundColor: '#f3f4f6', 
                    borderRadius: '6px',
                    borderLeft: '3px solid #3F41D1'
                  }}>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: '1.5' }}>
                      <span style={{ color: '#E6393E', fontWeight: '600' }}>*</span> indicates required fields
                    </p>
                  </div>
                  {/* Portal Name */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#111827',
                      marginBottom: '6px'
                    }}>
                      Portal Name <span style={{ color: '#E6393E' }}>*</span>
                    </label>
                    <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', lineHeight: '1.5' }}>
                      The portal name specified below will be used in the customer portal browser title.
                    </p>
                    <input
                      type="text"
                      required
                      value={formData.portalName}
                      onChange={(e) => {
                        setFormData({ ...formData, portalName: e.target.value });
                        if (errors.portalName) {
                          setErrors({ ...errors, portalName: '' });
                        }
                      }}
                      onBlur={() => {
                        if (!formData.portalName.trim()) {
                          setErrors({ ...errors, portalName: 'Portal name is required' });
                        }
                      }}
                      placeholder="Enter portal name"
                      className="text-field"
                      style={{ 
                        width: '100%', 
                        boxSizing: 'border-box',
                        borderColor: errors.portalName ? '#ef4444' : undefined,
                        backgroundColor: errors.portalName ? 'rgba(239, 68, 68, 0.02)' : undefined
                      }}
                    />
                    {errors.portalName && (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px', 
                        marginTop: '6px',
                        color: '#ef4444',
                        fontSize: '13px'
                      }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M8 14A6 6 0 108 2a6 6 0 000 12z" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M8 5v3M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        {errors.portalName}
                      </div>
                    )}
                    <div style={{ marginTop: '12px' }}>
                      <label style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        cursor: 'pointer', 
                        gap: '8px',
                        fontSize: '14px',
                        color: '#374151'
                      }}>
                        <input
                          type="checkbox"
                          checked={formData.displayPortalNameInNav}
                          onChange={(e) => setFormData({ ...formData, displayPortalNameInNav: e.target.checked })}
                          className="checkbox"
                        />
                        <span style={{ fontSize: '14px', color: '#111827', lineHeight: '1.5' }}>
                          Display portal name in the top navigation bar
                        </span>
                      </label>
                      <p style={{ fontSize: '12px', color: '#6b7280', marginLeft: '26px', marginTop: '4px', lineHeight: '1.5' }}>
                        If your logo image has a brand name, you can uncheck this option so that the same name does not appear twice in the navigation bar.
                      </p>
                </div>
              </div>

              {/* Footer Text */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#111827',
                  marginBottom: '6px'
                }}>
                  Footer Text
                </label>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', lineHeight: '1.5' }}>
                  This text will appear at the bottom of the login page and customer portal.
                </p>
                <input
                  type="text"
                  value={formData.branding.footerText}
                  onChange={(e) => {
                    setFormData({ 
                      ...formData, 
                      branding: { ...formData.branding, footerText: e.target.value }
                    });
                  }}
                  placeholder="e.g., © 2025 Your Organization. All rights reserved."
                  className="text-field"
                  style={{ 
                    width: '100%', 
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Portal URL */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#111827',
                  marginBottom: '6px'
                }}>
                  Custom Portal URL Path <span style={{ color: '#E6393E' }}>*</span>
                </label>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', lineHeight: '1.5' }}>
                  Enter a custom URL path for this project. Users will access the login page at: <strong>http://localhost:3000/[your-custom-path]</strong>
                  <br />
                  Example: Enter "studentassistcenter" → URL will be: http://localhost:3000/studentassistcenter
                </p>
                <div style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #d1d5db',
                    borderRight: 'none',
                    borderRadius: '6px 0 0 6px',
                    fontSize: '14px',
                    color: '#6b7280',
                    whiteSpace: 'nowrap',
                    height: '40px',
                    lineHeight: '1'
                  }}>
                    http://localhost:3000/
                  </span>
                  <input
                    type="text"
                    value={formData.branding?.customUrlPath || ''}
                    onChange={(e) => {
                      const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                      setFormData({
                        ...formData,
                        branding: {
                          ...formData.branding,
                          customUrlPath: value
                        }
                      });
                    }}
                    placeholder="studentassistcenter"
                    className="text-field"
                    style={{ 
                      flex: 1, 
                      borderRadius: '0 6px 6px 0',
                      boxSizing: 'border-box',
                      height: '40px',
                      minHeight: '40px'
                    }}
                    required
                  />
                </div>
                {errors.portalUrl && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px', 
                    marginTop: '6px',
                    color: '#ef4444',
                    fontSize: '13px'
                  }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 14A6 6 0 108 2a6 6 0 000 12z" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M8 5v3M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    {errors.portalUrl}
                  </div>
                )}
              </div>

              {/* Logo and Favicon */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#111827',
                  marginBottom: '6px'
                }}>
                  Logo and Favicon
                </label>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px', lineHeight: '1.5' }}>
                  Upload your brand logo and favicon. Supported formats: 
                  <span style={{ 
                    display: 'inline-flex', 
                    gap: '4px', 
                    marginLeft: '4px',
                    flexWrap: 'wrap'
                  }}>
                    {['.jpeg', '.jpg', '.png', '.svg', '.gif', '.ico'].map(format => (
                      <span key={format} style={{
                        backgroundColor: '#f3f4f6',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '11px',
                        fontWeight: '500',
                        color: '#6b7280'
                      }}>
                        {format}
                      </span>
                    ))}
                  </span>
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                  {/* Logo */}
                  <div style={{
                    border: '2px dashed #d1d5db',
                    borderRadius: '8px',
                    padding: '20px',
                    backgroundColor: '#fafbfc',
                    transition: 'all 0.2s ease'
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = '#3F41D1';
                    e.currentTarget.style.backgroundColor = 'rgba(63, 65, 209, 0.02)';
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.backgroundColor = '#fafbfc';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.backgroundColor = '#fafbfc';
                    const file = e.dataTransfer.files[0];
                    if (file) handleFileUpload(file, 'logo');
                  }}
                  >
                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#111827' }}>Logo</span>
                      <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0', lineHeight: '1.5' }}>
                        Recommended: 240×40px • Max 2MB
                      </p>
                    </div>
                    <div style={{
                      width: '100%',
                      minHeight: '120px',
                      border: formData.logo ? '1px solid #e5e7eb' : '2px dashed #e5e7eb',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#ffffff',
                      marginBottom: '12px',
                      overflow: 'hidden',
                      padding: '12px'
                    }}>
                      {formData.logo ? (
                        <img src={formData.logo} alt="Logo Preview" style={{ maxWidth: '100%', maxHeight: '100px', objectFit: 'contain' }} />
                      ) : (
                        <div style={{ textAlign: 'center', padding: '20px' }}>
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 8px' }}>
                            <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M17 8L12 3L7 8" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M12 3V15" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <p style={{ fontSize: '13px', color: '#6b7280', margin: '0' }}>
                            Drag & drop or click to upload
                          </p>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <label style={{
                        flex: 1,
                        padding: '10px 16px',
                        border: '1px solid #3F41D1',
                        borderRadius: '6px',
                        backgroundColor: 'white',
                        color: '#3F41D1',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(63, 65, 209, 0.04)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                      }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M14 10V12.6667C14 13.0203 13.8595 13.3594 13.6095 13.6095C13.3594 13.8595 13.0203 14 12.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M11.3333 5.33333L8 2L4.66667 5.33333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M8 2V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {formData.logo ? 'Change Logo' : 'Upload Logo'}
                        <input
                          type="file"
                          accept=".jpeg,.jpg,.png,.svg,.gif"
                          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'logo')}
                          style={{ display: 'none' }}
                        />
                      </label>
                      {formData.logo && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, logo: '', logoFile: null })}
                          style={{
                            padding: '10px 16px',
                            border: '1px solid #ef4444',
                            borderRadius: '6px',
                            backgroundColor: 'white',
                            color: '#ef4444',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.04)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Favicon */}
                  <div style={{
                    border: '2px dashed #d1d5db',
                    borderRadius: '8px',
                    padding: '20px',
                    backgroundColor: '#fafbfc',
                    transition: 'all 0.2s ease'
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = '#3F41D1';
                    e.currentTarget.style.backgroundColor = 'rgba(63, 65, 209, 0.02)';
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.backgroundColor = '#fafbfc';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.backgroundColor = '#fafbfc';
                    const file = e.dataTransfer.files[0];
                    if (file) handleFileUpload(file, 'favicon');
                  }}
                  >
                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#111827' }}>Favicon</span>
                      <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0', lineHeight: '1.5' }}>
                        Recommended: 16×16px • Max 1MB
                      </p>
                    </div>
                    <div style={{
                      width: '100%',
                      minHeight: '120px',
                      border: formData.favicon ? '1px solid #e5e7eb' : '2px dashed #e5e7eb',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#ffffff',
                      marginBottom: '12px',
                      overflow: 'hidden',
                      padding: '12px'
                    }}>
                      {formData.favicon ? (
                        <img src={formData.favicon} alt="Favicon Preview" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                      ) : (
                        <div style={{ textAlign: 'center', padding: '20px' }}>
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 8px' }}>
                            <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M17 8L12 3L7 8" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M12 3V15" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <p style={{ fontSize: '13px', color: '#6b7280', margin: '0' }}>
                            Drag & drop or click to upload
                          </p>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <label style={{
                        flex: 1,
                        padding: '10px 16px',
                        border: '1px solid #3F41D1',
                        borderRadius: '6px',
                        backgroundColor: 'white',
                        color: '#3F41D1',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(63, 65, 209, 0.04)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                      }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M14 10V12.6667C14 13.0203 13.8595 13.3594 13.6095 13.6095C13.3594 13.8595 13.0203 14 12.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M11.3333 5.33333L8 2L4.66667 5.33333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M8 2V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {formData.favicon ? 'Change Favicon' : 'Upload Favicon'}
                        <input
                          type="file"
                          accept=".jpeg,.jpg,.png,.svg,.gif,.ico"
                          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'favicon')}
                          style={{ display: 'none' }}
                        />
                      </label>
                      {formData.favicon && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, favicon: '', faviconFile: null })}
                          style={{
                            padding: '10px 16px',
                            border: '1px solid #ef4444',
                            borderRadius: '6px',
                            backgroundColor: 'white',
                            color: '#ef4444',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.04)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'white';
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Logo Linkback URL */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#111827',
                  marginBottom: '6px'
                }}>
                  Logo Linkback URL
                </label>
                <div style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
                  <select
                    className="text-field protocol-select"
                    style={{
                      height: '40px',
                      minHeight: '40px',
                      borderRadius: '6px 0 0 6px',
                      borderRight: 'none'
                    }}
                  >
                    <option>https://</option>
                    <option>http://</option>
                  </select>
                  <input
                    type="text"
                    value={formData.logoLinkbackUrl}
                    onChange={(e) => setFormData({ ...formData, logoLinkbackUrl: e.target.value })}
                    placeholder="example.com"
                    className="text-field"
                    style={{
                      flex: 1,
                      height: '40px',
                      minHeight: '40px',
                      borderRadius: '0 6px 6px 0',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Footer Links */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#111827',
                  marginBottom: '6px'
                }}>
                  Footer Links
                </label>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px', lineHeight: '1.5' }}>
                  Footer links will be shown on all pages in the customer portal. The footer links will be hidden when left empty.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Copyright URL */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#111827', marginBottom: '6px' }}>
                      Copyright URL
                    </label>
                    <div style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
                      <select
                        className="text-field protocol-select"
                        style={{
                          height: '40px',
                          minHeight: '40px',
                          borderRadius: '6px 0 0 6px',
                          borderRight: 'none'
                        }}>
                        <option>https://</option>
                        <option>http://</option>
                      </select>
                      <input
                        type="text"
                        value={formData.copyrightUrl}
                        onChange={(e) => setFormData({ ...formData, copyrightUrl: e.target.value })}
                        placeholder="example.com"
                        className="text-field"
                        style={{ 
                          flex: 1,
                          height: '40px',
                          minHeight: '40px',
                          borderRadius: '0 6px 6px 0',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  {/* Terms of Use URL */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#111827', marginBottom: '6px' }}>
                      Terms of Use URL
                    </label>
                    <div style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
                      <select
                        className="text-field protocol-select"
                        style={{
                          height: '40px',
                          minHeight: '40px',
                          borderRadius: '6px 0 0 6px',
                          borderRight: 'none'
                        }}>
                        <option>https://</option>
                        <option>http://</option>
                      </select>
                      <input
                        type="text"
                        value={formData.termsOfUseUrl}
                        onChange={(e) => setFormData({ ...formData, termsOfUseUrl: e.target.value })}
                        placeholder="example.com"
                        className="text-field"
                        style={{ 
                          flex: 1,
                          height: '40px',
                          minHeight: '40px',
                          borderRadius: '0 6px 6px 0',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  {/* Privacy Policy URL */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#111827', marginBottom: '6px' }}>
                      Privacy Policy URL
                    </label>
                    <div style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
                      <select
                        className="text-field protocol-select"
                        style={{
                          height: '40px',
                          minHeight: '40px',
                          borderRadius: '6px 0 0 6px',
                          borderRight: 'none'
                        }}>
                        <option>https://</option>
                        <option>http://</option>
                      </select>
                      <input
                        type="text"
                        value={formData.privacyPolicyUrl}
                        onChange={(e) => setFormData({ ...formData, privacyPolicyUrl: e.target.value })}
                        placeholder="example.com"
                        className="text-field"
                        style={{ 
                          flex: 1,
                          height: '40px',
                          minHeight: '40px',
                          borderRadius: '0 6px 6px 0',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  {/* Cookie Policy URL */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#111827', marginBottom: '6px' }}>
                      Cookie Policy URL
                    </label>
                    <div style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
                      <select
                        className="text-field protocol-select"
                        style={{
                          height: '40px',
                          minHeight: '40px',
                          borderRadius: '6px 0 0 6px',
                          borderRight: 'none'
                        }}>
                        <option>https://</option>
                        <option>http://</option>
                      </select>
                      <input
                        type="text"
                        value={formData.cookiePolicyUrl}
                        onChange={(e) => setFormData({ ...formData, cookiePolicyUrl: e.target.value })}
                        placeholder="example.com"
                        className="text-field"
                        style={{ 
                          flex: 1,
                          height: '40px',
                          minHeight: '40px',
                          borderRadius: '0 6px 6px 0',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Announcement Banner Message */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1f2937',
                  marginBottom: '4px'
                }}>
                  Announcement Banner Message
                </label>
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                  The announcement banner can be used to communicate an important message to the users. It appears on the top of the login page for all project-specific logins (Admin, Agent, Counselor, Center Manager) except Student Login.
                </p>

                <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="bannerType"
                      value="plain"
                      checked={formData.announcementBannerType === 'plain'}
                      onChange={(e) => setFormData({ ...formData, announcementBannerType: 'plain' })}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', color: '#374151' }}>Plain Text</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="bannerType"
                      value="rich"
                      checked={formData.announcementBannerType === 'rich'}
                      onChange={(e) => setFormData({ ...formData, announcementBannerType: 'rich' })}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', color: '#374151' }}>Rich Text</span>
                  </label>
                </div>

                <textarea
                  value={formData.announcementBannerMessage}
                  onChange={(e) => setFormData({ ...formData, announcementBannerMessage: e.target.value })}
                  placeholder="Enter text here"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    marginBottom: '8px'
                  }}
                />

                {formData.announcementBannerMessage && (
                  <button
                    type="button"
                    onClick={() => setShowBannerPreview(true)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Preview on Login Screen
                  </button>
                )}
              </div>

              {/* File Download Settings - Hidden (not in use)
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1f2937',
                  marginBottom: '12px'
                }}>
                  File Download Settings
                </label>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="fileDownload"
                      value="logged-in-permission"
                      checked={formData.fileDownloadPermission === 'logged-in-permission'}
                      onChange={(e) => setFormData({ ...formData, fileDownloadPermission: 'logged-in-permission' })}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', color: '#374151' }}>
                      Allow only if the user has permission to view the ticket (requires user to be logged in).
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="fileDownload"
                      value="logged-in"
                      checked={formData.fileDownloadPermission === 'logged-in'}
                      onChange={(e) => setFormData({ ...formData, fileDownloadPermission: 'logged-in' })}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', color: '#374151' }}>
                      Allow any agent or customer to download (requires user to be logged in).
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="fileDownload"
                      value="anyone"
                      checked={formData.fileDownloadPermission === 'anyone'}
                      onChange={(e) => setFormData({ ...formData, fileDownloadPermission: 'anyone' })}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', color: '#374151' }}>
                      Allow anyone who has a file download link to download file without having to log in.
                    </span>
                  </label>
                </div>
              </div>
              */}

              {/* Inline Image Attachment Settings - Hidden (not in use)
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1f2937',
                  marginBottom: '12px'
                }}>
                  Inline Image Attachment Settings
                </label>
                
                <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.inlineImageAttachment}
                    onChange={(e) => setFormData({ ...formData, inlineImageAttachment: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', marginTop: '2px' }}
                  />
                  <div>
                    <span style={{ fontSize: '14px', color: '#374151', display: 'block' }}>
                      To download or view an image, users must be logged into the portal. Images in emails will appear as broken links unless the user is logged into the portal.
                    </span>
                  </div>
                </label>
              </div>
              */}

              {/* File Attachment Settings (Email) - Hidden (not in use)
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1f2937',
                  marginBottom: '12px'
                }}>
                  File Attachment Settings (Email)
                </label>
                
                <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.attachFilesToEmails}
                    onChange={(e) => setFormData({ ...formData, attachFilesToEmails: e.target.checked })}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', marginTop: '2px' }}
                  />
                  <div>
                    <span style={{ fontSize: '14px', color: '#374151', display: 'block' }}>
                      Files will be attached to emails directly rather than being added as link in the email body.
                    </span>
                  </div>
                </label>
              </div>
              */}
            </div>
          )}

          {activeTab === 'login' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '900px', minHeight: '500px' }}>
              {/* Form Login Section */}
              <div>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#1f2937',
                  marginBottom: '16px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid #e5e7eb'
                }}>
                  Form Login
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <input
                      type="checkbox"
                      checked={formData.enableFormLogin}
                      onChange={(e) => setFormData({ ...formData, enableFormLogin: e.target.checked })}
                      style={{
                        width: '18px',
                        height: '18px',
                        marginTop: '2px',
                        cursor: 'pointer'
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#1f2937',
                        marginBottom: '4px',
                        cursor: 'pointer'
                      }}>
                        Enable Form Login
                      </label>
                      <p style={{
                        fontSize: '13px',
                        color: '#6b7280',
                        margin: 0,
                        lineHeight: '1.5'
                      }}>
                        Enabling this option will allow users to sign into the customer portal using a username and password. Turning off this option will hide the form login option in the customer portal.
                      </p>
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <input
                      type="checkbox"
                      checked={formData.enableGoogleRecaptcha}
                      onChange={(e) => setFormData({ ...formData, enableGoogleRecaptcha: e.target.checked })}
                      style={{
                        width: '18px',
                        height: '18px',
                        marginTop: '2px',
                        cursor: 'pointer'
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#1f2937',
                        marginBottom: '4px',
                        cursor: 'pointer'
                      }}>
                        Enable Google reCAPTCHA <span style={{ 
                          fontSize: '12px',
                          color: '#059669',
                          fontWeight: '500',
                          backgroundColor: '#d1fae5',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          marginLeft: '8px'
                        }}>recommended</span>
                      </label>
                      <p style={{
                        fontSize: '13px',
                        color: '#6b7280',
                        margin: 0,
                        lineHeight: '1.5'
                      }}>
                        Enabling this option allows users to verify with Google reCAPTCHA during sign up and sign in.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '900px', minHeight: '500px' }}>
              {/* General Settings Section */}
              <div>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#1f2937',
                  marginBottom: '16px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid #e5e7eb'
                }}>
                  General Settings
                </h3>
                
                {/* Signup options removed - not in use
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <input
                      type="checkbox"
                      checked={formData.allowUserSignup}
                      onChange={(e) => setFormData({ ...formData, allowUserSignup: e.target.checked })}
                      style={{
                        width: '18px',
                        height: '18px',
                        marginTop: '2px',
                        cursor: 'pointer'
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#1f2937',
                        marginBottom: '4px',
                        cursor: 'pointer'
                      }}>
                        Allow users to sign up from customer portal.
                      </label>
                      <p style={{
                        fontSize: '13px',
                        color: '#6b7280',
                        margin: 0,
                        lineHeight: '1.5'
                      }}>
                        Enabling this option will allow an end-user to register an account and submit a ticket.
                      </p>
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <input
                      type="checkbox"
                      checked={formData.restrictSignupViaSocial}
                      onChange={(e) => setFormData({ ...formData, restrictSignupViaSocial: e.target.checked })}
                      style={{
                        width: '18px',
                        height: '18px',
                        marginTop: '2px',
                        cursor: 'pointer'
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#1f2937',
                        marginBottom: '4px',
                        cursor: 'pointer'
                      }}>
                        Restrict sign-up via social and custom SSO on customer portal.
                      </label>
                      <p style={{
                        fontSize: '13px',
                        color: '#6b7280',
                        margin: 0,
                        lineHeight: '1.5'
                      }}>
                        When enabled, users cannot create new accounts or submit tickets using social media or custom SSO logins. Only users with existing accounts can log in via SSO.
                      </p>
                    </div>
                  </div>
                </div>
                */}
              </div>

              {/* Two-Factor Authentication Section */}
              <div>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#1f2937',
                  marginBottom: '4px'
                }}>
                  Two-Factor Authentication (2FA)
                </h3>
                
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '16px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  marginTop: '16px'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.enforceTwoFactorAuth}
                    onChange={(e) => setFormData({ ...formData, enforceTwoFactorAuth: e.target.checked })}
                    style={{
                      width: '18px',
                      height: '18px',
                      marginTop: '2px',
                      cursor: 'pointer'
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#1f2937',
                      marginBottom: '4px',
                      cursor: 'pointer'
                    }}>
                      Enforce two-factor authentication (2FA) for all users
                    </label>
                    <p style={{
                      fontSize: '13px',
                      color: '#6b7280',
                      margin: 0,
                      lineHeight: '1.5'
                    }}>
                      This will require all users to verify their login with both password and mobile number OTP. This applies only to project-specific logins (Admin, Agent, Counselor, Center Manager), not to student logins.
                    </p>
                  </div>
                </div>
              </div>

              {/* Password Policy Section */}
              <div>
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#1f2937',
                  marginBottom: '4px'
                }}>
                  Password Policy
                </h3>
                <p style={{
                  fontSize: '13px',
                  color: '#6b7280',
                  marginBottom: '16px'
                }}>
                  The password policy is only applicable if you have allowed form logins.
                </p>

                <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="radio"
                      checked={formData.passwordPolicy === 'default'}
                      onChange={() => setFormData({ ...formData, passwordPolicy: 'default' })}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer'
                      }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '500', color: '#1f2937' }}>
                      Default Policy
                    </span>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="radio"
                      checked={formData.passwordPolicy === 'custom'}
                      onChange={() => setFormData({ ...formData, passwordPolicy: 'custom' })}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer'
                      }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '500', color: '#1f2937' }}>
                      Custom Policy
                    </span>
                  </label>
                </div>

                {formData.passwordPolicy === 'custom' && (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '12px',
                    padding: '16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="checkbox"
                        checked={formData.requireLowerCase}
                        onChange={(e) => setFormData({ ...formData, requireLowerCase: e.target.checked })}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ fontSize: '14px', color: '#374151' }}>
                        Require at least one lower case letter (a-z).
                      </span>
                    </label>

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="checkbox"
                        checked={formData.requireUpperCase}
                        onChange={(e) => setFormData({ ...formData, requireUpperCase: e.target.checked })}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ fontSize: '14px', color: '#374151' }}>
                        Require at least one upper case letter (A-Z).
                      </span>
                    </label>

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="checkbox"
                        checked={formData.requireNumber}
                        onChange={(e) => setFormData({ ...formData, requireNumber: e.target.checked })}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ fontSize: '14px', color: '#374151' }}>
                        Require at least one number (0-9).
                      </span>
                    </label>

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="checkbox"
                        checked={formData.requireSpecialChar}
                        onChange={(e) => setFormData({ ...formData, requireSpecialChar: e.target.checked })}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer'
                        }}
                      />
                      <span style={{ fontSize: '14px', color: '#374151' }}>
                        Require at least one special character (@!%*?"#$?()[]^~_+-=).
                      </span>
                    </label>

                    <div style={{ marginTop: '8px' }}>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}>
                        <span style={{ fontSize: '14px', color: '#374151', whiteSpace: 'nowrap' }}>
                          Minimum password length
                        </span>
                        <select
                          value={formData.minimumPasswordLength}
                          onChange={(e) => setFormData({ ...formData, minimumPasswordLength: parseInt(e.target.value) })}
                          style={{
                            padding: '6px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '14px',
                            backgroundColor: 'white',
                            cursor: 'pointer',
                            width: '80px'
                          }}
                        >
                          {[8, 10, 12, 14, 16].map(length => (
                            <option key={length} value={length}>{length}</option>
                          ))}
                        </select>
                        <span style={{ fontSize: '14px', color: '#6b7280' }}>
                          characters.
                        </span>
                      </label>
                    </div>

                    <div style={{ marginTop: '8px' }}>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px'
                      }}>
                        <span style={{ fontSize: '14px', color: '#374151', whiteSpace: 'nowrap' }}>
                          Password expiration
                        </span>
                        <select
                          value={formData.passwordExpiration}
                          onChange={(e) => setFormData({ ...formData, passwordExpiration: e.target.value as any })}
                          className="text-field"
                          style={{
                            minWidth: '150px',
                            width: 'auto'
                          }}
                        >
                          <option value="never">Never</option>
                          <option value="30">30 days</option>
                          <option value="60">60 days</option>
                          <option value="90">90 days</option>
                          <option value="180">180 days</option>
                        </select>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'ticketportal' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '900px', minHeight: '500px' }}>
              {/* Ticket Portal Header */}
              <div style={{
                padding: '20px',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
                  Student Ticket Submission Portal
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
                  Configure how students can submit support tickets - online forms, offline centers, or both.
                </p>
              </div>

              {/* Submission Mode */}
              <div style={{
                padding: '20px',
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                  Ticket Submission Mode
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="ticketSubmissionMode"
                      value="online"
                      checked={formData.ticketSubmissionMode === 'online'}
                      onChange={(e) => setFormData({ ...formData, ticketSubmissionMode: e.target.value as 'online' | 'offline' | 'both' })}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: '500', color: '#1f2937' }}>Online Only</div>
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>Students can only submit tickets through online forms</div>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="ticketSubmissionMode"
                      value="offline"
                      checked={formData.ticketSubmissionMode === 'offline'}
                      onChange={(e) => setFormData({ ...formData, ticketSubmissionMode: e.target.value as 'online' | 'offline' | 'both' })}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: '500', color: '#1f2937' }}>Offline Only</div>
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>Students can only visit offline support centers</div>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="ticketSubmissionMode"
                      value="both"
                      checked={formData.ticketSubmissionMode === 'both'}
                      onChange={(e) => setFormData({ ...formData, ticketSubmissionMode: e.target.value as 'online' | 'offline' | 'both' })}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: '500', color: '#1f2937' }}>Both Online & Offline</div>
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>Students can choose between online forms or visiting centers</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Announcement Banner */}
              <div style={{
                padding: '20px',
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                  Announcement Banner
                </h4>
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#6b7280' }}>
                  Display an important message at the top of the ticket submission portal
                </p>
                <textarea
                  value={formData.ticketSubmissionAnnouncement}
                  onChange={(e) => setFormData({ ...formData, ticketSubmissionAnnouncement: e.target.value })}
                  placeholder="e.g., Our support team is available Monday-Friday, 9 AM - 6 PM. For urgent issues, please call our helpline."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
                {formData.ticketSubmissionAnnouncement && (
                  <div style={{
                    marginTop: '12px',
                    padding: '12px 16px',
                    backgroundColor: '#fef3c7',
                    border: '1px solid #fbbf24',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#92400e'
                  }}>
                    <strong>Preview:</strong> {formData.ticketSubmissionAnnouncement}
                  </div>
                )}
              </div>

              {/* Ticket Assignment Settings */}
              <div style={{
                marginTop: '24px',
                padding: '20px',
                backgroundColor: '#f0f9ff',
                borderRadius: '8px',
                border: '1px solid #bae6fd'
              }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1f2937',
                  marginBottom: '12px'
                }}>
                  Ticket Assignment
                </label>
                
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#6b7280', lineHeight: '1.5' }}>
                  Configure how tickets should be assigned to agents in your project.
                </p>

                <div style={{
                  marginLeft: '24px',
                  paddingLeft: '20px',
                  borderLeft: '3px solid #3b82f6'
                }}>
                    {/* Assignment Method */}
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#1f2937',
                        marginBottom: '8px'
                      }}>
                        Assignment Method
                      </label>
                      <select
                        value={formData.assignmentType}
                        onChange={(e) => setFormData({ ...formData, assignmentType: e.target.value as any })}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          fontSize: '14px',
                          backgroundColor: 'white'
                        }}
                      >
                        <option value="manual">Manual Assignment (No auto-assignment)</option>
                        <option value="round-robin">Round Robin (Auto-assign to agents)</option>
                      </select>
                      
                      {/* Dynamic description based on selected method */}
                      <div style={{
                        marginTop: '8px',
                        padding: '12px',
                        backgroundColor: '#eff6ff',
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: '#1e40af',
                        lineHeight: '1.5'
                      }}>
                        {formData.assignmentType === 'manual' && (
                          <span>ℹ️ Tickets will not be automatically assigned. Users with "assign ticket" permission can assign tickets to agents in the project.</span>
                        )}
                        {formData.assignmentType === 'round-robin' && (
                          <span>✓ Tickets will be automatically assigned to agents (roles marked as "Agent Role") in a rotating sequence. Each agent gets one ticket before the cycle repeats.</span>
                        )}
                      </div>
                    </div>

                    {/* Round Robin - Info Box */}
                    {formData.assignmentType === 'round-robin' && (
                      <div style={{ marginBottom: '20px' }}>
                        <div style={{
                          padding: '16px',
                          backgroundColor: '#ecfdf5',
                          border: '1px solid #10b981',
                          borderRadius: '6px',
                          fontSize: '13px',
                          color: '#065f46',
                          lineHeight: '1.6'
                        }}>
                          ✓ <strong>Auto-assignment enabled:</strong> Tickets will be automatically assigned to agents in a rotating sequence.
                          <br/>
                          <br/>
                          Agents are identified by roles marked as "Agent Role" in RBAC Setup. Only users with agent roles mapped to this project will receive auto-assigned tickets.
                        </div>
                      </div>
                    )}

                    {/* Manual Assignment - Single Role */}
                    {formData.assignmentType === 'manual' && (
                      <div style={{ marginBottom: '20px' }}>
                        {!project?._id ? (
                          <div style={{
                            padding: '16px',
                            backgroundColor: '#fef3c7',
                            border: '1px solid #fbbf24',
                            borderRadius: '6px',
                            fontSize: '13px',
                            color: '#92400e',
                            textAlign: 'center'
                          }}>
                            ℹ️ Manual assignment role selection will be available after you create the project and map roles to it.
                          </div>
                        ) : rolesWithAssignPermission.length === 0 ? (
                          <div style={{
                            padding: '16px',
                            backgroundColor: '#fef3c7',
                            border: '1px solid #fbbf24',
                            borderRadius: '6px',
                            fontSize: '13px',
                            color: '#92400e',
                            textAlign: 'center'
                          }}>
                            ⚠️ No roles with "Assign Ticket" permission are available. Create or edit a role in RBAC Setup to add TICKET_ASSIGN permission.
                          </div>
                        ) : (
                          <>
                            <label style={{
                              display: 'block',
                              fontSize: '14px',
                              fontWeight: '500',
                              color: '#1f2937',
                              marginBottom: '8px'
                            }}>
                              Who can assign tickets manually?
                            </label>
                            <select
                              value={formData.assignToRoles[0] || ''}
                              onChange={(e) => {
                                setFormData({ 
                                  ...formData, 
                                  assignToRoles: e.target.value ? [e.target.value] : [] 
                                });
                              }}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px',
                                backgroundColor: 'white'
                              }}
                            >
                              <option value="">Select a role...</option>
                              {rolesWithAssignPermission.map((role) => {
                                const isMapped = getMappedStatus(role);
                                return (
                                  <option key={role._id} value={role._id}>
                                    {role.name} {!isMapped ? '⚠️ (Not mapped to this project)' : '✓'}
                                  </option>
                                );
                              })}
                            </select>
                            <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                              Only roles with "Assign Ticket" permission are shown. Users with this role will have access to the Assign Tickets page where they can assign tickets to any agent in the project.
                              {rolesWithAssignPermission.some(r => !getMappedStatus(r)) && (
                                <span style={{ display: 'block', marginTop: '4px', color: '#d97706' }}>
                                  ⚠️ Some roles are not mapped to this project. Go to RBAC Setup → Edit Role → Map to this project.
                                </span>
                              )}
                            </p>
                          </>
                        )}
                      </div>
                    )}

                    {/* Additional Options */}
                    {formData.assignmentType !== 'manual' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={formData.notifyOnAssignment}
                            onChange={(e) => setFormData({ ...formData, notifyOnAssignment: e.target.checked })}
                            style={{
                              width: '16px',
                              height: '16px',
                              cursor: 'pointer'
                            }}
                          />
                          <span style={{ fontSize: '14px', color: '#374151' }}>
                            Send email notification to agent on assignment
                          </span>
                        </label>

                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={formData.reassignOnEscalation}
                            onChange={(e) => setFormData({ ...formData, reassignOnEscalation: e.target.checked })}
                            style={{
                              width: '16px',
                              height: '16px',
                              cursor: 'pointer'
                            }}
                          />
                          <span style={{ fontSize: '14px', color: '#374151' }}>
                            Automatically reassign when ticket is escalated
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
              </div>

              {/* Welcome & Success Messages */}
              <div style={{
                padding: '20px',
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                  Portal Messages
                </h4>
                
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Welcome Message
                  </label>
                  <textarea
                    value={formData.ticketWelcomeMessage}
                    onChange={(e) => setFormData({ ...formData, ticketWelcomeMessage: e.target.value })}
                    placeholder="Enter welcome message for students..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Success Message
                  </label>
                  <textarea
                    value={formData.ticketSuccessMessage}
                    onChange={(e) => setFormData({ ...formData, ticketSuccessMessage: e.target.value })}
                    placeholder="Message shown after successful ticket submission..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>

              {/* Online Form Settings */}
              {(formData.ticketSubmissionMode === 'online' || formData.ticketSubmissionMode === 'both') && (
                <div style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                    Online Form Configuration
                  </h4>

                  {/* Form Fields Configuration */}
                  <div style={{ marginTop: '0px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h5 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                        Form Fields
                      </h5>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            onlineFormFields: [
                              ...formData.onlineFormFields,
                              {
                                fieldName: '',
                                fieldType: 'text',
                                required: false,
                                placeholder: '',
                                options: [],
                                // file-specific defaults (used when fieldType === 'file')
                                allowedFileTypes: [],
                                maxFileSizeMB: 5,
                                allowMultiple: false
                              }
                            ]
                          });
                        }}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: 'pointer'
                        }}
                      >
                        + Add Field
                      </button>
                    </div>

                    {formData.onlineFormFields.length === 0 ? (
                      <div style={{
                        padding: '20px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '6px',
                        textAlign: 'center',
                        color: '#6b7280',
                        fontSize: '14px'
                      }}>
                        No custom fields added. Default fields (Name, Email, Phone, Subject, Description) will be used.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {formData.onlineFormFields.map((field, index) => (
                          <div key={index} style={{
                            padding: '16px',
                            backgroundColor: '#f9fafb',
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb'
                          }}>
                            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                              <input
                                type="text"
                                placeholder="Field Name"
                                value={field.fieldName}
                                onChange={(e) => {
                                  const newFields = [...formData.onlineFormFields];
                                  newFields[index].fieldName = e.target.value;
                                  setFormData({ ...formData, onlineFormFields: newFields });
                                }}
                                style={{
                                  flex: 1,
                                  padding: '10px 12px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  fontSize: '14px'
                                }}
                              />
                              <select
                                value={field.fieldType}
                                onChange={(e) => {
                                  const newFields = [...formData.onlineFormFields];
                                  newFields[index].fieldType = e.target.value as any;
                                  setFormData({ ...formData, onlineFormFields: newFields });
                                }}
                                style={{
                                  flex: 1,
                                  padding: '10px 12px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  fontSize: '14px'
                                }}
                              >
                                <option value="text">Text</option>
                                <option value="number">Number</option>
                                <option value="date">Date</option>
                                <option value="email">Email</option>
                                <option value="phone">Phone</option>
                                <option value="url">Link (URL)</option>
                                <option value="textarea">Textarea</option>
                                <option value="dropdown">Dropdown (Single Select)</option>
                                <option value="multiselect">Multi-Select</option>
                                <option value="radio">Radio Buttons</option>
                                <option value="checkbox">Checkboxes</option>
                                <option value="file">File Upload</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    onlineFormFields: formData.onlineFormFields.filter((_, i) => i !== index)
                                  });
                                }}
                                style={{
                                  padding: '10px 16px',
                                  backgroundColor: '#ef4444',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '14px',
                                  cursor: 'pointer'
                                }}
                              >
                                Remove
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                              <input
                                type="text"
                                placeholder="Placeholder text"
                                value={field.placeholder}
                                onChange={(e) => {
                                  const newFields = [...formData.onlineFormFields];
                                  newFields[index].placeholder = e.target.value;
                                  setFormData({ ...formData, onlineFormFields: newFields });
                                }}
                                style={{
                                  flex: 1,
                                  padding: '10px 12px',
                                  border: '1px solid #d1d5db',
                                  borderRadius: '6px',
                                  fontSize: '14px'
                                }}
                              />
                              <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 12px',
                                backgroundColor: 'white',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}>
                                <input
                                  type="checkbox"
                                  checked={field.required}
                                  onChange={(e) => {
                                    const newFields = [...formData.onlineFormFields];
                                    newFields[index].required = e.target.checked;
                                    setFormData({ ...formData, onlineFormFields: newFields });
                                  }}
                                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '14px', color: '#374151' }}>Required</span>
                              </label>
                            </div>
                            {field.fieldType === 'dropdown' && (
                              <div style={{ marginTop: '12px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                                  Dropdown Options (one per line or comma-separated)
                                </label>
                                <textarea
                                  placeholder="Enter options (one per line or comma-separated)&#10;Example:&#10;Option 1&#10;Option 2&#10;Option 3"
                                  defaultValue={field.options?.join('\n') || ''}
                                  onBlur={(e) => {
                                    const newFields = [...formData.onlineFormFields];
                                    const value = e.target.value;
                                    // Support both newline and comma-separated
                                    if (value.includes('\n')) {
                                      newFields[index].options = value.split('\n').map(opt => opt.trim()).filter(opt => opt);
                                    } else {
                                      newFields[index].options = value.split(',').map(opt => opt.trim()).filter(opt => opt);
                                    }
                                    setFormData({ ...formData, onlineFormFields: newFields });
                                  }}
                                  rows={4}
                                  style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '6px',
                                    fontSize: '14px',
                                    fontFamily: 'inherit',
                                    resize: 'vertical'
                                  }}
                                />
                              </div>
                            )}
                            {/* Options for multi-select, radio, checkbox */}
                            {(field.fieldType === 'multiselect' || field.fieldType === 'radio' || field.fieldType === 'checkbox') && (
                              <div style={{ marginTop: '12px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                                  Options (one per line or comma-separated)
                                </label>
                                <textarea
                                  placeholder="Enter options (one per line or comma-separated)&#10;Example:&#10;Option 1&#10;Option 2&#10;Option 3"
                                  defaultValue={field.options?.join('\n') || ''}
                                  onBlur={(e) => {
                                    const newFields = [...formData.onlineFormFields];
                                    const value = e.target.value;
                                    // Support both newline and comma-separated
                                    if (value.includes('\n')) {
                                      newFields[index].options = value.split('\n').map(opt => opt.trim()).filter(opt => opt);
                                    } else {
                                      newFields[index].options = value.split(',').map(opt => opt.trim()).filter(opt => opt);
                                    }
                                    setFormData({ ...formData, onlineFormFields: newFields });
                                  }}
                                  rows={4}
                                  style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '6px',
                                    fontSize: '14px',
                                    fontFamily: 'inherit',
                                    resize: 'vertical'
                                  }}
                                />
                              </div>
                            )}
                            {/* File-specific config */}
                            {field.fieldType === 'file' && (
                              <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#fef3c7', borderRadius: '6px', border: '1px solid #fde047' }}>
                                <div style={{ marginBottom: '12px' }}>
                                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#92400e', marginBottom: '6px' }}>
                                    Allowed File Types (extensions)
                                  </label>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.gif', '.txt', '.zip'].map((ext) => (
                                      <label key={ext} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 8px',
                                        backgroundColor: (field.allowedFileTypes || []).includes(ext) ? '#dbeafe' : '#f9fafb',
                                        border: (field.allowedFileTypes || []).includes(ext) ? '1px solid #3b82f6' : '1px solid #e5e7eb',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '12px'
                                      }}>
                                        <input
                                          type="checkbox"
                                          checked={(field.allowedFileTypes || []).includes(ext)}
                                          onChange={(e) => {
                                            const newFields = [...formData.onlineFormFields];
                                            const types = newFields[index].allowedFileTypes || [];
                                            if (e.target.checked) {
                                              newFields[index].allowedFileTypes = [...types, ext];
                                            } else {
                                              newFields[index].allowedFileTypes = types.filter(t => t !== ext);
                                            }
                                            setFormData({ ...formData, onlineFormFields: newFields });
                                          }}
                                          style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                                        />
                                        <span style={{ color: '#374151', fontWeight: '500' }}>{ext}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                                <div style={{ marginBottom: '12px' }}>
                                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#92400e', marginBottom: '6px' }}>
                                    Max File Size (MB)
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={field.maxFileSizeMB || 5}
                                    onChange={(e) => {
                                      const newFields = [...formData.onlineFormFields];
                                      newFields[index].maxFileSizeMB = parseInt(e.target.value) || 5;
                                      setFormData({ ...formData, onlineFormFields: newFields });
                                    }}
                                    style={{
                                      width: '120px',
                                      padding: '8px 10px',
                                      border: '1px solid #d1d5db',
                                      borderRadius: '6px',
                                      fontSize: '13px'
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    cursor: 'pointer'
                                  }}>
                                    <input
                                      type="checkbox"
                                      checked={field.allowMultiple || false}
                                      onChange={(e) => {
                                        const newFields = [...formData.onlineFormFields];
                                        newFields[index].allowMultiple = e.target.checked;
                                        setFormData({ ...formData, onlineFormFields: newFields });
                                      }}
                                      style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: '13px', color: '#92400e', fontWeight: '500' }}>Allow multiple files</span>
                                  </label>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Offline Centers */}
              {(formData.ticketSubmissionMode === 'offline' || formData.ticketSubmissionMode === 'both') && (
                <div style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '600', color: '#1f2937' }}>
                        Offline Support Centers
                      </h4>
                      <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                        Add physical locations where students can visit for support
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          offlineCenters: [
                            ...formData.offlineCenters,
                            {
                              centerName: '',
                              address: '',
                              city: '',
                              state: '',
                              pincode: '',
                              phone: '',
                              email: '',
                              workingHours: '',
                              latitude: undefined,
                              longitude: undefined,
                              features: [],
                              mapLink: ''
                            }
                          ]
                        });
                      }}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      + Add Center
                    </button>
                  </div>

                  {formData.offlineCenters.length === 0 ? (
                    <div style={{
                      padding: '20px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      textAlign: 'center',
                      color: '#6b7280',
                      fontSize: '14px'
                    }}>
                      No offline centers added yet. Click "Add Center" to add support locations.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {formData.offlineCenters.map((center, index) => (
                        <div key={index} style={{
                          padding: '16px',
                          backgroundColor: '#f9fafb',
                          borderRadius: '6px',
                          border: '1px solid #e5e7eb'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h5 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#1f2937' }}>
                              Center {index + 1}
                            </h5>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({
                                  ...formData,
                                  offlineCenters: formData.offlineCenters.filter((_, i) => i !== index)
                                });
                              }}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '13px',
                                cursor: 'pointer'
                              }}
                            >
                              Remove
                            </button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <input
                              type="text"
                              placeholder="Center Name"
                              value={center.centerName}
                              onChange={(e) => {
                                const newCenters = [...formData.offlineCenters];
                                newCenters[index].centerName = e.target.value;
                                setFormData({ ...formData, offlineCenters: newCenters });
                              }}
                              style={{
                                gridColumn: '1 / -1',
                                padding: '10px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px'
                              }}
                            />
                            <input
                              type="text"
                              placeholder="Address"
                              value={center.address}
                              onChange={(e) => {
                                const newCenters = [...formData.offlineCenters];
                                newCenters[index].address = e.target.value;
                                setFormData({ ...formData, offlineCenters: newCenters });
                              }}
                              style={{
                                gridColumn: '1 / -1',
                                padding: '10px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px'
                              }}
                            />
                            <select
                              value={center.city}
                              onChange={(e) => {
                                const newCenters = [...formData.offlineCenters];
                                newCenters[index].city = e.target.value;
                                setFormData({ ...formData, offlineCenters: newCenters });
                              }}
                              style={{
                                padding: '10px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px',
                                backgroundColor: 'white',
                                cursor: 'pointer'
                              }}
                            >
                              <option value="">Select City</option>
                              {cities.map((city) => (
                                <option key={city.key} value={city.value}>{city.value}</option>
                              ))}
                            </select>
                            <select
                              value={center.state}
                              onChange={(e) => {
                                const newCenters = [...formData.offlineCenters];
                                newCenters[index].state = e.target.value;
                                setFormData({ ...formData, offlineCenters: newCenters });
                              }}
                              style={{
                                padding: '10px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px',
                                backgroundColor: 'white',
                                cursor: 'pointer'
                              }}
                            >
                              <option value="">Select State</option>
                              {states.map((state) => (
                                <option key={state.key} value={state.value}>{state.value}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Pincode"
                              value={center.pincode}
                              onChange={(e) => {
                                const newCenters = [...formData.offlineCenters];
                                newCenters[index].pincode = e.target.value;
                                setFormData({ ...formData, offlineCenters: newCenters });
                              }}
                              style={{
                                padding: '10px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px'
                              }}
                            />
                            <input
                              type="text"
                              placeholder="Phone"
                              value={center.phone}
                              onChange={(e) => {
                                const newCenters = [...formData.offlineCenters];
                                newCenters[index].phone = e.target.value;
                                setFormData({ ...formData, offlineCenters: newCenters });
                              }}
                              style={{
                                padding: '10px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px'
                              }}
                            />
                            <input
                              type="email"
                              placeholder="Email"
                              value={center.email}
                              onChange={(e) => {
                                const newCenters = [...formData.offlineCenters];
                                newCenters[index].email = e.target.value;
                                setFormData({ ...formData, offlineCenters: newCenters });
                              }}
                              style={{
                                gridColumn: '1 / -1',
                                padding: '10px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px'
                              }}
                            />
                            <input
                              type="text"
                              placeholder="Working Hours (e.g., Mon-Fri: 9 AM - 6 PM)"
                              value={center.workingHours}
                              onChange={(e) => {
                                const newCenters = [...formData.offlineCenters];
                                newCenters[index].workingHours = e.target.value;
                                setFormData({ ...formData, offlineCenters: newCenters });
                              }}
                              style={{
                                gridColumn: '1 / -1',
                                padding: '10px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px'
                              }}
                            />
                            <input
                              type="text"
                              placeholder="Google Maps Link (for directions)"
                              value={center.mapLink || ''}
                              onChange={(e) => {
                                const newCenters = [...formData.offlineCenters];
                                newCenters[index].mapLink = e.target.value;
                                setFormData({ ...formData, offlineCenters: newCenters });
                              }}
                              style={{
                                gridColumn: '1 / -1',
                                padding: '10px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '14px'
                              }}
                            />
                            <div style={{ gridColumn: '1 / -1' }}>
                              <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                                  Features Available
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newCenters = [...formData.offlineCenters];
                                    if (!newCenters[index].features) {
                                      newCenters[index].features = [];
                                    }
                                    newCenters[index].features!.push('');
                                    setFormData({ ...formData, offlineCenters: newCenters });
                                  }}
                                  style={{
                                    padding: '4px 12px',
                                    backgroundColor: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  + Add Feature
                                </button>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {(center.features || []).map((feature, featureIndex) => (
                                  <div key={featureIndex} style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                      type="text"
                                      placeholder="e.g., WiFi, Parking, Wheelchair Access"
                                      value={feature}
                                      onChange={(e) => {
                                        const newCenters = [...formData.offlineCenters];
                                        newCenters[index].features![featureIndex] = e.target.value;
                                        setFormData({ ...formData, offlineCenters: newCenters });
                                      }}
                                      style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '6px',
                                        fontSize: '14px'
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newCenters = [...formData.offlineCenters];
                                        newCenters[index].features!.splice(featureIndex, 1);
                                        setFormData({ ...formData, offlineCenters: newCenters });
                                      }}
                                      style={{
                                        padding: '8px 12px',
                                        backgroundColor: '#ef4444',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                                {(!center.features || center.features.length === 0) && (
                                  <div style={{ 
                                    padding: '12px', 
                                    backgroundColor: '#f3f4f6', 
                                    borderRadius: '6px',
                                    textAlign: 'center',
                                    color: '#6b7280',
                                    fontSize: '13px'
                                  }}>
                                    No features added. Click "Add Feature" to list center amenities.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'customization' && (
            <div style={{ padding: '24px', maxWidth: '900px', minHeight: '500px' }}>
              {/* Login Page */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
                  Login Page
                </h3>
                
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                    Background Image
                  </label>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                    Maximum file size: 2MB<br/>
                    Best dimensions: 1920 × 1080 pixels
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {formData.loginPageBackgroundImageUrl && (
                      <img 
                        src={formData.loginPageBackgroundImageUrl} 
                        alt="Login background preview" 
                        style={{ 
                          width: '120px', 
                          height: '68px', 
                          objectFit: 'cover', 
                          borderRadius: '4px',
                          border: '1px solid #e5e7eb'
                        }} 
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => document.getElementById('loginBgImageInput')?.click()}
                      style={{
                        padding: '8px 16px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        backgroundColor: 'white',
                        color: '#374151',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Upload Image
                    </button>
                    <input
                      id="loginBgImageInput"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setFormData({
                            ...formData,
                            loginPageBackgroundImage: file,
                            loginPageBackgroundImageUrl: URL.createObjectURL(file)
                          });
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>
              </div>

              {/* Theme Customization */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
                  Theme Customization
                </h3>
                
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="themeMode"
                      value="light"
                      checked={formData.themeMode === 'light'}
                      onChange={(e) => setFormData({ ...formData, themeMode: 'light' })}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>Light</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="themeMode"
                      value="dark"
                      checked={formData.themeMode === 'dark'}
                      onChange={(e) => setFormData({ ...formData, themeMode: 'dark' })}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>Dark</span>
                  </label>
                </div>

                <div style={{ marginBottom: '20px', opacity: formData.themeMode === 'dark' ? 0.5 : 1, pointerEvents: formData.themeMode === 'dark' ? 'none' : 'auto' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                    Theme Color {formData.themeMode === 'dark' && <span style={{ fontSize: '12px', fontWeight: '400', color: '#6b7280' }}>(Not applicable for dark theme)</span>}
                  </label>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                    Select a color for the overall theme of the customer portal.
                  </div>
                  
                  {/* Color Palette */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    {[
                      '#444ce7', '#3b82f6', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
                      '#84cc16', '#22c55e', '#14b8a6', '#eab308', '#f97316', '#ef4444'
                    ].map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, themeColor: color })}
                        disabled={formData.themeMode === 'dark'}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '4px',
                          backgroundColor: color,
                          border: formData.themeColor === color ? '2px solid #111827' : '2px solid transparent',
                          cursor: formData.themeMode === 'dark' ? 'not-allowed' : 'pointer',
                          position: 'relative'
                        }}
                      >
                        {formData.themeColor === color && (
                          <span style={{ 
                            position: 'absolute', 
                            top: '50%', 
                            left: '50%', 
                            transform: 'translate(-50%, -50%)',
                            color: 'white',
                            fontSize: '16px'
                          }}>✓</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Custom Color Input */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input
                      type="color"
                      value={formData.themeColor}
                      onChange={(e) => setFormData({ ...formData, themeColor: e.target.value })}
                      disabled={formData.themeMode === 'dark'}
                      style={{
                        width: '48px',
                        height: '40px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        cursor: formData.themeMode === 'dark' ? 'not-allowed' : 'pointer'
                      }}
                    />
                    <input
                      type="text"
                      value={formData.themeColor}
                      onChange={(e) => setFormData({ ...formData, themeColor: e.target.value })}
                      placeholder="#444ce7"
                      disabled={formData.themeMode === 'dark'}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontFamily: 'monospace',
                        backgroundColor: formData.themeMode === 'dark' ? '#f3f4f6' : 'white',
                        cursor: formData.themeMode === 'dark' ? 'not-allowed' : 'text'
                      }}
                    />
                    <button
                      type="button"
                      disabled={formData.themeMode === 'dark'}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        backgroundColor: 'white',
                        cursor: formData.themeMode === 'dark' ? 'not-allowed' : 'pointer',
                        fontSize: '20px'
                      }}
                    >
                      🎨
                    </button>
                  </div>
                </div>
              </div>

              {/* Advanced Customization */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
                  Advanced Customization
                </h3>
                
                {/* Warning Message */}
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fde047',
                  borderRadius: '6px',
                  marginBottom: '20px',
                  display: 'flex',
                  gap: '12px'
                }}>
                  <span style={{ fontSize: '20px' }}>ℹ️</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', color: '#92400e', margin: 0 }}>
                      Any custom code you add to the customer portal is your responsibility. Please take care when making these modifications because they could impact your customer experience. When incorporating CSS or JS, please use proper syntax.
                    </p>
                  </div>
                </div>

                {/* Custom CSS */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                      Custom CSS
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCustomCSSModal(true)}
                      style={{
                        padding: '4px 12px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: '#a855f7',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        textDecoration: 'none'
                      }}
                    >
                      Add Custom CSS
                    </button>
                  </div>
                </div>

                {/* Custom JS */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                      Custom JS
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCustomJSModal(true)}
                      style={{
                        padding: '4px 12px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: '#a855f7',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        textDecoration: 'none'
                      }}
                    >
                      Add Custom JS
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
            </div>

            {/* Form Footer - Inside Form */}
            <div style={{
              padding: '20px 40px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#ffffff'
            }}>
              <button
                type="button"
                style={{
                  padding: '0',
                  border: 'none',
                  background: 'transparent',
                  color: '#6b7280',
                  fontSize: '14px',
                  fontWeight: '400',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'color 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#3F41D1'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 14A6 6 0 108 2a6 6 0 000 12z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 10.67V8M8 5.33h.007" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Learn more
              </button>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(true)}
                  className="btn"
                  style={{ 
                    textTransform: 'none',
                    backgroundColor: 'transparent',
                    border: '1px solid #d1d5db',
                    color: '#6b7280',
                    fontWeight: '500',
                    padding: '10px 20px',
                    height: '40px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                    e.currentTarget.style.borderColor = '#9ca3af';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }}
                >
                  {getText('Discard', 'रद्द करा', 'रद्द करा')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn"
                  style={{ 
                    textTransform: 'none',
                    backgroundColor: saving ? '#9ca3af' : '#3F41D1',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: '600',
                    padding: '10px 24px',
                    height: '40px',
                    minWidth: '120px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: saving ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.05)'
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) {
                      e.currentTarget.style.backgroundColor = '#2E31A8';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!saving) {
                      e.currentTarget.style.backgroundColor = '#3F41D1';
                      e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
                    }
                  }}
                >
                  {saving && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                      <path d="M8 2v2M8 12v2M14 8h-2M4 8H2M12.657 12.657l-1.414-1.414M4.757 4.757L3.343 3.343M12.657 3.343l-1.414 1.414M4.757 11.243l-1.414 1.414" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {saving ? (getText('Saving...', 'जतन करत आहे...', 'जतन करत आहे...')) : (getText('Update Project', 'अपडेट करा', 'अपडेट करा'))}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Discard Confirmation Modal */}
      {showDiscardConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10002
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '440px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            overflow: 'hidden'
          }}>
            {/* Icon and Title */}
            <div style={{ padding: '24px 24px 20px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px'
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 style={{
                margin: '0 0 8px 0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#111827'
              }}>
                Discard Changes?
              </h3>
              <p style={{
                margin: '0',
                fontSize: '14px',
                color: '#6b7280',
                lineHeight: '1.5'
              }}>
                Are you sure you want to discard all changes? This action cannot be undone.
              </p>
            </div>

            {/* Actions */}
            <div style={{
              padding: '16px 24px 24px',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#dc2626';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ef4444';
                }}
              >
                Yes, Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map Custom Domain Modal */}
      {showMapModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: '600',
                color: '#1f2937'
              }}>
                Map Custom Domain
              </h3>
              <button
                onClick={() => setShowMapModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1f2937',
                  marginBottom: '8px'
                }}>
                  Custom Domain Path <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  backgroundColor: '#f9fafb',
                  fontSize: '14px',
                  color: '#374151'
                }}>
                  <span style={{ color: '#6b7280' }}>https://www.hubblehox.com/</span>
                  <span style={{ 
                    color: '#a855f7', 
                    fontWeight: '500',
                    flex: 1
                  }}>
                    {formData.portalUrl || 'domain_name'}
                  </span>
                </div>
                {!formData.portalUrl && (
                  <p style={{ 
                    fontSize: '13px', 
                    color: '#ef4444', 
                    marginTop: '4px',
                    marginBottom: 0
                  }}>
                    This field is required.
                  </p>
                )}
              </div>

              <div style={{
                backgroundColor: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '6px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <p style={{ 
                  fontSize: '14px', 
                  color: '#0c4a6e',
                  margin: '0 0 12px 0',
                  fontWeight: '500'
                }}>
                  Domain Path Configuration:
                </p>
                <p style={{ 
                  fontSize: '13px', 
                  color: '#0369a1',
                  margin: '0 0 8px 0',
                  lineHeight: '1.5'
                }}>
                  Your custom domain path will be used to access the customer portal (help center). 
                  To access the agent portal, add <strong>/agent</strong> at the end of the URL.
                </p>
                <p style={{ 
                  fontSize: '13px', 
                  color: '#0369a1',
                  margin: '0',
                  lineHeight: '1.5'
                }}>
                  <strong>Example:</strong>
                  <br />
                  • Customer Portal: <code style={{ 
                    backgroundColor: '#e0f2fe', 
                    padding: '2px 6px', 
                    borderRadius: '3px',
                    fontSize: '12px'
                  }}>https://www.hubblehox.com/{formData.portalUrl || 'domain_name'}</code>
                  <br />
                  • Agent Portal: <code style={{ 
                    backgroundColor: '#e0f2fe', 
                    padding: '2px 6px', 
                    borderRadius: '3px',
                    fontSize: '12px'
                  }}>https://www.hubblehox.com/{formData.portalUrl || 'domain_name'}/agent</code>
                </p>
              </div>

              <div style={{
                backgroundColor: '#fef3c7',
                border: '1px solid #fde047',
                borderRadius: '6px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <p style={{ 
                  fontSize: '14px', 
                  color: '#92400e',
                  margin: '0 0 8px 0',
                  fontWeight: '500'
                }}>
                  Note:
                </p>
                <p style={{ 
                  fontSize: '13px', 
                  color: '#a16207',
                  margin: '0',
                  lineHeight: '1.5'
                }}>
                  The domain path must be unique and will be mapped to your organization's portal. 
                  Changes may take a few minutes to propagate across the system.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              padding: '16px 24px',
              borderTop: '1px solid #e5e7eb'
            }}>
              <button
                type="button"
                onClick={() => setShowMapModal(false)}
                style={{
                  padding: '10px 24px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  color: '#374151',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (formData.portalUrl) {
                    // Here you can add logic to save/map the domain
                    setShowMapModal(false);
                    alert(`Domain path "${formData.portalUrl}" has been mapped successfully!`);
                  }
                }}
                disabled={!formData.portalUrl}
                className="btn btn-cta"
                style={{ textTransform: 'none' }}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom CSS Modal */}
      {showCustomCSSModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: '600',
                color: '#1f2937'
              }}>
                Add Custom CSS
              </h3>
              <button
                onClick={() => setShowCustomCSSModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  marginBottom: '8px',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>&lt;style&gt;</span>
                  <span>{formData.customCSS.length} / 10000</span>
                </div>
                <textarea
                  value={formData.customCSS}
                  onChange={(e) => setFormData({ ...formData, customCSS: e.target.value })}
                  placeholder="h1 { font-size: 40px; }"
                  maxLength={10000}
                  rows={15}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #a855f7',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    resize: 'vertical',
                    outline: 'none'
                  }}
                />
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  marginTop: '8px'
                }}>
                  &lt;/style&gt;
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button
                type="button"
                onClick={() => setShowCustomCSSModal(false)}
                style={{
                  padding: '8px 20px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  color: '#374151',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowCustomCSSModal(false)}
                className="btn btn-cta"
                style={{ textTransform: 'none' }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom JS Modal */}
      {showCustomJSModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: '600',
                color: '#1f2937'
              }}>
                Add Custom JS
              </h3>
              <button
                onClick={() => setShowCustomJSModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  marginBottom: '8px',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>&lt;script&gt;</span>
                  <span>{formData.customJS.length} / 10000</span>
                </div>
                <textarea
                  value={formData.customJS}
                  onChange={(e) => setFormData({ ...formData, customJS: e.target.value })}
                  placeholder="console.log('Customer Portal')"
                  maxLength={10000}
                  rows={15}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #a855f7',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    resize: 'vertical',
                    outline: 'none'
                  }}
                />
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  marginTop: '8px'
                }}>
                  &lt;/script&gt;
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button
                type="button"
                onClick={() => setShowCustomJSModal(false)}
                style={{
                  padding: '8px 20px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  color: '#374151',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowCustomJSModal(false)}
                className="btn btn-cta"
                style={{ textTransform: 'none' }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner Preview Modal */}
      {showBannerPreview && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                Login Screen Preview
              </h2>
              <button
                onClick={() => setShowBannerPreview(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '24px', height: '24px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Preview Content */}
            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                This is how the announcement banner will appear on the login screen for Admin, Agent, Counselor, and Center Manager logins.
              </p>

              {/* Mock Login Screen */}
              <div style={{
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}>
                {/* Announcement Banner */}
                {formData.announcementBannerMessage && (
                  <div style={{
                    backgroundColor: '#fef3c7',
                    borderBottom: '1px solid #fbbf24',
                    padding: '12px 16px',
                    color: '#92400e'
                  }}>
                    {formData.announcementBannerType === 'rich' ? (
                      <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formData.announcementBannerMessage) }} style={{ fontSize: '14px', lineHeight: '1.5' }} />
                    ) : (
                      <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>
                        {formData.announcementBannerMessage}
                      </p>
                    )}
                  </div>
                )}

                {/* Mock Login Form */}
                <div style={{
                  display: 'flex',
                  minHeight: '500px'
                }}>
                  {/* Left Side - Branding */}
                  <div style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    padding: '40px'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        width: '80px',
                        height: '80px',
                        margin: '0 auto 16px',
                        background: 'rgba(255, 255, 255, 0.2)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '40px', height: '40px' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                      </div>
                      <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '12px' }}>
                        {formData.portalName || 'SAC Helpdesk'}
                      </h1>
                      <p style={{ fontSize: '16px', opacity: 0.9 }}>
                        Secure Portal Access
                      </p>
                    </div>
                  </div>

                  {/* Right Side - Login Form */}
                  <div style={{
                    flex: 1,
                    backgroundColor: 'white',
                    padding: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <div style={{ width: '100%', maxWidth: '380px' }}>
                      <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
                        Welcome Back
                      </h2>
                      <p style={{ color: '#6b7280', marginBottom: '24px', fontSize: '14px' }}>
                        Sign in to your account
                      </p>

                      {/* Email Input */}
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                          Email
                        </label>
                        <input
                          type="email"
                          placeholder="you@example.com"
                          disabled
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '14px',
                            backgroundColor: '#f9fafb',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {/* Password Input */}
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
                          Password
                        </label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          disabled
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '14px',
                            backgroundColor: '#f9fafb',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {/* Sign In Button */}
                      <button
                        disabled
                        style={{
                          width: '100%',
                          padding: '12px',
                          backgroundColor: '#667eea',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'not-allowed',
                          opacity: 0.7
                        }}
                      >
                        Sign In
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast.show && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 10003,
          animation: 'slideInRight 0.3s ease-out'
        }}>
          <div style={{
            minWidth: '320px',
            maxWidth: '480px',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            border: `1px solid ${
              toast.type === 'success' ? '#10b981' :
              toast.type === 'error' ? '#ef4444' :
              toast.type === 'warning' ? '#f59e0b' :
              '#3b82f6'
            }`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '16px',
            borderLeft: `4px solid ${
              toast.type === 'success' ? '#10b981' :
              toast.type === 'error' ? '#ef4444' :
              toast.type === 'warning' ? '#f59e0b' :
              '#3b82f6'
            }`
          }}>
            {/* Icon */}
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              backgroundColor: 
                toast.type === 'success' ? 'rgba(16, 185, 129, 0.1)' :
                toast.type === 'error' ? 'rgba(239, 68, 68, 0.1)' :
                toast.type === 'warning' ? 'rgba(245, 158, 11, 0.1)' :
                'rgba(59, 130, 246, 0.1)'
            }}>
              {toast.type === 'success' && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M13.3 4.7L6 12L2.7 8.7L3.4 8L6 10.6L12.6 4L13.3 4.7Z" fill="#10b981"/>
                </svg>
              )}
              {toast.type === 'error' && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M11.5 4.5L4.5 11.5M4.5 4.5l7 7" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              )}
              {toast.type === 'warning' && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 5v3M8 11h.01" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M8 14A6 6 0 108 2a6 6 0 000 12z" stroke="#f59e0b" strokeWidth="1.5"/>
                </svg>
              )}
              {toast.type === 'info' && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 7v4M8 5h.01" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M8 14A6 6 0 108 2a6 6 0 000 12z" stroke="#3b82f6" strokeWidth="1.5"/>
                </svg>
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1 }}>
              <p style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: '500',
                color: '#111827',
                lineHeight: '1.5'
              }}>
                {toast.type === 'success' ? 'Success' :
                 toast.type === 'error' ? 'Error' :
                 toast.type === 'warning' ? 'Warning' :
                 'Info'}
              </p>
              <p style={{
                margin: '4px 0 0 0',
                fontSize: '13px',
                color: '#6b7280',
                lineHeight: '1.5'
              }}>
                {toast.message}
              </p>
            </div>

            {/* Close button */}
            <button
              onClick={() => setToast({ show: false, type: 'success', message: '' })}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0',
                color: '#9ca3af',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                flexShrink: 0
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddProjectForm;
