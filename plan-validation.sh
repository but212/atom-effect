#!/bin/bash
# Check if typecheck or tests fail before and after making changes
pnpm typecheck
pnpm test
