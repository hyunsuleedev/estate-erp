/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'src/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    // Workspace shared 패키지가 ESM dist 라 CJS jest 가 import 못 함.
    // 테스트에서는 src TypeScript 를 ts-jest 로 직접 transform 한다.
    '^@estate-erp/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    // shared/src 가 NodeNext ESM 패턴 ('./enums.js') 로 작성되어 있으므로
    // jest 가 .ts 로 해석하도록 매핑한다.
    '^(\\.\\.?/.+)\\.js$': '$1',
  },
};
