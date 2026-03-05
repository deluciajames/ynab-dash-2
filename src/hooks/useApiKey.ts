import { useState, useCallback } from 'react';

const STORAGE_KEY = 'ynab_api_token';
const BUDGET_KEY = 'ynab_selected_budget';

export function useApiKey() {
  const [apiKey, setApiKeyState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setApiKey = useCallback((key: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      // localStorage unavailable
    }
    setApiKeyState(key);
  }, []);

  const clearApiKey = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BUDGET_KEY);
    } catch {
      // localStorage unavailable
    }
    setApiKeyState(null);
  }, []);

  return { apiKey, setApiKey, clearApiKey };
}

export function useBudgetId() {
  const [budgetId, setBudgetIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(BUDGET_KEY);
    } catch {
      return null;
    }
  });

  const setBudgetId = useCallback((id: string) => {
    try {
      localStorage.setItem(BUDGET_KEY, id);
    } catch {
      // localStorage unavailable
    }
    setBudgetIdState(id);
  }, []);

  const clearBudgetId = useCallback(() => {
    try {
      localStorage.removeItem(BUDGET_KEY);
    } catch {
      // localStorage unavailable
    }
    setBudgetIdState(null);
  }, []);

  return { budgetId, setBudgetId, clearBudgetId };
}
