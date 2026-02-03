import mongoose, { Schema, Document } from 'mongoose';

export interface IKBTableColumn {
  columnName: string;
  columnType: 'text' | 'number' | 'date' | 'url' | 'file';
  isRequired: boolean;
  order: number;
  articleFieldMapping?: string[]; // Maps to article fields like ['pdfUrl', 'externalUrl'], shows first available
}

export interface IKBTableRow {
  _id?: string;
  rowData: { [key: string]: any };
  order: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IKBTable extends Document {
  tableName: string;
  description?: string;
  projectId: mongoose.Types.ObjectId;
  levelIds?: mongoose.Types.ObjectId[]; // Changed from levelId to levelIds array
  dataSource: 'manual' | 'articles'; // 'manual' for user-entered data, 'articles' for auto-populated from KB articles
  autoPopulateFromArticles: boolean;
  displayStyle: 'table' | 'tiles'; // 'table' for traditional table view, 'tiles' for card/tile view
  columns: IKBTableColumn[];
  rows: IKBTableRow[];
  status: 'active' | 'inactive';
  showSerialNumber: boolean;
  isSearchable: boolean;
  isPaginated: boolean;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TableColumnSchema = new Schema({
  columnName: {
    type: String,
    required: true,
    trim: true,
  },
  columnType: {
    type: String,
    enum: ['text', 'number', 'date', 'url', 'file'],
    default: 'text',
  },
  isRequired: {
    type: Boolean,
    default: false,
  },
  order: {
    type: Number,
    required: true,
  },
  articleFieldMapping: {
    type: [String],
    default: [],
  },
});

const TableRowSchema = new Schema({
  rowData: {
    type: Map,
    of: Schema.Types.Mixed,
    required: true,
  },
  order: {
    type: Number,
    required: true,
  },
}, { timestamps: true });

const KBTableSchema = new Schema(
  {
    tableName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    levelIds: {
      type: [Schema.Types.ObjectId],
      ref: 'KBLevel',
      default: [],
      index: true,
    },
    dataSource: {
      type: String,
      enum: ['manual', 'articles'],
      default: 'manual',
    },
    autoPopulateFromArticles: {
      type: Boolean,
      default: false,
    },
    displayStyle: {
      type: String,
      enum: ['table', 'tiles'],
      default: 'table',
    },
    columns: [TableColumnSchema],
    rows: [TableRowSchema],
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    showSerialNumber: {
      type: Boolean,
      default: true,
    },
    isSearchable: {
      type: Boolean,
      default: true,
    },
    isPaginated: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for query optimization
KBTableSchema.index({ projectId: 1, status: 1, createdAt: -1 }); // Compound index for common queries
KBTableSchema.index({ levelIds: 1 }); // Array field index for filtering
KBTableSchema.index({ tableName: 'text' }); // Text search
KBTableSchema.index({ createdAt: -1 }); // Sorting index

export default mongoose.model<IKBTable>('KBTable', KBTableSchema);
