/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // Only pick up *.test.ts under tests/. Keeps unit tests (no DB) separate from
  // integration tests that need a live Mongo.
  testMatch: ["**/tests/**/*.test.ts"],
};
