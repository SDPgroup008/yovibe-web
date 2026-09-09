// Expo SDK 57's Jest preset inspects EXPO_OS while it initializes native
// modules. Force the web adapter for this repository's Node-based tests so
// native JS logger probing cannot emit asynchronous warnings after completion.
process.env.EXPO_OS = 'web';
require('jest/bin/jest');
