import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_CONFIG } from '../config/constants';
import {
  PlusIcon,
  TrashIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  StarIcon
} from '@heroicons/react/24/outline';

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

interface Props {
  formId: string;
  onClose: () => void;
}

const FeedbackFormBuilder: React.FC<Props> = ({ formId, onClose }) => {
  const [questions, setQuestions] = useState<FeedbackQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState<Partial<FeedbackQuestion>>({
    type: 'text',
    label: '',
    required: false,
    maxRating: 5
  });

  useEffect(() => {
    fetchForm();
  }, [formId]);

  const fetchForm = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/feedback-forms/${formId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        setQuestions(response.data.data.questions || []);
      }
    } catch (error) {
      console.error('Error fetching form:', error);
      alert('Failed to load form');
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuestion = () => {
    if (!newQuestion.label?.trim()) {
      alert('Please enter a question label');
      return;
    }

    const question: FeedbackQuestion = {
      id: Date.now().toString(),
      type: newQuestion.type as any,
      label: newQuestion.label,
      required: newQuestion.required || false,
      options: newQuestion.options || [],
      placeholder: newQuestion.placeholder,
      maxRating: newQuestion.maxRating || 5,
      order: questions.length
    };

    setQuestions([...questions, question]);
    setNewQuestion({
      type: 'text',
      label: '',
      required: false,
      maxRating: 5
    });
    setShowAddQuestion(false);
  };

  const handleRemoveQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newQuestions = [...questions];
    [newQuestions[index - 1], newQuestions[index]] = [newQuestions[index], newQuestions[index - 1]];
    newQuestions.forEach((q, i) => q.order = i);
    setQuestions(newQuestions);
  };

  const handleMoveDown = (index: number) => {
    if (index === questions.length - 1) return;
    const newQuestions = [...questions];
    [newQuestions[index + 1], newQuestions[index]] = [newQuestions[index], newQuestions[index + 1]];
    newQuestions.forEach((q, i) => q.order = i);
    setQuestions(newQuestions);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('authToken');
      const response = await axios.put(
        `${API_CONFIG.API_URL}/feedback-forms/${formId}`,
        { questions },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        alert('Form questions saved successfully');
        onClose();
      }
    } catch (error: any) {
      console.error('Error saving questions:', error);
      alert(error.response?.data?.message || 'Failed to save questions');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-gray-900">Design Feedback Form</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          ×
        </button>
      </div>

      <div className="space-y-4 mb-6">
        {questions.map((question, index) => (
          <div
            key={question.id}
            className="border border-gray-300 rounded-lg p-4 bg-gray-50"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                    {question.type.toUpperCase()}
                  </span>
                  {question.required && (
                    <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">
                      REQUIRED
                    </span>
                  )}
                </div>
                <p className="font-medium text-gray-900">{question.label}</p>
                {question.placeholder && (
                  <p className="text-sm text-gray-500 mt-1">Placeholder: {question.placeholder}</p>
                )}
                {question.options && question.options.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">Options:</p>
                    <ul className="list-disc list-inside text-sm text-gray-600">
                      {question.options.map((opt, i) => (
                        <li key={i}>{opt}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex gap-1">
                <button
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-30"
                >
                  <ArrowUpIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleMoveDown(index)}
                  disabled={index === questions.length - 1}
                  className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-30"
                >
                  <ArrowDownIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleRemoveQuestion(question.id)}
                  className="p-1 text-red-500 hover:text-red-700"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Preview */}
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500 mb-2">Preview:</p>
              {question.type === 'rating' && (
                <div className="flex gap-1">
                  {[...Array(question.maxRating || 5)].map((_, i) => (
                    <StarIcon key={i} className="w-6 h-6 text-yellow-400" />
                  ))}
                </div>
              )}
              {question.type === 'text' && (
                <input
                  type="text"
                  placeholder={question.placeholder}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-white"
                />
              )}
              {question.type === 'textarea' && (
                <textarea
                  placeholder={question.placeholder}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-white"
                  rows={3}
                />
              )}
              {(question.type === 'radio' || question.type === 'checkbox') && (
                <div className="space-y-2">
                  {question.options?.map((opt, i) => (
                    <div key={i} className="flex items-center">
                      <input
                        type={question.type}
                        disabled
                        className="mr-2"
                      />
                      <label className="text-sm text-gray-700">{opt}</label>
                    </div>
                  ))}
                </div>
              )}
              {question.type === 'select' && (
                <select disabled className="w-full px-3 py-2 border border-gray-300 rounded bg-white">
                  <option>Select an option</option>
                  {question.options?.map((opt, i) => (
                    <option key={i}>{opt}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}

        {questions.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No questions added yet. Click "Add Question" to start building your form.
          </div>
        )}
      </div>

      {!showAddQuestion ? (
        <button
          onClick={() => setShowAddQuestion(true)}
          className="w-full flex items-center justify-center px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          Add Question
        </button>
      ) : (
        <div className="border border-blue-500 rounded-lg p-4 bg-blue-50">
          <h4 className="font-medium mb-3">Add New Question</h4>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Question Type
              </label>
              <select
                value={newQuestion.type}
                onChange={(e) => setNewQuestion({ ...newQuestion, type: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="rating">Star Rating</option>
                <option value="text">Short Text</option>
                <option value="textarea">Long Text</option>
                <option value="radio">Multiple Choice (Single)</option>
                <option value="checkbox">Multiple Choice (Multiple)</option>
                <option value="select">Dropdown</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Question Label *
              </label>
              <input
                type="text"
                value={newQuestion.label}
                onChange={(e) => setNewQuestion({ ...newQuestion, label: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Enter your question"
              />
            </div>

            {(newQuestion.type === 'text' || newQuestion.type === 'textarea') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Placeholder (Optional)
                </label>
                <input
                  type="text"
                  value={newQuestion.placeholder || ''}
                  onChange={(e) => setNewQuestion({ ...newQuestion, placeholder: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            )}

            {newQuestion.type === 'rating' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Rating
                </label>
                <input
                  type="number"
                  min="3"
                  max="10"
                  value={newQuestion.maxRating}
                  onChange={(e) => setNewQuestion({ ...newQuestion, maxRating: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            )}

            {(newQuestion.type === 'radio' || newQuestion.type === 'checkbox' || newQuestion.type === 'select') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Options (one per line)
                </label>
                <textarea
                  value={newQuestion.options?.join('\n') || ''}
                  onChange={(e) => setNewQuestion({ 
                    ...newQuestion, 
                    options: e.target.value.split('\n').filter(o => o.trim())
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows={4}
                  placeholder="Option 1&#10;Option 2&#10;Option 3"
                />
              </div>
            )}

            <div className="flex items-center">
              <input
                type="checkbox"
                checked={newQuestion.required}
                onChange={(e) => setNewQuestion({ ...newQuestion, required: e.target.checked })}
                className="h-4 w-4 text-blue-600 rounded"
              />
              <label className="ml-2 text-sm text-gray-700">
                Required field
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowAddQuestion(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddQuestion}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add Question
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 mt-6 pt-6 border-t">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Form'}
        </button>
      </div>
    </div>
  );
};

export default FeedbackFormBuilder;
