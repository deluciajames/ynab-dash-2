import { useState, useCallback } from 'react';

const STORAGE_KEY = 'ynab_category_overrides';

export interface CategoryOverride {
  target?: number;
  buffer?: number;
  lockedTarget?: boolean;
  lockedBuffer?: boolean;
}

export type OverridesMap = Record<string, CategoryOverride>;

export function useCategoryOverrides() {
  const [overrides, setOverridesState] = useState<OverridesMap>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) as OverridesMap;
    } catch {
      return {};
    }
  });

  const persist = useCallback((data: OverridesMap) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // quota exceeded
    }
  }, []);

  const setOverride = useCallback((categoryId: string, override: Partial<CategoryOverride>) => {
    setOverridesState(prev => {
      const next = { ...prev, [categoryId]: { ...prev[categoryId], ...override } };
      persist(next);
      return next;
    });
  }, [persist]);

  const clearOverride = useCallback((categoryId: string) => {
    setOverridesState(prev => {
      const next = { ...prev };
      delete next[categoryId];
      persist(next);
      return next;
    });
  }, [persist]);

  const clearAll = useCallback(() => {
    setOverridesState({});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // unavailable
    }
  }, []);

  return { overrides, setOverride, clearOverride, clearAll };
}
