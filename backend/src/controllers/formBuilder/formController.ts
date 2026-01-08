import { Request, Response } from 'express';
import Form from '../../models/formBuilder/Form';
import FormAuditLog from '../../models/formBuilder/FormAuditLog';
import mongoose from 'mongoose';

export const createForm = async (req: any, res: Response) => {
	try {
		const { name, description, context, fields } = req.body;
		const form = await Form.create({
			name,
			description,
			context,
			versions: [{ version: 1, fields, createdBy: req.user?._id, createdAt: new Date() }],
			activeVersion: 1,
			auditTrail: [],
		});
		await FormAuditLog.create({
			formId: form._id,
			action: 'create',
			performedBy: req.user?._id,
			details: { name, description, context, fields },
		});
		res.status(201).json(form);
	} catch (error) {
		res.status(500).json({ error: 'Failed to create form', details: error });
	}
};

export const getForms = async (req: Request, res: Response) => {
	try {
		const forms = await Form.find();
		res.json(forms);
	} catch (error) {
		res.status(500).json({ error: 'Failed to fetch forms', details: error });
	}
};

export const getFormById = async (req: Request, res: Response) => {
	try {
		const form = await Form.findById(req.params.id);
		if (!form) return res.status(404).json({ error: 'Form not found' });
		return res.json(form);
	} catch (error) {
		return res.status(500).json({ error: 'Failed to fetch form', details: error });
	}
};

export const updateForm = async (req: any, res: Response) => {
	try {
		const { name, description, context, fields, migrationPolicy } = req.body;
		const form = await Form.findById(req.params.id);
		if (!form) return res.status(404).json({ error: 'Form not found' });
		// Add new version
		const newVersion = {
			version: form.versions.length + 1,
			fields,
			createdBy: req.user?._id,
			createdAt: new Date(),
			migrationPolicy,
		};
		form.versions.push(newVersion);
		form.activeVersion = newVersion.version;
		if (name) form.name = name;
		if (description) form.description = description;
		if (context) form.context = context;
		await form.save();
		await FormAuditLog.create({
			formId: form._id,
			action: 'update',
			performedBy: req.user?._id,
			details: { name, description, context, fields, migrationPolicy },
		});
		return res.json(form);
	} catch (error) {
		return res.status(500).json({ error: 'Failed to update form', details: error });
	}
};

export const deleteForm = async (req: any, res: Response) => {
	try {
		const form = await Form.findByIdAndDelete(req.params.id);
		if (!form) return res.status(404).json({ error: 'Form not found' });
		await FormAuditLog.create({
			formId: form._id,
			action: 'delete',
			performedBy: req.user?._id,
			details: {},
		});
		return res.json({ message: 'Form deleted' });
	} catch (error) {
		return res.status(500).json({ error: 'Failed to delete form', details: error });
	}
};

export const getFormAuditLogs = async (req: Request, res: Response) => {
	try {
		const logs = await FormAuditLog.find({ formId: req.params.id });
		res.json(logs);
	} catch (error) {
		res.status(500).json({ error: 'Failed to fetch audit logs', details: error });
	}
};
