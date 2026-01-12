# Audit Submission Workflow Implementation

## Overview
This document describes the audit submission workflow where users can only edit assets on scheduled audit dates. Once submitted, editing is locked until the next audit cycle.

## Workflow Logic

### 1. Edit Availability
- **Edit button is visible only when:**
  - Current date >= Next Audit Date
  - AND Audit has not been submitted (`auditSubmitted = false`)

- **Edit button is hidden when:**
  - Current date < Next Audit Date (audit not due yet)
  - OR Audit has been submitted (`auditSubmitted = true`)

### 2. Multiple Edits Before Submission
- Users can edit and save asset counts multiple times
- Each save updates the asset counts in the database
- Audit is NOT submitted until the "Submit Audit" button is clicked

### 3. Submit Audit Process
1. User clicks "Submit Audit" button
2. Confirmation dialog appears with message: 
   - "Are you sure you want to submit? Post that you can't make any changes until the next audit date."
3. Two options:
   - **No, Continue Editing**: Closes dialog, allows continued editing
   - **Yes, Submit Audit**: Submits the audit

### 4. After Submission
- `auditSubmitted` is set to `true`
- `lastAuditDate` is set to current date
- `nextAuditDate` is calculated based on `auditFrequencyMonths`:
  - Example: If frequency is 3 months, next audit = today + 3 months
- Edit and Submit buttons are hidden
- Message displayed: "Audit submitted. Next edit on [date]"

### 5. Next Audit Cycle
- When current date >= next audit date:
  - Backend automatically resets `auditSubmitted` to `false`
  - Edit and Submit buttons become visible again
  - User can start editing for the new audit cycle

## Database Schema Changes

### CenterAssetMapping Model
Added field:
```typescript
auditSubmitted: {
  type: Boolean,
  default: false,
  required: false
}
```

Existing audit fields:
- `lastAuditDate`: Date - When audit frequency was set or last submitted
- `auditFrequencyMonths`: Number - 1, 3, 6, or 12 months
- `nextAuditDate`: Date - Calculated next audit date

## API Endpoints

### 1. GET /api/my-assets
**Purpose**: Fetch all assets for the user

**New Response Fields**:
- `canEdit`: Boolean - Calculated field indicating if editing is allowed
- `auditSubmitted`: Boolean - Whether current audit cycle is submitted

**Backend Logic**:
```typescript
// Check if audit date has arrived
const today = new Date();
const nextAudit = new Date(mapping.nextAuditDate);

// Auto-reset auditSubmitted when audit date arrives
if (today >= nextAudit && mapping.auditSubmitted) {
  mapping.auditSubmitted = false;
  mapping.save();
}

// Calculate canEdit flag
canEdit = today >= nextAudit && !mapping.auditSubmitted;
```

### 2. POST /api/my-assets/:id/submit-audit
**Purpose**: Submit audit and lock editing until next cycle

**Authentication**: Required (Bearer token)

**Permissions**: MY_ASSETS_VIEW

**Request**: No body required

**Response**:
```json
{
  "success": true,
  "message": "Audit submitted successfully",
  "data": {
    "_id": "...",
    "auditSubmitted": true,
    "lastAuditDate": "2024-01-15T00:00:00.000Z",
    "nextAuditDate": "2024-04-15T00:00:00.000Z"
  }
}
```

**Backend Logic**:
1. Validate user authentication
2. Find asset mapping by ID
3. Verify user has access to the center
4. Set `auditSubmitted = true`
5. Update `lastAuditDate` to current date
6. Calculate `nextAuditDate` using `auditFrequencyMonths`
7. Save and return updated mapping

## Frontend Changes

### MyAssetsView Component

#### New State Variables
```typescript
const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
const [assetToSubmit, setAssetToSubmit] = useState<string | null>(null);
```

#### New Functions
1. **handleSubmitAudit(mappingId)**
   - Shows confirmation dialog
   - Sets asset to submit

2. **confirmSubmitAudit()**
   - Calls POST /api/my-assets/:id/submit-audit
   - Updates UI on success
   - Shows success message

