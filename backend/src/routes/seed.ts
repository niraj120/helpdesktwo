import express from 'express';
import { Response } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { Center } from '../models/Center';
import { Project } from '../models/Project';

const router = express.Router();

const centersData = [
  {
    centerName: "CET केंद्र - Amravati",
    address: "Government College of Engineering, VMV Road, Near Kathora Naka",
    city: "Amravati",
    state: "Maharashtra",
    pincode: "444604",
    phone: "02294749373",
    email: "amravati@gov.in",
    workingHours: "Mon-Fri: 9AM to 7PM",
    latitude: 20.9571681,
    longitude: 77.7541867,
    features: ["Wifi enabled", "Printing assistance", "Information Kiosk", "Disability friendly"],
    googleMapLink: "https://www.google.com/maps/place/Government+College+of+Engineering/@20.9571681,77.7541867,17z"
  },
  {
    centerName: "CET केंद्र - Kolhapur",
    address: "Government College of Engineering, Old Pune Bangalore Road Vidyanagar",
    city: "Kolhapur",
    state: "Maharashtra",
    pincode: "416004",
    phone: "0227936483",
    email: "kolhapur@gov.in",
    workingHours: "Mon-Fri: 9AM to 7PM",
    latitude: 16.6858993,
    longitude: 74.255769,
    features: ["Wifi enabled", "Printing assistance", "Information Kiosk", "Disability friendly"],
    googleMapLink: "https://www.google.com/maps/place/Government+Engineering+College+Kolhapur/@16.6858993,74.255769,17z"
  },
  {
    centerName: "CET केंद्र - Mumbai Suburban",
    address: "Sardar Patel College of Engineering, Munshi Nagar, Andheri (West)",
    city: "Mumbai Suburban",
    state: "Maharashtra",
    pincode: "400058",
    phone: "02284639473",
    email: "mumbaisub@gov.in",
    workingHours: "Mon-Fri: 9AM to 7PM",
    latitude: 19.1259692,
    longitude: 72.8334128,
    features: ["Wifi enabled", "Printing assistance", "Information Kiosk", "Disability friendly"],
    googleMapLink: "https://www.google.com/maps/place/SARDAR+PATEL+COLLEGE,+Munshi+Nagar,+Andheri+West,+Mumbai,+Maharashtra+400058/@19.1259692,72.8334128,17z"
  }
];

// POST /api/seed/centers - Seed centers data (requires authentication and SUPER_ADMIN role)
router.post('/centers', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is super admin
    if (req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Only super admins can seed data',
      });
    }

    // Find the MH CET project by projectId from request body
    const { projectId } = req.body;
    
    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'projectId is required',
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Check if centers already exist for this project
    const existingCount = await Center.countDocuments({ projectId: project._id });
    if (existingCount > 0) {
      return res.json({
        success: true,
        message: `${existingCount} centers already exist for this project`,
        skipped: true,
      });
    }

    // Create centers
    const centersToCreate = centersData.map(center => ({
      ...center,
      projectId: project._id,
      createdBy: req.user!.userId,
      isActive: true,
    }));

    const createdCenters = await Center.insertMany(centersToCreate);

    return res.json({
      success: true,
      message: `Successfully created ${createdCenters.length} centers`,
      data: createdCenters,
    });
  } catch (error) {
    console.error('Seed centers error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to seed centers',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
