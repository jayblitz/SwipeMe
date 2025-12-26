module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": ["babel-jest", { presets: ["@babel/preset-typescript"] }],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(viem|@noble/.*)/)",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/client/$1",
    "^@assets/(.*)$": "<rootDir>/attached_assets/$1",
  },
  testMatch: ["**/server/__tests__/**/*.[jt]s?(x)", "**/shared/__tests__/**/*.[jt]s?(x)"],
  testPathIgnorePatterns: ["/node_modules/", "/.cache/"],
  modulePathIgnorePatterns: ["<rootDir>/.cache/"],
  collectCoverageFrom: [
    "server/**/*.{ts,tsx}",
    "shared/**/*.{ts,tsx}",
    "!**/*.d.ts",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
