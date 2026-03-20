import { useCallback } from 'react';
import type { Category, CategoryGroup } from '../api/transform';

const CACHE_PREFIX = 'ynab_budget_cache_';
const CACHE_VERSION = 3;

interface CachedData {
  categories: Category[];
  groups: CategoryGroup[];
  availableMonths: string[];
  lastUpdated: number;
  version?: number;
}

function getCacheKey(budgetId: string): string {
  return `${CACHE_PREFIX}${budgetId}`;
}

export function useCachedBudgetData() {
  const loadCached = useCallback((budgetId: string): CachedData | null => {
    try {
      const raw = localStorage.getItem(getCacheKey(budgetId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedData;
      if (!parsed.categories || !parsed.groups || !parsed.availableMonths || !parsed.lastUpdated || parsed.version !== CACHE_VERSION) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const saveData = useCallback((
    budgetId: string,
    categories: Category[],
    groups: CategoryGroup[],
    availableMonths: string[],
  ) => {
    const data: CachedData = {
      categories,
      groups,
      availableMonths,
      lastUpdated: Date.now(),
      version: CACHE_VERSION,
    };
    try {
      localStorage.setItem(getCacheKey(budgetId), JSON.stringify(data));
    } catch {
      // quota exceeded or unavailable
    }
  }, []);

  const clearData = useCallback((budgetId?: string) => {
    try {
      if (budgetId) {
        localStorage.removeItem(getCacheKey(budgetId));
      } else {
        const keys = Object.keys(localStorage);
        for (const key of keys) {
          if (key.startsWith(CACHE_PREFIX)) {
            localStorage.removeItem(key);
          }
        }
      }
    } catch {
      // unavailable
    }
  }, []);

  return { loadCached, saveData, clearData };
}

export function formatLastUpdated(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
