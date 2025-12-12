import React, { useState } from 'react';
import axios from 'axios';
import API_BASE_URL from '../../config/api';
import { 
  ChatBubbleLeftIcon, 
  PencilIcon, 
  TrashIcon,
  CheckIcon,
  XMarkIcon 
} from '@heroicons/react/24/outline';

interface Comment {
  _id: string;
  text: string;
  createdBy: {
    _id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt?: string;
  isEdited: boolean;
}

interface TicketCommentSectionProps {
  ticketId: string;
  comments: Comment[];
  currentUserId: string;
  canAdd: boolean; // TICKET_ADD_COMMENT permission
  canEdit: boolean; // TICKET_EDIT_COMMENT permission
  canDelete: boolean; // TICKET_DELETE_COMMENT permission
  onCommentsChange: (comments: Comment[]) => void;
}

export const TicketCommentSection: React.FC<TicketCommentSectionProps> = ({
  ticketId,
  comments,
  currentUserId,
  canAdd,
  canEdit,
  canDelete,
  onCommentsChange,
}) => {
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAddComment = async () => {
    if (!newComment.trim()) {
      setError('Comment cannot be empty');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.post(
        `${API_BASE_URL}/tickets/${ticketId}/comments`,
        { text: newComment },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        onCommentsChange([...comments, response.data.data]);
        setNewComment('');
      }
    } catch (err: any) {
      console.error('Error adding comment:', err);
      setError(err.response?.data?.error || 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editingText.trim()) {
      setError('Comment cannot be empty');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.put(
        `${API_BASE_URL}/tickets/${ticketId}/comments/${commentId}`,
        { text: editingText },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success) {
        const updatedComments = comments.map(c =>
          c._id === commentId ? response.data.data : c
        );
        onCommentsChange(updatedComments);
        setEditingCommentId(null);
        setEditingText('');
      }
    } catch (err: any) {
      console.error('Error editing comment:', err);
      setError(err.response?.data?.error || 'Failed to edit comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.delete(
        `${API_BASE_URL}/tickets/${ticketId}/comments/${commentId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.data.success) {
        onCommentsChange(comments.filter(c => c._id !== commentId));
      }
    } catch (err: any) {
      console.error('Error deleting comment:', err);
      setError(err.response?.data?.error || 'Failed to delete comment');
    }
  };

  const startEditing = (comment: Comment) => {
    setEditingCommentId(comment._id);
    setEditingText(comment.text);
    setError('');
  };

  const cancelEditing = () => {
    setEditingCommentId(null);
    setEditingText('');
    setError('');
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 24) {
      if (diffInHours < 1) {
        const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
        return diffInMinutes < 1 ? 'Just now' : `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
      }
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    }
    
    return date.toLocaleString();
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center mb-4">
        <ChatBubbleLeftIcon className="h-5 w-5 mr-2" />
        Comments ({comments.length})
      </h3>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Add Comment */}
      {canAdd && (
        <div className="mb-6">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            disabled={submitting}
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={handleAddComment}
              disabled={submitting || !newComment.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Adding...' : 'Add Comment'}
            </button>
          </div>
        </div>
      )}

      {/* Comments List */}
      {comments.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          No comments yet. {canAdd && 'Be the first to comment!'}
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => {
            const isOwner = comment.createdBy._id === currentUserId;
            const canEditThis = canEdit && isOwner;
            const canDeleteThis = canDelete && isOwner;
            const isEditing = editingCommentId === comment._id;

            return (
              <div
                key={comment._id}
                className="border-l-4 border-blue-500 pl-4 py-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-medium text-gray-900">
                        {comment.createdBy.name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatDate(comment.createdAt)}
                        {comment.isEdited && ' (edited)'}
                      </span>
                    </div>

                    {isEditing ? (
                      <div>
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                          disabled={submitting}
                        />
                        <div className="mt-2 flex space-x-2">
                          <button
                            onClick={() => handleEditComment(comment._id)}
                            disabled={submitting || !editingText.trim()}
                            className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
                          >
                            <CheckIcon className="h-4 w-4 mr-1" />
                            Save
                          </button>
                          <button
                            onClick={cancelEditing}
                            disabled={submitting}
                            className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 flex items-center"
                          >
                            <XMarkIcon className="h-4 w-4 mr-1" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-700 whitespace-pre-wrap">
                        {comment.text}
                      </p>
                    )}
                  </div>

                  {!isEditing && (canEditThis || canDeleteThis) && (
                    <div className="flex items-center space-x-2 ml-4">
                      {canEditThis && (
                        <button
                          onClick={() => startEditing(comment)}
                          className="p-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title="Edit"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      )}
                      {canDeleteThis && (
                        <button
                          onClick={() => handleDeleteComment(comment._id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TicketCommentSection;
