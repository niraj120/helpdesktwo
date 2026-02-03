import React, { useState, useEffect } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import axios from 'axios';
import { API_CONFIG } from '../config/constants';
import {
  DocumentTextIcon,
  DocumentArrowUpIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

// Custom CSS for enhanced editor
const editorStyles = `
  .enhanced-quill-editor .ql-container {
    min-height: 500px;
    font-size: 16px;
  }
  .enhanced-quill-editor .ql-editor {
    min-height: 500px;
    line-height: 1.8;
  }
  .enhanced-quill-editor .ql-editor ol,
  .enhanced-quill-editor .ql-editor ul {
    padding-left: 1.5em;
  }
  .enhanced-quill-editor .ql-editor li {
    margin-bottom: 0.5em;
  }
  .enhanced-quill-editor .ql-editor li.ql-indent-1 { padding-left: 3em; }
  .enhanced-quill-editor .ql-editor li.ql-indent-2 { padding-left: 4.5em; }
  .enhanced-quill-editor .ql-editor li.ql-indent-3 { padding-left: 6em; }
  .enhanced-quill-editor .ql-editor li.ql-indent-4 { padding-left: 7.5em; }
  .enhanced-quill-editor .ql-editor li.ql-indent-5 { padding-left: 9em; }
  .enhanced-quill-editor .ql-toolbar {
    background: #f8f9fa;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem 0.5rem 0 0;
    padding: 12px;
  }
  .enhanced-quill-editor .ql-container {
    border: 1px solid #e2e8f0;
    border-radius: 0 0 0.5rem 0.5rem;
    background: white;
  }
  .enhanced-quill-editor .ql-editor strong {
    font-weight: 700;
  }
  .enhanced-quill-editor .ql-editor h1 { font-size: 2em; font-weight: bold; margin: 1em 0 0.5em; }
  .enhanced-quill-editor .ql-editor h2 { font-size: 1.5em; font-weight: bold; margin: 0.83em 0 0.5em; }
  .enhanced-quill-editor .ql-editor h3 { font-size: 1.17em; font-weight: bold; margin: 1em 0 0.5em; }
  .enhanced-quill-editor .ql-toolbar .ql-formats {
    margin-right: 15px;
  }
  .enhanced-quill-editor .ql-picker-label {
    padding: 5px 8px;
  }
`;


interface KBCategory {
  _id: string;
  name: string;
}

interface KBSubcategory {
  _id: string;
  name: string;
  categoryId: string;
}

interface KBArticle {
  _id?: string;
  title: string;
  categoryId: string;
  subcategoryId: string;
  contentType: 'html' | 'pdf';
  content?: string;
  pdfUrl?: string;
  pdfFileName?: string;
  tags?: string[];
  status: 'draft' | 'published' | 'archived';
  displayOrder: number;
}

interface KBArticleEditorProps {
  article?: KBArticle | null;
  onSave: () => void;
  onCancel: () => void;
}

const KBArticleEditor: React.FC<KBArticleEditorProps> = ({ article, onSave, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const [formData, setFormData] = useState<KBArticle>({
    title: '',
    categoryId: '',
    subcategoryId: '',
    contentType: 'html',
    content: '',
    tags: [],
    status: 'draft',
    displayOrder: 0
  });

  const [tagInput, setTagInput] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const projectContext = JSON.parse(localStorage.getItem('projectContext') || '{}');
  const token = localStorage.getItem('authToken');

  // Get project code from localStorage or projectContext
  const getProjectCode = () => {
    const storedProject = localStorage.getItem('selectedProject');
    if (storedProject) {
      const project = JSON.parse(storedProject);
      return project.code || project.projectCode || 'DEFAULT';
    }
    return projectContext.projectCode || 'DEFAULT';
  };

  // Removed useEffect for fetchCategories as categories are no longer in UI

  useEffect(() => {
    if (article) {
      setFormData({
        ...article,
        tags: article.tags || []
      });
      if (article.categoryId) {
        // fetchSubcategories removed as subcategories are no longer in UI
      }
    }
  }, [article?._id]);

  // Category and subcategory functions removed as they are no longer used in UI

  const handlePdfUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    if (file.type !== 'application/pdf') {
      alert('Please upload a valid PDF file');
      return;
    }

    // Validate file size (50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('File size exceeds 50MB limit');
      return;
    }

    if (!projectContext.projectId || !token) {
      alert('Missing project context or authentication');
      return;
    }

    const formDataToUpload = new FormData();
    formDataToUpload.append('file', file);
    formDataToUpload.append('projectId', projectContext.projectId);
    formDataToUpload.append('projectCode', getProjectCode());

    try {
      setUploadingPdf(true);
      const response = await axios.post(
        `${API_CONFIG.API_URL}/upload/kb-pdf`,
        formDataToUpload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (response.data.success) {
        setFormData(prev => ({
          ...prev,
          pdfUrl: response.data.data.fileUrl,
          pdfFileName: response.data.data.fileName
        }));
        alert('PDF uploaded successfully!');
      }
    } catch (error: any) {
      console.error('Error uploading PDF:', error);
      alert(error.response?.data?.message || 'Failed to upload PDF');
      setPdfFile(null);
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), tagInput.trim()]
      });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter(tag => tag !== tagToRemove)
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Debug logging
    console.log('Form Data:', formData);
    console.log('CategoryId:', formData.categoryId);
    console.log('SubcategoryId:', formData.subcategoryId);

    // Validation
    if (!formData.title?.trim()) {
      alert('Please provide article title');
      return;
    }

    if (formData.contentType === 'html' && !formData.content?.trim()) {
      alert('Please provide content for the article');
      return;
    }

    if (formData.contentType === 'pdf' && !formData.pdfUrl) {
      alert('Please upload a PDF file');
      return;
    }

    if (!projectContext.projectId || !token) {
      alert('Missing project context or authentication');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        projectId: projectContext.projectId,
        title: formData.title,
        ...(formData.categoryId && formData.categoryId.trim() !== '' && { categoryId: formData.categoryId }),
        ...(formData.subcategoryId && formData.subcategoryId.trim() !== '' && { subcategoryId: formData.subcategoryId }),
        contentType: formData.contentType,
        content: formData.contentType === 'html' ? formData.content : undefined,
        pdfUrl: formData.contentType === 'pdf' ? formData.pdfUrl : undefined,
        pdfFileName: formData.contentType === 'pdf' ? formData.pdfFileName : undefined,
        tags: formData.tags || [],
        status: formData.status,
        displayOrder: formData.displayOrder
      };

      console.log('Sending payload:', payload);

      if (article?._id) {
        // Update existing article
        await axios.put(
          `${API_CONFIG.API_URL}/kb/${article._id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        alert('Article updated successfully!');
      } else {
        // Create new article
        await axios.post(
          `${API_CONFIG.API_URL}/kb`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        alert('Article created successfully!');
      }

      onSave();
    } catch (error: any) {
      console.error('Error saving article:', error);
      const message = error.response?.data?.message || error.response?.data?.error || 'Failed to save article';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <style>{editorStyles}</style>
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            {article?._id ? 'Edit Article' : 'Create New Article'}
          </h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Article Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Category Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              {/* Category and Subcategory dropdowns removed from UI */}
            </div>
          </div>

          {/* Content Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content Type *
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="html"
                  checked={formData.contentType === 'html'}
                  onChange={(e) => setFormData({ ...formData, contentType: e.target.value as 'html' | 'pdf' })}
                  className="mr-2"
                />
                <DocumentTextIcon className="h-5 w-5 mr-1" />
                HTML Content (Rich Text Editor)
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="pdf"
                  checked={formData.contentType === 'pdf'}
                  onChange={(e) => setFormData({ ...formData, contentType: e.target.value as 'html' | 'pdf' })}
                  className="mr-2"
                />
                <DocumentArrowUpIcon className="h-5 w-5 mr-1" />
                PDF Upload
              </label>
            </div>
          </div>

          {/* HTML Content Editor */}
          {formData.contentType === 'html' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Article Content *
              </label>
              <ReactQuill
                value={formData.content || ''}
                onChange={(content) => setFormData({ ...formData, content })}
                className="enhanced-quill-editor bg-white"
                theme="snow"
                modules={{
                  toolbar: [
                    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                    [{ 'font': [] }],
                    [{ 'size': ['small', false, 'large', 'huge'] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'script': 'sub'}, { 'script': 'super' }],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],
                    [{ 'indent': '-1'}, { 'indent': '+1' }],
                    [{ 'align': [] }],
                    ['blockquote', 'code-block'],
                    ['link', 'image', 'video', 'formula'],
                    ['clean']
                  ],
                  clipboard: {
                    matchVisual: false
                  }
                }}
                formats={[
                  'header', 'font', 'size',
                  'bold', 'italic', 'underline', 'strike',
                  'color', 'background',
                  'script',
                  'list', 'bullet', 'check', 'indent',
                  'align',
                  'blockquote', 'code-block',
                  'link', 'image', 'video', 'formula'
                ]}
                placeholder="Enter your article content here. You can use the toolbar above to format text, add lists, headings, links, images, and more..."
                style={{ minHeight: '500px' }}
              />
            </div>
          )}

          {/* PDF Upload */}
          {formData.contentType === 'pdf' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload PDF File *
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                {formData.pdfUrl ? (
                  <div className="space-y-2">
                    <DocumentTextIcon className="h-12 w-12 text-green-600 mx-auto" />
                    <p className="text-sm text-gray-700">
                      {formData.pdfFileName || 'PDF uploaded'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, pdfUrl: '', pdfFileName: '' })}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remove PDF
                    </button>
                  </div>
                ) : (
                  <>
                    <DocumentArrowUpIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <label className="cursor-pointer">
                      <span className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-block">
                        {uploadingPdf ? 'Uploading...' : 'Choose PDF File'}
                      </span>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setPdfFile(file);
                            handlePdfUpload(file);
                          }
                        }}
                        className="hidden"
                        disabled={uploadingPdf}
                      />
                    </label>
                    <p className="text-xs text-gray-500 mt-2">PDF files only</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tags
            </label>
            <div className="flex space-x-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                placeholder="Add tag and press Enter"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.tags?.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-2 text-blue-600 hover:text-blue-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Status and Display Order */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as 'draft' | 'published' | 'archived' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Display Order
              </label>
              <input
                type="number"
                value={formData.displayOrder}
                onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || uploadingPdf}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Saving...' : article?._id ? 'Update Article' : 'Create Article'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default KBArticleEditor;
