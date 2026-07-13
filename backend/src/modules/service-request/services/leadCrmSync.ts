import axios from "axios";
import { Lead } from "../../../models/Lead";
import { Project } from "../../../models/Project";
import APILog from "../../../models/APILog";

const pickExternalId = (data: any): string | undefined =>
  data?.id ||
  data?._id ||
  data?.leadId ||
  data?.lead_id ||
  data?.enquiryId ||
  data?.enquiry_id ||
  data?.data?.id ||
  data?.data?.leadId ||
  data?.data?.enquiryId;

const defaultPayload = (lead: any, project: any) => ({
  leadId: String(lead._id),
  projectId: String(lead.projectId),
  projectName: project?.name,
  name: lead.name,
  email: lead.email,
  contactNumber: lead.contactNumber,
  studentName: lead.studentName,
  grade: lead.grade,
  enquiryNo: lead.enquiryNo,
  source: lead.source,
  status: lead.status,
  notes: lead.notes,
  createdAt: lead.createdAt,
});

const getPath = (obj: any, path: string): any =>
  path
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);

const renderTemplateValue = (value: any, context: Record<string, any>): any => {
  if (Array.isArray(value)) return value.map((item) => renderTemplateValue(item, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        renderTemplateValue(item, context),
      ]),
    );
  }
  if (typeof value !== "string") return value;

  const exact = value.match(/^{{\s*([^}]+)\s*}}$/);
  if (exact) {
    const resolved = getPath(context, exact[1]);
    return resolved === undefined ? "" : resolved;
  }

  return value.replace(/{{\s*([^}]+)\s*}}/g, (_match, path) => {
    const resolved = getPath(context, path);
    return resolved === undefined || resolved === null ? "" : String(resolved);
  });
};

export const buildLeadCrmPayload = (lead: any, project: any, cfg?: any) => {
  const formData =
    lead?.formData && typeof lead.formData === "object" ? lead.formData : {};
  const baseLead = {
    ...formData,
    ...lead,
    formData,
    leadId: String(lead._id || lead.leadId || ""),
    projectId: String(lead.projectId || project?._id || ""),
    firstName:
      lead.firstName ||
      formData.firstName ||
      formData.parentFirstName ||
      String(lead.name || "")
        .trim()
        .split(/\s+/)[0] ||
      "",
    lastName:
      lead.lastName ||
      formData.lastName ||
      formData.parentLastName ||
      String(lead.name || "")
        .trim()
        .split(/\s+/)
        .slice(1)
        .join(" "),
  };
  const context = {
    lead: baseLead,
    project,
    now: new Date().toISOString(),
  };

  const template = cfg?.bodyTemplate || cfg?.payloadTemplate;
  if (!template) return defaultPayload(baseLead, project);

  try {
    const parsed = typeof template === "string" ? JSON.parse(template) : template;
    return renderTemplateValue(parsed, context);
  } catch {
    return defaultPayload(baseLead, project);
  }
};

const resolveCrmConfig = (project: any) => {
  const cfg =
    project?.configuration?.sr?.crm?.leadSync ||
    project?.configuration?.sr?.leadCrm ||
    {};
  const endpoint =
    cfg.endpoint ||
    cfg.apiUrl ||
    cfg.webhookUrl ||
    process.env.CRM_LEAD_WEBHOOK_URL ||
    process.env.LEAD_CRM_WEBHOOK_URL ||
    "";
  return {
    enabled:
      cfg.enabled !== undefined
        ? !!cfg.enabled
        : !!endpoint,
    endpoint,
    method: String(cfg.method || "POST").toUpperCase(),
    timeoutMs: Number(cfg.timeoutMs || process.env.CRM_LEAD_TIMEOUT_MS || 30000),
    headers: {
      "Content-Type": "application/json",
      ...(cfg.headers || {}),
      ...(cfg.authHeaderName && cfg.authHeaderValue
        ? { [cfg.authHeaderName]: cfg.authHeaderValue }
        : {}),
      ...(process.env.CRM_LEAD_AUTH_HEADER_NAME &&
      process.env.CRM_LEAD_AUTH_HEADER_VALUE
        ? {
            [process.env.CRM_LEAD_AUTH_HEADER_NAME]:
              process.env.CRM_LEAD_AUTH_HEADER_VALUE,
          }
        : {}),
    },
    bodyTemplate: cfg.bodyTemplate || cfg.payloadTemplate,
  };
};

export const syncLeadToCrm = async (leadId: string) => {
  const lead = await Lead.findById(leadId);
  if (!lead) return null;

  const project = await Project.findById(lead.projectId)
    .select("name configuration.sr.crm configuration.sr.leadCrm")
    .lean();
  const crm = resolveCrmConfig(project);
  const payload = buildLeadCrmPayload(lead.toObject(), project, crm);

  if (!crm.endpoint || !crm.enabled) {
    lead.crmSyncStatus = "failed";
    lead.crmSyncReason = !crm.endpoint
      ? "CRM lead API is not configured for this project."
      : "CRM lead API is configured but disabled for this project.";
    lead.crmLastPayload = payload;
    await lead.save();
    return lead;
  }

  const startedAt = Date.now();
  try {
    const response = await axios.request({
      method: crm.method as any,
      url: crm.endpoint,
      data: payload,
      headers: crm.headers,
      timeout: crm.timeoutMs,
      validateStatus: () => true,
    });

    const ok = response.status >= 200 && response.status < 300;
    lead.crmSyncStatus = ok ? "synced" : "failed";
    lead.crmSyncReason = ok
      ? undefined
      : `CRM API returned HTTP ${response.status}`;
    lead.crmSyncedAt = ok ? new Date() : undefined;
    lead.crmExternalId = pickExternalId(response.data);
    lead.crmLastPayload = payload;
    lead.crmLastResponse =
      response.data && typeof response.data === "object"
        ? response.data
        : { body: response.data };
    await lead.save();

    await APILog.create({
      projectId: lead.projectId,
      projectName: project?.name,
      apiType: "other",
      endpoint: crm.endpoint,
      method: crm.method,
      requestHeaders: crm.headers,
      requestBody: payload,
      responseStatus: response.status,
      responseBody: lead.crmLastResponse,
      status: ok ? "success" : "failed",
      error: ok ? undefined : lead.crmSyncReason,
      metadata: { source: "lead_crm_sync", leadId: String(lead._id) },
      attempt: 1,
      executionTime: Date.now() - startedAt,
      sentAt: new Date(),
    });

    return lead;
  } catch (err: any) {
    const isTimeout = err?.code === "ECONNABORTED";
    lead.crmSyncStatus = "failed";
    lead.crmSyncReason = isTimeout
      ? "CRM API request timed out."
      : err?.response?.data?.message ||
        err?.message ||
        "CRM API request failed.";
    lead.crmLastPayload = payload;
    if (err?.response?.data) {
      lead.crmLastResponse =
        typeof err.response.data === "object"
          ? err.response.data
          : { body: err.response.data };
    }
    await lead.save();

    await APILog.create({
      projectId: lead.projectId,
      projectName: project?.name,
      apiType: "other",
      endpoint: crm.endpoint || "not_configured",
      method: crm.method,
      requestHeaders: crm.headers,
      requestBody: payload,
      responseStatus: err?.response?.status,
      responseBody: lead.crmLastResponse,
      error: lead.crmSyncReason,
      status: isTimeout ? "timeout" : "failed",
      metadata: { source: "lead_crm_sync", leadId: String(lead._id) },
      attempt: 1,
      executionTime: Date.now() - startedAt,
      sentAt: new Date(),
    });

    return lead;
  }
};
