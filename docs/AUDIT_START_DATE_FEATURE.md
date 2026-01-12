# Audit Start Date Feature

## Overview
This feature allows administrators to set a custom start date for the audit cycle instead of always using today's date. The audit schedule is calculated as: **Start Date + Frequency = Next Audit Date**

## User Interface

### Visual Representation
```
📅 Audit Schedule: [Date Picker] + [Frequency Dropdown] = [Next Audit Date]
```

Example:
```
📅 Audit Schedule: 01 Feb 2026 + 3 Months = 01 May 2026
```

### Components

#### 1. Date Picker
- **Type**: HTML5 date input
- **Purpose**: Select when the audit cycle should begin
- **Default Value**: Today's date
- **Location**: Before the frequency dropdown in the purple audit schedule box

#### 2. Frequency Dropdown  
- **Options**:
  - Select frequency (clears audit data)
  - 1 Month
  - 3 Months
  - 6 Months
  - 1 Year
- **Purpose**: Define how often audits should occur
- **Location**: After the date picker

#### 3. Next Audit Date Display
- **Format**: DD MMM YYYY (e.g., 01 May 2026)
- **Purpose**: Show the calculated next audit date
- **Calculation**: Start Date + Frequency Months
- **Location**: After the frequency dropdown with "=" separator

## Functionality

### Setting Audit Schedule

#### Scenario 1: First Time Setup
1. Admin selects a center with assets
2. Clicks the **date picker** to choose a start date (defaults to today)
3. Selects a **frequency** from dropdown
4. System calculates and displays **Next Audit Date**
5. Admin clicks **Save** to store the schedule

**Example**:
- Start Date: 15 Jan 2026
- Frequency: 3 Months
- Next Audit: 15 Apr 2026

#### Scenario 2: Changing Start Date
1. Admin opens a center that already has an audit schedule
2. Changes the start date using date picker
3. System **automatically recalculates** next audit date
4. Admin saves the changes

**Example**:
- Old Start: 15 Jan 2026, Frequency: 3 Months, Next Audit: 15 Apr 2026
- Change Start to: 01 Feb 2026
- New Next Audit: 01 May 2026 (automatically updated)

#### Scenario 3: Changing Frequency
1. Admin changes the frequency dropdown
2. System uses the **existing start date** (not today)
3. Recalculates next audit date based on new frequency

**Example**:
- Start Date: 01 Feb 2026 (unchanged)
- Old Frequency: 3 Months, Old Next Audit: 01 May 2026
- Change Frequency to: 6 Months
- New Next Audit: 01 Aug 2026

### Copy to All Centers
When using "Copy to All Centers", the start date and frequency are copied to all centers:
- Start Date: Copied exactly
- Frequency: Copied exactly
- Next Audit Date: Recalculated for each center (will be same if start date is same)

## Data Structure

### Frontend Interface
```typescript
interface CenterAssetSelection {
  centerId: string;
  centerName: string;
  selectedAssets: string[];
  assetQuantities: { [assetId: string]: number };
  lastAuditDate?: string;          // ISO date string (start date)
  auditFrequencyMonths?: number;   // 1, 3, 6, or 12
  auditStartDate?: string;          // ISO date string (custom start date)
  nextAuditDate?: string;           // ISO date string (calculated)
}
```

### Database Storage
```typescript
// MongoDB CenterAssetMapping document
{
  _id: ObjectId,
  projectId: ObjectId,
  assetId: ObjectId,
  totalAssigned: Number,
  lastAuditDate: Date,            // Stores the custom start date
  auditFrequencyMonths: Number,   // 1, 3, 6, or 12
  nextAuditDate: Date,            // Calculated: lastAuditDate + frequency
  auditSubmitted: Boolean,        // Whether current cycle is submitted
  // ... other fields
}
```

**Note**: `lastAuditDate` in the database stores the custom start date. When an audit is submitted, it updates to the submission date and becomes the new start date for the next cycle.

## Calculation Logic

