import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import DOMPurify from "dompurify";
import { API_CONFIG } from "../config/constants";
import FeedbackSubmission from "../components/FeedbackSubmission";
import {
  ArrowLeftIcon,
  PaperClipIcon,
  DocumentArrowUpIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  TicketIcon,
} from "@heroicons/react/24/outline";

interface Ticket {
  _id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: number; // 1=Open, 2=In Progress, 3=On Hold, 4=Resolved, 5=Closed
  priority: "low" | "medium" | "high" | "urgent";
  category: string | { _id: string; name: string };
  createdAt: string;
  updatedAt: string;
  attachments?: Array<{
    filename: string;
    path: string;
    mimetype: string;
    size: number;
  }>;
  assignedTo?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  threads?: Array<{
    _id: string;
    message: string;
    createdBy: {
      firstName: string;
      lastName: string;
      email: string;
      role: { name: string };
    };
    attachments?: Array<{
      filename: string;
      path: string;
      mimetype: string;
      size: number;
    }>;
    createdAt: string;
  }>;
  isMerged?: boolean;
  mergedInto?:
    | string
    | { _id: string; ticketNumber: string; subject?: string; title?: string };
}

interface ProjectBranding {
  projectId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
}

interface TicketSettings {
  allowStudentToCloseTicket?: boolean;
}

/** Opens an attachment URL in a new tab, fetching a fresh signed URL if needed.
 * The tab is opened BEFORE the async call so browsers don't block it as a popup. */
