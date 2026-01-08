import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import { getApprovalMasters } from '../controllers/approvalMasterController';

const router = Router();

router.get('/', authMiddleware, checkPermission('APPROVAL_WORKFLOWS_VIEW'), getApprovalMasters);

export default router;
