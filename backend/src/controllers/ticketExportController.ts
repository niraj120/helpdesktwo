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
      if (filters.status) query.status = filters.status;
      if (filters.priority) query.priority = filters.priority;
      if (filters.category) query.category = filters.category;
      if (filters.assignedTo) query.assignedTo = filters.assignedTo;
      
      if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {};
        if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
      }
    }

    // Fetch tickets
    const tickets = await Ticket.find(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .populate('project', 'name')
      .populate('category', 'name')
      .populate('status', 'name')
      .populate('priority', 'name')
      .populate('comments.createdBy', 'firstName lastName email')
      .populate('attachments.uploadedBy', 'firstName lastName email')
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
      tickets.forEach(ticket => {
        const row = [
          ticket.ticketNumber,
          `"${ticket.subject.replace(/"/g, '""')}"`,
          `"${ticket.description?.replace(/"/g, '""') || ''}"`,
          (ticket.status as any)?.name || '',
          (ticket.priority as any)?.name || '',
          (ticket.category as any)?.name || '',
          `"${(ticket.createdBy as any)?.firstName} ${(ticket.createdBy as any)?.lastName}"`,
          ticket.assignedTo ? `"${(ticket.assignedTo as any)?.firstName} ${(ticket.assignedTo as any)?.lastName}"` : 'Unassigned',
          (ticket.project as any)?.name || '',
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
      tickets.forEach(ticket => {
        const row: any = {
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          description: ticket.description || '',
          status: (ticket.status as any)?.name || '',
          priority: (ticket.priority as any)?.name || '',
          category: (ticket.category as any)?.name || '',
          createdBy: `${(ticket.createdBy as any)?.firstName} ${(ticket.createdBy as any)?.lastName}`,
          assignedTo: ticket.assignedTo ? `${(ticket.assignedTo as any)?.firstName} ${(ticket.assignedTo as any)?.lastName}` : 'Unassigned',
          project: (ticket.project as any)?.name || '',
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
