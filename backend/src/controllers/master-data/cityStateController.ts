import { Request, Response } from 'express';
import { City, State } from '../../models/master-data';

// @desc    Get all cities
// @route   GET /api/masters/cities
// @access  Private
export const getCities = async (req: Request, res: Response) => {
  try {
    const { state, country } = req.query;
    const query: any = { isActive: true };
    
    if (state) query.state = state;
    if (country) query.country = country;
    
    const cities = await City.find(query).sort({ displayOrder: 1, value: 1 });
    
    res.json({
      success: true,
      data: cities.map(city => ({
        key: city.key,
        value: city.value,
        state: city.state,
        country: city.country
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
// @route   GET /api/masters/states
// @access  Private
export const getStates = async (req: Request, res: Response) => {
  try {
    const { country } = req.query;
    const query: any = { isActive: true };
    
    if (country) query.country = country;
    
    const states = await State.find(query).sort({ displayOrder: 1, value: 1 });
    
    res.json({
      success: true,
      data: states.map(state => ({
        key: state.key,
        value: state.value,
        country: state.country
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
// @route   GET /api/masters/countries/:countryId/states
// @access  Private
export const getStatesByCountry = async (req: Request, res: Response) => {
  try {
    const { countryId } = req.params;
    const states = await State.find({ country: countryId, isActive: true }).sort({ displayOrder: 1, value: 1 });
    
    res.json({
      success: true,
      data: states.map(state => ({
        key: state.key,
        value: state.value,
        country: state.country
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
// @route   GET /api/masters/states/:stateId/cities
// @access  Private
export const getCitiesByState = async (req: Request, res: Response) => {
  try {
    const { stateId } = req.params;
    const cities = await City.find({ state: stateId, isActive: true }).sort({ displayOrder: 1, value: 1 });
    
    res.json({
      success: true,
      data: cities.map(city => ({
        key: city.key,
        value: city.value,
        state: city.state,
        country: city.country
      }))
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cities',
    });
  }
};
