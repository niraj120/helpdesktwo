import React, { useState, useEffect } from "react";
import axios from "axios";
import API_BASE_URL from "../../config/api";
import { Modal } from "../shared/Modal";
import { ArrowsPointingInIcon } from "@heroicons/react/24/outline";

interface CandidateTicket {
  _id: string;
  ticketNumber: string;
  subject: string;
  status: number;
  priority: string;
  createdAt: string;
}

interface PrimaryTicket {
  _id: string;
  ticketNumber: string;
  title?: string;
  subject?: string;
  status: number | string;
  priority?: string;
}

interface TicketMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  primaryTicket: PrimaryTicket;
  onMergeComplete: () => void;
}

const STATUS_LABELS: Record<number, string> = {
  1: "Open",
  2: "In Progress",
  3: "On Hold",
  4: "Resolved",
  5: "Closed",
};

const PRIORITY_WEIGHT: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function getStatusLabel(status: number | string): string {
  if (typeof status === "number")
    return STATUS_LABELS[status] ?? String(status);
  // Numeric string
  const n = Number(status);
  if (!isNaN(n)) return STATUS_LABELS[n] ?? status;
  return String(status);
}

function highestPriority(priorities: (string | undefined)[]): string {
  return priorities
    .filter(Boolean)
    .map((p) => p!.toUpperCase())
    .reduce((best, cur) => {
      return (PRIORITY_WEIGHT[cur] ?? 0) > (PRIORITY_WEIGHT[best] ?? 0)
        ? cur
        : best;
    }, "LOW");
}

export const TicketMergeModal: React.FC<TicketMergeModalProps> = ({
  isOpen,
  onClose,
  primaryTicket,
  onMergeComplete,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [candidates, setCandidates] = useState<CandidateTicket[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setSelectedIds([]);
      setError("");
      fetchCandidates("");
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => fetchCandidates(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchCandidates = async (search: string) => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("authToken");
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      const response = await axios.get(
        `${API_BASE_URL}/tickets/${primaryTicket._id}/merge-candidates`,
        { headers: { Authorization: `Bearer ${token}` }, params },
      );
      setCandidates(response.data.data ?? []);
    } catch (err: any) {
      console.error("Merge candidates error:", err);
      setError(
        err.response?.data?.message ?? "Failed to load candidate tickets",
      );
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // Preview: what priority will the merged ticket have?
  const selectedCandidates = candidates.filter((c) =>
    selectedIds.includes(c._id),
  );
  const mergedPriority = highestPriority([
    primaryTicket.priority,
    ...selectedCandidates.map((c) => c.priority),
  ]);
  const priorityUpgraded =
    mergedPriority.toUpperCase() !==
    (primaryTicket.priority ?? "").toUpperCase();

  const handleMerge = async () => {
    if (selectedIds.length === 0) {
      setError("Select at least one ticket to merge.");
      return;
    }
    setMerging(true);
    setError("");
    try {
      const token = localStorage.getItem("authToken");
      await axios.post(
        `${API_BASE_URL}/tickets/${primaryTicket._id}/merge`,
        { ticketIds: selectedIds },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      onMergeComplete();
      onClose();
    } catch (err: any) {
      console.error("Merge error:", err);
      setError(err.response?.data?.message ?? "Failed to merge tickets");
    } finally {
      setMerging(false);
    }
  };

  const primaryTitle = primaryTicket.subject ?? primaryTicket.title ?? "";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Merge Tickets"
      size="lg"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={merging}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={merging || selectedIds.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <ArrowsPointingInIcon className="h-5 w-5" />
            {merging
              ? "Merging…"
              : `Merge ${selectedIds.length} Ticket${selectedIds.length !== 1 ? "s" : ""}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Primary Ticket Card */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
            Primary ticket — secondaries will be merged into this
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-blue-900">
                {primaryTicket.ticketNumber}
              </p>
              {primaryTitle && (
                <p className="text-sm text-blue-700 mt-0.5 line-clamp-1">
                  {primaryTitle}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                {getStatusLabel(primaryTicket.status)}
              </span>
              {primaryTicket.priority && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                  {primaryTicket.priority}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search tickets from the same student
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ticket number or subject…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        {/* Candidate List */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select tickets to merge ({selectedIds.length} selected)
          </label>
          <div className="border border-gray-300 rounded-lg max-h-64 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                Loading…
              </div>
            ) : candidates.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                No mergeable tickets found from the same student.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {candidates.map((c) => (
                  <label
                    key={c._id}
                    className="flex items-start p-3 hover:bg-gray-50 cursor-pointer gap-3"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(c._id)}
                      onChange={() => toggle(c._id)}
                      className="mt-0.5 h-4 w-4 text-blue-600 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-gray-900 text-sm">
                          {c.ticketNumber}
                        </p>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">
                            {getStatusLabel(c.status)}
                          </span>
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">
                            {c.priority}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5 line-clamp-1">
                        {c.subject}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Preview section */}
        {selectedIds.length > 0 && (
          <div className="space-y-2">
            {priorityUpgraded && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800 flex items-center gap-2">
                <span>⚠️</span>
                <span>
                  Priority will be upgraded to <strong>{mergedPriority}</strong>{" "}
                  (highest among merged tickets).
                </span>
              </div>
            )}
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              <p className="font-semibold mb-1">What will happen:</p>
              <ul className="list-disc ml-4 space-y-0.5 text-yellow-700">
                <li>
                  All comments, attachments &amp; email threads are moved to{" "}
                  <strong>{primaryTicket.ticketNumber}</strong>
                </li>
                <li>Merged tickets will be closed and hidden from listings</li>
                <li>Affected students will be notified</li>
                <li className="font-semibold">This action cannot be undone</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TicketMergeModal;
