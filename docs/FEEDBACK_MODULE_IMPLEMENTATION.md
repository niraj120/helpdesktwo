# Feedback Module Implementation

## Overview
Complete implementation of a customizable feedback module that automatically sends feedback requests to students when tickets are closed/resolved.

## Features Implemented

### 1. **Customizable Feedback Forms**
- Super admin can create multiple feedback forms per project
- Form builder with drag-and-drop question management
- Support for 6 question types:
  - ⭐ **Star Rating** (1-10 stars, configurable)
  - 📝 **Short Text** (single line input)
  - 📄 **Long Text** (multi-line textarea)
  - 🔘 **Radio Buttons** (single choice)
  - ☑️ **Checkboxes** (multiple choice)
  - 📋 **Dropdown** (select menu)
- Required/Optional field configuration
- Question ordering with up/down arrows
- Live preview for each question type

### 2. **Project Mapping & Activation**
- Map feedback forms to specific projects
- Activate/Deactivate forms independently
- Only one active form per project at a time
- Forms can be edited, duplicated, or deleted

### 3. **Automatic Email Triggers**
- Emails sent automatically when ticket status changes to "Closed" status
- Checks `isClosed` boolean field in Status model
- Customizable email templates with placeholders:
  - `{ticketNumber}` - Ticket number
  - `{studentName}` - Student full name
  - `{feedbackLink}` - Direct link to feedback form
  - `{projectName}` - Project name
- Configurable email delay (0-60 minutes)
- Option to enable/disable email notifications

### 4. **Student Feedback Submission**
- Direct link in email redirects to ticket page with feedback form
- Embedded feedback form under ticket details
- Prevents duplicate submissions (configurable)
- Star rating with hover effects
- All question types fully functional
- Real-time validation for required fields
- Success confirmation message

### 5. **Feedback Analytics & Responses**
- Admin dashboard to view all feedback responses
- Statistics:
  - Total responses
  - Average rating
  - Rating distribution (1-5 stars breakdown)
- Filters:
  - Rating range (min/max)
  - Date range (start/end)
  - Form selection
- Detailed view modal for each response
- Export capability (future enhancement)

---

## Backend Implementation

### Models

#### 1. **FeedbackForm.ts**
```typescript
- projectId: ObjectId (ref Project)
- name: string (unique per project)
- description: string (optional)
- questions: Array<IFeedbackQuestion>
  - id: string
  - type: 'rating' | 'text' | 'textarea' | 'radio' | 'checkbox' | 'select'
  - label: string
  - required: boolean
  - options: string[] (for radio/checkbox/select)
  - placeholder: string (for text/textarea)
  - maxRating: number (for rating type)
  - order: number
- isActive: boolean
- emailTemplate:
  - subject: string
  - body: string
- settings:
  - showAfterTicketClosed: boolean
  - allowMultipleSubmissions: boolean
  - sendEmailNotification: boolean
  - emailDelay: number (minutes)
- createdBy: ObjectId (ref User)
```

#### 2. **FeedbackResponse.ts**
```typescript
- projectId: ObjectId (ref Project)
- ticketId: ObjectId (ref Ticket)
- formId: ObjectId (ref FeedbackForm)
- studentId: ObjectId (ref User)
- answers: Array<IFeedbackAnswer>
  - questionId: string
  - questionLabel: string
  - questionType: string
  - answer: any (string, number, or array)
- overallRating: number (extracted from rating question)
- submittedAt: Date
- ipAddress: string
- userAgent: string
```

### Controllers

#### 1. **feedbackFormController.ts** (7 functions)
- `createFeedbackForm` - Create new form
- `getFeedbackFormsByProject` - List all forms for project
- `getFeedbackFormById` - Get single form details
- `getActiveFeedbackForm` - Get currently active form (for students)
- `updateFeedbackForm` - Update form details and questions
- `deleteFeedbackForm` - Delete form
- `toggleFeedbackFormActive` - Activate/Deactivate form

#### 2. **feedbackResponseController.ts** (5 functions)
- `submitFeedbackResponse` - Student submits feedback
- `getFeedbackByTicket` - Get responses for specific ticket
- `getFeedbackByProject` - Get all responses for project (with filters)
- `getFeedbackStats` - Get aggregated statistics
- `checkFeedbackSubmitted` - Check if student already submitted

### Services

