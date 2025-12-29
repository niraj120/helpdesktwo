import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { City, State } from '../../models/master-data';

// @desc    Get all cities
// @route   GET /api/master/cities
// @access  Private
export const getCities = async (req: Request, res: Response) => {
  try {
    const { state, country } = req.query;
    const query: any = {};
    
    // Support both old and new field structures
    if (state) {
      query.$or = [{ state: state }, { stateId: state }];
    }
    if (country) {
      query.$or = query.$or ? [...query.$or, { country: country }, { countryId: country }] : [{ country: country }, { countryId: country }];
    }
    
    const cities = await City.find(query).sort({ displayOrder: 1, value: 1 });
    
    res.json({
      success: true,
      data: cities.map(city => ({
        _id: city._id,
        key: city.key,
        value: city.value,
        name: city.value, // Add name mapping for frontend compatibility
        state: city.state,
        stateId: city.stateId,
        country: city.country,
        countryId: city.countryId
      }))
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cities',
    });
  }
};

// @desc    Get all states
// @route   GET /api/master/states
// @access  Private
export const getStates = async (req: Request, res: Response) => {
  try {
    const { country } = req.query;
    const query: any = {};
    
    // Support both old and new field structures
    if (country) {
      query.$or = [{ country: country }, { countryId: country }];
    }
    
    const states = await State.find(query).sort({ displayOrder: 1, value: 1 });
    
    res.json({
      success: true,
      data: states.map(state => ({
        _id: state._id,
        key: state.key,
        value: state.value,
        name: state.value, // Add name mapping for frontend compatibility
        country: state.country,
        countryId: state.countryId
      }))
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch states',
    });
  }
};

// @desc    Get states by country ID
// @route   GET /api/master/countries/:countryId/states
// @access  Private
export const getStatesByCountry = async (req: Request, res: Response) => {
  try {
    const { countryId } = req.params;
    
    // Convert to ObjectId if valid, otherwise use as string
    const isValidObjectId = mongoose.Types.ObjectId.isValid(countryId);
    const objectId = isValidObjectId ? new mongoose.Types.ObjectId(countryId) : null;
    
    // Build query to support both old string fields and new ObjectId references
    const query: any = {
      $or: [
        { country: countryId }, // Old string field
      ]
    };
    
    // Only add ObjectId query if the ID is a valid ObjectId
    if (objectId) {
      query.$or.push({ countryId: objectId });
    }
    
    console.log('🔍 [getStatesByCountry] Query:', JSON.stringify(query));
    const states = await State.find(query).sort({ displayOrder: 1, value: 1 });
    console.log(`✅ [getStatesByCountry] Found ${states.length} states for country ${countryId}`);
    
    // If no results, let's check what data actually exists
    if (states.length === 0) {
      const allStates = await State.find({}).limit(3);
      console.log('📊 [getStatesByCountry] Sample states in DB:', JSON.stringify(allStates.map(s => ({
        _id: s._id,
        key: s.key,
        value: s.value,
        country: s.country,
        countryId: s.countryId
      }))));
    }
    
    res.json({
      success: true,
      data: states.map(state => ({
        _id: state._id,
        key: state.key,
        value: state.value,
        name: state.value, // Add name mapping for frontend compatibility
        country: state.country,
        countryId: state.countryId
      }))
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch states',
    });
  }
};

// @desc    Get cities by state ID
// @route   GET /api/master/states/:stateId/cities
// @access  Private
export const getCitiesByState = async (req: Request, res: Response) => {
  try {
    const { stateId } = req.params;
    
    // First, get the state to find its key/value for matching
    const state = await State.findById(stateId);
    
    if (!state) {
      return res.json({
        success: true,
        data: []
      });
    }
    
    // Convert to ObjectId if valid, otherwise use as string
    const isValidObjectId = mongoose.Types.ObjectId.isValid(stateId);
    const objectId = isValidObjectId ? new mongoose.Types.ObjectId(stateId) : null;
    
    // Build query to support multiple matching strategies:
    // 1. state field = stateId (ObjectId string)
    // 2. stateId field = ObjectId
    // 3. state field = state.key (lowercase state name like "maharashtra")
    // 4. state field = state.value (state display name)
    const query: any = {
      $or: [
        { state: stateId }, // Old ObjectId string field
        { state: state.key.toLowerCase() }, // Lowercase state name
        { state: state.key }, // State key
        { state: state.value }, // State value
      ]
    };
    
    // Only add ObjectId query if the ID is a valid ObjectId
    if (objectId) {
      query.$or.push({ stateId: objectId });
    }
    
    console.log('🔍 [getCitiesByState] Query:', JSON.stringify(query));
    console.log('🔍 [getCitiesByState] State info:', { key: state.key, value: state.value });
    const cities = await City.find(query).sort({ displayOrder: 1, value: 1 });
    console.log(`✅ [getCitiesByState] Found ${cities.length} cities for state ${stateId}`);
    
    // If no results, let's check what data actually exists
    if (cities.length === 0) {
      const allCities = await City.find({}).limit(3);
      console.log('📊 [getCitiesByState] Sample cities in DB:', JSON.stringify(allCities.map(c => ({
        _id: c._id,
        key: c.key,
        value: c.value,
        state: c.state,
        stateId: c.stateId,
        country: c.country,
        countryId: c.countryId
      }))));
    }
    
    return res.json({
      success: true,
      data: cities.map(city => ({
        _id: city._id,
        key: city.key,
        value: city.value,
        name: city.value, // Add name mapping for frontend compatibility
        state: city.state,
        stateId: city.stateId,
        country: city.country,
        countryId: city.countryId
      }))
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cities',
    });
  }
};
