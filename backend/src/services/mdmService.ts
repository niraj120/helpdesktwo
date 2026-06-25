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

/** Key normaliser: lowercase + strip non-alphanumerics so "Group_Employee_Code",
 * "groupEmployeeCode" and "group employee code" all collapse to one form. */
const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Flatten a record into a single scalar-friendly object. Unwraps Strapi's
 * `{ id, attributes: {...} }` envelope so the real columns are top-level.
 */
export const flattenRecord = (raw: any): Record<string, any> => {
  if (!raw || typeof raw !== "object") return {};
  const attrs =
    raw.attributes && typeof raw.attributes === "object" ? raw.attributes : null;
  const merged: Record<string, any> = attrs ? { ...raw, ...attrs } : { ...raw };
  delete (merged as any).attributes;
  return merged;
};

/** Fuzzy field pick over a flattened record using key-normalised candidates. */
const fuzzyPick = (
  flat: Record<string, any>,
  candidates: string[],
): string | undefined => {
  const map = new Map<string, any>();
  for (const [k, v] of Object.entries(flat)) {
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "object") continue; // skip nested relations
    map.set(normKey(k), v);
  }
  for (const c of candidates) {
    const v = map.get(normKey(c));
    if (v !== undefined) return String(v);
  }
  return undefined;
};

const FIELD_CANDIDATES: Record<keyof NormalizedEmployee, string[]> = {
  firstName: ["firstName", "first_name", "fname", "First_Name"],
  lastName: ["lastName", "last_name", "lname", "Last_Name"],
  email: [
    "email",
    "emailId",
    "email_id",
    "officialEmail",
    "official_email",
    "work_email",
    "Email_Id",
    "Official_Email",
  ],
  mobile: [
    "mobile",
    "phone",
    "mobileNumber",
    "mobile_number",
    "contact",
    "Mobile_Number",
    "Contact_Number",
  ],
  employeeCode: [
    "employeeCode",
    "employee_code",
    "empCode",
    "code",
    "employeeId",
    "employee_id",
    "Group_Employee_Code",
    "Employee_Code_Company",
    "Employee_Code_HRMantra",
  ],
  department: ["department", "dept", "Department", "Department_Name"],
  designation: [
    "designation",
    "title",
    "role",
    "job_title",
    "Designation",
    "Designation_Name",
  ],
};

/** Best-effort mapping of an arbitrary MDM record to our employee shape. */
export const normalizeEmployee = (raw: any): NormalizedEmployee => {
  if (!raw || typeof raw !== "object") return {};
  const flat = flattenRecord(raw);
  let firstName = fuzzyPick(flat, FIELD_CANDIDATES.firstName);
  let lastName = fuzzyPick(flat, FIELD_CANDIDATES.lastName);
  const fullName = fuzzyPick(flat, [
    "name",
    "fullName",
    "full_name",
    "employeeName",
    "employee_name",
    "Full_Name",
    "Employee_Name",
  ]);
  if (!firstName && fullName) {
    const parts = fullName.trim().split(/\s+/);
    firstName = parts.shift();
    lastName = lastName || parts.join(" ") || undefined;
  }
  return {
    firstName,
    lastName,
    email: fuzzyPick(flat, FIELD_CANDIDATES.email),
    mobile: fuzzyPick(flat, FIELD_CANDIDATES.mobile),
    employeeCode: fuzzyPick(flat, FIELD_CANDIDATES.employeeCode),
    department: fuzzyPick(flat, FIELD_CANDIDATES.department),
    designation: fuzzyPick(flat, FIELD_CANDIDATES.designation),
  };
};

/** Map a flat record to NormalizedEmployee using an explicit field mapping
 * (API field name per target). Falls back to auto-detect for any unset target. */
export const normalizeEmployeeWithMapping = (
  raw: any,
  mapping?: Partial<Record<keyof NormalizedEmployee | "fullName", string>>,
): NormalizedEmployee => {
  const auto = normalizeEmployee(raw);
  if (!mapping) return auto;
  const flat = flattenRecord(raw);
  const get = (f?: string) =>
    f && flat[f] !== undefined && flat[f] !== null && flat[f] !== ""
      ? String(flat[f])
      : undefined;
  let firstName = get(mapping.firstName) ?? auto.firstName;
  let lastName = get(mapping.lastName) ?? auto.lastName;
  const fullName = get(mapping.fullName);
  if (mapping.fullName && fullName && !mapping.firstName) {
    const parts = fullName.trim().split(/\s+/);
    firstName = parts.shift();
    lastName = lastName || parts.join(" ") || undefined;
  }
  return {
    firstName,
    lastName,
    email: get(mapping.email) ?? auto.email,
    mobile: get(mapping.mobile) ?? auto.mobile,
    employeeCode: get(mapping.employeeCode) ?? auto.employeeCode,
    department: get(mapping.department) ?? auto.department,
    designation: get(mapping.designation) ?? auto.designation,
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
export interface RawEmployeeRow {
  _raw: Record<string, any>;
  norm: NormalizedEmployee;
}

/**
 * Fetch the employee/principal list and return BOTH the flattened raw records
 * and the auto-normalized shape, plus the union of discovered field names
 * (for the dynamic column picker). Returns null when no source/endpoint exists.
 */
export const fetchEmployeesRawFromMDM = async (
  mdmSourceId?: string,
  projectId?: string,
): Promise<{
  source: IMDMSource;
  rows: RawEmployeeRow[];
  fields: string[];
} | null> => {
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
    timeout: 20000,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`MDM source "${source.name}" returned HTTP ${response.status}`);
  }

  const rows: RawEmployeeRow[] = extractArray(response.data).map((r) => ({
    _raw: flattenRecord(r),
    norm: normalizeEmployee(r),
  }));

  // Field union across a sample of rows (covers sparse columns).
  const fieldSet = new Set<string>();
  for (const r of rows.slice(0, 100)) {
    for (const [k, v] of Object.entries(r._raw)) {
      if (typeof v === "object" && v !== null) continue; // skip nested relations
      fieldSet.add(k);
    }
  }
  return { source, rows, fields: Array.from(fieldSet) };
};

