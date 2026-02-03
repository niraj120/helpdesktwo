import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || 'default-32-char-encryption-key!!'; // Must be 32 chars
const ALGORITHM = 'aes-256-cbc';

export interface IProjectEmailConfig extends Document {
  projectId: mongoose.Types.ObjectId;
  emailAddress: string;
  isEnabled: boolean;
  imapHost: string;
  imapPort: number;
  imapUsername: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  lastCheckedAt?: Date;
  lastCheckStatus?: 'success' | 'failed';
  lastCheckError?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Method to decrypt passwords
  getDecryptedImapPassword(): string;
  getDecryptedSmtpPassword(): string;
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
      required: true,
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
      required: true,
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

// Pre-save hook to encrypt passwords
ProjectEmailConfigSchema.pre('save', function(next) {
  if (this.isModified('imapPassword') && !this.imapPassword.includes(':')) {
    this.imapPassword = encrypt(this.imapPassword);
  }
  if (this.isModified('smtpPassword') && !this.smtpPassword.includes(':')) {
    this.smtpPassword = encrypt(this.smtpPassword);
  }
  next();
});

// Instance methods to decrypt passwords
ProjectEmailConfigSchema.methods.getDecryptedImapPassword = function(): string {
  return decrypt(this.imapPassword);
};

ProjectEmailConfigSchema.methods.getDecryptedSmtpPassword = function(): string {
  return decrypt(this.smtpPassword);
};

// Static method to find by project
ProjectEmailConfigSchema.statics.findByProject = async function(projectId: string) {
  return this.find({ projectId, isEnabled: true }).exec();
};

const ProjectEmailConfig = mongoose.model<IProjectEmailConfig>(
  'ProjectEmailConfig',
  ProjectEmailConfigSchema
);

export default ProjectEmailConfig;