#### **feedbackEmailService.ts**
- `sendFeedbackEmail(ticketId)` - Send feedback email immediately
- `scheduleFeedbackEmail(ticketId, delayMinutes)` - Schedule with delay
- Fetches ticket and student details
- Gets active feedback form
- Replaces email template placeholders
- Uses nodemailer SMTP configuration

### Routes

#### **feedbackForm.ts**
```
POST   /api/feedback-forms                  - Create form (FEEDBACK_FORM_CREATE)
GET    /api/feedback-forms/project/:id      - List forms (authenticated)
GET    /api/feedback-forms/project/:id/active - Get active form (public)
GET    /api/feedback-forms/:id              - Get form details
PUT    /api/feedback-forms/:id              - Update form (FEEDBACK_FORM_EDIT)
PATCH  /api/feedback-forms/:id/toggle-active - Toggle active (FEEDBACK_FORM_EDIT)
DELETE /api/feedback-forms/:id              - Delete form (FEEDBACK_FORM_DELETE)
```

#### **feedbackResponse.ts**
```
POST   /api/feedback-responses                - Submit response (student)
GET    /api/feedback-responses/ticket/:id/check - Check if submitted
GET    /api/feedback-responses/ticket/:id      - Get ticket responses
GET    /api/feedback-responses/project/:id     - Get all responses (FEEDBACK_VIEW)
GET    /api/feedback-responses/project/:id/stats - Get statistics (FEEDBACK_VIEW)
```

### Ticket Controller Integration

