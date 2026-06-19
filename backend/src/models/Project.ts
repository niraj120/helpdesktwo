import mongoose, { Document, Schema } from "mongoose";

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
    logoLinkbackUrl?: string; // URL to navigate when logo is clicked
    colorTheme?: {
      primary?: string;
      secondary?: string;
      accent?: string;
      background?: string;
    };
    headerText?: string;
    browserTitle?: string;
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
    assetLinkButtons?: Array<{ label: string; url: string }>;
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
      resetPeriod?: "never" | "daily" | "monthly" | "yearly"; // When to reset counter
    };
    ticketAssignmentSettings?: {
      enabled: boolean;
      assignmentType:
        | "round-robin"
        | "load-balanced"
        | "manual"
        | "condition-based";
      assignToUsers?: mongoose.Types.ObjectId[]; // Pool of agents for auto-assignment
      assignToRoles?: string[]; // Roles eligible for assignment (e.g., 'Agent', 'Support')
      reassignOnEscalation?: boolean;
      notifyOnAssignment?: boolean;
      /** US-ESC-013: minutes of recent activity before auto-escalation is skipped (default 10) */
      autoEscalateGracePeriodMins?: number;
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
        keycloak?: {
          enabled: boolean;
          url?: string; // Keycloak base URL (overrides global KEYCLOAK_URL)
          realm?: string; // Realm name (overrides global KEYCLOAK_REALM)
          clientId?: string; // Client ID (overrides global KEYCLOAK_CLIENT_ID)
          clientSecret?: string; // Client secret — kept server-side only, never exposed
          userMatchField?: "email" | "mobile"; // How to find user in helpdesk DB (default: email)
        };
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
      themeMode?: "light" | "dark";
      themeColor?: string;
      customCSS?: string;
      customJS?: string;
    };
    ticketSubmissionSettings?: {
      mode?: "online" | "offline" | "both"; // How students can submit tickets
      enableOnlineForm?: boolean;
      enableOfflineCenter?: boolean;
      tableColumns?: string[]; // Configurable ticket table columns for /tickets/view
      filterableColumns?: string[]; // Columns that appear as filters on ticket list pages
      onlineFormFields?: Array<{
        id?: string;
        fieldName: string;
        fieldLabel: string;
        fieldType:
          | "text"
          | "email"
          | "phone"
          | "textarea"
          | "dropdown"
          | "file"
          | "number"
          | "date"
          | "url"
          | "multiselect"
          | "radio"
          | "checkbox";
        required: boolean;
        placeholder?: string;
        options?: string[];
        order?: number;
        allowedFileTypes?: string[];
        maxFileSizeMB?: number;
        allowMultiple?: boolean;
        isFixed?: boolean;
        /** Conditions controlling visibility of this field */
        conditions?: Array<{
          triggerField: string;
          operator: string;
          value: any;
        }>;
        conditionAction?: "show" | "hide";
        requiredMode?: "always" | "conditional" | "optional";
        requiredConditions?: Array<{
          triggerField: string;
          operator: string;
          value: any;
        }>;
        validation?: {
          minLength?: number;
          maxLength?: number;
          pattern?: string;
        };
        /** When true, this field is exposed via the Public API (/v1/tickets/form-schema and POST /v1/tickets) */
        includeInPublicApi?: boolean;
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
        features?: string[];
        mapLink?: string;
        googleMapLink?: string;
        contacts?: Array<{
          name: string;
          role: string;
          mobile: string;
          email: string;
        }>;
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
        fieldType:
          | "text"
          | "email"
          | "phone"
          | "number"
          | "textarea"
          | "dropdown"
          | "date";
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
        fieldType:
          | "text"
          | "textarea"
          | "dropdown"
          | "number"
          | "date"
          | "file"
          | "category";
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
      offlineTicketNumbering?: {
        prefix?: string;
        startingNumber?: number;
        separator?: string;
        includeYear?: boolean;
        includeMonth?: boolean;
        resetFrequency?: "never" | "yearly" | "monthly";
      };
      notificationSettings?: {
        notifyStudentOnRegistration?: boolean;
        notifyStudentOnTicketCreation?: boolean;
        sendWelcomeEmail?: boolean;
      };
    };
    whatsappWidget?: {
      enabled: boolean;
      visibility: "always" | "pre-login" | "post-login";
      roleVisibility?: "all" | "roles";
      visibleRoles?: string[];
      phoneNumber: string; // stored as digits only, e.g. '919876543210'
      predefinedMessage?: string;
      position: "bottom-right" | "bottom-left";
      iconSize: "small" | "medium" | "large";
    };
  };

  // Status and Metadata
  status: "active" | "inactive" | "suspended";
  isActive: boolean;
  users: number; // Count of users in this project
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;

  // Public API settings
  ticketSequence: number; // Atomic counter for ticket number generation
  publicApiSettings?: {
    estimatedResponseTime?: string; // e.g. "Within 4 hours"
    duplicateTicketWindowMinutes?: number; // default 5
    projectCode?: string; // Override code for ticket number prefix
    /** Custom fields the API consumer must/can submit when creating a ticket */
    customFields?: Array<{
      key: string; // machine-readable field key, e.g. "course_name"
      label: string; // human-readable label shown to the consumer
      type:
        | "text"
        | "number"
        | "email"
        | "phone"
        | "select"
        | "multiselect"
        | "date"
        | "boolean";
      required: boolean;
      options?: string[]; // for select / multiselect types
      maxLength?: number; // for text type
      placeholder?: string;
    }>;
  };
  // Dashboard: project-level total user headcount target
  userTarget?: {
    required?: number | null;
    requiredUpdatedBy?: mongoose.Types.ObjectId;
    requiredUpdatedAt?: Date;
  };
}

