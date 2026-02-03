import { Request, Response } from 'express';
import SLATracking from '../models/sla-module/SLATracking';
import { getSLAStatus } from '../services/slaHelperService';

/**
 * Get SLA tracking details for a ticket
 */
export const getTicketSLAStatus = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;

    const slaStatus = await getSLAStatus(ticketId as any);

    if (!slaStatus) {
      return res.status(404).json({
        success: false,
        message: 'SLA tracking not found for this ticket',
      });
    }

    return res.json({
      success: true,
      data: slaStatus,
    });
  } catch (error: any) {
    console.error('❌ Error fetching SLA status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch SLA status',
      error: error.message,
    });
  }
};

/**
 * Get all tickets approaching SLA breach
 */
export const getTicketsApproachingSLA = async (req: Request, res: Response) => {
  try {
    const { projectId, thresholdMinutes = 60 } = req.query;
    const filter: any = {
      resolutionStatus: 'pending',
      isPaused: false,
    };

    if (projectId) {
      filter.projectId = projectId;
    }

    // Find tickets where resolution deadline is within threshold
    const now = new Date();
    const thresholdDate = new Date(now.getTime() + Number(thresholdMinutes) * 60 * 1000);

    filter.resolutionDeadline = {
      $gte: now,
      $lte: thresholdDate,
    };

    const trackings = await SLATracking.find(filter)
      .populate('ticketId', 'ticketNumber subject priority status')
      .populate('slaRuleId', 'name')
      .sort({ resolutionDeadline: 1 })
      .limit(100);

    return res.json({
      success: true,
      data: {
        count: trackings.length,
        tickets: trackings,
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching tickets approaching SLA:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets approaching SLA',
      error: error.message,
    });
  }
};

/**
 * Get tickets with breached SLA
 */
export const getTicketsWithBreachedSLA = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    const filter: any = {
      resolutionStatus: 'breached',
    };

    if (projectId) {
      filter.projectId = projectId;
    }

    const trackings = await SLATracking.find(filter)
      .populate('ticketId', 'ticketNumber subject priority status assignedTo')
      .populate({
        path: 'ticketId',
        populate: {
          path: 'assignedTo',
          select: 'firstName lastName email',
        },
      })
      .populate('slaRuleId', 'name resolutionTime')
      .sort({ resolutionDeadline: 1 })
      .limit(100);

    return res.json({
      success: true,
      data: {
        count: trackings.length,
        tickets: trackings,
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching breached tickets:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch breached tickets',
      error: error.message,
    });
  }
};

/**
 * Get escalation dashboard stats
 */
export const getEscalationStats = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    const filter: any = projectId ? { projectId } : {};

    const [
      totalTracked,
      pendingTickets,
      breachedTickets,
      escalatedTickets,
      autoEscalated,
      manualEscalated,
    ] = await Promise.all([
      SLATracking.countDocuments(filter),
      SLATracking.countDocuments({ ...filter, resolutionStatus: 'pending' }),
      SLATracking.countDocuments({ ...filter, resolutionStatus: 'breached' }),
      SLATracking.countDocuments({ ...filter, currentEscalationLevel: { $gt: 0 } }),
      SLATracking.countDocuments({
        ...filter,
        'escalationHistory.mode': 'auto',
      }),
      SLATracking.countDocuments({
        ...filter,
        'escalationHistory.mode': 'manual',
      }),
    ]);

    // Get tickets approaching SLA (within 1 hour)
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const approachingBreach = await SLATracking.countDocuments({
      ...filter,
      resolutionStatus: 'pending',
      resolutionDeadline: {
        $gte: now,
        $lte: oneHourFromNow,
      },
      isPaused: false,
    });

    return res.json({
      success: true,
      data: {
        totalTracked,
        pendingTickets,
        breachedTickets,
        escalatedTickets,
        autoEscalated,
        manualEscalated,
        approachingBreach,
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching escalation stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch escalation stats',
      error: error.message,
    });
  }
};
