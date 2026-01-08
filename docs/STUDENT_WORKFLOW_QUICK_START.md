# Student Workflow - Quick Start Guide

## 🚀 Getting Started

### Accessing the Workflow
1. Log in to the Agent Portal
2. Navigate to the project dashboard
3. Click on **Student Workflow** in the sidebar
4. You'll see the search form

---

## 📋 How to Use

### Option 1: Create Ticket for Existing Student

#### Step 1: Search
```
1. Select search type: "Mobile Number" (recommended for accuracy)
2. Enter student's phone number
3. Click "Search Student"
```

#### Step 2: Select Student
```
✅ Student Found (green card)
   - Review student details
   - Click "Select" button
   → Auto-advances to ticket creation
```

#### Step 3: Create Ticket
```
📝 Student Info Card (appears automatically)
   - Name, Email, Phone, Unique ID displayed
   
Fill Ticket Details:
   - Title: Brief description of issue
   - Category: Select from dropdown
   - Priority: Low/Medium/High/Urgent
   - Description: Detailed explanation
   - Attachments: Optional (max 5 files, 5MB each)
   
Click "Create Ticket"
✅ Success: Ticket created with auto-populated student ID
```

---

### Option 2: Create Ticket for New Student

#### Step 1: Search
```
1. Select search type: "Name" or "Mobile Number"
2. Enter student details
3. Click "Search Student"
```

#### Step 2: Register Student
```
❌ No Students Found (red card)
   - Click "Register New Student"
   
Fill Registration Form:
   Required Fields:
   - First Name *
   - Last Name *
   - Email *
   - Phone Number *
   - Unique ID *
   
   Optional Fields (if configured):
   - Address
   - Date of Birth
   - Guardian Name
   - Guardian Phone
   - Emergency Contact
   
Click "Register Student"
✅ Success: Student created
   → Auto-advances to ticket creation
```

#### Step 3: Create Ticket
```
📝 New Student Info Card (appears automatically)
   - Name, Email, Phone, Unique ID displayed
   
Fill Ticket Details (same as Option 1)
Click "Create Ticket"
✅ Success: Ticket created with new student ID
```

---

## 🔍 Search Types

| Search Type | Use When | Example |
|-------------|----------|---------|
| **Name** | You know student's name | "John Smith" |
| **Mobile Number** | Most accurate, recommended | "9876543210" |
| **Unique ID** | Student ID/Roll number known | "STU2024001" |
| **All** | Search across all fields | "john" or "9876" |

---

## ✅ Best Practices

### 1. Prefer Mobile Number Search
- **Why**: Most accurate, prevents duplicates
- **When**: Student's phone number is available
- **Benefit**: Exact match, no ambiguity

### 2. Use Unique ID for Registered Students
- **Why**: Institutional identifier
- **When**: Student already has ID number
- **Benefit**: Fast, accurate retrieval

### 3. Name Search for Fuzzy Matching
- **Why**: Flexible, works with partial names
- **When**: Exact details not available
- **Note**: May return multiple results

### 4. Always Verify Student Details
- **Before selecting**: Check name, phone, email
- **Prevent errors**: Ensure correct student selected
- **If wrong**: Search again with different criteria

### 5. Complete All Required Fields
- **Registration**: All fields marked with * are required
- **Ticket**: Title, category, priority, description mandatory
- **Attachments**: Optional but helpful for documentation

---

## ⚠️ Common Mistakes

### ❌ Creating Duplicate Students
**Problem**: Registering student who already exists  
**Solution**: Always search first before registering

### ❌ Incorrect Phone Format
**Problem**: Phone search fails due to format  
**Solution**: Use 10-digit number without country code (e.g., 9876543210)

### ❌ Missing Required Fields
**Problem**: Form won't submit  
**Solution**: Check for red borders, fill all * marked fields

### ❌ Large File Uploads
**Problem**: Upload fails or takes too long  
**Solution**: Keep files under 5MB, use compressed formats

---

## 🎨 Visual Indicators

### Search Results
- 🟢 **Green Card**: Student found - click "Select"
- 🔴 **Red Card**: No results - click "Register New Student"

### Progress Steps
- 🔵 **Blue**: Current/completed step
- ⚪ **Gray**: Pending step

