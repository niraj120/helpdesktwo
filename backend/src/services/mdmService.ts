import axios from "axios";
import MDMSource, {
  IMDMSource,
  IMDMApi,
  IMDMAuth,
  MDMDataType,
} from "../models/MDMSource";
import PsrMaster, { IPsrMaster } from "../models/psr/PsrMaster";

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
  responseBody?: any;
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
export const extractArray = (body: any): any[] => {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  if (body.data && typeof body.data === "object") {
    const nested = extractArray(body.data);
    if (nested.length) return nested;
  }
  for (const key of [
    "data",
    "results",
    "items",
    "records",
    "employees",
    "schools",
    "school",
    "locations",
    "grades",
    "academicYears",
    "academic_years",
    "parents",
    "students",
    "children",
    "rows",
  ]) {
    if (Array.isArray(body[key])) return body[key];
  }
  // Single object → wrap
  return [body];
};

/**
 * Extract a value from a nested object using a dot-notation path.
 * E.g. extractFromPath(body, "data.results") → body.data.results
 * Returns undefined if any segment along the path is missing.
 */
export const extractFromPath = (body: any, path: string): any => {
  if (!path || !path.trim()) return undefined;
  const parts = path.split(".");
  let cur = body;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
};

/**
 * Extract the records array from an API response using an optional configured
 * dot-notation path. Falls back to heuristic extractArray() when no path is
 * configured or the path does not resolve to an array.
 */
export const extractArrayWithPath = (body: any, responsePath?: string): any[] => {
  if (responsePath && responsePath.trim()) {
    const resolved = extractFromPath(body, responsePath.trim());
    if (Array.isArray(resolved)) return resolved;
  }
  return extractArray(body);
};

const pickNumber = (body: any, paths: string[][]): number | undefined => {
  for (const path of paths) {
    let cur = body;
    for (const key of path) cur = cur?.[key];
    const value =
      typeof cur === "string" && cur.trim() !== "" ? Number(cur) : cur;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
};

const extractTotalCount = (body: any, fallback: number): number => {
  if (!body || typeof body !== "object") return fallback;
  return (
    pickNumber(body, [
      ["total"],
      ["totalCount"],
      ["total_count"],
      ["totalRecords"],
      ["recordsTotal"],
      ["count"],
      ["pagination", "total"],
      ["pagination", "totalCount"],
      ["meta", "total"],
      ["meta", "totalCount"],
      ["meta", "pagination", "total"],
      ["meta", "pagination", "totalCount"],
    ]) ?? fallback
  );
};

/** Fire a single MDM API request. Never throws — returns a structured result. */
const renderMdmTemplateValue = (
  value: any,
  params: Record<string, any> = {},
): any => {
  if (Array.isArray(value)) {
    return value.map((item) => renderMdmTemplateValue(item, params));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        renderMdmTemplateValue(item, params),
      ]),
    );
  }
  if (typeof value !== "string") return value;
  return value.replace(/{{\s*(?:param|params)\.([^}]+)\s*}}/g, (_m, key) =>
    String(params[String(key).trim()] ?? ""),
  );
};

const buildMdmRequestBody = (
  api: IMDMApi,
  params?: Record<string, any>,
): { ok: true; body: any } | { ok: false; error: string } => {
  if (!api.requestBody?.trim()) return { ok: true, body: params };
  try {
    return {
      ok: true,
      body: renderMdmTemplateValue(JSON.parse(api.requestBody), params || {}),
    };
  } catch {
    return { ok: false, error: "Request body JSON is invalid." };
  }
};

