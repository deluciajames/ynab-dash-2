import React, { useState, useRef } from 'react';
import { GripVertical, X } from 'lucide-react';
import type { CategoryGroup } from '../api/transform';

interface SortGroupsModalProps {
  groups: CategoryGroup[];
  currentOrder: string[];
  onSave: (order: string[]) => void;
  onClose: () => void;
}

export function SortGroupsModal({ groups, currentOrder, onSave, onClose }: SortGroupsModalProps) {
  const expenseGroups = groups.filter(g => !g.isIncome);

  const initialOrder = (() => {
    if (currentOrder.length > 0) {
      const orderMap = new Map(currentOrder.map((id, idx) => [id, idx]));
      const sorted = [...expenseGroups];
      sorted.sort((a, b) => {
        const aIdx = orderMap.get(a.id) ?? Infinity;
        const bIdx = orderMap.get(b.id) ?? Infinity;
        if (aIdx === Infinity && bIdx === Infinity) return 0;
        return aIdx - bIdx;
      });
      return sorted;
    }
    return expenseGroups;
  })();

  const [orderedGroups, setOrderedGroups] = useState<CategoryGroup[]>(initialOrder);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) return;

    const updated = [...orderedGroups];
    const [removed] = updated.splice(dragItem.current, 1);
    updated.splice(dragOverItem.current, 0, removed);
    setOrderedGroups(updated);

    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleDragEnd = () => {
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleSave = () => {
    onSave(orderedGroups.map(g => g.id));
    onClose();
  };

  const handleReset = () => {
    setOrderedGroups(expenseGroups);
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Sort Category Groups</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-3 overflow-y-auto flex-1">
          <p className="text-sm text-slate-500 mb-4">Drag and drop to reorder groups to match your YNAB layout.</p>
          <div className="space-y-1">
            {orderedGroups.map((group, index) => (
              <div
                key={group.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200 cursor-grab active:cursor-grabbing hover:bg-slate-100 transition-colors"
              >
                <GripVertical className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-base">{group.emoji}</span>
                <span className="text-sm font-medium text-slate-700">{group.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
          <button
            onClick={handleReset}
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Reset to Default
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