const projectSchema = new Schema<IProject>(
  {
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
      country: { type: String, default: "India" },
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
      logoLinkbackUrl: String, // URL to navigate when logo is clicked
      colorTheme: {
        primary: { type: String, default: "#f97316" },
        secondary: { type: String, default: "#1f2937" },
        accent: { type: String, default: "#3b82f6" },
        background: { type: String, default: "#ffffff" },
      },
      headerText: String,
      browserTitle: String,
      footerText: String,
      domainUrl: String,
      favicon: String,
      customUrlPath: {
        type: String,
        unique: true,
        sparse: true, // Allows null/undefined values while maintaining uniqueness for non-null values
        trim: true,
        lowercase: true,
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
      defaultLanguage: { type: String, default: "en" },
      timezone: { type: String, default: "Asia/Kolkata" },
      dateFormat: { type: String, default: "DD/MM/YYYY" },
      timeFormat: { type: String, default: "12h" },
      currency: { type: String, default: "INR" },
      firstDayOfWeek: { type: Number, default: 0 },
    },

    // Additional Configuration
    configuration: {
      maxUsers: { type: Number, default: 100 },
      maxStorage: { type: Number, default: 10 }, // GB
      allowedDomains: [String],
      customFields: [
        {
          name: String,
          type: String,
          required: Boolean,
          options: [String],
        },
      ],
      slaSettings: {
        enabled: { type: Boolean, default: false },
        defaultResponseTime: Number,
        defaultResolutionTime: Number,
      },
      ticketNumberSettings: {
        prefix: { type: String },
        format: { type: String },
        startingNumber: { type: Number },
        resetPeriod: {
          type: String,
          enum: ["never", "daily", "monthly", "yearly"],
        },
      },
      ticketAssignmentSettings: {
        enabled: { type: Boolean, default: false },
        assignmentType: {
          type: String,
          enum: ["round-robin", "load-balanced", "manual", "condition-based"],
          default: "manual",
        },
        assignToUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
        assignToRoles: [{ type: String }],
        reassignOnEscalation: { type: Boolean, default: false },
        notifyOnAssignment: { type: Boolean, default: true },
        autoEscalateGracePeriodMins: { type: Number, default: 10 },
        conditionRules: [
          {
            field: { type: String },
            operator: { type: String },
            categories: [{ type: String }],
            assignToAgents: [{ type: String }],
          },
        ],
        manualAssignmentPermissions: [
          {
            roleId: { type: String },
            canAssignToRoles: [{ type: String }],
          },
        ],
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
          keycloak: {
            enabled: { type: Boolean, default: false },
            url: { type: String },
            realm: { type: String },
            clientId: { type: String },
            clientSecret: { type: String, select: false }, // excluded from default queries
            userMatchField: {
              type: String,
              enum: ["email", "mobile"],
              default: "email",
            },
          },
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
      // Custom link buttons shown on this project's "My Assets" page.
      assetLinkButtons: [
        {
          label: { type: String },
          url: { type: String },
        },
      ],
      customizationSettings: {
        loginPageBackgroundImage: { type: String },
        themeMode: { type: String, enum: ["light", "dark"], default: "light" },
        themeColor: { type: String, default: "#444ce7" },
        customCSS: { type: String },
        customJS: { type: String },
      },
      // Footer Links for policy URLs
      footerLinks: {
        copyright: { type: String },
        termsOfUse: { type: String },
        privacyPolicy: { type: String },
        cookiePolicy: { type: String },
      },
      // Announcement Banner for login page
      announcementBanner: {
        message: { type: String },
        type: { type: String, enum: ["plain", "rich"], default: "plain" },
      },
      ticketSubmissionSettings: {
        mode: {
          type: String,
          enum: ["online", "offline", "both"],
          default: "both",
        },
        enableOnlineForm: { type: Boolean, default: true },
        enableOfflineCenter: { type: Boolean, default: true },
        tableColumns: [{ type: String }],
        onlineFormFields: [
          {
            id: { type: String },
            fieldName: { type: String },
            fieldLabel: { type: String },
            fieldType: {
              type: String,
              enum: [
                "text",
                "email",
                "phone",
                "textarea",
                "dropdown",
                "file",
                "number",
                "date",
                "url",
                "multiselect",
                "radio",
                "checkbox",
              ],
            },
            required: { type: Boolean, default: false },
            placeholder: { type: String },
            options: [{ type: String }],
            order: { type: Number },
            allowedFileTypes: [{ type: String }],
            maxFileSizeMB: { type: Number },
            allowMultiple: { type: Boolean },
            isFixed: { type: Boolean, default: false },
            conditions: [{ type: Schema.Types.Mixed }],
            conditionAction: {
              type: String,
              enum: ["show", "hide"],
              default: "show",
            },
            requiredMode: {
              type: String,
              enum: ["always", "conditional", "optional"],
              default: "optional",
            },
            requiredConditions: [{ type: Schema.Types.Mixed }],
            includeInPublicApi: { type: Boolean, default: false },
            validation: {
              minLength: { type: Number },
              maxLength: { type: Number },
              pattern: { type: String },
            },
            displayLabel: { type: String },
            _id: false, // Disable auto _id generation for subdocuments
          },
        ],
        offlineCenters: [
          {
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
            googleMapLink: { type: String },
            contacts: [
              {
                name: { type: String },
                role: { type: String },
                mobile: { type: String },
                email: { type: String },
              },
            ],
          },
        ],
        welcomeMessage: { type: String },
        successMessage: { type: String },
        announcement: { type: String },
        allowAttachments: { type: Boolean, default: true },
        maxAttachmentSize: { type: Number, default: 10 }, // 10 MB
        allowedFileTypes: [{ type: String }],
      },
      offlineModuleSettings: {
        registrationFields: [
          {
            id: { type: String },
            fieldName: { type: String },
            fieldType: {
              type: String,
              enum: [
                "text",
                "email",
                "phone",
                "number",
                "textarea",
                "dropdown",
                "date",
              ],
            },
            required: { type: Boolean, default: false },
            placeholder: { type: String },
            options: [{ type: String }],
            validation: {
              minLength: { type: Number },
              maxLength: { type: Number },
              pattern: { type: String },
            },
            isParentMobile: { type: Boolean, default: false },
            requireOtpVerification: { type: Boolean, default: false }, // For phone/email OTP verification
            order: { type: Number },
          },
        ],
        ticketFields: [
          {
            id: { type: String },
            fieldName: { type: String },
            fieldType: {
              type: String,
              enum: [
                "text",
                "textarea",
                "dropdown",
                "number",
                "date",
                "file",
                "category",
                "category-select",
                "phone",
                "email",
                "hierarchy-level-1",
                "hierarchy-level-2",
                "hierarchy-level-3",
                "hierarchy-level-4",
                "hierarchy-level-5",
                "hierarchy-level-6",
                "hierarchy-level-7",
                "hierarchy-level-8",
                "hierarchy-level-9",
                "hierarchy-level-10",
              ],
            },
            required: { type: Boolean, default: false },
            placeholder: { type: String },
            options: [{ type: String }],
            allowMultiple: { type: Boolean },
            maxFiles: { type: Number },
            allowedFileTypes: [{ type: String }],
            isFixed: { type: Boolean, default: false },
            isEnabled: { type: Boolean, default: true },
            order: { type: Number },
            hierarchyLevel: { type: Number }, // For hierarchy level fields (1-10)
            requireOtpVerification: { type: Boolean, default: false }, // For phone/email OTP verification
            validation: {
              minLength: { type: Number },
              maxLength: { type: Number },
              pattern: { type: String },
            },
            displayLabel: { type: String },
          },
        ],
        allowAgentToMarkResolved: { type: Boolean, default: true },
        allowAgentToEscalate: { type: Boolean, default: true },
        autoAssignToCreatingAgent: { type: Boolean, default: false },
        requireStudentVerification: { type: Boolean, default: false },
        offlineTicketNumbering: {
          prefix: { type: String, default: "OFF" },
          startingNumber: { type: Number, default: 1 },
          separator: { type: String, default: "-" },
          includeYear: { type: Boolean, default: true },
          includeMonth: { type: Boolean, default: false },
          resetFrequency: {
            type: String,
            enum: ["never", "yearly", "monthly"],
            default: "yearly",
          },
        },
        notificationSettings: {
          notifyStudentOnRegistration: { type: Boolean, default: true },
          notifyStudentOnTicketCreation: { type: Boolean, default: true },
          sendWelcomeEmail: { type: Boolean, default: true },
        },
      },
      whatsappWidget: {
        enabled: { type: Boolean, default: false },
        visibility: {
          type: String,
          enum: ["always", "pre-login", "post-login"],
          default: "always",
        },
        roleVisibility: {
          type: String,
          enum: ["all", "roles"],
          default: "all",
        },
        visibleRoles: {
          type: [String],
          default: [],
        },
        phoneNumber: { type: String, trim: true },
        predefinedMessage: { type: String, trim: true, default: "" },
        position: {
          type: String,
          enum: ["bottom-right", "bottom-left"],
          default: "bottom-right",
        },
        iconSize: {
          type: String,
          enum: ["small", "medium", "large"],
          default: "medium",
        },
      },
    },

    // Status and Metadata
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
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
      ref: "User",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    // Public API ticket sequence counter
    ticketSequence: {
      type: Number,
      default: 0,
    },
    // Public API configuration
    publicApiSettings: {
      estimatedResponseTime: { type: String, default: "Within 4 hours" },
      duplicateTicketWindowMinutes: { type: Number, default: 5 },
      projectCode: { type: String, trim: true, uppercase: true },
      customFields: [
        {
          key: { type: String, required: true, trim: true },
          label: { type: String, required: true, trim: true },
          type: {
            type: String,
            enum: [
              "text",
              "number",
              "email",
              "phone",
              "select",
              "multiselect",
              "date",
              "boolean",
            ],
            default: "text",
          },
          required: { type: Boolean, default: false },
          options: [{ type: String }],
          maxLength: { type: Number },
          placeholder: { type: String },
        },
      ],
    },
    // Dashboard: project-level total user headcount target
    userTarget: {
      required: { type: Number, default: null },
      requiredUpdatedBy: { type: Schema.Types.ObjectId, ref: "User" },
      requiredUpdatedAt: { type: Date },
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
projectSchema.index({ projectId: 1 });
projectSchema.index({ code: 1 });
projectSchema.index({ name: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ isActive: 1 });
projectSchema.index({ createdAt: -1 });

// Auto-generate projectId before saving
projectSchema.pre("save", async function (next) {
  if (this.isNew) {
    // Auto-generate projectId — use max existing number instead of count
    // (countDocuments breaks when projects have been deleted)
    if (!this.projectId) {
      const projects = await mongoose.models.Project.find(
        { projectId: /^P\d+$/ },
        { projectId: 1 },
      ).lean();

      let maxNum = 0;
      for (const p of projects as Array<{ projectId?: string }>) {
        const match = p.projectId?.match(/^P(\d+)$/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (n > maxNum) maxNum = n;
        }
      }
      this.projectId = `P${String(maxNum + 1).padStart(3, "0")}`;
    }

    // Auto-generate name from portal name if not provided
    if (!this.name && this.branding?.headerText) {
      this.name = this.branding.headerText;
    }

    // Auto-generate code from portal name if not provided
    if (!this.code && this.branding?.headerText) {
      this.code = this.branding.headerText
        .replace(/\s+/g, "")
        .toUpperCase()
        .substring(0, 10);
    }
  }
  next();
});

export const Project = mongoose.model<IProject>("Project", projectSchema);
