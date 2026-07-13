import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Ticket } from '../models/Ticket';
import { Project } from '../models/Project';
import { Center } from '../models/Center';
import { Category } from '../models/Category';
import ExcelJS from 'exceljs';

/**
 * @route   POST /api/tickets/export
 * @desc    Export tickets to CSV or Excel
 * @access  Private (TICKET_EXPORT)
 *
 * The export columns mirror the configurable columns shown on the queries table.
 * The client sends `columns: [{ key, label }]` (the project's configured table
 * columns, including custom fields `field_*` and hierarchy levels
 * `hierarchy_level_N`). When omitted, a sensible default set is used.
 */

interface ExportColumn {
  key: string;
  label: string;
}

const STATUS_LABELS: Record<number, string> = {
  1: 'Open',
  2: 'In Progress',
  3: 'On Hold',
  4: 'Resolved',
  5: 'Closed',
};

const SOURCE_LABELS: Record<string, string> = {
  online: 'Online',
  offline: 'Offline',
  email: 'Email',
  portal: 'Portal',
  phone: 'Phone',
  'walk-in': 'Walk-in',
  api: 'API',
};

// Columns used when the client doesn't send a configuration (kept close to the
// previous hardcoded export for backward compatibility).
const DEFAULT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'ticketNumber', label: 'Ticket Number' },
  { key: 'subject', label: 'Subject' },
  { key: 'description', label: 'Description' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'category', label: 'Category' },
  { key: 'createdBy', label: 'Created By' },
  { key: 'assignee', label: 'Assigned To' },
  { key: 'project', label: 'Project' },
  { key: 'createdAt', label: 'Created At' },
  { key: 'updatedAt', label: 'Updated At' },
];

const fullName = (u: any): string =>
  u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';

