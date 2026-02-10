import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || 'default-32-char-encryption-key!!'; // Must be 32 chars
const ALGORITHM = 'aes-256-cbc';

// Email provider types
export type EmailProvider = 'google' | 'microsoft' | 'other';
export type AuthMethod = 'basic' | 'oauth2' | 'app_password';

export interface IProjectEmailConfig extends Document {
  projectId: mongoose.Types.ObjectId;
  emailAddress: string;
  isEnabled: boolean;
  
  // Provider and auth method
  provider: EmailProvider;
  authMethod: AuthMethod;
  
  // IMAP settings
  imapHost: string;
  imapPort: number;
  imapUsername: string;
  imapPassword: string;
  
  // SMTP settings
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  
  // OAuth2 settings (for Google and Microsoft)
  oauth2?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    accessToken?: string;
    tokenExpiry?: Date;
    scope?: string;
  };
  
  lastCheckedAt?: Date;
  lastCheckStatus?: 'success' | 'failed';
  lastCheckError?: string;
  // Task 8.2: Connection monitoring fields
  lastConnectionTest?: Date;
  connectionStatus?: 'connected' | 'error' | 'untested';
  lastSuccessfulConnection?: Date;
  failedAttempts?: number;
  nextRetryAt?: Date;
  lastConnectionError?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Method to decrypt passwords
  getDecryptedImapPassword(): string;
  getDecryptedSmtpPassword(): string;
  getDecryptedOAuth2ClientSecret(): string;
  getDecryptedOAuth2RefreshToken(): string;
  getDecryptedOAuth2AccessToken(): string;
}

const ProjectEmailConfigSchema: Schema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    emailAddress: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      index: true,
    },
    isEnabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    // Provider and auth method
    provider: {
      type: String,
      enum: ['google', 'microsoft', 'other'],
      default: 'other',
    },
    authMethod: {
      type: String,
      enum: ['basic', 'oauth2', 'app_password'],
      default: 'basic',
    },
    imapHost: {
      type: String,
      required: true,
      trim: true,
    },
    imapPort: {
      type: Number,
      required: true,
      min: 1,
      max: 65535,
    },
    imapUsername: {
      type: String,
      required: true,
      trim: true,
    },
    imapPassword: {
      type: String,
      required: function(this: any) {
        return this.authMethod !== 'oauth2';
      },
    },
    smtpHost: {
      type: String,
      required: true,
      trim: true,
    },
    smtpPort: {
      type: Number,
      required: true,
      min: 1,
      max: 65535,
    },
    smtpUsername: {
      type: String,
      required: true,
      trim: true,
    },
    smtpPassword: {
      type: String,
      required: function(this: any) {
        return this.authMethod !== 'oauth2';
      },
    },
    // OAuth2 settings
    oauth2: {
      clientId: { type: String },
      clientSecret: { type: String },
      refreshToken: { type: String },
      accessToken: { type: String },
      tokenExpiry: { type: Date },
      scope: { type: String },
    },
    lastCheckedAt: {
      type: Date,
    },
    lastCheckStatus: {
      type: String,
      enum: ['success', 'failed'],
    },
    lastCheckError: {
      type: String,
    },
    // Task 8.2: Connection monitoring fields
    lastConnectionTest: {
      type: Date,
    },
    connectionStatus: {
      type: String,
      enum: ['connected', 'error', 'untested'],
      default: 'untested',
    },
    lastSuccessfulConnection: {
      type: Date,
    },
    failedAttempts: {
      type: Number,
      default: 0,
    },
    nextRetryAt: {
      type: Date,
    },
    lastConnectionError: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index - one email per project
ProjectEmailConfigSchema.index({ projectId: 1, emailAddress: 1 }, { unique: true });

