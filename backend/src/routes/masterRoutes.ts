import { Router } from "express";
import { auth } from "../middleware/auth";
import { checkPermission } from "../middleware/permissions";
import {
  getCountries,
  createCountry,
  updateCountry,
  deleteCountry,
} from "../controllers/master-data/countryController";

import {
  getStates,
  createState,
  updateState,
  deleteState,
} from "../controllers/master-data/stateController";

import {
  getCities,
  createCity,
  updateCity,
  deleteCity,
} from "../controllers/master-data/cityController";

import {
  getStatesByCountry,
  getCitiesByState,
} from "../controllers/master-data/cityStateController";
import {
  getCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
} from "../controllers/master-data/companyController";

const router = Router();

// All routes require authentication
router.use(auth);

// Nested routes MUST come before parameterized routes to avoid conflicts
// Get states by country ID
router.get(
  "/countries/:countryId/states",
  checkPermission(["MASTER_DATA_VIEW", "OFFLINE_MODULE_ACCESS"]),
  getStatesByCountry,
);

// Get cities by state ID
router.get(
  "/states/:stateId/cities",
  checkPermission(["MASTER_DATA_VIEW", "OFFLINE_MODULE_ACCESS"]),
  getCitiesByState,
);

// Country routes
router.get("/countries", checkPermission("MASTER_DATA_VIEW"), getCountries);
router.post(
  "/countries",
  checkPermission("MASTER_DATA_MANAGE_LOCATIONS"),
  createCountry,
);
router.put(
  "/countries/:id",
  checkPermission("MASTER_DATA_MANAGE_LOCATIONS"),
  updateCountry,
);
router.delete(
  "/countries/:id",
  checkPermission("MASTER_DATA_MANAGE_LOCATIONS"),
  deleteCountry,
);

// State routes
router.get("/states", checkPermission("MASTER_DATA_VIEW"), getStates);
router.post(
  "/states",
  checkPermission("MASTER_DATA_MANAGE_LOCATIONS"),
  createState,
);
router.put(
  "/states/:id",
  checkPermission("MASTER_DATA_MANAGE_LOCATIONS"),
  updateState,
);
router.delete(
  "/states/:id",
  checkPermission("MASTER_DATA_MANAGE_LOCATIONS"),
  deleteState,
);

// City routes
router.get("/cities", checkPermission("MASTER_DATA_VIEW"), getCities);
router.post(
  "/cities",
  checkPermission("MASTER_DATA_MANAGE_LOCATIONS"),
  createCity,
);
router.put(
  "/cities/:id",
  checkPermission("MASTER_DATA_MANAGE_LOCATIONS"),
  updateCity,
);
router.delete(
  "/cities/:id",
  checkPermission("MASTER_DATA_MANAGE_LOCATIONS"),
  deleteCity,
);

// Company routes
router.get("/companies", checkPermission("MASTER_DATA_VIEW"), getCompanies);
router.post(
  "/companies",
  checkPermission("MASTER_DATA_MANAGE_LOCATIONS"),
  createCompany,
);
router.put(
  "/companies/:id",
  checkPermission("MASTER_DATA_MANAGE_LOCATIONS"),
  updateCompany,
);
router.delete(
  "/companies/:id",
  checkPermission("MASTER_DATA_MANAGE_LOCATIONS"),
  deleteCompany,
);

export default router;
