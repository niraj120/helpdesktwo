import mongoose, { Document, Schema } from 'mongoose';

export interface IRole extends Document {
  name: string;
  code: string;
  description?: string;
  type: 'system' | 'custom';
  projectId?: mongoose.Types.ObjectId; // Deprecated: kept for backward compatibility
  projects?: mongoose.Types.ObjectId[]; // New: Multiple project mapping
  permissions: mongoose.Types.ObjectId[];
  agentCount: number;
  isActive: boolean;
  isMaster: boolean; // Can be used as template for creating new roles
  masterRoleId?: mongoose.Types.ObjectId; // Reference to master role if cloned from one
  isAgent: boolean; // Flag to identify roles that are agents for auto-assignment
  isSystem: boolean; // Virtual property
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['system', 'custom'],
      default: 'custom',
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: false,
    },
    projects: [{
      type: Schema.Types.ObjectId,
      ref: 'Project',
    }],
    permissions: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Permission',
      },
    ],
    agentCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isMaster: {
      type: Boolean,
      default: false,
    },
    masterRoleId: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      required: false,
    },
    isAgent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
roleSchema.index({ code: 1, projectId: 1 }, { unique: true, sparse: true }); // Backward compatibility
roleSchema.index({ code: 1 }); // For system roles
roleSchema.index({ projects: 1 }); // For multi-project queries
roleSchema.index({ type: 1 });

// Virtual property for backward compatibility
roleSchema.virtual('isSystem').get(function() {
  return this.type === 'system';
});

export const Role = mongoose.model<IRole>('Role', roleSchema);
