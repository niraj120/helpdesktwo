import { Request, Response } from 'express';
import SMSConfig from '../models/SMSConfig';
import { sendGupshupSMS, sendTriggerSMS } from '../utils/smsService';

/**
 * Get SMS Configuration
 */
export const getSMSConfig = async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;

        let config = await SMSConfig.findOne({ projectId });

        if (!config) {
            config = await SMSConfig.create({ projectId });
        }

        const configData = config.toObject();

        // Mask password
        if (configData.password) {
            configData.password = '********';
        }

        return res.status(200).json({
            success: true,
            data: configData
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to fetch SMS config' });
    }
};

/**
 * Update SMS Settings (Credentials & Master Toggle)
 */
export const updateSMSSettings = async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const { userId, password, enabled } = req.body;

        const updates: any = {};

        if (userId !== undefined) updates.userId = userId;
        if (enabled !== undefined) updates.enabled = enabled;

        // Only update password if it's not masked
        if (password && password !== '********') {
            updates.password = password;
        }

        const config = await SMSConfig.findOneAndUpdate(
            { projectId },
            { $set: updates },
            { new: true, upsert: true }
        );

        return res.status(200).json({ success: true, message: 'SMS settings updated successfully' });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to update SMS settings' });
    }
};

/**
 * Update Specific SMS Trigger
 */
export const updateSMSTrigger = async (req: Request, res: Response) => {
    try {
        const { projectId, triggerName } = req.params;
        const updates = req.body; // { enabled, template, recipients... }

        const triggerUpdates: Record<string, any> = {};
        for (const [key, value] of Object.entries(updates)) {
            triggerUpdates[`triggers.${triggerName}.${key}`] = value;
        }

        await SMSConfig.findOneAndUpdate(
            { projectId },
            { $set: triggerUpdates },
            { upsert: true }
        );

        return res.status(200).json({ success: true, message: 'SMS trigger updated' });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to update SMS trigger' });


    }
};

/**
 * Test SMS Trigger
 */
export const testSMSTrigger = async (req: Request, res: Response) => {
    try {
        const { projectId, triggerName } = req.params;
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ success: false, error: 'Phone number is required' });
        }

        const config = await SMSConfig.findOne({ projectId });
        if (!config) {
            return res.status(404).json({ success: false, error: 'SMS config not found' });
        }

        // Mock data for testing based on trigger type
        let mockData: Record<string, string> = {
            otp: '123456',
            studentName: 'Test Student',
            ticketId: '#T-12345',
            status: 'Resolved'
        };

        // We use the existing sendTriggerSMS but strictly for testing purposes
        // We might want to bypass some checks or just use it directly. 
        // Using sendTriggerSMS ensures we test the actual logic (template replacement etc).
        // However, we need to ensure we don't block it if "enabled" is false? 
        // The user usually wants to test even if disabled? 
        // For now, let's assume valid config is needed.

        // Actually, if we use sendTriggerSMS it checks for enabled. 
        // Let's use sendGupshupSMS directly after manual template replacement to allow testing even if disabled?
        // Or better, bypass the enabled check logic by temporarily mocking or just creating the message manually.

        // Let's do manual message construction to allow testing even if triggers are disabled.
        const triggers = config.triggers as any;
        const trigger = triggers[triggerName];

        if (!trigger) {
            return res.status(404).json({ success: false, error: 'Trigger not found' });
        }

        // Simple template replacement
        let message = trigger.template;
        message = message.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => mockData[key] || `{{${key}}}`);

        const result = await sendGupshupSMS(phone, message, config);

        if (result.success) {
            return res.status(200).json({ success: true, message: 'Test SMS sent successfully', responseId: result.responseId });
        } else {
            return res.status(400).json({ success: false, error: result.error || 'Failed to send test SMS' });
        }

    } catch (error) {
        console.error('Test SMS error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error during test' });
    }
};