3. **cancelSubmitAudit()**
   - Closes confirmation dialog
   - Allows continued editing

#### UI Changes
**Actions Column**:
- When `canEdit = true`:
  - Show "Edit" button
  - Show "Submit Audit" button
  - Show "History" button

- When `canEdit = false` and `auditSubmitted = true`:
  - Show message: "Audit submitted. Next edit on [date]"
  - Show "History" button only

- When `canEdit = false` and `auditSubmitted = false`:
  - Show message: "Edit available on [date]"
  - Show "History" button only

**Confirmation Modal**:
```tsx
<div className="modal">
  <h3>Confirm Audit Submission</h3>
  <p>Are you sure you want to submit? Post that you can't make any changes until the next audit date.</p>
  <button>No, Continue Editing</button>
  <button>Yes, Submit Audit</button>
</div>
```

## User Flow Example

### Scenario: 3-Month Audit Frequency

**Day 1 (Jan 1, 2024)**:
- Admin sets audit frequency to 3 months
- `lastAuditDate` = Jan 1, 2024
- `nextAuditDate` = Apr 1, 2024
- `auditSubmitted` = false

**Jan 15, 2024** (User tries to edit):
- Current date < Next Audit Date
- Edit button is HIDDEN
- Message: "Edit available on Apr 1, 2024"

**Apr 1, 2024** (Audit date arrives):
- Backend auto-resets `auditSubmitted` to false
- Current date >= Next Audit Date
- Edit button is VISIBLE
- Submit Audit button is VISIBLE

**Apr 5, 2024** (User edits multiple times):
- User clicks Edit → Updates working/not working assets → Clicks Save
- Repeats 3 times with different values
- All saves are successful
- Audit is NOT submitted yet

**Apr 5, 2024** (User submits audit):
1. User clicks "Submit Audit"
2. Confirmation dialog appears
3. User clicks "Yes, Submit Audit"
4. Backend:
   - Sets `auditSubmitted = true`
   - Sets `lastAuditDate = Apr 5, 2024`
   - Calculates `nextAuditDate = Jul 5, 2024`
5. Edit and Submit buttons HIDDEN
6. Message: "Audit submitted. Next edit on Jul 5, 2024"

**Jun 15, 2024** (User tries to edit):
- Current date < Next Audit Date
- `auditSubmitted = true`
- Edit button is HIDDEN
- Message: "Audit submitted. Next edit on Jul 5, 2024"

**Jul 5, 2024** (Next audit cycle):
- Backend detects: current date >= nextAuditDate AND auditSubmitted = true
- Auto-resets `auditSubmitted = false`
- Edit and Submit buttons become VISIBLE
- User can start new audit cycle

## Testing Checklist

### Backend Testing
- [ ] Submit audit sets `auditSubmitted = true`
- [ ] Submit audit updates `lastAuditDate` to current date
- [ ] Submit audit calculates correct `nextAuditDate` based on frequency
- [ ] GET /my-assets auto-resets `auditSubmitted` when audit date arrives
- [ ] GET /my-assets returns correct `canEdit` flag
- [ ] Submit audit validates user authentication
- [ ] Submit audit validates user has access to center
- [ ] Submit audit returns proper error messages

### Frontend Testing
- [ ] Edit button hidden before audit date
- [ ] Edit button visible on/after audit date
- [ ] Submit Audit button visible when editing is allowed
- [ ] Confirmation dialog shows on submit
- [ ] "No" button closes dialog and allows continued editing
- [ ] "Yes" button submits audit successfully
- [ ] Success message appears after submission
- [ ] Edit/Submit buttons hidden after submission
- [ ] Correct status message shown based on audit state
- [ ] History button always visible
- [ ] Next audit date displays correctly
- [ ] Countdown timer updates properly

### Edge Cases
- [ ] Asset with no audit frequency set (no nextAuditDate)
- [ ] Multiple users editing same asset (concurrent edits)
- [ ] Network failure during submission
- [ ] User logs out during edit
- [ ] Backend restart while editing
- [ ] Date changes at midnight (timezone handling)
- [ ] Leap year date calculations
- [ ] Month-end date calculations (Jan 31 + 1 month = Feb 28/29)

