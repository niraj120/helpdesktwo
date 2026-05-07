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
  const [ticketSettings, setTicketSettings] =
    useState<TicketSubmissionSettings | null>(null);
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
      if (!token) {
        // No token - component will show login prompt or handle accordingly
        // Don't redirect, let the parent route handle it
        setLoading(false);
        return;
      }

      // Fetch branding
      const brandingRes = await axios.get(
        `${API_CONFIG.API_URL}/projects/branding/${customUrlPath}`,
      );
      const brandingData = brandingRes.data.success
        ? brandingRes.data.data
        : brandingRes.data;
      setBranding(brandingData);

      // Fetch categories from master
      const categoriesRes = await axios.get(
        `${API_CONFIG.API_URL}/categories/project/${brandingData.projectId}`,
      );
      const categoryList = categoriesRes.data.success
        ? categoriesRes.data.data
        : categoriesRes.data;
      const activeCategoryNames = categoryList
        .filter((cat: any) => cat.isActive)
        .map((cat: any) => cat.name);

      console.log("📁 Categories fetched from master:", activeCategoryNames);
      console.log("📁 Total categories:", activeCategoryNames.length);

      // Fetch ticket settings
      const cacheBuster = `?t=${Date.now()}`;
      const settingsRes = await axios.get(
        `${API_CONFIG.API_URL}/projects/${brandingData.projectId}/ticket-settings${cacheBuster}`,
      );
      const settings = settingsRes.data.success
        ? settingsRes.data.data
        : settingsRes.data;

      console.log("📋 Ticket settings received:", settings);
      console.log("📝 Online form fields:", settings.onlineFormFields);

      // Filter out student profile fields (Name, Email, Phone/Mobile Number) and Priority
      const excludeFields = [
        "name",
        "email",
        "phone",
        "mobile",
        "mobile number",
        "phone number",
        "student name",
        "student email",
        "contact number",
        "email address",
        "full name",
        "priority",
      ];
      let formFields = settings.onlineFormFields || [];

      // If no fields configured, use default fields (excluding profile fields)
      if (formFields.length === 0) {
        formFields = [
          {
            fieldName: "Subject",
            fieldType: "text",
            required: true,
            placeholder: "Enter query subject",
          },
          {
            fieldName: "Description",
            fieldType: "textarea",
            required: true,
            placeholder: "Describe your issue in detail",
          },
          {
            fieldName: "Category",
            fieldType: "dropdown",
            required: false,
            placeholder: "Select category",
            options: activeCategoryNames,
          },
        ];
      } else {
        // Update category field options with fetched categories
        formFields = formFields.map((field: OnlineFormField) => {
          if (
            field.fieldName.toLowerCase() === "category" &&
            field.fieldType === "dropdown"
          ) {
            return { ...field, options: activeCategoryNames };
          }
          return field;
        });

        // Inject a Category field at the top if none is present.
        // FormRenderer will replace it with HierarchyCategorySelector when
        // hierarchy is configured (levelCount > 1), or render a plain dropdown otherwise.
        const hasCategoryField = formFields.some(
          (f: OnlineFormField) => f.fieldName.toLowerCase() === "category",
        );
        if (!hasCategoryField) {
          formFields = [
            {
              fieldName: "Category",
              fieldType: "dropdown",
              required: false,
              placeholder: "Select category",
              options: activeCategoryNames,
            },
            ...formFields,
          ];
        }
      }

      // Set categories AFTER processing fields
      setCategories(activeCategoryNames);
      setCategoryObjects(
        categoryList
          .filter((cat: any) => cat.isActive)
          .map((cat: any) => ({ _id: cat._id, name: cat.name })),
      );

      const filteredFields = formFields.filter(
        (field: OnlineFormField) =>
          !excludeFields.includes(field.fieldName.toLowerCase()),
      );

      console.log("✅ Filtered fields (without profile):", filteredFields);

      setTicketSettings({
        ...settings,
        onlineFormFields: filteredFields,
      });
    } catch (error) {
      console.error("Error fetching data:", error);
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

      // Validate required fields — respects conditional visibility
      const allFields = ticketSettings?.onlineFormFields || [];
      const { visibleFields, requiredFields } = conditionEngine(
        allFields,
        formData,
      );

      // For the Category field, when using HierarchyCategorySelector the value
      // stored in formData["category"] is a CategoryHierarchyValue object.
      // Replace the truthiness check with an explicit level1 check.
      const categoryFieldName = allFields.find(
        (f) => f.fieldName.toLowerCase() === "category",
      )?.fieldName;
      const missingFields = Array.from(requiredFields).filter((fieldName) => {
        if (
          categoryFieldName &&
          fieldName === categoryFieldName &&
          hierarchyConfig &&
          hierarchyConfig.levelCount > 1
        ) {
          // Hierarchy selector: require level1 to be selected
          return !categoryHierarchy.level1;
        }
        return !formData[fieldName] && !(fieldFiles[fieldName]?.length > 0);
      });

      if (missingFields.length > 0) {
        setSubmitError("Please fill in all required fields");
        window.scrollTo({ top: 0, behavior: "smooth" });
        setSubmitting(false);
        return;
      }

      // Validate mandatory hierarchy sub-levels (level 2, 3, 4) when options exist
      if (hierarchyConfig && hierarchyConfig.levelCount > 1) {
        const onlineLevels =
          hierarchyConfig.visibilitySettings.showInOnlineForm;
        for (const levelConf of hierarchyConfig.levels) {
          if (!onlineLevels.includes(levelConf.levelNumber)) continue;
          if (!levelConf.isMandatory) continue;
          if (levelConf.levelNumber === 1) continue; // already checked above
          // Only require if options are available for this level
          if (!hierarchyLevelHasOptions[levelConf.levelNumber]) continue;
          const val =
            categoryHierarchy[
              `level${levelConf.levelNumber}` as keyof typeof categoryHierarchy
            ];
          if (!val) {
            setSubmitError(`Please select ${levelConf.displayName}`);
            window.scrollTo({ top: 0, behavior: "smooth" });
            setSubmitting(false);
            return;
          }
        }
      }

      // Validate field-level rules (minLength, maxLength, regex) for visible fields
      for (const field of allFields) {
        if (!visibleFields.has(field.fieldName)) continue;
        const v = (field as any).validation;
        if (!v) continue;
        const rawValue = formData[field.fieldName];
        const value = rawValue == null ? "" : String(rawValue);
        // Skip empty optional fields — required check was already done above
        if (!value) continue;
        const label = (field as any).displayLabel || field.fieldName;
        if (v.minLength != null && value.length < Number(v.minLength)) {
          setSubmitError(`${label} must be at least ${v.minLength} characters`);
          window.scrollTo({ top: 0, behavior: "smooth" });
          setSubmitting(false);
          return;
        }
        if (v.maxLength != null && value.length > Number(v.maxLength)) {
          setSubmitError(`${label} must be at most ${v.maxLength} characters`);
          window.scrollTo({ top: 0, behavior: "smooth" });
          setSubmitting(false);
          return;
        }
        if (v.regex) {
          try {
            const re = new RegExp(v.regex);
            if (!re.test(value)) {
              setSubmitError(`${label} is not in the correct format`);
              window.scrollTo({ top: 0, behavior: "smooth" });
              setSubmitting(false);
              return;
            }
          } catch {
            // invalid regex pattern — skip silently
          }
        }
      }

      // Prepare form data — only send values from visible fields
      const submitData = new FormData();
      submitData.append("projectId", branding?.projectId || "");
      submitData.append(
        "formData",
        JSON.stringify(filterFormDataToVisible(formData, visibleFields)),
      );

      // Add hierarchical category data if configured
      if (
        hierarchyConfig &&
        hierarchyConfig.levelCount > 1 &&
        categoryHierarchy &&
        categoryHierarchy.level1
      ) {
        submitData.append(
          "categoryHierarchy",
          JSON.stringify(categoryHierarchy),
        );
        // Also set the primary category from level1 for backward compatibility
        submitData.append("category", categoryHierarchy.level1);
      }

      // Add file attachments — only for visible fields
      Object.entries(fieldFiles).forEach(([fieldName, files]) => {
        if (!visibleFields.has(fieldName)) return;
        files.forEach((file) => {
          submitData.append(fieldName, file);
        });
      });

      console.log("📤 Submitting ticket with data:", {
        projectId: branding?.projectId,
        formData: formData,
        fileCount: Object.values(fieldFiles).flat().length,
      });

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
            {ticketSettings?.welcomeMessage && (
              <p className="text-gray-600">{ticketSettings.welcomeMessage}</p>
            )}
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
                  {ticketSettings?.successMessage ||
                    "Your query has been submitted. Our team will get back to you soon."}
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
        {ticketSettings?.announcement && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <p className="text-blue-900 text-sm">
              {ticketSettings.announcement}
            </p>
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
            {ticketSettings?.onlineFormFields &&
            ticketSettings.onlineFormFields.length > 0 ? (
              <FormRenderer
                fields={ticketSettings.onlineFormFields}
                formData={formData}
                onChange={handleInputChange}
                onFileChange={handleFileChange}
                fieldFiles={fieldFiles}
                onRemoveFile={removeFieldFile}
                branding={branding || undefined}
                categoryFieldOverride={
                  hierarchyConfig &&
                  hierarchyConfig.levelCount > 1 &&
                  branding?.projectId ? (
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
                        handleInputChange("category", newValue);
                        // Also push level names into formData keyed by level displayName
                        // so conditionEngine can match text conditions like
                        // "Subcategory equals Name change" (names, not ObjectIds).
                        if (hierarchyConfig?.levels) {
                          const nameUpdates: Record<string, string> = {};
                          hierarchyConfig.levels.forEach((l: any) => {
                            const nameKey =
                              `level${l.levelNumber}Name` as keyof typeof newValue;
                            nameUpdates[l.displayName] =
                              (newValue[nameKey] as string) || "";
                          });
                          setFormData((prev: any) => ({
                            ...prev,
                            ...nameUpdates,
                          }));
                        }
                        // Trigger preview for hierarchical selector using level1 (ObjectId or name)
                        const level1 = newValue?.level1;
                        if (level1) {
                          // If it looks like an ObjectId (24-char hex) use directly
                          if (/^[a-f0-9]{24}$/i.test(level1)) {
                            fetchAssignmentPreview(level1);
                          } else {
                            const match = categoryObjects.find(
                              (c) => c.name === level1,
                            );
                            if (match) fetchAssignmentPreview(match._id);
                            else setAssignmentPreview(null);
                          }
                        } else {
                          setAssignmentPreview(null);
                        }
                      }}
                      mode="online"
                      showValidation={false}
                    />
                  ) : undefined
                }
              />
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>
                  No form fields configured. Please contact the administrator.
                </p>
              </div>
            )}

            {/* US-014: Assignment preview — shown after category selection */}
            {assignmentPreview && (
              <div
                className="flex items-start gap-2 px-4 py-3 rounded-lg text-sm"
                style={{
                  backgroundColor: "#f0f9ff",
                  border: "1px solid #bae6fd",
                  color: "#0369a1",
                }}
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
