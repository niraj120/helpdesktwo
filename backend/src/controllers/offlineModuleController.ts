import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { Ticket } from '../models/Ticket';
import { Project } from '../models/Project';
import { Center } from '../models/Center';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * Register a student on behalf when they walk in
 */
export const registerStudent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const studentData = req.body;

    // Verify project exists and has offline module enabled
    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404).json({ 
        success: false, 
        message: 'Project not found' 
      });
      return;
    }

    // Check if project allows offline/both mode
    const submissionMode = project.configuration?.ticketSubmissionSettings?.mode;
    if (submissionMode !== 'offline' && submissionMode !== 'both') {
      res.status(403).json({ 
        success: false, 
        message: 'Offline module is not enabled for this project' 
      });
      return;
    }

    // Get configured registration fields from project settings
    const configuredFields = project.configuration?.offlineModuleSettings?.registrationFields || [];
    
    // Validate required fields
    const requiredFields = configuredFields.filter(field => field.required);
    const missingFields = requiredFields.filter(field => !studentData[field.fieldName]);
    
    if (missingFields.length > 0) {
      res.status(400).json({ 
        success: false, 
        message: 'Missing required fields',
        missingFields: missingFields.map(f => f.fieldName)
      });
      return;
    }

    // Check if student already exists by email
    let student = await User.findOne({ 
      email: studentData.email,
      projects: projectId 
    });

    if (student) {
      res.status(409).json({ 
        success: false, 
        message: 'Student with this email already exists',
        student: {
          id: student._id,
          name: `${student.firstName} ${student.lastName}`.trim(),
          email: student.email
        }
      });
      return;
    }

    // TODO: Find or create student role
    // For now, using a placeholder - this should query the Role model
    const studentRoleId = new mongoose.Types.ObjectId(); // Temporary

    // Create new student user
    // Extract parent mobile from configured fields
    const parentMobileField = configuredFields.find(field => field.isParentMobile && studentData[field.fieldName]);
    const parentMobile = parentMobileField ? studentData[parentMobileField.fieldName] : undefined;

    student = new User({
      firstName: studentData.firstName || '',
      lastName: studentData.lastName || '',
      email: studentData.email,
      mobile: studentData.phone,
      parentMobile: parentMobile, // Save parent mobile if configured
      password: await bcrypt.hash(Math.random().toString(36), 10), // Temporary password
      projects: [projectId],
      role: studentRoleId,
      isActive: true,
      createdAt: new Date(),
    });

    await student.save();

    // Send notification if configured
    const notifySettings = project.configuration?.offlineModuleSettings?.notificationSettings;
    if (notifySettings?.notifyStudentOnRegistration) {
      // TODO: Send welcome email
      console.log('Sending registration notification to:', student.email);
    }

    res.status(201).json({ 
      success: true, 
      message: 'Student registered successfully',
      student: {
        id: student._id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        email: student.email,
        phone: student.mobile,
        registeredAt: student.createdAt
      }
    });
  } catch (error) {
    console.error('Error registering student:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to register student',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Create ticket on behalf of student during walk-in
 */
export const createOfflineTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const ticketData = req.body;

    // Verify project exists and has offline module enabled
    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404).json({ 
        success: false, 
        message: 'Project not found' 
      });
      return;
    }

    // Check if project allows offline/both mode
    const submissionMode = project.configuration?.ticketSubmissionSettings?.mode;
    if (submissionMode !== 'offline' && submissionMode !== 'both') {
      res.status(403).json({ 
        success: false, 
        message: 'Offline module is not enabled for this project' 
      });
      return;
    }

    // Get configured ticket fields
    const configuredFields = project.configuration?.offlineModuleSettings?.ticketFields || [];
    
    // Validate required fields
    const requiredFields = configuredFields.filter(field => field.required);
    const missingFields = requiredFields.filter(field => !ticketData[field.fieldName]);
    
    if (missingFields.length > 0) {
      res.status(400).json({ 
        success: false, 
        message: 'Missing required fields',
        missingFields: missingFields.map(f => f.fieldName)
      });
      return;
    }

    // Verify student exists
    const student = await User.findById(ticketData.studentId);
    if (!student) {
      res.status(404).json({
        success: false,
        message: 'Student not found'
      });
      return;
    }

    // Create ticket
    const ticket = new Ticket({
      title: ticketData.title,
      description: ticketData.description,
      createdBy: student._id,
      status: ticketData.markAsResolved ? 4 : 1, // 4=Resolved, 1=Open
      priority: ticketData.priority || 'medium',
      category: ticketData.category,
      attachments: ticketData.attachments || [],
      metadata: {
        submissionMethod: 'offline',
        createdByAgent: req.user?.userId,
        studentEmail: student.email, // Required for ticket filtering by student email
        projectId: projectId, // Required for project-based filtering
        customFields: ticketData.customFields || {}
      },
      tags: [],
      createdAt: new Date(),
    });

    // Auto-assign to creating agent if configured
    const offlineSettings = project.configuration?.offlineModuleSettings;
    if (offlineSettings?.autoAssignToCreatingAgent && req.user?.userId) {
      ticket.assignedTo = new mongoose.Types.ObjectId(req.user.userId);
    }

    // Handle escalation if requested
    if (ticketData.escalate && offlineSettings?.allowAgentToEscalate) {
      if (!ticket.escalationHistory) {
        ticket.escalationHistory = [];
      }
      ticket.escalationHistory.push({
        escalatedTo: new mongoose.Types.ObjectId(ticketData.escalateTo),
        escalatedBy: new mongoose.Types.ObjectId(req.user?.userId || ''),
        reason: ticketData.escalationReason || 'Escalated during offline ticket creation',
        escalatedAt: new Date()
      });
    }

    await ticket.save();

    // Send notification if configured
    if (offlineSettings?.notificationSettings?.notifyStudentOnTicketCreation) {
      // TODO: Send ticket creation notification
      console.log('Sending ticket notification to:', student.email);
    }

    res.status(201).json({ 
      success: true, 
      message: 'Ticket created successfully',
      ticket: {
        id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt,
        isEscalated: ticket.escalationHistory && ticket.escalationHistory.length > 0
      }
    });
  } catch (error) {
    console.error('Error creating offline ticket:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create ticket',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get offline module settings for a project
 */
export const getOfflineModuleSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404).json({ 
        success: false, 
        message: 'Project not found' 
      });
      return;
    }

    // Check if offline module is available
    const submissionMode = project.configuration?.ticketSubmissionSettings?.mode;
    const isAvailable = submissionMode === 'offline' || submissionMode === 'both';

    res.json({ 
      success: true,
      isAvailable,
      submissionMode,
      settings: project.configuration?.offlineModuleSettings || {}
    });
  } catch (error) {
    console.error('Error fetching offline module settings:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch settings',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * View student records (for agents)
 */
export const viewStudentRecords = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { search, page = 1, limit = 20 } = req.query;

    const query: any = { projects: projectId };
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } }
      ];
    }

    const students = await User.find(query)
      .select('firstName lastName email mobile createdAt')
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.json({ 
      success: true,
      students: students.map(s => ({
        id: s._id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        email: s.email,
        phone: s.mobile,
        createdAt: s.createdAt
      })),
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching student records:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch student records',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Edit student record
 */
export const editStudentRecord = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, studentId } = req.params;
    const updates = req.body;

    const student = await User.findOne({ 
      _id: studentId, 
      projects: projectId
    });

    if (!student) {
      res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
      return;
    }

    // Update allowed fields
    if (updates.firstName !== undefined) student.firstName = updates.firstName;
    if (updates.lastName !== undefined) student.lastName = updates.lastName;
    if (updates.mobile !== undefined) student.mobile = updates.mobile;

    student.updatedAt = new Date();
    await student.save();

    res.json({ 
      success: true, 
      message: 'Student record updated successfully',
      student: {
        id: student._id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        email: student.email,
        phone: student.mobile,
        updatedAt: student.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating student record:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update student record',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get all centers for a specific project
 */
export const getCenters = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    // Validate projectId
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      res.status(400).json({ 
        success: false, 
        message: 'Invalid project ID' 
      });
      return;
    }

    // Fetch all active centers for the project from Center master table
    const centers = await Center.find({ 
      projectId: new mongoose.Types.ObjectId(projectId),
      isActive: true 
    })
    .select('projectId centerName city state address pincode phone email workingHours')
    .sort({ centerName: 1 });

    console.log(`[getCenters] Found ${centers.length} centers for projectId: ${projectId}`);

    res.json({ 
      success: true, 
      centers: centers.map(center => ({
        _id: center._id,
        projectId: center.projectId,
        centerName: center.centerName,
        city: center.city,
        state: center.state,
        address: center.address,
        pincode: center.pincode,
        phone: center.phone,
        email: center.email,
        workingHours: center.workingHours
      }))
    });
  } catch (error) {
    console.error('Error fetching centers:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch centers',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
