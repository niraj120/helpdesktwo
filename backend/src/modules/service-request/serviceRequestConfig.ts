/**
 * Service Request (PSR/ISR) module — per-project config resolution.
 * Phase 0 foundation. Applies defaults to `Project.configuration.sr` (stored
 * as a flexible Mixed blob) so callers always get a fully-populated SrConfig.
 */
import { SrConfig, SR_DEFAULT_CLASSIFY_CHANNELS } from "./types";

export const SR_CONFIG_DEFAULTS: SrConfig = {
  enabled: false, // master switch — SR module inert until a project opts in
  numbering: {
    PSR: {
      prefix: "PSR",
      format: "{PREFIX}-{YYYY}-{NNNN}",
      resetPeriod: "yearly",
      startingNumber: 1,
    },
    ISR: {
      prefix: "ISR",
      format: "{PREFIX}-{YYYY}-{NNNN}",
      resetPeriod: "yearly",
      startingNumber: 1,
    },
  },
  psr: {
    enabled: false,
    intake: {
      lookup: {
        source: "auto",
        searchMode: "parent",
        cacheMdmSourceId: "",
        cacheJoinKey: "",
        allowDatabaseFallback: true,
        relationship: {
          enabled: false,
          parentDataType: "parents",
          mappingDataType: "custom",
          parentIdField: "parent_id",
          mappingParentIdField: "parent_id",
          studentIdField: "student_id",
          parentIdParam: "parent_id",
          studentDataType: "students",
          studentResponseIdField: "student_id",
          studentIdParam: "student_id",
        },
      },
      mobileForm: {
        enabled: false,
        formSource: "ticket_config",
      },
      walkIn: {
        enabled: false,
        reuseOfflineModule: true,
        formSource: "ticket_config",
      },
      email: {
        enabled: false,
        mode: "auto_create",
        sources: [],
      },
      ivr: {
        enabled: false,
        provider: "smartflo",
        mode: "triage",
        webhookPath: "/api/public/service-requests/ivr/ingest",
        // Match an inbound caller against a PSR-builder parent table (psr_tbl_*)
        // and populate their name/school onto the call. tableId is a PsrTable
        // _id; the column names are the builder's `as` labels.
        parentLookup: {
          enabled: false,
          tableId: "",
          mobileColumns: [] as string[],
          nameColumn: "",
          schoolColumn: "",
          studentCountColumn: "",
        },
      },
    },
    workflow: {
      duplicateDetection: {
        enabled: true,
        matchStudentId: true,
        matchSubCategory: true,
        matchStatus: true,
        activeStatuses: [1, 2, 4, 6, 7],
        action: "warn",
      },
      requestTypes: {
        ocrEnabled: true,
        srEnabled: true,
        defaultType: "SR",
        autoCloseOcr: true,
      },
      lifecycle: {
        assignResearchTask: true,
        assignResolutionTask: true,
        allowCombinedResearchResolution: true,
        assignBySubCategory: true,
        allowReassignment: true,
        allowCancellation: true,
        cancellationReasons: [
          "Incorrect Sub-category",
          "Incomplete Description",
          "Multiple concerns in SR",
        ],
        createChildCaseOnCancellation: true,
        closureTaskEnabled: true,
        parentClosureEnabled: true,
        feedbackEnabled: true,
        reopenOnUnhappyFeedback: true,
        reopenLimit: 1,
        reassignKeepsOriginalTat: true,
        delegateRestrictedToCcMatrix: true,
        splitMultipleIssuesIntoSeparatePsr: true,
      },
      notifications: {
        parentOnCreation: true,
        departmentOnTaskAssignment: true,
        departmentOnReassignment: true,
        parentOnResolved: true,
        parentOnCancellation: true,
        reCellOnChildCase: true,
        principalOnClosureTask: true,
        parentOnClosure: true,
        channels: ["email", "sms", "in_app"],
      },
      assignment: {
        defaultCcRoleIds: [],
        appointmentAssignToPsl: true,
        appointmentCategoryKeywords: ["appointment"],
        ssdVertexCategoryKeywords: ["finance", "marketing", "it"],
      },
      routing: {
        enabled: false,
        dimensions: [],
        ownerMap: {
          scopeColumns: {},
          roleColumns: {},
          holderResolution: { by: "employeeCode" },
        },
        fallback: { mode: "category" },
      },
      parentCommunication: {
        twoWayCommunicationEnabled: true,
        parentCanAddComments: true,
        askAdditionalInfoEnabled: true,
        displayRemarksPermission: "closure_access",
        proactiveInfoBeforeSubmit: false,
        feedbackPopupEnabled: true,
        feedbackPrompt:
          "We are keen to know more about your experience. Please share your feedback on our response to this service request.",
        pslSatisfactionCallEnabled: true,
        pslCallRequiredWhenUnhappyNoReopen: true,
      },
      linkedIsr: {
        enabled: true,
        generateFromPsrPage: true,
        clickableCrossLinks: true,
        requireIsrNumberPaste: false,
      },
      emailIntegration: {
        enabled: false,
        uniqueIdPrefix: "EML",
        actionTatHours: 8,
        level2EscalationHours: 12,
        workingStart: "08:30",
        workingEnd: "17:30",
        excludeSundays: true,
        allowMultipleActionsPerEmail: true,
        requireWipForFurtherActions: true,
        replyMode: "outlook_manual",
        defaultPsrModeOfContact: "email",
        senderTypes: [
          "Existing Parent",
          "Left Parent",
          "Prospective Parent",
          "Job Applicant",
          "Vendor",
          "Business Proposal",
          "Internal Employee",
          "Legal Notice",
          "Spam / Junk",
        ],
        trackConversionHistory: true,
        dashboardMetrics: [
          "total",
          "within_tat",
          "outside_tat",
          "due_for_escalation",
          "wip_within_tat",
          "wip_due_for_escalation",
          "closed",
          "conversion_rate",
          "response_time",
        ],
      },
      reporting: {
        filters: [
          "date_range",
          "month",
          "department",
          "cluster",
          "school",
          "category",
          "sub_category",
        ],
        dashboardCards: [
          "outside_tat",
          "due_for_escalation",
          "within_tat",
          "wip_future",
          "reopened_wip",
          "resolved_not_psl_closed",
          "resolved_not_parent_closed",
          "reopened_by_parent",
          "total",
          "closed",
        ],
      },
    },
  },
  isr: {
    enabled: false,
    linkFromNormalTickets: {
      enabled: true,
      createEnabled: true,
      linkExistingEnabled: true,
    },
    // Sub-ISRs: raising or attaching an ISR underneath another ISR. Off by
    // default — it turns a flat parent/child relation into a chain, so a
    // project opts in deliberately.
    linkFromIsr: {
      enabled: false,
      createEnabled: true,
      linkExistingEnabled: true,
    },
  },
  wip: {
    maxRevisions: 3,
    maxDaysPerRevision: 8,
    reminderHoursBefore: 48,
    escalateOnExpiry: true,
  },
  reopen: {},
  reassign: {
    requireDepartment: false,
    restrictToProject: true,
    excludeRoleIds: [],
  },
  messages: {
    duplicate:
      "A similar request already exists for this student and sub-category. Please review before creating a new one.",
    closureDefault: "",
    responseDefault: "",
  },
  feedback: {
    notifyManagerOnNegative: false,
    ratingThreshold: 2,
  },
  email: { enabled: false, tatHours: 8, level2Hours: 12 },
  emailJunk: { senders: [] },
  ivr: {
    enabled: false,
    // Call-back ladder. The agent picks how soon the caller is chased again
    // (the "call frequency"); the TAT on that step sets the due time, so the
    // commitment follows the manager's policy rather than the agent's guess.
    callbackTat: {
      enabled: true,
      tiers: [
        { level: 1, label: "WIP 1", tatHours: 4, isActive: true },
        { level: 2, label: "WIP 2", tatHours: 2, isActive: true },
      ],
    },
  },
  classifyChannels: SR_DEFAULT_CLASSIFY_CHANNELS,
  blocks: {
    parentLookup: {
      enabled: true,
      label: "Search Parent (MDM)",
      placeholder: "Search by parent name, mobile or email",
      required: true,
    },
    childSelection: {
      enabled: true,
      label: "Select child(ren)",
      required: true,
    },
    category: {
      enabled: true,
      label: "Category / Sub-category",
      placeholder: "Select a sub-category...",
      required: true,
    },
    subject: {
      enabled: true,
      label: "Subject",
      placeholder: "Brief subject",
      required: true,
    },
    description: {
      enabled: true,
      label: "Description / Comments",
      placeholder: "Details of the request / complaint",
      required: false,
    },
    dynamicFields: {
      enabled: true,
      label: "Additional Details",
    },
    assigneeEmails: { enabled: true },
    prioritySchedule: { enabled: true },
    offlineReEntry: { enabled: true },
  },
  psrDetail: {
    statusProgress: {
      enabled: true,
      defaultOpen: true,
    },
    cards: [
      // sla / psrDetails / pslAssignment / parentStudent / linkedIsr default OFF:
      // they duplicate the legacy header, Query-Information sidebar and the
      // Linked-ISR tab. Left configurable so a project can opt into the
      // card-based layout from SR Settings.
      { key: "sla", label: "SLA", enabled: false, order: 1, width: "full" },
      {
        key: "wipCommitment",
        label: "WIP Commitment",
        enabled: true,
        order: 2,
        width: "full",
      },
      {
        key: "psrDetails",
        label: "PSR Details",
        enabled: false,
        order: 3,
        width: "half",
      },
      {
        key: "pslAssignment",
        label: "PSL Assignment",
        enabled: false,
        order: 4,
        width: "third",
      },
      {
        key: "parentStudent",
        label: "Parent & Student",
        enabled: false,
        order: 5,
        width: "third",
      },
      {
        // Off as a page card: the lifecycle actions (status / reassign /
        // delegate / PSL call) now live in the "PSL Call" tab instead.
        key: "lifecycleActions",
        label: "Lifecycle Actions",
        enabled: false,
        order: 6,
        width: "full",
      },
      {
        key: "linkedIsr",
        label: "Linked ISRs",
        enabled: false,
        order: 7,
        width: "full",
      },
    ],
    tabs: [
      { key: "replies", label: "Replies", enabled: true, order: 1 },
      { key: "linkedisr", label: "Linked ISRs", enabled: true, order: 2 },
      { key: "notes", label: "Internal Notes", enabled: true, order: 3 },
      { key: "pslcall", label: "PSL Call", enabled: true, order: 4 },
      { key: "history", label: "History", enabled: true, order: 5 },
      { key: "audit", label: "Audit", enabled: true, order: 6 },
      { key: "emails", label: "Emails", enabled: true, order: 7 },
    ],
  },
};

