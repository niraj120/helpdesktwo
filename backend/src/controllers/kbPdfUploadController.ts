import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { GCSService } from '../services/gcsService';

// Configure multer to use memory storage for GCS upload
const storage = multer.memoryStorage();

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
 * @desc    Upload PDF file for KB article (to GCS)
 * @access  Private (KB_CREATE or KB_EDIT permission)
 */
export const uploadKBPdf = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { projectId, projectCode } = req.body;

    if (!file) {
      return res.status(400).json({ 
        success: false,
        message: 'No file uploaded' 
      });
    }

    if (!projectId) {
      return res.status(400).json({ 
        success: false,
        message: 'Project ID is required' 
      });
    }

    if (!projectCode) {
      return res.status(400).json({ 
        success: false,
        message: 'Project code is required' 
      });
    }

    // Upload to GCS
    const uploadResult = await GCSService.uploadPDF(file, projectCode);

    // Return file information
    return res.status(200).json({
      success: true,
      message: 'PDF uploaded successfully to cloud storage',
      data: {
        fileName: file.originalname,
        fileUrl: uploadResult.url,
        storedFileName: uploadResult.filename,
        fileSize: uploadResult.size,
        mimeType: file.mimetype
      }
    });
  } catch (error: any) {
    console.error('Error uploading KB PDF:', error);
    
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload PDF'
    });
  }
};

/**
 * @route   DELETE /api/upload/kb-pdf/:filename
 * @desc    Delete KB PDF file from GCS
 * @access  Private (KB_DELETE permission)
 */
export const deleteKBPdf = async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;

    if (!filename) {
      return res.status(400).json({
        success: false,
        message: 'Filename is required'
      });
    }

    // Delete from GCS
    await GCSService.deletePDF(filename);

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
