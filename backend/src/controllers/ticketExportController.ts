import { Request, Response } from 'express';
import { Ticket } from '../models/Ticket';
import ExcelJS from 'exceljs';

/**
 * @route   POST /api/tickets/export
 * @desc    Export tickets to CSV or Excel
 * @access  Private (TICKET_EXPORT)
 */
export const exportTickets = async (req: Request, res: Response) => {
  try {
    const { format, includeComments, includeAttachments, filters } = req.body;

    // Build query from filters
    const query: any = {};

    if (filters) {
      // status is stored as a Number — skip if "all" or missing
      if (filters.status && filters.status !== 'all') {
        const statusNum = Number(filters.status);
        if (!isNaN(statusNum)) query.status = statusNum;
      }

      // priority is stored as a lowercase string
      if (filters.priority && filters.priority !== 'all') {
        query.priority = filters.priority.toLowerCase();
      }

      // projectId is stored under metadata.projectId
      if (filters.projectId && filters.projectId !== 'all') {
        query['metadata.projectId'] = filters.projectId;
      }

      // assignedTo is an ObjectId — only add if it looks like a valid id
      if (filters.assignedTo && filters.assignedTo !== 'all') {
        query.assignedTo = filters.assignedTo;
      }

      // Date range on createdAt
      if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {};
        if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) {
          // Include the whole day
          const to = new Date(filters.dateTo);
          to.setHours(23, 59, 59, 999);
          query.createdAt.$lte = to;
        }
      }

      // Free-text search on subject / ticketNumber
      if (filters.search) {
        const re = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        query.$or = [{ subject: re }, { ticketNumber: re }];
      }
    }

    // Fetch tickets
    const tickets = await Ticket.find(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .populate('category', 'name')
      .sort({ createdAt: -1 });

    if (format === 'csv') {
      // Generate CSV
      const csvRows: string[] = [];
      
      // Header row
      const headers = [
        'Ticket Number',
        'Subject',
        'Description',
        'Status',
        'Priority',
        'Category',
        'Created By',
        'Assigned To',
        'Project',
        'Created At',
        'Updated At'
      ];
      
      if (includeComments) headers.push('Comments Count');
      if (includeAttachments) headers.push('Attachments Count');
      
      csvRows.push(headers.join(','));

      // Data rows
      const statusLabel: Record<number, string> = { 1: 'Open', 2: 'In Progress', 3: 'On Hold', 4: 'Resolved', 5: 'Closed' };
      tickets.forEach(ticket => {
        const row = [
          ticket.ticketNumber || '',
          `"${(ticket.subject || '').replace(/"/g, '""')}"`,
          `"${(ticket.description || '').replace(/"/g, '""')}"`,
          statusLabel[ticket.status as number] || String(ticket.status || ''),
          ticket.priority || '',
          (ticket.category as any)?.name || '',
          `"${(ticket.createdBy as any)?.firstName || ''} ${(ticket.createdBy as any)?.lastName || ''}"`,
          ticket.assignedTo ? `"${(ticket.assignedTo as any)?.firstName || ''} ${(ticket.assignedTo as any)?.lastName || ''}"` : 'Unassigned',
          (ticket.metadata as any)?.projectId || '',
          ticket.createdAt.toISOString(),
          ticket.updatedAt.toISOString()
        ];
        
        if (includeComments) row.push(ticket.comments?.length.toString() || '0');
        if (includeAttachments) row.push(ticket.attachments?.length.toString() || '0');
        
        csvRows.push(row.join(','));
      });

      const csv = csvRows.join('\n');
      const filename = `tickets_export_${new Date().toISOString().split('T')[0]}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
      
    } else if (format === 'excel') {
      // Generate Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Tickets');

      // Define columns
      const columns: any[] = [
        { header: 'Ticket Number', key: 'ticketNumber', width: 15 },
        { header: 'Subject', key: 'subject', width: 30 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Priority', key: 'priority', width: 15 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Created By', key: 'createdBy', width: 20 },
        { header: 'Assigned To', key: 'assignedTo', width: 20 },
        { header: 'Project', key: 'project', width: 20 },
        { header: 'Created At', key: 'createdAt', width: 20 },
        { header: 'Updated At', key: 'updatedAt', width: 20 }
      ];

      if (includeComments) columns.push({ header: 'Comments Count', key: 'commentsCount', width: 15 });
      if (includeAttachments) columns.push({ header: 'Attachments Count', key: 'attachmentsCount', width: 15 });

      worksheet.columns = columns;

      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Add data rows
      const statusLabelXl: Record<number, string> = { 1: 'Open', 2: 'In Progress', 3: 'On Hold', 4: 'Resolved', 5: 'Closed' };
      tickets.forEach(ticket => {
        const row: any = {
          ticketNumber: ticket.ticketNumber || '',
          subject: ticket.subject || '',
          description: ticket.description || '',
          status: statusLabelXl[ticket.status as number] || String(ticket.status || ''),
          priority: ticket.priority || '',
          category: (ticket.category as any)?.name || '',
          createdBy: `${(ticket.createdBy as any)?.firstName || ''} ${(ticket.createdBy as any)?.lastName || ''}`.trim(),
          assignedTo: ticket.assignedTo ? `${(ticket.assignedTo as any)?.firstName || ''} ${(ticket.assignedTo as any)?.lastName || ''}`.trim() : 'Unassigned',
          project: (ticket.metadata as any)?.projectId || '',
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt
        };

        if (includeComments) row.commentsCount = ticket.comments?.length || 0;
        if (includeAttachments) row.attachmentsCount = ticket.attachments?.length || 0;

        worksheet.addRow(row);
      });

      const filename = `tickets_export_${new Date().toISOString().split('T')[0]}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
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