const mergeByKey = <T extends { key: string }>(defaults: T[], stored?: T[]) => {
  const byKey = new Map((stored || []).map((item: any) => [item.key, item]));
  const seen = new Set<string>();
  const merged = defaults.map((item: any) => {
    seen.add(item.key);
    return { ...item, ...(byKey.get(item.key) || {}) };
  });
  for (const item of stored || []) {
    if (!seen.has((item as any).key)) merged.push(item);
  }
  return merged.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
};

const resolvePsrIntake = (stored?: any) => {
  const defaults = SR_CONFIG_DEFAULTS.psr.intake;
  return {
    lookup: {
      ...defaults.lookup,
      ...(stored?.lookup || {}),
      source: ["mdm", "database", "auto", "cache", "hybrid_cache", "psr_builder"].includes(stored?.lookup?.source)
        ? stored.lookup.source
        : defaults.lookup.source,
      searchMode: ["parent", "student", "both"].includes(
        stored?.lookup?.searchMode,
      )
        ? stored.lookup.searchMode
        : defaults.lookup.searchMode,
      allowDatabaseFallback:
        stored?.lookup?.allowDatabaseFallback ??
        defaults.lookup.allowDatabaseFallback,
      relationship: {
        ...(defaults.lookup.relationship || {}),
        ...(stored?.lookup?.relationship || {}),
      },
    },
    mobileForm: {
      ...defaults.mobileForm,
      ...(stored?.mobileForm || {}),
    },
    walkIn: {
      ...defaults.walkIn,
      ...(stored?.walkIn || {}),
    },
    email: {
      ...defaults.email,
      ...(stored?.email || {}),
      sources: Array.isArray(stored?.email?.sources)
        ? stored.email.sources
        : defaults.email.sources,
    },
    ivr: {
      ...defaults.ivr,
      ...(stored?.ivr || {}),
      provider: "smartflo" as const,
    },
  };
};

