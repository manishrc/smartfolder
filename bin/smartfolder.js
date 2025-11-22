#!/usr/bin/env node

const { runCli } = require('../dist');

runCli(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
