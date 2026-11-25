import type { OverridesMap } from "./planning";
import type { ReimbursementStore } from "./reimbursements";

export interface CloudBudgetPreferences {
  version: 1;
  plan: {
    overrides: OverridesMap;
    annualReserve: number;
    incomeInput: string;
    // Added after version 1 shipped; older saved settings leave it out.
    cushionMonthly?: number;
  };
  sortOrder: string[];
  reimbursements: ReimbursementStore;
}

export interface CloudPreferencesRecord {
  settings: CloudBudgetPreferences | null;
  revision: number | null;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok) {
    const error = new Error(
      body.error || "Could not sync your saved settings.",
    );
    Object.assign(error, { status: response.status, body });
    throw error;
  }
  return body;
}

export function loadCloudPreferences(budgetId: string) {
  return request<CloudPreferencesRecord>(
    `/api/preferences/${encodeURIComponent(budgetId)}`,
  );
}

export function saveCloudPreferences(
  budgetId: string,
  settings: CloudBudgetPreferences,
  expectedRevision: number | null,
) {
  return request<CloudPreferencesRecord>(
    `/api/preferences/${encodeURIComponent(budgetId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ settings, expectedRevision }),
    },
  );
}
