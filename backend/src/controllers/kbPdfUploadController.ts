import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/kb-pdfs');
    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Sanitize filename - remove special characters
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitizedName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for PDFs
  fileFilter: (req, file, cb) => {
    // Only allow PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

export const uploadPdfMiddleware = upload.single('file');

/**
 * @route   POST /api/upload/kb-pdf
 * @desc    Upload PDF file for KB article
 * @access  Private (KB_CREATE or KB_EDIT permission)
 */
export const uploadKBPdf = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { projectId } = req.body;

    if (!file) {
      return res.status(400).json({ 
        success: false,
        message: 'No file uploaded' 
      });
    }

    if (!projectId) {
      // Delete uploaded file if projectId not provided
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      return res.status(400).json({ 
        success: false,
        message: 'Project ID is required' 
      });
    }

    // Return file information
    return res.status(200).json({
      success: true,
      message: 'PDF uploaded successfully',
      data: {
        fileName: file.originalname,
        fileUrl: `/uploads/kb-pdfs/${file.filename}`,
        fileSize: file.size,
        mimeType: file.mimetype
      }
    });
  } catch (error: any) {
    console.error('Error uploading KB PDF:', error);
    
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload PDF'
    });
  }
};

/**
 * @route   DELETE /api/upload/kb-pdf/:filename
 * @desc    Delete KB PDF file
 * @access  Private (KB_DELETE permission)
 */
export const deleteKBPdf = async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../../uploads/kb-pdfs', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Delete the file
    fs.unlinkSync(filePath);

    return res.status(200).json({
      success: true,
      message: 'PDF deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting KB PDF:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete PDF'
    });
  }
};
