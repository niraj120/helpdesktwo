import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import {
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  XMarkIcon,
  BookOpenIcon,
} from "@heroicons/react/24/outline";
import { API_CONFIG } from "../config/constants";
import HierarchyCategorySelector, {
  CategoryHierarchyValue,
  useHierarchyConfig,
} from "../components/HierarchyCategorySelector";
import {
  FormRenderer,
  filterFormDataToVisible,
} from "../components/FormRenderer";
import { FormFieldSchema, conditionEngine } from "../utils/conditionEngine";

interface ProjectBranding {
  projectId: string;
  name: string;
  customUrlPath: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  welcomeText: string;
  footerText: string;
}

interface OnlineFormField {
  fieldName: string;
  fieldType:
    | "text"
    | "number"
    | "date"
    | "email"
    | "phone"
    | "url"
    | "textarea"
    | "dropdown"
    | "multiselect"
    | "radio"
    | "checkbox"
    | "file";
  required: boolean;
  placeholder: string;
  options?: string[];
  allowedFileTypes?: string[];
  maxFileSizeMB?: number;
  allowMultiple?: boolean;
}

interface TicketSubmissionSettings {
  onlineFormFields: FormFieldSchema[];
  welcomeMessage?: string;
  successMessage?: string;
  announcement?: string;
}