### Form Fields
- 🔴 **Red Border**: Required field missing or invalid
- ⚠️ **Error Message**: Shows what needs fixing

---

## 📱 Workflow at a Glance

```
┌──────────────────────────────────────────────┐
│          STUDENT WORKFLOW                     │
└──────────────────────────────────────────────┘

Step 1: SEARCH
┌────────────────┐
│ Search Type ▼  │
│ [Enter Query]  │
│ [Search]       │
└────────────────┘
        │
        ├─── Found ──────► Step 3: CREATE TICKET
        │                  ┌─────────────────┐
        │                  │ Student Info    │
        └─── Not Found ──► Step 2: REGISTER  │ [Title]         │
                           ┌─────────────────┐ │ [Category]      │
                           │ First Name *    │ │ [Priority]      │
                           │ Last Name *     │ │ [Description]   │
                           │ Email *         │ │ [Attachments]   │
                           │ Phone *         │ │ [Create Ticket] │
                           │ Unique ID *     │ └─────────────────┘
                           │ [Register]      │
                           └─────────────────┘
                                   │
                                   └────► Step 3: CREATE TICKET
```

---

## ⏱️ Time Estimates

| Task | Time | Notes |
|------|------|-------|
| Search existing student | 10-15 sec | With phone/ID |
| Register new student | 1-2 min | All required fields |
| Create ticket | 30-60 sec | With description |
| **Total (existing)** | **1 min** | Search + ticket |
| **Total (new)** | **2-3 min** | Search + register + ticket |

---

## 🆘 Quick Troubleshooting

### Search Returns Nothing
1. ✅ Check spelling and format
2. ✅ Try different search type (name → phone)
3. ✅ Search with partial information (first name only)
4. ✅ Verify correct project selected

### Can't Submit Ticket
1. ✅ Ensure student is selected (info card visible)
2. ✅ Fill all required fields (title, category, priority, description)
3. ✅ Check file sizes (<5MB)
4. ✅ Verify internet connection

### Registration Fails
1. ✅ Check for duplicate email/phone
2. ✅ Ensure valid email format
3. ✅ Verify phone number (10 digits)
4. ✅ Fill all required fields

---

## 📞 Need Help?

### Support Resources
- **User Manual**: See `STUDENT_WORKFLOW_IMPLEMENTATION.md`
- **API Documentation**: See `docs/API.md`
- **IT Support**: Contact your system administrator
- **Training**: Request workflow training session

---

## 💡 Pro Tips

### 1. Keyboard Shortcuts
- `Tab`: Navigate between fields
- `Enter`: Submit form (when focused)
- `Esc`: Clear search results

### 2. Multi-Student Tickets
- Search → Select → Create Ticket
- Search again → Select → Create Another Ticket
- Workflow resets after each ticket

### 3. Attachment Best Practices
- Use PDF for documents
- Compress images before upload
- Name files descriptively
- Include relevant screenshots

### 4. Description Writing
- Start with issue summary
- List steps to reproduce
- Mention error messages
- Include relevant dates/times

---

## ✨ Success Tips

### For Speed
1. Keep commonly used categories handy
2. Use phone number search by default
3. Prepare attachments before starting
4. Have student details ready

### For Accuracy
1. Always verify student details before selecting
2. Double-check category and priority
3. Write clear, detailed descriptions
4. Include all relevant attachments

### For Efficiency
1. Batch similar tickets together
2. Use templates for common issues
3. Keep student data updated
4. Log out when finished

---

**Version**: 1.0  
**Last Updated**: November 18, 2025  
**Status**: Production Ready

---

## 🎯 Quick Command Reference

```bash
# Access Workflow
Project Portal → Student Workflow

# Search Commands
Search Type: [Name | Mobile | Unique ID | All]
Query: [Enter student details]
Action: [Search Student]

# If Found
Action: [Select]
Result: → Ticket Creation Form

# If Not Found
Action: [Register New Student]
Form: [Fill Required Fields]
Action: [Register Student]
Result: → Ticket Creation Form

# Create Ticket
Form: [Fill Ticket Details]
Attachments: [Optional, max 5 files]
Action: [Create Ticket]
Result: ✅ Ticket Created Successfully
```

---

**Happy Ticketing! 🎫**