const resolvePsrWorkflow = (stored?: any) => {
  const defaults = SR_CONFIG_DEFAULTS.psr.workflow;
  return {
    duplicateDetection: {
      ...defaults.duplicateDetection,
      ...(stored?.duplicateDetection || {}),
      activeStatuses: Array.isArray(stored?.duplicateDetection?.activeStatuses)
        ? stored.duplicateDetection.activeStatuses.map(Number)
        : defaults.duplicateDetection.activeStatuses,
    },
    requestTypes: {
      ...defaults.requestTypes,
      ...(stored?.requestTypes || {}),
      defaultType:
        stored?.requestTypes?.defaultType === "OCR" ? "OCR" : defaults.requestTypes.defaultType,
    },
    lifecycle: {
      ...defaults.lifecycle,
      ...(stored?.lifecycle || {}),
      cancellationReasons: Array.isArray(stored?.lifecycle?.cancellationReasons)
        ? stored.lifecycle.cancellationReasons
        : defaults.lifecycle.cancellationReasons,
    },
    notifications: {
      ...defaults.notifications,
      ...(stored?.notifications || {}),
      channels: Array.isArray(stored?.notifications?.channels)
        ? stored.notifications.channels
        : defaults.notifications.channels,
    },
    assignment: {
      ...defaults.assignment,
      ...(stored?.assignment || {}),
      defaultCcRoleIds: Array.isArray(stored?.assignment?.defaultCcRoleIds)
        ? stored.assignment.defaultCcRoleIds
        : defaults.assignment.defaultCcRoleIds,
      appointmentCategoryKeywords: Array.isArray(
        stored?.assignment?.appointmentCategoryKeywords,
      )
        ? stored.assignment.appointmentCategoryKeywords
        : defaults.assignment.appointmentCategoryKeywords,
      ssdVertexCategoryKeywords: Array.isArray(
        stored?.assignment?.ssdVertexCategoryKeywords,
      )
        ? stored.assignment.ssdVertexCategoryKeywords
        : defaults.assignment.ssdVertexCategoryKeywords,
    },
    routing: {
      ...defaults.routing,
      ...(stored?.routing || {}),
      dimensions: Array.isArray(stored?.routing?.dimensions)
        ? stored.routing.dimensions
        : defaults.routing.dimensions,
      ownerMap: {
        ...defaults.routing.ownerMap,
        ...(stored?.routing?.ownerMap || {}),
        scopeColumns: {
          ...(stored?.routing?.ownerMap?.scopeColumns || {}),
        },
        roleColumns: {
          ...(stored?.routing?.ownerMap?.roleColumns || {}),
        },
        holderResolution: {
          ...defaults.routing.ownerMap.holderResolution,
          ...(stored?.routing?.ownerMap?.holderResolution || {}),
        },
      },
      fallback: {
        ...defaults.routing.fallback,
        ...(stored?.routing?.fallback || {}),
      },
    },
    parentCommunication: {
      ...defaults.parentCommunication,
      ...(stored?.parentCommunication || {}),
    },
    linkedIsr: {
      ...defaults.linkedIsr,
      ...(stored?.linkedIsr || {}),
    },
    emailIntegration: {
      ...defaults.emailIntegration,
      ...(stored?.emailIntegration || {}),
      senderTypes: Array.isArray(stored?.emailIntegration?.senderTypes)
        ? stored.emailIntegration.senderTypes
        : defaults.emailIntegration.senderTypes,
      dashboardMetrics: Array.isArray(stored?.emailIntegration?.dashboardMetrics)
        ? stored.emailIntegration.dashboardMetrics
        : defaults.emailIntegration.dashboardMetrics,
      defaultPsrModeOfContact: "email" as const,
    },
    reporting: {
      ...defaults.reporting,
      ...(stored?.reporting || {}),
      filters: Array.isArray(stored?.reporting?.filters)
        ? stored.reporting.filters
        : defaults.reporting.filters,
      dashboardCards: Array.isArray(stored?.reporting?.dashboardCards)
        ? stored.reporting.dashboardCards
        : defaults.reporting.dashboardCards,
    },
  };
};

