# Condition-Based Ticket Assignment Implementation

## Overview
Implemented condition-based automatic ticket assignment that assigns tickets to specific agents based on ticket category. This system also includes manual assignment permissions for role-based ticket assignment control.

## Features Implemented

### 1. Assignment Method Changes
- **Removed**: "Load Balanced" (marked for later implementation)
- **Removed**: "Skill Based" (replaced with Condition-Based)
- **Added**: "**Condition-Based**" assignment method
- **Enhanced**: "**Manual Assignment**" with role-based permissions

### 2. Condition-Based Assignment Logic
Allows superadmin to create rules that:
- Check the ticket's **Category** field
- Match against configured categories
- Assign to specific **Agent role users only** (filtered by Agent role ID)
- **Only shows agents mapped to the project**

### 3. Manual Assignment Permissions (NEW)
Define role-based assignment permissions:
- **Who can assign**: Select a role (e.g., Center Manager, Supervisor)
- **Can assign to**: Select multiple roles they can assign tickets to (e.g., L1, L2, L3)
- **Multiple permissions**: Add as many permission rules as needed
- **Role-based control**: Uses role IDs instead of hardcoded names

**Example:**
```
Permission 1:
- Role: Center Manager
- Can Assign To: L1 Agent, L2 Agent, L3 Agent

Permission 2:
- Role: Team Lead
- Can Assign To: L1 Agent, L2 Agent
```

### 3. Rule Builder Interface
Located in **Project Management → Edit Project → Ticket Portal Tab**

**Rule Structure:**
```
IF [Category] [is] [Selected Categories]
THEN [Assign to Selected Agents]
```

**Features:**
- Add multiple rules
- Each rule can match multiple categories
- Each rule can assign to multiple agents (rotates using round-robin)
- Categories pulled from Online Form Configuration
- Agents pulled from project users

### 4. Default Form Fields
When creating a new project, the system now automatically includes these **mandatory fields**:
- **Name** (text, required)
- **Category** (dropdown, required) - Used for condition-based assignment
- **Email** (email, required)
- **Phone** (phone, optional)
- **Subject** (text, required)
- **Description** (textarea, required)

Additional fields can be added using the "+ Add Field" button.

## Technical Implementation

### Frontend Changes

#### 1. State Management (`frontend/src/components/AddProjectForm.tsx`)
```typescript
// Added to state
assignmentType: 'manual' as 'round-robin' | 'condition-based' | 'manual'
conditionRules: [] as Array<{
  field: string;
  operator: string;
  categories: string[];
  assignToAgents: string[];
}>
```

#### 2. UI Components

**Manual Assignment (when Manual selected):**
- "+ Add Permission" button
- Permission cards showing:
  - Role dropdown (who can assign)
  - Multi-select for assignable roles (e.g., L1, L2, L3)
  - Remove permission button
- Info message explaining the feature
- Warning when no permissions defined

**Round-Robin Assignment:**
- Eligible Roles input (comma-separated role names)
- Only shows for Round-Robin method

**Condition-Based Assignment:**
- "+ Add Rule" button
- Rule cards with field/operator/values
- Multi-select for categories (from online form)
- **Multi-select for agents (FILTERED)**:
  - ✅ Only shows users with "Agent" role (by role ID, not hardcoded)
  - ✅ Only shows users mapped to the project
  - Shows: Name (Email) - cleaner display
- Remove rule button

#### 3. Default Fields Initialization
New `useEffect` hook that initializes default form fields when creating a new project:
- Ensures Category field always exists
- Pre-configures required fields
- Prevents empty form configuration

### Backend Changes

#### 1. Project Model (`backend/src/models/Project.ts`)
```typescript
interface IProject {
  configuration?: {
    ticketAssignmentSettings?: {
      enabled: boolean;
      assignmentType: 'round-robin' | 'load-balanced' | 'manual' | 'condition-based';
      // ... existing fields
      conditionRules?: Array<{
        field: string;
        operator: string;
        categories: string[];
        assignToAgents: string[];
      }>;
      manualAssignmentPermissions?: Array<{
        roleId: string; // Role that can assign tickets
        canAssignToRoles: string[]; // Role IDs they can assign to
      }>;
    };
  };
}
```

**Mongoose Schema:**
```typescript
ticketAssignmentSettings: {
  // ... existing fields
  conditionRules: [{
    field: { type: String },
    operator: { type: String },
    categories: [{ type: String }],
    assignToAgents: [{ type: String }]
  }],
  manualAssignmentPermissions: [{
    roleId: { type: String },
    canAssignToRoles: [{ type: String }]
  }]
}
```

#### 2. Ticket Controller (`backend/src/controllers/ticketController.ts`)
Added condition-based assignment logic:

```typescript
case 'condition-based':
  // Find matching rule based on ticket category
  const ticketCategory = ticketData.Category || 'General';
  const matchingRule = assignmentSettings.conditionRules?.find(rule => 
    rule.field === 'category' && 
    rule.operator === 'is' && 
    rule.categories.includes(ticketCategory)
  );
  
  if (matchingRule && matchingRule.assignToAgents.length > 0) {
    // Get agents from the matching rule
    const ruleAgents = await User.find({
      _id: { $in: matchingRule.assignToAgents },
      isActive: true
    });
    
    if (ruleAgents.length > 0) {
      // Use round-robin among rule-specific agents
      const ruleAgentIds = ruleAgents.map(a => a._id);
      assignedAgent = await getNextRoundRobinAgent(projectId, ruleAgentIds);
      console.log(`🎯 Condition-based assignment (Category: ${ticketCategory}): ${assignedAgent}`);
    }
  }
  break;
```

## How It Works

