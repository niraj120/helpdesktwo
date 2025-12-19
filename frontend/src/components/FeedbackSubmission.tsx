import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_CONFIG } from '../config/constants';
import { StarIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline';

interface FeedbackQuestion {
  id: string;
  type: 'rating' | 'text' | 'textarea' | 'radio' | 'checkbox' | 'select';
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  maxRating?: number;
  order: number;
}

interface FeedbackForm {
  _id: string;
  name: string;
  description?: string;
  questions: FeedbackQuestion[];
}

interface Props {
  ticketId: string;
  projectId: string;
  studentId?: string;
  isPublic?: boolean;
  onSuccess?: () => void;
}

const FeedbackSubmission: React.FC<Props> = ({ ticketId, projectId, studentId, isPublic = false, onSuccess }) => {
  const [form, setForm] = useState<FeedbackForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [hoveredRating, setHoveredRating] = useState<Record<string, number>>({});

  useEffect(() => {
    checkSubmissionStatus();
  }, [ticketId]);

  const checkSubmissionStatus = async () => {
    try {
      const token = localStorage.getItem('studentToken') || localStorage.getItem('token');
      
      // Check if already submitted
      const checkResponse = await axios.get(
        `${API_CONFIG.API_URL}/feedback-responses/ticket/${ticketId}/check`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (checkResponse.data.data?.hasSubmitted) {
        setSubmitted(true);
        setLoading(false);
        return;
      }

      // Get active feedback form
      const formResponse = await axios.get(
        `${API_CONFIG.API_URL}/feedback-forms/project/${projectId}/active`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (formResponse.data.success) {
        setForm(formResponse.data.data);
      }
    } catch (error: any) {
      console.error('Error loading feedback form:', error);
      if (error.response?.status !== 404) {
        alert('Failed to load feedback form');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form) return;

    // Validate required fields
    const missingRequired = form.questions
      .filter(q => q.required && !answers[q.id])
      .map(q => q.label);

    if (missingRequired.length > 0) {
      alert(`Please answer the following required questions:\n- ${missingRequired.join('\n- ')}`);
      return;
    }

    try {
      setSubmitting(true);
      const token = localStorage.getItem('studentToken') || localStorage.getItem('authToken') || localStorage.getItem('token');

      const formattedAnswers = form.questions.map(q => ({
        questionId: q.id,
        questionLabel: q.label,
        questionType: q.type,
        answer: answers[q.id]
      }));

      const endpoint = isPublic 
        ? `${API_CONFIG.API_URL}/feedback-responses/public`
        : `${API_CONFIG.API_URL}/feedback-responses`;

      const requestBody: any = {
        ticketId,
        formId: form._id,
        answers: formattedAnswers
      };

      // Include studentId for public submissions
      if (isPublic && studentId) {
        requestBody.studentId = studentId;
      }

      const requestConfig: any = {};
      if (!isPublic && token) {
        requestConfig.headers = { Authorization: `Bearer ${token}` };
      }

      const response = await axios.post(endpoint, requestBody, requestConfig);

      if (response.data.success) {
        setSubmitted(true);
        if (onSuccess) onSuccess();
      }
    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      alert(error.response?.data?.message || 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestion = (question: FeedbackQuestion) => {
    switch (question.type) {
      case 'rating':
        const maxRating = question.maxRating || 5;
        const currentRating = answers[question.id] || 0;
        const displayRating = hoveredRating[question.id] || currentRating;

        return (
          <div className="flex gap-2">
            {[...Array(maxRating)].map((_, i) => (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHoveredRating({ ...hoveredRating, [question.id]: i + 1 })}
                onMouseLeave={() => setHoveredRating({ ...hoveredRating, [question.id]: 0 })}
                onClick={() => setAnswers({ ...answers, [question.id]: i + 1 })}
                className="focus:outline-none"
              >
                {i < displayRating ? (
                  <StarIcon className="w-8 h-8 text-yellow-400" />
                ) : (
                  <StarOutlineIcon className="w-8 h-8 text-gray-300" />
                )}
              </button>
            ))}
            {currentRating > 0 && (
              <span className="ml-2 text-lg font-medium text-gray-700">
                {currentRating} / {maxRating}
              </span>
            )}
          </div>
        );

      case 'text':
        return (
          <input
            type="text"
            value={answers[question.id] || ''}
            onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
            placeholder={question.placeholder}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required={question.required}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={answers[question.id] || ''}
            onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
            placeholder={question.placeholder}
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required={question.required}
          />
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {question.options?.map((option, i) => (
              <div key={i} className="flex items-center">
                <input
                  type="radio"
                  id={`${question.id}-${i}`}
                  name={question.id}
                  value={option}
                  checked={answers[question.id] === option}
                  onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  required={question.required}
                />
                <label htmlFor={`${question.id}-${i}`} className="ml-2 text-gray-700">
                  {option}
                </label>
              </div>
            ))}
          </div>
        );

      case 'checkbox':
        const selectedOptions = answers[question.id] || [];
        return (
          <div className="space-y-2">
            {question.options?.map((option, i) => (
              <div key={i} className="flex items-center">
                <input
                  type="checkbox"
                  id={`${question.id}-${i}`}
                  value={option}
                  checked={selectedOptions.includes(option)}
                  onChange={(e) => {
                    const newSelected = e.target.checked
                      ? [...selectedOptions, option]
                      : selectedOptions.filter((o: string) => o !== option);
                    setAnswers({ ...answers, [question.id]: newSelected });
                  }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 rounded"
                />
                <label htmlFor={`${question.id}-${i}`} className="ml-2 text-gray-700">
                  {option}
                </label>
              </div>
            ))}
          </div>
        );

      case 'select':
        return (
          <select
            value={answers[question.id] || ''}
            onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required={question.required}
          >
            <option value="">Select an option</option>
            {question.options?.map((option, i) => (
              <option key={i} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <div className="text-green-600 mb-2">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-green-900 mb-1">
          Thank you for your feedback!
        </h3>
        <p className="text-green-700">
          Your feedback has been submitted successfully.
        </p>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-gray-600">
        No feedback form is currently available for this ticket.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">{form.name}</h3>
        {form.description && (
          <p className="text-gray-600">{form.description}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {form.questions
          .sort((a, b) => a.order - b.order)
          .map((question) => (
            <div key={question.id} className="space-y-2">
              <label className="block text-sm font-medium text-gray-900">
                {question.label}
                {question.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {renderQuestion(question)}
            </div>
          ))}

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FeedbackSubmission;
