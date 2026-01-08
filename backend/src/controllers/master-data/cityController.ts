import { Request, Response } from 'express';
import { City } from '../../models/master-data/City';

// Get all cities
export const getCities = async (req: Request, res: Response) => {
  try {
    const { includeInactive, state, country, stateId, countryId } = req.query;
    
    const filter: any = {};
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }
    
    // Support both stateId (preferred) and state name (backward compatibility)
    if (stateId) {
      filter.stateId = stateId;
    } else if (state) {
      const stateDoc = await require('../../models/master-data/State').State.findOne({ 
        $or: [
          { key: (state as string).toLowerCase() },
          { value: { $regex: new RegExp(`^${state}$`, 'i') } }
        ]
      });
      
      if (stateDoc) {
        const hasStateId = await City.findOne({ stateId: { $exists: true } });
        if (hasStateId) {
          filter.stateId = stateDoc._id;
        } else {
          filter.state = (state as string).toLowerCase();
        }
      } else {
        filter.state = (state as string).toLowerCase();
      }
    }
    
    // Support both countryId (preferred) and country name (backward compatibility)
    if (countryId) {
      filter.countryId = countryId;
    } else if (country) {
      const countryDoc = await require('../../models/master-data/Country').Country.findOne({ 
        $or: [
          { key: (country as string).toLowerCase() },
          { value: { $regex: new RegExp(`^${country}$`, 'i') } }
        ]
      });
      
      if (countryDoc) {
        const hasCountryId = await City.findOne({ countryId: { $exists: true } });
        if (hasCountryId) {
          filter.countryId = countryDoc._id;
        } else {
          filter.country = (country as string).toLowerCase();
        }
      } else {
        filter.country = (country as string).toLowerCase();
      }
    }

    const cities = await City.find(filter)
      .populate('stateId', 'key value')
      .populate('countryId', 'key value code')
      .sort({ displayOrder: 1, value: 1 });

    return res.json({
      success: true,
      data: cities,
    });
  } catch (error) {
    console.error('Get cities error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Create a new city
export const createCity = async (req: Request, res: Response) => {
  try {
    const { key, value, state, country, displayOrder } = req.body;

    if (!key || !value || !state || !country) {
      return res.status(400).json({
        success: false,
        message: 'Key, value, state, and country are required',
      });
    }

    const existingCity = await City.findOne({ key });
    if (existingCity) {
      return res.status(400).json({
        success: false,
        message: 'City with this key already exists',
      });
    }

    const city = new City({
      key,
      value,
      state,
      country,
      displayOrder: displayOrder || 0,
      isActive: true,
    });

    await city.save();

    return res.status(201).json({
      success: true,
      data: city,
    });
  } catch (error: any) {
    console.error('Create city error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

// Update a city
export const updateCity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { key, value, state, country, displayOrder, isActive } = req.body;

    const city = await City.findById(id);
    if (!city) {
      return res.status(404).json({
        success: false,
        message: 'City not found',
      });
    }

    if (key) city.key = key;
    if (value) city.value = value;
    if (state) city.state = state;
    if (country) city.country = country;
    if (displayOrder !== undefined) city.displayOrder = displayOrder;
    if (isActive !== undefined) city.isActive = isActive;

    await city.save();

    return res.json({
      success: true,
      data: city,
    });
  } catch (error: any) {
    console.error('Update city error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

// Delete a city
export const deleteCity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const city = await City.findByIdAndDelete(id);
    if (!city) {
      return res.status(404).json({
        success: false,
        message: 'City not found',
      });
    }

    return res.json({
      success: true,
      message: 'City deleted successfully',
    });
  } catch (error) {
    console.error('Delete city error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
