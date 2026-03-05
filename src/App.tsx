import React, { useState, useMemo, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronDown, ChevronRight, Target, DollarSign, PiggyBank, Upload, TrendingUp, TrendingDown, X } from 'lucide-react';

// Types
interface Category {
  id: string;
  name: string;
  groupId: string;
  type: 'Income' | 'Expense' | 'Savings' | 'Credit Card';
  frequency: 'Fixed' | 'Flexible' | 'Monthly' | 'Annual' | 'Ad-Hoc';
  monthlyData: Record<string, number>;
  average: number;
  total: number;
  target: number;
  forecasted: Record<string, number>;
}

interface CategoryGroup {
  id: string;
  name: string;
  emoji: string;
  isIncome: boolean;
}

// CSV Parser helper
const parseCSV = (text: string): string[][] => {
  const lines = text.split('\n');
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  });
};

// Month abbreviations for detecting [MONTH] prefix
const monthAbbreviations = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Helper to detect prefix patterns and determine frequency/target
interface PrefixAnalysis {
  frequency: 'Fixed' | 'Flexible' | 'Monthly' | 'Annual' | 'Ad-Hoc';
  targetOverride: number | null;
  isCompleted: boolean;
}

const analyzeCategoryPrefix = (name: string, monthlyData: Record<string, number>): PrefixAnalysis => {
  // Check for [x] prefix - cancelled/completed
  if (/^\[x\]/i.test(name)) {
    return { frequency: 'Monthly', targetOverride: 0, isCompleted: true };
  }
  
  // Check for green check emoji ✅ - goal met
  if (name.includes('✅')) {
    return { frequency: 'Monthly', targetOverride: 0, isCompleted: true };
  }
  
  // Check for [MONTH] prefix (annual charge)
  const monthMatch = name.match(/^\[([A-Za-z]{3})\]/);
  if (monthMatch && monthAbbreviations.includes(monthMatch[1].toUpperCase())) {
    const values = Object.values(monthlyData).map(Math.abs).filter(v => v > 0);
    const annualCharge = values.length > 0 ? Math.max(...values) : 0;
    const monthlyTarget = Math.round(annualCharge / 12);
    return { frequency: 'Annual', targetOverride: monthlyTarget, isCompleted: false };
  }
  
  // Check for [number] prefix (monthly fixed charge)
  const numberMatch = name.match(/^\[(\d+)\]/);
  if (numberMatch) {
    const target = getMostRecentOrMode(monthlyData);
    return { frequency: 'Monthly', targetOverride: target, isCompleted: false };
  }
  
  // Check for [Flex] prefix
  if (/^\[Flex\]/i.test(name)) {
    return { frequency: 'Flexible', targetOverride: null, isCompleted: false };
  }
  
  // Check for [E1Y] or similar patterns (every 1 year = annual)
  if (/^\[E\d+Y\]/i.test(name)) {
    const values = Object.values(monthlyData).map(Math.abs).filter(v => v > 0);
    const annualCharge = values.length > 0 ? Math.max(...values) : 0;
    const monthlyTarget = Math.round(annualCharge / 12);
    return { frequency: 'Annual', targetOverride: monthlyTarget, isCompleted: false };
  }
  
  return { frequency: 'Monthly', targetOverride: null, isCompleted: false };
};

// Get the most recent non-zero value or the mode of the dataset
const getMostRecentOrMode = (monthlyData: Record<string, number>): number => {
  const entries = Object.entries(monthlyData);
  const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  entries.sort((a, b) => {
    const [monthA, yearA] = a[0].split(' ');
    const [monthB, yearB] = b[0].split(' ');
    if (yearA !== yearB) return parseInt(yearA) - parseInt(yearB);
    return monthOrder.indexOf(monthA) - monthOrder.indexOf(monthB);
  });
  
  for (let i = entries.length - 1; i >= 0; i--) {
    const value = Math.abs(entries[i][1]);
    if (value > 0) {
      return Math.round(value);
    }
  }
  
  const nonZeroValues = entries.map(e => Math.abs(e[1])).filter(v => v > 0);
  if (nonZeroValues.length === 0) return 0;
  
  const frequency: Record<number, number> = {};
  let maxFreq = 0;
  let mode = nonZeroValues[0];
  
  for (const val of nonZeroValues) {
    const rounded = Math.round(val);
    frequency[rounded] = (frequency[rounded] || 0) + 1;
    if (frequency[rounded] > maxFreq) {
      maxFreq = frequency[rounded];
      mode = rounded;
    }
  }
  
  return mode;
};

