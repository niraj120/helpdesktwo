# Reports Dropdown Implementation

## Overview
Implemented a unified Reports page with a dropdown selector that allows users to switch between Query Report and Asset Report views with full export capabilities.

## Implementation Date
December 2024

## Components Created/Modified

### 1. Frontend Components

#### New: ReportsPage.tsx
- **Location**: `frontend/src/pages/ReportsPage.tsx`
- **Purpose**: Unified reports page with dropdown selector
- **Features**:
  - Dropdown to switch between "Query Report" and "Asset Report"
  - Visual indicators for selected report type
  - Seamless switching between report views
  - Icons (MdAssessment for Query, MdInventory for Asset)

#### Modified: AssetReport.tsx
- **Location**: `frontend/src/pages/AssetReport.tsx`
- **Changes**:
  - Updated interface to match backend API response structure
  - Integrated with `/my-assets/report` API endpoint
  - Removed static DEMO_ASSETS data
  - Updated table columns to show:
    - Asset Name (with category)
    - Center Name
    - Total Assigned
    - Working Asset
    - Not Working Asset
    - Last Audit Date
    - Next Audit Date
    - Updated By (user name)
    - Status (Audit Completed/Pending)
  - Updated export functions (Excel/CSV) with new fields
  - Changed "Reset" button to call API instead of loading demo data

#### Modified: App.tsx
- **Location**: `frontend/src/App.tsx`
- **Changes**:
  - Imported ReportsPage component
  - Updated `/reports` route to use ReportsPage instead of TicketListReport directly
  - Maintained REPORT_* permission requirements

### 2. Backend Implementation

#### New: getAssetReport Function
- **Location**: `backend/src/controllers/myAssetsController.ts`
- **Route**: `GET /api/my-assets/report`
- **Permission**: MY_ASSETS_VIEW
- **Features**:
  - Fetches all center-asset mappings
  - Filters by user's projects
  - Populates asset details (name, category, unit)
  - Populates project details (name, projectName)
  - Populates last updated by (firstName, lastName, email)
  - Enriches with center names from Center collection
  - Includes audit status information:
    - lastAuditDate
    - nextAuditDate
    - auditSubmitted (true/false)
  - Returns working/not working asset counts
  - Sorted by updatedAt (most recent first)

#### Modified: myAssets Routes
- **Location**: `backend/src/routes/myAssets.ts`
- **Changes**:
  - Added `GET /report` route
  - Protected with checkPermission(PERMISSIONS.MY_ASSETS_VIEW)
  - Maps to getAssetReport controller function

## Data Structure

### API Response Format
```typescript
{
  success: true,
  data: [
    {
      _id: string,
      assetId: {
        _id: string,
        name: string,
        category: string,
        unit: string
      },
      centerName: string,
      centerId: string,
      projectId: {
        _id: string,
        name: string,
        projectName?: string
      },
      totalAssigned: number,
      workingAsset: number,
      notWorkingAsset: number,
      lastAuditDate?: string,
      nextAuditDate?: string,
      auditSubmitted?: boolean,
      lastUpdatedBy?: {
        _id: string,
        firstName?: string,
        lastName?: string,
        email?: string
      },
      updatedAt: string
    }
  ]
}
```

## Features

### Report Switching
1. Users navigate to `/reports`
2. ReportsPage displays dropdown with two options:
   - Query Report (default)
   - Asset Report
3. Clicking dropdown changes the active report
4. Active report is highlighted with blue background

### Asset Report Features
- **Data Display**: Table view with all asset information
- **Export Options**:
  - Excel (.xlsx)
  - CSV (.csv)
- **Refresh**: Button to reload data from API
- **Audit Status**: Color-coded badges:
  - Green "Completed" for submitted audits
  - Yellow "Pending" for pending audits
- **Asset Status**: Color-coded badges:
  - Green for working assets
  - Red for not working assets

### Query Report Features
- Existing TicketListReport component
- All previous functionality maintained:
  - Filters (status, priority, date range)
  - Search
  - Export to PDF/Excel/CSV

## Permissions

### Required Permissions
- **Reports Access**: REPORT_* permissions (any report permission)
- **Asset Report Data**: MY_ASSETS_VIEW permission

## User Flow

### Accessing Reports
1. User clicks "Reports" in navigation menu
2. System checks for REPORT_* permissions
3. If authorized, ReportsPage loads with Query Report (default)

### Switching to Asset Report
1. User clicks dropdown button
2. User selects "Asset Report"
3. Component switches to AssetReport
4. AssetReport fetches data from `/my-assets/report` API
5. Table displays with real-time asset data