const openAttachment = async (pathOrUrl: string | undefined) => {
  if (!pathOrUrl) return;
  // If the path is already a full URL (e.g. GCS signed URL), open it directly.
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    window.open(pathOrUrl, "_blank", "noopener,noreferrer");
    return;
  }
  // Otherwise it's a relative backend path — open the tab first, then fetch a signed URL.
  // NOTE: do NOT pass noopener here or window.open returns null in modern browsers.
  const newTab = window.open("", "_blank");
  const token = localStorage.getItem("authToken");
  try {
    const res = await axios.get(
      `${API_CONFIG.BASE_URL}/api/tickets/attachment-signed-url?path=${encodeURIComponent(pathOrUrl)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const url: string = res.data?.url || `${API_CONFIG.BASE_URL}${pathOrUrl}`;
    if (newTab) newTab.location.href = url;
  } catch {
    if (newTab) newTab.location.href = `${API_CONFIG.BASE_URL}${pathOrUrl}`;
  }
};

const StudentTicketDetail: React.FC = () => {
  const { customUrlPath, ticketId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useState(
    () => new URLSearchParams(window.location.search),
  );

  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [branding, setBranding] = useState<ProjectBranding | null>(null);
  const [ticketSettings, setTicketSettings] = useState<TicketSettings | null>(
    null,
  );
  const [replyMessage, setReplyMessage] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [closingTicket, setClosingTicket] = useState(false);
  const [reopeningTicket, setReopeningTicket] = useState(false);

  // Feedback mode detection
  const showFeedbackForm = searchParams.get("feedback") === "true";
  const studentIdFromUrl = searchParams.get("studentId");
  const emailFromUrl = searchParams.get("email");

  useEffect(() => {
    fetchData();
  }, [ticketId]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) {
        navigate(`/${customUrlPath}/submit-ticket`);
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

      // Fetch ticket settings
      const cacheBuster = `?t=${Date.now()}`;
      const settingsRes = await axios.get(
        `${API_CONFIG.API_URL}/projects/${brandingData.projectId}/ticket-settings${cacheBuster}`,
      );
      const settings = settingsRes.data.success
        ? settingsRes.data.data
        : settingsRes.data;
      setTicketSettings(settings);

      // Fetch ticket details
      const ticketRes = await axios.get(
        `${API_CONFIG.API_URL}/tickets/${ticketId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setTicket(ticketRes.data.data);
    } catch (error: any) {
      console.error("Error fetching ticket:", error);
      if (error.response?.status === 401) {
        localStorage.removeItem("authToken");
        navigate(`/${customUrlPath}/submit-ticket`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setReplyFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setReplyFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim() && replyFiles.length === 0) return;

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const token = localStorage.getItem("authToken");
      const formData = new FormData();
      formData.append("message", replyMessage);

      replyFiles.forEach((file) => {
        formData.append("attachments", file);
      });

      await axios.post(
        `${API_CONFIG.API_URL}/tickets/${ticketId}/reply`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
        },
      );

      setSubmitSuccess(true);
      setReplyMessage("");
      setReplyFiles([]);

      // Refresh ticket data
      fetchData();

      // Scroll to bottom to show new reply
      setTimeout(() => {
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
    } catch (error: any) {
      setSubmitError(error.response?.data?.message || "Failed to submit reply");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopenTicket = async () => {
    if (!confirm("Are you sure you want to reopen this query?")) {
      return;
    }

    setReopeningTicket(true);
    try {
      const token = localStorage.getItem("authToken");
      await axios.patch(
        `${API_CONFIG.API_URL}/tickets/${ticketId}/reopen`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setSubmitSuccess(true);
      fetchData();
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (error: any) {
      setSubmitError(error.response?.data?.message || "Failed to reopen query");
    } finally {
      setReopeningTicket(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!confirm("Are you sure you want to close this query?")) {
      return;
    }

    setClosingTicket(true);
    try {
      const token = localStorage.getItem("authToken");
      await axios.patch(
        `${API_CONFIG.API_URL}/tickets/${ticketId}/close`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      // Refresh query data
      fetchData();
      alert("Query closed successfully");
    } catch (error: any) {
      alert(error.response?.data?.message || "Failed to close query");
    } finally {
      setClosingTicket(false);
    }
  };

  const getStatusName = (status: string | number): string => {
    const statusCode = typeof status === "number" ? status : Number(status);
    const statusNames: Record<number, string> = {
      1: "Open",
      2: "In Progress",
      3: "On Hold",
      4: "Resolved",
      5: "Closed",
    };
    return statusNames[statusCode] || `Status ${statusCode}`;
  };

  const getStatusColor = (status: string | number) => {
    const statusCode = typeof status === "number" ? status : Number(status);
    const colors: Record<number, string> = {
      1: "bg-blue-100 text-blue-800",
      2: "bg-yellow-100 text-yellow-800",
      3: "bg-pink-100 text-pink-800",
      4: "bg-green-100 text-green-800",
      5: "bg-gray-100 text-gray-800",
    };
    return colors[statusCode] || "bg-gray-100 text-gray-800";
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "text-red-600";
      case "high":
        return "text-orange-600";
      case "medium":
        return "text-yellow-600";
      case "low":
        return "text-green-600";
      default:
        return "text-gray-600";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };
  // Replace "Ticket" with "Query" in messages for consistent terminology
  const formatMessage = (message: string): string => {
    return message
      .replace(/\bTicket\b/g, "Query")
      .replace(/\bticket\b/g, "query");
  };
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Ticket not found</p>
          <button
            onClick={() => navigate(`/${customUrlPath}/student/my-tickets`)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to My Queries
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center space-x-4 mb-4">
          <button
            onClick={() => navigate(`/${customUrlPath}/student/my-tickets`)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Back to My Queries"
          >
            <ArrowLeftIcon className="h-6 w-6 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Query Details</h1>
            <p className="text-gray-600 text-sm">{ticket.ticketNumber}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div>
        {/* Success Message */}
        {submitSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start space-x-3">
            <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-green-900">
                Reply sent successfully!
              </h3>
            </div>
          </div>
        )}

        {/* Error Message */}
        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start space-x-3">
            <ExclamationCircleIcon className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-red-900">Error</h3>
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          </div>
        )}

        {/* Merged-into banner — shown when this is a secondary/merged ticket */}
        {ticket.isMerged && ticket.mergedInto && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 flex items-start space-x-3">
            <ExclamationCircleIcon className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-900">
                This query has been merged
              </h3>
              <p className="text-sm text-amber-800 mt-1">
                This query was merged into{" "}
                <button
                  className="font-bold underline hover:text-amber-900"
                  onClick={() => {
                    const primary = ticket.mergedInto;
                    if (primary && typeof primary === "object") {
                      navigate(
                        `/${customUrlPath}/student/ticket/${primary._id}`,
                      );
                    }
                  }}
                >
                  {typeof ticket.mergedInto === "object"
                    ? ticket.mergedInto.ticketNumber
                    : ticket.mergedInto}
                </button>
                . All updates are tracked there. Please click to view the active
                query.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Ticket Info */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-start justify-between p-6 border-b border-gray-100">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="p-1.5 bg-blue-100 rounded-lg">
                      <TicketIcon className="h-4 w-4 text-blue-600" />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      Subject
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {ticket.subject}
                  </h2>
                </div>
                <div className="flex flex-col items-end space-y-2 ml-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 font-medium">Status –</span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}
                    >
                      {getStatusName(ticket.status).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 font-medium">Priority –</span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}
                    >
                      {ticket.priority.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-center space-x-2 mb-3">
                  <div className="p-1.5 bg-purple-100 rounded-lg">
                    <DocumentArrowUpIcon className="h-4 w-4 text-purple-600" />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    Description
                  </span>
                </div>
                <div className="prose max-w-none text-gray-700 text-sm leading-relaxed">
                  {/<[a-z][\s\S]*>/i.test(ticket.description || "") ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(ticket.description || ""),
                      }}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{ticket.description}</p>
                  )}
                </div>
              </div>

              {/* Original Attachments */}
              {ticket.attachments && ticket.attachments.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Attachments:
                  </h3>
                  <div className="space-y-2">
                    {ticket.attachments.map((file, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => openAttachment(file.path)}
                        className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-700"
                      >
                        <PaperClipIcon className="h-4 w-4" />
                        <span>{file.filename}</span>
                        <span className="text-gray-400">
                          ({formatFileSize(file.size)})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Threads/Replies */}
            {ticket.threads && ticket.threads.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Conversation
                </h3>
                {ticket.threads.map((thread) => (
                  <div
                    key={thread._id}
                    className="bg-white rounded-xl shadow-sm p-6"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                          {thread.createdBy.firstName.charAt(0)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {thread.createdBy.firstName}{" "}
                              {thread.createdBy.lastName}
                              {thread.createdBy.role?.name && (
                                <span className="ml-2 text-xs text-gray-500">
                                  ({thread.createdBy.role.name})
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(thread.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <p className="text-gray-700 whitespace-pre-wrap">
                          {formatMessage(thread.message)}
                        </p>

                        {/* Thread Attachments */}
                        {thread.attachments &&
                          thread.attachments.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {thread.attachments.map((file, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => openAttachment(file.path)}
                                  className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-700"
                                >
                                  <PaperClipIcon className="h-4 w-4" />
                                  <span>{file.filename}</span>
                                  <span className="text-gray-400">
                                    ({formatFileSize(file.size)})
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Reopen Button (only if ticket is closed) */}
            {ticket.status === 5 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
                <div className="flex items-start">
                  <ExclamationCircleIcon className="h-6 w-6 text-yellow-600 mr-3 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                      Query is Closed
                    </h3>
                    <p className="text-sm text-yellow-700 mb-4">
                      This query has been closed. If you need further
                      assistance, you can reopen it.
                    </p>
                    <button
                      onClick={handleReopenTicket}
                      disabled={reopeningTicket}
                      className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {reopeningTicket ? "Reopening..." : "Reopen Query"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Reply Form (only if ticket is not closed) */}
            {/* 5 = Closed */}
            {ticket.status !== 5 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Add Reply
                </h3>
                <form onSubmit={handleReplySubmit} className="space-y-4">
                  <div>
                    <textarea
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      placeholder="Type your message..."
                      rows={4}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  {/* File Upload */}
                  <div>
                    <label className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                      <DocumentArrowUpIcon className="h-6 w-6 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-600">
                        Attach files (optional)
                      </span>
                      <input
                        type="file"
                        multiple
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>

                    {/* Selected Files */}
                    {replyFiles.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {replyFiles.map((file, idx) => (
                          <li
                            key={idx}
                            className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"
                          >
                            <span className="text-sm text-gray-700">
                              {file.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFile(idx)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <XMarkIcon className="h-5 w-5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 px-6 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background:
                        branding?.primaryColor && branding?.secondaryColor
                          ? `linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.secondaryColor} 100%)`
                          : "#3B82F6",
                      color: "#ffffff",
                    }}
                  >
                    {submitting ? "Sending..." : "Send Reply"}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Query Details */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Query Information
              </h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    Category
                  </dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    {typeof ticket.category === "string"
                      ? ticket.category
                      : ticket.category?.name || "N/A"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    {new Date(ticket.createdAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    Last Updated
                  </dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    {new Date(ticket.updatedAt).toLocaleString()}
                  </dd>
                </div>
                {ticket.assignedTo && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">
                      Assigned To
                    </dt>
                    <dd className="text-sm text-gray-900 mt-1">
                      {ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
                      <br />
                      <span className="text-xs text-gray-500">
                        {ticket.assignedTo.email}
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Close Query Button */}
            {/* 5 = Closed */}
            {ticketSettings?.allowStudentToCloseTicket &&
              ticket.status !== 5 && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Actions
                  </h3>
                  <button
                    onClick={handleCloseTicket}
                    disabled={closingTicket}
                    className="w-full py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {closingTicket ? "Closing..." : "Close Query"}
                  </button>
                  <p className="text-xs text-gray-500 mt-2">
                    Once closed, you won't be able to reopen this query.
                  </p>
                </div>
              )}
          </div>
        </div>

        {/* Feedback Form Section */}
        {showFeedbackForm && branding && (
          <div className="mt-8 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-lg p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                📝 Share Your Feedback
              </h2>
              <p className="text-gray-600">
                Your query has been resolved. We'd love to hear about your
                experience!
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Query:{" "}
                <span className="font-semibold">{ticket.ticketNumber}</span>
                {studentIdFromUrl && emailFromUrl && (
                  <span className="ml-2">
                    • Student:{" "}
                    <span className="font-semibold">{emailFromUrl}</span>
                  </span>
                )}
              </p>
            </div>

            <div className="bg-white rounded-lg p-6 shadow-sm">
              <FeedbackSubmission
                ticketId={ticketId!}
                projectId={branding.projectId}
                studentId={studentIdFromUrl || undefined}
                isPublic={!!studentIdFromUrl}
                onSuccess={() => {
                  alert("Thank you for your feedback!");
                  navigate(`/${customUrlPath}/student/my-tickets`);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentTicketDetail;
