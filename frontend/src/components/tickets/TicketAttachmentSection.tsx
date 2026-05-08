import React, { useState, useEffect } from "react";
import axios from "axios";
import API_BASE_URL from "../../config/api";
import {
  PaperClipIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  DocumentArrowDownIcon,
} from "@heroicons/react/24/outline";

interface Attachment {
  _id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: {
    _id: string;
    name: string;
  };
  uploadedAt: string;
  url: string;
}

interface TicketAttachmentSectionProps {
  ticketId: string;
  attachments: Attachment[];
  canAdd: boolean; // TICKET_ADD_ATTACHMENT permission
  canDelete: boolean; // TICKET_DELETE_ATTACHMENT permission
  onAttachmentsChange: (attachments: Attachment[]) => void;
}

export const TicketAttachmentSection: React.FC<
  TicketAttachmentSectionProps
> = ({ ticketId, attachments, canAdd, canDelete, onAttachmentsChange }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      setError("File size must be less than 50MB");
      return;
    }

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.post(
        `${API_BASE_URL}/tickets/${ticketId}/attachments`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 100),
            );
            setUploadProgress(percentCompleted);
          },
        },
      );

      if (response.data.success) {
        onAttachmentsChange([...attachments, response.data.data]);
        setUploadProgress(0);
      }
    } catch (err: any) {
      console.error("Error uploading file:", err);
      setError(err.response?.data?.error || "Failed to upload file");
    } finally {
      setUploading(false);
      e.target.value = ""; // Reset file input
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!window.confirm("Are you sure you want to delete this attachment?")) {
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.delete(
        `${API_BASE_URL}/tickets/${ticketId}/attachments/${attachmentId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.data.success) {
        onAttachmentsChange(attachments.filter((a) => a._id !== attachmentId));
      }
    } catch (err: any) {
      console.error("Error deleting attachment:", err);
      setError(err.response?.data?.error || "Failed to delete attachment");
    }
  };

  const handleDownloadAttachment = async (attachment: Attachment) => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await axios.get(
        `${API_BASE_URL}/tickets/${ticketId}/attachments/${attachment._id}/download`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          responseType: "blob",
        },
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", attachment.originalName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Error downloading attachment:", err);
      setError("Failed to download attachment");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getFileIcon = (mimeType: string): React.ReactNode => {
    if (mimeType.startsWith("image/")) {
      return <span className="text-2xl">🖼️</span>;
    } else if (mimeType.includes("pdf")) {
      return <span className="text-2xl">📄</span>;
    } else if (mimeType.includes("word") || mimeType.includes("document")) {
      return <span className="text-2xl">📝</span>;
    } else if (mimeType.includes("sheet") || mimeType.includes("excel")) {
      return <span className="text-2xl">📊</span>;
    } else if (mimeType.includes("zip") || mimeType.includes("rar")) {
      return <span className="text-2xl">📦</span>;
    }
    return <span className="text-2xl">📎</span>;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <PaperClipIcon className="h-5 w-5 mr-2" />
          Attachments ({attachments.length})
        </h3>

        {canAdd && (
          <label className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 cursor-pointer">
            <input
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv,.zip,.rar,.mp4,.mov,.avi,.mkv,.webm"
            />
            {uploading ? "Uploading..." : "Upload File"}
          </label>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {uploading && (
        <div className="mb-4">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {uploadProgress}% uploaded
          </p>
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          No attachments yet.{" "}
          {canAdd && 'Click "Upload File" to add attachments.'}
        </p>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={attachment._id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="flex-shrink-0">
                  {getFileIcon(attachment.mimeType)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {attachment.originalName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(attachment.size)} • Uploaded by{" "}
                    {attachment.uploadedBy.name} •{" "}
                    {new Date(attachment.uploadedAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => handleDownloadAttachment(attachment)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Download"
                >
                  <ArrowDownTrayIcon className="h-5 w-5" />
                </button>

                {canDelete && (
                  <button
                    onClick={() => handleDeleteAttachment(attachment._id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 mt-4">
        Maximum file size: 50MB. Supported formats: Images, Videos, PDF,
        Documents, Spreadsheets, Archives
      </p>
    </div>
  );
};

export default TicketAttachmentSection;