### Exporting Asset Data
1. User views Asset Report
2. User clicks "Export to Excel" or "Export to CSV"
3. System generates file with all visible data
4. File downloads with date-stamped filename
5. Includes columns: Asset Name, Category, Center, Total Assigned, Working, Not Working, Last Audit, Next Audit, Audit Status, Last Updated, Updated By

## Technical Notes

### Frontend
- Uses axios for API calls
- Implements loading states during data fetch
- Error handling for failed API requests
- Empty state for no data
- Responsive table design
- xlsx library for Excel exports
- Blob API for CSV downloads

### Backend
- Efficient MongoDB aggregation
- Population of related collections
- Filtering by user's projects (multi-tenancy)
- Lean queries for better performance
- Error handling with appropriate status codes

## Testing Checklist

### Frontend Testing
- [x] Dropdown displays both report types
- [x] Switching between reports works smoothly
- [x] Asset Report loads data from API
- [x] Table displays all required columns
- [x] Status badges show correct colors
- [x] Export to Excel works
- [x] Export to CSV works
- [x] Refresh button reloads data
- [x] Loading state displays during fetch
- [x] Empty state shows when no data
- [x] No TypeScript errors

### Backend Testing
- [x] GET /my-assets/report endpoint accessible
- [x] Permission check works correctly
- [x] Data filtered by user's projects
- [x] All fields populated correctly
- [x] Center names enriched properly
- [x] Audit status calculated correctly
- [x] Error handling works
- [x] No TypeScript errors

### Integration Testing
- [ ] Navigate to /reports
- [ ] Switch to Asset Report
- [ ] Verify data loads correctly
- [ ] Test export to Excel
- [ ] Test export to CSV
- [ ] Verify all fields display correctly
- [ ] Check audit status badges
- [ ] Test with different user permissions

## Files Modified/Created

### Created
1. `frontend/src/pages/ReportsPage.tsx` - New unified reports page
2. `docs/REPORTS_DROPDOWN_IMPLEMENTATION.md` - This documentation

### Modified
1. `frontend/src/pages/AssetReport.tsx` - Updated to use real API
2. `frontend/src/App.tsx` - Updated routing
3. `backend/src/controllers/myAssetsController.ts` - Added getAssetReport
4. `backend/src/routes/myAssets.ts` - Added /report route

## Future Enhancements

### Potential Improvements
1. Add filters to Asset Report:
   - Filter by center
   - Filter by asset category
   - Filter by audit status
   - Filter by date range

2. Add search functionality:
   - Search by asset name
   - Search by center name

3. Add sorting:
   - Sort by any column
   - Multi-column sorting

4. Add pagination:
   - Server-side pagination for large datasets
   - Configurable page size

5. Add more export formats:
   - Export to PDF with charts
   - Export selected rows only

6. Add visualization:
   - Charts for asset status distribution
   - Graphs for audit completion rates
   - Center-wise asset breakdown

## Deployment Notes

### Backend Deployment
1. Ensure MongoDB collections are indexed:
   - CenterAssetMapping: projectId, centerId
   - Center: _id
   - Asset: _id
2. Verify permissions are configured in database
3. Test API endpoint after deployment

### Frontend Deployment
1. Build frontend with updated code
2. Verify routing works correctly
3. Test API connectivity
4. Verify export functionality works in production

## Rollback Plan

### If Issues Occur
1. **Frontend Issues**:
   - Revert App.tsx to use TicketListReport directly
   - Keep ReportsPage.tsx for future use
   
2. **Backend Issues**:
   - Remove /report route temporarily
   - Asset Report will show empty state
   
3. **Data Issues**:
   - Check MongoDB indexes
   - Verify data population
   - Check permission configurations

## Success Metrics

### Key Indicators
1. Report switching works without errors
2. Asset data loads within 2 seconds
3. Export functions work for files up to 10,000 rows
4. No console errors on report switching
5. Mobile responsive design works correctly

## Support

### Common Issues

#### Asset Report Shows No Data
- **Cause**: User has no projects assigned or no assets in database
- **Solution**: Assign projects to user, add assets to centers

#### Export Fails
- **Cause**: Browser blocks popup/download
- **Solution**: Allow popups/downloads for the domain

#### Slow Loading
- **Cause**: Large dataset without pagination
- **Solution**: Implement pagination or filtering

## Related Documentation
- [Master Tables Reference](MASTER_TABLES_REFERENCE.md)
- [My Assets Testing Checklist](MY_ASSETS_TESTING_CHECKLIST.md)
- [API Documentation](API.md)
- [Permissions System](BRD_ROLE_MODULE_ACCESS_MATRIX.md)
