# WEBHOOK_SECURITY Fix Plan

## Changes
- None required. Shared secret verification is implemented.

## New files
- None.

## Verification goals
- [x] Webhook calls without valid `X-Webhook-Secret` header return 401.
- [x] Webhook calls with matching secret execute synchronization.

## Manual verification (for the human)
- Configure the matching `X-Webhook-Secret` in Google Apps Script form submit trigger.
