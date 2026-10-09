import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',

  testRegex: '.*\\.spec\\.ts$',

  extensionsToTreatAsEsm: ['.ts'],

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: './tsconfig.test.json',
      },
    ],
  },

  moduleFileExtensions: ['ts', 'js', 'json'],
};

export default config;
