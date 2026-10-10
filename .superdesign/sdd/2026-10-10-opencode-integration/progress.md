# SDD ledger — plan: docs/superpowers/plans/2026-10-10-opencode-integration.md
## Pre-flight
- 5 tasks sequential, no parallel conflicts
- Task 1 BASE: d7c4e68
- main branch (established session workflow)
- Task 2 consumes Task 1 PROTOCOL_ADAPTERS/mergeProviderBlock/backupOpenCode — checked
- Task 3 consumes Task 2 preload IPC — checked
- Task 4 consumes Task 3 routing + Task 2 IPC — checked
