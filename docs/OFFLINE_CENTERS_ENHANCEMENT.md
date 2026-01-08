# Offline Support Centers Enhancement

## Summary
Enhanced the offline support centers feature with improved form inputs and additional functionality.

## Changes Made

### 1. Backend Model Updates (`backend/src/models/Project.ts`)
- Added `features: [{ type: String }]` - Array to store center amenities/features
- Added `mapLink: { type: String }` - Google Maps link for directions

### 2. Frontend Form Updates (`frontend/src/components/AddProjectForm.tsx`)

#### New Dropdown Fields
- **City Dropdown**: Replaced text input with dropdown populated from master data
  - Fetches from: `http://localhost:3003/api/master-data/category/city`
  - Shows: "Select City" placeholder
  
- **State Dropdown**: Replaced text input with dropdown populated from master data
  - Fetches from: `http://localhost:3003/api/master-data/category/region`
  - Shows: "Select State" placeholder

#### New Feature Management Section
- **Add Features Button**: Green "+ Add Feature" button to add amenities
- **Feature Input Fields**: Dynamic list of text inputs for each feature
  - Placeholder: "e.g., WiFi, Parking, Wheelchair Access"
  - Individual remove buttons for each feature
  - Shows empty state message when no features added

#### New Google Maps Link Field
- **Map Link Input**: Full-width text field
  - Placeholder: "Google Maps Link (for directions)"
  - Enables custom Google Maps URL for better directions

### 3. Student Portal Updates (`frontend/src/pages/StudentPortal.tsx`)

#### Interface Updates
- Added `features?: string[]` to OfflineCenter interface
- Added `mapLink?: string` to OfflineCenter interface

#### Display Enhancements
- **Features Display**: Shows available features as blue badge pills
  - Only displays when features exist
  - Styled with: `bg-blue-100 text-blue-800` rounded pills
  - Wrapped in bordered section with "Available Features" label

- **Get Directions Button**: Enhanced to use mapLink
  - Priority: `center.mapLink` → `center.googleMapLink` → lat/long → address search
  - Opens in new tab with custom gradient styling

## Data Structure

### Offline Center Object
```typescript
{
  centerName: string;
  address: string;
  city: string;           // Dropdown selection
  state: string;          // Dropdown selection
  pincode: string;
  phone: string;
  email: string;
  workingHours: string;
  latitude?: number;
  longitude?: number;
  features?: string[];    // NEW: Array of feature strings
  mapLink?: string;       // NEW: Google Maps URL
}
```

## User Experience Improvements

### Admin Portal (Add/Edit Project)
1. **Consistent Data Entry**: Dropdowns ensure standardized city/state values
2. **Feature Management**: Easy addition and removal of center amenities
3. **Custom Directions**: Admin can provide exact Google Maps link
4. **Visual Feedback**: Empty state messages guide users

### Student Portal
1. **Feature Visibility**: Students can see available amenities at each center
2. **Accurate Directions**: Custom map links provide precise navigation
3. **Professional Display**: Features shown as styled badge pills
4. **Better UX**: Clear visual hierarchy with sections

## Master Data Requirements

Ensure the following master data categories are populated:
- **Category: region** - List of states/regions
- **Category: city** - List of cities

Each item should have:
- `key`: Unique identifier
- `value`: Display name
- `isActive`: true

## Testing Checklist

- [ ] City dropdown populates from master data
- [ ] State dropdown populates from master data
- [ ] Can add multiple features to a center
- [ ] Can remove individual features
- [ ] Features display on student portal
- [ ] Map link field saves correctly
- [ ] Get Directions button uses custom map link
- [ ] Features show as blue badge pills
- [ ] Empty state shows when no features added

## Files Modified

1. `backend/src/models/Project.ts` - Added features and mapLink fields
2. `frontend/src/components/AddProjectForm.tsx` - Enhanced form with dropdowns and features
3. `frontend/src/pages/StudentPortal.tsx` - Display features and use map link

## Future Enhancements

- Add feature icons/emojis for better visual representation
- Enable feature filtering in student portal search
- Add predefined feature templates (e.g., "Computer Lab", "Library")
- Support for multiple languages in feature names
