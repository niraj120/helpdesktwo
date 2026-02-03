import { Request, Response } from 'express';
import KBTable from '../models/KBTable';
import KBArticle from '../models/KBArticle';
import KBArticleLevelMapping from '../models/KBArticleLevelMapping';
import mongoose from 'mongoose';

/**
 * Create a new KB Table
 */
export const createTable = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      tableName,
      description,
      projectId,
      levelIds,
      columns,
      showSerialNumber,
      isSearchable,
      isPaginated,
      displayStyle,
    } = req.body;
    const userId = (req as any).user.userId;

    // Validation
    if (!tableName || !projectId || !columns || columns.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Table name, project, and at least one column are required',
      });
      return;
    }

    // Validate columns
    const columnNames = new Set();
    for (const col of columns) {
      if (!col.columnName) {
        res.status(400).json({
          success: false,
          message: 'All columns must have a name',
        });
        return;
      }
      if (columnNames.has(col.columnName.toLowerCase())) {
        res.status(400).json({
          success: false,
          message: `Duplicate column name: ${col.columnName}`,
        });
        return;
      }
      columnNames.add(col.columnName.toLowerCase());
    }

    const newTable = new KBTable({
      tableName,
      description,
      projectId,
      levelIds: Array.isArray(levelIds) ? levelIds : levelIds ? [levelIds] : [],
      columns,
      rows: [],
      showSerialNumber: showSerialNumber !== false,
      isSearchable: isSearchable !== false,
      isPaginated: isPaginated !== false,
      displayStyle: displayStyle || 'table',
      createdBy: userId,
    });

    await newTable.save();

    res.status(201).json({
      success: true,
      message: 'KB Table created successfully',
      data: newTable,
    });
  } catch (error: any) {
    console.error('Create KB Table error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create KB Table',
      error: error.message,
    });
  }
};

/**
 * Get all KB Tables
 */
export const getTables = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId, levelId, status, page = '1', limit = '50', includeRows = 'false' } = req.query;

    const filter: any = {};
    // Only add project filter if projectId is provided and not 'all' (super admin view)
    if (projectId && projectId !== 'all') filter.projectId = projectId;
    if (levelId) filter.levelIds = levelId; // Filter tables that contain this levelId
    if (status) filter.status = status;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Select only necessary fields, exclude heavy row data unless explicitly requested
    const selectFields = includeRows === 'true' 
      ? {} // Include all fields
      : { rows: 0 }; // Exclude rows to reduce payload size

    const [tables, total] = await Promise.all([
      KBTable.find(filter, selectFields)
        .populate('createdBy', 'email')
        .populate('updatedBy', 'email')
        .populate('levelIds', 'levelName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      KBTable.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: tables,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error: any) {
    console.error('Get KB Tables error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KB Tables',
      error: error.message,
    });
  }
};

/**
 * Get a single KB Table by ID for public viewing
 * For tables with dataSource='articles', dynamically fetch fresh data from articles
 */
