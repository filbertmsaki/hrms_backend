'use strict';

const path = require('node:path');
const Module = require('node:module');

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith('src/')) {
    request = path.join(process.cwd(), 'dist', request.slice('src/'.length));
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};