**Modified `updateTicketStatus` function:**
- Checks if new status has `isClosed: true`
- Fetches active feedback form for project
- Gets email delay from form settings
- Schedules/sends feedback email
- Non-blocking (doesn't fail if email fails)

---

## Frontend Implementation

### Components

#### 1. **FeedbackFormManagement.tsx** (Super Admin)
**Purpose:** Manage feedback forms
**Features:**
- Grid view of all forms
- Create/Edit form modal
- Email template configuration
- Settings management
- Activate/Deactivate toggle
- Delete with confirmation
- "Design Form" button opens builder

**State:**
- forms: FeedbackForm[]
- showModal: boolean (create/edit)
- showFormBuilder: boolean
- selectedFormForBuilder: string
- editingForm: FeedbackForm | null

**UI Elements:**
- Form cards with status badges (Active/Inactive)
- Question count display
- Email settings preview
- Action buttons (Edit, Design, Toggle, Delete)

#### 2. **FeedbackFormBuilder.tsx**
**Purpose:** Design feedback questions
**Features:**
- Add questions with all 6 types
- Live preview for each question
- Reorder with up/down arrows
- Delete questions
- Save to form
- Type-specific configuration:
  - Rating: max rating (3-10)
  - Text: placeholder
  - Radio/Checkbox/Select: options list

**State:**
- questions: FeedbackQuestion[]
- showAddQuestion: boolean
- newQuestion: Partial<FeedbackQuestion>

**Question Preview:**
- Rating: Stars with hover effect
- Text: Disabled input with placeholder
- Textarea: Disabled textarea
- Radio/Checkbox: Disabled inputs with options
- Select: Disabled dropdown with options

#### 3. **FeedbackSubmission.tsx** (Student View)
**Purpose:** Submit feedback
**Features:**
- Check submission status on load
- Display active form questions
- Interactive question rendering
- Star rating with hover
- Checkbox multi-select
- Required field validation
- Success confirmation
- Prevents duplicate submission

**State:**
- form: FeedbackForm | null
- answers: Record<string, any>
- hoveredRating: Record<string, number>
- submitted: boolean

**Rendering Logic:**
- Rating: Interactive stars with hover effect
- Text/Textarea: Controlled inputs
- Radio: Single selection with labels
- Checkbox: Multi-selection array
- Select: Dropdown with options

#### 4. **FeedbackResponses.tsx** (Admin View)
**Purpose:** View and analyze responses
**Features:**
- Statistics cards (total, average, distribution)
- Rating distribution chart
- Filter by rating range and date
- Response list with preview
- Detail modal with full answers
- Formatted answer display

**State:**
- responses: FeedbackResponse[]
- stats: Stats | null
- selectedResponse: FeedbackResponse | null
- filters: { minRating, maxRating, startDate, endDate }

**Statistics:**
- Total responses count
- Average rating (decimal)
- Rating distribution (1-5 stars with progress bars)

**Answer Rendering:**
- Rating: Stars with score
- Checkbox: Bulleted list
- Others: Plain text

---

## Integration Points

### 1. **Server Routes** (backend/src/server.ts)
```typescript
import feedbackFormRoutes from './routes/feedbackForm';
import feedbackResponseRoutes from './routes/feedbackResponse';

app.use('/api/feedback-forms', feedbackFormRoutes);
app.use('/api/feedback-responses', feedbackResponseRoutes);
```

### 2. **Super Admin Sidebar**
Add feedback module menu items:
```tsx
{
  name: 'Feedback',
  icon: ChatBubbleLeftRightIcon,
  children: [
    { name: 'Manage Forms', href: '/admin/feedback/forms' },
    { name: 'View Responses', href: '/admin/feedback/responses' }
  ]
}
```

### 3. **Student Ticket Detail Page**
Add FeedbackSubmission component at bottom:
```tsx
import FeedbackSubmission from '../components/FeedbackSubmission';

// Inside ticket detail component
{ticket.status === 'CLOSED' && (
  <div className="mt-6">
    <h3 className="text-lg font-bold mb-4">Share Your Feedback</h3>
    <FeedbackSubmission
      ticketId={ticket._id}
      projectId={ticket.projectId}
      onSuccess={() => {
        alert('Thank you for your feedback!');
      }}
    />
  </div>
)}
```

### 4. **Email Link Handling**
Student clicks email link → Redirects to:
```
/student/tickets/:ticketId?feedback=true
```

Page should:
- Load ticket details
- Scroll to feedback section
- Highlight feedback form

---

## Environment Variables

Add to `.env`:
```env
# SMTP Configuration (for feedback emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@helpdesk.com

# Frontend URL for feedback links
FRONTEND_URL=http://localhost:3001
```

---

## Permissions Required

Add to Role/Permission system:
```typescript
FEEDBACK_FORM_CREATE: 'Create feedback forms',
FEEDBACK_FORM_EDIT: 'Edit feedback forms',
FEEDBACK_FORM_DELETE: 'Delete feedback forms',
FEEDBACK_VIEW: 'View feedback responses'
```

Assign to roles:
- **Super Admin**: All permissions
- **Project Admin**: FEEDBACK_VIEW
- **Center Manager**: FEEDBACK_VIEW (optional)
- **Student**: Can submit feedback (no permission required)

---

## Database Indexes

### FeedbackForm
```typescript
{ projectId: 1, isActive: 1 }
{ projectId: 1, name: 1 } // unique
```

### FeedbackResponse
```typescript
{ projectId: 1, ticketId: 1 }
{ projectId: 1, formId: 1 }
{ studentId: 1, ticketId: 1 }
{ submittedAt: -1 }
```

---

## Testing Checklist

### Backend
- [ ] Create feedback form with all question types
- [ ] Update form questions via form builder
- [ ] Activate/Deactivate form
- [ ] Get active form for project
- [ ] Submit feedback response
- [ ] Prevent duplicate submission
- [ ] Fetch responses with filters
- [ ] Calculate statistics correctly
- [ ] Email sent when ticket closed
- [ ] Email delay works correctly

### Frontend
- [ ] Form management UI loads
- [ ] Create form modal works
- [ ] Form builder adds all question types
- [ ] Question reordering works
- [ ] Form activation toggle works
- [ ] Student sees feedback form on closed ticket
- [ ] Star rating hover effect
- [ ] Required field validation
- [ ] Success message after submission
- [ ] Cannot submit twice
- [ ] Admin sees responses
- [ ] Statistics calculate correctly
- [ ] Filters work

### Integration
- [ ] Email contains correct feedback link
- [ ] Link redirects to correct page
- [ ] Feedback form embedded correctly
- [ ] Submission saves to database
- [ ] Admin can view submitted feedback

---

## API Response Examples

### Get Active Form
```json
{
  "success": true,
  "data": {
    "_id": "form123",
    "name": "Support Satisfaction Survey",
    "description": "Help us improve",
    "questions": [
      {
        "id": "q1",
        "type": "rating",
        "label": "How satisfied are you?",
        "required": true,
        "maxRating": 5,
        "order": 0
      },
      {
        "id": "q2",
        "type": "textarea",
        "label": "Additional comments?",
        "required": false,
        "placeholder": "Share your thoughts...",
        "order": 1
      }
    ]
  }
}
```

### Submit Response
```json
{
  "success": true,
  "message": "Feedback submitted successfully. Thank you!",
  "data": {
    "_id": "response123",
    "ticketId": { "ticketNumber": "TKT-001", "subject": "Login issue" },
    "studentId": { "firstName": "John", "lastName": "Doe" },
    "answers": [
      { "questionId": "q1", "questionLabel": "How satisfied are you?", "questionType": "rating", "answer": 5 },
      { "questionId": "q2", "questionLabel": "Additional comments?", "questionType": "textarea", "answer": "Great support!" }
    ],
    "overallRating": 5,
    "submittedAt": "2025-12-18T10:30:00Z"
  }
}
```

### Get Statistics
```json
{
  "success": true,
  "data": {
    "totalResponses": 150,
    "averageRating": 4.3,
    "ratingCounts": {
      "1": 5,
      "2": 10,
      "3": 20,
      "4": 45,
      "5": 70
    }
  }
}
```

---

## Future Enhancements

### Phase 2 (Optional)
1. **Export Responses**
   - CSV export with all answers
   - PDF report generation
   - Date range selection

2. **Advanced Analytics**
   - Response trends over time
   - Agent performance correlation
   - Category-wise satisfaction

3. **Form Templates**
   - Pre-built form templates
   - Industry-specific surveys
   - Best practice recommendations

4. **Conditional Logic**
   - Show/hide questions based on previous answers
   - Skip logic implementation
   - Dynamic form flow

5. **Multi-language Support**
   - Translate forms and emails
   - Student language preference
   - Auto-detect language

6. **Scheduled Surveys**
   - Periodic feedback requests
   - NPS surveys
   - Follow-up surveys

---

## Troubleshooting

### Email not sending
1. Check SMTP credentials in `.env`
2. Verify `sendEmailNotification` is `true` in form settings
3. Check status has `isClosed: true`
4. Review backend logs for email errors

### Form not appearing for student
1. Verify form is active (`isActive: true`)
2. Check ticket status is closed
3. Confirm `showAfterTicketClosed` is `true`
4. Ensure student is authenticated

### Cannot submit feedback
1. Check required field validation
2. Verify student hasn't already submitted (if multiple submissions disabled)
3. Confirm ticket exists and belongs to student
4. Review browser console for errors

### Statistics not calculating
1. Ensure responses have `overallRating` field
2. Verify at least one rating question exists
3. Check projectId matches in filters

---

## File Structure

```
backend/
├── src/
│   ├── models/
│   │   ├── FeedbackForm.ts          ✅ NEW
│   │   └── FeedbackResponse.ts      ✅ NEW
│   ├── controllers/
│   │   ├── feedbackFormController.ts     ✅ NEW
│   │   ├── feedbackResponseController.ts ✅ NEW
│   │   └── ticketController.ts           ✏️ MODIFIED
│   ├── routes/
│   │   ├── feedbackForm.ts          ✅ NEW
│   │   └── feedbackResponse.ts      ✅ NEW
│   ├── services/
│   │   └── feedbackEmailService.ts  ✅ NEW
│   └── server.ts                     ✏️ MODIFIED

frontend/
└── src/
    └── components/
        ├── FeedbackFormManagement.tsx    ✅ NEW
        ├── FeedbackFormBuilder.tsx       ✅ NEW
        ├── FeedbackSubmission.tsx        ✅ NEW
        └── FeedbackResponses.tsx         ✅ NEW
```

---

## Completion Status

✅ **Backend:** Complete (100%)
✅ **Frontend:** Complete (100%)
⚠️ **Integration:** Pending (0%)
- Need to add routes to server.ts
- Need to add menu items to sidebar
- Need to embed FeedbackSubmission in ticket detail page
- Need to handle email link redirects

---

## Next Steps

1. **Restart Backend Server**
   ```bash
   cd backend
   npm run dev
   ```

2. **Add Routes to server.ts** (Already done in this session)

3. **Add Menu to Super Admin Sidebar**
   - Import FeedbackFormManagement and FeedbackResponses
   - Add routes in router configuration
   - Add menu items with icons

4. **Integrate Feedback Submission**
   - Find StudentTicketDetail component
   - Import FeedbackSubmission
   - Add conditional rendering after ticket closes

5. **Test End-to-End**
   - Create form in admin panel
   - Add questions via form builder
   - Activate form
   - Close a ticket
   - Verify email sent
   - Click link and submit feedback
   - View responses in admin panel

---

## Contact & Support

For questions or issues with this implementation:
- Check backend logs for errors
- Review browser console for frontend issues
- Verify all environment variables are set
- Ensure permissions are assigned correctly

---

**Implementation Date:** December 18, 2025
**Status:** ✅ Complete (Backend + Frontend)
**Pending:** Integration with existing UI
