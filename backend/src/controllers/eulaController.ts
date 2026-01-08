import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { EulaAcceptance } from '../models/EulaAcceptance';

// @desc    Get latest EULA
// @route   GET /api/auth/eula/latest
// @access  Public
export const getLatestEula = async (req: AuthRequest, res: Response) => {
  try {
    // For now, return a static EULA text
    // In production, this should fetch from a database
    res.json({
      success: true,
      data: {
        version: '1.0',
        text: 'End User License Agreement (EULA) - This is a placeholder EULA text.',
        effectiveDate: new Date('2024-01-01'),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch EULA',
    });
  }
};

// @desc    Check if user has accepted EULA
// @route   GET /api/auth/eula/check
// @access  Private
export const hasAcceptedEula = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    const acceptance = await EulaAcceptance.findOne({ userId }).sort({ acceptedAt: -1 });

    res.json({
      success: true,
      data: {
        hasAccepted: !!acceptance,
        version: acceptance?.version,
        acceptedAt: acceptance?.acceptedAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check EULA acceptance',
    });
  }
};

// @desc    Accept EULA
// @route   POST /api/auth/eula/accept
// @access  Private
export const acceptEula = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    const { version } = req.body;

    const acceptance = await EulaAcceptance.create({
      userId,
      version: version || '1.0',
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: acceptance,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to accept EULA',
    });
  }
};
