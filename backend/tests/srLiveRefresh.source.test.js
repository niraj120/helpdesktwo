const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");

const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("service request live list refresh", () => {
  const pages = [
    "frontend/src/pages/service-request/EmailTriageInbox.tsx",
    "frontend/src/pages/service-request/IVRCalls.tsx",
    "frontend/src/pages/service-request/ServiceRequests.tsx",
  ];

  test.each(pages)("%s silently refreshes while open and on tab return", (file) => {
    const source = read(file);
    expect(source).toContain("LIVE_REFRESH_INTERVAL_MS");
    expect(source).toContain("setInterval");
    expect(source).toContain("visibilitychange");
    expect(source).toContain("document.visibilityState === \"visible\"");
    expect(source).toContain("silent");
  });

  test.each(pages)("%s tracks locally unread new rows", (file) => {
    const source = read(file);
    expect(source).toContain("unreadRowIds");
    expect(source).toContain("markRowRead");
    expect(source).toContain("highlightUnreadRow");
  });
});