export const getPublicTable = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid table ID',
      });
      return;
    }

    const table = await KBTable.findById(id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('levelIds', 'levelName levelIcon')
      .lean();

    if (!table) {
      res.status(404).json({
        success: false,
        message: 'Table not found',
      });
      return;
    }

    // If table uses article data source, dynamically fetch fresh data from articles
    if (table.dataSource === 'articles') {
      console.log(`📊 Dynamically fetching article data for table: ${table.tableName}`);
      
      // Build article query based on project and level mappings (same as populate logic)
      let articleQuery: any = {
        projectIds: table.projectId,
        status: 'active',
      };

      // If table is associated with specific levels, get articles from those levels
      if (table.levelIds && table.levelIds.length > 0) {
        const levelIds = table.levelIds.map((l: any) => l._id || l);
        const mappings = await KBArticleLevelMapping.find({ levelId: { $in: levelIds } });
        const articleIds = mappings.map(m => m.articleId);
        
        if (articleIds.length > 0) {
          articleQuery._id = { $in: articleIds };
        } else {
          // No mappings found, will return empty results
          articleQuery._id = { $in: [] };
        }
      }
      
      const articles = await KBArticle.find(articleQuery)
        .sort({ publishedDate: -1 })
        .lean();

      console.log(`   Found ${articles.length} matching articles`);

      // Map articles to rows using column field mappings
      const dynamicRows = articles.map((article, index) => {
        const rowData: any = {};
        
        table.columns.forEach(column => {
          const fieldMapping = column.articleFieldMapping || [];
          let value = null;

          console.log(`   Column "${column.columnName}" field mapping:`, fieldMapping);

          // Try each mapped field until we find a non-empty value
          for (const field of fieldMapping) {
            if (field === 'pdfUrl' && article.pdfUrl) {
              value = article.pdfUrl;
              break;
            } else if (field === 'externalUrl' && article.externalUrl) {
              value = article.externalUrl;
              break;
            } else if (field === 'htmlContent' && article.htmlContent) {
              // For HTML content, return article link so it can be viewed in modal
              value = `/kb/articles/${article._id}`;
              break;
            } else if (field === 'articleLink') {
              value = `/kb/articles/${article._id}`;
              break;
            } else if (field === 'documentName') {
              value = article.documentName;
              break;
            } else if (field === 'description') {
              value = article.description;
              break;
            } else if (field === 'publishedDate') {
              value = article.publishedDate;
              break;
            } else if (field === 'showNewTag') {
              value = article.showNewTag ? 'Yes' : 'No';
              break;
            } else if ((article as any)[field]) {
              value = (article as any)[field];
              break;
            }
          }

          rowData[column.columnName] = value || 'N/A';
        });

        return {
          _id: article._id,
          rowData,
          order: index + 1
        };
      });

      // Replace static rows with dynamic data
      (table as any).rows = dynamicRows;
      console.log(`   ✅ Generated ${dynamicRows.length} dynamic rows`);
    }

    res.json({
      success: true,
      data: table,
    });
  } catch (error: any) {
    console.error('Get public KB Table error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KB Table',
      error: error.message,
    });
  }
};

/**
 * Get a single KB Table by ID (for editing)
 */
export const getTableById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid table ID',
      });
      return;
    }

    const table = await KBTable.findById(id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('levelIds', 'levelName levelIcon')
      .lean();

    if (!table) {
      res.status(404).json({
        success: false,
        message: 'Table not found',
      });
      return;
    }

    res.json({
      success: true,
      data: table,
    });
  } catch (error: any) {
    console.error('Get KB Table by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch KB Table',
      error: error.message,
    });
  }
};

/**
 * Update KB Table structure (columns, settings)
 */
