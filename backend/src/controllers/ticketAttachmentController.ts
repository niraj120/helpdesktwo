import { Request, Response } from 'express';
import { Ticket } from '../models/Ticket';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const unlinkAsync = promisify(fs.unlink);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/attachments');
    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip', 'application/x-rar-compressed',
      'text/plain', 'text/csv'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDFs, documents, spreadsheets, and archives are allowed.'));
    }
  }
});

export const uploadMiddleware = upload.single('file');

/**
 * @route   POST /api/tickets/:id/attachments
 * @desc    Upload attachment to ticket
 * @access  Private (TICKET_ADD_ATTACHMENT)
 */
export const uploadAttachment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const file = req.file;
    const userId = (req as any).user?.id;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      // Delete uploaded file if ticket not found
      await unlinkAsync(file.path);
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const attachment = {
      filename: file.originalname,
      fileUrl: `/uploads/attachments/${file.filename}`,
      fileSize: file.size,
      mimeType: file.mimetype,
      uploadedBy: userId,
      uploadedAt: new Date()
    };

    ticket.attachments = ticket.attachments || [];
    ticket.attachments.push(attachment as any);
    await ticket.save();

    res.status(201).json({
      message: 'Attachment uploaded successfully',
      attachment
    });
    return;
  } catch (error: any) {
    console.error('Upload attachment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
    return;
  }
};

/**
 * @route   GET /api/tickets/:id/attachments/:attachmentId/download
 * @desc    Download attachment
 * @access  Private (TICKET_VIEW_ALL or TICKET_VIEW_OWN)
 */
export const downloadAttachment = async (req: Request, res: Response) => {
  try {
    const { id, attachmentId } = req.params;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const attachment = ticket.attachments?.find((att: any) => att._id.toString() === attachmentId);
    if (!attachment) {
      return res.status(404).json({ message: 'Attachment not found' });
    }

    // SECURITY: Sanitize file URL to prevent path traversal attacks
    const sanitizedFileUrl = (attachment as any).fileUrl.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
    const filePath = path.join(__dirname, '../..', sanitizedFileUrl);
    
    // SECURITY: Ensure file path is within uploads directory
    const uploadsDir = path.resolve(__dirname, '../../uploads');
    const resolvedPath = path.resolve(filePath);
    
    if (!resolvedPath.startsWith(uploadsDir)) {
      console.error(`🚨 Path traversal attempt detected: ${(attachment as any).fileUrl}`);
      return res.status(403).json({ message: 'Access denied' });
    }
    
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: 'File not found on server' });
    }

    res.download(resolvedPath, (attachment as any).filename);
    return;
  } catch (error: any) {
    console.error('Download attachment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
    return;
  }
};

/**
 * @route   DELETE /api/tickets/:id/attachments/:attachmentId
 * @desc    Delete attachment from ticket
 * @access  Private (TICKET_DELETE_ATTACHMENT)
 */
export const deleteAttachment = async (req: Request, res: Response) => {
  try {
    const { id, attachmentId } = req.params;

    const ticket = await Ticket.findById(id);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const attachment = ticket.attachments?.find((att: any) => att._id.toString() === attachmentId);
    if (!attachment) {
      return res.status(404).json({ message: 'Attachment not found' });
    }

    // Delete file from filesystem
    const filePath = path.join(__dirname, '../..', (attachment as any).fileUrl);
    if (fs.existsSync(filePath)) {
      await unlinkAsync(filePath);
    }

    // Remove attachment from ticket
    ticket.attachments = ticket.attachments?.filter((att: any) => att._id.toString() !== attachmentId);
    await ticket.save();

    res.json({ message: 'Attachment deleted successfully' });
    return;
  } catch (error: any) {
    console.error('Delete attachment error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
    return;
  }
};
