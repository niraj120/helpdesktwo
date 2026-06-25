// HRMS Service
// Employee/principal data is served BY a configured MDM source (the company's
// master database). When no MDM source is configured the service falls back to
// the built-in mock data so local development keeps working.
//
// Public function signatures are backward compatible; each accepts an optional
// `mdmSourceId` to pick which MDM source to read from. Rows now also carry the
// flattened raw record (`_raw`) so the UI can show ANY field the API returns,
// and search matches across every raw value (e.g. Group_Employee_Code).

import {
  fetchEmployeesRawFromMDM,
  normalizeEmployeeWithMapping,
  NormalizedEmployee,
} from "./mdmService";
import { MDMFieldConfig } from "../models/MDMFieldConfig";

export interface HRMSEmployeeData extends NormalizedEmployee {
  mdmSourceId?: string;
  mdmSourceName?: string;
  /** Flattened raw record (Strapi attributes unwrapped) for dynamic columns. */
  _raw?: Record<string, any>;
}

// Mock employee database — used only when no MDM source is configured.
const mockEmployees: HRMSEmployeeData[] = [
  { firstName: "Rajesh", lastName: "Kumar", email: "rajesh.kumar@sac.gov.in", mobile: "9876543210", employeeCode: "EMP001", department: "ICT", designation: "District Coordinator ICT" },
  { firstName: "Priya", lastName: "Sharma", email: "niraj.mishra1010@gmail.com", mobile: "9876543211", employeeCode: "EMP002", department: "ICT", designation: "District Coordinator ICT" },
  { firstName: "Amit", lastName: "Patel", email: "amit.patel@sac.gov.in", mobile: "9876543212", employeeCode: "EMP003", department: "Administration", designation: "System Administrator" },
  { firstName: "Sneha", lastName: "Deshmukh", email: "sneha.deshmukh@sac.gov.in", mobile: "9876543213", employeeCode: "EMP004", department: "ICT", designation: "Technical Support Engineer" },
  { firstName: "Vikram", lastName: "Singh", email: "vikram.singh@sac.gov.in", mobile: "9876543214", employeeCode: "EMP005", department: "Operations", designation: "District Coordinator Operations" },
];

const rawValues = (emp: HRMSEmployeeData): string[] => {
  const vals: string[] = [];
  const src = emp._raw || emp;
  for (const v of Object.values(src)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "object") continue;
    vals.push(String(v));
  }
  // include normalized too (covers mock data that has no _raw)
  for (const v of [
    emp.firstName,
    emp.lastName,
    emp.email,
    emp.mobile,
    emp.employeeCode,
    emp.department,
    emp.designation,
  ]) {
    if (v) vals.push(v);
  }
  return vals;
};

const matchesQuery = (emp: HRMSEmployeeData, term: string): boolean =>
  rawValues(emp).some((v) => v.toLowerCase().includes(term));

/** Load the field-mapping override for a source (if the admin saved one). */
async function loadMapping(mdmSourceId?: string) {
  if (!mdmSourceId) return undefined;
  try {
    const cfg = await MDMFieldConfig.findOne({
      mdmSourceId,
      dataType: "employees",
    }).lean();
    return cfg?.fieldMapping;
  } catch {
    return undefined;
  }
}

/**
 * Load the full employee list (rows + discovered fields) from the MDM source,
 * tagged with provenance and any saved field-mapping, or the mock list.
 */
async function loadEmployees(
  mdmSourceId?: string,
): Promise<{ rows: HRMSEmployeeData[]; fields: string[] }> {
  try {
    const result = await fetchEmployeesRawFromMDM(mdmSourceId);
    if (result) {
      const sourceId = (result.source._id as any).toString();
      const mapping = await loadMapping(mdmSourceId);
      const rows = result.rows.map((r) => ({
        ...normalizeEmployeeWithMapping(r._raw, mapping),
        _raw: r._raw,
        mdmSourceId: sourceId,
        mdmSourceName: result.source.name,
      }));
      return { rows, fields: result.fields };
    }
  } catch (error: any) {
    console.error("HRMS Service: MDM fetch failed:", error.message);
    if (mdmSourceId) throw error; // explicit source → surface the real error
  }
  const fields = [
    "firstName",
    "lastName",
    "email",
    "mobile",
    "employeeCode",
    "department",
    "designation",
  ];
  return { rows: mockEmployees.map((m) => ({ ...m, _raw: { ...m } })), fields };
}

export const hrmsService = {
  /** Discover the field list (+ a small sample) for the column picker. */
  async getFields(
    mdmSourceId?: string,
  ): Promise<{ fields: string[]; count: number; sample: HRMSEmployeeData[] }> {
    const { rows, fields } = await loadEmployees(mdmSourceId);
    return { fields, count: rows.length, sample: rows.slice(0, 3) };
  },

  async syncEmployeeData(
    employeeCode: string,
    mdmSourceId?: string,
  ): Promise<HRMSEmployeeData | null> {
    const { rows } = await loadEmployees(mdmSourceId);
    const term = employeeCode.toLowerCase();
    return (
      rows.find((emp) => emp.employeeCode?.toLowerCase() === term) ||
      // fall back to a raw-value match so any code column resolves
      rows.find((emp) => matchesQuery(emp, term)) ||
      null
    );
  },

  async searchEmployees(
    query: string,
    mdmSourceId?: string,
  ): Promise<HRMSEmployeeData[]> {
    const { rows } = await loadEmployees(mdmSourceId);
    if (!query || query.trim().length < 1) {
      return mdmSourceId ? rows : [];
    }
    const term = query.toLowerCase();
    return rows.filter((emp) => matchesQuery(emp, term));
  },

  async validateEmployeeCode(
    employeeCode: string,
    mdmSourceId?: string,
  ): Promise<boolean> {
    return !!(await this.syncEmployeeData(employeeCode, mdmSourceId));
  },

  async getEmployeeByCode(
    employeeCode: string,
    mdmSourceId?: string,
  ): Promise<HRMSEmployeeData | null> {
    return this.syncEmployeeData(employeeCode, mdmSourceId);
  },
};
