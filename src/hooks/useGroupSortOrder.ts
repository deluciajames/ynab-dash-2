import { useState, useCallback } from 'react';

const STORAGE_KEY = 'ynab_group_sort_order';

export function useGroupSortOrder() {
  const [sortOrder, setSortOrderState] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  });

  const setSortOrder = useCallback((order: string[]) => {
    setSortOrderState(order);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    } catch {
      // quota exceeded
    }
  }, []);

  const clearSortOrder = useCallback(() => {
    setSortOrderState([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // unavailable
    }
  }, []);

  return { sortOrder, setSortOrder, clearSortOrder };
}

export function applySortOrder<T extends { id: string }>(items: T[], sortOrder: string[]): T[] {
  if (sortOrder.length === 0) return items;

  const orderMap = new Map(sortOrder.map((id, idx) => [id, idx]));
  const sorted = [...items];
  sorted.sort((a, b) => {
    const aIdx = orderMap.get(a.id) ?? Infinity;
    const bIdx = orderMap.get(b.id) ?? Infinity;
    if (aIdx === Infinity && bIdx === Infinity) return 0;
    return aIdx - bIdx;
  });
  return sorted;
}
