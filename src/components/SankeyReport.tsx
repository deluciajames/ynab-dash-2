import { useMemo } from 'react';
import { ResponsiveSankey } from '@nivo/sankey';
import type { SankeyNodeDatum, SankeyLinkDatum, DefaultLink } from '@nivo/sankey';
import type { Category, CategoryGroup } from '../api/transform';

interface SankeyReportProps {
  categories: Category[];
  groups: CategoryGroup[];
  takeHome: number | null;
}

interface SankeyNode {
  id: string;
  nodeColor: string;
  nodeLabel: string;
}

type NodeDatum = SankeyNodeDatum<SankeyNode, DefaultLink>;
type LinkDatum = SankeyLinkDatum<SankeyNode, DefaultLink>;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

const NODE_COLORS: Record<string, string> = {
  income: '#10b981',
  remaining: '#6ee7b7',
};

const GROUP_PALETTE = [
  '#3b82f6',
  '#8b5cf6',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16',
];

export function SankeyReport({ categories, groups, takeHome }: SankeyReportProps) {
  const sankeyData = useMemo(() => {
    if (!takeHome || takeHome <= 0) return null;

    const expenseGroups = groups.filter(g => !g.isIncome);

    const nodes: SankeyNode[] = [];
    const links: DefaultLink[] = [];

    nodes.push({ id: 'TakeHome', nodeColor: NODE_COLORS.income, nodeLabel: 'Take Home' });

    let totalExpenseAvg = 0;
    let colorIdx = 0;

    for (const group of expenseGroups) {
      const groupCats = categories.filter(c => c.groupId === group.id);
      const groupTotal = groupCats.reduce((sum, c) => sum + Math.abs(c.average), 0);
      if (groupTotal === 0) continue;

      const groupColor = GROUP_PALETTE[colorIdx % GROUP_PALETTE.length];
      colorIdx++;

      const groupNodeId = `group_${group.id}`;
      nodes.push({ id: groupNodeId, nodeColor: groupColor, nodeLabel: group.name });
      links.push({ source: 'TakeHome', target: groupNodeId, value: groupTotal });
      totalExpenseAvg += groupTotal;

      for (const cat of groupCats) {
        const catAvg = Math.abs(cat.average);
        if (catAvg === 0) continue;
        const catNodeId = `cat_${cat.id}`;
        nodes.push({ id: catNodeId, nodeColor: groupColor, nodeLabel: cat.name });
        links.push({ source: groupNodeId, target: catNodeId, value: catAvg });
      }
    }

    const remaining = Math.max(0, takeHome - totalExpenseAvg);
    if (remaining > 0) {
      nodes.push({ id: 'Remaining', nodeColor: NODE_COLORS.remaining, nodeLabel: 'Remaining' });
      links.push({ source: 'TakeHome', target: 'Remaining', value: remaining });
    }

    if (links.length === 0) return null;

    return { nodes, links };
  }, [categories, groups, takeHome]);

  if (!sankeyData) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="bg-white border border-slate-200 rounded-lg p-8 max-w-md text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Set Your Take Home</h2>
          <p className="text-sm text-slate-500">
            Enter your Monthly Take Home on the Budget tab to see how your income flows into expense categories.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Money Flow</h2>
        <p className="text-sm text-slate-500">How your monthly average income flows into expense categories</p>
      </div>
      <div style={{ height: Math.max(500, sankeyData.nodes.length * 28) }}>
        <ResponsiveSankey<SankeyNode, DefaultLink>
          data={sankeyData}
          margin={{ top: 20, right: 200, bottom: 20, left: 200 }}
          align="justify"
          colors={(node) => node.nodeColor || '#94a3b8'}
          nodeOpacity={1}
          nodeHoverOpacity={1}
          nodeThickness={18}
          nodeSpacing={14}
          nodeBorderWidth={0}
          nodeBorderRadius={3}
          linkOpacity={0.3}
          linkHoverOpacity={0.6}
          linkContract={3}
          enableLinkGradient={true}
          labelPosition="outside"
          labelOrientation="horizontal"
          labelPadding={12}
          labelTextColor={{ from: 'color', modifiers: [['darker', 1.2]] }}
          label={(node) => `${node.nodeLabel}  ${formatCurrency(node.value || 0)}`}
          nodeTooltip={({ node }: { node: NodeDatum }) => (
            <div className="bg-white shadow-lg rounded-lg px-3 py-2 border border-slate-200">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: node.color }}
                />
                <span className="text-sm font-medium text-slate-700">{node.nodeLabel}</span>
              </div>
              <span className="text-sm font-bold text-slate-900">{formatCurrency(node.value || 0)}</span>
            </div>
          )}
          linkTooltip={({ link }: { link: LinkDatum }) => (
            <div className="bg-white shadow-lg rounded-lg px-3 py-2 border border-slate-200">
              <div className="text-xs text-slate-500 mb-1">
                {link.source.nodeLabel} → {link.target.nodeLabel}
              </div>
              <span className="text-sm font-bold text-slate-900">{formatCurrency(link.value)}</span>
            </div>
          )}
        />
      </div>
    </div>
  );
}