export const updateTable = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      tableName,
      description,
      levelIds,
      columns,
      status,
      showSerialNumber,
      isSearchable,
      isPaginated,
      displayStyle,
    } = req.body;
    const userId = (req as any).user.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid table ID',
      });
      return;
    }

    const table = await KBTable.findById(id);
    if (!table) {
      res.status(404).json({
        success: false,
        message: 'Table not found',
      });
      return;
    }

    // Update fields
    if (tableName) table.tableName = tableName;
    if (description !== undefined) table.description = description;
    if (levelIds !== undefined) table.levelIds = Array.isArray(levelIds) ? levelIds : levelIds ? [levelIds] : [];
    
    // Handle column updates and rename row data keys if column names changed
    if (columns) {
      const oldColumns = table.columns;
      const columnNameMap: { [oldName: string]: string } = {};
      
      // Build a map of old column names to new column names
      oldColumns.forEach((oldCol, index) => {
        if (columns[index] && oldCol.columnName !== columns[index].columnName) {
          columnNameMap[oldCol.columnName] = columns[index].columnName;
        }
      });
      
      // Update row data keys if column names changed
      if (Object.keys(columnNameMap).length > 0 && table.rows && table.rows.length > 0) {
        table.rows = table.rows.map(row => {
          const newRowData: any = {};
          Object.keys(row.rowData).forEach(oldKey => {
            const newKey = columnNameMap[oldKey] || oldKey;
            newRowData[newKey] = row.rowData[oldKey];
          });
          return {
            ...row,
            rowData: newRowData
          };
        });
      }
      
      table.columns = columns;
    }
    
    if (status) table.status = status;
    if (showSerialNumber !== undefined) table.showSerialNumber = showSerialNumber;
    if (isSearchable !== undefined) table.isSearchable = isSearchable;
    if (isPaginated !== undefined) table.isPaginated = isPaginated;
    if (displayStyle !== undefined) {
      console.log(`📊 Updating displayStyle from "${table.displayStyle}" to "${displayStyle}"`);
      table.displayStyle = displayStyle;
    }
    table.updatedBy = userId;

    await table.save();
    
    console.log(`✅ Table saved. displayStyle is now: ${table.displayStyle}`);

    res.json({
      success: true,
      message: 'Table updated successfully',
      data: table,
    });
  } catch (error: any) {
    console.error('Update KB Table error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update KB Table',
      error: error.message,
    });
  }
};

/**
 * Add row to table
 */
export const addRow = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { rowData } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid table ID',
      });
      return;
    }

    const table = await KBTable.findById(id);
    if (!table) {
      res.status(404).json({
        success: false,
        message: 'Table not found',
      });
      return;
    }

    // Validate row data against columns
    const requiredColumns = table.columns.filter(col => col.isRequired);
    for (const col of requiredColumns) {
      if (!rowData[col.columnName]) {
        res.status(400).json({
          success: false,
          message: `Required column '${col.columnName}' is missing`,
        });
        return;
      }
    }

    const newRow = {
      rowData,
      order: table.rows.length + 1,
    };

    table.rows.push(newRow as any);
    await table.save();

    res.json({
      success: true,
      message: 'Row added successfully',
      data: table,
    });
  } catch (error: any) {
    console.error('Add row error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add row',
      error: error.message,
    });
  }
};

/**
 * Update row in table
 */
export const updateRow = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, rowId } = req.params;
    const { rowData } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid table ID',
      });
      return;
    }

    const table = await KBTable.findById(id);
    if (!table) {
      res.status(404).json({
        success: false,
        message: 'Table not found',
      });
      return;
    }

    const rowIndex = table.rows.findIndex(r => r._id?.toString() === rowId);
    if (rowIndex === -1) {
      res.status(404).json({
        success: false,
        message: 'Row not found',
      });
      return;
    }

    table.rows[rowIndex].rowData = rowData;
    await table.save();

    res.json({
      success: true,
      message: 'Row updated successfully',
      data: table,
    });
  } catch (error: any) {
    console.error('Update row error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update row',
      error: error.message,
    });
  }
};

/**
 * Delete row from table
 */
export const deleteRow = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, rowId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid table ID',
      });
      return;
    }

    const table = await KBTable.findById(id);
    if (!table) {
      res.status(404).json({
        success: false,
        message: 'Table not found',
      });
      return;
    }

    table.rows = table.rows.filter(r => r._id?.toString() !== rowId);
    await table.save();

    res.json({
      success: true,
      message: 'Row deleted successfully',
      data: table,
    });
  } catch (error: any) {
    console.error('Delete row error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete row',
      error: error.message,
    });
  }
};

/**
 * Delete KB Table
 */
export const deleteTable = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid table ID',
      });
      return;
    }

    const table = await KBTable.findByIdAndDelete(id);
    if (!table) {
      res.status(404).json({
        success: false,
        message: 'Table not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Table deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete KB Table error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete KB Table',
      error: error.message,
    });
  }
};

/**
 * Populate table rows from KB Articles based on column mappings
 */