export const callMdmApi = async (
  api: IMDMApi,
  auth: IMDMAuth,
  params?: Record<string, any>,
  options: { sampleLimit?: number } = {},
): Promise<MDMCallResult> => {
  const url = `${(api.baseUrl || "").replace(/\/+$/, "")}${api.path || ""}`;
  const { headers, basicAuth } = buildRequestConfig(auth);
  const bodyResult = buildMdmRequestBody(api, params);
  if (!bodyResult.ok) {
    return {
      success: false,
      error: bodyResult.error,
    };
  }

  try {
    const response = await axios.request({
      url,
      method: api.method || "GET",
      headers: {
        ...headers,
        ...(api.method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      auth: basicAuth,
      params: api.method === "GET" ? params : undefined,
      data: api.method === "POST" ? bodyResult.body : undefined,
      timeout: 15000,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      return {
        success: false,
        status: response.status,
        responseBody: response.data,
        error: `HTTP ${response.status}: ${
          typeof response.data === "string"
            ? response.data.slice(0, 200)
            : JSON.stringify(response.data).slice(0, 200)
        }`,
      };
    }

    const arr = extractArray(response.data);
    const sampleLimit = Math.max(
      1,
      Math.min(Number(options.sampleLimit) || 3, 250),
    );
    return {
      success: true,
      status: response.status,
      count: arr.length,
      sampleData: arr.slice(0, sampleLimit),
      responseBody: response.data,
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

export const pickApiForDataTypeLoose = (
  source: IMDMSource,
  dataType: MDMDataType,
  projectId?: string,
): IMDMApi | undefined =>
  pickApiForDataType(source, dataType, projectId) ||
  pickApiForDataType(source, dataType);

const isApiEligibleForProject = (api: IMDMApi, projectId?: string) =>
  !projectId ||
  !api.projectIds ||
  api.projectIds.length === 0 ||
  api.projectIds.some((p) => p.toString() === projectId);

/**
 * Explicit source selection is a stronger signal than dataType. Some legacy MDM
 * configs were saved as `custom`; when the project points PSR lookup to that
 * source, use its project-eligible default/first API instead of falling back to
 * the internal directory.
 */
const pickExplicitSourceApi = (
  source: IMDMSource,
  dataType: MDMDataType,
  projectId?: string,
): IMDMApi | undefined => {
  const typed = pickApiForDataTypeLoose(source, dataType, projectId);
  if (typed) return typed;

  const eligible = (source.apis || []).filter((api) =>
    isApiEligibleForProject(api, projectId),
  );
  return eligible.find((api) => api.isDefaultForType) || eligible[0];
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
  totalAvailable: number;
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
    const authHint =
      response.status === 401 || response.status === 403
        ? ` — the API rejected the request (check the source's Authentication / token in MDM Master).`
        : "";
    throw new Error(
      `MDM source "${source.name}" returned HTTP ${response.status}${authHint}`,
    );
  }

  const rows: RawEmployeeRow[] = extractArray(response.data).map((r) => ({
    _raw: flattenRecord(r),
    norm: normalizeEmployee(r),
  }));
  const totalAvailable = extractTotalCount(response.data, rows.length);

  // Field union across a sample of rows (covers sparse columns).
  const fieldSet = new Set<string>();
  for (const r of rows.slice(0, 100)) {
    for (const [k, v] of Object.entries(r._raw)) {
      if (typeof v === "object" && v !== null) continue; // skip nested relations
      fieldSet.add(k);
    }
  }
  return { source, rows, fields: Array.from(fieldSet), totalAvailable };
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
  /** MDM says the student's parents are separated (custody-sensitive). */
  separatedParents?: boolean;
  grade?: string;
  enrollmentId?: string;
  parentCode?: string;
  school?: string;
  division?: string;
  raw?: Record<string, any>;
}

export interface NormalizedParent {
  name?: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  email?: string;
  school?: string;
  parentCode?: string;
  raw?: Record<string, any>;
  children: NormalizedChild[];
}

export const normalizeChild = (raw: any): NormalizedChild => {
  if (!raw || typeof raw !== "object") return {};
  const flat = flattenRecord(raw);
  const firstName = fuzzyPick(flat, [
    "firstName",
    "first_name",
    "studentFirstName",
    "student_first_name",
    "FirstName",
  ]);
  const lastName = fuzzyPick(flat, [
    "lastName",
    "last_name",
    "studentLastName",
    "student_last_name",
    "LastName",
  ]);
  const fullName = fuzzyPick(flat, [
    "name",
    "childName",
    "studentName",
    "student_name",
    "fullName",
    "full_name",
    "Name",
    "StudentName",
  ]);
  return {
    raw: flat,
    name:
      fullName ||
      `${firstName || ""} ${lastName || ""}`.trim() ||
      undefined,
    grade: fuzzyPick(flat, [
      "grade",
      "gradeName",
      "grade_name",
      "class",
      "standard",
      "Grade",
      "className",
      "class_name",
      "ClassName",
      "standardName",
      "standard_name",
    ]),
    enrollmentId: fuzzyPick(flat, [
      "id",
      "globalId",
      "global_id",
      "enrollmentId",
      "enrolment",
      "enrollment",
      "admissionNo",
      "uniqueId",
      "studentId",
      "studentCode",
      "StudentCode",
      "admissionNumber",
      "admission_number",
      "AdmissionNo",
    ]),
    school: fuzzyPick(flat, [
      "schoolName",
      "school_name",
      "school",
      "School",
      "centreName",
      "centerName",
      "centre_name",
      "center_name",
      "branchName",
      "branch_name",
      "campusName",
      "campus_name",
    ]),
    division: fuzzyPick(flat, [
      "division",
      "divisionName",
      "division_name",
      "Division",
      "section",
      "sectionName",
      "section_name",
      "Section",
      "div",
    ]),
    parentCode: fuzzyPick(flat, [
      "parentCode",
      "parentId",
      "guardianCode",
      "guardianId",
      "globalId",
      "global_id",
      "globalNo",
      "global_no",
      "parent_code",
      "parent_id",
      "guardian_code",
      "guardian_id",
      "parentMobile",
      "guardianMobile",
      "mobile",
      "phone",
      "mobileNumber",
      "Mobile",
      "MobileNo",
      "mobileNo",
      "phoneNumber",
      "contact",
      "fatherMobile",
      "motherMobile",
    ]),
  };
};

export const normalizeParent = (raw: any): NormalizedParent => {
  if (!raw || typeof raw !== "object") return { children: [] };
  const flat = flattenRecord(raw);
  let firstName = fuzzyPick(flat, ["firstName", "first_name", "fname", "FirstName"]);
  let lastName = fuzzyPick(flat, ["lastName", "last_name", "lname", "LastName"]);
  const fullName = fuzzyPick(flat, [
    "name",
    "fullName",
    "full_name",
    "parentName",
    "parent_name",
    "guardianName",
    "guardian_name",
    "ParentName",
    "GuardianName",
  ]);
  if (!firstName && fullName) {
    const parts = fullName.trim().split(/\s+/);
    firstName = parts.shift();
    lastName = lastName || parts.join(" ") || undefined;
  }
  const childrenRaw =
    raw.children || raw.wards || raw.students || raw.kids || [];
  return {
    raw: flat,
    name: fullName || `${firstName || ""} ${lastName || ""}`.trim() || undefined,
    firstName,
    lastName,
    mobile: fuzzyPick(flat, [
      "mobile",
      "phone",
      "mobileNumber",
      "mobile_number",
      "mobile_no",
      "mobileNo",
      "phoneNumber",
      "contact",
      "contactNo",
      "parentMobile",
      "guardianMobile",
      "fatherMobile",
      "motherMobile",
      "Mobile",
      "MobileNo",
      "Mobile_No",
      "ContactNo",
      "PhoneNumber",
    ]),
    email: fuzzyPick(flat, ["email", "emailId", "email_id", "Email", "EmailId"]),
    school: fuzzyPick(flat, [
      "school",
      "schoolName",
      "school_name",
      "School",
      "SchoolName",
      "branch",
      "branchName",
      "campus",
    ]),
    parentCode: fuzzyPick(flat, [
      "parentCode",
      "parentId",
      "guardianCode",
      "guardianId",
      "globalId",
      "global_id",
      "globalNo",
      "global_no",
      "id",
      "parent_code",
      "parent_id",
      "guardian_code",
      "guardian_id",
      "code",
      "mobile",
      "phone",
      "mobileNumber",
      "mobile_number",
      "mobile_no",
      "mobileNo",
      "parentMobile",
      "guardianMobile",
      "Mobile",
      "MobileNo",
    ]),
    children: Array.isArray(childrenRaw) ? childrenRaw.map(normalizeChild) : [],
  };
};

/** Raw array fetch from one api (throws on non-2xx). */
const fetchRawArray = async (
  source: IMDMSource,
  api: IMDMApi,
  params?: Record<string, any>,
): Promise<any[]> => {
  const auth = source.getDecryptedAuth();
  const url = `${(api.baseUrl || "").replace(/\/+$/, "")}${api.path || ""}`;
  const { headers, basicAuth } = buildRequestConfig(auth);
  const bodyResult = buildMdmRequestBody(api, params);
  if (!bodyResult.ok) throw new Error(bodyResult.error);
  const response = await axios.request({
    url,
    method: api.method || "GET",
    headers: {
      ...headers,
      ...((api.method || "GET") === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    auth: basicAuth,
    params: (api.method || "GET") === "GET" ? params : undefined,
    data: (api.method || "GET") === "POST" ? bodyResult.body : undefined,
    timeout: 15000,
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`MDM source "${source.name}" returned HTTP ${response.status}`);
  }
  return extractArray(response.data);
};

export interface MDMOptionLookupParams {
  sourceId: string;
  projectId?: string;
  dataType?: MDMDataType;
  labelField?: string;
  valueField?: string;
  search?: string;
  searchParam?: string;
  dependsOnValue?: string;
  dependsOnParam?: string;
  dependsOnRemoteField?: string;
  limit?: number;
}

const pathValue = (obj: any, path?: string): any => {
  if (!path?.trim()) return obj;
  return path
    .trim()
    .split(".")
    .reduce((acc: any, part) => (acc == null ? undefined : acc[part]), obj);
};

const extractPsrMasterRows = (body: any, responsePath?: string): any[] => {
  const scoped = responsePath?.trim() ? pathValue(body, responsePath) : body;
  const rows = extractArray(scoped);
  if (rows.length) return rows;
  return extractArray(body);
};

const resolvePsrSecret = (secretRef?: string) => {
  if (!secretRef) return "";
  if (secretRef.startsWith("env:")) return process.env[secretRef.slice(4)] || "";
  return secretRef;
};

const buildPsrMasterHeaders = (master: IPsrMaster) => {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(master.headers || {}),
  };
  if (master.auth?.type === "bearer" && master.auth.secretRef) {
    headers.Authorization = `Bearer ${resolvePsrSecret(master.auth.secretRef)}`;
  }
  if (master.auth?.type === "apikey" && master.auth.secretRef) {
    headers[master.auth.headerName || "X-API-Key"] = resolvePsrSecret(master.auth.secretRef);
  }
  return headers;
};

const fetchPsrMasterRows = async (
  master: IPsrMaster,
  params: Record<string, any>,
): Promise<Record<string, any>[]> => {
  const response = await axios.request({
    url: master.url,
    method: master.method || "GET",
    headers: {
      ...buildPsrMasterHeaders(master),
      ...(master.method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    params: master.method === "GET" ? params : undefined,
    data: master.method === "POST" ? params : undefined,
    auth:
      master.auth?.type === "basic"
        ? {
            username: master.auth.username || "",
            password: resolvePsrSecret(master.auth.secretRef),
          }
        : undefined,
    timeout: 15000,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`MDM master "${master.name}" returned HTTP ${response.status}`);
  }

  return extractPsrMasterRows(response.data, master.responsePath).map(flattenRecord);
};

const normalizeMdmOptions = ({
  rows,
  labelField,
  valueField,
  search,
  searchParam,
  dependsOnValue,
  dependsOnRemoteField,
  limit = 100,
}: {
  rows: Record<string, any>[];
  labelField?: string;
  valueField?: string;
  search?: string;
  searchParam?: string;
  dependsOnValue?: string;
  dependsOnRemoteField?: string;
  limit?: number;
}) => {
  const searchTerm = (search || "").trim().toLowerCase();
  const dependencyTerm = (dependsOnValue || "").trim().toLowerCase();

  const filtered = rows.filter((flat) => {
    if (dependsOnRemoteField?.trim() && dependencyTerm) {
      const remote = configuredScalar(flat, dependsOnRemoteField);
      if (String(remote ?? "").trim().toLowerCase() !== dependencyTerm) return false;
    }
    if (!searchTerm || searchParam?.trim()) return true;
    return Object.values(flat).some(
      (value) =>
        typeof value !== "object" &&
        String(value ?? "").toLowerCase().includes(searchTerm),
    );
  });

  const seen = new Set<string>();
  return filtered
    .map((flat) => {
      const label = labelField?.trim()
        ? configuredScalar(flat, labelField)
        : firstScalar(flat, ["name", "label", "title", "displayName", "schoolName"]);
      const value = valueField?.trim()
        ? configuredScalar(flat, valueField)
        : firstScalar(flat, ["id", "_id", "code", "value", "global_id", "global_no", "name"]);
      return {
        label: label || value,
        value: value || label,
        raw: flat,
      };
    })
    .filter((option) => {
      if (!option.label || !option.value) return false;
      const key = `${option.value}::${option.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, Math.min(Number(limit) || 100, 500)));
};

const firstScalar = (flat: Record<string, any>, candidates: string[]) => {
  for (const key of candidates) {
    const value = flat[key];
    if (value !== undefined && value !== null && value !== "" && typeof value !== "object") {
      return String(value);
    }
  }
  for (const value of Object.values(flat)) {
    if (value !== undefined && value !== null && value !== "" && typeof value !== "object") {
      return String(value);
    }
  }
  return "";
};

export const configuredScalar = (
  flat: Record<string, any>,
  configuredField?: string,
): string => {
  const field = configuredField?.trim();
  if (!field) return "";

  const candidates = [
    field,
    field.includes(".") ? field.split(".").pop() || field : field,
  ];

  for (const key of candidates) {
    const value = flat[key];
    if (value !== undefined && value !== null && value !== "" && typeof value !== "object") {
      return String(value);
    }
  }

  const normalizedCandidates = candidates.map(normKey);
  for (const [key, value] of Object.entries(flat)) {
    if (value === undefined || value === null || value === "" || typeof value === "object") {
      continue;
    }
    if (normalizedCandidates.includes(normKey(key))) return String(value);
  }

  return "";
};

export const fetchMdmRawArray = fetchRawArray;

/**
 * Fetch a full dataset from an API with support for:
 *  - Configured response path (dot-notation to the records array)
 *  - Page-based or offset-based pagination (auto-loops until exhausted)
 *
 * Falls back to a single-request fetch when no pagination is configured.
 */
export const fetchMdmRawArrayWithConfig = async (
  source: IMDMSource,
  api: IMDMApi,
  datasetConfig?: {
    responsePath?: string;
    pagination?: {
      type: string;
      pageParam: string;
      limitParam: string;
      pageSize: number;
      nextCursorPath?: string;
      cursorParam?: string;
    };
  },
  params?: Record<string, any>,
): Promise<any[]> => {
  const auth = source.getDecryptedAuth();
  const baseUrl = `${(api.baseUrl || "").replace(/\/+$/, "")}${api.path || ""}`;
  const { headers, basicAuth } = buildRequestConfig(auth);
  const responsePath = datasetConfig?.responsePath || "";
  const pagination = datasetConfig?.pagination;

  const singleFetch = async (extraParams?: Record<string, any>): Promise<{ body: any; data: any[] }> => {
    const mergedParams = { ...(params || {}), ...(extraParams || {}) };
    const bodyResult = buildMdmRequestBody(api, mergedParams);
    if (!bodyResult.ok) throw new Error(bodyResult.error);
    const response = await axios.request({
      url: baseUrl,
      method: api.method || "GET",
      headers: {
        ...headers,
        ...((api.method || "GET") === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      auth: basicAuth,
      params: (api.method || "GET") === "GET" ? mergedParams : undefined,
      data: (api.method || "GET") === "POST" ? bodyResult.body : undefined,
      timeout: 20000,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`MDM source "${source.name}" returned HTTP ${response.status}`);
    }
    return {
      body: response.data,
      data: extractArrayWithPath(response.data, responsePath),
    };
  };

  // No pagination or type=none: single fetch
  if (!pagination || pagination.type === "none" || !pagination.type) {
    return (await singleFetch()).data;
  }

  // Page-based pagination: increment page param until empty page or no new records
  if (pagination.type === "page" || pagination.type === "offset") {
    const allRecords: any[] = [];
    let page = 1;
    const maxPages = 500; // safety cap
    while (page <= maxPages) {
      const extraParams: Record<string, any> = {
        [pagination.limitParam]: pagination.pageSize,
        [pagination.pageParam]: pagination.type === "offset" ? (page - 1) * pagination.pageSize : page,
      };
      const { data } = await singleFetch(extraParams);
      if (!data.length) break;
      allRecords.push(...data);
      // If we got fewer than a full page we've reached the end
      if (data.length < pagination.pageSize) break;
      page++;
    }
    return allRecords;
  }

  // Cursor-based pagination
  if (pagination.type === "cursor" && pagination.cursorParam) {
    const allRecords: any[] = [];
    let cursor: string | undefined;
    const maxPages = 500;
    let page = 0;
    while (page < maxPages) {
      const extraParams: Record<string, any> = {
        [pagination.limitParam]: pagination.pageSize,
        ...(cursor ? { [pagination.cursorParam]: cursor } : {}),
      };
      const { body, data } = await singleFetch(extraParams);
      if (!data.length) break;
      allRecords.push(...data);
      // Extract next cursor from response
      const nextCursor = pagination.nextCursorPath
        ? extractFromPath(body, pagination.nextCursorPath)
        : undefined;
      if (!nextCursor) break;
      cursor = String(nextCursor);
      page++;
    }
    return allRecords;
  }

  // Fallback: single fetch
  return (await singleFetch()).data;
};
export const pickExplicitApiForSource = pickExplicitSourceApi;

const sameScalar = (left: any, right: any) =>
  String(left ?? "").trim() === String(right ?? "").trim();

const filterRowsByConfiguredScalar = (
  rows: Record<string, any>[],
  configuredField: string | undefined,
  expectedValue: string,
): Record<string, any>[] => {
  const field = configuredField?.trim();
  if (!field) return rows;
  const matched = rows.filter((row) =>
    sameScalar(configuredScalar(row, field), expectedValue),
  );

  // Many MDM APIs already apply the request parameter in their own body/query
  // template but do not echo that same filter field in the response. In that
  // case, keep the filtered API result instead of losing the relationship.
  return matched.length ? matched : rows;
};

const scalarValues = (flat?: Record<string, any>) =>
  Object.values(flat || {})
    .filter(
      (value) =>
        value !== undefined &&
        value !== null &&
        value !== "" &&
        typeof value !== "object",
    )
    .map((value) => String(value).toLowerCase());

const parentMatchesQuery = (parent: NormalizedParent, query: string) => {
  const term = query.toLowerCase().trim();
  if (!term) return true;
  const normalizedValues = [
    parent.name,
    parent.firstName,
    parent.lastName,
    parent.mobile,
    parent.email,
    parent.school,
    parent.parentCode,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return [...normalizedValues, ...scalarValues(parent.raw)].some((value) =>
    value.includes(term),
  );
};

const stripInternalRaw = (parent: NormalizedParent): NormalizedParent => {
  const { raw: _raw, children, ...rest } = parent;
  return {
    ...rest,
    children: (children || []).map((child) => {
      const { raw: _childRaw, ...childRest } = child;
      return childRest;
    }),
  };
};

export const fetchMdmOptions = async ({
  sourceId,
  projectId,
  dataType = "custom",
  labelField,
  valueField,
  search,
  searchParam,
  dependsOnValue,
  dependsOnParam,
  dependsOnRemoteField,
  limit = 100,
}: MDMOptionLookupParams): Promise<{
  source: Pick<IMDMSource, "_id" | "name">;
  data: Array<{ label: string; value: string; raw: Record<string, any> }>;
}> => {
  const source = await MDMSource.findById(sourceId);
  if (!source) {
    const master = await PsrMaster.findById(sourceId);
    if (!master) throw new Error("MDM source not found");

    const params: Record<string, any> = {};
    if (search?.trim()) {
      params[searchParam?.trim() || "q"] = search.trim();
    }
    if (dependsOnValue?.trim() && dependsOnParam?.trim()) {
      params[dependsOnParam.trim()] = dependsOnValue.trim();
    }

    const rows = await fetchPsrMasterRows(master, params);
    return {
      source: { _id: master._id as any, name: master.name },
      data: normalizeMdmOptions({
        rows,
        labelField,
        valueField,
        search,
        searchParam,
        dependsOnValue,
        dependsOnRemoteField,
        limit,
      }),
    };
  }
  if (!source.enabled) throw new Error(`MDM source "${source.name}" is disabled`);

  const api = pickExplicitSourceApi(source, dataType, projectId);
  if (!api) throw new Error(`No eligible MDM API found for "${dataType}"`);

  const params: Record<string, any> = {};
  if (search?.trim()) {
    params[searchParam?.trim() || "q"] = search.trim();
  }
  if (dependsOnValue?.trim() && dependsOnParam?.trim()) {
    params[dependsOnParam.trim()] = dependsOnValue.trim();
  }

  const rows = (await fetchRawArray(source, api, params)).map(flattenRecord);
  return {
    source,
    data: normalizeMdmOptions({
      rows,
      labelField,
      valueField,
      search,
      searchParam,
      dependsOnValue,
      dependsOnRemoteField,
      limit,
    }),
  };
};

export const resolveParentSource = async (
  mdmSourceId?: string,
  projectId?: string,
  dataType: MDMDataType = "parents",
): Promise<IMDMSource | null> => {
  if (mdmSourceId) {
    const byId = await MDMSource.findById(mdmSourceId);
    if (byId && byId.enabled && pickExplicitSourceApi(byId, dataType, projectId)) {
      return byId;
    }
    return null;
  }

  const sources = await MDMSource.find({
    enabled: true,
    "apis.dataType": dataType,
  }).sort({ updatedAt: -1, createdAt: -1 });

  return (
    sources.find((source) =>
      pickApiForDataTypeLoose(source, dataType, projectId),
    ) ||
    null
  );
};

const resolveRelationshipSource = async (
  fallbackSource: IMDMSource,
  mdmSourceId?: string,
): Promise<IMDMSource> => {
  if (!mdmSourceId) return fallbackSource;
  const source = await MDMSource.findById(mdmSourceId);
  if (!source || !source.enabled) {
    throw new Error("Configured parent/student relationship MDM source is not available");
  }
  return source;
};

const attachChildrenViaRelationshipApi = async (
  parents: NormalizedParent[],
  parentSource: IMDMSource,
  projectId: string | undefined,
  cfg: any,
) => {
  const mappingSource = await resolveRelationshipSource(
    parentSource,
    cfg.mappingMdmSourceId,
  );
  const mappingDataType = (cfg.mappingDataType || "custom") as MDMDataType;
  const mappingApi = pickExplicitSourceApi(
    mappingSource,
    mappingDataType,
    projectId,
  );
  if (!mappingApi) {
    throw new Error(`No eligible relationship MDM API found for "${mappingDataType}"`);
  }

  const studentSource = await resolveRelationshipSource(
    parentSource,
    cfg.studentMdmSourceId,
  );
  const studentDataType = (cfg.studentDataType || "students") as MDMDataType;
  const studentApi = pickExplicitSourceApi(
    studentSource,
    studentDataType,
    projectId,
  );
  if (!studentApi) {
    throw new Error(`No eligible student MDM API found for "${studentDataType}"`);
  }

  const parentIdField = cfg.parentIdField || "parent_id";
  const mappingParentIdField = cfg.mappingParentIdField || parentIdField;
  const studentIdField = cfg.studentIdField || "student_id";
  const parentIdParam = cfg.parentIdParam || "parent_id";
  const studentIdParam = cfg.studentIdParam || "student_id";
  const studentResponseIdField = cfg.studentResponseIdField || cfg.studentIdField || "student_id";

  for (const parent of parents) {
    const parentId = cfg.parentIdField?.trim()
      ? configuredScalar(parent.raw || {}, parentIdField)
      : parent.parentCode;
    if (!parentId) continue;

    const mappingRows = (await fetchRawArray(mappingSource, mappingApi, {
      [parentIdParam]: parentId,
    })).map(flattenRecord);
    const relevantMappingRows = filterRowsByConfiguredScalar(
      mappingRows,
      mappingParentIdField,
      parentId,
    );
    const studentIds = Array.from(
      new Set(
        relevantMappingRows
          .map((row) => configuredScalar(row, studentIdField))
          .filter(Boolean),
      ),
    ).slice(0, 50);

    const children: NormalizedChild[] = [];
    const seenChildren = new Set<string>();
    for (const studentId of studentIds) {
      const studentRows = (await fetchRawArray(studentSource, studentApi, {
        [studentIdParam]: studentId,
      })).map(flattenRecord);
      const relevantStudentRows = filterRowsByConfiguredScalar(
        studentRows,
        studentResponseIdField,
        studentId,
      );
      for (const flat of relevantStudentRows) {
        if (seenChildren.has(String(studentId))) continue;
        const child = {
          ...normalizeChild(flat),
          parentCode: parentId,
        };
        if (!child.name && !child.grade && !child.enrollmentId) continue;
        children.push(child);
        seenChildren.add(String(studentId));
      }
    }

    if (children.length) parent.children = children;
  }
};

// School × grade × division names from the project's "schools" MDM source
// (one row per combination), kept for a few hours: students carry only the
// ids, and the names change about once a year.
type AcademicNames = {
  school: Map<string, string>;
  grade: Map<string, string>;
  division: Map<string, string>;
};
const academicNamesCache = new Map<string, { at: number; names: AcademicNames }>();
const ACADEMIC_NAMES_TTL_MS = 6 * 60 * 60 * 1000;

const loadAcademicNames = async (projectId?: string): Promise<AcademicNames | null> => {
  const key = projectId || "*";
  const hit = academicNamesCache.get(key);
  if (hit && Date.now() - hit.at < ACADEMIC_NAMES_TTL_MS) return hit.names;
  const source = await resolveParentSource(undefined, projectId, "schools");
  const api = source && pickExplicitSourceApi(source, "schools", projectId);
  if (!source || !api) return null;
  const names: AcademicNames = { school: new Map(), grade: new Map(), division: new Map() };
  const rows = (await fetchRawArray(source, api)).map(flattenRecord);
  const put = (map: Map<string, string>, id: any, name: any) => {
    if (id === undefined || id === null || id === "" || !name) return;
    if (!map.has(String(id))) map.set(String(id), String(name));
  };
  for (const row of rows) {
    put(names.school, row.school_id ?? row.schoolId ?? row.id, row.name ?? row.school_name ?? row.schoolName);
    put(names.grade, row.grade_id ?? row.gradeId, row.grade_name ?? row.gradeName);
    put(names.division, row.division_id ?? row.divisionId, row.division ?? row.division_name ?? row.divisionName);
  }
  academicNamesCache.set(key, { at: Date.now(), names });
  return names;
};

/**
 * Look students up one by one in the Student MDM configured on the project's
 * parent/student relationship (psr.intake.lookup) and return their details
 * (name, enrolment no, school, grade, division) keyed by student id.
 *
 * Only an exact id match is accepted: many MDM APIs ignore a filter they do
 * not know and return their first page, which would put a stranger's child on
 * the parent. If the configured id param finds nothing, the Strapi-style
 * `filters[id][$eq]` is tried before giving up on that student.
 */
export const fetchStudentDetails = async (
  studentIds: string[],
  cfg: any,
  projectId?: string,
): Promise<Map<string, NormalizedChild>> => {
  const out = new Map<string, NormalizedChild>();
  const ids = Array.from(new Set(studentIds.filter(Boolean).map(String))).slice(0, 20);
  if (!ids.length || !cfg?.studentMdmSourceId) return out;
  const source = await MDMSource.findById(cfg.studentMdmSourceId);
  if (!source || !source.enabled) return out;
  const api = pickExplicitSourceApi(
    source,
    (cfg.studentDataType || "students") as MDMDataType,
    projectId,
  );
  if (!api) return out;
  const responseIdField =
    cfg.studentResponseIdField || cfg.studentIdField || "student_id";
  const attempts = [cfg.studentIdParam || "student_id", "filters[id][$eq]"];
  const isStudent = (row: Record<string, any>, id: string) =>
    sameScalar(configuredScalar(row, responseIdField), id) ||
    sameScalar(configuredScalar(row, "id"), id);

  let names: AcademicNames | null = null;
  try {
    names = await loadAcademicNames(projectId);
  } catch (e) {
    console.warn("[mdm] school/grade/division names unavailable:", (e as any)?.message);
  }
  const nameOf = (map: Map<string, string> | undefined, id?: string) =>
    (id && map?.get(String(id))) || undefined;

  await Promise.all(
    ids.map(async (studentId) => {
      try {
        let row: Record<string, any> | undefined;
        for (const param of Array.from(new Set(attempts))) {
          const rows = (
            await fetchRawArray(source, api, { [param]: studentId })
          ).map(flattenRecord);
          row = rows.find((r) => isStudent(r, studentId));
          if (row) break;
        }
        if (!row) return;
        const child = normalizeChild(row);
        const schoolId = fuzzyPick(row, ["crt_school_id", "school_id", "schoolId"]);
        const gradeId = fuzzyPick(row, ["crt_grade_id", "grade_id", "gradeId"]);
        const divisionId = fuzzyPick(row, ["crt_div_id", "division_id", "divisionId", "div_id"]);
        const separated = fuzzyPick(row, [
          "is_parents_seperated",
          "is_parents_separated",
          "parents_separated",
          "isParentsSeparated",
        ]);
        out.set(studentId, {
          ...child,
          separatedParents: separated === "1" || separated === "true",
          enrollmentId:
            fuzzyPick(row, ["crt_enr_on", "enrollment_no", "enrollmentNo", "enr_no"]) ||
            child.enrollmentId,
          school: nameOf(names?.school, schoolId) || child.school,
          grade: nameOf(names?.grade, gradeId) || child.grade,
          division: nameOf(names?.division, divisionId) || child.division,
        });
      } catch (e) {
        console.warn("[mdm] student detail fetch failed:", studentId, (e as any)?.message);
      }
    }),
  );
  return out;
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
  relationshipConfig?: any,
): Promise<{ source: IMDMSource; parents: NormalizedParent[] } | null> => {
  const parentDataType = (relationshipConfig?.parentDataType || "parents") as MDMDataType;
  const source = await resolveParentSource(mdmSourceId, projectId, parentDataType);
  if (!source) return null;
  const parentApi = mdmSourceId
    ? pickExplicitSourceApi(source, parentDataType, projectId)
    : pickApiForDataTypeLoose(source, parentDataType, projectId);
  if (!parentApi) return null;

  const searchParams = query
    ? { q: query, query, search: query, mobile: query, phone: query }
    : undefined;
  const term = (query || "").trim();
  const parents = (await fetchRawArray(source, parentApi, searchParams))
    .map(normalizeParent)
    .filter((parent) => parentMatchesQuery(parent, term))
    .slice(0, 25);

  // If children are not embedded, try a separate children endpoint and join.
  const needChildren = parents.every((p) => p.children.length === 0);
  if (needChildren) {
    if (relationshipConfig?.enabled) {
      try {
        await attachChildrenViaRelationshipApi(
          parents,
          source,
          projectId,
          relationshipConfig,
        );
      } catch (e: any) {
        console.error("MDM parent/student relationship fetch failed:", e.message);
      }
    }
  }

  // Legacy/simple join: if children are not embedded and no relationship bridge
  // populated them, try a direct children/students endpoint sharing parentCode.
  if (parents.every((p) => p.children.length === 0)) {
    const childApi =
      pickApiForDataTypeLoose(source, "children", projectId) ||
      pickApiForDataTypeLoose(source, "students", projectId);
    if (childApi) {
      try {
        const children = (
          await fetchRawArray(source, childApi, searchParams)
        ).map(normalizeChild);
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

  return { source, parents: parents.map(stripInternalRaw) };
};
