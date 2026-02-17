import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import API_URL from '../config/api';
import { HierarchyConfig, HierarchyLevel, CategoryItem } from './HierarchyCategorySelector';

/**
 * Tree node for display
 */
interface TreeNode extends CategoryItem {
  children: TreeNode[];
  expanded?: boolean;
}

/**
 * Props for HierarchyConfigManager
 */
interface HierarchyConfigManagerProps {
  projectId: string;
  onSave?: () => void;
  className?: string;
}

/**
 * State for add/edit modal
 */
interface CategoryModalState {
  isOpen: boolean;
  mode: 'add' | 'edit';
  parentId?: string;
  parentLevel?: number;
  category?: CategoryItem;
}

/**
 * Priority interface
 */
interface Priority {
  _id: string;
  name: string;
  code: string;
  color?: string;
}

/**
 * HierarchyConfigManager - Admin component for configuring and managing hierarchical categories
 */
const HierarchyConfigManager: React.FC<HierarchyConfigManagerProps> = ({
  projectId,
  onSave,
  className = '',
}) => {
  // Config state
  const [config, setConfig] = useState<HierarchyConfig | null>(null);
  const [editedConfig, setEditedConfig] = useState<Partial<HierarchyConfig>>({});
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  
  // Category tree state
  const [categoryTree, setCategoryTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  
  // Modal state
  const [modalState, setModalState] = useState<CategoryModalState>({
    isOpen: false,
    mode: 'add',
  });
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    code: '' as string | number,
    description: '',
    defaultPriority: '',
    isActive: true,
  });
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  
  // Priorities state
  const [priorities, setPriorities] = useState<Priority[]>([]);
  
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    category?: CategoryItem;
  }>({ isOpen: false });

  // Bulk upload state
  const [bulkUpload, setBulkUpload] = useState<{
    isOpen: boolean;
    csvData: string;
    parsedData: Array<{ code?: number; level: number; parentName: string; name: string; defaultPriority: string }>;
    error: string | null;
    uploading: boolean;
    result: { created: number; updated: number; skipped: number; errors: string[] } | null;
  }>({
    isOpen: false,
    csvData: '',
    parsedData: [],
    error: null,
    uploading: false,
    result: null,
  });

  /**
   * Fetch hierarchy configuration
   */
  const fetchConfig = useCallback(async () => {
    if (!projectId) return;
    
    try {
      setConfigLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_URL}/hierarchy-config/${projectId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.data.success) {
        setConfig(response.data.data);
        setEditedConfig(response.data.data);
      }
    } catch (err: any) {
      console.error('Error fetching hierarchy config:', err);
    } finally {
      setConfigLoading(false);
    }
  }, [projectId]);

  /**
   * Fetch category tree
   */
  const fetchCategoryTree = useCallback(async () => {
    if (!projectId) return;
    
    try {
      setTreeLoading(true);
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_URL}/hierarchy-config/${projectId}/tree`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.data.success) {
        setCategoryTree(response.data.data || []);
      }
    } catch (err: any) {
      console.error('Error fetching category tree:', err);
    } finally {
      setTreeLoading(false);
    }
  }, [projectId]);

  /**
   * Fetch priorities for the project
   */
  const fetchPriorities = useCallback(async () => {
    if (!projectId) return;
    
    try {
      const token = localStorage.getItem('authToken');
      // Fetch priorities from SLA rules for this project
      const response = await axios.get(`${API_URL}/sla-rules?projectId=${projectId}&isActive=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.data.success && response.data.data) {
        // Use SLA rule names as priorities
        const prioritiesFromRules = response.data.data.map((rule: any) => ({
          _id: rule._id,
          code: rule.name.toLowerCase(),
          name: rule.name,
          color: rule.color,
        }));
        console.log('✅ Priorities loaded:', prioritiesFromRules.length, 'items');
        setPriorities(prioritiesFromRules);
      }
    } catch (err: any) {
      console.error('Error fetching priorities:', err);
    }
  }, [projectId]);

  /**
   * Initial load
   */
  useEffect(() => {
    fetchConfig();
    fetchCategoryTree();
    fetchPriorities();
  }, [fetchConfig, fetchCategoryTree, fetchPriorities]);

  /**
   * Save hierarchy configuration
   */
  const handleSaveConfig = async () => {
    if (!editedConfig) return;
    
    try {
      setConfigSaving(true);
      const token = localStorage.getItem('authToken');
      const response = await axios.post(
        `${API_URL}/hierarchy-config/${projectId}`,
        editedConfig,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setConfig(response.data.data);
        setEditedConfig(response.data.data);
        if (onSave) onSave();
      }
    } catch (err: any) {
      console.error('Error saving hierarchy config:', err);
      alert('Failed to save configuration: ' + (err.response?.data?.message || err.message));
    } finally {
      setConfigSaving(false);
    }
  };

  /**
   * Update level count
   */
  const handleLevelCountChange = (count: number) => {
    const levels: HierarchyLevel[] = [];
    const defaultNames = ['Category', 'Subcategory', 'Topic', 'Subtopic'];
    
    for (let i = 1; i <= count; i++) {
      const existingLevel = editedConfig?.levels?.find(l => l.levelNumber === i);
      levels.push({
        levelNumber: i,
        displayName: existingLevel?.displayName || defaultNames[i - 1] || `Level ${i}`,
        isMandatory: i === 1 ? true : (existingLevel?.isMandatory || false),
        isActive: true,
      });
    }
    
    setEditedConfig({
      ...editedConfig,
      levelCount: count,
      levels,
    });
  };

  /**
   * Update level configuration
   */
  const handleLevelConfigChange = (levelNumber: number, field: keyof HierarchyLevel, value: any) => {
    if (!editedConfig?.levels) return;
    
    const updatedLevels = editedConfig.levels.map(level => {
      if (level.levelNumber === levelNumber) {
        // Level 1 is always mandatory
        if (field === 'isMandatory' && levelNumber === 1) {
          return { ...level, isMandatory: true };
        }
        return { ...level, [field]: value };
      }
      return level;
    });
    
    setEditedConfig({
      ...editedConfig,
      levels: updatedLevels,
    });
  };

  /**
   * Toggle node expansion
   */
  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  /**
   * Open add category modal
   */
  const handleAddCategory = (parentId?: string, parentLevel?: number) => {
    setCategoryForm({
      name: '',
      code: '',
      description: '',
      defaultPriority: '',
      isActive: true,
    });
    setFormError(null);
    setModalState({
      isOpen: true,
      mode: 'add',
      parentId,
      parentLevel,
    });
  };

  /**
   * Open edit category modal
   */
  const handleEditCategory = (category: CategoryItem) => {
    setCategoryForm({
      name: category.name,
      code: category.code,
      description: '',
      defaultPriority: category.defaultPriority || '',
      isActive: category.isActive,
    });
    setFormError(null);
    setModalState({
      isOpen: true,
      mode: 'edit',
      category,
    });
  };

  /**
   * Close modal
   */
  const closeModal = () => {
    setModalState({ isOpen: false, mode: 'add' });
    setCategoryForm({ name: '', code: '', description: '', defaultPriority: '', isActive: true });
    setFormError(null);
  };

  /**
   * Get next auto-generated code - unique across entire project
   */
  const getNextCode = (): number => {
    // Collect all codes from the entire tree
    const collectAllCodes = (nodes: TreeNode[]): number[] => {
      const codes: number[] = [];
      for (const node of nodes) {
        const code = typeof node.code === 'number' ? node.code : parseInt(String(node.code), 10);
        if (!isNaN(code)) {
          codes.push(code);
        }
        if (node.children && node.children.length > 0) {
          codes.push(...collectAllCodes(node.children));
        }
      }
      return codes;
    };
    
    const allCodes = collectAllCodes(categoryTree);
    if (allCodes.length === 0) return 1;
    
    // Find max code across entire project
    const maxCode = Math.max(...allCodes);
    return maxCode + 1;
  };

  /**
   * Submit category form
   */
  const handleSubmitCategory = async () => {
    if (!categoryForm.name.trim()) {
      setFormError('Name is required');
      return;
    }
    
    try {
      setFormSaving(true);
      setFormError(null);
      const token = localStorage.getItem('authToken');
      const axiosConfig = { headers: { 'Authorization': `Bearer ${token}` } };
      
      if (modalState.mode === 'add') {
        // Create new category with auto-generated code
        const newLevel = modalState.parentLevel ? modalState.parentLevel + 1 : 1;
        const autoCode = getNextCode(); // Gets max code across entire project + 1
        
        await axios.post(`${API_URL}/hierarchy-config/${projectId}/categories`, {
          name: categoryForm.name.trim(),
          code: autoCode,
          parentId: modalState.parentId,
          level: newLevel,
          defaultPriority: categoryForm.defaultPriority || undefined,
          isActive: categoryForm.isActive,
        }, axiosConfig);
      } else {
        // Update existing category (keep existing code)
        await axios.put(
          `${API_URL}/hierarchy-config/${projectId}/categories/${modalState.category?._id}`,
          {
            name: categoryForm.name.trim(),
            code: modalState.category?.code, // Keep existing code
            defaultPriority: categoryForm.defaultPriority || undefined,
            isActive: categoryForm.isActive,
          },
          axiosConfig
        );
      }
      
      closeModal();
      fetchCategoryTree();
    } catch (err: any) {
      console.error('Error saving category:', err);
      setFormError(err.response?.data?.message || 'Failed to save category');
    } finally {
      setFormSaving(false);
    }
  };

  /**
   * Confirm delete
   */
  const handleDeleteClick = (category: CategoryItem) => {
    setDeleteConfirm({ isOpen: true, category });
  };

  /**
   * Execute delete
   */
  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.category) return;
    
    try {
      const token = localStorage.getItem('authToken');
      await axios.delete(
        `${API_URL}/hierarchy-config/${projectId}/categories/${deleteConfirm.category._id}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      setDeleteConfirm({ isOpen: false });
      fetchCategoryTree();
    } catch (err: any) {
      console.error('Error deleting category:', err);
      alert(err.response?.data?.message || 'Failed to delete category');
    }
  };

  /**
   * Parse CSV data - supports both old (Level,ParentName,Name,Priority) and new (Code,Level,ParentName,Name,Priority) formats
   */
  const parseCSV = (csvText: string) => {
    const lines = csvText.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    const parsed: Array<{ code?: number; level: number; parentName: string; name: string; defaultPriority: string }> = [];
    
    // Detect format from header
    let hasCodeColumn = false;
    let startIndex = 0;
    if (lines[0]?.toLowerCase().includes('level') && lines[0]?.toLowerCase().includes('name')) {
      hasCodeColumn = lines[0].toLowerCase().startsWith('code');
      startIndex = 1;
    }
    
    for (let i = startIndex; i < lines.length; i++) {
      // Handle quoted values (e.g., names with commas)
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      
      if (hasCodeColumn) {
        // New format: Code,Level,ParentName,Name,Priority
        if (values.length >= 4) {
          const code = values[0] ? parseInt(values[0], 10) : undefined;
          const level = parseInt(values[1], 10);
          if (!isNaN(level)) {
            parsed.push({
              code: code && !isNaN(code) ? code : undefined,
              level,
              parentName: values[2] || '',
              name: values[3] || '',
              defaultPriority: values[4] || '',
            });
          }
        }
      } else {
        // Old format: Level,ParentName,Name,Priority
        if (values.length >= 3) {
          const level = parseInt(values[0], 10);
          if (!isNaN(level)) {
            parsed.push({
              level,
              parentName: values[1] || '',
              name: values[2] || '',
              defaultPriority: values[3] || '',
            });
          }
        }
      }
    }
    
    return parsed;
  };

  /**
   * Handle file upload
   */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      setBulkUpload(prev => ({
        ...prev,
        csvData: text,
        parsedData: parsed,
        error: parsed.length === 0 ? 'No valid data found in CSV' : null,
        result: null,
      }));
    };
    reader.readAsText(file);
  };

  /**
   * Download CSV template
   */
  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(
        `${API_URL}/hierarchy-config/${projectId}/categories/template`,
        { 
          headers: { 'Authorization': `Bearer ${token}` },
          responseType: 'blob',
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'category_bulk_upload_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Error downloading template:', err);
      alert('Failed to download template');
    }
  };

  /**
   * Submit bulk upload
   */
  const handleBulkUploadSubmit = async () => {
    if (bulkUpload.parsedData.length === 0) return;
    
    try {
      setBulkUpload(prev => ({ ...prev, uploading: true, error: null }));
      const token = localStorage.getItem('authToken');
      
      const response = await axios.post(
        `${API_URL}/hierarchy-config/${projectId}/categories/bulk`,
        { categories: bulkUpload.parsedData },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setBulkUpload(prev => ({
          ...prev,
          result: response.data.data,
          uploading: false,
        }));
        fetchCategoryTree(); // Refresh tree
      }
    } catch (err: any) {
      console.error('Bulk upload error:', err);
      setBulkUpload(prev => ({
        ...prev,
        error: err.response?.data?.message || 'Bulk upload failed',
        uploading: false,
      }));
    }
  };

  /**
   * Close bulk upload modal
   */
  const closeBulkUpload = () => {
    setBulkUpload({
      isOpen: false,
      csvData: '',
      parsedData: [],
      error: null,
      uploading: false,
      result: null,
    });
  };

  /**
   * Render tree node
   */
  const renderTreeNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedNodes.has(node._id);
    const hasChildren = node.children && node.children.length > 0;
    const canAddChild = config && node.level < config.levelCount;
    
    return (
      <div key={node._id} className="select-none">
        <div
          className={`
            flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-gray-50
            ${!node.isActive ? 'opacity-50' : ''}
          `}
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
        >
          {/* Expand/collapse button */}
          <button
            onClick={() => toggleExpand(node._id)}
            className={`w-6 h-6 flex items-center justify-center text-gray-400 ${hasChildren ? 'cursor-pointer hover:text-gray-600' : 'invisible'}`}
          >
            {hasChildren && (
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
          
          {/* Category info */}
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-800">{node.name}</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              #{node.code}
            </span>
            <span className="text-xs text-gray-400">
              L{node.level}
            </span>
            {node.defaultPriority && (
              <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                {node.defaultPriority}
              </span>
            )}
            {!node.isActive && (
              <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded">
                Inactive
              </span>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-1">
            {canAddChild && (
              <button
                onClick={() => handleAddCategory(node._id, node.level)}
                className="p-1 text-green-600 hover:bg-green-50 rounded"
                title="Add child"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
            <button
              onClick={() => handleEditCategory(node)}
              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
              title="Edit"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => handleDeleteClick(node)}
              className="p-1 text-red-600 hover:bg-red-50 rounded"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Children */}
        {isExpanded && hasChildren && (
          <div className="border-l border-gray-200 ml-4">
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Loading state
  if (configLoading) {
    return (
      <div className={`${className} animate-pulse`}>
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Configuration Section */}
      <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Hierarchy Configuration</h3>
        
        {/* Level Count */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number of Levels
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(count => (
              <button
                key={count}
                onClick={() => handleLevelCountChange(count)}
                className={`
                  px-4 py-2 rounded-lg border transition-colors
                  ${editedConfig?.levelCount === count
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                {count} Level{count > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </div>
        
        {/* Level Names */}
        {editedConfig?.levels && editedConfig.levels.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Level Names
            </label>
            <div className="grid grid-cols-2 gap-4">
              {editedConfig.levels.map(level => (
                <div key={level.levelNumber} className="flex items-center gap-2">
                  <span className="w-8 text-sm text-gray-500">L{level.levelNumber}</span>
                  <input
                    type="text"
                    value={level.displayName}
                    onChange={(e) => handleLevelConfigChange(level.levelNumber, 'displayName', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={`Level ${level.levelNumber} name`}
                  />
                  <label className="flex items-center gap-1 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={level.isMandatory}
                      onChange={(e) => handleLevelConfigChange(level.levelNumber, 'isMandatory', e.target.checked)}
                      disabled={level.levelNumber === 1}
                      className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                    />
                    Required
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Priority From Level */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Priority Assignment
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Select which category level determines the ticket priority automatically
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setEditedConfig({ ...editedConfig, priorityFromLevel: 0 })}
              className={`
                px-3 py-1.5 rounded-lg border text-sm transition-colors
                ${(editedConfig?.priorityFromLevel || 0) === 0
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }
              `}
            >
              Manual
            </button>
            {editedConfig?.levels?.map(level => (
              <button
                key={level.levelNumber}
                onClick={() => setEditedConfig({ ...editedConfig, priorityFromLevel: level.levelNumber })}
                className={`
                  px-3 py-1.5 rounded-lg border text-sm transition-colors
                  ${editedConfig?.priorityFromLevel === level.levelNumber
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                From {level.displayName}
              </button>
            ))}
          </div>
        </div>
        
        {/* Save button */}
        <button
          onClick={handleSaveConfig}
          disabled={configSaving}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {configSaving && (
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          Save Configuration
        </button>
      </div>
      
      {/* Category Tree Section */}
      <div className="p-4 bg-white border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Category Items</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBulkUpload(prev => ({ ...prev, isOpen: true }))}
              className="px-3 py-1.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center gap-1 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Bulk Upload
            </button>
            <button
              onClick={() => handleAddCategory()}
              className="px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-1 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Root Category
            </button>
          </div>
        </div>
        
        {treeLoading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-gray-200 rounded"></div>
            ))}
          </div>
        ) : categoryTree.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p>No categories yet. Add your first root category.</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {categoryTree.map(node => renderTreeNode(node))}
          </div>
        )}
      </div>
      
      {/* Add/Edit Category Modal */}
      {modalState.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">
                {modalState.mode === 'add' ? 'Add Category' : 'Edit Category'}
              </h3>
            </div>
            
            <div className="px-6 py-4 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {formError}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Category name"
                />
              </div>
              
              {/* Code is auto-generated, show only in edit mode */}
              {modalState.mode === 'edit' && modalState.category?.code && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Code
                  </label>
                  <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-600">
                    {modalState.category.code}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Auto-generated numeric identifier (read-only).
                  </p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Priority
                </label>
                <select
                  value={categoryForm.defaultPriority}
                  onChange={(e) => setCategoryForm({ ...categoryForm, defaultPriority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- No default priority --</option>
                  {priorities.map(priority => (
                    <option key={priority._id} value={priority.code}>
                      {priority.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Tickets with this category will auto-assign this priority.
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={categoryForm.isActive}
                  onChange={(e) => setCategoryForm({ ...categoryForm, isActive: e.target.checked })}
                  className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">
                  Active
                </label>
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitCategory}
                disabled={formSaving}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {formSaving && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {modalState.mode === 'add' ? 'Add' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
            <div className="px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Confirm Delete</h3>
              <p className="text-gray-600">
                Are you sure you want to delete "<strong>{deleteConfirm.category?.name}</strong>"?
                This action cannot be undone.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm({ isOpen: false })}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {bulkUpload.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">Bulk Upload Categories</h3>
              <button
                onClick={closeBulkUpload}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="px-6 py-4 flex-1 overflow-y-auto">
              {/* Instructions */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <p className="font-medium mb-2">CSV Format Instructions:</p>
                <ul className="list-disc ml-4 space-y-1">
                  <li><strong>Level:</strong> 1-4 (based on your hierarchy)</li>
                  <li><strong>ParentName:</strong> Leave empty for Level 1, exact parent name for others</li>
                  <li><strong>Name:</strong> Category name (required)</li>
                  <li><strong>DefaultPriority:</strong> Optional (high, medium, normal, low)</li>
                </ul>
              </div>
              
              {/* Download Template Button */}
              <div className="mb-4">
                <button
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Template CSV
                </button>
              </div>
              
              {/* File Upload */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload CSV File
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              
              {/* Error Display */}
              {bulkUpload.error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {bulkUpload.error}
                </div>
              )}
              
              {/* Result Display */}
              {bulkUpload.result && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                  <p className="font-medium text-green-800 mb-2">Upload Complete!</p>
                  <p className="text-green-700">
                    Created: <strong>{bulkUpload.result.created}</strong> | 
                    Updated: <strong>{bulkUpload.result.updated || 0}</strong> | 
                    Skipped: <strong>{bulkUpload.result.skipped}</strong>
                  </p>
                  {bulkUpload.result.errors.length > 0 && (
                    <div className="mt-2 text-red-600">
                      <p className="font-medium">Errors:</p>
                      <ul className="list-disc ml-4 max-h-32 overflow-y-auto">
                        {bulkUpload.result.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
              {/* Preview Table */}
              {bulkUpload.parsedData.length > 0 && !bulkUpload.result && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Preview ({bulkUpload.parsedData.length} rows)
                  </p>
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Code</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Level</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Parent</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Name</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Priority</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {bulkUpload.parsedData.slice(0, 50).map((row, idx) => (
                          <tr key={idx} className={`hover:bg-gray-50 ${row.code ? 'bg-yellow-50' : ''}`}>
                            <td className="px-3 py-2">{row.code || <span className="text-green-600 text-xs">NEW</span>}</td>
                            <td className="px-3 py-2">{row.level}</td>
                            <td className="px-3 py-2 text-gray-500">{row.parentName || '-'}</td>
                            <td className="px-3 py-2">{row.name}</td>
                            <td className="px-3 py-2 text-gray-500">{row.defaultPriority || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {bulkUpload.parsedData.length > 50 && (
                      <p className="px-3 py-2 bg-gray-50 text-gray-500 text-sm">
                        ... and {bulkUpload.parsedData.length - 50} more rows
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={closeBulkUpload}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                {bulkUpload.result ? 'Close' : 'Cancel'}
              </button>
              {!bulkUpload.result && (
                <button
                  onClick={handleBulkUploadSubmit}
                  disabled={bulkUpload.parsedData.length === 0 || bulkUpload.uploading}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                    bulkUpload.parsedData.length > 0 && !bulkUpload.uploading
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {bulkUpload.uploading && (
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {bulkUpload.uploading ? 'Uploading...' : 'Upload Categories'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HierarchyConfigManager;