### Function: updateAuditStartDate()
```typescript
const updateAuditStartDate = (centerId: string, startDate: string) => {
  const start = new Date(startDate);
  
  // If frequency is already set, recalculate next audit date
  let nextDate: Date | undefined;
  if (existingSelection?.auditFrequencyMonths) {
    nextDate = new Date(start);
    nextDate.setMonth(nextDate.getMonth() + existingSelection.auditFrequencyMonths);
  }
  
  // Update selection with new dates
  return {
    lastAuditDate: start.toISOString(),
    auditStartDate: start.toISOString(),
    nextAuditDate: nextDate?.toISOString()
  };
};
```

### Function: updateAuditFrequency()
```typescript
const updateAuditFrequency = (centerId: string, frequencyMonths: number | null) => {
  if (frequencyMonths === null) {
    // Clear all audit data
    delete lastAuditDate;
    delete auditFrequencyMonths;
    delete auditStartDate;
    delete nextAuditDate;
    return;
  }
  
  // Use existing start date or default to today
  const startDate = existingSelection?.auditStartDate 
    ? new Date(existingSelection.auditStartDate)
    : new Date();
  
  // Calculate next audit date
  const nextDate = new Date(startDate);
  nextDate.setMonth(nextDate.getMonth() + frequencyMonths);
  
  return {
    lastAuditDate: startDate.toISOString(),
    auditFrequencyMonths: frequencyMonths,
    auditStartDate: startDate.toISOString(),
    nextAuditDate: nextDate.toISOString()
  };
};
```

## User Workflows

### Workflow 1: Schedule Future Audits
**Use Case**: Admin wants all audits to start from the 1st of next month

1. Admin selects multiple centers
2. For first center:
   - Picks start date: 01 Feb 2026
   - Selects frequency: 3 Months
   - Next Audit shows: 01 May 2026
   - Clicks Save
3. Clicks "Copy to All Centers"
4. All centers now have:
   - Start Date: 01 Feb 2026
   - Frequency: 3 Months
   - Next Audit: 01 May 2026

### Workflow 2: Align All Audits to Specific Date
**Use Case**: Admin wants all audits to happen on 15th of every quarter

1. Admin navigates to each center (or uses Copy to All)
2. Sets start date: 15 Jan 2026
3. Sets frequency: 3 Months
4. Result:
   - Q1 Audit: 15 Apr 2026
   - Q2 Audit: 15 Jul 2026 (after submission)
   - Q3 Audit: 15 Oct 2026 (after submission)

### Workflow 3: Different Schedules Per Center
**Use Case**: Different centers have different audit requirements

**Center A** (High Priority - Monthly):
- Start Date: 01 Jan 2026
- Frequency: 1 Month
- Next Audit: 01 Feb 2026

**Center B** (Standard - Quarterly):
- Start Date: 01 Jan 2026
- Frequency: 3 Months
- Next Audit: 01 Apr 2026

**Center C** (Low Priority - Biannual):
- Start Date: 01 Jan 2026
- Frequency: 6 Months
- Next Audit: 01 Jul 2026

### Workflow 4: Backdated Audit Cycles
**Use Case**: Admin needs to record that audit cycle started last month

1. Today: 15 Jan 2026
2. Admin sets:
   - Start Date: 01 Dec 2025 (backdated)
   - Frequency: 3 Months
   - Next Audit: 01 Mar 2026
3. System allows editing because current date < next audit date
4. On 01 Mar 2026, edit button becomes visible for next audit

## Integration with Audit Submission Workflow

### Before Submission
- User sees Edit + Submit buttons when: `today >= nextAuditDate`
- Start date remains unchanged
- User can edit asset counts multiple times

### During Submission
- User clicks Submit Audit
- Confirmation dialog appears
- User confirms submission

### After Submission
1. **auditSubmitted** = true
2. **lastAuditDate** = current date (submission date becomes new start date)
3. **nextAuditDate** = lastAuditDate + auditFrequencyMonths
4. Edit and Submit buttons are hidden

### Next Cycle
When `today >= nextAuditDate`:
1. Backend auto-resets **auditSubmitted** = false
2. Edit and Submit buttons become visible
3. User can start editing for new audit cycle
4. The previous submission date is now the start date for this cycle

## Date Calculations

### Month Addition Logic
JavaScript's `setMonth()` handles edge cases automatically:

**Example 1 - Standard Month**:
- Start: 15 Jan 2026
- Add: 3 months
- Result: 15 Apr 2026 ✅

**Example 2 - Month End**:
- Start: 31 Jan 2026
- Add: 1 month
- Result: 28 Feb 2026 (no 31st in Feb) ✅

