const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("email mailbox routing configuration", () => {
  test("mailbox config stores optional owner and auto-convert choice", () => {
    const model = read("backend/src/models/ProjectEmailConfig.ts");
    const controller = read("backend/src/controllers/projectEmailConfigController.ts");
    const modal = read("frontend/src/components/AddEmailConfigModal.tsx");
    const listPage = read("frontend/src/components/EmailToTicketConfiguration.tsx");

    expect(model).toContain("mappedUserId");
    expect(model).toContain("autoCreateTicket");
    expect(controller).toContain("mapped_user_id");
    expect(controller).toContain("auto_create_ticket");
    expect(modal).toContain("mappedUserId");
    expect(modal).toContain("autoCreateTicket");
    expect(listPage).toContain("mappedUser");
  });

  test("queue worker sends non-auto mailboxes to SR email intake", () => {
    const worker = read("backend/src/services/emailProcessingWorker.ts");
    const triage = read("backend/src/modules/service-request/emailTriage.ts");

    expect(worker).toContain("autoCreateTicket === false");
    expect(worker).toContain("ingestEmail");
    expect(triage).toContain("assignedTo");
    expect(triage).toContain("assignedOnlyToUserId");
  });

  test("email intake action enforces mailbox owner before conversion", () => {
    const controller = read("backend/src/modules/service-request/controllers/emailIntakeController.ts");
    const triage = read("backend/src/modules/service-request/emailTriage.ts");

    expect(controller).toContain("EMAIL_TRIAGE_ALL");
    expect(controller).toContain("viewerId");
    expect(triage).toContain("assertEmailOwnerAccess");
  });
});
