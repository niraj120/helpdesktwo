import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import SrPage from "../../components/sr/SrPage";
import { srStyles, srButton, SR } from "../../utils/srTheme";
import { useProjectContext } from "../../contexts/ProjectContext";
import { useBranding } from "../../contexts/BrandingContext";
import { usePermissions } from "../../hooks/usePermissions";
import { PERMISSIONS } from "../../constants/permissions";
import { api } from "../../utils/api";
import { serviceRequestApi } from "../../services/serviceRequests";
import { FormRenderer } from "../../components/FormRenderer";
import { searchPipeline } from "../../services/psrPipelineService";
import { searchPsrTable } from "../../services/psrBuilderService";
import { conditionEngine, FormFieldSchema } from "../../utils/conditionEngine";
import HierarchyCategorySelector, {
  CategoryHierarchyValue,
} from "../../components/HierarchyCategorySelector";

interface ProjectOpt {
  _id: string;
  name: string;
  code?: string;
}
interface CategoryNode {
  _id: string;
  name: string;
  parentId?: string | null;
  path?: string;
  sr?: {
    proactiveHelpText?: string;
    appliesTo?: Array<"normal" | "PSR" | "ISR">;
  };
}
interface ChildOpt {
  id?: string;
  name?: string;
  grade?: string;
  enrollmentId?: string;
}
interface ParentOpt {
  name?: string;
  mobile?: string;
  email?: string;
  school?: string;
  parentCode?: string;
  children?: ChildOpt[];
}
interface ClassifyChannel {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  color?: string;
  enabled: boolean;
  order: number;
  requiredPermission?: string;
  flow: string;
  routing?: { interactionType?: "PSR" | "ISR"; target?: string };
}

interface SrFormSchema {
  id: string;
  name: string;
  interactionType: "PSR" | "ISR";
  channel: string;
  isActive?: boolean;
  fields: FormFieldSchema[];
}

type Step = "type" | "classify" | "form";

type SourceContext = {
  type: "email" | "ivr";
  id: string;
  sourceIds?: string[];
  returnTo: string;
  uniqueId?: string;
  fromName?: string;
  fromEmail?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  sourceEmailConfigId?: string;
  callerName?: string;
  callerMobile?: string;
  subject?: string;
  body?: string;
  /**
   * The source record's own project. Authoritative when the user has not
   * selected one — a super admin opening an IVR call has no project context,
   * so without this the SR config is never fetched and no channels render.
   */
  projectId?: string;
  /**
   * Skip the "How would you classify this?" step and open this channel's form
   * directly. Used when the caller already told us the classification — e.g.
   * "Mark Junk" on an IVR call opens the Junk / Telemarketing channel.
   */
  preselectChannelFlow?: string;
};

