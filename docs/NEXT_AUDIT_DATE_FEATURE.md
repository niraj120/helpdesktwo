# Next Audit Date Feature

## Overview
Added functionality for Super Admins to set next audit dates for asset mappings and for users to see countdown timers showing time until the next audit.

## Implementation

### Backend Changes

#### 1. CenterAssetMapping Model (`backend/src/models/CenterAssetMapping.ts`)
- Added `nextAuditDate?: Date` field to schema
- Optional field that stores when the next audit should be conducted

#### 2. Center Asset Controller (`backend/src/controllers/centerAssetController.ts`)
- Updated `updateCenterAssetMapping` to accept `nextAuditDate` in request body
- Handles date conversion and saves to database
- Returns updated mapping with nextAuditDate included

### Frontend Changes

#### 1. Admin - CenterAssetMapping Component (`frontend/src/components/CenterAssetMapping.tsx`)
- Added `nextAuditDate?: string` to `CenterAssetMapping` interface
- Updated `editFormData` state to include `nextAuditDate`
- Added datetime-local input field in edit dialog:
  ```tsx
  <input
    type="datetime-local"
    value={editFormData.nextAuditDate ? new Date(editFormData.nextAuditDate).toISOString().slice(0, 16) : ''}
    onChange={(e) => setEditFormData({ ...editFormData, nextAuditDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
  />
  ```
- Field includes helpful hint: "Set when the next audit should be conducted for this asset"

#### 2. Admin - CenterAssetMappingAccordion Component (`frontend/src/components/CenterAssetMappingAccordion.tsx`)
- Added `nextAuditDate?: string` to `CenterAssetMapping` interface
- Ready to support next audit date in accordion view

#### 3. User - MyAssetsView Component (`frontend/src/components/MyAssetsView.tsx`)
- Added `nextAuditDate?: Date` to `AssetMapping` interface
- Added `currentTime` state that updates every minute
- Added `getAuditCountdown()` function that:
  - Returns "Not scheduled" if no date set
  - Returns "Overdue" if past due date
  - Calculates and displays countdown: "Next audit in X days Y hours Z minutes"
  - Color codes based on urgency:
    - **Green** (>= 7 days): Safe zone
    - **Yellow** (3-7 days): Warning zone
    - **Red** (< 3 days): Critical zone
    - **Red** (overdue): Past due
    - **Gray** (not scheduled): No date set
- Added "Next Audit" column to asset table
- Countdown updates every minute automatically

## Features

### Super Admin Side
1. **Set Next Audit Date**: When editing an asset mapping, can set when the next audit should occur
2. **Date/Time Picker**: Native HTML5 datetime-local input for easy date selection
3. **Optional Field**: Can leave blank if no audit scheduled
4. **Update Anytime**: Can change the date whenever needed

### User Side (My Assets)
1. **Countdown Timer**: Shows time remaining until next audit
   - Format: "Next audit in 15 days, 3 hours, 45 minutes"
   - Simplifies display for longer periods (e.g., doesn't show minutes when days > 0)
2. **Color Coding**: Visual indication of urgency
   - Green badge: > 7 days (safe)
   - Yellow badge: 3-7 days (caution)
   - Red badge: < 3 days or overdue (urgent)
   - Gray badge: Not scheduled
3. **Real-Time Updates**: Timer updates every minute automatically
4. **Clear Status**: Shows "Not scheduled" or "Overdue" when applicable

## Usage

### Setting Next Audit Date
1. Navigate to Asset Management → Center Asset Mapping
2. Click "Edit" on any asset mapping
3. Scroll to "Next Audit Date" field
4. Select date and time using the picker
5. Click "Update"

### Viewing Countdown
1. Navigate to My Assets tab
2. View "Next Audit" column in the table
3. See countdown timer with color coding
4. Timer updates automatically every minute

## Technical Details

### Countdown Calculation
```typescript
const getAuditCountdown = (nextAuditDate?: Date) => {
  if (!nextAuditDate) return { text: 'Not scheduled', color: 'text-gray-500', bgColor: 'bg-gray-100' };
  
  const auditDate = new Date(nextAuditDate);
  const now = currentTime;
  const diffMs = auditDate.getTime() - now.getTime();
  
  if (diffMs <= 0) return { text: 'Overdue', color: 'text-red-700', bgColor: 'bg-red-100' };
  
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  // Format text and determine color based on urgency
  // ...
};
```

### Auto-Update Timer
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    setCurrentTime(new Date());
  }, 60000); // Update every minute
  
  return () => clearInterval(interval);
}, []);
```

## Testing Checklist

### Backend
- [ ] nextAuditDate field accepts Date values
- [ ] Field is optional (can be undefined)
- [ ] Date is properly saved to database
- [ ] Updated mapping returns nextAuditDate

### Frontend - Admin
- [ ] Date picker appears in edit dialog
- [ ] Can select date and time
- [ ] Can clear/remove date
- [ ] Date saves successfully
- [ ] Success message appears after update

### Frontend - User
- [ ] "Next Audit" column appears in table
- [ ] Shows "Not scheduled" when no date set
- [ ] Shows countdown when date is set
- [ ] Countdown format is correct (days, hours, minutes)
- [ ] Color coding works:
  - [ ] Green for > 7 days
  - [ ] Yellow for 3-7 days
  - [ ] Red for < 3 days
  - [ ] Red for overdue
- [ ] Timer updates every minute
- [ ] Shows "Overdue" for past dates

## Database Schema

### CenterAssetMapping Collection
```javascript
{
  projectId: ObjectId,
  assetId: ObjectId,
  totalAssigned: Number,
  assetUsed: Number,
  assetNotUsed: Number,
  workingAsset: Number,
  notWorkingAsset: Number,
  nextAuditDate: Date, // NEW FIELD - Optional
  photos: Array,
  lastUpdatedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

## API Endpoint

### PUT /api/center-assets/:id
**Body:**
```json
{
  "totalAssigned": 10,
  "assetUsed": 8,
  "assetNotUsed": 2,
  "workingAsset": 6,
  "nextAuditDate": "2024-03-15T10:00:00Z" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Asset mapping updated successfully",
  "data": {
    "_id": "...",
    "projectId": {...},
    "assetId": {...},
    "totalAssigned": 10,
    "workingAsset": 6,
    "notWorkingAsset": 2,
    "nextAuditDate": "2024-03-15T10:00:00.000Z",
    "lastUpdatedBy": {...},
    "updatedAt": "..."
  }
}
```

## Future Enhancements

1. **Email Notifications**: Send reminders when audit date approaches
2. **Bulk Date Setting**: Set audit dates for multiple assets at once
3. **Recurring Audits**: Automatically schedule next audit after completion
4. **Audit History**: Track when audits were scheduled vs completed
5. **Calendar View**: See all upcoming audits in a calendar format
6. **Custom Reminder Thresholds**: Let admins set when warnings appear

## Benefits

1. **Proactive Management**: Admins can schedule audits in advance
2. **User Awareness**: Users always know when next audit is due
3. **Visual Indicators**: Color coding makes urgent audits obvious
4. **No Manual Tracking**: System automatically tracks time
5. **Improved Compliance**: Ensures regular asset audits happen on schedule
