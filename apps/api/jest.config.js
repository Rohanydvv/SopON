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
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@sopon/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@sopon/config$': '<rootDir>/../../packages/config/src/index.ts',
    '^@sopon/database$': '<rootDir>/../../packages/database/src/index.ts',
    '^@sopon/ai$': '<rootDir>/../../packages/ai/src/index.ts',
    '^@sopon/ui$': '<rootDir>/../../packages/ui/src/index.ts',
  },
};