const AuthenticatedStudentSubmitTicket: React.FC<{ hideHeader?: boolean }> = ({
  hideHeader,
}) => {
  const { customUrlPath } = useParams<{ customUrlPath: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [branding, setBranding] = useState<ProjectBranding | null>(null);
  // Dynamic portal fields from SR Settings → Student Portal channel
  const [portalFields, setPortalFields] = useState<any[]>([]);
  const [portalAnnouncement, setPortalAnnouncement] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [fieldFiles, setFieldFiles] = useState<Record<string, File[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdTicketNumber, setCreatedTicketNumber] = useState<string>("");
  // Tracks which hierarchy levels (2, 3, 4) actually have options for the current selection
  const [hierarchyLevelHasOptions, setHierarchyLevelHasOptions] = useState<
    Record<number, boolean>
  >({});
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryObjects, setCategoryObjects] = useState<
    Array<{ _id: string; name: string }>
  >([]);
  const [categoryHierarchy, setCategoryHierarchy] =
    useState<CategoryHierarchyValue>({});
  const [assignmentPreview, setAssignmentPreview] = useState<string | null>(
    null,
  );

  // Fetch hierarchy config to determine if multi-level categories are enabled
  const { config: hierarchyConfig } = useHierarchyConfig(
    branding?.projectId || "",
  );

  useEffect(() => {
    fetchData();
  }, [customUrlPath]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) { setLoading(false); return; }

      // Load branding
      const brandingRes = await axios.get(
        `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`,
      );
      const brandingData = brandingRes.data.success ? brandingRes.data.data : brandingRes.data;
      setBranding(brandingData);

      // Load category objects for assignment preview (non-fatal)
      try {
        const categoriesRes = await axios.get(
          `${API_CONFIG.API_URL}/categories/project/${brandingData.projectId}`,
        );
        const categoryList = categoriesRes.data.success ? categoriesRes.data.data : categoriesRes.data;
        setCategoryObjects(
          categoryList.filter((c: any) => c.isActive).map((c: any) => ({ _id: c._id, name: c.name }))
        );
      } catch { /* non-fatal */ }

      // Load SR config → student_portal channel fields
      const DEFAULT_PORTAL_FIELDS = [
        { id: "_cat",  label: "Category",    type: "dropdown", required: false, dataSource: "category" },
        { id: "_subj", label: "Subject",      type: "text",     required: true,  dataSource: "none" },
        { id: "_desc", label: "Description",  type: "textarea", required: false, dataSource: "none" },
      ];
      try {
        const cfgRes = await axios.get(
          `${API_CONFIG.API_URL}/service-requests/config?projectId=${brandingData.projectId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const srCfg = cfgRes.data?.data ?? cfgRes.data;
        const saved = srCfg?.customChannelFields?.student_portal;
        setPortalFields(saved?.length ? saved : DEFAULT_PORTAL_FIELDS);
        setPortalAnnouncement(srCfg?.announcement || null);
      } catch {
        setPortalFields(DEFAULT_PORTAL_FIELDS);
      }
    } catch (error) {
      console.error("Error fetching portal data:", error);
      setSubmitError("Failed to load form. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignmentPreview = async (categoryId: string) => {
    try {
      const token = localStorage.getItem("authToken");
      const res = await axios.get(
        `${API_CONFIG.API_URL}/categories/${categoryId}/assignment-preview`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (res.data.success) {
        setAssignmentPreview(res.data.data.label);
      } else {
        setAssignmentPreview(null);
      }
    } catch {
      setAssignmentPreview(null);
    }
  };

  const handleInputChange = (fieldName: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
    // Trigger assignment preview when Category field changes (flat dropdown)
    if (fieldName.toLowerCase() === "category" && typeof value === "string") {
      const match = categoryObjects.find((c) => c.name === value);
      if (match) {
        fetchAssignmentPreview(match._id);
      } else {
        setAssignmentPreview(null);
      }
    }
  };

  const handleFileChange = (fieldName: string, files: FileList | null) => {
    if (!files) return;

    const filesArray = Array.from(files);
    setFieldFiles((prev) => ({
      ...prev,
      [fieldName]: filesArray,
    }));
  };

  const removeFieldFile = (fieldName: string, fileIndex: number) => {
    setFieldFiles((prev) => {
      const updated = { ...prev };
      updated[fieldName] = (updated[fieldName] || []).filter(
        (_, i) => i !== fileIndex,
      );
      if (updated[fieldName].length === 0) delete updated[fieldName];
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        setSubmitError("Please log in to submit a ticket");
        setSubmitting(false);
        return;
      }

      // Validate required portal fields
      const activeFields = portalFields.filter((f: any) => f.type !== "search");
      for (const field of activeFields) {
        if (!field.required) continue;
        if (field.dataSource === "category") {
          if (!categoryHierarchy.level1) {
            setSubmitError(`${field.label} is required`);
            window.scrollTo({ top: 0, behavior: "smooth" });
            setSubmitting(false);
            return;
          }
        } else if (!formData[field.id]?.toString().trim()) {
          setSubmitError(`${field.label} is required`);
          window.scrollTo({ top: 0, behavior: "smooth" });
          setSubmitting(false);
          return;
        }
      }

      // Build formData payload keyed by both id and label for backend compatibility
      const fieldPayload: Record<string, any> = {};
      activeFields.forEach((f: any) => {
        if (f.dataSource === "category") {
          fieldPayload[f.label]       = categoryHierarchy.displayPath || "";
          fieldPayload[f.id]          = categoryHierarchy.displayPath || "";
        } else {
          fieldPayload[f.label] = formData[f.id] || "";
          fieldPayload[f.id]    = formData[f.id] || "";
        }
      });

      // Prepare multipart form data for submission
      const submitData = new FormData();
      submitData.append("projectId", branding?.projectId || "");
      submitData.append("formData", JSON.stringify(fieldPayload));

      // Add hierarchical category data if present
      if (categoryHierarchy?.level1) {
        submitData.append("categoryHierarchy", JSON.stringify(categoryHierarchy));
        submitData.append("category", categoryHierarchy.level1);
      }

      // Submit ticket
      const response = await axios.post(
        `${API_CONFIG.API_URL}/tickets/submit`,
        submitData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            ...(token && { Authorization: `Bearer ${token}` }), // Add auth header if logged in
          },
        },
      );

      console.log("✅ Ticket submitted successfully:", response.data);

      const ticketNum =
        response.data.data?.ticketNumber || response.data.ticketNumber || "";
      setCreatedTicketNumber(ticketNum);
      setSubmitSuccess(true);
      setFormData({});
      setFieldFiles({});
      setCategoryHierarchy({});
      setHierarchyLevelHasOptions({});
    } catch (error: any) {
      console.error("Error submitting ticket:", error);
      setSubmitError(
        error.response?.data?.message ||
          "Failed to submit ticket. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderFormField = (field: OnlineFormField) => {
    const value = formData[field.fieldName] || "";
    const commonClasses =
      "w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2";

    switch (field.fieldType) {
      case "textarea":
        return (
          <textarea
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
            required={field.required}
            rows={4}
            className={commonClasses}
            style={{ ["--tw-ring-color" as any]: branding?.primaryColor }}
          />
        );

      case "dropdown":
        // Use hierarchical category selector if this is the Category field and multi-level hierarchy is configured
        if (
          field.fieldName.toLowerCase() === "category" &&
          hierarchyConfig &&
          hierarchyConfig.levelCount > 1 &&
          branding?.projectId
        ) {
          return (
            <HierarchyCategorySelector
              projectId={branding.projectId}
              value={categoryHierarchy}
              onLevelOptionsChange={(level, hasOpts) =>
                setHierarchyLevelHasOptions((prev) => ({
                  ...prev,
                  [level]: hasOpts,
                }))
              }
              onChange={(newValue) => {
                setCategoryHierarchy(newValue);
                // Store the display path as the field value for form submission
                handleInputChange(field.fieldName, newValue);
                // Push level names into formData so conditionEngine can match
                // text conditions like "Subcategory equals Name change"
                if (hierarchyConfig?.levels) {
                  const nameUpdates: Record<string, string> = {};
                  hierarchyConfig.levels.forEach((l: any) => {
                    const nameKey =
                      `level${l.levelNumber}Name` as keyof typeof newValue;
                    nameUpdates[l.displayName] =
                      (newValue[nameKey] as string) || "";
                  });
                  setFormData((prev: any) => ({ ...prev, ...nameUpdates }));
                }
              }}
              mode="online"
              showValidation={false}
            />
          );
        }
        // Fall back to standard dropdown
        return (
          <select
            value={value}
            onChange={(e) => handleInputChange(field.fieldName, e.target.value)}
            required={field.required}
            className={commonClasses}
            style={{ ["--tw-ring-color" as any]: branding?.primaryColor }}
          >
            <option value="">
              {field.placeholder || `Select ${field.fieldName}`}
            </option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case "multiselect":
        return (
          <select
            multiple
            value={value}
            onChange={(e) => {
              const selected = Array.from(
                e.target.selectedOptions,
                (option) => option.value,
              );
              handleInputChange(field.fieldName, selected);
            }}
            required={field.required}
            className={`${commonClasses} min-h-[120px]`}
            style={{ ["--tw-ring-color" as any]: branding?.primaryColor }}
          >
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case "radio":
        return (
          <div className="space-y-2">
            {field.options?.map((option) => (
              <label
                key={option}
                className="flex items-center space-x-2 cursor-pointer"
              >
                <input
                  type="radio"
                  name={field.fieldName}
                  value={option}
                  checked={value === option}
                  onChange={(e) =>
                    handleInputChange(field.fieldName, e.target.value)
                  }
                  required={field.required}
                  className="w-4 h-4 cursor-pointer"
                  style={{ accentColor: branding?.primaryColor }}
                />
                <span className="text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );

      case "checkbox":
        return (
          <div className="space-y-2">
            {field.options?.map((option) => (
              <label
                key={option}
                className="flex items-center space-x-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  value={option}
                  checked={(value || []).includes(option)}
                  onChange={(e) => {
                    const currentValue = value || [];
                    const newValue = e.target.checked
                      ? [...currentValue, option]
                      : currentValue.filter((v: string) => v !== option);
                    handleInputChange(field.fieldName, newValue);
                  }}
                  className="w-4 h-4 cursor-pointer"
                  style={{ accentColor: branding?.primaryColor }}
                />
                <span className="text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );

      case "file":
        return (
          <div className="space-y-3">
            <label className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
              <div className="text-center">
                <DocumentArrowUpIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <span className="text-sm text-gray-600">
                  Click to upload file(s)
                </span>
                {field.allowedFileTypes &&
                  field.allowedFileTypes.length > 0 && (
                    <span className="block text-xs text-gray-500 mt-1">
                      Allowed: {field.allowedFileTypes.join(", ")}
                    </span>
                  )}
                {field.maxFileSizeMB && (
                  <span className="block text-xs text-gray-500">
                    Max size: {field.maxFileSizeMB}MB
                  </span>
                )}
              </div>
              <input
                type="file"
                onChange={(e) =>
                  handleFileChange(field.fieldName, e.target.files)
                }
                multiple={field.allowMultiple}
                accept={field.allowedFileTypes?.join(",")}
                required={
                  field.required &&
                  (!fieldFiles[field.fieldName] ||
                    fieldFiles[field.fieldName].length === 0)
                }
                className="hidden"
              />
            </label>

            {fieldFiles[field.fieldName] &&
              fieldFiles[field.fieldName].length > 0 && (
                <div className="space-y-2">
                  {fieldFiles[field.fieldName].map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <span className="text-sm text-gray-700 truncate flex-1">
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFieldFile(field.fieldName, index)}
                        className="ml-2 p-1 hover:bg-gray-200 rounded-full transition-colors"
                      >
                        <XMarkIcon className="h-4 w-4 text-gray-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
          </div>
        );

      default:
        return (
          <input
            type={field.fieldType === "number" ? "text" : field.fieldType}
            inputMode={field.fieldType === "number" ? "numeric" : undefined}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => {
              let val = e.target.value;
              if (field.fieldType === "number") {
                val = val.replace(/[^0-9]/g, "");
              }
              handleInputChange(field.fieldName, val);
            }}
            required={field.required}
            maxLength={(field as any).validation?.maxLength ?? undefined}
            minLength={(field as any).validation?.minLength ?? undefined}
            className={commonClasses}
            style={{ ["--tw-ring-color" as any]: branding?.primaryColor }}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2"
          style={{ borderColor: branding?.primaryColor || "#3b82f6" }}
        ></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        {!hideHeader && (
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Submit a Query
            </h1>
            {/* no welcome message in dynamic config — use branding name */}
          </div>
        )}

        {/* KB Link Banner */}
        {branding?.customUrlPath && (
          <Link
            to={`/${branding.customUrlPath}/kb`}
            className="block bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 hover:bg-blue-100 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <BookOpenIcon className="w-6 h-6 text-blue-600" />
                <div>
                  <h3 className="text-sm font-semibold text-blue-900">
                    Need help?
                  </h3>
                  <p className="text-xs text-blue-700">
                    Check our Knowledge Base for quick answers
                  </p>
                </div>
              </div>
              <span className="text-blue-600 text-sm font-medium">
                View KB →
              </span>
            </div>
          </Link>
        )}

        {/* Success Modal — rendered via portal to avoid z-index/stacking-context issues */}
        {submitSuccess &&
          createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center">
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
              {/* Dialog */}
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8 text-center">
                {/* Green check */}
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mx-auto mb-4">
                  <CheckCircleIcon className="h-9 w-9 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">
                  Query Submitted!
                </h3>
                {createdTicketNumber && (
                  <div className="my-3 px-4 py-2 bg-blue-50 rounded-lg border border-blue-200 inline-block">
                    <span className="text-sm text-blue-600 font-medium">
                      Ticket Number
                    </span>
                    <p className="text-xl font-bold text-blue-800 mt-0.5">
                      {createdTicketNumber}
                    </p>
                  </div>
                )}
                <p className="text-gray-600 text-sm mt-3 mb-6">
                  Your query has been submitted. Our team will get back to you soon.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setSubmitSuccess(false);
                      navigate(`/${customUrlPath}/student/my-tickets`);
                    }}
                    className="flex-1 px-4 py-2 text-sm font-semibold text-white rounded-lg"
                    style={{
                      background: branding?.primaryColor
                        ? `linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.secondaryColor} 100%)`
                        : "linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)",
                    }}
                  >
                    View My Tickets
                  </button>
                  <button
                    onClick={() => setSubmitSuccess(false)}
                    className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Submit Another
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* Announcement */}
        {portalAnnouncement && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <p className="text-blue-900 text-sm">{portalAnnouncement}</p>
          </div>
        )}

        {/* Error Message */}
        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6 flex items-start space-x-4">
            <ExclamationCircleIcon className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-red-900 mb-1">
                Submission Error
              </h3>
              <p className="text-red-700">{submitError}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="bg-white rounded-xl shadow-md p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {portalFields.filter((f: any) => f.type !== "search").map((field: any) => {
              const commonClasses = "w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2";
              const value = formData[field.id] || "";

              const control = (() => {
                if (field.dataSource === "category" && branding?.projectId) {
                  return (
                    <HierarchyCategorySelector
                      projectId={branding.projectId}
                      value={categoryHierarchy}
                      maxLevel={field.categoryMaxLevel}
                      onLevelOptionsChange={(level, hasOpts) =>
                        setHierarchyLevelHasOptions(prev => ({ ...prev, [level]: hasOpts }))
                      }
                      onChange={newValue => {
                        setCategoryHierarchy(newValue);
                        setFormData(prev => ({ ...prev, [field.id]: newValue.displayPath || "" }));
                        const level1 = newValue?.level1;
                        if (level1) {
                          if (/^[a-f0-9]{24}$/i.test(level1)) fetchAssignmentPreview(level1);
                          else {
                            const match = categoryObjects.find(c => c.name === level1);
                            if (match) fetchAssignmentPreview(match._id);
                            else setAssignmentPreview(null);
                          }
                        } else setAssignmentPreview(null);
                      }}
                      mode="online"
                      showValidation={false}
                    />
                  );
                }
                if (field.type === "textarea") {
                  return (
                    <textarea
                      placeholder={`Enter ${field.label.toLowerCase()}…`}
                      value={value}
                      onChange={e => handleInputChange(field.id, e.target.value)}
                      required={!!field.required}
                      rows={4}
                      className={commonClasses}
                      style={{ ["--tw-ring-color" as any]: branding?.primaryColor, resize: "vertical" }}
                    />
                  );
                }
                if (field.type === "dropdown" && field.dataSource === "static" && field.staticOptions?.length) {
                  return (
                    <select
                      value={value}
                      onChange={e => handleInputChange(field.id, e.target.value)}
                      required={!!field.required}
                      className={commonClasses}
                      style={{ ["--tw-ring-color" as any]: branding?.primaryColor }}
                    >
                      <option value="">-- Select {field.label} --</option>
                      {(field.staticOptions || []).map((opt: string) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  );
                }
                const inputType = field.type === "mobile" ? "tel" : field.type === "email" ? "email" : field.type === "date" ? "date" : "text";
                return (
                  <input
                    type={inputType}
                    placeholder={`Enter ${field.label.toLowerCase()}…`}
                    value={value}
                    onChange={e => handleInputChange(field.id, e.target.value)}
                    required={!!field.required}
                    className={commonClasses}
                    style={{ ["--tw-ring-color" as any]: branding?.primaryColor }}
                  />
                );
              })();

              return (
                <div key={field.id} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {control}
                </div>
              );
            })}

            {/* Assignment preview — shown after category selection */}
            {assignmentPreview && (
              <div
                className="flex items-start gap-2 px-4 py-3 rounded-lg text-sm"
                style={{ backgroundColor: "#f0f9ff", border: "1px solid #bae6fd", color: "#0369a1" }}
              >
                <span style={{ fontSize: "16px", lineHeight: 1 }}>ℹ️</span>
                <span>{assignmentPreview}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || submitSuccess}
              className="w-full py-4 rounded-lg font-semibold text-white shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: branding?.primaryColor
                  ? `linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.secondaryColor} 100%)`
                  : "linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)",
              }}
            >
              {submitting
                ? "Submitting..."
                : submitSuccess
                  ? "Submitted!"
                  : "Submit Query"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AuthenticatedStudentSubmitTicket;
