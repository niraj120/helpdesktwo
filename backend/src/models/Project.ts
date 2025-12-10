import mongoose, { Document, Schema } from 'mongoose';

export interface IProject extends Document {
  // Basic Information
  projectId: string; // Unique identifier like P001, P002
  name: string;
  code: string; // Short code for project
  description?: string;
  
  // Contact Information
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };
  contactInfo?: {
    phone?: string;
    email?: string;
    website?: string;
  };
  region?: string;
  primaryContact?: {
    name?: string;
    email?: string;
    phone?: string;
    designation?: string;
  };
  
  // Branding Configuration
  branding?: {
    logo?: string; // URL or base64
    colorTheme?: {
      primary?: string;
      secondary?: string;
      accent?: string;
      background?: string;
    };
    headerText?: string;
    footerText?: string;
    domainUrl?: string; // For whitelabeling
    favicon?: string;
    customUrlPath?: string; // Custom URL path for project login (e.g., 'studentassistcenter')
  };
  
  // Module Configuration
  modules?: {
    tickets?: boolean;
    knowledgeBase?: boolean;
    reports?: boolean;
    assets?: boolean;
    communication?: boolean;
    analytics?: boolean;
    userManagement?: boolean;
    workflows?: boolean;
    approvals?: boolean;
    notifications?: boolean;
  };
  
  // Regional Settings
  settings?: {
    defaultLanguage?: string; // 'en', 'mr', 'hi', etc.
    timezone?: string; // 'Asia/Kolkata', etc.
    dateFormat?: string; // 'DD/MM/YYYY', 'MM/DD/YYYY', etc.
    timeFormat?: string; // '12h', '24h'
    currency?: string; // 'INR', 'USD', etc.
    firstDayOfWeek?: number; // 0=Sunday, 1=Monday
  };
  
  // Additional Configuration
  configuration?: {
    maxUsers?: number;
    maxStorage?: number; // in GB
    allowedDomains?: string[]; // Email domains allowed
    customFields?: Array<{
      name: string;
      type: string;
      required: boolean;
      options?: string[];
    }>;
    slaSettings?: {
      enabled: boolean;
      defaultResponseTime?: number; // in hours
      defaultResolutionTime?: number; // in hours
    };
    ticketNumberSettings?: {
      prefix?: string; // e.g., 'TKT', 'HELP', 'SUP'
      format?: string; // e.g., '{PREFIX}-{YYYY}{MM}{DD}-{NNNN}', '{PREFIX}-{NNNN}'
      startingNumber?: number; // Starting sequence number (default: 1)
      resetPeriod?: 'never' | 'daily' | 'monthly' | 'yearly'; // When to reset counter
    };
    ticketAssignmentSettings?: {
      enabled: boolean;
      assignmentType: 'round-robin' | 'load-balanced' | 'manual' | 'condition-based';
      assignToUsers?: mongoose.Types.ObjectId[]; // Pool of agents for auto-assignment
      assignToRoles?: string[]; // Roles eligible for assignment (e.g., 'Agent', 'Support')
      reassignOnEscalation?: boolean;
      notifyOnAssignment?: boolean;
      conditionRules?: Array<{
        field: string;
        operator: string;
        categories: string[];
        assignToAgents: string[];
      }>;
      manualAssignmentPermissions?: Array<{
        roleId: string; // Role that can assign tickets
        canAssignToRoles: string[]; // Role IDs they can assign to
      }>;
    };
    securitySettings?: {
      mfaRequired?: boolean;
      passwordPolicy?: {
        minLength?: number;
        requireUppercase?: boolean;
        requireLowercase?: boolean;
        requireNumbers?: boolean;
        requireSpecialChars?: boolean;
        expiryDays?: number;
      };
      sessionTimeout?: number; // in minutes
      ipWhitelist?: string[];
      allowUserSignup?: boolean;
      restrictSignupViaSocial?: boolean;
    };
    loginSettings?: {
      enableFormLogin?: boolean;
      enableGoogleRecaptcha?: boolean;
      socialLogins?: {
        google?: boolean;
        facebook?: boolean;
        microsoft?: boolean;
      };
      ssoSettings?: {
        oauth20?: boolean;
        openIdConnect?: boolean;
        jwt?: boolean;
      };
    };
    knowledgeBaseSettings?: {
      enabled?: boolean;
      kbHomeConfiguration?: any;
      articleConfiguration?: any;
      enableAIAssistance?: boolean;
      enableSatisfactionFeedback?: boolean;
      satisfactionFeedback?: any;
      seoSettings?: any;
    };
    customizationSettings?: {
      loginPageBackgroundImage?: string;
      themeMode?: 'light' | 'dark';
      themeColor?: string;
      customCSS?: string;
      customJS?: string;
    };
    ticketSubmissionSettings?: {
      mode?: 'online' | 'offline' | 'both'; // How students can submit tickets
      enableOnlineForm?: boolean;
      enableOfflineCenter?: boolean;
      onlineFormFields?: Array<{
        fieldName: string;
        fieldType: 'text' | 'email' | 'phone' | 'textarea' | 'dropdown' | 'file';
        required: boolean;
        placeholder?: string;
        options?: string[];
      }>;
      offlineCenters?: Array<{
        centerName: string;
        address: string;
        city: string;
        state: string;
        pincode: string;
        phone?: string;
        email?: string;
        workingHours?: string;
        latitude?: number;
        longitude?: number;
      }>;
      welcomeMessage?: string;
      successMessage?: string;
      announcement?: string;
      allowAttachments?: boolean;
      maxAttachmentSize?: number; // in MB
      allowedFileTypes?: string[];
      allowStudentToCloseTicket?: boolean; // Allow students to close their own tickets
    };
    offlineModuleSettings?: {
      registrationFields?: Array<{
        id: string;
        fieldName: string;
        fieldType: 'text' | 'email' | 'phone' | 'number' | 'textarea' | 'dropdown' | 'date';
        required: boolean;
        placeholder: string;
        options?: string[];
        validation?: {
          minLength?: number;
          maxLength?: number;
          pattern?: string;
        };
        isParentMobile?: boolean;
        order: number;
      }>;
      ticketFields?: Array<{
        id: string;
        fieldName: string;
        fieldType: 'text' | 'textarea' | 'dropdown' | 'number' | 'date' | 'file' | 'category';
        required: boolean;
        placeholder: string;
        options?: string[];
        allowMultiple?: boolean;
        maxFiles?: number;
        allowedFileTypes?: string[];
        isFixed?: boolean;
        isEnabled?: boolean;
        order: number;
      }>;
      allowAgentToMarkResolved?: boolean;
      allowAgentToEscalate?: boolean;
      autoAssignToCreatingAgent?: boolean;
      requireStudentVerification?: boolean;
      notificationSettings?: {
        notifyStudentOnRegistration?: boolean;
        notifyStudentOnTicketCreation?: boolean;
        sendWelcomeEmail?: boolean;
      };
    };
  };
  
  // Status and Metadata
  status: 'active' | 'inactive' | 'suspended';
  isActive: boolean;
  users: number; // Count of users in this project
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>({
  projectId: {
    type: String,
    required: false, // Auto-generated by pre-save hook
    unique: true,
    uppercase: true,
  },
  name: {
    type: String,
    required: false, // Auto-generated from portal name
    trim: true,
  },
  code: {
    type: String,
    required: false, // Auto-generated from portal name
    unique: true,
    uppercase: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  
  // Contact Information
  address: {
    street: String,
    city: String,
    state: String,
    country: { type: String, default: 'India' },
    pincode: String,
  },
  contactInfo: {
    phone: String,
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    website: String,
  },
  region: String,
  primaryContact: {
    name: String,
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    phone: String,
    designation: String,
  },
  
  // Branding Configuration
  branding: {
    logo: String,
    colorTheme: {
      primary: { type: String, default: '#f97316' },
      secondary: { type: String, default: '#1f2937' },
      accent: { type: String, default: '#3b82f6' },
      background: { type: String, default: '#ffffff' },
    },
    headerText: String,
    footerText: String,
    domainUrl: String,
    favicon: String,
    customUrlPath: { 
      type: String, 
      unique: true,
      sparse: true, // Allows null/undefined values while maintaining uniqueness for non-null values
      trim: true,
      lowercase: true
    },
  },
  
  // Module Configuration
  modules: {
    tickets: { type: Boolean, default: true },
    knowledgeBase: { type: Boolean, default: true },
    reports: { type: Boolean, default: true },
    assets: { type: Boolean, default: false },
    communication: { type: Boolean, default: true },
    analytics: { type: Boolean, default: true },
    userManagement: { type: Boolean, default: true },
    workflows: { type: Boolean, default: false },
    approvals: { type: Boolean, default: false },
    notifications: { type: Boolean, default: true },
  },
  
  // Regional Settings
  settings: {
    defaultLanguage: { type: String, default: 'en' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    dateFormat: { type: String, default: 'DD/MM/YYYY' },
    timeFormat: { type: String, default: '12h' },
    currency: { type: String, default: 'INR' },
    firstDayOfWeek: { type: Number, default: 0 },
  },
  
  // Additional Configuration
  configuration: {
    maxUsers: { type: Number, default: 100 },
    maxStorage: { type: Number, default: 10 }, // GB
    allowedDomains: [String],
    customFields: [{
      name: String,
      type: String,
      required: Boolean,
      options: [String],
    }],
    slaSettings: {
      enabled: { type: Boolean, default: false },
      defaultResponseTime: Number,
      defaultResolutionTime: Number,
    },
    ticketNumberSettings: {
      prefix: { type: String },
      format: { type: String },
      startingNumber: { type: Number },
      resetPeriod: { type: String, enum: ['never', 'daily', 'monthly', 'yearly'] },
    },
    ticketAssignmentSettings: {
      enabled: { type: Boolean, default: false },
      assignmentType: { type: String, enum: ['round-robin', 'load-balanced', 'manual', 'condition-based'], default: 'manual' },
      assignToUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      assignToRoles: [{ type: String }],
      reassignOnEscalation: { type: Boolean, default: false },
      notifyOnAssignment: { type: Boolean, default: true },
      conditionRules: [{
        field: { type: String },
        operator: { type: String },
        categories: [{ type: String }],
        assignToAgents: [{ type: String }]
      }],
      manualAssignmentPermissions: [{
        roleId: { type: String },
        canAssignToRoles: [{ type: String }]
      }]
    },
    securitySettings: {
      mfaRequired: { type: Boolean, default: false },
      passwordPolicy: {
        minLength: { type: Number, default: 8 },
        requireUppercase: { type: Boolean, default: true },
        requireLowercase: { type: Boolean, default: true },
        requireNumbers: { type: Boolean, default: true },
        requireSpecialChars: { type: Boolean, default: false },
        expiryDays: { type: Number, default: 90 },
      },
      sessionTimeout: { type: Number, default: 30 },
      ipWhitelist: [String],
      allowUserSignup: { type: Boolean, default: true },
      restrictSignupViaSocial: { type: Boolean, default: false },
    },
    loginSettings: {
      enableFormLogin: { type: Boolean, default: true },
      enableGoogleRecaptcha: { type: Boolean, default: false },
      socialLogins: {
        google: { type: Boolean, default: false },
        facebook: { type: Boolean, default: false },
        microsoft: { type: Boolean, default: false },
      },
      ssoSettings: {
        oauth20: { type: Boolean, default: false },
        openIdConnect: { type: Boolean, default: false },
        jwt: { type: Boolean, default: false },
      },
    },
    knowledgeBaseSettings: {
      enabled: { type: Boolean, default: false },
      kbHomeConfiguration: Schema.Types.Mixed,
      articleConfiguration: Schema.Types.Mixed,
      enableAIAssistance: { type: Boolean, default: false },
      enableSatisfactionFeedback: { type: Boolean, default: false },
      satisfactionFeedback: Schema.Types.Mixed,
      seoSettings: Schema.Types.Mixed,
    },
    customizationSettings: {
      loginPageBackgroundImage: { type: String },
      themeMode: { type: String, enum: ['light', 'dark'], default: 'light' },
      themeColor: { type: String, default: '#444ce7' },
      customCSS: { type: String },
      customJS: { type: String },
    },
    ticketSubmissionSettings: {
      mode: { type: String, enum: ['online', 'offline', 'both'], default: 'both' },
      enableOnlineForm: { type: Boolean, default: true },
      enableOfflineCenter: { type: Boolean, default: true },
      onlineFormFields: [{
        fieldName: { type: String },
        fieldType: { type: String, enum: ['text', 'email', 'phone', 'textarea', 'dropdown', 'file'] },
        required: { type: Boolean, default: false },
        placeholder: { type: String },
        options: [{ type: String }],
      }],
      offlineCenters: [{
        centerName: { type: String },
        address: { type: String },
        city: { type: String },
        state: { type: String },
        pincode: { type: String },
        phone: { type: String },
        email: { type: String },
        workingHours: { type: String },
        latitude: { type: Number },
        longitude: { type: Number },
        features: [{ type: String }],
        mapLink: { type: String },
      }],
      welcomeMessage: { type: String },
      successMessage: { type: String },
      announcement: { type: String },
      allowAttachments: { type: Boolean, default: true },
      maxAttachmentSize: { type: Number, default: 10 }, // 10 MB
      allowedFileTypes: [{ type: String }],
    },
    offlineModuleSettings: {
      registrationFields: [{
        id: { type: String },
        fieldName: { type: String },
        fieldType: { type: String, enum: ['text', 'email', 'phone', 'number', 'textarea', 'dropdown', 'date'] },
        required: { type: Boolean, default: false },
        placeholder: { type: String },
        options: [{ type: String }],
        validation: {
          minLength: { type: Number },
          maxLength: { type: Number },
          pattern: { type: String },
        },
        isParentMobile: { type: Boolean, default: false },
        order: { type: Number },
      }],
      ticketFields: [{
        id: { type: String },
        fieldName: { type: String },
        fieldType: { type: String, enum: ['text', 'textarea', 'dropdown', 'number', 'date', 'file', 'category'] },
        required: { type: Boolean, default: false },
        placeholder: { type: String },
        options: [{ type: String }],
        allowMultiple: { type: Boolean },
        maxFiles: { type: Number },
        allowedFileTypes: [{ type: String }],
        isFixed: { type: Boolean, default: false },
        isEnabled: { type: Boolean, default: true },
        order: { type: Number },
      }],
      allowAgentToMarkResolved: { type: Boolean, default: true },
      allowAgentToEscalate: { type: Boolean, default: true },
      autoAssignToCreatingAgent: { type: Boolean, default: false },
      requireStudentVerification: { type: Boolean, default: false },
      notificationSettings: {
        notifyStudentOnRegistration: { type: Boolean, default: true },
        notifyStudentOnTicketCreation: { type: Boolean, default: true },
        sendWelcomeEmail: { type: Boolean, default: true },
      },
    },
  },
  
  // Status and Metadata
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  users: {
    type: Number,
    default: 0,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Indexes for better query performance
projectSchema.index({ projectId: 1 });
projectSchema.index({ code: 1 });
projectSchema.index({ name: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ isActive: 1 });
projectSchema.index({ createdAt: -1 });

// Auto-generate projectId before saving
projectSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Auto-generate projectId
    if (!this.projectId) {
      const count = await mongoose.models.Project.countDocuments();
      this.projectId = `P${String(count + 1).padStart(3, '0')}`;
    }
    
    // Auto-generate name from portal name if not provided
    if (!this.name && this.branding?.headerText) {
      this.name = this.branding.headerText;
    }
    
    // Auto-generate code from portal name if not provided
    if (!this.code && this.branding?.headerText) {
      this.code = this.branding.headerText.replace(/\s+/g, '').toUpperCase().substring(0, 10);
    }
  }
  next();
});

export const Project = mongoose.model<IProject>('Project', projectSchema);