### Configuration Flow
1. Superadmin navigates to **Project Management**
2. Edits a project → **Ticket Portal** tab
3. Enables **Automatic Ticket Assignment**
4. Selects **Condition Based** method
5. Clicks **+ Add Rule**
6. Configures rule:
   - IF **Category** IS **[Technical Support, Account Issues]**
   - THEN assign to **[Agent 1, Agent 2, Agent 3]**
7. Can add multiple rules for different categories
8. Saves project configuration

### Ticket Assignment Flow
1. Student submits ticket from Student Portal
2. Ticket includes **Category** field value
3. Backend checks if auto-assignment is enabled
4. Backend looks for matching rule:
   - Finds rule where selected categories include ticket category
   - Gets list of agents from matching rule
   - Uses round-robin to pick next agent from that specific pool
5. Ticket assigned to selected agent
6. Logs assignment with category information

### Example Rules
```
Rule 1:
IF Category IS [Technical Support, Bug Report]
THEN Assign to [Tech Agent 1, Tech Agent 2, Tech Agent 3]

Rule 2:
IF Category IS [Billing, Payment Issues]
THEN Assign to [Finance Agent 1, Finance Agent 2]

Rule 3:
IF Category IS [General Inquiry, Feature Request]
THEN Assign to [Support Agent 1, Support Agent 2]
```

## User Interface

### Assignment Settings Section
Located in: **Ticket Portal Tab** → **Automatic Ticket Assignment** (blue highlighted section)

**Components:**
1. Enable checkbox with description
2. Assignment method dropdown (3 options)
3. Dynamic description for selected method
4. Conditional UI:
   - **Round-Robin**: Shows "Eligible Roles" input
   - **Condition-Based**: Shows Rule Builder interface
5. Notification and escalation checkboxes (all methods)

### Rule Builder
- Clean, card-based interface
- Each rule in its own gray card
- Visual IF...THEN structure
- Multi-select dropdowns for categories and agents
- Help text explaining multi-select (Ctrl/Cmd to select multiple)
- Remove button for each rule
- Warning message when no rules defined

## Benefits

1. **Flexibility**: Route tickets based on category/expertise
2. **Efficiency**: Automatic assignment reduces manual work
3. **Expertise Matching**: Technical issues → Tech team, Billing → Finance team
4. **Load Distribution**: Round-robin within rule-specific agent pool
5. **Easy Configuration**: Visual rule builder, no coding required
6. **Scalability**: Add as many rules as needed
7. **Visibility**: Clear logging of assignment decisions

## Testing

### Test Scenario 1: Single Rule
1. Create rule: Category "Technical Support" → Agent A
2. Submit ticket with category "Technical Support"
3. Verify: Ticket assigned to Agent A

### Test Scenario 2: Multiple Rules
1. Create rule 1: Category "Technical Support" → Agent A, Agent B
2. Create rule 2: Category "Billing" → Agent C
3. Submit 2 tickets with "Technical Support"
4. Verify: First → Agent A, Second → Agent B (round-robin)
5. Submit 1 ticket with "Billing"
6. Verify: Assigned to Agent C

### Test Scenario 3: No Matching Rule
1. Create rule: Category "Technical Support" → Agent A
2. Submit ticket with category "Other"
3. Verify: Ticket not auto-assigned (manual assignment)
4. Check logs for "No matching condition rule" message

### Test Scenario 4: Multiple Categories in Rule
1. Create rule: Categories ["Tech", "Bug", "Error"] → Agent A
2. Submit ticket with category "Bug"
3. Verify: Ticket assigned to Agent A

## Database Schema

### Project Document
```json
{
  "configuration": {
    "ticketAssignmentSettings": {
      "enabled": true,
      "assignmentType": "condition-based",
      "notifyOnAssignment": true,
      "reassignOnEscalation": false,
      "conditionRules": [
        {
          "field": "category",
          "operator": "is",
          "categories": ["Technical Support", "Bug Report"],
          "assignToAgents": ["user_id_1", "user_id_2", "user_id_3"]
        },
        {
          "field": "category",
          "operator": "is",
          "categories": ["Billing", "Payment"],
          "assignToAgents": ["user_id_4", "user_id_5"]
        }
      ]
    },
    "ticketSubmissionSettings": {
      "onlineFormFields": [
        {
          "fieldName": "Name",
          "fieldType": "text",
          "required": true
        },
        {
          "fieldName": "Category",
          "fieldType": "dropdown",
          "required": true,
          "options": ["Technical Support", "Bug Report", "Billing", "Payment", "General"]
        }
      ]
    }
  }
}
```

## Console Logging

Assignment decisions are logged with emojis for easy debugging:

```
🎯 Auto-assignment enabled: condition-based
🎯 Condition-based assignment (Category: Technical Support): 507f1f77bcf86cd799439011
⚠️ No matching condition rule for category: Unknown Category
⚠️ No active agents found in matching rule for category: Billing
```

## Future Enhancements

1. **Additional Operators**: "contains", "starts with", "is not"
2. **Multiple Fields**: Priority, Type, Tags
3. **Combined Conditions**: AND/OR logic
4. **Priority Handling**: High priority → Senior agents
5. **Time-Based Rules**: Business hours → Team A, After hours → Team B
6. **Load Balancing**: Within condition-based rules
7. **Fallback Rules**: Default rule when no match found

## Notes

- Category field is **mandatory** in online form configuration
- Categories must be configured in Online Form before creating rules
- Agents must be assigned to the project before they appear in rule builder
- If multiple rules match, first matching rule is used
- Within a rule, round-robin distributes among assigned agents
- Inactive agents are automatically excluded from assignment pool