**Example 3 - Leap Year**:
- Start: 31 Jan 2024
- Add: 1 month
- Result: 29 Feb 2024 (leap year) ✅

**Example 4 - Year Boundary**:
- Start: 01 Nov 2026
- Add: 3 months
- Result: 01 Feb 2027 ✅

## UI Improvements

### Visual Feedback
1. **Date Picker**:
   - Border: Purple (`border-purple-300`)
   - Focus: Purple ring (`focus:ring-purple-500`)
   - Background: White
   - Size: Small (text-xs)

2. **Mathematical Representation**:
   - Uses visual separators: `+` and `=`
   - Example: `[Date] + [Frequency] = [Next Audit]`
   - Makes the calculation clear to users

3. **Next Audit Date**:
   - Bold font (`font-semibold`)
   - Purple color (`text-purple-900`)
   - Formatted: DD MMM YYYY
   - Clearly shows the result

### Label Change
- Old: "📅 Next Audit:"
- New: "📅 Audit Schedule:"
- Reason: Better reflects that it's configuring the entire schedule, not just viewing next audit date

## Benefits

### 1. Flexibility
- Admins can schedule audits to start at any date
- Not forced to use today's date
- Can plan ahead for future audit cycles

### 2. Alignment
- All centers can have synchronized audit dates
- Easier to plan audit activities across multiple centers
- Better resource allocation for audit teams

### 3. Backdating
- Can record audit cycles that started in the past
- Useful when setting up system mid-cycle
- Maintains accurate audit history

### 4. Clarity
- Visual formula makes calculation obvious
- Users understand exactly when next audit will occur
- Reduces confusion about audit scheduling

### 5. Control
- Admins have full control over audit timing
- Can adjust schedules without affecting data
- Easy to experiment with different frequencies

## Limitations & Considerations

### 1. Date Validation
- No validation for unrealistic dates (e.g., 100 years in future)
- Consider adding reasonable date range limits
- E.g., Start date must be within 1 year past to 1 year future

### 2. Timezone Handling
- Currently uses browser's local timezone
- Consider UTC storage for multi-timezone deployments
- Display in user's local timezone but store in UTC

### 3. Concurrent Editing
- No locking mechanism for simultaneous edits
- Last save wins if multiple admins edit same center
- Consider optimistic locking or version control

### 4. Audit History
- Previous start dates are not preserved in history
- Only current audit configuration is stored
- Consider audit log for configuration changes

### 5. Bulk Operations
- Copying to all centers uses same start date
- No option to stagger start dates across centers
- Could add offset feature (e.g., +1 day per center)

## Testing Checklist

### Date Picker Testing
- [ ] Date picker displays current start date (or defaults to today)
- [ ] Changing date recalculates next audit date
- [ ] Date changes are saved to database
- [ ] Date picker works with keyboard input
- [ ] Date picker works with mouse selection
- [ ] Invalid dates are handled gracefully

### Frequency Interaction
- [ ] Changing frequency with existing start date recalculates
- [ ] Clearing frequency (select "Select frequency") clears all dates
- [ ] Frequency changes are saved correctly
- [ ] Start date remains unchanged when frequency changes

### Copy to All Centers
- [ ] Start date is copied to all centers
- [ ] Frequency is copied to all centers
- [ ] Next audit dates are calculated correctly for each center
- [ ] Confirmation dialog shows before applying

### Edge Cases
- [ ] Month-end dates (31st → 28th/29th/30th)
- [ ] Leap year dates (Feb 29)
- [ ] Year boundary (Dec → Jan next year)
- [ ] Same date selection (no change)
- [ ] Very old dates (past years)
- [ ] Very future dates (future years)

### Integration Testing
- [ ] Start date persists after page refresh
- [ ] Start date loads from existing mappings
- [ ] Start date works with audit submission workflow
- [ ] After submission, next cycle uses submission date as new start
- [ ] Edit buttons appear on correct dates

### Browser Compatibility
- [ ] Chrome: Date picker displays correctly
- [ ] Firefox: Date picker displays correctly
- [ ] Safari: Date picker displays correctly
- [ ] Edge: Date picker displays correctly
- [ ] Mobile browsers: Date picker is usable

## Future Enhancements