// Encryption helper functions
function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32));
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32));
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Pre-save hook to encrypt passwords and OAuth2 tokens
ProjectEmailConfigSchema.pre('save', function(next) {
  if (this.isModified('imapPassword') && this.imapPassword && !this.imapPassword.includes(':')) {
    this.imapPassword = encrypt(this.imapPassword);
  }
  if (this.isModified('smtpPassword') && this.smtpPassword && !this.smtpPassword.includes(':')) {
    this.smtpPassword = encrypt(this.smtpPassword);
  }
  // Encrypt OAuth2 tokens
  if (this.oauth2) {
    if (this.isModified('oauth2.clientSecret') && this.oauth2.clientSecret && !this.oauth2.clientSecret.includes(':')) {
      this.oauth2.clientSecret = encrypt(this.oauth2.clientSecret);
    }
    if (this.isModified('oauth2.refreshToken') && this.oauth2.refreshToken && !this.oauth2.refreshToken.includes(':')) {
      this.oauth2.refreshToken = encrypt(this.oauth2.refreshToken);
    }
    if (this.isModified('oauth2.accessToken') && this.oauth2.accessToken && !this.oauth2.accessToken.includes(':')) {
      this.oauth2.accessToken = encrypt(this.oauth2.accessToken);
    }
  }
  next();
});

// Instance methods to decrypt passwords
ProjectEmailConfigSchema.methods.getDecryptedImapPassword = function(): string {
  if (!this.imapPassword) return '';
  try {
    return decrypt(this.imapPassword);
  } catch {
    return this.imapPassword;
  }
};

ProjectEmailConfigSchema.methods.getDecryptedSmtpPassword = function(): string {
  if (!this.smtpPassword) return '';
  try {
    return decrypt(this.smtpPassword);
  } catch {
    return this.smtpPassword;
  }
};

ProjectEmailConfigSchema.methods.getDecryptedOAuth2ClientSecret = function(): string {
  if (!this.oauth2?.clientSecret) return '';
  try {
    return decrypt(this.oauth2.clientSecret);
  } catch {
    return this.oauth2.clientSecret;
  }
};

ProjectEmailConfigSchema.methods.getDecryptedOAuth2RefreshToken = function(): string {
  if (!this.oauth2?.refreshToken) return '';
  try {
    return decrypt(this.oauth2.refreshToken);
  } catch {
    return this.oauth2.refreshToken;
  }
};

ProjectEmailConfigSchema.methods.getDecryptedOAuth2AccessToken = function(): string {
  if (!this.oauth2?.accessToken) return '';
  try {
    return decrypt(this.oauth2.accessToken);
  } catch {
    return this.oauth2.accessToken;
  }
};

// Static method to find by project
ProjectEmailConfigSchema.statics.findByProject = async function(projectId: string) {
  return this.find({ projectId, isEnabled: true }).exec();
};

// Helper function to detect email provider from email address
export function detectEmailProvider(email: string): EmailProvider {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return 'other';
  
  if (domain.includes('gmail.com') || domain.includes('googlemail.com')) {
    return 'google';
  }
  if (domain.includes('outlook.com') || domain.includes('hotmail.com') || 
      domain.includes('live.com') || domain.includes('microsoft.com') ||
      domain.includes('office365.com')) {
    return 'microsoft';
  }
  return 'other';
}

// Helper function to detect provider from IMAP/SMTP host (for custom domains)
export function detectProviderFromHost(imapHost?: string, smtpHost?: string): EmailProvider {
  const hosts = [imapHost?.toLowerCase(), smtpHost?.toLowerCase()].filter(Boolean);
  
  for (const host of hosts) {
    // Google hosts
    if (host?.includes('gmail.com') || host?.includes('google.com') || host?.includes('googlemail.com')) {
      return 'google';
    }
    // Microsoft 365 / Office 365 hosts
    if (host?.includes('outlook.office365.com') || host?.includes('office365.com') ||
        host?.includes('outlook.com') || host?.includes('microsoft.com')) {
      return 'microsoft';
    }
  }
  return 'other';
}

// Helper function to get default IMAP/SMTP settings for a provider
export function getProviderDefaults(provider: EmailProvider): {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
} {
  switch (provider) {
    case 'google':
      return {
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
      };
    case 'microsoft':
      return {
        imapHost: 'outlook.office365.com',
        imapPort: 993,
        smtpHost: 'smtp.office365.com',
        smtpPort: 587,
      };
    default:
      return {
        imapHost: '',
        imapPort: 993,
        smtpHost: '',
        smtpPort: 587,
      };
  }
}

const ProjectEmailConfig = mongoose.model<IProjectEmailConfig>(
  'ProjectEmailConfig',
  ProjectEmailConfigSchema
);

export default ProjectEmailConfig;
