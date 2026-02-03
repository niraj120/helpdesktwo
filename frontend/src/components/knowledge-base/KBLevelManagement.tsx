import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Edit2, Trash2, Eye, EyeOff, Move } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { API_CONFIG } from '../../config/constants';

interface KBLevel {
  _id: string;
  levelName: string;
  levelOrder: number;
  levelIcon?: string;
  status: 'active' | 'inactive';
  description?: string;
  articleCount?: number;
  createdBy?: { name: string };
}

interface KBLevelManagementProps {
  projectId: string;
}

const KBLevelManagement: React.FC<KBLevelManagementProps> = ({ projectId }) => {
  const [levels, setLevels] = useState<KBLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLevel, setEditingLevel] = useState<KBLevel | null>(null);
  const [formData, setFormData] = useState({
    levelName: '',
    levelIcon: '',
    description: '',
    status: 'active' as 'active' | 'inactive',
  });

  useEffect(() => {
    fetchLevels();
  }, [projectId]);

  const fetchLevels = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_CONFIG.API_URL}/kb/levels`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { projectId },
        }
      );
      setLevels(response.data.data || []);
    } catch (error: any) {
      console.error('Failed to fetch KB levels:', error);
      alert(error.response?.data?.message || 'Failed to fetch levels');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate level name
    if (!formData.levelName.trim()) {
      alert('Level name is required');
      return;
    }
    
    try {
      const token = localStorage.getItem('authToken');
      
      // Calculate levelOrder for new levels
      let levelOrder = editingLevel ? editingLevel.levelOrder : levels.length + 1;
      
      const payload = {
        levelName: formData.levelName.trim(),
        levelIcon: formData.levelIcon.trim(),
        description: formData.description.trim(),
        status: formData.status,
        levelOrder,
        projectIds: [projectId],
      };

      console.log('Submitting KB Level:', payload);

      if (editingLevel) {
        // Update existing level
        await axios.put(
          `${API_CONFIG.API_URL}/kb/levels/${editingLevel._id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        // Create new level
        const response = await axios.post(
          `${API_CONFIG.API_URL}/kb/levels`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log('Create response:', response.data);
      }

      setShowModal(false);
      resetForm();
      fetchLevels();
    } catch (error: any) {
      console.error('Failed to save level:', error);
      console.error('Error response:', error.response?.data);
      alert(error.response?.data?.message || error.message || 'Failed to save level');
    }
  };

  const handleDelete = async (levelId: string) => {
    if (!window.confirm('Are you sure you want to delete this level? This will unmap all articles.')) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      await axios.delete(
        `${API_CONFIG.API_URL}/kb/levels/${levelId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchLevels();
    } catch (error: any) {
      console.error('Failed to delete level:', error);
      alert(error.response?.data?.message || 'Failed to delete level');
    }
  };

  const handleToggleStatus = async (level: KBLevel) => {
    try {
      const token = localStorage.getItem('authToken');
      await axios.put(
        `${API_CONFIG.API_URL}/kb/levels/${level._id}`,
        { status: level.status === 'active' ? 'inactive' : 'active' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchLevels();
    } catch (error: any) {
      console.error('Failed to toggle status:', error);
      alert(error.response?.data?.message || 'Failed to update status');
    }
  };

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;

    const reorderedLevels = Array.from(levels);
    const [moved] = reorderedLevels.splice(result.source.index, 1);
    reorderedLevels.splice(result.destination.index, 0, moved);

    // Update local state immediately
    setLevels(reorderedLevels);

    // Send reorder request
    try {
      const token = localStorage.getItem('authToken');
      const updates = reorderedLevels.map((level, index) => ({
        levelId: level._id,
        levelOrder: index + 1,
      }));

      await axios.put(
        `${API_CONFIG.API_URL}/kb/levels/reorder/batch`,
        { levels: updates },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error: any) {
      console.error('Failed to reorder levels:', error);
      alert(error.response?.data?.message || 'Failed to reorder levels');
      fetchLevels(); // Revert on error
    }
  };

  const openEditModal = (level: KBLevel) => {
    setEditingLevel(level);
    setFormData({
      levelName: level.levelName,
      levelIcon: level.levelIcon || '',
      description: level.description || '',
      status: level.status,
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingLevel(null);
    setFormData({
      levelName: '',
      levelIcon: '',
      description: '',
      status: 'active',
    });
  };

  if (loading) {
    return <div className="text-center py-8">Loading levels...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Knowledge Base Levels</h2>
          <p className="text-gray-600 mt-1">Manage categories for your knowledge base</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Add Level
        </button>
      </div>

      <div className="bg-white rounded-lg shadow">
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="levels">
            {(provided: any) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="divide-y"
              >
                {levels.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No levels found. Create your first level to get started.
                  </div>
                ) : (
                  levels.map((level, index) => (
                    <Draggable
                      key={level._id}
                      draggableId={level._id}
                      index={index}
                    >
                      {(provided: any, snapshot: any) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`p-4 flex items-center justify-between ${
                            snapshot.isDragging ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-4 flex-1">
                            <div {...provided.dragHandleProps}>
                              <Move className="text-gray-400 cursor-move" size={20} />
                            </div>
                            {level.levelIcon && (
                              <span className="text-2xl">{level.levelIcon}</span>
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{level.levelName}</h3>
                                <span
                                  className={`px-2 py-1 text-xs rounded-full ${
                                    level.status === 'active'
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-gray-100 text-gray-800'
                                  }`}
                                >
                                  {level.status}
                                </span>
                              </div>
                              {level.description && (
                                <p className="text-sm text-gray-600 mt-1">
                                  {level.description}
                                </p>
                              )}
                              <p className="text-xs text-gray-500 mt-1">
                                {level.articleCount || 0} article(s) • Order: {level.levelOrder}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleStatus(level)}
                              className="p-2 hover:bg-gray-200 rounded"
                              title={level.status === 'active' ? 'Deactivate' : 'Activate'}
                            >
                              {level.status === 'active' ? (
                                <Eye size={18} className="text-green-600" />
                              ) : (
                                <EyeOff size={18} className="text-gray-400" />
                              )}
                            </button>
                            <button
                              onClick={() => openEditModal(level)}
                              className="p-2 hover:bg-gray-200 rounded"
                              title="Edit"
                            >
                              <Edit2 size={18} className="text-blue-600" />
                            </button>
                            <button
                              onClick={() => handleDelete(level._id)}
                              className="p-2 hover:bg-gray-200 rounded"
                              title="Delete"
                            >
                              <Trash2 size={18} className="text-red-600" />
                            </button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))
                )}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">
              {editingLevel ? 'Edit Level' : 'Create New Level'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Level Name *</label>
                <input
                  type="text"
                  value={formData.levelName}
                  onChange={(e) =>
                    setFormData({ ...formData, levelName: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                  required
                  maxLength={100}
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">
                  Icon (Emoji)
                </label>
                <input
                  type="text"
                  value={formData.levelIcon}
                  onChange={(e) =>
                    setFormData({ ...formData, levelIcon: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                  placeholder="📚"
                  maxLength={10}
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as 'active' | 'inactive',
                    })
                  }
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 border rounded hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {editingLevel ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default KBLevelManagement;