const stripHtml = (value?: string) =>
  String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeFieldKey = (value?: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const CORE_SR_FIELD_KEYS = new Set([
  "subject",
  "title",
  "description",
  "comments",
  "comment",
  "remarks",
]);

const SUBJECT_FIELD_KEYS = new Set(["subject", "title"]);
const DESCRIPTION_FIELD_KEYS = new Set([
  "description",
  "comments",
  "comment",
  "remarks",
]);
const SOURCE_EMAIL_FIELD_KEYS = new Set([
  "email",
  "parentemail",
  "enquireremail",
  "enquiryemail",
  "fromemail",
]);
const SOURCE_NAME_FIELD_KEYS = new Set([
  "name",
  "parentname",
  "enquirername",
  "enquiryname",
  "fullname",
  "firstname",
]);
const SOURCE_MOBILE_FIELD_KEYS = new Set([
  "mobile",
  "phone",
  "contact",
  "contactnumber",
  "parentmobile",
]);

const fieldMatchesAnyKey = (
  field: { id?: string; label?: string; fieldName?: string; fieldLabel?: string; name?: string; key?: string },
  keys: Set<string>,
) =>
  [
    field.id,
    field.label,
    field.fieldName,
    field.fieldLabel,
    field.name,
    field.key,
  ]
    .map(normalizeFieldKey)
    .some((key) => keys.has(key));

const applySourceValueToField = (
  field: { id?: string; label?: string; fieldName?: string; fieldLabel?: string; name?: string; key?: string },
  sourceContext?: SourceContext,
) => {
  if (!sourceContext || sourceContext.type !== "email") return "";
  const keys = [
    field.id,
    field.label,
    field.fieldName,
    field.fieldLabel,
    field.name,
    field.key,
  ].map(normalizeFieldKey);
  if (keys.some((key) => SOURCE_EMAIL_FIELD_KEYS.has(key))) {
    return sourceContext.fromEmail || "";
  }
  if (keys.some((key) => SOURCE_NAME_FIELD_KEYS.has(key))) {
    return sourceContext.fromName || "";
  }
  if (keys.some((key) => SOURCE_MOBILE_FIELD_KEYS.has(key))) {
    return "";
  }
  return "";
};

const normalizeSchemaValue = (value?: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const deepestCategoryId = (value?: CategoryHierarchyValue) =>
  value?.level5 ||
  value?.level4 ||
  value?.level3 ||
  value?.level2 ||
  value?.level1 ||
  "";

const isProspectParentSchema = (schema: SrFormSchema) => {
  const channel = normalizeSchemaValue(schema.channel);
  const name = normalizeSchemaValue(schema.name);
  return (
    schema.isActive !== false &&
    normalizeSchemaValue(schema.interactionType) === "psr" &&
    (channel === "prospectparent" ||
      channel === "crmlead" ||
      channel === "lead" ||
      name.includes("prospectparent") ||
      name.includes("crmlead"))
  );
};

const ServiceRequestCreate: React.FC<{
  embedded?: boolean;
  hideProjectSelector?: boolean;
}> = ({ embedded, hideProjectSelector }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isProjectPortal = location.pathname.includes("/portal/");
  const detailPath = (id: string) =>
    isProjectPortal
      ? `${location.pathname.replace(/\/service-requests(?:\/.*)?$/, "")}/service-requests/${id}`
      : `/service-requests/${id}`;
  const linkedPsrId = (location.state as any)?.linkedPsrId as
    | string
    | undefined;
  const linkedParentTicketId = ((location.state as any)?.linkedParentTicketId ||
    linkedPsrId) as string | undefined;
  const routeSourceContext = (location.state as any)?.sourceContext as
    | SourceContext
    | undefined;
  const [resolvedSourceContext, setResolvedSourceContext] = useState<
    SourceContext | undefined
  >(routeSourceContext);
  const sourceContext = resolvedSourceContext;
  const { currentProjectId, userProjects } = useProjectContext();
  const { branding } = useBranding();
  const { hasPermission } = usePermissions();

  // Permission booleans (global). Whether the option is actually OFFERED also
  // depends on the SELECTED project having SR/PSR/ISR enabled (see canPSR/canISR
  // below) — otherwise a permitted user would see SR for every project even ones
  // where it was never turned on.
  const permPSR = hasPermission(PERMISSIONS.SR_PSR_CREATE);
  const permISR = hasPermission(PERMISSIONS.SR_ISR_CREATE);
  const canAssignEmails = hasPermission(PERMISSIONS.SR_ASSIGN_EMAILS);
  const canPriority = hasPermission(PERMISSIONS.SR_PRIORITY_OVERRIDE);
  const canOffline = hasPermission(PERMISSIONS.SR_OFFLINE_ENTRY);

  // A project portal has no ProjectContext selection — it resolves its project
  // by domain through BrandingContext. Without this fallback projectId stays
  // empty inside the portal, the SR config never loads, and the classify step
  // renders "No channels configured" for a project that has them.
  const portalProjectId = isProjectPortal ? branding?.projectId : undefined;

  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [projectId, setProjectId] = useState(
    routeSourceContext?.projectId || currentProjectId || portalProjectId || "",
  );
  const [config, setConfig] = useState<any>(null);
  // config stays null both while loading AND when the request fails, so track
  // the fetch itself — otherwise a failure reads as a permanent "Loading…".
  const [configLoading, setConfigLoading] = useState(false);
  const [formSchemas, setFormSchemas] = useState<SrFormSchema[]>([]);

  const [step, setStep] = useState<Step>("type");
  const [interactionType, setInteractionType] = useState<"PSR" | "ISR" | "">(
    "",
  );
  const [channel, setChannel] = useState<ClassifyChannel | null>(null);

  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [categoryHierarchy, setCategoryHierarchy] =
    useState<CategoryHierarchyValue>({});
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [formData, setFormData] = useState<Record<string, any>>({});
  const effectiveSubject = subject || sourceContext?.subject || "";
  const effectiveDescription = description || sourceContext?.body || "";

  // Existing-parent flow
  const [parentQuery, setParentQuery] = useState("");
  const [parentResults, setParentResults] = useState<ParentOpt[]>([]);
  const [parent, setParent] = useState<ParentOpt | null>(null);
  const [parentSource, setParentSource] = useState<string>("");
  const [parentLookupError, setParentLookupError] = useState<string>("");
  const [selectedChildren, setSelectedChildren] = useState<number[]>([]);
  const [searching, setSearching] = useState(false);
  // PSR pipeline search: stale-collection banner (US-4.2)
  const [psrStaleWarning, setPsrStaleWarning] = useState<string | null>(null);

  // Custom channel fields (category dropdowns, static dropdowns, text inputs
  // configured in SR Settings → per-channel form builder)
  const [customCatFields, setCustomCatFields] = useState<Record<string, CategoryHierarchyValue>>({});
  const [customFieldData, setCustomFieldData] = useState<Record<string, any>>({})

  // Prospect-parent flow
  const [prospect, setProspect] = useState({
    name: "",
    mobile: "",
    email: "",
    enquiry: "",
  });
  const [prospectFormData, setProspectFormData] = useState<Record<string, any>>(
    {},
  );

  // Assignee-emails block (ISR)
  const [assigneeEmails, setAssigneeEmails] = useState("");

  // Priority & schedule block
  const [overridePriority, setOverridePriority] = useState(false);
  const [priority, setPriority] = useState("MEDIUM");
  const [scheduleDate, setScheduleDate] = useState("");

  // Offline / RE-entry block
  const [createdByRE, setCreatedByRE] = useState(false);
  const [requesterEmail, setRequesterEmail] = useState("");
  const [otpKey, setOtpKey] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpMsg, setOtpMsg] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const debounce = useRef<any>(null);

  const singleProject = userProjects.length === 1;

  useEffect(() => {
    if (routeSourceContext?.type) {
      setResolvedSourceContext(routeSourceContext);
    }
  }, [routeSourceContext?.type, routeSourceContext?.id]);

  useEffect(() => {
    if (routeSourceContext?.type || resolvedSourceContext?.type) return;
    const params = new URLSearchParams(location.search);
    const sourceType = params.get("sourceType");
    const sourceId = params.get("sourceId");
    if (!sourceId || (sourceType !== "email" && sourceType !== "ivr")) return;

    let alive = true;
    (async () => {
      try {
        if (sourceType === "email") {
          const response = await serviceRequestApi.emailIntake.get(sourceId);
          const email = response?.data || response;
          if (!alive || !email) return;
          setResolvedSourceContext({
            type: "email",
            id: email._id || sourceId,
            returnTo: `${location.pathname}?tab=email`,
            uniqueId: email.uniqueId,
            fromName: email.fromName,
            fromEmail: email.fromEmail,
            subject: email.subject,
            body: email.body || stripHtml(email.htmlBody),
            messageId: email.messageId,
            inReplyTo: email.inReplyTo,
            references: email.references,
            sourceEmailConfigId: email.projectEmailConfigId,
            projectId: email.projectId,
          });
        } else {
          const response = await serviceRequestApi.ivr.get(sourceId);
          const call = response?.data || response;
          if (!alive || !call) return;
          setResolvedSourceContext({
            type: "ivr",
            id: call._id || sourceId,
            returnTo: `${location.pathname}?tab=ivr`,
            projectId: call.projectId,
            callerName: call.callerName,
            callerMobile: call.callerMobile,
            subject: `IVR call from ${call.callerName || call.callerMobile}`,
            body: `Converted from IVR call ${call.externalId || call._id || sourceId}. Caller: ${call.callerName || "Unknown"} (${call.callerMobile || ""}).`,
          });
        }
      } catch (error) {
        console.error("Failed to restore SR source context", error);
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    location.pathname,
    location.search,
    resolvedSourceContext?.type,
    routeSourceContext?.type,
  ]);

  const applySourceContextFields = () => {
    if (!sourceContext?.type) return;
    setInteractionType("PSR");
    setStep("classify");
    setSubject(sourceContext.subject || "");
    setDescription(sourceContext.body || "");
  };

  const prefillFromSourceContext = () => {
    if (!sourceContext || sourceContext.type !== "email") return;
    setParentQuery(sourceContext.fromEmail || sourceContext.fromName || "");
    setProspect((prev) => ({
      ...prev,
      name: prev.name || sourceContext.fromName || "",
      email: prev.email || sourceContext.fromEmail || "",
      enquiry: prev.enquiry || sourceContext.body || "",
    }));
    setProspectFormData((prev) => {
      const next = { ...prev };
      prospectFormFields.forEach((field: any) => {
        const fieldName = field.fieldName || field.id || field.name || field.key;
        if (!fieldName || next[fieldName]) return;
        const value = applySourceValueToField(field, sourceContext);
        if (value) next[fieldName] = value;
      });
      return next;
    });
  };

  /* ---- load projects + auto-pick ---- */
  useEffect(() => {
    if (hideProjectSelector) return;
    (async () => {
      try {
        const res = await api.get("/projects", { params: { limit: 100 } });
        const d: any = res.data;
        const list = d?.data?.projects || d?.projects || d?.data || d || [];
        setProjects(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [hideProjectSelector]);

  useEffect(() => {
    if (projectId) return;
    // The source record's project wins: it is the project the email/call
    // actually belongs to, and the user may have selected none at all.
    if (sourceContext?.projectId) setProjectId(sourceContext.projectId);
    // Inside a portal the portal's own project comes next — it is the project
    // the agent is looking at, regardless of how many they belong to.
    else if (portalProjectId) setProjectId(portalProjectId);
    else if (singleProject) setProjectId(userProjects[0]._id);
    else if (currentProjectId) setProjectId(currentProjectId);
  }, [
    singleProject,
    userProjects,
    currentProjectId,
    portalProjectId,
    sourceContext?.projectId,
  ]); // eslint-disable-line

  // Linked-ISR entry (from a PSR "Create linked ISR" button): force ISR + skip
  // the type step.
  useEffect(() => {
    if (linkedParentTicketId) {
      setInteractionType("ISR");
      setStep("form");
    }
  }, [linkedParentTicketId]);

  /* ---- load SR config + categories on project change ---- */
  useEffect(() => {
    if (!projectId) {
      setConfig(null);
      setCategories([]);
      setFormSchemas([]);
      return;
    }
    (async () => {
      setConfigLoading(true);
      try {
        const r = await serviceRequestApi.getConfig(projectId);
        setConfig(r.data || null);
      } catch (e) {
        console.error(e);
        setConfig(null);
      } finally {
        setConfigLoading(false);
      }
      try {
        const r = await serviceRequestApi.listForms(projectId);
        setFormSchemas(r.data || []);
      } catch (e) {
        console.error(e);
        setFormSchemas([]);
      }
      try {
        const res = await api.get("/categories", { params: { projectId } });
        const d: any = res.data;
        const list: CategoryNode[] =
          d?.data?.categories || d?.categories || d?.data || d || [];
        setCategories(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error(e);
        setCategories([]);
      }
    })();
  }, [projectId]);

  const leafCategories = useMemo(() => {
    const activeType = ((channel?.routing?.interactionType as any) ||
      interactionType ||
      "PSR") as "PSR" | "ISR";
    const parentIds = new Set(
      categories
        .map((c) => (c.parentId ? String(c.parentId) : ""))
        .filter(Boolean),
    );
    return categories
      .filter((c) => !parentIds.has(String(c._id)))
      .filter((c) => {
        const appliesTo = c.sr?.appliesTo || [];
        if (appliesTo.includes("PSR") && appliesTo.includes("ISR")) {
          return activeType === "PSR";
        }
        return appliesTo.length === 1 && appliesTo[0] === activeType;
      })
      .sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name));
  }, [categories, interactionType, channel]);

  const channels: ClassifyChannel[] = useMemo(() => {
    const raw: ClassifyChannel[] = config?.classifyChannels || [];
    return raw
      .filter((c) => c.enabled)
      .filter((c) => {
        // PSR starts with a source/intent selection: existing parent,
        // prospect, job, junk, etc. The selected card then decides the final
        // routing and form. Do not hide cards only because their routing target
        // eventually creates an ISR/lead/junk record.
        if (interactionType === "PSR") return true;
        return (
          !interactionType ||
          !c.routing?.interactionType ||
          c.routing.interactionType === interactionType
        );
      })
      .filter(
        (c) => !c.requiredPermission || hasPermission(c.requiredPermission),
      )
      .sort((a, b) => a.order - b.order);
  }, [config, interactionType]); // eslint-disable-line

  const blocks = config?.blocks || {};

  // Per-project enablement gates the offering. config loads async per project;
  // until it arrives (or if SR is off for the project) no type cards show.
  const srEnabled = !!config?.enabled;
  const canPSR = permPSR && srEnabled && !!config?.psr?.enabled;
  const canISR = permISR && srEnabled && !!config?.isr?.enabled;
  const srDisabledHere = !!projectId && config !== null && !srEnabled;

  /* ---- parent search ---- */
  const onParentQuery = (q: string) => {
    setParentQuery(q);
    setParent(null);
    setParentLookupError("");
    setSelectedChildren([]);
    setPsrStaleWarning(null);
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 3) {
      setParentResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        setSearching(true);
        const lookupSource = config?.psr?.intake?.lookup?.source;
        const psrBuilderTableId = config?.psr?.intake?.lookup?.psrBuilderTableId;
        const psrPipelineId = config?.psr?.intake?.lookup?.psrPipelineId;

        if (lookupSource === "psr_builder" && psrBuilderTableId) {
          // Each PSR Builder row = one guardian→student mapping.
          // Fetch up to 100 rows so all children of a matching parent are included,
          // then group by parent and collect students as children[].
          const res = await searchPsrTable(psrBuilderTableId, q.trim(), 100);
          if (!res.success) {
            setParentResults([]);
            setParentLookupError(res.error || "PSR Builder table search failed.");
            return;
          }
          if (res.data.total === 0 && q.trim().length >= 3) {
            const collectionTotal: number = res.data.collectionTotal ?? 0;
            if (collectionTotal === 0) {
              // Table collection is genuinely empty — sync hasn't run yet
              setPsrStaleWarning(
                "The PSR Builder table is empty. Go to Integrations › PSR Builder and run a sync first.",
              );
            } else {
              // Table has data but no row matches this query
              setPsrStaleWarning(
                `No results match "${q.trim()}". Try name, mobile number, email or student ID.`,
              );
            }
          }
          // Map flat table rows → ParentOpt, grouping by parent so all children appear together.
          // Each row = one guardian→student mapping; same parent can appear in multiple rows.
          const parentMap = new Map<string, ParentOpt>();
          for (const doc of res.data.results) {
            // Flexible column finder — matches any column whose key contains the pattern
            const findCol = (...patterns: string[]) => {
              for (const p of patterns) {
                const key = Object.keys(doc).find(k => k.toLowerCase().includes(p.toLowerCase()));
                if (key && doc[key] != null && doc[key] !== "") return String(doc[key]);
              }
              return "";
            };

            const parentFirstName = findCol("parent master - first name", "first name", "first_name");
            const parentLastName  = findCol("parent master - last name",  "last name",  "last_name");
            const parentName      = (parentFirstName + " " + parentLastName).trim() || findCol("parent master - name", "name") || "(no name)";
            const mobile          = findCol("parent master - mobile", "mobile", "phone", "contact");
            const email           = findCol("parent master - email",  "email");
            const school          = findCol("school", "centre", "college");
            const parentCode      = findCol("parent master - id", "guardian master - guardian id", "guardian id", "guardian_id", "parent id", "parent_id");

            // Student / child info from student master columns
            const studentId    = findCol("student master - id",         "student id",    "student_id");
            const studentFirst = findCol("student master - first name",  "student first");
            const studentLast  = findCol("student master - last name",   "student last");
            const studentName  = (studentFirst + " " + studentLast).trim() || studentFirst || "";
            const grade        = findCol("grade", "class", "standard");

            // Key for grouping — prefer guardian/parent ID, fall back to name+mobile
            const groupKey = parentCode || (parentName + "|" + mobile);

            if (parentMap.has(groupKey)) {
              // Add student as another child of the existing parent entry
              if (studentName || studentId) {
                parentMap.get(groupKey)!.children!.push({
                  id:   studentId   || undefined,
                  name: studentName || undefined,
                  grade: grade      || undefined,
                });
              }
            } else {
              parentMap.set(groupKey, {
                name:       parentName || undefined,
                mobile:     mobile     || undefined,
                email:      email      || undefined,
                school:     school     || undefined,
                parentCode: parentCode || undefined,
                children:   (studentName || studentId)
                  ? [{ id: studentId || undefined, name: studentName || undefined, grade: grade || undefined }]
                  : [],
              });
            }
          }
          const results: ParentOpt[] = Array.from(parentMap.values())
            .filter(r => r.name || r.mobile || r.email);
          setParentResults(results);
          setParentSource("PSR Builder");

        } else if (psrPipelineId) {
          // US-4.2 — Use new PSR Pipeline search endpoint
          const res = await searchPipeline(psrPipelineId, q.trim(), {
            limit: 25,
          });
          if (!res.success) {
            setParentResults([]);
            setParentLookupError(res.error || "PSR pipeline search failed.");
            return;
          }
          const embedField =
            config?.psr?.intake?.lookup?.psrEmbedField || "students";
          const nameField = config?.psr?.intake?.lookup?.psrNameField || "name";
          // Show stale banner if no results (collection might be empty)
          if (res.data.total === 0 && q.trim().length >= 3) {
            setPsrStaleWarning(
              "No results found. The pipeline collection may be empty or not yet synced — run a sync in Integrations › PSR Pipelines.",
            );
          }
          // US-4.2/4.3: Map pipeline documents → ParentOpt
          const results: ParentOpt[] = res.data.results.map((doc: any) => ({
            name: doc[nameField] || doc.name || doc.fullName || "",
            mobile: doc.mobile || doc.phone || doc.contactNumber || "",
            email: doc.email || doc.emailAddress || "",
            school: doc.school || doc.schoolName || doc.centre || "",
            parentCode: doc.parentCode || doc.externalId || doc.id || "",
            // US-4.3: embedded students array — passed as children
            children: Array.isArray(doc[embedField])
              ? doc[embedField].map((c: any) => ({
                  id: c.studentId || c.id || c._id,
                  name: c.name || c.studentName || c.fullName || "",
                  grade: c.grade || c.gradeLabel || c.class || "",
                  enrollmentId:
                    c.enrollmentId || c.admissionNo || c.rollNo || "",
                }))
              : [],
          }));
          setParentResults(results);
          setParentSource("PSR Pipeline");
        } else {
          // Legacy MDM lookup (unchanged)
          const r = await serviceRequestApi.parentLookup(q.trim(), projectId);
          setParentResults(r.data || []);
          setParentSource(r.source?.name || "");
        }
      } catch (e: any) {
        console.error(e);
        setParentResults([]);
        setParentSource("");
        setParentLookupError(
          e?.response?.data?.message ||
            e?.response?.data?.error ||
            "Parent lookup failed.",
        );
      } finally {
        setSearching(false);
      }
    }, 250); // US-4.2: 250ms debounce
  };

  const sendOtp = async () => {
    setOtpMsg("");
    try {
      const r = await api.post("/otp/send-email", {
        email: requesterEmail,
        projectId,
      });
      setOtpKey(r.data?.otpKey || r.data?.data?.otpKey || "");
      setOtpMsg("OTP sent.");
    } catch (e: any) {
      setOtpMsg(e?.response?.data?.message || "Failed to send OTP.");
    }
  };

  const verifyOtp = async () => {
    setOtpMsg("");
    try {
      await api.post("/otp/verify", { otpKey, otp: otpCode });
      setOtpVerified(true);
      setOtpMsg("Email verified ✓");
    } catch (e: any) {
      setOtpMsg(e?.response?.data?.message || "Invalid OTP.");
    }
  };

  const resetFlow = (options?: { keepSourceContext?: boolean }) => {
    setChannel(null);
    setCategoryId("");
    setCategoryHierarchy({});
    setSubject("");
    setDescription("");
    setFormData({});
    setParent(null);
    setParentQuery("");
    setParentResults([]);
    setParentSource("");
    setParentLookupError("");
    setSelectedChildren([]);
    setProspect({ name: "", mobile: "", email: "", enquiry: "" });
    setProspectFormData({});
    setAssigneeEmails("");
    setMsg(null);
    setCustomCatFields({});
    setCustomFieldData({});
    if (options?.keepSourceContext) {
      applySourceContextFields();
    }
  };;

  const pickType = (t: "PSR" | "ISR") => {
    setInteractionType(t);
    resetFlow({ keepSourceContext: true });
    if (t === "PSR") {
      setStep("classify");
      return;
    }
    setStep("form");
  };

  const pickChannel = (c: ClassifyChannel) => {
    setChannel(c);
    setMsg(null);
    setStep("form");
  };

  // The caller may already know the classification (e.g. "Mark Junk" on an IVR
  // call). Once the project's channels have loaded, open that channel's form
  // instead of asking the agent to pick it again. Runs once per source: if the
  // agent then goes Back to the classify step, we leave them there.
  const preselectedFlowRef = useRef<string | null>(null);
  useEffect(() => {
    const wanted = sourceContext?.preselectChannelFlow;
    if (!wanted || !channels.length) return;
    const key = `${sourceContext?.type}:${sourceContext?.id}:${wanted}`;
    if (preselectedFlowRef.current === key) return;
    const match = channels.find(
      (c) => c.flow === wanted || c.key === wanted,
    );
    if (!match) return; // channel disabled for this project — leave the picker
    preselectedFlowRef.current = key;
    setInteractionType("PSR");
    pickChannel(match);
  }, [
    channels,
    sourceContext?.preselectChannelFlow,
    sourceContext?.type,
    sourceContext?.id,
  ]); // eslint-disable-line

  const finalInteraction = (): "PSR" | "ISR" =>
    (channel?.routing?.interactionType as any) || interactionType || "PSR";

  const flow = channel?.flow || "others";
  const blockCfg = (key: string, fallback: Record<string, any>) => ({
    ...fallback,
    ...(blocks?.[key] || {}),
  });
  const parentLookupBlock = blockCfg("parentLookup", {
    enabled: true,
    label: "Search Parent (MDM)",
    placeholder: "Search by parent name, mobile or email",
    required: true,
  });
  const childSelectionBlock = blockCfg("childSelection", {
    enabled: true,
    label: "Select child(ren)",
    required: true,
  });
  const categoryBlock = blockCfg("category", {
    enabled: true,
    label: "Category / Sub-category",
    placeholder: "Select a sub-category...",
    required: true,
  });
  const subjectBlock = blockCfg("subject", {
    enabled: true,
    label: "Subject",
    placeholder: "Brief subject",
    required: true,
  });
  const descriptionBlock = blockCfg("description", {
    enabled: true,
    label: "Description / Comments",
    placeholder: "Details of the request / complaint",
    required: false,
  });
  const dynamicFieldsBlock = blockCfg("dynamicFields", {
    enabled: true,
    label: "Additional Details",
  });

  const activeSrForm = useMemo(() => {
    const type = linkedParentTicketId ? "ISR" : finalInteraction();
    return (
      formSchemas.find(
        (s) =>
          s.isActive !== false &&
          s.interactionType === type &&
          s.channel === "walk_in",
      ) ||
      formSchemas.find(
        (s) =>
          s.isActive !== false &&
          s.interactionType === type &&
          s.channel === "online",
      ) ||
      null
    );
  }, [formSchemas, interactionType, channel, linkedParentTicketId]);

  const activeSrFormFields = useMemo(() => {
    const fields = activeSrForm?.fields || [];
    return fields.filter((field: any) => {
      const keys = [
        field.fieldName,
        field.fieldLabel,
        field.name,
        field.label,
        field.key,
      ].map(normalizeFieldKey);
      return !keys.some((key) => CORE_SR_FIELD_KEYS.has(key));
    });
  }, [activeSrForm]);

  // ── Custom channel fields (from SR Settings → per-channel form builder) ──
  // ISR is picked straight from the type step, so there is no classify channel
  // to key off. Its form is stored under the "isr" key, not the "others" flow
  // fallback — without this the ISR form built in SR Settings never renders.
  const customFieldsKey =
    linkedParentTicketId || interactionType === "ISR"
      ? "isr"
      : (channel?.key ?? flow);
  const customChannelFields = useMemo(
    () => ((config?.customChannelFields ?? {})[customFieldsKey] ?? []) as Array<{
      id: string; label: string; type: string; required?: boolean;
      dataSource: string; staticOptions?: string[];
    }>,
    [config, customFieldsKey],
  );
  const customCategoryFieldsList = useMemo(
    () => customChannelFields.filter(f => f.dataSource === "category"),
    [customChannelFields],
  );

  const prospectSrForm = useMemo(() => {
    if (flow !== "prospect_parent") return null;
    return (
      formSchemas.find(isProspectParentSchema) ||
      formSchemas.find(
        (s) =>
          s.isActive !== false &&
          normalizeSchemaValue(s.interactionType) === "psr" &&
          normalizeSchemaValue(s.channel) === "online",
      ) ||
      null
    );
  }, [formSchemas, flow]);

  const prospectFormFields = useMemo(() => {
    const fields = prospectSrForm?.fields || [];
    return fields.filter((field: any) => {
      const keys = [
        field.fieldName,
        field.fieldLabel,
        field.name,
        field.label,
        field.key,
      ].map(normalizeFieldKey);
      return !keys.some((key) => CORE_SR_FIELD_KEYS.has(key));
    });
  }, [prospectSrForm]);

  useEffect(() => {
    applySourceContextFields();
    prefillFromSourceContext();
  }, [
    sourceContext?.type,
    sourceContext?.subject,
    sourceContext?.body,
    sourceContext?.fromEmail,
    sourceContext?.fromName,
    prospectFormFields,
  ]);

  const visibleProspectFormData = () => {
    if (!prospectFormFields.length) return {};
    const { visibleFields } = conditionEngine(
      prospectFormFields,
      prospectFormData,
    );
    return Object.fromEntries(
      Object.entries(prospectFormData).filter(([key]) =>
        visibleFields.has(key),
      ),
    );
  };

  const prospectRequiredOk = useMemo(() => {
    if (!prospectFormFields.length) return true;
    const { visibleFields, requiredFields } = conditionEngine(
      prospectFormFields,
      prospectFormData,
    );
    for (const fieldName of requiredFields) {
      if (!visibleFields.has(fieldName)) continue;
      const value = prospectFormData[fieldName];
      if (Array.isArray(value) && value.length === 0) return false;
      if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
      ) {
        return false;
      }
    }
    return true;
  }, [prospectFormFields, prospectFormData]);

  const conditionData = useMemo(
    () => ({
      ...formData,
      level1: categoryHierarchy.level1Name,
      level2: categoryHierarchy.level2Name,
      level3: categoryHierarchy.level3Name,
      level4: categoryHierarchy.level4Name,
      level5: categoryHierarchy.level5Name,
      category: categoryHierarchy.displayPath,
      interactionType: linkedParentTicketId ? "ISR" : finalInteraction(),
    }),
    [
      formData,
      categoryHierarchy,
      interactionType,
      channel,
      linkedParentTicketId,
    ],
  );

  const visibleFormData = () => {
    if (dynamicFieldsBlock.enabled === false) return {};
    const fields = activeSrFormFields;
    if (!fields.length) return {};
    const { visibleFields } = conditionEngine(fields, conditionData);
    return Object.fromEntries(
      Object.entries(formData).filter(([key]) => visibleFields.has(key)),
    );
  };

  const dynamicRequiredOk = useMemo(() => {
    if (dynamicFieldsBlock.enabled === false) return true;
    const fields = activeSrFormFields;
    if (!fields.length) return true;
    const { visibleFields, requiredFields } = conditionEngine(
      fields,
      conditionData,
    );
    for (const fieldName of requiredFields) {
      if (!visibleFields.has(fieldName)) continue;
      const value = formData[fieldName];
      if (Array.isArray(value) && value.length === 0) return false;
      if (
        value === undefined ||
        value === null ||
        String(value).trim() === ""
      ) {
        return false;
      }
    }
    return true;
  }, [activeSrFormFields, conditionData, formData, dynamicFieldsBlock]);

  const canSubmit = useMemo(() => {
    if (submitting || !projectId) return false;
    if (flow === "junk") return true;
    if (flow === "prospect_parent") {
      return prospectFormFields.length > 0 && prospectRequiredOk;
    }
    if (!dynamicRequiredOk) return false;
    if (
      flow === "existing_parent" &&
      parentLookupBlock.enabled !== false &&
      parentLookupBlock.required !== false &&
      !parent
    )
      return false;
    if (
      flow === "existing_parent" &&
      childSelectionBlock.enabled !== false &&
      childSelectionBlock.required !== false &&
      selectedChildren.length === 0
    )
      return false;
    // Skip hardcoded category/subject checks when custom channel fields are configured
    // (those fields have their own required validation via customFieldsOk below).
    if (customChannelFields.length === 0) {
      if (
        subjectBlock.enabled !== false &&
        subjectBlock.required !== false &&
        !effectiveSubject.trim()
      )
        return false;
      if (
        categoryBlock.enabled !== false &&
        categoryBlock.required !== false &&
        !categoryId
      )
        return false;
    }
    // Custom channel field required check.
    // For category fields: deduplication renders only the "best" one, so we
    // only require that at least ONE category field has a valid selection.
    const anyCatSelected = customChannelFields
      .filter(f => f.dataSource === "category")
      .some(f => {
        const h = customCatFields[f.id];
        return !!deepestCategoryId(h);
      });
    const hasRequiredCat = customChannelFields.some(f => f.dataSource === "category" && f.required);

    const customFieldsOk = customChannelFields
      .filter(f => f.type !== "search" && f.required)
      .every(f => {
        if (f.dataSource === "category") {
          // Any category field having a value satisfies ALL required category fields
          return !hasRequiredCat || anyCatSelected;
        }
        if (fieldMatchesAnyKey(f, SUBJECT_FIELD_KEYS)) {
          return !!effectiveSubject.trim();
        }
        if (fieldMatchesAnyKey(f, DESCRIPTION_FIELD_KEYS)) {
          return !!effectiveDescription.trim();
        }
        return !!(customFieldData[f.id]?.toString().trim());
      });
    if (!customFieldsOk) return false;
    if (
      categoryBlock.enabled !== false &&
      categoryBlock.required !== false &&
      !categoryId &&
      !anyCatSelected
    )
      return false;
    return true;
  }, [
    submitting,
    projectId,
    flow,
    prospect,
    prospectFormFields,
    prospectRequiredOk,
    effectiveSubject,
    parent,
    selectedChildren,
    categoryId,
    dynamicRequiredOk,
    parentLookupBlock,
    childSelectionBlock,
    categoryBlock,
    subjectBlock,
    customChannelFields,
    customCatFields,
    customFieldData,
    effectiveDescription,
  ]);

  const markSourceConverted = async (ticketId?: string, ticketNumber?: string) => {
    if (!sourceContext?.id || !ticketId) return;
    if (sourceContext.type === "email") {
      const ids = sourceContext.sourceIds?.length
        ? sourceContext.sourceIds
        : [sourceContext.id];
      await Promise.all(
        ids.map((id) =>
          serviceRequestApi.emailIntake.action(id, {
            type: "converted",
            refId: ticketId,
            refNumber: ticketNumber,
            remark: "Converted through New Request flow",
          }),
        ),
      );
      return;
    }
    if (sourceContext.type === "ivr") {
      await serviceRequestApi.ivr.markConverted(sourceContext.id, {
        ticketId,
        ticketNumber,
      });
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setMsg(null);
    try {
      // Junk — log only, no ticket. When the junk came from a source inbox the
      // source still has to be closed out, otherwise it sits there unactioned.
      if (flow === "junk") {
        if (sourceContext?.type === "ivr") {
          await serviceRequestApi.ivr.markJunk(sourceContext.id, {
            remark: effectiveDescription || "Marked as junk from the IVR inbox",
          });
        }
        setMsg({ type: "ok", text: "Logged as junk / telemarketing." });
        setTimeout(() => {
          resetFlow();
          // Back to the inbox it came from, so the agent sees it closed.
          if (sourceContext?.returnTo) navigate(sourceContext.returnTo);
          else setStep("type");
        }, 900);
        return;
      }

      // Prospect — create a lead, not an SR.
      if (flow === "prospect_parent") {
        const leadFormData = visibleProspectFormData();
        const leadName =
          leadFormData.name ||
          leadFormData.parentName ||
          [
            leadFormData.firstName || leadFormData.parentFirstName,
            leadFormData.lastName || leadFormData.parentLastName,
          ]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          "";
        const studentName =
          leadFormData.studentName ||
          [leadFormData.studentFirstName, leadFormData.studentLastName]
            .filter(Boolean)
            .join(" ")
            .trim();
        await serviceRequestApi.leads.create({
          projectId,
          name: leadName,
          contactNumber:
            leadFormData.contactNumber ||
            leadFormData.mobile ||
            leadFormData.phone,
          email:
            leadFormData.email || leadFormData.parentEmail,
          studentName,
          grade: leadFormData.gradeLabel || leadFormData.grade,
          notes:
            leadFormData.notes ||
            leadFormData.enquiry ||
            leadFormData.query,
          formData: leadFormData,
          source: sourceContext?.type || "online",
          syncCrm: true,
        });
        setMsg({
          type: "ok",
          text: "Lead saved and CRM sync status updated in Leads.",
        });
        setTimeout(() => {
          resetFlow();
          setStep("type");
        }, 900);
        return;
      }

      const chosenChildren = (parent?.children || []).filter((_, i) =>
        selectedChildren.includes(i),
      );
      const selectedCategoryLabel =
        categoryHierarchy.displayPath ||
        categories.find((c) => String(c._id) === categoryId)?.path ||
        categories.find((c) => String(c._id) === categoryId)?.name;
      const standardCategoryId = deepestCategoryId(categoryHierarchy) || categoryId;
      const derivedSubject =
        effectiveSubject.trim() ||
        [
          finalInteraction(),
          selectedCategoryLabel,
          parent?.name || channel?.label,
        ]
          .filter(Boolean)
          .join(" - ") ||
        "Service Request";

      const payload: any = {
        projectId,
        interactionType: linkedParentTicketId ? "ISR" : finalInteraction(),
        requestType: "SR",
        channel: sourceContext?.type || "walk_in",
        categoryId: standardCategoryId || undefined,
        categoryHierarchy: standardCategoryId ? categoryHierarchy : undefined,
        subject: derivedSubject,
        description: effectiveDescription.trim(),
        classification: channel?.key,
        formData: visibleFormData(),
        metadata: sourceContext
          ? {
              sourceContext,
              ...(sourceContext.type === "email"
                ? {
                    emailIntakeId: sourceContext.id,
                    fromName: sourceContext.fromName,
                    fromEmail: sourceContext.fromEmail,
                    emailMessageId: sourceContext.messageId,
                    emailInReplyTo: sourceContext.inReplyTo,
                    emailReferences: sourceContext.references,
                    sourceEmailConfigId: sourceContext.sourceEmailConfigId,
                  }
                : {
                    callIntakeId: sourceContext.id,
                    callerName: sourceContext.callerName,
                    callerMobile: sourceContext.callerMobile,
                  }),
            }
          : undefined,
        ...(sourceContext?.type === "email"
          ? {
              sourceEmail: sourceContext.fromEmail,
              sourceEmailName: sourceContext.fromName,
              sourceEmailMessageId: sourceContext.messageId,
              sourceEmailConfigId: sourceContext.sourceEmailConfigId,
            }
          : {}),
        skipDuplicateCheck: true,
      };
      if (linkedParentTicketId)
        payload.linkedParentTicketId = linkedParentTicketId;

      // Merge custom channel field values (category, static, text) into formData
      const extraFields: Record<string, any> = { ...customFieldData };
      Object.entries(customCatFields).forEach(([id, hier]) => {
        extraFields[`${id}_hierarchy`] = hier;
        if (!extraFields[id]) {
          extraFields[id] = hier.displayPath || hier.level5Name || hier.level4Name || hier.level3Name || hier.level2Name || hier.level1Name || "";
        }
      });
      if (Object.keys(extraFields).length) {
        payload.formData = { ...(payload.formData || {}), ...extraFields };
      }
      // When custom channel fields include a category picker, use it as the
      // ticket's categoryId and categoryHierarchy (replaces hardcoded fields).
      if (customCategoryFieldsList.length > 0) {
        const customHierarchy = customCategoryFieldsList
          .map((field) => customCatFields[field.id])
          .find((hier) => !!deepestCategoryId(hier));
        const customCategoryId = deepestCategoryId(customHierarchy);
        if (customCategoryId) {
          payload.categoryId = customCategoryId;
          payload.categoryHierarchy = customHierarchy;
        }
      }
      if (
        categoryBlock.enabled !== false &&
        categoryBlock.required !== false &&
        !payload.categoryId
      ) {
        setMsg({ type: "err", text: "Please select a category before creating the service request." });
        setSubmitting(false);
        return;
      }
      // When custom text field is labelled "Subject", use it as the ticket subject
      if (customChannelFields.length > 0 && !effectiveSubject.trim()) {
        const subjectField = customChannelFields.find(
          f => f.label?.toLowerCase() === "subject" && f.type !== "search"
        );
        if (subjectField && customFieldData[subjectField.id]) {
          payload.subject = customFieldData[subjectField.id];
        }
      }

      if (flow === "existing_parent" && parent) {
        payload.parent = {
          name: parent.name,
          mobile: parent.mobile,
          email: parent.email,
          school: parent.school,
          parentCode: parent.parentCode,
        };
        payload.children = chosenChildren;
        const firstChildId = chosenChildren.find((c) => c.id)?.id;
        if (firstChildId) payload.studentUserId = firstChildId;
        payload.metadata = {
          ...(payload.metadata || {}),
          studentName: chosenChildren[0]?.name,
        };
      }

      // Assignee emails (ISR) block
      if (
        canAssignEmails &&
        blocks?.assigneeEmails?.enabled &&
        finalInteraction() === "ISR" &&
        assigneeEmails.trim()
      ) {
        payload.assignedToEmails = assigneeEmails
          .split(/[,;\n]/)
          .map((e) => e.trim())
          .filter(Boolean);
      }

      // Priority & schedule block
      if (
        canPriority &&
        blocks?.prioritySchedule?.enabled &&
        overridePriority
      ) {
        payload.priority = priority;
        if (scheduleDate) payload.scheduleDispatchDate = scheduleDate;
      }

      // Offline / RE-entry block
      if (canOffline && blocks?.offlineReEntry?.enabled && createdByRE) {
        if (requesterEmail && !otpVerified) {
          setMsg({
            type: "err",
            text: "Verify the requester email (OTP) first.",
          });
          setSubmitting(false);
          return;
        }
        payload.createdByRE = true;
        payload.requesterEmail = requesterEmail;
      }

      const r = await serviceRequestApi.create(payload);
      const num = r.data?.ticketNumber;
      await markSourceConverted(r.data?.ticketId, num);
      setMsg({ type: "ok", text: `Created ${num}. Redirecting…` });
      setTimeout(() => navigate(detailPath(r.data?.ticketId)), 900);
    } catch (e: any) {
      setMsg({
        type: "err",
        text: e?.response?.data?.message || "Failed to create service request.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- shared styles ---------- */
  const card: React.CSSProperties = { ...srStyles.card, maxWidth: 760 };
  const label = srStyles.label;
  const ctrl: React.CSSProperties = { ...srStyles.ctrl, width: "100%" };

  if (!permPSR && !permISR) {
    return (
      <SrPage title="Generate Service Request" embedded={embedded}>
        <div style={{ ...card, color: SR.sub }}>
          You don't have permission to create service requests.
        </div>
      </SrPage>
    );
  }

  /* ---------- step: choose ISR / PSR ---------- */
  const renderTypeStep = () => (
    <div style={card}>
      {renderProjectField()}
      <label style={label}>What would you like to raise?</label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginTop: 4,
        }}
      >
        {canPSR && (
          <TypeCard
            icon="👪"
            title="PSR — Parent Service Request"
            desc="Raise a request on behalf of a parent / student."
            color={SR.primary}
            disabled={!projectId}
            onClick={() => pickType("PSR")}
          />
        )}
        {canISR && (
          <TypeCard
            icon="🏛️"
            title="ISR — Internal Service Request"
            desc="Raise an internal request (vendor, HR, admin, etc.)."
            color="#7c3aed"
            disabled={!projectId}
            onClick={() => pickType("ISR")}
          />
        )}
      </div>
      {!projectId && (
        <p style={{ color: SR.warn, fontSize: 13, marginTop: 12 }}>
          Select a project first.
        </p>
      )}
      {srDisabledHere && (
        <p style={{ color: SR.warn, fontSize: 13, marginTop: 12 }}>
          Service Requests are not enabled for this project. Turn them on in SR
          Settings → General.
        </p>
      )}
      {projectId && srEnabled && !canPSR && !canISR && (
        <p style={{ color: SR.sub, fontSize: 13, marginTop: 12 }}>
          Neither PSR nor ISR is enabled for this project (or you lack the
          create permission).
        </p>
      )}
    </div>
  );

  /* ---------- step: classify ---------- */
  const renderClassifyStep = () => (
    <div style={card}>
      <BackBar onBack={() => setStep("type")} label={`${interactionType} →`} />
      <h3 style={{ margin: "6px 0 2px", fontSize: 18, color: SR.text }}>
        How would you classify this?
      </h3>
      <p style={{ fontSize: 13, color: SR.sub, marginBottom: 14 }}>
        Pick a channel to route this request correctly.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        {channels.map((c) => (
          <button
            key={c.key}
            onClick={() => pickChannel(c)}
            style={{
              textAlign: "left",
              background: "#fff",
              border: `1px solid ${SR.border}`,
              borderRadius: 12,
              padding: 14,
              cursor: "pointer",
              transition: "all .15s",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
            className="sr-request-source-card"
          >
            <span
              style={{
                fontSize: 20,
                width: 38,
                height: 38,
                borderRadius: 10,
                background: (c.color || SR.primary) + "22",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {c.icon || "•"}
            </span>
            <span>
              <div style={{ fontWeight: 700, fontSize: 14, color: SR.text }}>
                {c.label}
              </div>
              <div style={{ fontSize: 12, color: SR.sub, marginTop: 2 }}>
                {c.description}
              </div>
            </span>
          </button>
        ))}
        {channels.length === 0 && (
          <p style={{ color: SR.sub, fontSize: 13 }}>
            {/* config is null until the project's SR config arrives — saying
                "none configured" before then accuses the project of a
                misconfiguration it may not have. */}
            {!projectId
              ? "No project selected — pick one above to load its channels."
              : configLoading
                ? "Loading channels…"
                : config === null
                  ? "Could not load this project's SR settings. Reload the page, or check that you have access to this project."
                  : "No channels configured. Ask an admin to set them in SR Settings."}
          </p>
        )}
      </div>
    </div>
  );

  /* ---------- step: form ---------- */
  const renderProjectField = () =>
    hideProjectSelector ? null : singleProject ? (
      <div style={{ marginBottom: 14 }}>
        <label style={label}>Project</label>
        <div
          style={{
            ...ctrl,
            background: "#f9fafc",
            color: SR.text,
            display: "flex",
            alignItems: "center",
          }}
        >
          {userProjects[0]?.name}
        </div>
      </div>
    ) : (
      <div style={{ marginBottom: 14 }}>
        <label style={label}>Project</label>
        <select
          style={ctrl}
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setCategoryId("");
            setCategoryHierarchy({});
            setFormData({});
          }}
        >
          <option value="">Select a project…</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name} {p.code ? `(${p.code})` : ""}
            </option>
          ))}
        </select>
      </div>
    );

  const renderExistingParent = () => (
    <>
      {parentLookupBlock.enabled !== false && (
        <>
          <label style={label}>
            {parentLookupBlock.label || "Search Parent (MDM)"}
            {parentLookupBlock.required !== false && (
              <span style={{ color: SR.danger }}> *</span>
            )}
          </label>
          <input
            style={ctrl}
            placeholder="Search by parent name, mobile, email, school…"
            value={parent ? parent.name || "" : parentQuery}
            onChange={(e) => onParentQuery(e.target.value)}
          />
        </>
      )}
      {parentSource && (
        <div style={{ fontSize: 11, color: SR.sub, marginTop: 4 }}>
          Source: {parentSource}
        </div>
      )}
      {parentLookupError && (
        <div style={{ fontSize: 12, color: SR.danger, marginTop: 6 }}>
          {parentLookupError}
        </div>
      )}
      {/* US-4.2 — stale collection banner */}
      {psrStaleWarning && !parentLookupError && (
        <div
          style={{
            fontSize: 12,
            color: "#92400e",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 6,
            padding: "6px 10px",
            marginTop: 6,
          }}
        >
          ⚠ {psrStaleWarning}
        </div>
      )}
      {!parent && parentResults.length > 0 && (
        <div
          style={{
            border: `1px solid ${SR.border}`,
            borderRadius: 8,
            marginTop: 6,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {parentResults.map((p, i) => (
            <div
              key={i}
              onClick={() => {
                setParent(p);
                setParentResults([]);
                setSelectedChildren([]);
              }}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                borderBottom: `1px solid ${SR.rowBorder}`,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, color: SR.text }}>
                {p.name || "—"}
              </div>
              <div style={{ color: SR.sub, fontSize: 12 }}>
                {[p.mobile, p.email, p.school].filter(Boolean).join("  •  ")}
              </div>
            </div>
          ))}
        </div>
      )}
      {searching && (
        <div style={{ fontSize: 12, color: SR.sub, marginTop: 6 }}>
          Searching…
        </div>
      )}

      {parent && parentLookupBlock.enabled !== false && (
        <div
          style={{
            marginTop: 12,
            background: "#f9fafc",
            border: `1px solid ${SR.border}`,
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong style={{ fontSize: 14 }}>{parent.name}</strong>
            <button
              onClick={() => {
                setParent(null);
                setParentQuery("");
              }}
              style={{
                background: "none",
                border: "none",
                color: SR.primary,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Change
            </button>
          </div>
          <div style={{ fontSize: 12, color: SR.sub, marginTop: 2 }}>
            {[parent.mobile, parent.email, parent.school]
              .filter(Boolean)
              .join("  •  ")}
          </div>

          {childSelectionBlock.enabled !== false && (
            <>
              <label style={{ ...label, marginTop: 12 }}>
                {childSelectionBlock.label || "Select child(ren)"}
                {childSelectionBlock.required !== false && (
                  <span style={{ color: SR.danger }}> *</span>
                )}
              </label>
              {(parent.children || []).length === 0 ? (
                <p style={{ fontSize: 12, color: SR.sub }}>
                  No children found for this parent.
                </p>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {(parent.children || []).map((ch, i) => {
                    const sel = selectedChildren.includes(i);
                    return (
                      <label
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 10px",
                          border: `1px solid ${sel ? SR.primary : SR.border}`,
                          borderRadius: 8,
                          cursor: "pointer",
                          background: sel ? "#eff6ff" : "#fff",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() =>
                            setSelectedChildren((prev) =>
                              prev.includes(i)
                                ? prev.filter((x) => x !== i)
                                : [...prev, i],
                            )
                          }
                        />
                        <span style={{ fontSize: 13, color: SR.text }}>
                          {ch.name || "—"}
                          {ch.grade ? (
                            <span style={{ color: SR.sub }}> · {ch.grade}</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );

  const renderProspect = () => {
    if (prospectFormFields.length > 0) {
      return (
        <div>
          <div style={{ marginBottom: 10, fontWeight: 800, color: SR.text }}>
            {prospectSrForm?.name || "Prospect Parent Details"}
          </div>
          <FormRenderer
            fields={prospectFormFields}
            formData={prospectFormData}
            projectId={projectId}
            onChange={(fieldName, value) =>
              setProspectFormData((prev) => ({ ...prev, [fieldName]: value }))
            }
          />
        </div>
      );
    }

    return (
      <div
        style={{
          border: "1px solid #fde68a",
          background: "#fffbeb",
          color: "#92400e",
          borderRadius: 10,
          padding: 14,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        Prospect Parent form is not configured for this project. Configure it
        from SR Settings → Prospect Parent → CRM sync API → Create form from CRM
        body, then save.
      </div>
    );
  };

  // Renders dropdown/text/category fields configured in SR Settings → channel form builder
  const renderCustomChannelFields = () => {
    const allFields = customChannelFields.filter(f => f.type !== "search");
    if (!allFields.length) return null;
    // Only one HierarchyCategorySelector per form — it already cascades through
    // every configured level (Category → Subcategory → Topic …).
    // If multiple Category Master fields exist, pick the one with the broadest
    // coverage: prefer no maxLevel (full hierarchy), otherwise the highest maxLevel.
    const catFields = allFields.filter(f => f.dataSource === "category");
    const bestCatField: typeof catFields[0] | undefined =
      catFields.find(f => !(f as any).categoryMaxLevel) ??          // prefer full hierarchy
      catFields.reduce<typeof catFields[0] | undefined>((best, f) =>
        best === undefined ||
        ((f as any).categoryMaxLevel ?? 99) > ((best as any).categoryMaxLevel ?? 99)
          ? f : best,
        undefined,
      );
    let categoryConsumed = false;
    const fields = allFields.filter(f => {
      if (f.dataSource !== "category") return true;
      if (f === bestCatField && !categoryConsumed) { categoryConsumed = true; return true; }
      return false; // skip extra category fields
    });
    return (
      <>
        {fields.map(field => {
          // Category Master: HierarchyCategorySelector renders its own level labels
          // (Category *, Subcategory, Topic…) so we never show a redundant outer label.
          // For all other field types the admin-set label is the only label.
          const isCat = field.dataSource === "category";
          const isSubjectField = fieldMatchesAnyKey(field, SUBJECT_FIELD_KEYS);
          const isDescriptionField = fieldMatchesAnyKey(
            field,
            DESCRIPTION_FIELD_KEYS,
          );

          const control = (() => {
            if (isCat) {
              return projectId ? (
                <HierarchyCategorySelector
                  projectId={projectId}
                  value={customCatFields[field.id] || {}}
                  ticketType={finalInteraction()}
                  mode="online"
                  maxLevel={(field as any).categoryMaxLevel}
                  onChange={value => {
                    setCustomCatFields(prev => ({ ...prev, [field.id]: value }));
                    setCustomFieldData(prev => ({ ...prev, [field.id]: value.displayPath || "" }));
                  }}
                />
              ) : null;
            }
            if (field.dataSource === "static" && (field.staticOptions || []).length) {
              return (
                <select
                  style={ctrl}
                  value={customFieldData[field.id] || ""}
                  onChange={e => setCustomFieldData(prev => ({ ...prev, [field.id]: e.target.value }))}
                  required={!!field.required}
                >
                  <option value="">— Select —</option>
                  {(field.staticOptions || []).map((opt: string) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              );
            }
            if (field.type === "textarea") {
              return (
                <textarea
                  style={{ ...ctrl, minHeight: 80, resize: "vertical" }}
                  value={
                    isDescriptionField
                      ? effectiveDescription
                      : isSubjectField
                        ? effectiveSubject
                        : customFieldData[field.id] || ""
                  }
                  onChange={e => {
                    if (isDescriptionField) {
                      setDescription(e.target.value);
                      return;
                    }
                    if (isSubjectField) {
                      setSubject(e.target.value);
                      return;
                    }
                    setCustomFieldData(prev => ({ ...prev, [field.id]: e.target.value }));
                  }}
                  required={!!field.required}
                />
              );
            }
            return (
              <input
                type={field.type === "mobile" ? "tel" : field.type === "email" ? "email" : field.type === "date" ? "date" : "text"}
                style={ctrl}
                value={
                  isSubjectField
                    ? effectiveSubject
                    : isDescriptionField
                      ? effectiveDescription
                      : customFieldData[field.id] || ""
                }
                onChange={e => {
                  if (isSubjectField) {
                    setSubject(e.target.value);
                    return;
                  }
                  if (isDescriptionField) {
                    setDescription(e.target.value);
                    return;
                  }
                  setCustomFieldData(prev => ({ ...prev, [field.id]: e.target.value }));
                }}
                required={!!field.required}
              />
            );
          })();

          return (
            <div key={field.id} style={{ marginTop: 14 }}>
              {/* Skip the outer label for category fields — HierarchyCategorySelector
                  already renders its own level labels (Category *, Subcategory, …).
                  Showing field.label on top would duplicate e.g. "Category" twice. */}
              {!isCat && (
                <label style={label}>
                  {field.label}
                  {field.required && <span style={{ color: SR.danger }}> *</span>}
                </label>
              )}
              {control}
            </div>
          );
        })}
      </>
    );
  };

  const renderCategoryAndDetails = () => {
    const selectedCategory = categories.find(
      (c) => String(c._id) === categoryId,
    );
    return (
      <>
        {categoryBlock.enabled !== false && (
          <>
            <label style={{ ...label, marginTop: 14 }}>
              {categoryBlock.label || "Category / Sub-category"}
              {categoryBlock.required !== false && (
                <span style={{ color: SR.danger }}> *</span>
              )}
            </label>
            {projectId && (
              <div style={{ marginBottom: 8 }}>
                <HierarchyCategorySelector
                  projectId={projectId}
                  value={categoryHierarchy}
                  ticketType={finalInteraction()}
                  mode="online"
                  onChange={(value) => {
                    setCategoryHierarchy(value);
                    setCategoryId(
                      value.level5 ||
                        value.level4 ||
                        value.level3 ||
                        value.level2 ||
                        value.level1 ||
                        "",
                    );
                  }}
                />
              </div>
            )}
            <select
              style={{
                ...ctrl,
                marginBottom: 6,
                display: projectId ? "none" : "block",
              }}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Select a sub-category…</option>
              {leafCategories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.path || c.name}
                </option>
              ))}
            </select>
          </>
        )}
        {categoryBlock.enabled !== false &&
          selectedCategory?.sr?.proactiveHelpText && (
            <div
              style={{
                background: SR.successBg,
                border: "1px solid #a7f3d0",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 13,
                color: "#065f46",
                marginTop: 6,
              }}
            >
              {selectedCategory.sr.proactiveHelpText}
            </div>
          )}
        {subjectBlock.enabled !== false && (
          <>
            <label style={{ ...label, marginTop: 14 }}>
              {subjectBlock.label || "Subject"}
              {subjectBlock.required !== false && (
                <span style={{ color: SR.danger }}> *</span>
              )}
            </label>
            <input
              style={{ ...ctrl, marginBottom: 12 }}
                  value={effectiveSubject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={subjectBlock.placeholder || "Brief subject"}
            />
          </>
        )}
        {descriptionBlock.enabled !== false && (
          <>
            <label style={label}>
              {descriptionBlock.label || "Description / Comments"}
              {descriptionBlock.required === true && (
                <span style={{ color: SR.danger }}> *</span>
              )}
            </label>
            <textarea
              style={{ ...ctrl, minHeight: 100 }}
                  value={effectiveDescription}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                descriptionBlock.placeholder ||
                "Details of the request / complaint"
              }
            />
          </>
        )}
        {dynamicFieldsBlock.enabled !== false &&
          activeSrFormFields.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: SR.text,
                  marginBottom: 10,
                }}
              >
                {dynamicFieldsBlock.label ||
                  activeSrForm?.name ||
                  "Additional Details"}
              </div>
              <FormRenderer
                fields={activeSrFormFields}
                formData={conditionData}
                onChange={(fieldName, value) =>
                  setFormData((prev) => ({ ...prev, [fieldName]: value }))
                }
                projectId={projectId}
                branding={{ primaryColor: SR.primary }}
              />
            </div>
          )}
      </>
    );
  };

  const renderAssigneeEmails = () =>
    canAssignEmails &&
    blocks?.assigneeEmails?.enabled &&
    finalInteraction() === "ISR" ? (
      <div style={{ ...card, marginTop: 0 }}>
        <label style={label}>Specific assignee(s) — email</label>
        <p style={{ fontSize: 12, color: SR.sub, margin: "0 0 6px" }}>
          Use when one or more specific people should own this ISR. First email
          = primary assignee.
        </p>
        <textarea
          style={{ ...ctrl, minHeight: 70 }}
          value={assigneeEmails}
          onChange={(e) => setAssigneeEmails(e.target.value)}
          placeholder="person.one@school.edu, person.two@school.edu"
        />
        <p style={{ fontSize: 11, color: SR.sub, marginTop: 4 }}>
          Separate with commas, semicolons, or new lines.
        </p>
      </div>
    ) : null;

  const renderPriorityBlock = () =>
    canPriority && blocks?.prioritySchedule?.enabled ? (
      <div style={{ ...card, marginTop: 0 }}>
        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 14,
          }}
        >
          <input
            type="checkbox"
            checked={overridePriority}
            onChange={(e) => setOverridePriority(e.target.checked)}
          />
          📅 Override priority and schedule manually
        </label>
        {overridePriority && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginTop: 12,
            }}
          >
            <div>
              <label style={label}>Priority</label>
              <select
                style={ctrl}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label style={label}>Schedule Dispatch Date (optional)</label>
              <input
                type="date"
                style={ctrl}
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    ) : null;

  const renderOfflineBlock = () =>
    canOffline && blocks?.offlineReEntry?.enabled ? (
      <div style={{ ...card, marginTop: 0 }}>
        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: 14,
          }}
        >
          <input
            type="checkbox"
            checked={createdByRE}
            onChange={(e) => setCreatedByRE(e.target.checked)}
          />
          📄 Created by RE (Offline Entry) — on behalf of requester
        </label>
        {createdByRE && (
          <div style={{ marginTop: 12 }}>
            <label style={label}>Requester email from directory *</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...ctrl, flex: 1 }}
                value={requesterEmail}
                onChange={(e) => {
                  setRequesterEmail(e.target.value);
                  setOtpVerified(false);
                }}
                placeholder="parent / employee / vendor email"
              />
              <button
                onClick={sendOtp}
                disabled={!requesterEmail}
                style={{ ...srButton("neutral"), whiteSpace: "nowrap" }}
              >
                Send OTP
              </button>
            </div>
            {otpKey && !otpVerified && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  style={{ ...ctrl, flex: 1 }}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Enter OTP"
                />
                <button
                  onClick={verifyOtp}
                  style={{ ...srButton("primary"), whiteSpace: "nowrap" }}
                >
                  Verify
                </button>
              </div>
            )}
            {otpMsg && (
              <p
                style={{
                  fontSize: 12,
                  marginTop: 6,
                  color: otpVerified ? SR.success : SR.warn,
                }}
              >
                {otpMsg}
              </p>
            )}
          </div>
        )}
      </div>
    ) : null;

  const renderFormStep = () => (
    <>
      <div style={card}>
        <BackBar
          onBack={() => {
            if (interactionType === "PSR" && !linkedParentTicketId) {
              setStep("classify");
              return;
            }
            setStep("type");
          }}
          label={
            interactionType === "ISR"
              ? "ISR"
              : `${finalInteraction()} · ${channel?.label || ""}`
          }
        />
        {flow === "existing_parent" && renderExistingParent()}
        {flow === "prospect_parent" && renderProspect()}
        {flow !== "prospect_parent" && flow !== "junk" && renderCustomChannelFields()}
        {flow !== "prospect_parent" && flow !== "junk" && (
          // When custom channel fields are configured, skip the hardcoded category/
          // subject/description blocks — they are replaced by the custom fields.
          // Fall back to the standard blocks only when no custom fields are defined.
          customChannelFields.length === 0
            ? renderCategoryAndDetails()
            : activeSrFormFields.length > 0 && dynamicFieldsBlock.enabled !== false
              ? (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: SR.text, marginBottom: 10 }}>
                    {dynamicFieldsBlock.label || activeSrForm?.name || "Additional Details"}
                  </div>
                  <FormRenderer
                    fields={activeSrFormFields}
                    formData={conditionData}
                    onChange={(fieldName, value) =>
                      setFormData((prev) => ({ ...prev, [fieldName]: value }))
                    }
                    projectId={projectId}
                    branding={{ primaryColor: SR.primary }}
                  />
                </div>
              ) : null
        )}
        {flow === "junk" && (
          <p style={{ fontSize: 13, color: SR.sub }}>
            This call will be logged as junk / telemarketing. No ticket is
            created.
          </p>
        )}
      </div>

      {flow !== "junk" && flow !== "prospect_parent" && (
        <>
          {renderAssigneeEmails()}
          {renderPriorityBlock()}
          {renderOfflineBlock()}
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            ...srButton("success"),
            background: canSubmit ? SR.success : "#9ca3af",
            cursor: canSubmit ? "pointer" : "default",
          }}
        >
          {submitting
            ? "Submitting…"
            : flow === "prospect_parent"
              ? "Forward to CRM"
              : flow === "junk"
                ? "Log as Junk"
                : "Create Service Request"}
        </button>
        {msg && (
          <span
            style={{
              fontSize: 13,
              color: msg.type === "ok" ? SR.success : SR.danger,
            }}
          >
            {msg.text}
          </span>
        )}
      </div>
    </>
  );

  return (
    <SrPage
      title="Generate Service Request"
      subtitle="Raise a PSR or ISR — pick the type, classify, then fill the form."
      embedded={embedded}
    >
      {sourceContext && (
        <div
          style={{
            ...srStyles.card,
            maxWidth: 760,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            borderLeft: "4px solid #7C3AED",
            fontSize: 13,
            color: SR.text,
          }}
        >
          <span>
            Creating PSR from{" "}
            <strong>{sourceContext.type === "email" ? "Email" : "IVR"}</strong>
            {sourceContext.uniqueId ? ` ${sourceContext.uniqueId}` : ""}.
          </span>
          <button
            type="button"
            style={{ ...srButton("neutral"), flexShrink: 0 }}
            onClick={() => navigate(sourceContext.returnTo)}
          >
            {sourceContext.type === "email" ? "Back to Email" : "Back to IVR"}
          </button>
        </div>
      )}
      {linkedParentTicketId && (
        <div
          style={{
            ...srStyles.card,
            maxWidth: 760,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            borderLeft: "4px solid #2563EB",
            fontSize: 13,
            color: SR.text,
          }}
        >
          <span>
            Creating an <strong>ISR linked to this ticket</strong>. It will appear
            under the ticket's Linked ISRs.
          </span>
          <button
            type="button"
            style={{ ...srButton("neutral"), flexShrink: 0 }}
            onClick={() => navigate(detailPath(linkedParentTicketId))}
          >
            Back to ticket
          </button>
        </div>
      )}
      {step === "type" && !linkedParentTicketId && renderTypeStep()}
      {step === "classify" && renderClassifyStep()}
      {step === "form" && renderFormStep()}
    </SrPage>
  );
};

/* ---------- small presentational helpers ---------- */
const TypeCard: React.FC<{
  icon: string;
  title: string;
  desc: string;
  color: string;
  disabled?: boolean;
  onClick: () => void;
}> = ({ icon, title, desc, color, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      textAlign: "left",
      background: "#fff",
      border: `1px solid ${SR.border}`,
      borderRadius: 12,
      padding: 18,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
    }}
    className="sr-request-source-card"
  >
    <div style={{ fontSize: 26 }}>{icon}</div>
    <div
      style={{ fontWeight: 700, fontSize: 15, marginTop: 8, color: SR.text }}
    >
      {title}
    </div>
    <div style={{ fontSize: 13, color: SR.sub, marginTop: 4 }}>{desc}</div>
  </button>
);

const BackBar: React.FC<{ onBack: () => void; label: string }> = ({
  onBack,
  label,
}) => (
  <div
    style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}
  >
    <button
      onClick={onBack}
      style={{
        background: "none",
        border: "none",
        color: SR.primary,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        padding: 0,
      }}
    >
      ← Back
    </button>
    <span style={{ fontSize: 12, color: SR.sub }}>{label}</span>
  </div>
);

export default ServiceRequestCreate;
