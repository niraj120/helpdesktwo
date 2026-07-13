const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("email to PSR user flow", () => {
  test("create page preloads email context into existing-parent search and prospect fields", () => {
    const source = read("frontend/src/pages/service-request/ServiceRequestCreate.tsx");

    expect(source).toContain("prefillFromSourceContext");
    expect(source).toContain("setParentQuery(sourceContext.fromEmail");
    expect(source).toContain("applySourceValueToField");
    expect(source).toContain("prospectFormFields");
  });

  test("email inbox exposes bulk junk/delete without merge PSR", () => {
    const source = read("frontend/src/pages/service-request/EmailTriageInbox.tsx");

    expect(source).toContain("startEmailPsr");
    expect(source).toContain("markEmailJunk");
    expect(source).toContain("selectedRowIds");
    expect(source).toContain("toggleRowSelection");
    expect(source).toContain("bulkEmailAction");
    expect(source).toContain("bulkDeleteEmails");
    expect(source).not.toContain("mergeSelectedEmailsToPsr");
    expect(source).not.toContain("Merge to PSR");
  });

  test("all requests page exposes multi-select delete and merge actions", () => {
    const source = read("frontend/src/pages/service-request/ServiceRequests.tsx");

    expect(source).toContain("selectedRequestIds");
    expect(source).toContain("PERMISSIONS.SR_DELETE");
    expect(source).toContain("PERMISSIONS.SR_MERGE");
    expect(source).toContain("toggleRequestSelect");
    expect(source).toContain("handleBulkDelete");
    expect(source).toContain("handleConfirmBulkMerge");
    expect(source).toContain("bulkMergePrimaryId");
    expect(source).toContain("Merge");
    expect(source).toContain("Delete");
  });
});
