import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Ticket } from '../models/Ticket';
import { User } from '../models/User';
import mongoose from 'mongoose';

/**
 * Universal Search Controller
 * 
 * Searches across:
 * - Tickets (number, title, description)
 * - Knowledge Base articles
 * - Users (if admin)
 * 
 * Returns results with project context
 */

interface SearchResult {
  id: string;
  type: 'ticket' | 'kb_article' | 'user';
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  link: string;
  metadata?: any;
  score?: number; // Relevance score
}

export const universalSearch = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const query = req.query.q as string;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    console.log(`🔍 Universal search by user ${userId}: "${query}"`);

    // Get user with permissions
    const user = await User.findById(userId).populate({
      path: 'role',
      populate: {
        path: 'permissions',
        model: 'Permission'
      }
    }).populate('projects');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const role = user.role as any;
    const isSuperAdmin = role?.code === 'SUPER_ADMIN';
    const permissions = role?.permissions || [];
    const permissionCodes = permissions.map((p: any) => p.code).filter((c: any) => c);
    const canViewAllTickets = permissionCodes.includes('TICKET_VIEW_ALL');
    const assignedProjectIds = ((user as any).projects as any[])?.map(p => p._id) || [];

    const results: SearchResult[] = [];

    // Build search regex
    const searchRegex = new RegExp(query.split(' ').join('|'), 'i');

    // OPTIMIZED: Run all searches in parallel using Promise.all instead of sequential
    
    // Build ticket query
    let ticketQuery: any = {
      $or: [
        { ticketNumber: { $regex: query, $options: 'i' } },
        { title: { $regex: searchRegex } },
        { description: { $regex: searchRegex } }
      ]
    };

    // Apply project access control for tickets
    if (!isSuperAdmin) {
      if (canViewAllTickets && assignedProjectIds.length > 0) {
        ticketQuery['metadata.projectId'] = {
          $in: assignedProjectIds.map(id => new mongoose.Types.ObjectId(id.toString()))
        };
      } else {
        ticketQuery.$and = [
          ticketQuery,
          {
            $or: [
              { assignedTo: new mongoose.Types.ObjectId(userId) },
              { 'metadata.studentEmail': user.email }
            ]
          }
        ];
      }
    }

    // Build KB query
    const KBArticle = require('../models/KnowledgeBaseArticle').KnowledgeBaseArticle;
    let kbQuery: any = {
      $or: [
        { title: { $regex: searchRegex } },
        { tags: { $in: query.split(' ').map(tag => new RegExp(tag, 'i')) } }
      ],
      published: true
    };
    // Note: Removed content regex search for performance - too slow on large HTML

    if (!isSuperAdmin && assignedProjectIds.length > 0) {
      kbQuery.projectId = {
        $in: assignedProjectIds.map(id => new mongoose.Types.ObjectId(id.toString()))
      };
    }

    // Build user query (only for admins)
    const canSearchUsers = isSuperAdmin || permissionCodes.includes('USER_VIEW_ALL');
    const userQuery = {
      $or: [
        { firstName: { $regex: searchRegex } },
        { lastName: { $regex: searchRegex } },
        { email: { $regex: searchRegex } }
      ]
    };

    // Execute all queries in parallel
    const [tickets, articles, users] = await Promise.all([
      // Ticket search
      Ticket.find(ticketQuery)
        .populate('metadata.projectId', 'name code')
        .select('ticketNumber subject description status priority category metadata')
        .limit(10)
        .sort({ createdAt: -1 })
        .lean()
        .catch((err: Error) => { console.error('Ticket search error:', err); return []; }),
      
      // KB Article search
      KBArticle.find(kbQuery)
        .populate('projectId', 'name code')
        .select('title category featured views projectId')
        .limit(10)
        .sort({ featured: -1, views: -1 })
        .lean()
        .catch((err: Error) => { console.error('KB article search error:', err); return []; }),
      
      // User search (only if permitted)
      canSearchUsers 
        ? User.find(userQuery)
            .populate('projects', 'name code')
            .select('firstName lastName email isActive role projects')
            .limit(5)
            .lean()
            .catch((err: Error) => { console.error('User search error:', err); return []; })
        : Promise.resolve([])
    ]);

    // Process ticket results
    tickets.forEach((ticket: any) => {
      const project = ticket.metadata?.projectId;
      if (project) {
        results.push({
          id: ticket._id.toString(),
          type: 'ticket',
          projectId: project._id.toString(),
          projectName: project.name || 'Unknown',
          title: `${ticket.ticketNumber} - ${ticket.subject}`,
          description: ticket.description?.substring(0, 150) || '',
          link: `/tickets/${ticket._id}`,
          metadata: {
            status: ticket.status,
            priority: ticket.priority,
            category: ticket.category
          }
        });
      }
    });
    console.log(`🔍 Found ${tickets.length} tickets`);

    // Process KB article results
    articles.forEach((article: any) => {
      const project = article.projectId;
      if (project) {
        results.push({
          id: article._id.toString(),
          type: 'kb_article',
          projectId: project._id.toString(),
          projectName: project.name || 'Unknown',
          title: article.title,
          description: '', // Don't include content snippet for performance
          link: `/knowledge-base/${article._id}`,
          metadata: {
            category: article.category,
            featured: article.featured,
            views: article.views
          }
        });
      }
    });
    console.log(`🔍 Found ${articles.length} KB articles`);

    // Process user results
    if (canSearchUsers) {
      users.forEach((foundUser: any) => {
        const userProjects = foundUser.projects || [];
        if (userProjects.length > 0) {
          // Add result for each project the user has access to
          userProjects.forEach((project: any) => {
            results.push({
              id: foundUser._id.toString(),
              type: 'user',
              projectId: project._id?.toString() || project.toString(),
              projectName: project.name || 'Unknown',
              title: `${foundUser.firstName} ${foundUser.lastName}`,
              description: foundUser.email || '',
              link: `/users/${foundUser._id}`,
              metadata: {
                role: (foundUser.role as any)?.name,
                isActive: foundUser.isActive
              }
            });
          });
        } else {
          // User without projects - still show in results
          results.push({
            id: foundUser._id.toString(),
            type: 'user',
            projectId: '',
            projectName: 'No Project',
            title: `${foundUser.firstName} ${foundUser.lastName}`,
            description: foundUser.email || '',
            link: `/users/${foundUser._id}`,
            metadata: {
              role: (foundUser.role as any)?.name,
              isActive: foundUser.isActive
            }
          });
        }
      });
      console.log(`🔍 Found ${users.length} users`);
    }

    // Sort results by relevance (tickets first, then KB, then users)
    results.sort((a, b) => {
      const typeOrder = { ticket: 0, kb_article: 1, user: 2 };
      return typeOrder[a.type] - typeOrder[b.type];
    });

    console.log(`🔍 Total results: ${results.length}`);

    return res.status(200).json({
      success: true,
      data: results,
      query,
      count: results.length
    });

  } catch (error) {
    console.error('Universal search error:', error);
    return res.status(500).json({
      success: false,
      message: 'Search failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
