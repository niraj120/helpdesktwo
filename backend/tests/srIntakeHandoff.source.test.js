const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("SR intake handoff UI", () => {
  test("email intake navigates to New Request instead of direct category conversion", () => {
    const source = read("frontend/src/pages/service-request/EmailTriageInbox.tsx");
    expect(source).toContain("startEmailPsr");
    expect(source).toContain("sourceContext");
    expect(source).toContain("bodyPreview");
    expect(source).not.toContain("Select sub-category");
  });

  test("ivr intake navigates to New Request and still supports junk", () => {
    const source = read("frontend/src/pages/service-request/IVRCalls.tsx");
    expect(source).toContain("startIvrPsr");
    expect(source).toContain("sourceContext");
    expect(source).toContain("markJunk");
  });

  test("new request marks source intake converted after creating the ticket", () => {
    const source = read("frontend/src/pages/service-request/ServiceRequestCreate.tsx");
    expect(source).toContain("sourceContext");
    expect(source).toContain("markSourceConverted");
    expect(source).toContain("Back to Email");
    expect(source).toContain("Back to IVR");
  });

  test("new request preserves email or IVR subject and body after handoff flow resets", () => {
    const source = read("frontend/src/pages/service-request/ServiceRequestCreate.tsx");
    expect(source).toContain("applySourceContextFields");
    expect(source).toContain("keepSourceContext");
    expect(source).toContain("resetFlow({ keepSourceContext: true })");
  });

  test("email converted PSR carries message threading fields for platform email replies", () => {
    const model = read("backend/src/models/EmailIntake.ts");
    const emailUi = read("frontend/src/pages/service-request/EmailTriageInbox.tsx");
    const createUi = read("frontend/src/pages/service-request/ServiceRequestCreate.tsx");
    const createService = read("backend/src/modules/service-request/createServiceRequest.ts");

    expect(model).toContain("messageId");
    expect(model).toContain("inReplyTo");
    expect(model).toContain("references");

    expect(emailUi).toContain("messageId: email.messageId");
    expect(emailUi).toContain("sourceEmailConfigId: email.projectEmailConfigId");

    expect(createUi).toContain("emailMessageId: sourceContext.messageId");
    expect(createUi).toContain("sourceEmailConfigId: sourceContext.sourceEmailConfigId");

    expect(createService).toContain("sourceEmail: input.sourceEmail");
    expect(createService).toContain("sourceEmailMessageId: input.sourceEmailMessageId");
    expect(createService).toContain("input.sourceEmailConfigId");
    expect(createService).toContain("sourceEmailConfigId:");
  });

  test("email converted PSR can restore handoff from URL when router state is missing", () => {
    const emailUi = read("frontend/src/pages/service-request/EmailTriageInbox.tsx");
    const createUi = read("frontend/src/pages/service-request/ServiceRequestCreate.tsx");

    expect(emailUi).toContain("sourceType=email");
    expect(emailUi).toContain("sourceId=${email._id}");
    expect(createUi).toContain("resolvedSourceContext");
    expect(createUi).toContain("serviceRequestApi.emailIntake.get");
    expect(createUi).toContain("effectiveSubject");
    expect(createUi).toContain("effectiveDescription");
    expect(createUi).toContain("fieldMatchesAnyKey(field, SUBJECT_FIELD_KEYS)");
    expect(createUi).toContain("fieldMatchesAnyKey(");
    expect(createUi).toContain("DESCRIPTION_FIELD_KEYS");
  });
});
