# Testing User Stories - SAC Helpdesk (Super Admin)

## Document Overview
**Purpose:** Test cases for Super Admin based on actual frontend screens  
**Target Audience:** QA Team  
**Role Focus:** Super Admin perspective  
**Last Updated:** January 19, 2026

---

## Table of Contents
1. [Asset Management Module](#1-asset-management-module)
2. [Integration Module](#2-integration-module)
3. [Audit Logs Module](#3-audit-logs-module)
4. [Feedback Module](#4-feedback-module)

---

## 1. Asset Management Module

### 1.1 Master Assets Screen (localhost:3001/assets)

#### User Story 1.1.1: View Master Assets
**As a** Super Admin  
**I want to** view all master assets for a project  
**So that** I can see the asset inventory

**Screen Elements Visible:**
- Page Title: "Asset Management"
- Project Selector dropdown
- Search box (Search assets...)
- Filter dropdown (All/Active/Inactive)
- Total count display (e.g., "Total: 3 asset(s)")
- Table columns: Asset Name, Category, Description, Predefined Count, Unit, Status, Created By, Actions
- Refresh button
- Add Asset button (top right, blue gradient)

**Test Scenarios:**
```
✓ Open localhost:3001/assets
✓ Select project from dropdown (e.g., "MH CET Extension Centres")
✓ Verify asset table loads
✓ Check table shows: Chair (Furniture, 50 units), Table (Furniture, 15 units), AC (Electronics, 10 units)
✓ Verify "Active" toggle buttons are green
✓ Verify "Created By" shows "Niraj Mishra"
✓ Verify blue Edit icon visible
✓ Verify red Delete icon visible
✓ Check total count matches displayed assets
```

**Test Data:**
```
Project: MH CET Extension Centres (MH CET उमेदवार)
Expected Assets:
1. Chair - Furniture - 50 units - Active - Niraj Mishra
2. Table - Furniture - 15 units - Active - Niraj Mishra  
3. AC - Electronics - 10 units - Active - Niraj Mishra
```

---

#### User Story 1.1.2: Search and Filter Assets
**As a** Super Admin  
**I want to** search and filter assets  
**So that** I can quickly find specific assets

**Test Scenarios:**
```
✓ Type "Chair" in search box
✓ Verify only Chair asset displayed
✓ Clear search
✓ Select "Active" from filter dropdown
✓ Verify all 3 assets shown (all are active)
✓ Select "Inactive" from filter
✓ Verify "No assets found" or empty table
✓ Select "All" from filter
✓ Verify all assets shown again
```

---

#### User Story 1.1.3: Add New Asset
**As a** Super Admin  
**I want to** create a new master asset  
**So that** it can be mapped to centers

**Test Scenarios:**
```
✓ Click "Add Asset" button (blue, top right)
✓ Verify modal/form opens
✓ Fill Asset Name: "Projector"
✓ Select Category: "Electronics" from dropdown
✓ Enter Description: "HD Projector for classrooms"
✓ Enter Predefined Count: 5
✓ Enter Unit: "units"
✓ Click Submit/Create button
✓ Verify success message appears
✓ Verify modal closes
✓ Verify "Projector" appears in asset table
✓ Verify total count increases to 4
```

---

#### User Story 1.1.4: Edit Existing Asset
**As a** Super Admin  
**I want to** edit an existing asset  
**So that** I can update asset details

**Test Scenarios:**
```
✓ Click blue Edit icon for "Chair" asset
✓ Verify edit modal opens with pre-filled data
✓ Modify Predefined Count from 50 to 60
✓ Click Update/Save button
✓ Verify success message
✓ Verify Chair now shows 60 units in table
✓ Verify "Updated By" or timestamp updated (if shown)
```

---

#### User Story 1.1.5: Delete Asset
**As a** Super Admin  
**I want to** delete an asset  
**So that** I can remove unused assets

**Test Scenarios:**
```
✓ Click red Delete icon for "Table" asset
✓ Verify confirmation dialog appears
✓ Click "Cancel" - verify asset not deleted
✓ Click Delete icon again
✓ Click "Confirm" - verify success message
✓ Verify "Table" removed from list
✓ Verify total count decreases to 2
✓ Try to delete asset mapped to centers (should fail with error)
```

---

#### User Story 1.1.6: Toggle Asset Status
**As a** Super Admin  
**I want to** activate/deactivate assets  
**So that** I can control which assets are available

**Test Scenarios:**
```
✓ Click green Active toggle for "AC" asset
✓ Verify toggle turns gray/off
✓ Verify asset status changes to "Inactive"
✓ Filter by "Inactive" - verify AC shown
✓ Click toggle again to activate
✓ Verify toggle turns green
✓ Verify asset active again
```

---

#### User Story 1.1.7: Refresh Asset List
**As a** Super Admin  
**I want to** refresh the asset list  
**So that** I see the latest data

**Test Scenarios:**
```
✓ Click "Refresh" button (with rotate icon)
✓ Verify loading indicator appears (if any)
✓ Verify asset list reloads
✓ Verify all data is current
```

---

### 1.2 Center Assets Screen (localhost:3001/center-assets)

#### User Story 1.2.1: View Center Asset Mapping Interface
**As a** Super Admin  
**I want to** view the center asset mapping interface  
**So that** I can configure assets for each center

**Screen Elements Visible:**
- Page Title: "Map Assets to Centers"
- Project Selector dropdown
- Quick Actions section: "Configure assets for one center, then apply to all centers at once"
- Save All Mappings button (blue, top right)
- View Report button
- Refresh button
- Progress bars showing asset utilization (72% used, 60% used, 60% used)
- Center card: "CET उमेदवार - Amravati" (Amravati, Maharashtra)
- Audit Schedule section with date picker and frequency dropdown
- Selected count: "3 asset(s) selected"

**Test Scenarios:**
```
✓ Open localhost:3001/center-assets
✓ Select project with centers (e.g., with Amravati center)
✓ Verify "Quick Actions" section visible
✓ Verify progress bars show utilization percentages
✓ Verify center card displays:
  - Center name: "CET उमेदवार - Amravati"
  - Location: "Amravati, Maharashtra"
  - Asset count: "3 asset(s) selected"
✓ Verify "Save All Mappings" button visible (blue, top right)
✓ Verify "View Report" button visible
✓ Verify "Refresh" button visible
```

---

#### User Story 1.2.2: Select and Map Assets to Center
**As a** Super Admin  
**I want to** select assets and set quantities for a center  
**So that** the center has the right equipment allocation

**Screen Elements Visible:**
- Section: "Select Assets & Set Quantities for CET उमेदवार - Amravati"
- Search box: "Search assets by name or category..."
- Asset list with checkboxes:
  - Chair (Furniture) - Available: 50 units - Quantity input: 12
  - Table (Furniture) - Available: 15 units - Quantity input: 3
  - AC (Electronics) - Available: 10 units - Quantity input: 2
- Each asset has checkbox and blue checkmark when selected
- Status text: "3 of 3 assets selected"
- "Deselect All (3)" link

**Test Scenarios:**
```
✓ Verify asset list shows all master assets
✓ Check each asset shows:
  - Checkbox (checked)
  - Asset name (e.g., "Chair")
  - Category badge (e.g., "Furniture")
  - "Available: X units" text
  - Quantity input field
  - Blue checkmark icon when selected
✓ Verify all 3 assets are pre-selected (Chair, Table, AC)
✓ Check quantities:
  - Chair: 12
  - Table: 3
  - AC: 2
✓ Verify "3 of 3 assets selected" text displayed
✓ Verify "Deselect All (3)" link visible
✓ Click checkbox to unselect Chair
✓ Verify checkbox unchecked and checkmark removed
✓ Verify count changes to "2 of 3 assets selected"
✓ Verify "Deselect All (2)" link updates
✓ Click checkbox again to re-select Chair
✓ Verify checkbox checked and checkmark appears
✓ Verify count returns to "3 of 3 assets selected"
```

---

#### User Story 1.2.3: Search Assets in Center Mapping
**As a** Super Admin  
**I want to** search for specific assets  
**So that** I can quickly find assets in large lists

**Test Scenarios:**
```
✓ Type "Chair" in search box
✓ Verify only Chair asset displayed
✓ Verify Table and AC hidden
✓ Clear search box
✓ Verify all 3 assets visible again
✓ Type "Furniture" in search box
✓ Verify Chair and Table displayed (both Furniture category)
✓ Verify AC hidden (Electronics category)
✓ Clear search
✓ Type "AC" in search box
✓ Verify only AC displayed
✓ Clear search
```

---

#### User Story 1.2.4: Update Asset Quantities for Center
**As a** Super Admin  
**I want to** change asset quantities  
**So that** I can allocate correct amounts to the center

**Test Scenarios:**
```
✓ Click quantity field for Chair (currently 12)
✓ Change value to 15
✓ Verify quantity updates in input field
✓ Verify "Selected Assets Summary" updates to "Chair ×15"
✓ Click quantity field for Table (currently 3)
✓ Change value to 5
✓ Verify quantity updates
✓ Verify summary updates to "Table ×5"
✓ Try entering quantity greater than available (e.g., 60 for Chair when only 50 available)
✓ Verify validation error or warning
✓ Try entering negative number (e.g., -5)
✓ Verify validation prevents negative values
✓ Try entering 0
✓ Verify 0 is accepted or asset auto-deselected
```

---

#### User Story 1.2.5: View Selected Assets Summary
**As a** Super Admin  
**I want to** see summary of selected assets  
**So that** I can review my selections before saving

**Screen Elements Visible:**
- Section: "Selected Assets Summary"
- Pills/badges showing:
  - "Chair ×12" with X button
  - "Table ×3" with X button
  - "AC ×2" with X button

**Test Scenarios:**
```
✓ Verify "Selected Assets Summary" section visible
✓ Check all selected assets shown as pills:
  - Chair ×12
  - Table ×3
  - AC ×2
✓ Verify each pill has X button to remove
✓ Hover over X button on "Table ×3"
✓ Click X button
✓ Verify Table removed from summary
✓ Verify Table checkbox unchecked in asset list
✓ Verify quantity field cleared
✓ Verify count updates to "2 of 3 assets selected"
✓ Re-select Table checkbox
✓ Verify Table reappears in summary
✓ Click "Deselect All (3)" link
✓ Verify all assets removed from summary
✓ Verify all checkboxes unchecked
✓ Verify "0 of 3 assets selected" displayed
```

---

#### User Story 1.2.6: Configure Audit Schedule for Center
**As a** Super Admin  
**I want to** set audit schedule for a center  
**So that** periodic asset audits are conducted

**Screen Elements Visible:**
- Section: "Audit Schedule"
- Calendar icon with date picker showing "01/12/2026"
- Dropdown showing "1 Month"
- Arrow and calculated date: "→ 12 Feb 2026"
- "Copy to All Centers" button (green)
- "Save" button (blue)

**Test Scenarios:**
```
✓ Verify Audit Schedule section visible
✓ Check date picker shows: 01/12/2026
✓ Check frequency dropdown shows: "1 Month"
✓ Verify calculated next date shown: "→ 12 Feb 2026"
✓ Click date picker
✓ Select different date: 01/15/2026
✓ Verify next audit date recalculates to "→ 15 Feb 2026"
✓ Click frequency dropdown
✓ Verify options available (e.g., 1 Month, 3 Months, 6 Months, 12 Months)
✓ Select "3 Months"
✓ Verify next audit date recalculates to "→ 15 Apr 2026"
✓ Select "6 Months"
✓ Verify next audit date recalculates to "→ 15 Jul 2026"
✓ Select "12 Months"
✓ Verify next audit date recalculates to "→ 15 Jan 2027"
✓ Click "Save" button
✓ Verify success message appears
✓ Verify audit schedule saved for this center
```

---

#### User Story 1.2.7: Copy Configuration to All Centers
**As a** Super Admin  
**I want to** copy asset configuration to all centers at once  
**So that** I can quickly configure multiple centers with same settings

**Test Scenarios:**
```
✓ Configure assets for first center (Amravati):
  - Select Chair ×12, Table ×3, AC ×2
  - Set audit schedule: 01/12/2026, 1 Month frequency
✓ Click "Copy to All Centers" button (green)
✓ Verify confirmation dialog appears
✓ Confirm to copy
✓ Verify success message
✓ Navigate to next center (if multiple centers exist)
✓ Verify same assets selected with same quantities
✓ Verify same audit schedule applied
✓ Check all centers have identical configuration
✓ Click "Save All Mappings" button
✓ Verify all centers saved successfully
```

---

#### User Story 1.2.8: Save Individual Center Configuration
**As a** Super Admin  
**I want to** save configuration for individual center  
**So that** I can update one center without affecting others

**Test Scenarios:**
```
✓ Configure assets for center:
  - Select assets
  - Set quantities
  - Set audit schedule
✓ Click "Save" button in Audit Schedule section
✓ Verify success message
✓ Verify only this center's configuration saved
✓ Verify other centers (if any) remain unchanged
✓ Refresh page
✓ Verify saved configuration persists
✓ Check quantities match what was saved
✓ Check audit schedule matches
```

---

#### User Story 1.2.9: Save All Center Mappings
**As a** Super Admin  
**I want to** save all center configurations at once  
**So that** I can bulk update multiple centers

**Test Scenarios:**
```
✓ Configure multiple centers with different settings
✓ Click "Save All Mappings" button (blue, top right)
✓ Verify loading indicator appears
✓ Verify success message for all centers
✓ Refresh page
✓ Verify all configurations saved correctly
✓ Check each center retains its specific settings
```

---

#### User Story 1.2.10: View Asset Utilization Progress
**As a** Super Admin  
**I want to** see asset utilization across centers  
**So that** I can monitor how assets are distributed

**Screen Elements Visible:**
- Three progress bars at top showing:
  - 72% used (green bar)
  - 60% used (green bar)
  - 60% used (green bar)

**Test Scenarios:**
```
✓ View progress bars at top of page
✓ Verify three bars showing percentages:
  - First bar: 72% used (likely for Chair: 12 used of ~17 total?)
  - Second bar: 60% used (likely for Table: 3 used of 5 allocated?)
  - Third bar: 60% used (likely for AC: 2 used of ~3 allocated?)
✓ Add more centers and allocate assets
✓ Verify progress bars update to show increased utilization
✓ Hover over progress bars (if tooltip available)
✓ Verify tooltip shows details (e.g., "12 of 50 units allocated")
✓ Allocate maximum available assets
✓ Verify progress bar reaches 100% or shows different color
✓ Remove asset allocations
✓ Verify progress bars decrease accordingly
```

---

#### User Story 1.2.11: View Center Asset Report
**As a** Super Admin  
**I want to** view asset distribution report  
**So that** I can see asset allocation across all centers

**Test Scenarios:**
```
✓ Click "View Report" button
✓ Verify report page/modal opens
✓ Check report includes:
  - Center-wise asset breakdown
  - Quantities per center per asset
  - Total assets allocated vs available
  - Utilization percentages
✓ Verify report shows all centers
✓ Check report formatting is clear
✓ Verify export option (if available)
✓ Export report to CSV/PDF (if available)
✓ Close report
✓ Verify returned to mapping page
```

---

#### User Story 1.2.12: Handle Empty/No Centers Scenario
**As a** Super Admin  
**I want to** see appropriate message when no centers exist  
**So that** I know to add centers first

**Test Scenarios:**
```
✓ Select project with no centers (e.g., "CET Website")
✓ Verify message displayed: "No centers found for this project. Please add centers first."
✓ Verify no asset mapping interface shown
✓ Verify navigation to add centers page (if available)
✓ Add a center to the project
✓ Refresh center-assets page
✓ Verify center appears and mapping interface loads
```

---

#### User Story 1.2.13: Deselect All Assets
**As a** Super Admin  
**I want to** deselect all assets at once  
**So that** I can quickly clear selections and start over

**Test Scenarios:**
```
✓ Select multiple assets with quantities
✓ Verify "Deselect All (3)" link visible
✓ Verify number in parentheses matches selected count
✓ Click "Deselect All" link
✓ Verify all checkboxes unchecked
✓ Verify all quantity fields cleared
✓ Verify "Selected Assets Summary" empty
✓ Verify count shows "0 of 3 assets selected"
✓ Verify link text changes to "Deselect All (0)" or hides
```

---

### 1.3 My Assets Screen (Not shown but exists from code)

#### User Story 1.3.1: View My Center Assets
**As a** Super Admin  
**I want to** view assets for centers I manage  
**So that** I can conduct audits

**Expected Screen Elements:**
- Asset table with center-specific data
- Audit date information
- Edit button (when audit is live)
- Submit Audit button
- History button

**Test Scenarios:**
```
✓ Navigate to My Assets screen
✓ Verify center assets displayed
✓ Check audit status badges
✓ Verify countdown to next audit
✓ When audit is live, click Edit
✓ Update working asset counts
✓ Save changes
✓ Click Submit Audit
✓ Confirm submission
✓ Click History button
✓ View audit log entries
```

---

## 2. Integration Module

### 2.1 Email Configuration Screen (localhost:3001/email-config)

#### User Story 2.1.1: Configure SMTP Settings
**As a** Super Admin  
**I want to** configure email settings  
**So that** system can send email notifications

**Screen Elements Visible:**
- Page Title: "Email Configuration"
- Tabs: Email Configuration, WhatsApp Triggers, SMS Settings, Test Notifications
- SMTP Settings section (Configured status indicator)
- Email Integration toggle (blue when ON)
- Fields:
  - SMTP Host (e.g., smtp.gmail.com)
  - SMTP Port (e.g., 587)
  - SMTP Username (email)
  - SMTP Password (masked with dots)
  - From Email
  - From Name (e.g., MHCET)
- Use SSL/TLS checkbox (if visible)

**Test Scenarios:**
```
✓ Open localhost:3001/email-config
✓ Select project from dropdown
✓ Verify "Email Configuration" tab is active
✓ Check SMTP Settings shows "Configured" status
✓ Verify Email Integration toggle is ON (blue)
✓ Verify SMTP Host shows: smtp.gmail.com
✓ Verify SMTP Port shows: 587
✓ Verify SMTP Username shows email address
✓ Verify Password is masked
✓ Verify From Email is populated
✓ Verify From Name shows project name
✓ Toggle Email Integration OFF
✓ Verify toggle turns gray
✓ Toggle back ON
✓ Modify SMTP Host value
✓ Click Save button (if visible)
✓ Verify success message
```

---

#### User Story 2.1.2: Configure WhatsApp Triggers
**As a** Super Admin  
**I want to** configure WhatsApp notification triggers  
**So that** students receive WhatsApp messages

**Test Scenarios:**
```
✓ Click "WhatsApp Triggers" tab
✓ Verify WhatsApp configuration form appears
✓ Check available trigger options
✓ Enable/disable specific triggers
✓ Configure WhatsApp API credentials (if required)
✓ Save configuration
✓ Verify success message
```

---

#### User Story 2.1.3: Configure SMS Settings
**As a** Super Admin  
**I want to** configure SMS gateway settings  
**So that** students receive SMS notifications

**Test Scenarios:**
```
✓ Click "SMS Settings" tab
✓ Verify SMS configuration form appears
✓ Enter SMS gateway credentials
✓ Configure SMS templates (if available)
✓ Enable/disable SMS notifications
✓ Save configuration
✓ Verify success message
```

---

#### User Story 2.1.4: Test Notifications
**As a** Super Admin  
**I want to** test Email, WhatsApp, and SMS  
**So that** I can verify integrations are working

**Screen Elements Visible:**
- Tab: "Test Notifications"
- Subtitle: "Send test messages to verify your notification configurations across all channels"
- Section: "Select Channels to Test"
- Checkboxes:
  - Email (checked in screenshot) - "Test email notifications"
  - WhatsApp - "Test WhatsApp templates"
  - SMS - "Test SMS messages"
- Fields:
  - Test Email Address (e.g., user@example.com) - Required if Email selected
  - Test Phone Number (with country code, e.g., 919876543210) - Required if WhatsApp/SMS selected
- Button: "Send Test Messages" (blue, bottom right)

**Test Scenarios:**
```
✓ Click "Test Notifications" tab
✓ Verify three checkboxes: Email, WhatsApp, SMS
✓ Check "Email" checkbox (already checked)
✓ Enter test email in "Test Email Address" field
✓ Verify "Required if Email is selected" note appears
✓ Click "Send Test Messages" button
✓ Verify success message or confirmation
✓ Check email inbox for test message
✓ Uncheck Email, check WhatsApp
✓ Enter phone number with country code (e.g., 919876543210)
✓ Verify "Required if WhatsApp or SMS is selected" note
✓ Click "Send Test Messages"
✓ Verify WhatsApp message received
✓ Check SMS checkbox
✓ Send test SMS
✓ Verify SMS received on phone
✓ Select all three channels
✓ Send test to all channels simultaneously
✓ Verify all three notifications received
```

---

## 3. Audit Logs Module

### 3.1 Activity Logs Screen (localhost:3001/audit/activity-logs)

#### User Story 3.1.1: View Activity Logs
**As a** Super Admin  
**I want to** view all system activities  
**So that** I can track CRUD operations

**Screen Elements Visible:**
- Page Title: "Activity Logs"
- Subtitle: "Track all CRUD operations: create, update, edit, and delete actions across the system"
- Filters:
  - Search (User, entity, description...)
  - Action dropdown (All Actions)
  - Entity field (query, user, project...)
  - Start Date (mm/dd/yyyy)
  - End Date (mm/dd/yyyy)
  - Clear Filters button
- Statistics: Total Logs: 248
- Table columns: TIMESTAMP, USER, ACTION, ENTITY, DESCRIPTION, IP ADDRESS, ACTIONS
- View Details link (purple) for each entry

**Test Scenarios:**
```
✓ Open localhost:3001/audit/activity-logs
✓ Verify page title "Activity Logs"
✓ Check Total Logs count shows: 248
✓ Verify table shows multiple entries
✓ Check columns: Timestamp, User, Action, Entity, Description, IP Address, Actions
✓ Verify first entry shows:
  - Timestamp: 1/14/2026, 11:21:14 AM
  - User: Niraj Mishra (admin@helpdesk.gov.in)
  - Action: UPDATE (blue badge)
  - Entity: role / Counselor
  - Description: Role Counselor updated
  - IP: -:1
✓ Verify multiple UPDATE actions visible
✓ Check entities include: role, project, user
✓ Click "View Details" link
✓ Verify detailed log information opens
```

---

#### User Story 3.1.2: Filter Activity Logs by Action
**As a** Super Admin  
**I want to** filter logs by action type  
**So that** I can see specific operations

**Test Scenarios:**
```
✓ Click "Action" dropdown (shows "All Actions")
✓ Select "UPDATE" from dropdown
✓ Verify only UPDATE actions displayed
✓ Verify all entries show blue "UPDATE" badge
✓ Select "CREATE" from dropdown
✓ Verify only CREATE actions displayed
✓ Select "DELETE" from dropdown
✓ Verify only DELETE actions displayed
✓ Select "All Actions" to reset
✓ Verify all action types shown again
```

---

#### User Story 3.1.3: Filter Activity Logs by Entity
**As a** Super Admin  
**I want to** filter logs by entity type  
**So that** I can track changes to specific entities

**Test Scenarios:**
```
✓ Type "project" in Entity field
✓ Verify only project-related logs displayed
✓ Clear Entity field
✓ Type "user" in Entity field
✓ Verify only user-related logs displayed
✓ Type "role" in Entity field
✓ Verify only role-related logs displayed
✓ Clear filter
```

---

#### User Story 3.1.4: Filter Activity Logs by Date Range
**As a** Super Admin  
**I want to** filter logs by date range  
**So that** I can see activities for a specific period

**Test Scenarios:**
```
✓ Click Start Date field
✓ Select date: 01/13/2026
✓ Click End Date field
✓ Select date: 01/14/2026
✓ Verify logs filtered to date range
✓ Check only dates 1/13/2026 and 1/14/2026 shown
✓ Click "Clear Filters" button
✓ Verify all logs displayed again
✓ Verify date fields cleared
```

---

#### User Story 3.1.5: Search Activity Logs
**As a** Super Admin  
**I want to** search logs by user or description  
**So that** I can find specific activities

**Test Scenarios:**
```
✓ Type "Niraj Mishra" in Search field
✓ Verify only Niraj's activities shown
✓ Clear search
✓ Type "updated" in Search field
✓ Verify logs with "updated" in description shown
✓ Clear search
✓ Type "admin@helpdesk.gov.in" in Search
✓ Verify logs for that email shown
✓ Clear search
```

---

#### User Story 3.1.6: View Activity Log Details
**As a** Super Admin  
**I want to** view detailed information for an activity  
**So that** I can see complete change information

**Test Scenarios:**
```
✓ Click "View Details" link for any log entry
✓ Verify details modal/page opens
✓ Check details include:
  - Full user information
  - Complete timestamp
  - Entity details
  - Before/after values (if update)
  - IP address
  - User agent (if available)
  - Additional metadata
✓ Close details view
✓ Verify returned to log list
```

---

### 3.2 Access Logs Screen (localhost:3001/audit/access-logs)

#### User Story 3.2.1: View Access Logs
**As a** Super Admin  
**I want to** view authentication events  
**So that** I can monitor login/logout activities

**Screen Elements Visible:**
- Page Title: "Access Logs"
- Subtitle: "Track all authentication events: login, logout, and forgot password attempts"
- Filters:
  - Search (User, email, IP...)
  - Action dropdown (All Actions)
  - Status dropdown (All)
  - Start Date (mm/dd/yyyy)
  - End Date (mm/dd/yyyy)
  - Clear Filters button
- Statistics:
  - Total Logs: 886 (gray card)
  - Successful Logins: 30 (green card)
  - Failed Attempts: 3 (red card)
- Table columns: TIMESTAMP, USER, ACTION, STATUS, IP ADDRESS, PROJECT, ACTIONS
- View Details link (purple) for each entry

**Test Scenarios:**
```
✓ Open localhost:3001/audit/access-logs
✓ Verify page title "Access Logs"
✓ Check statistics cards:
  - Total Logs: 886
  - Successful Logins: 30
  - Failed Attempts: 3
✓ Verify table shows login/logout events
✓ Check first entry:
  - Timestamp: 1/14/2026, 6:26:06 PM
  - User: Niraj Mishra (admin@helpdesk.gov.in)
  - Action: LOGIN (green badge)
  - Status: Success (green badge)
  - IP: 49.248.250.14
  - Project: Individual
✓ Check for LOGOUT actions (light green badge)
✓ Verify multiple users visible: Niraj Mishra, Anmol Sharma, Devesh Mishra
✓ Click "View Details" link
```

---

#### User Story 3.2.2: Filter Access Logs by Action
**As a** Super Admin  
**I want to** filter by login/logout actions  
**So that** I can see specific authentication events

**Test Scenarios:**
```
✓ Click "Action" dropdown
✓ Select "LOGIN" from dropdown
✓ Verify only LOGIN actions displayed
✓ Verify all entries show green "LOGIN" badge
✓ Select "LOGOUT" from dropdown
✓ Verify only LOGOUT actions displayed
✓ Verify all entries show light green "LOGOUT" badge
✓ Select "All Actions" to reset
```

---

#### User Story 3.2.3: Filter Access Logs by Status
**As a** Super Admin  
**I want to** filter by success/failure status  
**So that** I can identify failed login attempts

**Test Scenarios:**
```
✓ Click "Status" dropdown (shows "All")
✓ Select "Success" from dropdown
✓ Verify only successful logins shown
✓ Verify count matches "Successful Logins: 30"
✓ Select "Failed" from dropdown
✓ Verify only failed attempts shown
✓ Verify count matches "Failed Attempts: 3"
✓ Check failed entries for details
✓ Identify potentially suspicious IPs
✓ Select "All" to reset
```

---

#### User Story 3.2.4: Search Access Logs
**As a** Super Admin  
**I want to** search by user, email, or IP  
**So that** I can find specific access events

**Test Scenarios:**
```
✓ Type "Anmol Sharma" in Search field
✓ Verify only Anmol's access logs shown
✓ Clear search
✓ Type "49.248.250.14" in Search (IP address)
✓ Verify all accesses from that IP shown
✓ Clear search
✓ Type "devesh.mishra@gmail.com" in Search
✓ Verify Devesh's logs displayed
✓ Clear search
```

---

#### User Story 3.2.5: Filter Access Logs by Date Range
**As a** Super Admin  
**I want to** view access logs for specific dates  
**So that** I can audit activities in a time period

**Test Scenarios:**
```
✓ Click Start Date field
✓ Select date: 01/14/2026
✓ Click End Date field
✓ Select date: 01/14/2026
✓ Verify logs filtered to 1/14/2026 only
✓ Check multiple logins/logouts on that day
✓ Expand date range to include 01/13/2026
✓ Verify more logs appear
✓ Click "Clear Filters"
✓ Verify all dates shown
```

---

### 3.3 Email Logs Screen (localhost:3001/audit/email-logs)

#### User Story 3.3.1: View Email Logs
**As a** Super Admin  
**I want to** view all email activity  
**So that** I can troubleshoot delivery issues

**Screen Elements Visible:**
- Page Title: "Email Logs"
- Subtitle: "View all email activity and troubleshoot delivery issues"
- Statistics (colored cards):
  - Total Emails: 63 (gray)
  - Sent: 63 (teal/cyan)
  - Failed: 0 (red)
  - Blocked: 0 (orange)
  - Simulated: 0 (gray)
- Filters:
  - Status dropdown (All)
  - Type dropdown (All Types)
  - Recipient search field
  - Clear Filters button
- Table columns: DATE, RECIPIENT, SUBJECT, TYPE, STATUS, PROJECT, ACTIONS
- View Details button (blue) for each entry

**Test Scenarios:**
```
✓ Open localhost:3001/audit/email-logs
✓ Verify page title "Email Logs"
✓ Check statistics cards:
  - Total Emails: 63
  - Sent: 63 (all successful)
  - Failed: 0
  - Blocked: 0
  - Simulated: 0
✓ Verify table shows email entries
✓ Check first entry:
  - Date: 1/14/2026, 12:36:51 PM
  - Recipient: niraj.m@humanteamfoundation.in
  - Subject: Your OTP for MHCET
  - Type: Otp
  - Status: SENT (green badge)
  - Project: MH CET Extension Centres
✓ Check other entries show:
  - Ticket Created emails
  - Recipients: htf.humanteamfoundation@gmail.com, sajaldubeyworks@gmail.com, niraj10101996@gmail.com
  - All showing SENT status
✓ Click "View Details" button
```

---

#### User Story 3.3.2: Filter Email Logs by Status
**As a** Super Admin  
**I want to** filter emails by delivery status  
**So that** I can identify delivery issues

**Test Scenarios:**
```
✓ Click "Status" dropdown (shows "All")
✓ Select "Sent" from dropdown
✓ Verify all 63 sent emails shown
✓ Verify all entries show green "SENT" badge
✓ Select "Failed" from dropdown
✓ Verify message "No failed emails" or empty table
✓ Select "Blocked" from dropdown
✓ Verify message "No blocked emails"
✓ Select "All" to reset
```

---

#### User Story 3.3.3: Filter Email Logs by Type
**As a** Super Admin  
**I want to** filter emails by type  
**So that** I can see specific email categories

**Test Scenarios:**
```
✓ Click "Type" dropdown (shows "All Types")
✓ Select "Otp" from dropdown
✓ Verify only OTP emails displayed
✓ Check entry shows: "Your OTP for MHCET"
✓ Select "Ticket Created" from dropdown
✓ Verify only ticket creation emails shown
✓ Check subjects include ticket numbers (e.g., "Ticket Created: MHCET-2025-0026")
✓ Select "All Types" to reset
```

---

#### User Story 3.3.4: Search Email Logs by Recipient
**As a** Super Admin  
**I want to** search emails by recipient  
**So that** I can track emails sent to specific users

**Test Scenarios:**
```
✓ Type "niraj.m@humanteamfoundation.in" in Recipient field
✓ Verify only emails to that recipient shown
✓ Clear search
✓ Type "sajaldubeyworks" in Recipient field
✓ Verify emails to sajaldubeyworks@gmail.com shown
✓ Clear search
✓ Type partial email "htf.human" in Recipient field
✓ Verify matching emails displayed
✓ Clear search
```

---

#### User Story 3.3.5: View Email Log Details
**As a** Super Admin  
**I want to** view detailed email information  
**So that** I can troubleshoot specific email issues

**Test Scenarios:**
```
✓ Click "View Details" button for any email entry
✓ Verify details modal/page opens
✓ Check details include:
  - Complete timestamp
  - Full recipient address
  - Subject line
  - Email type
  - Delivery status
  - Project association
  - SMTP response (if available)
  - Email content preview (if available)
  - Retry attempts (if any)
  - Error messages (if failed)
✓ Close details view
```

---

#### User Story 3.3.6: Monitor Email Delivery Health
**As a** Super Admin  
**I want to** monitor overall email health  
**So that** I can ensure notifications are working

**Test Scenarios:**
```
✓ Check statistics dashboard
✓ Verify "Sent" count matches "Total Emails" (100% success rate)
✓ Monitor for any "Failed" emails
✓ Check "Blocked" count (should be 0)
✓ Monitor over time for delivery trends
✓ If failures appear, investigate specific emails
✓ Check recipient domains for bounces
✓ Verify SMTP configuration if issues found
```

---

## 4. Feedback Module

### 4.1 Manage Forms Screen (localhost:3001/feedback/forms)

#### User Story 4.1.1: View Feedback Forms Page
**As a** Super Admin  
**I want to** view the feedback forms management page  
**So that** I can see all forms for a project

**Screen Elements Visible:**
- Page Title: "Feedback Forms"
- Subtitle: "Create and manage customizable feedback forms to collect student feedback on resolved tickets"
- Project Selector dropdown: "MH CET Extension Centres (MH CET उमेदवार) (MHCETEXTEN)"
- Section: "Forms Library"
- Section subtitle: "Manage all feedback forms for the selected project"
- "Create New Form" button (blue, top right with + icon)
- Form card displaying form details

**Test Scenarios:**
```
✓ Open localhost:3001/feedback/forms
✓ Verify page title "Feedback Forms"
✓ Verify subtitle appears: "Create and manage customizable feedback forms..."
✓ Check project selector shows current project
✓ Verify "Forms Library" section visible
✓ Verify section subtitle visible
✓ Check "Create New Form" button visible (blue, top right)
✓ Verify form cards displayed (if forms exist)
```

---

#### User Story 4.1.2: View Form Card Details
**As a** Super Admin  
**I want to** view form details in the card  
**So that** I can quickly see form configuration

**Screen Elements Visible:**
- Form card with:
  - Form Title: "Sample"
  - Status badge: "Active" (green)
  - Questions count: "Questions: 1"
  - Email status: "Email: Enabled" (purple/pink text)
  - Triggers section: "Triggers:" with badge "Ticket Closed" (purple)
  - "Design Form" button (blue)
  - Action buttons: Edit icon, Toggle icon, Delete icon (red)

**Test Scenarios:**
```
✓ Verify form card displays:
  - Title: "Sample"
  - Green "Active" badge at top
✓ Check "Questions: 1" displayed
✓ Verify "Email: Enabled" shown in purple/pink
✓ Check "Triggers:" section visible
✓ Verify "Ticket Closed" trigger badge displayed (purple)
✓ Verify "Design Form" button visible (blue)
✓ Check action icons visible:
  - Blue Edit icon (pencil)
  - Toggle/eye icon
  - Red Delete icon (trash)
```

---

#### User Story 4.1.3: Create New Feedback Form
**As a** Super Admin  
**I want to** create a new feedback form  
**So that** I can collect student feedback after ticket resolution

**Test Scenarios:**
```
✓ Click "Create New Form" button (blue, top right)
✓ Verify form creation modal/page opens
✓ Enter form title: "Post-Resolution Feedback"
✓ Enter description: "Collect feedback after ticket is resolved"
✓ Verify form builder interface appears
✓ Check available form fields/question types
✓ Configure email notification setting
✓ Set trigger: "Ticket Closed"
✓ Click Save/Create button
✓ Verify success message appears
✓ Verify form appears in Forms Library
✓ Check form shows "Active" badge
✓ Verify Questions count starts at 0 or shows added questions
```

---

#### User Story 4.1.4: Design Form - Add Questions
**As a** Super Admin  
**I want to** design the form by adding questions  
**So that** I can collect specific feedback information

**Test Scenarios:**
```
✓ Click "Design Form" button for "Sample" form
✓ Verify form designer interface opens
✓ Check available question types:
  - Text input
  - Textarea
  - Rating/Stars
  - Multiple choice
  - Checkboxes
  - Dropdown
✓ Add a rating question:
  - Title: "How satisfied are you with the resolution?"
  - Type: Star rating (5 stars)
  - Mark as required
✓ Add a text area question:
  - Title: "Please provide additional comments"
  - Type: Text area
  - Mark as optional
✓ Add multiple choice question:
  - Title: "Was your issue resolved on time?"
  - Options: Yes, No, Partially
✓ Drag to reorder questions (if available)
✓ Preview form (if preview available)
✓ Click Save button
✓ Verify success message
✓ Verify Questions count updates (e.g., "Questions: 4")
```

---

#### User Story 4.1.5: Edit Form Settings
**As a** Super Admin  
**I want to** edit form settings  
**So that** I can update form configuration

**Test Scenarios:**
```
✓ Click blue Edit icon (pencil) for "Sample" form
✓ Verify form settings modal/page opens
✓ Check current settings visible:
  - Form title: "Sample"
  - Email notification: Enabled
  - Trigger: Ticket Closed
✓ Modify form title to "Customer Satisfaction Survey"
✓ Toggle email notification to Disabled
✓ Verify email status changes to "Email: Disabled"
✓ Click Save button
✓ Verify success message
✓ Verify card updates with new title
✓ Verify "Email: Disabled" shown on card
✓ Click Edit again to revert changes
✓ Enable email notification
✓ Save and verify "Email: Enabled" appears
```

---

#### User Story 4.1.6: Configure Form Triggers
**As a** Super Admin  
**I want to** configure when the form is sent  
**So that** feedback is collected at the right time

**Test Scenarios:**
```
✓ Click Edit icon for form
✓ Navigate to Triggers section
✓ Check available trigger options:
  - Ticket Closed (currently selected)
  - Ticket Resolved
  - Manual trigger
  - Other status changes
✓ Change trigger from "Ticket Closed" to "Ticket Resolved"
✓ Save changes
✓ Verify form card updates trigger badge to "Ticket Resolved"
✓ Edit form again
✓ Add multiple triggers (if supported)
✓ Verify multiple trigger badges appear on card
✓ Change back to "Ticket Closed"
✓ Save and verify card shows "Ticket Closed"
```

---

#### User Story 4.1.7: Toggle Form Active/Inactive Status
**As a** Super Admin  
**I want to** activate or deactivate a form  
**So that** I can control which forms are in use

**Test Scenarios:**
```
✓ Verify "Sample" form shows green "Active" badge
✓ Click toggle icon (eye/visibility icon) for the form
✓ Verify confirmation dialog appears (if any)
✓ Confirm to deactivate
✓ Verify badge changes from green "Active" to gray "Inactive"
✓ Verify form no longer triggers for tickets (test if possible)
✓ Click toggle icon again
✓ Verify badge changes back to green "Active"
✓ Verify form is active again
```

---

#### User Story 4.1.8: Delete Feedback Form
**As a** Super Admin  
**I want to** delete a feedback form  
**So that** I can remove unused forms

**Test Scenarios:**
```
✓ Note the current forms count
✓ Click red Delete icon (trash) for a form
✓ Verify confirmation dialog appears
✓ Check warning message about deleting form
✓ Click "Cancel" button
✓ Verify form not deleted
✓ Click Delete icon again
✓ Click "Confirm" or "Delete" button
✓ Verify success message appears
✓ Verify form card removed from Forms Library
✓ Verify forms count decreases
✓ Try to delete form with existing responses (should show warning)
```

---

#### User Story 4.1.9: View Form Questions Count
**As a** Super Admin  
**I want to** see how many questions each form has  
**So that** I can gauge form complexity

**Test Scenarios:**
```
✓ Check "Sample" form card shows "Questions: 1"
✓ Click "Design Form" button
✓ Add 2 more questions
✓ Save changes
✓ Return to Forms Library
✓ Verify form card now shows "Questions: 3"
✓ Remove 1 question
✓ Verify count updates to "Questions: 2"
```

---

#### User Story 4.1.10: Manage Email Notifications
**As a** Super Admin  
**I want to** enable/disable email notifications  
**So that** I can control if form responses trigger emails

**Test Scenarios:**
```
✓ Check form card shows "Email: Enabled" (purple/pink text)
✓ Click Edit icon
✓ Locate email notification toggle/checkbox
✓ Toggle from Enabled to Disabled
✓ Save changes
✓ Verify form card shows "Email: Disabled" (different color, e.g., gray)
✓ Test by submitting feedback (if possible)
✓ Verify no email sent when disabled
✓ Edit form again
✓ Enable email notifications
✓ Save and verify "Email: Enabled" appears
✓ Test by submitting feedback
✓ Verify email received when enabled
```

---

#### User Story 4.1.11: Switch Project to View Forms
**As a** Super Admin  
**I want to** switch between projects  
**So that** I can manage forms for different projects

**Test Scenarios:**
```
✓ Note current project: "MH CET Extension Centres (MH CET उमेदवार) (MHCETEXTEN)"
✓ Check forms displayed for current project
✓ Click project selector dropdown
✓ Select different project (e.g., "CET Website")
✓ Verify page reloads or updates
✓ Verify Forms Library shows forms for selected project
✓ Check if different forms appear
✓ Verify "Create New Form" creates form for selected project
✓ Switch back to original project
✓ Verify original forms displayed again
```

---

#### User Story 4.1.12: View Empty Forms Library
**As a** Super Admin  
**I want to** see appropriate message when no forms exist  
**So that** I know to create a form

**Test Scenarios:**
```
✓ Select project with no feedback forms
✓ Verify message displayed: "No feedback forms found" or similar
✓ Verify "Create New Form" button visible
✓ Verify instructions to create first form (if shown)
✓ Click "Create New Form" button
✓ Create a form
✓ Verify Forms Library now shows the new form
```

---

#### User Story 4.1.13: Preview Form Before Publishing
**As a** Super Admin  
**I want to** preview the form  
**So that** I can see how it looks to students

**Test Scenarios:**
```
✓ Click "Design Form" button
✓ Look for Preview button (if available)
✓ Click Preview
✓ Verify form displays as students would see it
✓ Check all questions visible
✓ Verify formatting and layout
✓ Test required field validation in preview
✓ Close preview
✓ Make adjustments if needed
✓ Preview again to verify changes
```

---

#### User Story 4.1.14: Duplicate/Copy Form
**As a** Super Admin  
**I want to** duplicate an existing form  
**So that** I can create similar forms quickly

**Test Scenarios:**
```
✓ Look for Copy/Duplicate icon or button on form card
✓ Click Copy/Duplicate for "Sample" form
✓ Verify confirmation or dialog appears
✓ Enter new name: "Sample - Copy"
✓ Confirm duplication
✓ Verify new form appears in Forms Library
✓ Check new form has same questions as original
✓ Verify same triggers and email settings copied
✓ Modify duplicated form independently
✓ Verify original form unchanged
```

---

### 4.2 View Responses Screen (localhost:3001/feedback/responses)

#### User Story 4.2.1: View Feedback Responses
**As a** Super Admin  
**I want to** view all feedback responses  
**So that** I can analyze student satisfaction

**Expected Screen Elements:**
- Response list or table
- Filter by form, date, rating
- Export options
- Response details view

**Test Scenarios:**
```
✓ Navigate to Feedback > View Responses
✓ Select project from dropdown
✓ Verify response list/table loads
✓ Check columns: Date, Form Name, Student, Rating, Status
✓ Filter by specific form: "Sample"
✓ Verify only "Sample" form responses shown
✓ Filter by date range
✓ Verify responses within date range displayed
✓ Click on a response to view details
✓ Verify full response details open
✓ Check all questions and answers visible
✓ Export responses to CSV (if available)
✓ Verify CSV downloaded with all data
```

---

#### User Story 4.2.2: Analyze Response Statistics
**As a** Super Admin  
**I want to** see response statistics  
**So that** I can measure satisfaction trends

**Test Scenarios:**
```
✓ Check for statistics dashboard or cards
✓ Verify total responses count displayed
✓ Check average rating (if rating questions exist)
✓ View rating distribution (e.g., 5 stars: 60%, 4 stars: 30%)
✓ Check response rate (submitted vs sent)
✓ Filter statistics by date range
✓ Verify statistics update based on filters
✓ View trends over time (if chart available)
```

---

## Summary of Actual Screens

### ✅ Screens Tested:

1. **Asset Management** (localhost:3001/assets)
   - View/Create/Edit/Delete master assets
   - Search and filter
   - Toggle active status

2. **Center Assets** (localhost:3001/center-assets)
   - Map assets to centers
   - View asset reports

3. **Email Configuration** (localhost:3001/email-config)
   - Configure SMTP settings
   - WhatsApp triggers
   - SMS settings
   - Test notifications

4. **Activity Logs** (localhost:3001/audit/activity-logs)
   - View all CRUD operations
   - Filter by action, entity, date
   - Search users and descriptions

5. **Access Logs** (localhost:3001/audit/access-logs)
   - View login/logout events
   - Filter by status (success/failed)
   - Track by IP address

6. **Email Logs** (localhost:3001/audit/email-logs)
   - View email delivery status
   - Filter by type and status
   - Search by recipient

---

## Test Execution Checklist

### Pre-requisites:
- [ ] Application running on localhost:3001
- [ ] Super Admin credentials available
- [ ] Test project with data exists
- [ ] Test email account accessible
- [ ] Test phone number available (for SMS/WhatsApp)

### Test Environment:
- **URL:** localhost:3001
- **Browser:** Chrome (primary), Firefox, Edge (cross-browser testing)
- **Test User:** Super Admin (admin@helpdesk.gov.in)
- **Test Project:** MH CET Extension Centres (MH CET उमेदवार)

### Test Data:
```
Assets:
- Chair (Furniture, 50 units)
- Table (Furniture, 15 units)
- AC (Electronics, 10 units)

Email Configuration:
- SMTP Host: smtp.gmail.com
- SMTP Port: 587
- From: projectmanagement487@gmail.com

Test Contacts:
- Email: user@example.com
- Phone: 919876543210
```

---

**Document Version:** 2.0 (Based on Actual Screens)  
**Prepared By:** QA Team  
**Last Updated:** January 19, 2026  
**Status:** Ready for Testing
