module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/',
    '^@sopon/contracts$': '<rootDir>/../../packages/contracts/src',
    '^@sopon/config$': '<rootDir>/../../packages/config/src',
    '^@sopon/database$': '<rootDir>/../../packages/database/src',
    '^@sopon/ai$': '<rootDir>/../../packages/ai/src',
    '^@sopon/ui$': '<rootDir>/../../packages/ui/src',
  },
};