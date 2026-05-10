const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const experimentRoot = path.resolve(
  projectRoot,
  '../src/experiments/active/2026-05-07_reading-rn'
);

const config = getDefaultConfig(projectRoot);

config.watchFolders = [experimentRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
