// Monorepo Metro config — janis-mobile resolves through the workspace
// symlink in the root node_modules, which realpaths outside the project
// root: the bundler must watch the workspace root and resolve modules
// from both the app's and the root's node_modules. The package serves
// compiled dist/ — rebuild it after SDK edits (the npm scripts chain it).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
