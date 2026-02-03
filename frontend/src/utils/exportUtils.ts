/**
 * Export Utilities - Performance Optimization
 * ============================================
 * Dynamic imports for heavy export libraries (XLSX ~500KB, jsPDF ~300KB)
 * These libraries are only downloaded when the user actually exports data.
 * 
 * Before: Static import loads 800KB+ on every page load
 * After: Libraries only load when export button is clicked
 * 
 * Usage:
 *   import { exportToExcel, exportToPDF, exportToCSV } from '@/utils/exportUtils';
 *   await exportToExcel(data, columns, 'filename');
 */

// ============================================================================
// Types
// ============================================================================

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ExportOptions {
  /** Sheet name for Excel export */
  sheetName?: string;
  /** Title to display in PDF header */
  title?: string;
  /** Custom filename (without extension) */
  filename?: string;
  /** Date format for filename suffix */
  dateFormat?: 'iso' | 'locale' | 'none';
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate filename with optional date suffix
 */
const getFilename = (baseName: string, extension: string, dateFormat: string = 'iso'): string => {
  const cleanName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');
  
  if (dateFormat === 'none') {
    return `${cleanName}.${extension}`;
  }
  
  const date = new Date();
  const dateSuffix = dateFormat === 'locale' 
    ? date.toLocaleDateString().replace(/\//g, '-')
    : date.toISOString().split('T')[0];
  
  return `${cleanName}_${dateSuffix}.${extension}`;
};

/**
 * Transform data array using column mapping
 */
const transformData = <T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn[]
): Record<string, unknown>[] => {
  return data.map(row => {
    const transformed: Record<string, unknown> = {};
    columns.forEach(col => {
      // Support nested keys like "user.name"
      const value = col.key.split('.').reduce<unknown>((obj, key) => {
        if (obj && typeof obj === 'object') {
          return (obj as Record<string, unknown>)[key];
        }
        return undefined;
      }, row);
      transformed[col.header] = value ?? '';
    });
    return transformed;
  });
};

// ============================================================================
// Excel Export (Dynamic XLSX Import)
// ============================================================================

/**
 * Export data to Excel file using dynamic import
 * XLSX library (~500KB) is only downloaded when this function is called
 */
export const exportToExcel = async <T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn[],
  options: ExportOptions = {}
): Promise<void> => {
  const { sheetName = 'Sheet1', filename = 'export', dateFormat = 'iso' } = options;
  
  // Dynamic import - XLSX is only downloaded now
  const XLSX = await import('xlsx');
  
  // Transform data using column mapping
  const exportData = transformData(data, columns);
  
  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  
  // Set column widths if specified
  const colWidths = columns.map(col => ({ wch: col.width || 15 }));
  worksheet['!cols'] = colWidths;
  
  // Create workbook and append sheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  // Generate filename and download
  const fullFilename = getFilename(filename, 'xlsx', dateFormat);
  XLSX.writeFile(workbook, fullFilename);
};

/**
 * Export raw data to Excel (when data is already formatted)
 */
export const exportRawToExcel = async (
  data: Record<string, unknown>[],
  options: ExportOptions = {}
): Promise<void> => {
  const { sheetName = 'Sheet1', filename = 'export', dateFormat = 'iso' } = options;
  
  const XLSX = await import('xlsx');
  
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  const fullFilename = getFilename(filename, 'xlsx', dateFormat);
  XLSX.writeFile(workbook, fullFilename);
};

// ============================================================================
// PDF Export (Dynamic jsPDF Import)
// ============================================================================

/**
 * Export data to PDF file using dynamic import
 * jsPDF library (~300KB) is only downloaded when this function is called
 */
export const exportToPDF = async <T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn[],
  options: ExportOptions = {}
): Promise<void> => {
  const { title = 'Report', filename = 'export', dateFormat = 'iso' } = options;
  
  // Dynamic imports - only downloaded when needed
  const jsPDFModule = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  
  const jsPDF = jsPDFModule.default;
  
  // Create PDF document
  const doc = new jsPDF();
  
  // Add title
  doc.setFontSize(16);
  doc.text(title, 14, 20);
  
  // Add date
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
  
  // Transform data for table
  const exportData = transformData(data, columns);
  const headers = columns.map(col => col.header);
  const body = exportData.map(row => headers.map(h => String(row[h] ?? '')));
  
  // Add table using autoTable
  (doc as any).autoTable({
    head: [headers],
    body: body,
    startY: 35,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [59, 130, 246] }, // Blue header
  });
  
  // Generate filename and save
  const fullFilename = getFilename(filename, 'pdf', dateFormat);
  doc.save(fullFilename);
};

// ============================================================================
// CSV Export (No external library needed)
// ============================================================================

/**
 * Export data to CSV file (no external library required)
 * This is lightweight and doesn't require dynamic imports
 */
export const exportToCSV = <T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn[],
  options: ExportOptions = {}
): void => {
  const { filename = 'export', dateFormat = 'iso' } = options;
  
  // Create headers row
  const headers = columns.map(col => `"${col.header}"`).join(',');
  
  // Create data rows
  const rows = data.map(row => {
    return columns.map(col => {
      // Support nested keys
      const value = col.key.split('.').reduce<unknown>((obj, key) => {
        if (obj && typeof obj === 'object') {
          return (obj as Record<string, unknown>)[key];
        }
        return undefined;
      }, row);
      
      // Escape quotes and wrap in quotes
      const stringValue = String(value ?? '').replace(/"/g, '""');
      return `"${stringValue}"`;
    }).join(',');
  });
  
  // Combine into CSV content
  const csvContent = [headers, ...rows].join('\n');
  
  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = getFilename(filename, 'csv', dateFormat);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

// ============================================================================
// Convenience Functions for Common Export Patterns
// ============================================================================

/**
 * Quick export with auto-detected format
 */
export const quickExport = async <T extends Record<string, unknown>>(
  data: T[],
  columns: ExportColumn[],
  format: 'excel' | 'pdf' | 'csv',
  options: ExportOptions = {}
): Promise<void> => {
  switch (format) {
    case 'excel':
      return exportToExcel(data, columns, options);
    case 'pdf':
      return exportToPDF(data, columns, options);
    case 'csv':
      return exportToCSV(data, columns, options);
  }
};

// ============================================================================
// Type-safe column builder
// ============================================================================

/**
 * Helper to create type-safe column definitions
 */
export const createColumns = <T extends Record<string, unknown>>(
  columns: Array<{
    header: string;
    key: keyof T | (string & {});
    width?: number;
  }>
): ExportColumn[] => columns as ExportColumn[];
