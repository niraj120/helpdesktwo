import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_CONFIG } from '../config/constants';
import DashboardLayout from './DashboardLayout';
import { StarIcon } from '@heroicons/react/24/solid';
import { ChartBarIcon, FunnelIcon } from '@heroicons/react/24/outline';

interface FeedbackAnswer {
  questionId: string;
  questionLabel: string;
  questionType: string;
  answer: any;
}

interface FeedbackResponse {
  _id: string;
  ticketId: {
    _id: string;
    ticketNumber: string;
    subject: string;
  };
  formId: {
    _id: string;
    name: string;
  };
  studentId: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  answers: FeedbackAnswer[];
  overallRating?: number;
  submittedAt: string;
}

interface Stats {
  totalResponses: number;
  averageRating: number;
  ratingCounts: Record<number, number>;
}

const FeedbackResponses: React.FC = () => {
  const projectContext = JSON.parse(localStorage.getItem('projectContext') || '{}');
  const [responses, setResponses] = useState<FeedbackResponse[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedResponse, setSelectedResponse] = useState<FeedbackResponse | null>(null);
  const [filters, setFilters] = useState({
    minRating: '',
    maxRating: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    if (projectContext?.projectId) {
      fetchResponses();
      fetchStats();
    } else {
      setLoading(false);
    }
  }, [projectContext?.projectId, filters]);

  const fetchResponses = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const queryParams = new URLSearchParams();
      
      if (filters.minRating) queryParams.append('minRating', filters.minRating);
      if (filters.maxRating) queryParams.append('maxRating', filters.maxRating);
      if (filters.startDate) queryParams.append('startDate', filters.startDate);
      if (filters.endDate) queryParams.append('endDate', filters.endDate);

      const response = await axios.get(
        `${API_CONFIG.API_URL}/feedback-responses/project/${projectContext?.projectId}?${queryParams}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        setResponses(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching feedback responses:', error);
      alert('Failed to fetch feedback responses');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/feedback-responses/project/${projectContext?.projectId}/stats`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const renderAnswerValue = (answer: FeedbackAnswer) => {
    if (answer.questionType === 'rating') {
      return (
        <div className="flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <StarIcon
              key={i}
              className={`w-5 h-5 ${i < answer.answer ? 'text-yellow-400' : 'text-gray-300'}`}
            />
          ))}
          <span className="ml-2 text-sm text-gray-600">({answer.answer}/5)</span>
        </div>
      );
    }

    if (answer.questionType === 'checkbox' && Array.isArray(answer.answer)) {
      return (
        <ul className="list-disc list-inside text-sm text-gray-700">
          {answer.answer.map((item: string, i: number) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    }

    return <p className="text-sm text-gray-700">{answer.answer}</p>;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!projectContext?.projectId) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">No Project Selected</h3>
            <p className="text-yellow-700">Please select a project from the dropdown to view feedback responses.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Feedback Responses</h2>
        <p className="text-gray-600">View and analyze student feedback</p>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Responses</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalResponses}</p>
              </div>
              <ChartBarIcon className="w-12 h-12 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Average Rating</p>
                <div className="flex items-center gap-2">
                  <p className="text-3xl font-bold text-gray-900">
                    {stats.averageRating?.toFixed(1) || '0.0'}
                  </p>
                  <StarIcon className="w-6 h-6 text-yellow-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-2">Rating Distribution</p>
            <div className="space-y-1">
              {[5, 4, 3, 2, 1].map((rating) => (
                <div key={rating} className="flex items-center gap-2">
                  <span className="text-sm font-medium w-4">{rating}</span>
                  <StarIcon className="w-4 h-4 text-yellow-400" />
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-yellow-400 h-2 rounded-full"
                      style={{
                        width: `${
                          stats.totalResponses
                            ? ((stats.ratingCounts[rating] || 0) / stats.totalResponses) * 100
                            : 0
                        }%`
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-600 w-8 text-right">
                    {stats.ratingCounts[rating] || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <FunnelIcon className="w-5 h-5 text-gray-500" />
          <h3 className="font-medium text-gray-900">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min Rating
            </label>
            <select
              value={filters.minRating}
              onChange={(e) => setFilters({ ...filters, minRating: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Any</option>
              {[1, 2, 3, 4, 5].map((r) => (
                <option key={r} value={r}>
                  {r} Stars
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Rating
            </label>
            <select
              value={filters.maxRating}
              onChange={(e) => setFilters({ ...filters, maxRating: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Any</option>
              {[1, 2, 3, 4, 5].map((r) => (
                <option key={r} value={r}>
                  {r} Stars
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Responses List */}
      {responses.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-600">No feedback responses found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {responses.map((response) => (
            <div
              key={response._id}
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedResponse(response)}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">
                      Ticket #{response.ticketId.ticketNumber}
                    </h3>
                    {response.overallRating && (
                      <div className="flex items-center gap-1">
                        <StarIcon className="w-5 h-5 text-yellow-400" />
                        <span className="text-sm font-medium">{response.overallRating}/5</span>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{response.ticketId.subject}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    by {response.studentId.firstName} {response.studentId.lastName} •{' '}
                    {new Date(response.submittedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="space-y-3 pl-4 border-l-2 border-gray-200">
                {response.answers.slice(0, 2).map((answer, index) => (
                  <div key={index}>
                    <p className="text-sm font-medium text-gray-700 mb-1">
                      {answer.questionLabel}
                    </p>
                    {renderAnswerValue(answer)}
                  </div>
                ))}
                {response.answers.length > 2 && (
                  <p className="text-sm text-blue-600">
                    +{response.answers.length - 2} more answers
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedResponse && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedResponse(null)}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">
                    Feedback Details
                  </h3>
                  <p className="text-sm text-gray-600">
                    Ticket #{selectedResponse.ticketId.ticketNumber} •{' '}
                    {selectedResponse.ticketId.subject}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Submitted by {selectedResponse.studentId.firstName}{' '}
                    {selectedResponse.studentId.lastName} on{' '}
                    {new Date(selectedResponse.submittedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedResponse(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                {selectedResponse.answers.map((answer, index) => (
                  <div key={index} className="border-b border-gray-200 pb-4 last:border-0">
                    <p className="font-medium text-gray-900 mb-2">{answer.questionLabel}</p>
                    {renderAnswerValue(answer)}
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t">
                <button
                  onClick={() => setSelectedResponse(null)}
                  className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </DashboardLayout>
  );
};

export default FeedbackResponses;
