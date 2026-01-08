import { Request, Response } from 'express';
import { Country } from '../../models/master-data/Country';

// Get all countries
export const getCountries = async (req: Request, res: Response) => {
  try {
    const { includeInactive } = req.query;
    
    const filter: any = {};
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    const countries = await Country.find(filter).sort({ displayOrder: 1, value: 1 });

    return res.json({
      success: true,
      data: countries.map(country => ({
        _id: country._id,
        key: country.key,
        value: country.value,
        name: country.value, // Add name mapping for frontend compatibility
        code: country.code,
        displayOrder: country.displayOrder,
        isActive: country.isActive
      })),
    });
  } catch (error) {
    console.error('Get countries error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Create a new country
export const createCountry = async (req: Request, res: Response) => {
  try {
    const { key, value, code, displayOrder } = req.body;

    if (!key || !value || !code) {
      return res.status(400).json({
        success: false,
        message: 'Key, value, and code are required',
      });
    }

    const existingCountry = await Country.findOne({ key });
    if (existingCountry) {
      return res.status(400).json({
        success: false,
        message: 'Country with this key already exists',
      });
    }

    const country = new Country({
      key,
      value,
      code: code.toUpperCase(),
      displayOrder: displayOrder || 0,
      isActive: true,
    });

    await country.save();

    return res.status(201).json({
      success: true,
      data: country,
    });
  } catch (error: any) {
    console.error('Create country error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

// Update a country
export const updateCountry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { key, value, code, displayOrder, isActive } = req.body;

    const country = await Country.findById(id);
    if (!country) {
      return res.status(404).json({
        success: false,
        message: 'Country not found',
      });
    }

    if (key) country.key = key;
    if (value) country.value = value;
    if (code) country.code = code.toUpperCase();
    if (displayOrder !== undefined) country.displayOrder = displayOrder;
    if (isActive !== undefined) country.isActive = isActive;

    await country.save();

    return res.json({
      success: true,
      data: country,
    });
  } catch (error: any) {
    console.error('Update country error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

// Delete a country
export const deleteCountry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const country = await Country.findByIdAndDelete(id);
    if (!country) {
      return res.status(404).json({
        success: false,
        message: 'Country not found',
      });
    }

    return res.json({
      success: true,
      message: 'Country deleted successfully',
    });
  } catch (error) {
    console.error('Delete country error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