## Visual Indicators

### Audit Status Badges (Next Audit column)
- **Overdue** (past due): Red badge
- **Due Today**: Yellow badge
- **Due Soon** (within 7 days): Orange badge
- **Upcoming**: Blue badge
- **Not Scheduled**: Gray badge

### Action Column Messages
- Audit not due: "Edit available on [date]" (gray italic)
- Audit submitted: "Audit submitted. Next edit on [date]" (gray italic)
- Audit editable: Edit + Submit Audit buttons visible

## Security Considerations

1. **Authentication**: All endpoints require valid JWT token
2. **Authorization**: Users can only submit audits for their assigned centers
3. **Validation**: Backend validates user access before submission
4. **Audit Trail**: All edits and submissions logged in audit logs
5. **Rate Limiting**: API endpoints protected against abuse
6. **CSRF Protection**: Credentials included in requests

## Performance Optimization

1. **Auto-reset Logic**: Runs only during GET request, no background jobs needed
2. **Batch Processing**: Frontend fetches all assets in single request
3. **Conditional Rendering**: Edit buttons rendered conditionally based on `canEdit` flag
4. **Minimal Re-renders**: State updates only affect specific components
5. **Efficient Queries**: MongoDB queries optimized with proper indexes

## Future Enhancements

1. **Notifications**: Email/SMS reminders before audit date
2. **Bulk Submit**: Submit multiple audits at once
3. **Audit Comments**: Add remarks when submitting audit
4. **Photo Upload**: Attach photos during audit
5. **Offline Mode**: Allow editing offline, sync when online
6. **Audit Templates**: Pre-fill common audit patterns
7. **Custom Frequencies**: Allow custom day intervals (not just months)
8. **Audit Dashboard**: Analytics and reports for completed audits
9. **Reminder Badges**: Visual indicator days before audit due
10. **Mobile App**: Dedicated mobile interface for audits

## Files Modified

### Backend
1. `backend/src/models/CenterAssetMapping.ts`
   - Added `auditSubmitted` field to schema

2. `backend/src/controllers/myAssetsController.ts`
   - Updated `getMyAssets()` to calculate `canEdit` and auto-reset
   - Added `submitAudit()` function

3. `backend/src/routes/myAssets.ts`
   - Added POST /api/my-assets/:id/submit-audit route

### Frontend
1. `frontend/src/components/MyAssetsView.tsx`
   - Updated interface with `canEdit` and `auditSubmitted` fields
   - Added confirmation modal state
   - Added `handleSubmitAudit()`, `confirmSubmitAudit()`, `cancelSubmitAudit()` functions
   - Updated actions column with conditional rendering
   - Added confirmation modal component

## Deployment Notes

1. **Database Migration**: No migration needed, `auditSubmitted` has default value
2. **Backward Compatibility**: Existing assets work without issues
3. **Testing**: Test thoroughly before deploying to production
4. **Rollback Plan**: Can quickly revert changes if issues arise
5. **Monitoring**: Monitor API response times after deployment
6. **User Training**: Train users on new workflow before rollout

## Support & Troubleshooting

### Common Issues

**Issue**: Edit button not showing on audit date
- **Solution**: Check backend logs, verify `canEdit` calculation
- **Debug**: Console log `asset.canEdit`, `asset.nextAuditDate`, `asset.auditSubmitted`

**Issue**: Submit button not working
- **Solution**: Check network tab for API errors
- **Debug**: Verify authentication token is valid

**Issue**: Audit not resetting after date
- **Solution**: Backend auto-resets on GET request
- **Debug**: Refresh the page to trigger GET /my-assets

**Issue**: Wrong next audit date calculated
- **Solution**: Verify `auditFrequencyMonths` is set correctly
- **Debug**: Check database value for the mapping

### Logs to Monitor
- Backend console: "✅ Audit submitted. Next audit date: [date]"
- Backend console: Auto-reset messages when audit date arrives
- Frontend console: API response errors
- Network tab: API request/response payloads

## Contact
For issues or questions, contact the development team.
