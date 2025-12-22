import { Router } from 'express';
import { auth } from '../middleware/auth';
import { checkPermission } from '../middleware/permissions';
import { getCities, getStates, getStatesByCountry, getCitiesByState } from '../controllers/master-data/cityStateController';
import { getCountries } from '../controllers/master-data/countryController';

const router = Router();

// All routes require authentication
router.use(auth);

// @desc    Get all countries
// @route   GET /api/masters/countries
// @access  Private - requires view permission or offline module access
router.get('/countries', checkPermission(['MASTER_DATA_VIEW', 'OFFLINE_MODULE_ACCESS']), getCountries);

// @desc    Get states by country ID
// @route   GET /api/masters/countries/:countryId/states
// @access  Private - requires view permission or offline module access
router.get('/countries/:countryId/states', checkPermission(['MASTER_DATA_VIEW', 'OFFLINE_MODULE_ACCESS']), getStatesByCountry);

// @desc    Get cities by state ID
// @route   GET /api/masters/states/:stateId/cities
// @access  Private - requires view permission or offline module access
router.get('/states/:stateId/cities', checkPermission(['MASTER_DATA_VIEW', 'OFFLINE_MODULE_ACCESS']), getCitiesByState);

// @desc    Get all cities
// @route   GET /api/masters/cities
// @access  Private - requires view permission or offline module access
router.get('/cities', checkPermission(['MASTER_DATA_VIEW', 'OFFLINE_MODULE_ACCESS']), getCities);

// @desc    Get all states/regions  
// @route   GET /api/masters/states
// @access  Private - requires view permission or offline module access
router.get('/states', checkPermission(['MASTER_DATA_VIEW', 'OFFLINE_MODULE_ACCESS']), getStates);

export default router;

