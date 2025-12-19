import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_CONFIG } from '../config/constants';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  FolderIcon,
  DocumentTextIcon,
  ChevronRightIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';

interface KBCategory {
  _id: string;
  name: string;
  description?: string;
  icon?: string;
  displayOrder: number;
  isActive: boolean;
}

interface KBSubcategory {
  _id: string;
  categoryId: string;
  name: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
}

const KBHierarchyManagement: React.FC = () => {
  const [categories, setCategories] = useState<KBCategory[]>([]);
  const [subcategories, setSubcategories] = useState<{ [key: string]: KBSubcategory[] }>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<KBCategory | null>(null);
  const [editingSubcategory, setEditingSubcategory] = useState<KBSubcategory | null>(null);
  const [selectedCategoryForSub, setSelectedCategoryForSub] = useState<string>('');

  // Form states
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    icon: '',
    displayOrder: 0
  });

  const [subcategoryForm, setSubcategoryForm] = useState({
    categoryId: '',
    name: '',
    description: '',
    displayOrder: 0
  });

  const projectContext = JSON.parse(localStorage.getItem('projectContext') || '{}');
  const token = localStorage.getItem('authToken');

  useEffect(() => {
    if (projectContext.projectId) {
      fetchCategories();
    }
  }, [projectContext.projectId]);

  const fetchCategories = async () => {
    if (!projectContext.projectId || !token) {
      console.warn('Missing projectId or token');
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(
        `${API_CONFIG.API_URL}/knowledge-base/categories/project/${projectContext.projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setCategories(response.data.data || []);
    } catch (error: any) {
      console.error('Error fetching categories:', error);
      const message = error.response?.data?.message || 'Failed to load categories';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubcategories = async (categoryId: string) => {
    if (!categoryId || !token) return;

    try {
      const response = await axios.get(
        `${API_CONFIG.API_URL}/knowledge-base/subcategories/category/${categoryId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setSubcategories(prev => ({
        ...prev,
        [categoryId]: response.data.data || []
      }));
    } catch (error: any) {
      console.error('Error fetching subcategories:', error);
      const message = error.response?.data?.message || 'Failed to load subcategories';
      alert(message);
    }
  };

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
      if (!subcategories[categoryId]) {
        fetchSubcategories(categoryId);
      }
    }
    setExpandedCategories(newExpanded);
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(
        `${API_CONFIG.API_URL}/knowledge-base/categories`,
        {
          projectId: projectContext.projectId,
          ...categoryForm
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setShowCategoryModal(false);
      setCategoryForm({ name: '', description: '', icon: '', displayOrder: 0 });
      fetchCategories();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to create category');
    }
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;

    try {
      await axios.put(
        `${API_CONFIG.API_URL}/knowledge-base/categories/${editingCategory._id}`,
        categoryForm,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setShowCategoryModal(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '', icon: '', displayOrder: 0 });
      fetchCategories();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to update category');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      await axios.delete(
        `${API_CONFIG.API_URL}/knowledge-base/categories/${categoryId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      fetchCategories();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete category');
    }
  };

  const handleCreateSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(
        `${API_CONFIG.API_URL}/knowledge-base/subcategories`,
        {
          projectId: projectContext.projectId,
          ...subcategoryForm
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setShowSubcategoryModal(false);
      setSubcategoryForm({ categoryId: '', name: '', description: '', displayOrder: 0 });
      if (subcategoryForm.categoryId) {
        fetchSubcategories(subcategoryForm.categoryId);
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to create subcategory');
    }
  };

  const handleUpdateSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubcategory) return;

    try {
      await axios.put(
        `${API_CONFIG.API_URL}/knowledge-base/subcategories/${editingSubcategory._id}`,
        {
          name: subcategoryForm.name,
          description: subcategoryForm.description,
          displayOrder: subcategoryForm.displayOrder
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setShowSubcategoryModal(false);
      setEditingSubcategory(null);
      setSubcategoryForm({ categoryId: '', name: '', description: '', displayOrder: 0 });
      fetchSubcategories(editingSubcategory.categoryId);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to update subcategory');
    }
  };

  const handleDeleteSubcategory = async (subcategoryId: string, categoryId: string) => {
    if (!confirm('Are you sure you want to delete this subcategory?')) return;

    try {
      await axios.delete(
        `${API_CONFIG.API_URL}/knowledge-base/subcategories/${subcategoryId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      fetchSubcategories(categoryId);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete subcategory');
    }
  };

  const openCategoryModal = (category?: KBCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        description: category.description || '',
        icon: category.icon || '',
        displayOrder: category.displayOrder
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '', icon: '', displayOrder: 0 });
    }
    setShowCategoryModal(true);
  };

  const openSubcategoryModal = (categoryId: string, subcategory?: KBSubcategory) => {
    if (subcategory) {
      setEditingSubcategory(subcategory);
      setSubcategoryForm({
        categoryId: subcategory.categoryId,
        name: subcategory.name,
        description: subcategory.description || '',
        displayOrder: subcategory.displayOrder
      });
    } else {
      setEditingSubcategory(null);
      setSubcategoryForm({
        categoryId,
        name: '',
        description: '',
        displayOrder: 0
      });
    }
    setShowSubcategoryModal(true);
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Knowledge Base Hierarchy</h2>
        <button
          onClick={() => openCategoryModal()}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Add Category (1st Level)
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No categories found. Create your first category to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map((category) => (
            <div key={category._id} className="border border-gray-200 rounded-lg">
              {/* Category Header */}
              <div className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100">
                <div className="flex items-center flex-1">
                  <button
                    onClick={() => toggleCategory(category._id)}
                    className="mr-2"
                  >
                    {expandedCategories.has(category._id) ? (
                      <ChevronDownIcon className="h-5 w-5 text-gray-600" />
                    ) : (
                      <ChevronRightIcon className="h-5 w-5 text-gray-600" />
                    )}
                  </button>
                  <FolderIcon className="h-6 w-6 text-blue-600 mr-3" />
                  <div>
                    <h3 className="font-semibold text-gray-800">{category.name}</h3>
                    {category.description && (
                      <p className="text-sm text-gray-600">{category.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => openSubcategoryModal(category._id)}
                    className="p-2 text-green-600 hover:bg-green-50 rounded"
                    title="Add Subcategory"
                  >
                    <PlusIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => openCategoryModal(category)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(category._id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Subcategories */}
              {expandedCategories.has(category._id) && (
                <div className="pl-12 pr-4 pb-4 pt-2 space-y-2">
                  {subcategories[category._id]?.map((subcategory) => (
                    <div
                      key={subcategory._id}
                      className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center">
                        <DocumentTextIcon className="h-5 w-5 text-gray-600 mr-3" />
                        <div>
                          <h4 className="font-medium text-gray-800">{subcategory.name}</h4>
                          {subcategory.description && (
                            <p className="text-sm text-gray-600">{subcategory.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => openSubcategoryModal(category._id, subcategory)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSubcategory(subcategory._id, category._id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!subcategories[category._id] || subcategories[category._id].length === 0) && (
                    <p className="text-sm text-gray-500 italic">
                      No subcategories. Click + to add one.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">
              {editingCategory ? 'Edit Category' : 'Create Category'}
            </h3>
            <form onSubmit={editingCategory ? handleUpdateCategory : handleCreateCategory}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category Name *
                  </label>
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={categoryForm.displayOrder}
                    onChange={(e) => setCategoryForm({ ...categoryForm, displayOrder: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowCategoryModal(false);
                    setEditingCategory(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingCategory ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subcategory Modal */}
      {showSubcategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">
              {editingSubcategory ? 'Edit Subcategory' : 'Create Subcategory'}
            </h3>
            <form onSubmit={editingSubcategory ? handleUpdateSubcategory : handleCreateSubcategory}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subcategory Name *
                  </label>
                  <input
                    type="text"
                    value={subcategoryForm.name}
                    onChange={(e) => setSubcategoryForm({ ...subcategoryForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={subcategoryForm.description}
                    onChange={(e) => setSubcategoryForm({ ...subcategoryForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={subcategoryForm.displayOrder}
                    onChange={(e) => setSubcategoryForm({ ...subcategoryForm, displayOrder: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowSubcategoryModal(false);
                    setEditingSubcategory(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingSubcategory ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default KBHierarchyManagement;