// Sample data
const sampleGroups: CategoryGroup[] = [
  { id: 'income', name: 'All Income Sources', emoji: '💵', isIncome: true },
  { id: 'discretionary', name: 'Discretionary Spend', emoji: '💸', isIncome: false },
  { id: 'home', name: 'Home & Utilities', emoji: '🏡', isIncome: false },
  { id: 'subscriptions', name: 'Subscriptions', emoji: '📲', isIncome: false },
];

const defaultMonths = ['Jan 2025', 'Feb 2025', 'Mar 2025', 'Apr 2025', 'May 2025', 'Jun 2025'];

const generateSampleData = (): Category[] => {
  const categories: Category[] = [];
  
  const items = [
    { name: 'Salary', groupId: 'income', avg: 4500, type: 'Income' as const },
    { name: '💵 Fun Money', groupId: 'discretionary', avg: -150, type: 'Expense' as const },
    { name: '🍽️ Food/Going out', groupId: 'discretionary', avg: -280, type: 'Expense' as const },
    { name: '[1] Rent', groupId: 'home', avg: -1850, type: 'Expense' as const },
    { name: '[Flex] Groceries', groupId: 'home', avg: -450, type: 'Expense' as const },
    { name: 'Netflix', groupId: 'subscriptions', avg: -16, type: 'Expense' as const },
    { name: 'Spotify', groupId: 'subscriptions', avg: -11, type: 'Expense' as const },
  ];
  
  items.forEach((item, idx) => {
    const monthlyData: Record<string, number> = {};
    defaultMonths.forEach(m => {
      monthlyData[m] = item.avg + (Math.random() - 0.5) * Math.abs(item.avg) * 0.2;
    });
    const values = Object.values(monthlyData);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const prefixAnalysis = analyzeCategoryPrefix(item.name, monthlyData);
    
    categories.push({
      id: `cat-${idx}`,
      name: item.name,
      groupId: item.groupId,
      type: item.type,
      frequency: prefixAnalysis.frequency,
      monthlyData,
      average: avg,
      total: values.reduce((a, b) => a + b, 0),
      target: prefixAnalysis.targetOverride ?? Math.round(Math.abs(avg)),
      forecasted: {},
    });
  });
  
  return categories;
};