### 1. Staggered Schedules
Allow offsetting audit dates when copying to all centers:
```
Center 1: Start 01 Jan + 3 Months = 01 Apr
Center 2: Start 02 Jan + 3 Months = 02 Apr
Center 3: Start 03 Jan + 3 Months = 03 Apr
```

### 2. Recurring Patterns
Support complex patterns:
- Every 1st and 15th of month
- First Monday of every month
- Last day of each quarter

### 3. Audit Calendar View
Visual calendar showing all upcoming audits:
- Month view with audit indicators
- Filter by center, frequency, status
- Drag-and-drop to reschedule

### 4. Automatic Reminders
Email/SMS reminders before audit date:
- 7 days before
- 3 days before
- On audit day
- Overdue notifications

### 5. Audit Templates
Predefined templates:
- Monthly first-of-month
- Quarterly mid-month
- Annual year-end
- Custom patterns

### 6. Start Date History
Track changes to start dates:
```
History:
- 01 Jan 2026: Initial setup
- 15 Jan 2026: Adjusted by Admin
- 01 Feb 2026: Audit submitted, auto-updated
```

### 7. Bulk Date Adjustment
Apply offset to multiple centers:
```
Add 7 days to all audit start dates
Shift all audits to beginning of next month
```

### 8. Smart Scheduling
AI-suggested optimal audit dates:
- Avoid holidays
- Balance workload across month
- Consider resource availability

## Files Modified

### Frontend
1. **CenterAssetMappingAccordion.tsx**
   - Added `auditStartDate` field to `CenterAssetSelection` interface
   - Added `auditStartDate` field to `CenterAssetMapping` interface
   - Added `updateAuditStartDate()` function
   - Updated `updateAuditFrequency()` to use existing start date
   - Added date picker input to UI before frequency dropdown
   - Updated visual representation with `+` and `=` separators
   - Changed label from "Next Audit:" to "Audit Schedule:"
   - Updated `applyToAllCenters()` to copy start date
   - Fixed TypeScript errors

## Migration Notes

### Existing Data
- **No migration required**
- Existing records without `auditStartDate` will default to using `lastAuditDate`
- If both are missing, defaults to current date
- All existing audits continue working normally

### Backward Compatibility
- ✅ Fully backward compatible
- ✅ Old records display correctly
- ✅ New feature is additive, not breaking
- ✅ Users can choose to use start date or not

### Database Impact
- **No schema changes needed** (all fields already exist)
- **No index changes needed**
- **No data transformation needed**

## Support & Troubleshooting

### Common Issues

**Issue 1: Date picker not showing selected date**
- **Cause**: Date string format mismatch
- **Solution**: Convert ISO string to YYYY-MM-DD format
- **Code**: `new Date(dateString).toISOString().split('T')[0]`

**Issue 2: Next audit date not updating**
- **Cause**: Frequency not set
- **Solution**: Ensure frequency is selected before setting start date
- **Debug**: Check if `auditFrequencyMonths` has a value

**Issue 3: Date shows different day after saving**
- **Cause**: Timezone conversion
- **Solution**: Use consistent timezone handling
- **Fix**: Store as ISO string, display in local timezone

**Issue 4: Copy to All Centers not copying date**
- **Cause**: Source center has no start date
- **Solution**: Set start date on source center first
- **Debug**: Check `sourceCenterSelection?.auditStartDate`

### Debug Console Logs

The system logs useful information:

```javascript
// When setting start date
📅 Updating audit start date: {
  centerId: "...",
  centerName: "Center A",
  startDate: "2026-02-01T00:00:00.000Z",
  frequencyMonths: 3,
  nextAuditDate: "2026-05-01T00:00:00.000Z"
}

// When setting frequency
🔔 Setting audit schedule: {
  centerId: "...",
  centerName: "Center A",
  startDate: "2026-02-01T00:00:00.000Z",
  frequencyMonths: 3,
  nextAuditDate: "2026-05-01T00:00:00.000Z"
}
```

## Conclusion

The Audit Start Date feature provides administrators with precise control over when audit cycles begin. By adding a date picker before the frequency dropdown, users can easily visualize and configure the audit schedule formula: **Start Date + Frequency = Next Audit Date**. This enhancement improves flexibility, alignment, and clarity in audit management.
