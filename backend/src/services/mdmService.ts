import axios from "axios";
import MDMSource, {
  IMDMSource,
  IMDMApi,
  IMDMAuth,
  MDMDataType,
} from "../models/MDMSource";

/**
 * MDM service — calls external company master-data APIs and normalizes the
 * responses. Used by the MDM controller (test endpoints) and by hrmsService
 * (employee/principal fetch).
 */

export interface MDMCallResult {
  success: boolean;
  status?: number;
  count?: number;
  sampleData?: any;
  error?: string;
}

/** Build axios headers + auth from a (decrypted) auth config. */
const buildRequestConfig = (auth: IMDMAuth) => {
  const headers: Record<string, string> = { Accept: "application/json" };
  let basicAuth: { username: string; password: string } | undefined;

  if (auth) {
    if (auth.extraHeaders) {
      for (const [k, v] of Object.entries(auth.extraHeaders)) {
        if (k) headers[k] = String(v);
      }
    }
    switch (auth.type) {
      case "apiKey":
        if (auth.apiKey) headers[auth.headerName || "X-API-Key"] = auth.apiKey;
        break;
      case "bearer":
        if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;
        break;
      case "basic":
        if (auth.username) {
          basicAuth = {
            username: auth.username,
            password: auth.password || "",
          };
        }
        break;
    }
  }

  return { headers, basicAuth };
};

/** Extract an array of records from common API envelope shapes. */
const extractArray = (body: any): any[] => {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  for (const key of ["data", "results", "items", "records", "employees", "rows"]) {
    if (Array.isArray(body[key])) return body[key];
  }
  // Single object → wrap
  return [body];
};

/** Fire a single MDM API request. Never throws — returns a structured result. */
export const callMdmApi = async (
  api: IMDMApi,
  auth: IMDMAuth,
  params?: Record<string, any>,
): Promise<MDMCallResult> => {
  const url = `${(api.baseUrl || "").replace(/\/+$/, "")}${api.path || ""}`;
  const { headers, basicAuth } = buildRequestConfig(auth);

  try {
    const response = await axios.request({
      url,
      method: api.method || "GET",
      headers,
      auth: basicAuth,
      params: api.method === "GET" ? params : undefined,
      data: api.method === "POST" ? params : undefined,
      timeout: 15000,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      return {
        success: false,
        status: response.status,
        error: `HTTP ${response.status}: ${
          typeof response.data === "string"
            ? response.data.slice(0, 200)
            : JSON.stringify(response.data).slice(0, 200)
        }`,
      };
    }

    const arr = extractArray(response.data);
    return {
      success: true,
      status: response.status,
      count: arr.length,
      sampleData: arr.slice(0, 3),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Request failed",
    };
  }
};

/**
 * Pick the api on a source matching a dataType (default-flagged first).
 * When projectId is given, only apis mapped to that project (or unmapped =
 * global) are eligible, so a project receives only the data it is allowed to.
 */
export const pickApiForDataType = (
  source: IMDMSource,
  dataType: MDMDataType,
  projectId?: string,
): IMDMApi | undefined => {
  let matches = (source.apis || []).filter((a) => a.dataType === dataType);
  if (projectId) {
    matches = matches.filter(
      (a) =>
        !a.projectIds ||
        a.projectIds.length === 0 ||
        a.projectIds.some((p) => p.toString() === projectId),
    );
  }
  if (matches.length === 0) return undefined;
  return matches.find((a) => a.isDefaultForType) || matches[0];
};

export interface NormalizedEmployee {
  firstName?: string;
  lastName?: string;
  email?: string;
  mobile?: string;
  employeeCode?: string;
  department?: string;
  designation?: string;
}

const pick = (obj: any, keys: string[]): string | undefined => {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") {
      return String(obj[k]);
    }
  }
  return undefined;
};

/** Best-effort mapping of an arbitrary MDM record to our employee shape. */
export const normalizeEmployee = (raw: any): NormalizedEmployee => {
  if (!raw || typeof raw !== "object") return {};
  let firstName = pick(raw, ["firstName", "first_name", "fname", "FirstName"]);
  let lastName = pick(raw, ["lastName", "last_name", "lname", "LastName"]);
  const fullName = pick(raw, ["name", "fullName", "full_name", "employeeName", "EmployeeName"]);
  if (!firstName && fullName) {
    const parts = fullName.trim().split(/\s+/);
    firstName = parts.shift();
    lastName = lastName || parts.join(" ") || undefined;
  }
  return {
    firstName,
    lastName,
    email: pick(raw, ["email", "emailId", "email_id", "Email", "officialEmail"]),
    mobile: pick(raw, ["mobile", "phone", "mobileNumber", "contact", "Mobile"]),
    employeeCode: pick(raw, [
      "employeeCode",
      "employee_code",
      "empCode",
      "code",
      "employeeId",
      "EmployeeCode",
    ]),
    department: pick(raw, ["department", "dept", "Department"]),
    designation: pick(raw, ["designation", "title", "role", "Designation"]),
  };
};

/**
 * Resolve the MDM source to use for employee/principal data.
 * Explicit id wins; otherwise the first enabled source exposing an
 * employees/principals endpoint.
 */
export const resolveEmployeeSource = async (
  mdmSourceId?: string,
): Promise<IMDMSource | null> => {
  if (mdmSourceId) {
    const byId = await MDMSource.findById(mdmSourceId);
    if (byId && byId.enabled) return byId;
    if (byId) return byId; // allow disabled when explicitly chosen (admin testing)
  }
  return MDMSource.findOne({
    enabled: true,
    "apis.dataType": { $in: ["employees", "principals"] },
  });
};

/**
 * Fetch + normalize the employee/principal list from an MDM source.
 * Returns null when no source/endpoint is configured (caller may fall back).
 */
export const fetchEmployeesFromMDM = async (
  mdmSourceId?: string,
  projectId?: string,
): Promise<{ source: IMDMSource; employees: NormalizedEmployee[] } | null> => {
  const source = await resolveEmployeeSource(mdmSourceId);
  if (!source) return null;

  const api =
    pickApiForDataType(source, "employees", projectId) ||
    pickApiForDataType(source, "principals", projectId);
  if (!api) return null;

  const auth = source.getDecryptedAuth();
  const url = `${(api.baseUrl || "").replace(/\/+$/, "")}${api.path || ""}`;
  const { headers, basicAuth } = buildRequestConfig(auth);

  const response = await axios.request({
    url,
    method: api.method || "GET",
    headers,
    auth: basicAuth,
    timeout: 15000,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`MDM source "${source.name}" returned HTTP ${response.status}`);
  }

  const employees = extractArray(response.data).map(normalizeEmployee);
  return { source, employees };
};
