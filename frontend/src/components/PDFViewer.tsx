import React from 'react';
import { DocumentArrowDownIcon } from '@heroicons/react/24/outline';
import { API_CONFIG } from '../config/constants';

interface PDFViewerProps {
  pdfUrl: string;
  fileName?: string;
  title?: string;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ pdfUrl, fileName, title }) => {
  // Construct full URL if relative path
  // Use BASE_URL (not API_URL) because /uploads is served directly, not under /api
  const baseUrl = API_CONFIG.BASE_URL || window.location.origin;
  const fullPdfUrl = pdfUrl.startsWith('http') 
    ? pdfUrl 
    : `${baseUrl}${pdfUrl.startsWith('/') ? pdfUrl : `/${pdfUrl}`}`;

  const handleDownload = () => {
    try {
      const link = document.createElement('a');
      link.href = fullPdfUrl;
      link.download = fileName || 'document.pdf';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      window.open(fullPdfUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="w-full h-full bg-gray-50 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-800 truncate">
            {title || fileName || 'PDF Document'}
          </h3>
          {fileName && title && (
            <p className="text-sm text-gray-600">{fileName}</p>
          )}
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          title="Download PDF"
        >
          <DocumentArrowDownIcon className="h-5 w-5 mr-2" />
          Download
        </button>
      </div>

      {/* PDF Viewer */}
      <div className="w-full" style={{ height: 'calc(100vh - 200px)' }}>
        <iframe
          src={`${fullPdfUrl}#toolbar=1&navpanes=1&scrollbar=1`}
          className="w-full h-full border-0"
          title={title || fileName || 'PDF Document'}
        >
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <p className="text-gray-600 mb-4">
              Your browser does not support inline PDF viewing.
            </p>
            <button
              onClick={handleDownload}
              className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <DocumentArrowDownIcon className="h-6 w-6 mr-2" />
              Download PDF
            </button>
          </div>
        </iframe>
      </div>

      {/* Alternative: Embed tag for better browser compatibility */}
      {/* <embed
        src={fullPdfUrl}
        type="application/pdf"
        className="w-full"
        style={{ height: 'calc(100vh - 200px)' }}
      /> */}
    </div>
  );
};

export default PDFViewer;