export const fetchEmployeesFromMDM = async (
  mdmSourceId?: string,
  projectId?: string,
): Promise<{ source: IMDMSource; employees: NormalizedEmployee[] } | null> => {
  const raw = await fetchEmployeesRawFromMDM(mdmSourceId, projectId);
  if (!raw) return null;
  return { source: raw.source, employees: raw.rows.map((r) => r.norm) };
};

/* ---------------- Parents & children (SR Existing-Parent flow) ------------- */

export interface NormalizedChild {
  name?: string;
  grade?: string;
  enrollmentId?: string;
  parentCode?: string;
}

export interface NormalizedParent {
  name?: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  email?: string;
  school?: string;
  parentCode?: string;
  children: NormalizedChild[];
}

export const normalizeChild = (raw: any): NormalizedChild => {
  if (!raw || typeof raw !== "object") return {};
  return {
    name: pick(raw, ["name", "childName", "studentName", "fullName", "Name"]),
    grade: pick(raw, ["grade", "class", "standard", "Grade", "className"]),
    enrollmentId: pick(raw, [
      "enrollmentId",
      "enrolment",
      "enrollment",
      "admissionNo",
      "uniqueId",
      "studentId",
    ]),
    parentCode: pick(raw, ["parentCode", "parentId", "guardianCode", "parent_code"]),
  };
};

export const normalizeParent = (raw: any): NormalizedParent => {
  if (!raw || typeof raw !== "object") return { children: [] };
  let firstName = pick(raw, ["firstName", "first_name", "fname", "FirstName"]);
  let lastName = pick(raw, ["lastName", "last_name", "lname", "LastName"]);
  const fullName = pick(raw, [
    "name",
    "fullName",
    "full_name",
    "parentName",
    "guardianName",
  ]);
  if (!firstName && fullName) {
    const parts = fullName.trim().split(/\s+/);
    firstName = parts.shift();
    lastName = lastName || parts.join(" ") || undefined;
  }
  const childrenRaw =
    raw.children || raw.wards || raw.students || raw.kids || [];
  return {
    name: fullName || `${firstName || ""} ${lastName || ""}`.trim() || undefined,
    firstName,
    lastName,
    mobile: pick(raw, ["mobile", "phone", "mobileNumber", "contact", "Mobile"]),
    email: pick(raw, ["email", "emailId", "email_id", "Email"]),
    school: pick(raw, ["school", "schoolName", "school_name", "School", "branch"]),
    parentCode: pick(raw, ["parentCode", "parentId", "guardianCode", "code"]),
    children: Array.isArray(childrenRaw) ? childrenRaw.map(normalizeChild) : [],
  };
};

/** Raw array fetch from one api (throws on non-2xx). */
const fetchRawArray = async (
  source: IMDMSource,
  api: IMDMApi,
): Promise<any[]> => {
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
  return extractArray(response.data);
};

export const resolveParentSource = async (
  mdmSourceId?: string,
): Promise<IMDMSource | null> => {
  if (mdmSourceId) {
    const byId = await MDMSource.findById(mdmSourceId);
    if (byId) return byId;
  }
  return MDMSource.findOne({
    enabled: true,
    "apis.dataType": "parents",
  });
};

/**
 * Fetch parents (with their children) from the configured MDM source and
 * filter by a free-text query (name / mobile / email / school).
 * Returns null when no parents endpoint is configured (caller falls back).
 */
export const searchParentsFromMDM = async (
  query: string,
  projectId?: string,
  mdmSourceId?: string,
): Promise<{ source: IMDMSource; parents: NormalizedParent[] } | null> => {
  const source = await resolveParentSource(mdmSourceId);
  if (!source) return null;
  const parentApi = pickApiForDataType(source, "parents", projectId);
  if (!parentApi) return null;

  const parents = (await fetchRawArray(source, parentApi)).map(normalizeParent);

  // If children are not embedded, try a separate children endpoint and join.
  const needChildren = parents.every((p) => p.children.length === 0);
  if (needChildren) {
    const childApi = pickApiForDataType(source, "children", projectId);
    if (childApi) {
      try {
        const children = (await fetchRawArray(source, childApi)).map(
          normalizeChild,
        );
        const byParent = new Map<string, NormalizedChild[]>();
        for (const c of children) {
          if (!c.parentCode) continue;
          const arr = byParent.get(c.parentCode) || [];
          arr.push(c);
          byParent.set(c.parentCode, arr);
        }
        for (const p of parents) {
          if (p.parentCode && byParent.has(p.parentCode)) {
            p.children = byParent.get(p.parentCode)!;
          }
        }
      } catch (e: any) {
        console.error("MDM children fetch failed:", e.message);
      }
    }
  }

  const term = (query || "").toLowerCase().trim();
  const filtered = term
    ? parents.filter((p) =>
        [p.name, p.mobile, p.email, p.school]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      )
    : parents;

  return { source, parents: filtered };
};
