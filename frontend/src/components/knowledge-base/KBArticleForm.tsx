import React, { useState, useEffect } from "react";
import axios from "axios";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { X, Upload, Calendar, Eye, Users } from "lucide-react";
import { API_CONFIG } from "../../config/constants";

interface KBLevel {
  _id: string;
  levelName: string;
}

interface Role {
  _id: string;
  name: string;
  code?: string;
}

interface KBArticleFormProps {
  projectId: string;
  article?: any | null;
  onClose: () => void;
}

const KBArticleForm: React.FC<KBArticleFormProps> = ({
  projectId,
  article,
  onClose,
}) => {
  const [levels, setLevels] = useState<KBLevel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  // Initialize formData directly from article prop
  const [formData, setFormData] = useState(() => {
    if (article) {
      console.log("🎯 Initializing form with article:", article);
      return {
        documentName: article.documentName || "",
        documentType: article.documentType || "both",
        description: article.description || "",
        externalUrl: article.externalUrl || "",
        htmlContent: article.htmlContent || "",
        publishedDate: article.publishedDate
          ? new Date(article.publishedDate).toISOString().slice(0, 16)
          : "",
        levelIds: article.levels?.map((l: any) => l._id) || [],
        tags: article.tags || [],
        author: article.author || "",
        status: article.status || "active",
        isFeatured: article.isFeatured || false,
        showNewTag:
          article.showNewTag !== undefined ? article.showNewTag : true,
        displayOrder: article.displayOrder || 0,
        visibility: article.visibility || "all",
        visibleToRoles: article.visibleToRoles || [],
      };
    }
    console.log("🎯 Initializing form for new article");
    return {
      documentName: "",
      documentType: "both" as "pdf" | "html" | "both" | "link",
      description: "",
      externalUrl: "",
      htmlContent: "",
      publishedDate: "",
      levelIds: [] as string[],
      tags: [] as string[],
      author: "",
      status: "active" as "active" | "inactive",
      isFeatured: false,
      showNewTag: true,
      displayOrder: 0,
      visibility: "all" as "all" | "internal" | "public" | "role_based",
      visibleToRoles: [] as string[],
    };
  });

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchLevels();
    fetchRoles();
  }, [projectId]);

  const fetchLevels = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(`${API_CONFIG.API_URL}/kb/levels`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { projectId, status: "active" },
      });
      setLevels(response.data.data || []);
    } catch (error) {
      console.error("Failed to fetch levels:", error);
    }
  };

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(`${API_CONFIG.API_URL}/roles`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { projectId },
      });
      const rolesData = response.data.data || response.data || [];
      setRoles(rolesData);
    } catch (error) {
      console.error("Failed to fetch roles:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem("authToken");
      const formDataToSend = new FormData();

      // Append all fields
      formDataToSend.append("documentName", formData.documentName);
      formDataToSend.append("documentType", formData.documentType);
      formDataToSend.append("projectIds", JSON.stringify([projectId]));
      formDataToSend.append("levelIds", JSON.stringify(formData.levelIds));
      formDataToSend.append("status", formData.status);
      formDataToSend.append("isFeatured", formData.isFeatured.toString());
      formDataToSend.append("showNewTag", formData.showNewTag.toString());
      formDataToSend.append("displayOrder", formData.displayOrder.toString());
      formDataToSend.append("visibility", formData.visibility);
      formDataToSend.append(
        "visibleToRoles",
        JSON.stringify(formData.visibleToRoles),
      );

      if (formData.description) {
        formDataToSend.append("description", formData.description);
      }

      if (formData.publishedDate) {
        formDataToSend.append("publishedDate", formData.publishedDate);
      }

      if (formData.externalUrl) {
        formDataToSend.append("externalUrl", formData.externalUrl);
      }

      if (formData.htmlContent) {
        formDataToSend.append("htmlContent", formData.htmlContent);
      }

      if (formData.tags.length > 0) {
        formDataToSend.append("tags", JSON.stringify(formData.tags));
      }

      if (formData.author) {
        formDataToSend.append("author", formData.author);
      }

      if (pdfFile) {
        formDataToSend.append("pdf", pdfFile);
      }

      if (article) {
        // Update existing article
        await axios.put(
          `${API_CONFIG.API_URL}/kb/articles/${article._id}`,
          formDataToSend,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "multipart/form-data",
            },
          },
        );
      } else {
        // Create new article
        await axios.post(`${API_CONFIG.API_URL}/kb/articles`, formDataToSend, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        });
      }

      alert("Article saved successfully!");
      onClose();
    } catch (error: any) {
      console.error("Failed to save article:", error);
      alert(error.response?.data?.message || "Failed to save article");
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim()],
      });
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((t: string) => t !== tag),
    });
  };

  const quillModules = {
    toolbar: [
      [{ header: [1, 2, 3, 4, 5, 6, false] }],
      [{ font: [] }],
      [{ size: ["small", false, "large", "huge"] }],
      ["bold", "italic", "underline", "strike"],
      [{ color: [] }, { background: [] }],
      [{ script: "sub" }, { script: "super" }],
      [
        { list: "ordered" },
        { list: "bullet" },
        { indent: "-1" },
        { indent: "+1" },
      ],
      [{ align: [] }],
      ["blockquote", "code-block"],
      ["link", "image", "video"],
      ["clean"],
    ],
    clipboard: {
      matchVisual: false, // Preserve formatting when pasting
    },
  };

  const quillFormats = [
    "header",
    "font",
    "size",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "script",
    "list",
    "bullet",
    "indent",
    "align",
    "blockquote",
    "code-block",
    "link",
    "image",
    "video",
  ];

  const [showHtmlSource, setShowHtmlSource] = useState(false);
  const [htmlSource, setHtmlSource] = useState("");

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">
            {article ? "Edit Article" : "Create New Article"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Document Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Document Name *
            </label>
            <input
              type="text"
              value={formData.documentName}
              onChange={(e) =>
                setFormData({ ...formData, documentName: e.target.value })
              }
              className="w-full border rounded px-3 py-2"
              required
              maxLength={200}
            />
          </div>

          {/* Description/Subject */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Description / Subject
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full border rounded px-3 py-2"
              rows={3}
              maxLength={1000}
              placeholder="Brief description or subject of the article (optional)"
            />
            <p className="text-xs text-gray-500 mt-1">
              {formData.description.length}/1000 characters
            </p>
          </div>

          {/* Document Type */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Document Type *
            </label>
            <select
              value={formData.documentType}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  documentType: e.target.value as
                    | "pdf"
                    | "html"
                    | "both"
                    | "link",
                })
              }
              className="w-full border rounded px-3 py-2"
            >
              <option value="pdf">PDF Only</option>
              <option value="html">HTML Only</option>
              <option value="both">Both PDF and HTML</option>{" "}
              <option value="link">External Link</option>{" "}
            </select>
          </div>

          {/* External URL - Only for link type */}
          {formData.documentType === "link" && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                External URL *
              </label>
              <input
                type="url"
                value={formData.externalUrl}
                onChange={(e) =>
                  setFormData({ ...formData, externalUrl: e.target.value })
                }
                placeholder="https://example.com/document"
                className="w-full border rounded px-3 py-2"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the full URL of the external document or resource
              </p>
            </div>
          )}

          {/* PDF Upload */}
          {(formData.documentType === "pdf" ||
            formData.documentType === "both") && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                Upload PDF {formData.documentType === "pdf" ? "*" : ""}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="pdf-upload"
                />
                <label
                  htmlFor="pdf-upload"
                  className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded cursor-pointer"
                >
                  <Upload size={18} />
                  Choose PDF
                </label>
                {pdfFile && (
                  <span className="text-sm text-gray-600">{pdfFile.name}</span>
                )}
                {article?.pdfUrl && !pdfFile && (
                  <span className="text-sm text-green-600">
                    ✓ PDF already uploaded
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">Max 10MB</p>
            </div>
          )}

          {/* HTML Content */}
          {(formData.documentType === "html" ||
            formData.documentType === "both") && (
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium">
                  HTML Content {formData.documentType === "html" ? "*" : ""}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (showHtmlSource) {
                      // Switching from HTML to visual - apply HTML changes
                      setFormData({ ...formData, htmlContent: htmlSource });
                    } else {
                      // Switching from visual to HTML - load current content
                      setHtmlSource(formData.htmlContent);
                    }
                    setShowHtmlSource(!showHtmlSource);
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm flex items-center gap-2"
                >
                  {showHtmlSource ? (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                      Visual Editor
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                        />
                      </svg>
                      HTML Source
                    </>
                  )}
                </button>
              </div>

              {showHtmlSource ? (
                <div>
                  <textarea
                    value={htmlSource}
                    onChange={(e) => setHtmlSource(e.target.value)}
                    className="w-full h-96 border rounded px-3 py-2 font-mono text-sm"
                    placeholder="Paste your HTML code here..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    💡 Tip: Paste HTML code directly. Switch to Visual Editor to
                    see the result.
                  </p>
                </div>
              ) : (
                <>
                  <ReactQuill
                    theme="snow"
                    value={formData.htmlContent}
                    onChange={(value) =>
                      setFormData({ ...formData, htmlContent: value })
                    }
                    modules={quillModules}
                    formats={quillFormats}
                    className="bg-white"
                    style={{ height: "400px", marginBottom: "50px" }}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    💡 Tip: Use the toolbar for formatting, or switch to HTML
                    Source to paste raw HTML code.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Level Mapping */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Map to Levels * (Select at least one)
            </label>
            <div className="border rounded p-3 max-h-48 overflow-y-auto">
              {levels.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No levels available. Create levels first.
                </p>
              ) : (
                levels.map((level) => (
                  <label
                    key={level._id}
                    className="flex items-center gap-2 mb-2"
                  >
                    <input
                      type="checkbox"
                      checked={formData.levelIds.includes(level._id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({
                            ...formData,
                            levelIds: [...formData.levelIds, level._id],
                          });
                        } else {
                          setFormData({
                            ...formData,
                            levelIds: formData.levelIds.filter(
                              (id: string) => id !== level._id,
                            ),
                          });
                        }
                      }}
                    />
                    <span>{level.levelName}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Published Date */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              <Calendar size={16} className="inline mr-1" />
              Published Date
            </label>
            <input
              type="datetime-local"
              value={formData.publishedDate}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  publishedDate: e.target.value,
                })
              }
              className="w-full border rounded px-3 py-2"
            />
            <p className="text-xs text-gray-500 mt-1">
              This date will be shown to users as the publication date
            </p>
          </div>

          {/* Tags */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Tags</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) =>
                  e.key === "Enter" && (e.preventDefault(), handleAddTag())
                }
                className="flex-1 border rounded px-3 py-2"
                placeholder="Add tag and press Enter"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full flex items-center gap-1"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-red-600"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Author */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Author</label>
            <input
              type="text"
              value={formData.author}
              onChange={(e) =>
                setFormData({ ...formData, author: e.target.value })
              }
              className="w-full border rounded px-3 py-2"
            />
          </div>

          {/* Status and Featured */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    status: e.target.value as "active" | "inactive",
                  })
                }
                className="w-full border rounded px-3 py-2"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Featured</label>
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={formData.isFeatured}
                  onChange={(e) =>
                    setFormData({ ...formData, isFeatured: e.target.checked })
                  }
                />
                <span>Mark as featured article</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Show "New" Tag
              </label>
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={formData.showNewTag}
                  onChange={(e) =>
                    setFormData({ ...formData, showNewTag: e.target.checked })
                  }
                />
                <span>Display "NEW" badge on user side</span>
              </label>
              <p className="text-xs text-gray-500 mt-1">
                Enable to show a "NEW" tag for recently published articles
              </p>
            </div>
          </div>

          {/* Display Order */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-1">
              Display Order (0 = default)
            </label>
            <input
              type="number"
              value={formData.displayOrder}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  displayOrder: parseInt(e.target.value) || 0,
                })
              }
              className="w-full border rounded px-3 py-2"
              min="0"
            />
          </div>

          {/* Visibility Settings */}
          <div className="mb-6 p-4 border rounded-lg bg-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-5 h-5 text-gray-600" />
              <h3 className="font-medium">Visibility Settings</h3>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                Who can view this article?
              </label>
              <select
                value={formData.visibility}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    visibility: e.target.value as
                      | "all"
                      | "internal"
                      | "public"
                      | "role_based",
                    visibleToRoles:
                      e.target.value !== "role_based"
                        ? []
                        : formData.visibleToRoles,
                  })
                }
                className="w-full border rounded px-3 py-2"
              >
                <option value="all">All Users (Everyone)</option>
                <option value="public">
                  Public Only (End Users / Students)
                </option>
                <option value="internal">Internal Only (Agents)</option>
                <option value="role_based">
                  Role-Based (Select specific roles)
                </option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {formData.visibility === "all" &&
                  "This article will be visible to everyone."}
                {formData.visibility === "public" &&
                  "This article will only be visible to end users (students) on the public portal."}
                {formData.visibility === "internal" &&
                  "This article will only be visible to internal agents for ticket resolution."}
                {formData.visibility === "role_based" &&
                  "Select which roles can view this article below."}
              </p>
            </div>

            {formData.visibility === "role_based" && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  <Users className="w-4 h-4 inline mr-1" />
                  Select Roles
                </label>
                <div className="max-h-40 overflow-y-auto border rounded p-2 bg-white">
                  {roles.length === 0 ? (
                    <p className="text-sm text-gray-500 p-2">
                      No roles found for this project
                    </p>
                  ) : (
                    roles.map((role) => (
                      <label
                        key={role._id}
                        className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formData.visibleToRoles.includes(role._id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                visibleToRoles: [
                                  ...formData.visibleToRoles,
                                  role._id,
                                ],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                visibleToRoles: formData.visibleToRoles.filter(
                                  (id: string) => id !== role._id,
                                ),
                              });
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{role.name}</span>
                        {role.code && (
                          <span className="text-xs text-gray-400">
                            ({role.code})
                          </span>
                        )}
                      </label>
                    ))
                  )}
                </div>
                {formData.visibleToRoles.length > 0 && (
                  <p className="text-xs text-blue-600 mt-1">
                    {formData.visibleToRoles.length} role(s) selected
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border rounded hover:bg-gray-100"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Saving..." : article ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default KBArticleForm;