export const populateTableFromArticles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Find the table
    const table = await KBTable.findById(id);
    if (!table) {
      res.status(404).json({
        success: false,
        message: 'Table not found',
      });
      return;
    }

    // Check if table has article mappings
    const mappedColumns = table.columns.filter(col => col.articleFieldMapping);
    if (mappedColumns.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No article field mappings configured for this table',
      });
      return;
    }

    // Fetch articles based on project and level
    let articleQuery: any = {
      projectIds: table.projectId,
      status: 'active',
    };

    // If table is associated with specific levels, get articles from those levels
    if (table.levelIds && table.levelIds.length > 0) {
      const mappings = await KBArticleLevelMapping.find({ levelId: { $in: table.levelIds } });
      const articleIds = mappings.map(m => m.articleId);
      articleQuery._id = { $in: articleIds };
    }

    const articles = await KBArticle.find(articleQuery).sort({ createdAt: -1 });

    console.log(`📊 Found ${articles.length} articles for table population`);
    if (articles.length > 0) {
      console.log('Sample article fields:', {
        id: articles[0]._id,
        documentName: articles[0].documentName,
        pdfUrl: articles[0].pdfUrl,
        externalUrl: articles[0].externalUrl,
        documentType: articles[0].documentType
      });
    }

    // Clear existing rows
    table.rows = [];

    // Populate rows from articles
    articles.forEach((article, index) => {
      const rowData: any = {};
      
      table.columns.forEach(column => {
        if (column.articleFieldMapping && column.articleFieldMapping.length > 0) {
          let value: any = null;
          
          console.log(`🔍 Column "${column.columnName}" mapped to:`, column.articleFieldMapping);
          
          // Helper function to get value for a field
          const getFieldValue = (fieldName: string): any => {
            switch (fieldName) {
              case 'documentName':
                return article.documentName;
              case 'documentType':
                return article.documentType;
              case 'description':
                return article.description;
              case 'author':
                return article.author;
              case 'publishedAt':
                return article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : null;
              case 'publishedDate':
                return article.publishedDate ? new Date(article.publishedDate).toLocaleDateString() : null;
              case 'viewsCount':
                return article.viewsCount || 0;
              case 'status':
                return article.status;
              case 'tags':
                return article.tags && article.tags.length > 0 ? article.tags.join(', ') : null;
              case 'pdfUrl':
                console.log(`  📎 Checking pdfUrl: ${article.pdfUrl}`);
                return article.pdfUrl;
              case 'htmlContent':
                return article.htmlContent ? article.htmlContent.substring(0, 100) + '...' : null;
              case 'externalUrl':
                console.log(`  🔗 Checking externalUrl: ${article.externalUrl}`);
                return article.externalUrl;
              case 'isFeatured':
                return article.isFeatured ? 'Yes' : 'No';
              case 'showNewTag':
                return article.showNewTag ? 'Yes' : 'No';
              case 'articleId':
                return article._id.toString();
              case 'articleLink':
                return `/kb-new/viewer?article=${article._id}`;
              default:
                return null;
            }
          };
          
          // Try each mapped field in order until we find a non-null/non-empty value
          for (const fieldName of column.articleFieldMapping) {
            const fieldValue = getFieldValue(fieldName);
            console.log(`  ✓ Field "${fieldName}" returned:`, fieldValue);
            if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '') {
              value = fieldValue;
              console.log(`  ✅ Using value: ${value}`);
              break;
            }
          }
          
          // If no value found from any mapping, use 'N/A'
          rowData[column.columnName] = value || 'N/A';
          console.log(`  Final value for "${column.columnName}":`, rowData[column.columnName]);
        }
      });

      table.rows.push({
        rowData,
        order: index + 1,
      });
    });

    await table.save();

    res.status(200).json({
      success: true,
      message: `Table populated with ${articles.length} articles`,
      data: table,
    });
  } catch (error: any) {
    console.error('Error populating table from articles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to populate table from articles',
      error: error.message,
    });
  }
};
