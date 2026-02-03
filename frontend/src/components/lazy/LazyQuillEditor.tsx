/**
 * LazyQuillEditor - Performance Optimization
 * ============================================
 * A lazy-loaded wrapper for ReactQuill to reduce initial bundle size.
 * ReactQuill is ~200KB and is only needed when editing rich text content.
 * 
 * Usage:
 *   import { LazyQuillEditor } from '@/components/lazy/LazyQuillEditor';
 *   <LazyQuillEditor value={content} onChange={setContent} />
 */

import React, { lazy, Suspense, ComponentProps } from 'react';

// Lazy load ReactQuill - only downloaded when component is rendered
const ReactQuill = lazy(() => import('react-quill'));

// Re-export the CSS import for consumers who need it
// Note: CSS is small and can be imported statically
export const importQuillStyles = () => import('react-quill/dist/quill.snow.css');

// Loading placeholder that matches editor dimensions
const EditorLoadingPlaceholder: React.FC<{ height?: string }> = ({ height = '200px' }) => (
  <div 
    className="animate-pulse rounded-lg overflow-hidden"
    style={{ height }}
  >
    {/* Toolbar placeholder */}
    <div className="h-12 bg-gray-100 border border-gray-200 rounded-t-lg flex items-center px-3 gap-2">
      <div className="flex gap-1">
        <div className="w-6 h-6 bg-gray-200 rounded" />
        <div className="w-6 h-6 bg-gray-200 rounded" />
        <div className="w-6 h-6 bg-gray-200 rounded" />
      </div>
      <div className="w-px h-6 bg-gray-200 mx-2" />
      <div className="flex gap-1">
        <div className="w-6 h-6 bg-gray-200 rounded" />
        <div className="w-6 h-6 bg-gray-200 rounded" />
      </div>
      <div className="w-px h-6 bg-gray-200 mx-2" />
      <div className="flex gap-1">
        <div className="w-16 h-6 bg-gray-200 rounded" />
      </div>
    </div>
    {/* Editor content placeholder */}
    <div 
      className="bg-white border border-t-0 border-gray-200 rounded-b-lg p-4"
      style={{ height: `calc(${height} - 48px)` }}
    >
      <div className="space-y-3">
        <div className="h-4 bg-gray-100 rounded w-3/4" />
        <div className="h-4 bg-gray-100 rounded w-full" />
        <div className="h-4 bg-gray-100 rounded w-5/6" />
        <div className="h-4 bg-gray-100 rounded w-2/3" />
      </div>
    </div>
  </div>
);

// Props type extracted from ReactQuill
type ReactQuillProps = ComponentProps<typeof ReactQuill>;

export interface LazyQuillEditorProps extends Omit<ReactQuillProps, 'ref'> {
  /** Height of the editor (used for placeholder) */
  editorHeight?: string;
  /** Custom loading component */
  loadingComponent?: React.ReactNode;
}

/**
 * Lazy-loaded ReactQuill wrapper
 * Downloads ReactQuill only when the component is rendered
 */
export const LazyQuillEditor: React.FC<LazyQuillEditorProps> = ({
  editorHeight = '200px',
  loadingComponent,
  ...quillProps
}) => {
  return (
    <Suspense fallback={loadingComponent || <EditorLoadingPlaceholder height={editorHeight} />}>
      <ReactQuill {...quillProps} />
    </Suspense>
  );
};

// Default export for simpler imports
export default LazyQuillEditor;
