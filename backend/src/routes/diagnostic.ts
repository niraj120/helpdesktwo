import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import fs from 'fs';
import path from 'path';

const router = express.Router();

/**
 * Diagnostic endpoint to check what files exist on the server
 * Only accessible by authenticated SUPER_ADMIN users
 */
router.get('/check-deployment', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    // Check if user is super admin
    if (req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Only super admins can access diagnostics',
      });
    }

    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      nodeEnv: process.env.NODE_ENV,
      platform: process.platform,
      cwd: process.cwd(),
      files: {},
    };

    // Check if centers route files exist
    const filesToCheck = [
      'dist/routes/centers.js',
      'dist/controllers/centerController.js',
      'dist/models/Center.js',
      'src/routes/centers.ts',
      'src/controllers/centerController.ts',
      'src/models/Center.ts',
    ];

    filesToCheck.forEach(file => {
      const fullPath = path.join(process.cwd(), file);
      try {
        const stats = fs.statSync(fullPath);
        diagnostics.files[file] = {
          exists: true,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        };
      } catch (error) {
        diagnostics.files[file] = {
          exists: false,
          error: 'File not found',
        };
      }
    });

    // Check git status
    try {
      const { execSync } = require('child_process');
      const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: process.cwd() }).toString().trim();
      const gitCommit = execSync('git rev-parse --short HEAD', { cwd: process.cwd() }).toString().trim();
      const gitCommitFull = execSync('git rev-parse HEAD', { cwd: process.cwd() }).toString().trim();
      
      diagnostics.git = {
        branch: gitBranch,
        commit: gitCommit,
        commitFull: gitCommitFull,
      };
    } catch (error) {
      diagnostics.git = {
        error: 'Unable to get git info',
      };
    }

    // Check if centers route is registered
    try {
      const serverPath = path.join(process.cwd(), 'dist/server.js');
      const serverContent = fs.readFileSync(serverPath, 'utf-8');
      diagnostics.serverCheck = {
        hasCentersImport: serverContent.includes("require('./routes/centers')"),
        hasCentersRoute: serverContent.includes("/api/centers"),
        fileSize: serverContent.length,
      };
    } catch (error) {
      diagnostics.serverCheck = {
        error: 'Unable to read server.js',
      };
    }

    return res.json({
      success: true,
      data: diagnostics,
    });
  } catch (error) {
    console.error('Diagnostic error:', error);
    return res.status(500).json({
      success: false,
      message: 'Diagnostic failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Test the centers endpoint directly to see the actual error
 */
router.get('/test-centers', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Only super admins can access diagnostics',
      });
    }

    const testResult: any = {
      timestamp: new Date().toISOString(),
      tests: {},
    };

    // Test 1: Can we import Center model?
    try {
      const { Center } = require('../models/Center');
      testResult.tests.centerModelImport = {
        success: true,
        modelName: Center.modelName,
        collection: Center.collection.name,
      };

      // Test 2: Can we query centers?
      try {
        const projectId = req.query.projectId || '693bd61817834e29eb111ec2';
        const centers = await Center.find({ projectId, isActive: true });
        testResult.tests.centersQuery = {
          success: true,
          count: centers.length,
          sampleIds: centers.slice(0, 3).map((c: any) => c._id),
        };

        // Test 3: Can we populate?
        try {
          const centersWithPopulate = await Center.find({ projectId, isActive: true })
            .populate('projectId', 'name')
            .limit(1);
          testResult.tests.centersPopulate = {
            success: true,
            sampleData: centersWithPopulate[0] || null,
          };
        } catch (populateError: any) {
          testResult.tests.centersPopulate = {
            success: false,
            error: populateError.message,
            stack: populateError.stack,
          };
        }
      } catch (queryError: any) {
        testResult.tests.centersQuery = {
          success: false,
          error: queryError.message,
          stack: queryError.stack,
        };
      }
    } catch (importError: any) {
      testResult.tests.centerModelImport = {
        success: false,
        error: importError.message,
        stack: importError.stack,
      };
    }

    return res.json({
      success: true,
      data: testResult,
    });
  } catch (error: any) {
    console.error('Test centers error:', error);
    return res.status(500).json({
      success: false,
      message: 'Test failed',
      error: error.message,
      stack: error.stack,
    });
  }
});

export default router;
