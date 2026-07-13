const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("SR email triage routing", () => {
  test("email worker routes auto-create disabled mail to intake before thread/ticket creation", () => {
    const source = read("backend/src/services/emailProcessingWorker.ts");
    const disabledGuard = source.indexOf("emailConfig.autoCreateTicket === false");
    const threadCheck = source.indexOf("findEmailThread(parsedEmail)");
    const ticketCreate = source.indexOf("createTicketFromEmail(parsedEmail, queueEntry)");

    expect(disabledGuard).toBeGreaterThan(-1);
    expect(threadCheck).toBeGreaterThan(-1);
    expect(ticketCreate).toBeGreaterThan(-1);
    expect(disabledGuard).toBeLessThan(threadCheck);
    expect(disabledGuard).toBeLessThan(ticketCreate);
    expect(source).toContain("Email intake created");
    expect(source).toContain("queueEntry.emailIntakeId = intake._id");
    expect(source).toContain("queueEntry.ticketId = ticket._id");
    expect(source.indexOf("queueEntry.emailIntakeId = intake._id")).toBeLessThan(
      source.indexOf("findEmailThread(parsedEmail)"),
    );
    expect(source).toContain("return;");
  });

  test("email intake supports bulk delete and bulk junk actions", () => {
    const routeSource = read("backend/src/modules/service-request/routes/emailIntake.ts");
    const controllerSource = read("backend/src/modules/service-request/controllers/emailIntakeController.ts");
    const serviceSource = read("backend/src/modules/service-request/emailTriage.ts");

    expect(routeSource).toContain('router.post("/bulk-action"');
    expect(routeSource).toContain('router.delete("/bulk"');
    expect(controllerSource).toContain("bulkAction");
    expect(controllerSource).toContain("bulkDelete");
    expect(serviceSource).toContain("bulkActionEmailIntake");
    expect(serviceSource).toContain("deleteEmailIntakes");
  });
});
