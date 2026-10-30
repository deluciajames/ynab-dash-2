---
name: Budget data privacy
description: Privacy boundaries for syncing YNAB budget settings across sessions.
---

Save settings under both the signed-in account and selected YNAB budget. Keep the YNAB API token and full fetched transaction history in browser storage; send only planning preferences and the minimal transaction snapshots needed to restore user-chosen reimbursement decisions.

**Why:** This keeps saved preferences private to the account without centralizing credentials or complete transaction history.

**How to apply:** Preserve this boundary when extending database sync, adding import/export, or changing reimbursement matching.