/**
 * Resolve a fully-defaulted SrConfig from a project document, a project's
 * `configuration` object, or a raw `sr` blob — whichever is passed.
 */
export function resolveSrConfig(raw: any): SrConfig {
  const sr = raw?.configuration?.sr ?? raw?.sr ?? raw ?? {};
  return {
    ...sr,
    enabled: !!sr.enabled,
    numbering: {
      PSR: {
        ...SR_CONFIG_DEFAULTS.numbering.PSR,
        ...(sr.numbering?.PSR || {}),
      },
      ISR: {
        ...SR_CONFIG_DEFAULTS.numbering.ISR,
        ...(sr.numbering?.ISR || {}),
      },
    },
    psr: {
      enabled: sr.psr?.enabled ?? false,
      intake: resolvePsrIntake(sr.psr?.intake),
      workflow: resolvePsrWorkflow(sr.psr?.workflow),
    },
    isr: {
      enabled: sr.isr?.enabled ?? false,
      linkFromIsr: {
        ...SR_CONFIG_DEFAULTS.isr.linkFromIsr,
        ...(sr.isr?.linkFromIsr || {}),
      },
      linkFromNormalTickets: {
        ...SR_CONFIG_DEFAULTS.isr.linkFromNormalTickets,
        ...(sr.isr?.linkFromNormalTickets || {}),
      },
    },
    wip: {
      maxRevisions: sr.wip?.maxRevisions ?? SR_CONFIG_DEFAULTS.wip.maxRevisions,
      maxDaysPerRevision:
        sr.wip?.maxDaysPerRevision ?? SR_CONFIG_DEFAULTS.wip.maxDaysPerRevision,
      reminderHoursBefore:
        sr.wip?.reminderHoursBefore ??
        SR_CONFIG_DEFAULTS.wip.reminderHoursBefore,
      escalateOnExpiry:
        sr.wip?.escalateOnExpiry ?? SR_CONFIG_DEFAULTS.wip.escalateOnExpiry,
    },
    reopen: {
      assignToUserId: sr.reopen?.assignToUserId,
      assignToRoleId: sr.reopen?.assignToRoleId,
    },
    reassign: {
      requireDepartment:
        sr.reassign?.requireDepartment ??
        SR_CONFIG_DEFAULTS.reassign.requireDepartment,
      restrictToProject:
        sr.reassign?.restrictToProject ??
        SR_CONFIG_DEFAULTS.reassign.restrictToProject,
      excludeRoleIds: Array.isArray(sr.reassign?.excludeRoleIds)
        ? sr.reassign.excludeRoleIds.map(String)
        : [],
    },
    messages: {
      duplicate:
        sr.messages?.duplicate ?? SR_CONFIG_DEFAULTS.messages.duplicate,
      closureDefault:
        sr.messages?.closureDefault ??
        SR_CONFIG_DEFAULTS.messages.closureDefault,
      responseDefault:
        sr.messages?.responseDefault ??
        SR_CONFIG_DEFAULTS.messages.responseDefault,
    },
    feedback: {
      notifyManagerOnNegative:
        sr.feedback?.notifyManagerOnNegative ??
        SR_CONFIG_DEFAULTS.feedback.notifyManagerOnNegative,
      ratingThreshold:
        sr.feedback?.ratingThreshold ??
        SR_CONFIG_DEFAULTS.feedback.ratingThreshold,
      notifyUserId: sr.feedback?.notifyUserId,
      notifyRoleId: sr.feedback?.notifyRoleId,
    },
    email: {
      enabled: !!sr.email?.enabled,
      tatHours: sr.email?.tatHours ?? SR_CONFIG_DEFAULTS.email.tatHours,
      level2Hours:
        sr.email?.level2Hours ?? SR_CONFIG_DEFAULTS.email.level2Hours,
    },
    ivr: {
      ...(sr.ivr || {}),
      enabled: !!sr.ivr?.enabled,
      callbackTat: {
        ...SR_CONFIG_DEFAULTS.ivr.callbackTat,
        ...(sr.ivr?.callbackTat || {}),
        // An empty tier list would leave agents nothing to choose, so fall
        // back to the defaults rather than rendering a dead selector.
        tiers:
          Array.isArray(sr.ivr?.callbackTat?.tiers) &&
          sr.ivr.callbackTat.tiers.length
            ? sr.ivr.callbackTat.tiers
            : SR_CONFIG_DEFAULTS.ivr.callbackTat.tiers,
      },
    },
    emailJunk: {
      senders: Array.isArray(sr.emailJunk?.senders)
        ? sr.emailJunk.senders.map((s: any) => String(s).trim().toLowerCase()).filter(Boolean)
        : [],
    },
    classifyChannels:
      Array.isArray(sr.classifyChannels) && sr.classifyChannels.length
        ? sr.classifyChannels
        : SR_DEFAULT_CLASSIFY_CHANNELS,
    blocks: {
      parentLookup: {
        ...SR_CONFIG_DEFAULTS.blocks.parentLookup,
        ...(sr.blocks?.parentLookup || {}),
        enabled: sr.blocks?.parentLookup?.enabled ?? true,
      },
      childSelection: {
        ...SR_CONFIG_DEFAULTS.blocks.childSelection,
        ...(sr.blocks?.childSelection || {}),
        enabled: sr.blocks?.childSelection?.enabled ?? true,
      },
      category: {
        ...SR_CONFIG_DEFAULTS.blocks.category,
        ...(sr.blocks?.category || {}),
        enabled: sr.blocks?.category?.enabled ?? true,
      },
      subject: {
        ...SR_CONFIG_DEFAULTS.blocks.subject,
        ...(sr.blocks?.subject || {}),
        enabled: sr.blocks?.subject?.enabled ?? true,
      },
      description: {
        ...SR_CONFIG_DEFAULTS.blocks.description,
        ...(sr.blocks?.description || {}),
        enabled: sr.blocks?.description?.enabled ?? true,
      },
      dynamicFields: {
        ...SR_CONFIG_DEFAULTS.blocks.dynamicFields,
        ...(sr.blocks?.dynamicFields || {}),
        enabled: sr.blocks?.dynamicFields?.enabled ?? true,
      },
      assigneeEmails: {
        enabled: sr.blocks?.assigneeEmails?.enabled ?? true,
      },
      prioritySchedule: {
        enabled: sr.blocks?.prioritySchedule?.enabled ?? true,
      },
      offlineReEntry: {
        enabled: sr.blocks?.offlineReEntry?.enabled ?? true,
      },
    },
    psrDetail: {
      statusProgress: {
        enabled:
          sr.psrDetail?.statusProgress?.enabled ??
          SR_CONFIG_DEFAULTS.psrDetail.statusProgress.enabled,
        defaultOpen:
          sr.psrDetail?.statusProgress?.defaultOpen ??
          SR_CONFIG_DEFAULTS.psrDetail.statusProgress.defaultOpen,
      },
      cards: mergeByKey(
        SR_CONFIG_DEFAULTS.psrDetail.cards,
        sr.psrDetail?.cards,
      ),
      tabs: mergeByKey(SR_CONFIG_DEFAULTS.psrDetail.tabs, sr.psrDetail?.tabs),
    },
  };
}

/**
 * Whether the SR module (optionally a specific type) is enabled for a project.
 * `type` omitted → just checks the master switch.
 */
export function isSrEnabled(raw: any, type?: "PSR" | "ISR"): boolean {
  const cfg = resolveSrConfig(raw);
  if (!cfg.enabled) return false;
  if (type === "PSR") return cfg.psr.enabled;
  if (type === "ISR") return cfg.isr.enabled;
  return true;
}