// Format dates in IST (Asia/Kolkata) for exports — e.g. "08/06/2026, 05:32 PM"
// instead of a raw UTC ISO string.
const formatDate = (d?: Date | string | null): string => {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

export const exportTickets = async (req: Request, res: Response) => {
  try {
    const { format, includeComments, includeAttachments, filters, columns } =
      req.body as {
        format?: string;
        includeComments?: boolean;
        includeAttachments?: boolean;
        filters?: any;
        columns?: ExportColumn[];
      };

    // Build query from filters
    const query: any = {};
    if (filters) {
      if (filters.status && filters.status !== 'all') {
        const statusNum = Number(filters.status);
        if (!isNaN(statusNum)) query.status = statusNum;
      }
      if (filters.priority && filters.priority !== 'all') {
        query.priority = filters.priority.toLowerCase();
      }
      if (filters.projectId && filters.projectId !== 'all') {
        query['metadata.projectId'] = filters.projectId;
      }
      if (filters.assignedTo && filters.assignedTo !== 'all') {
        query.assignedTo = filters.assignedTo;
      }
      if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {};
        if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) {
          const to = new Date(filters.dateTo);
          to.setHours(23, 59, 59, 999);
          query.createdAt.$lte = to;
        }
      }
      if (filters.search) {
        const re = new RegExp(
          filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i',
        );
        query.$or = [{ subject: re }, { ticketNumber: re }];
      }
    }

    const tickets = await Ticket.find(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .lean();

    // ── Resolve the column set ────────────────────────────────────────────────
    let exportColumns: ExportColumn[] =
      Array.isArray(columns) && columns.length > 0
        ? columns.filter((c) => c && c.key)
        : [...DEFAULT_EXPORT_COLUMNS];
    if (includeComments)
      exportColumns.push({ key: '__commentsCount', label: 'Comments Count' });
    if (includeAttachments)
      exportColumns.push({
        key: '__attachmentsCount',
        label: 'Attachments Count',
      });

    // ── Batch-resolve project & center names referenced by the tickets ────────
    const oid = (v: any) =>
      typeof v === 'string' && mongoose.Types.ObjectId.isValid(v)
        ? new mongoose.Types.ObjectId(v)
        : null;

    const needsProject = exportColumns.some((c) => c.key === 'project');
    const needsCenter = exportColumns.some((c) => c.key === 'center');
    // "category" also needs the hierarchy lookup so it can show the TRUE level-1
    // name (the legacy `category` field holds the deepest level offline).
    const needsHierarchy = exportColumns.some(
      (c) => c.key.startsWith('hierarchy_level_') || c.key === 'category',
    );

    const projectNameById = new Map<string, string>();
    const centerNameById = new Map<string, string>();
    const categoryNameById = new Map<string, string>();

    if (needsProject) {
      const ids = [
        ...new Set(
          tickets
            .map((t: any) => t.metadata?.projectId)
            .filter((v: any) => typeof v === 'string'),
        ),
      ];
      const objIds = ids.map(oid).filter(Boolean) as mongoose.Types.ObjectId[];
      if (objIds.length) {
        const docs = await Project.find({ _id: { $in: objIds } })
          .select('name code')
          .lean();
        docs.forEach((p: any) =>
          projectNameById.set(String(p._id), p.name || p.code || ''),
        );
      }
    }

    if (needsCenter) {
      const ids = [
        ...new Set(
          tickets
            .map((t: any) => t.metadata?.centerId)
            .filter((v: any) => typeof v === 'string' && v !== 'online'),
        ),
      ];
      const objIds = ids.map(oid).filter(Boolean) as mongoose.Types.ObjectId[];
      if (objIds.length) {
        const docs = await Center.find({ _id: { $in: objIds } })
          .select('centerName')
          .lean();
        docs.forEach((c: any) =>
          centerNameById.set(String(c._id), c.centerName || ''),
        );
      }
    }

    // Resolve category names for hierarchy level columns (level1..level5). The
    // on-screen table shows the category NAMES; tickets store ObjectIds on
    // categoryHierarchy.levelN, so batch-resolve them to names here.
    if (needsHierarchy) {
      const ids = new Set<string>();
      for (const t of tickets as any[]) {
        const h = t.categoryHierarchy || {};
        for (let n = 1; n <= 10; n++) {
          const v = h[`level${n}`];
          if (v) ids.add(String(v));
        }
      }
      const objIds = [...ids]
        .map(oid)
        .filter(Boolean) as mongoose.Types.ObjectId[];
      if (objIds.length) {
        const docs = await Category.find({ _id: { $in: objIds } })
          .select('name')
          .lean();
        docs.forEach((c: any) =>
          categoryNameById.set(String(c._id), c.name || ''),
        );
      }
    }

    // ── Per-column value resolver (mirrors the queries table cell logic) ──────
    const resolveValue = (ticket: any, key: string): string => {
      const meta = ticket.metadata || {};

      if (key.startsWith('field_')) {
        const fieldName = key.replace(/^field_/, '');
        const v = meta.customFields?.[fieldName];
        return v === undefined || v === null ? '' : String(v);
      }
      if (key.startsWith('hierarchy_level_')) {
        const levelNum = key.replace('hierarchy_level_', '');
        // Level 1 == the legacy populated category; deeper levels resolve from
        // the batched category-name map keyed by categoryHierarchy.levelN id.
        if (levelNum === '1') {
          const lvl1 = ticket.categoryHierarchy?.level1;
          return (
            (ticket.category as any)?.name ||
            (lvl1 ? categoryNameById.get(String(lvl1)) : '') ||
            ''
          );
        }
        const levelId = ticket.categoryHierarchy?.[`level${levelNum}`];
        return levelId ? categoryNameById.get(String(levelId)) ?? '' : '';
      }

      switch (key) {
        case 'ticketNumber':
          return ticket.ticketNumber || '';
        case 'subject':
          return ticket.subject || '';
        case 'description':
          return ticket.description || '';
        case 'status':
          return STATUS_LABELS[ticket.status as number] || String(ticket.status ?? '');
        case 'priority':
          return ticket.priority || '';
        case 'category': {
          // True Level-1 category; fall back to the populated category name.
          const lvl1 = ticket.categoryHierarchy?.level1;
          return (
            (lvl1 ? categoryNameById.get(String(lvl1)) : '') ||
            (ticket.category as any)?.name ||
            ''
          );
        }
        case 'createdBy':
          return (
            meta.createdByName ||
            meta.studentName ||
            fullName(ticket.createdBy) ||
            ''
          );
        case 'requestedBy':
          // Mirror the table: student name → student email → creator name.
          return (
            meta.studentName ||
            meta.studentEmail ||
            meta.createdByName ||
            fullName(ticket.createdBy) ||
            (ticket.submissionSource === 'email' ? ticket.sourceEmail : '') ||
            ''
          );
        case 'assignee':
          return ticket.assignedTo ? fullName(ticket.assignedTo) : 'Unassigned';
        case 'project':
          return (
            projectNameById.get(String(meta.projectId)) ||
            (typeof meta.projectId === 'string' ? meta.projectId : '')
          );
        case 'center': {
          const cid = meta.centerId;
          if (!cid || cid === 'online') return 'Online';
          return centerNameById.get(String(cid)) || String(cid);
        }
        case 'source': {
          // The table reads metadata.submissionType; fall back to the
          // ticket-level submissionSource for older records.
          const src = meta.submissionType || ticket.submissionSource || '';
          return SOURCE_LABELS[src] || (src ? String(src) : '');
        }
        case 'sla': {
          const due =
            ticket.roleLevelSLA?.dueAt || ticket.ticketLevelSLA?.dueAt || null;
          return formatDate(due);
        }
        case 'createdAt':
          return formatDate(ticket.createdAt);
        case 'updatedAt':
          return formatDate(ticket.updatedAt);
        case 'mergedCount':
          return String(ticket.mergedTickets?.length || 0);
        case '__commentsCount':
          return String(ticket.comments?.length || 0);
        case '__attachmentsCount':
          return String(ticket.attachments?.length || 0);
        default:
          return '';
      }
    };

    const headers = exportColumns.map((c) => c.label);
    const dataRows = tickets.map((t: any) =>
      exportColumns.map((c) => resolveValue(t, c.key)),
    );

    if (format === 'csv') {
      const csvEscape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [headers.map(csvEscape).join(',')];
      for (const row of dataRows) lines.push(row.map(csvEscape).join(','));
      const csv = lines.join('\n');
      const filename = `tickets_export_${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } else if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Tickets');
      worksheet.columns = exportColumns.map((c) => ({
        header: c.label,
        key: c.key,
        width: Math.min(40, Math.max(15, c.label.length + 6)),
      }));
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };
      for (const t of tickets) {
        const rowObj: Record<string, string> = {};
        for (const c of exportColumns) rowObj[c.key] = resolveValue(t, c.key);
        worksheet.addRow(rowObj);
      }
      const filename = `tickets_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await workbook.xlsx.write(res);
      res.end();
    } else {
      res.status(400).json({ message: 'Invalid format. Use "csv" or "excel"' });
    }
  } catch (error: any) {
    console.error('Export tickets error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
