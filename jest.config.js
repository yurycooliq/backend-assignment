module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: "src/.*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/main.ts", "!src/**/*.module.ts"],
  setupFiles: ["<rootDir>/test/set-test-env.js"],
  testEnvironment: "node",
};