function App() {
  const [categories, setCategories] = useState<Category[]>(generateSampleData);
  const [groups, setGroups] = useState<CategoryGroup[]>(sampleGroups);
  const [availableMonths, setAvailableMonths] = useState<string[]>(defaultMonths);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [monthlyIncome, setMonthlyIncome] = useState<number>(5000);
  const [plannedSavings, setPlannedSavings] = useState<number>(0);
  const [dateRange, setDateRange] = useState({ start: defaultMonths[0], end: defaultMonths[defaultMonths.length - 1] });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle CSV Upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      
      if (rows.length < 2) return;

      const headers = rows[0];
      const monthColumns = headers.slice(1, -2);
      setAvailableMonths(monthColumns);
      setDateRange({ start: monthColumns[0], end: monthColumns[monthColumns.length - 1] });

      const skipRowPatterns = ['Total Income', 'Total Expenses', 'Net Income'];
      const knownGroupHeaders = ['All Income Sources'];
      
      interface ParsedRow {
        index: number;
        name: string;
        total: number;
        monthlyData: Record<string, number>;
        average: number;
        isGroupHeader: boolean;
        groupId: string;
        isKnownGroup: boolean;
      }
      
      const parsedRows: ParsedRow[] = [];
      
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2 || !row[0]) continue;
        
        const name = row[0].trim();
        if (skipRowPatterns.some(p => name.includes(p))) continue;
        
        const isKnownGroup = knownGroupHeaders.some(g => name === g);
        
        const monthlyData: Record<string, number> = {};
        monthColumns.forEach((month, idx) => {
          const value = parseFloat(row[idx + 1]?.replace(/[$,]/g, '') || '0');
          monthlyData[month] = isNaN(value) ? 0 : value;
        });
        
        const values = Object.values(monthlyData);
        const total = values.reduce((a, b) => a + b, 0);
        const average = values.length > 0 ? total / values.length : 0;
        
        const groupId = isKnownGroup 
          ? name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30) + '-' + i
          : '';
        
        parsedRows.push({
          index: i,
          name,
          total,
          monthlyData,
          average,
          isGroupHeader: isKnownGroup,
          groupId: groupId,
          isKnownGroup,
        });
      }
      
      // Assign categories to known groups
      for (let i = 0; i < parsedRows.length; i++) {
        const currentRow = parsedRows[i];
        if (currentRow.isKnownGroup && currentRow.isGroupHeader) {
          let accumulatedSum = 0;
          for (let j = i + 1; j < parsedRows.length; j++) {
            const nextRow = parsedRows[j];
            if (nextRow.isGroupHeader) break;
            accumulatedSum += nextRow.total;
            nextRow.groupId = currentRow.groupId;
            if (Math.abs(currentRow.total - accumulatedSum) < 0.01) break;
          }
        }
      }
      
      // Sum-matching for remaining groups
      const tolerance = 0.01;
      for (let i = 0; i < parsedRows.length; i++) {
        const currentRow = parsedRows[i];
        if (currentRow.isGroupHeader) continue;
        
        let accumulatedSum = 0;
        for (let j = i + 1; j < parsedRows.length; j++) {
          const nextRow = parsedRows[j];
          if (nextRow.isGroupHeader) break;
          accumulatedSum += nextRow.total;
          
          if (Math.abs(currentRow.total - accumulatedSum) < tolerance && j > i) {
            currentRow.isGroupHeader = true;
            const groupId = currentRow.name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30) + '-' + i;
            currentRow.groupId = groupId;
            for (let k = i + 1; k <= j; k++) {
              parsedRows[k].groupId = groupId;
            }
            break;
          }
          
          if (Math.abs(accumulatedSum) > Math.abs(currentRow.total) + tolerance && 
              Math.sign(accumulatedSum) === Math.sign(currentRow.total)) {
            break;
          }
        }
      }
      
      // Build groups and categories
      const newGroups: CategoryGroup[] = [];
      const newCategories: Category[] = [];
      let currentGroupId = 'uncategorized';
      
      for (const row of parsedRows) {
        const emojiMatch = row.name.match(/^([\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}])/u);
        const emoji = emojiMatch ? emojiMatch[0] : '📁';
        const nameWithoutEmoji = emojiMatch ? row.name.replace(emojiMatch[0], '').trim() : row.name;
        
        if (row.isGroupHeader) {
          const isIncome = row.total > 0 || row.name.toLowerCase().includes('income');
          newGroups.push({
            id: row.groupId,
            name: nameWithoutEmoji,
            emoji: emoji,
            isIncome: isIncome,
          });
          currentGroupId = row.groupId;
        } else {
          const groupId = row.groupId || currentGroupId;
          const avgValue = row.average;
          const type: Category['type'] = avgValue > 0 
            ? 'Income' 
            : (row.name.toLowerCase().includes('saving') || row.name.toLowerCase().includes('invest') 
              ? 'Savings' 
              : 'Expense');
          
          const prefixAnalysis = analyzeCategoryPrefix(row.name, row.monthlyData);
          const target = prefixAnalysis.targetOverride !== null 
            ? prefixAnalysis.targetOverride 
            : Math.round(Math.abs(row.average));
          
          newCategories.push({
            id: `cat-${row.index}`,
            name: row.name,
            groupId: groupId,
            type,
            frequency: prefixAnalysis.frequency,
            monthlyData: row.monthlyData,
            average: row.average,
            total: row.total,
            target,
            forecasted: {},
          });
        }
      }
      
      if (newGroups.length > 0) setGroups(newGroups);
      if (newCategories.length > 0) setCategories(newCategories);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // KPI values
  const kpiValues = useMemo(() => {
    const totalTargets = categories
      .filter(c => c.type !== 'Income')
      .reduce((sum, c) => sum + c.target, 0);
    const remaining = monthlyIncome - totalTargets - plannedSavings;
    return { targets: totalTargets, income: monthlyIncome, savings: plannedSavings, remaining };
  }, [categories, monthlyIncome, plannedSavings]);

  const visibleMonths = useMemo(() => {
    const startIdx = availableMonths.indexOf(dateRange.start);
    const endIdx = availableMonths.indexOf(dateRange.end);
    if (startIdx === -1 || endIdx === -1) return availableMonths;
    return availableMonths.slice(startIdx, endIdx + 1);
  }, [dateRange, availableMonths]);

  const groupedCategories = useMemo(() => {
    const grouped: Record<string, Category[]> = {};
    groups.forEach(g => {
      grouped[g.id] = categories.filter(c => c.groupId === g.id);
    });
    return grouped;
  }, [categories, groups]);

  const groupTotals = useMemo(() => {
    const totals: Record<string, { average: number; monthlyTotals: Record<string, number>; targetSum: number }> = {};
    groups.forEach(g => {
      const groupCats = groupedCategories[g.id] || [];
      const monthlyTotals: Record<string, number> = {};
      availableMonths.forEach(m => {
        monthlyTotals[m] = groupCats.reduce((sum, c) => sum + (c.monthlyData[m] || 0), 0);
      });
      totals[g.id] = {
        average: groupCats.reduce((sum, c) => sum + c.average, 0),
        monthlyTotals,
        targetSum: groupCats.reduce((sum, c) => sum + c.target, 0),
      };
    });
    return totals;
  }, [groupedCategories, groups, availableMonths]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const updateTarget = (categoryId: string, newTarget: number) => {
    setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, target: newTarget } : c));
  };

  const updateCategoryField = (categoryId: string, field: 'type' | 'frequency', value: string) => {
    setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, [field]: value } : c));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(value));
  };

  const getCellColor = (value: number, isIncome: boolean) => {
    if (value === 0) return 'text-gray-400';
    if (isIncome) return value > 0 ? 'text-emerald-600' : 'text-red-500';
    return value < 0 ? 'text-gray-900' : 'text-emerald-600';
  };

  const chartData = useMemo(() => {
    if (!selectedCategory) return [];
    return availableMonths.map(m => ({
      month: m.split(' ')[0],
      amount: Math.abs(selectedCategory.monthlyData[m] || 0),
    }));
  }, [selectedCategory, availableMonths]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <PiggyBank className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Budget Dashboard</h1>
              <p className="text-sm text-slate-500">Your YNAB data, visualized</p>
            </div>
          </div>
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv"
              className="hidden"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload CSV
            </button>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-[1800px] mx-auto">
        {/* KPI Boxes */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-slate-600">Total Targets</span>
            </div>
            <div className="text-3xl font-bold text-slate-900">{formatCurrency(kpiValues.targets)}</div>
            <p className="text-xs text-slate-500 mt-1">Sum of all monthly targets</p>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-sm font-medium text-slate-600">Monthly Income</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold text-slate-900">$</span>
              <input
                type="number"
                value={monthlyIncome}
                onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                className="text-3xl font-bold text-slate-900 border-0 border-b-2 border-slate-200 bg-transparent w-32 focus:outline-none focus:border-blue-500"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">Your typical monthly income</p>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <PiggyBank className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-sm font-medium text-slate-600">Planned Savings</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold text-slate-900">$</span>
              <input
                type="number"
                value={plannedSavings}
                onChange={(e) => setPlannedSavings(Number(e.target.value))}
                className="text-3xl font-bold text-slate-900 border-0 border-b-2 border-slate-200 bg-transparent w-32 focus:outline-none focus:border-purple-500"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">Monthly savings/investing transfer</p>
          </div>

          <div className={`rounded-lg border-2 p-5 ${kpiValues.remaining >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpiValues.remaining >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                {kpiValues.remaining >= 0 ? (
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-600" />
                )}
              </div>
              <span className="text-sm font-medium text-slate-600">Remaining</span>
            </div>
            <div className={`text-3xl font-bold ${kpiValues.remaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {kpiValues.remaining >= 0 ? '+' : '-'}{formatCurrency(kpiValues.remaining)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {kpiValues.remaining >= 0 ? 'Available to assign' : 'Over budget'}
            </p>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="flex gap-4 mb-6 items-center">
          <span className="text-sm font-medium text-slate-600">Date Range:</span>
          <select 
            value={dateRange.start} 
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
          >
            {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <span className="text-slate-400">to</span>
          <select 
            value={dateRange.end} 
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
          >
            {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* Main Table */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700 sticky left-0 bg-slate-50 min-w-[280px]">Category</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-700 min-w-[100px]">Type</th>
                  <th className="text-left py-3 px-3 font-semibold text-slate-700 min-w-[100px]">Frequency</th>
                  <th className="text-right py-3 px-3 font-semibold text-blue-700 bg-blue-50 min-w-[100px]">Target</th>
                  <th className="text-right py-3 px-3 font-semibold text-slate-700 bg-slate-100 min-w-[90px]">Average</th>
                  {visibleMonths.map(month => (
                    <th key={month} className="text-right py-3 px-3 font-semibold text-slate-700 min-w-[90px]">
                      {month.split(' ')[0]}
                    </th>
                  ))}
                  <th className="text-right py-3 px-3 font-semibold text-slate-700 bg-slate-100 min-w-[100px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(group => {
                  const groupCats = groupedCategories[group.id] || [];
                  const isCollapsed = collapsedGroups.has(group.id);
                  const totals = groupTotals[group.id];
                  
                  return (
                    <React.Fragment key={group.id}>
                      <tr 
                        className="bg-slate-100 border-b border-slate-200 cursor-pointer hover:bg-slate-150"
                        onClick={() => toggleGroup(group.id)}
                      >
                        <td className="py-2.5 px-4 font-semibold text-slate-800 sticky left-0 bg-slate-100">
                          <div className="flex items-center gap-2">
                            {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            <span>{group.emoji}</span>
                            <span>{group.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">—</td>
                        <td className="py-2.5 px-3 text-slate-500">—</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-blue-700 bg-blue-50/50">
                          {group.isIncome ? '—' : formatCurrency(totals?.targetSum || 0)}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-semibold bg-slate-100 ${getCellColor(totals?.average || 0, group.isIncome)}`}>
                          {formatCurrency(totals?.average || 0)}
                        </td>
                        {visibleMonths.map(month => (
                          <td key={month} className={`py-2.5 px-3 text-right font-semibold ${getCellColor(totals?.monthlyTotals[month] || 0, group.isIncome)}`}>
                            {formatCurrency(totals?.monthlyTotals[month] || 0)}
                          </td>
                        ))}
                        <td className={`py-2.5 px-3 text-right font-semibold bg-slate-100 ${getCellColor(groupCats.reduce((s, c) => s + c.total, 0), group.isIncome)}`}>
                          {formatCurrency(groupCats.reduce((s, c) => s + c.total, 0))}
                        </td>
                      </tr>
                      
                      {!isCollapsed && groupCats.map(category => (
                        <tr 
                          key={category.id} 
                          className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                          onClick={() => setSelectedCategory(category)}
                        >
                          <td className="py-2 px-4 pl-10 text-slate-700 sticky left-0 bg-white">{category.name}</td>
                          <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                            <select 
                              value={category.type} 
                              onChange={(e) => updateCategoryField(category.id, 'type', e.target.value)}
                              className="h-7 text-xs bg-transparent border border-slate-200 rounded px-2"
                            >
                              <option value="Income">Income</option>
                              <option value="Expense">Expense</option>
                              <option value="Savings">Savings</option>
                              <option value="Credit Card">Credit Card</option>
                            </select>
                          </td>
                          <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                            <select 
                              value={category.frequency} 
                              onChange={(e) => updateCategoryField(category.id, 'frequency', e.target.value)}
                              className="h-7 text-xs bg-transparent border border-slate-200 rounded px-2"
                            >
                              <option value="Fixed">Fixed</option>
                              <option value="Flexible">Flexible</option>
                              <option value="Monthly">Monthly</option>
                              <option value="Annual">Annual</option>
                              <option value="Ad-Hoc">Ad-Hoc</option>
                            </select>
                          </td>
                          <td className="py-2 px-3 bg-blue-50/30" onClick={(e) => e.stopPropagation()}>
                            {category.type === 'Income' ? (
                              <span className="text-slate-400 text-right block">—</span>
                            ) : (
                              <input
                                type="number"
                                value={category.target}
                                onChange={(e) => updateTarget(category.id, Number(e.target.value))}
                                className="h-7 text-xs text-right w-20 ml-auto block bg-white border border-blue-200 rounded px-2"
                              />
                            )}
                          </td>
                          <td className={`py-2 px-3 text-right bg-slate-50 ${getCellColor(category.average, group.isIncome)}`}>
                            {formatCurrency(category.average)}
                          </td>
                          {visibleMonths.map(month => (
                            <td key={month} className={`py-2 px-3 text-right ${getCellColor(category.monthlyData[month] || 0, group.isIncome)}`}>
                              {formatCurrency(category.monthlyData[month] || 0)}
                            </td>
                          ))}
                          <td className={`py-2 px-3 text-right bg-slate-50 ${getCellColor(category.total, group.isIncome)}`}>
                            {formatCurrency(category.total)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
                
                <tr className="bg-slate-800 text-white font-semibold">
                  <td className="py-3 px-4 sticky left-0 bg-slate-800">Net Income</td>
                  <td className="py-3 px-3">—</td>
                  <td className="py-3 px-3">—</td>
                  <td className="py-3 px-3 text-right bg-slate-700">{formatCurrency(kpiValues.remaining)}</td>
                  <td className="py-3 px-3 text-right bg-slate-700">{formatCurrency(categories.reduce((s, c) => s + c.average, 0))}</td>
                  {visibleMonths.map(month => {
                    const monthTotal = categories.reduce((s, c) => s + (c.monthlyData[month] || 0), 0);
                    return (
                      <td key={month} className={`py-3 px-3 text-right ${monthTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(monthTotal)}
                      </td>
                    );
                  })}
                  <td className="py-3 px-3 text-right bg-slate-700">{formatCurrency(categories.reduce((s, c) => s + c.total, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Side Panel */}
      {selectedCategory && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedCategory(null)}>
          <div 
            className="fixed right-0 top-0 h-full w-[500px] bg-white shadow-xl z-50 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">{selectedCategory.name}</h2>
                <button onClick={() => setSelectedCategory(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">Average</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(selectedCategory.average)}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-600 mb-1">Target</p>
                  <p className="text-xl font-bold text-blue-700">{formatCurrency(selectedCategory.target)}</p>
                </div>
              </div>

              <div className="h-64 mb-6">
                <p className="text-sm font-medium text-slate-700 mb-3">Monthly Spending</p>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), 'Amount']} />
                    <Bar dataKey="amount" fill={selectedCategory.type === 'Income' ? '#10b981' : '#3b82f6'} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Insights</p>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    {Math.abs(selectedCategory.average) > selectedCategory.target 
                      ? `⚠️ Average exceeds target by ${formatCurrency(Math.abs(selectedCategory.average) - selectedCategory.target)}`
                      : `✅ On track! Target is ${formatCurrency(selectedCategory.target - Math.abs(selectedCategory.average))} above average`
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
