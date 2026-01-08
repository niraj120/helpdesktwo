import mongoose, { Schema, Document } from 'mongoose';

export interface IFormField {
	name: string;
	label: string;
	type: string;
	required: boolean;
	options?: any[];
	defaultValue?: any;
	validation?: Record<string, any>;
	conditionalLogic?: Record<string, any>;
	constraints?: Record<string, any>;
	calculated?: boolean;
	mapping?: Record<string, any>;
}

export interface IFormVersion {
	version: number;
	fields: IFormField[];
	createdAt: Date;
	createdBy: mongoose.Types.ObjectId;
	migrationPolicy?: string;
}

export interface IForm extends Document {
	name: string;
	description?: string;
	context: string[];
	versions: IFormVersion[];
	activeVersion: number;
	auditTrail: any[];
	createdAt: Date;
	updatedAt: Date;
}

const FormFieldSchema = new Schema<IFormField>({
	name: { type: String, required: true },
	label: { type: String, required: true },
	type: { type: String, required: true },
	required: { type: Boolean, default: false },
	options: [Schema.Types.Mixed],
	defaultValue: { type: Schema.Types.Mixed },
	validation: { type: Schema.Types.Mixed },
	conditionalLogic: { type: Schema.Types.Mixed },
	constraints: { type: Schema.Types.Mixed },
	calculated: { type: Boolean },
	mapping: { type: Schema.Types.Mixed },
});

const FormVersionSchema = new Schema<IFormVersion>({
	version: { type: Number, required: true },
	fields: { type: [FormFieldSchema], required: true },
	createdAt: { type: Date, default: Date.now },
	createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
	migrationPolicy: { type: String },
});

const FormSchema = new Schema<IForm>({
	name: { type: String, required: true },
	description: { type: String },
	context: { type: [String], default: [] },
	versions: { type: [FormVersionSchema], required: true },
	activeVersion: { type: Number, required: true },
		auditTrail: { type: [Object], default: [] },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model<IForm>('Form', FormSchema);
