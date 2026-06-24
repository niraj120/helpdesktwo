// HRMS Service
// Employee/principal data is served BY a configured MDM source (the company's
// master database). When no MDM source is configured the service falls back to
// the built-in mock data so local development keeps working.
//
// Public function signatures are unchanged (backward compatible); each now
// accepts an optional `mdmSourceId` to pick which MDM source to read from.

import { fetchEmployeesFromMDM, NormalizedEmployee } from "./mdmService";

interface HRMSEmployeeData extends NormalizedEmployee {
  mdmSourceId?: string;
  mdmSourceName?: string;
}

// Mock employee database — used only when no MDM source is configured.
const mockEmployees: HRMSEmployeeData[] = [
  { firstName: "Rajesh", lastName: "Kumar", email: "rajesh.kumar@sac.gov.in", mobile: "9876543210", employeeCode: "EMP001", department: "ICT", designation: "District Coordinator ICT" },
  { firstName: "Priya", lastName: "Sharma", email: "niraj.mishra1010@gmail.com", mobile: "9876543211", employeeCode: "EMP002", department: "ICT", designation: "District Coordinator ICT" },
  { firstName: "Amit", lastName: "Patel", email: "amit.patel@sac.gov.in", mobile: "9876543212", employeeCode: "EMP003", department: "Administration", designation: "System Administrator" },
  { firstName: "Sneha", lastName: "Deshmukh", email: "sneha.deshmukh@sac.gov.in", mobile: "9876543213", employeeCode: "EMP004", department: "ICT", designation: "Technical Support Engineer" },
  { firstName: "Vikram", lastName: "Singh", email: "vikram.singh@sac.gov.in", mobile: "9876543214", employeeCode: "EMP005", department: "Operations", designation: "District Coordinator Operations" },
  { firstName: "Anjali", lastName: "Mehta", email: "anjali.mehta@sac.gov.in", mobile: "9876543215", employeeCode: "EMP006", department: "ICT", designation: "District Coordinator ICT" },
  { firstName: "Rahul", lastName: "Joshi", email: "rahul.joshi@sac.gov.in", mobile: "9876543216", employeeCode: "EMP007", department: "Support", designation: "Help Desk Executive" },
  { firstName: "Kavita", lastName: "Reddy", email: "kavita.reddy@sac.gov.in", mobile: "9876543217", employeeCode: "EMP008", department: "ICT", designation: "District Coordinator ICT" },
  { firstName: "Suresh", lastName: "Nair", email: "suresh.nair@sac.gov.in", mobile: "9876543218", employeeCode: "EMP009", department: "Management", designation: "Project Manager" },
  { firstName: "Deepa", lastName: "Rao", email: "deepa.rao@sac.gov.in", mobile: "9876543219", employeeCode: "EMP010", department: "ICT", designation: "Senior District Coordinator ICT" },
];

const matchesQuery = (emp: HRMSEmployeeData, term: string): boolean =>
  !!(
    emp.firstName?.toLowerCase().includes(term) ||
    emp.lastName?.toLowerCase().includes(term) ||
    emp.email?.toLowerCase().includes(term) ||
    emp.mobile?.includes(term) ||
    emp.employeeCode?.toLowerCase().includes(term) ||
    emp.department?.toLowerCase().includes(term) ||
    emp.designation?.toLowerCase().includes(term)
  );

/**
 * Load the full employee list from the MDM source (tagged with provenance),
 * or the mock list when no source is configured.
 */
async function loadEmployees(mdmSourceId?: string): Promise<HRMSEmployeeData[]> {
  try {
    const result = await fetchEmployeesFromMDM(mdmSourceId);
    if (result) {
      const sourceId = (result.source._id as any).toString();
      return result.employees.map((e) => ({
        ...e,
        mdmSourceId: sourceId,
        mdmSourceName: result.source.name,
      }));
    }
  } catch (error: any) {
    console.error("HRMS Service: MDM fetch failed, falling back to mock:", error.message);
    // Re-throw so callers that explicitly picked a source see the real error.
    if (mdmSourceId) throw error;
  }
  return mockEmployees;
}

export const hrmsService = {
  async syncEmployeeData(
    employeeCode: string,
    mdmSourceId?: string,
  ): Promise<HRMSEmployeeData | null> {
    const employees = await loadEmployees(mdmSourceId);
    return (
      employees.find(
        (emp) => emp.employeeCode?.toLowerCase() === employeeCode.toLowerCase(),
      ) || null
    );
  },

  async searchEmployees(
    query: string,
    mdmSourceId?: string,
  ): Promise<HRMSEmployeeData[]> {
    const employees = await loadEmployees(mdmSourceId);
    if (!query || query.trim().length < 2) {
      // With a real MDM source, return the full list so the UI can show all.
      return mdmSourceId ? employees : [];
    }
    const term = query.toLowerCase();
    return employees.filter((emp) => matchesQuery(emp, term));
  },

  async validateEmployeeCode(
    employeeCode: string,
    mdmSourceId?: string,
  ): Promise<boolean> {
    const employees = await loadEmployees(mdmSourceId);
    return employees.some(
      (emp) => emp.employeeCode?.toLowerCase() === employeeCode.toLowerCase(),
    );
  },

  async getEmployeeByCode(
    employeeCode: string,
    mdmSourceId?: string,
  ): Promise<HRMSEmployeeData | null> {
    return this.syncEmployeeData(employeeCode, mdmSourceId);
  },
};
