import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, ChevronDown } from 'lucide-react';
import { fetchBudgets, type YnabBudgetSummary } from '../api/ynab';

interface BudgetSelectorProps {
  apiKey: string;
  selectedBudgetId: string | null;
  onSelectBudget: (budgetId: string) => void;
}

export function BudgetSelector({ apiKey, selectedBudgetId, onSelectBudget }: BudgetSelectorProps) {
  const [budgets, setBudgets] = useState<YnabBudgetSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBudgets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchBudgets(apiKey);
      setBudgets(result);
      if (result.length === 1 && !selectedBudgetId) {
        onSelectBudget(result[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load budgets');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBudgets();
  }, [apiKey]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading budgets...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-red-600">{error}</span>
        <button onClick={loadBudgets} className="p-1 hover:bg-slate-100 rounded">
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>
    );
  }

  if (budgets.length === 0) {
    return <span className="text-sm text-slate-500">No budgets found</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-slate-600">Budget:</label>
      <div className="relative">
        <select
          value={selectedBudgetId || ''}
          onChange={(e) => onSelectBudget(e.target.value)}
          className="appearance-none pl-3 pr-8 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="" disabled>Select a budget</option>
          {budgets.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
      <button onClick={loadBudgets} className="p-1.5 hover:bg-slate-100 rounded-lg" title="Refresh budgets">
        <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
      </button>
    </div>
  );
}
