import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { SankeyData, SankeyLink, SankeyNode } from '@/src/services/reports/reportSnapshot';
import {
  SankeyGraph,
  SankeyLink as D3SankeyLink,
  SankeyNode as D3SankeyNode,
  sankey,
} from 'd3-sankey';

export type LayoutNode = D3SankeyNode<SankeyNode, SankeyLink>;
export type LayoutLink = D3SankeyLink<SankeyNode, SankeyLink>;
export type LayoutGraph = SankeyGraph<SankeyNode, SankeyLink>;

export interface SankeySideNodes {
  income: SankeyNode[];
  spending: SankeyNode[];
}

export function countSankeySideRows(nodes: SankeyNode[], links: SankeyLink[]): number {
  const { income, spending } = partitionSankeyNodes(nodes, links);
  return Math.max(income.length, spending.length, 1);
}

export function resolveSankeyChartHeight(sideRows: number): number {
  const { sankeyMinHeight, sankeyMaxHeight, sankeyMarginVertical, sankeyNodePadding } =
    REPORT_CHART_LAYOUT;
  const estimated =
    sideRows * 64 + Math.max(0, sideRows - 1) * sankeyNodePadding + sankeyMarginVertical * 2;
  return Math.min(sankeyMaxHeight, Math.max(sankeyMinHeight, estimated));
}

/** Drops tiny flows from the chart while keeping them in the legend. */
export function prepareSankeyChartData(data: SankeyData, minSharePercent = 1): SankeyData {
  const basis = Math.max(
    data.summary.totalIncome + data.summary.deficit,
    data.summary.totalExpense,
    1,
  );
  const minValue = (basis * minSharePercent) / 100;
  const links = data.links.filter(link => link.value >= minValue);
  if (links.length === 0) return data;

  const nodeIds = new Set<string>();
  links.forEach(link => {
    nodeIds.add(link.source);
    nodeIds.add(link.target);
  });

  return {
    ...data,
    nodes: data.nodes.filter(node => nodeIds.has(node.id)),
    links,
  };
}

export function getSankeyNodeAmount(nodeId: string, links: SankeyLink[]): number {
  const incomeLink = links.find(link => link.source === nodeId && link.target === 'total_income');
  if (incomeLink) return incomeLink.value;

  const spendingLink = links.find(link => link.source === 'total_income' && link.target === nodeId);
  return spendingLink?.value ?? 0;
}

export function partitionSankeyNodes(nodes: SankeyNode[], links: SankeyLink[]): SankeySideNodes {
  const incomeIds = new Set(
    links.filter(link => link.target === 'total_income').map(link => link.source),
  );
  const spendingIds = new Set(
    links.filter(link => link.source === 'total_income').map(link => link.target),
  );

  const valueById = new Map<string, number>();
  links.forEach(link => {
    valueById.set(link.source, (valueById.get(link.source) ?? 0) + link.value);
    valueById.set(link.target, (valueById.get(link.target) ?? 0) + link.value);
  });

  const sortByValue = (a: SankeyNode, b: SankeyNode) =>
    (valueById.get(b.id) ?? 0) - (valueById.get(a.id) ?? 0);

  return {
    income: nodes.filter(node => incomeIds.has(node.id)).sort(sortByValue),
    spending: nodes.filter(node => spendingIds.has(node.id)).sort(sortByValue),
  };
}

export function sankeyRibbonPath(link: LayoutLink): string {
  const source = link.source;
  const target = link.target;
  if (typeof source === 'string' || typeof target === 'string') return '';

  const sourceNode = source as LayoutNode;
  const targetNode = target as LayoutNode;
  const width = link.width ?? 0;
  if (width <= 0) return '';

  const sourceX = sourceNode.x1 ?? 0;
  const targetX = targetNode.x0 ?? 0;
  const sourceTop = (link.y0 ?? 0) - width / 2;
  const sourceBottom = (link.y0 ?? 0) + width / 2;
  const targetTop = (link.y1 ?? 0) - width / 2;
  const targetBottom = (link.y1 ?? 0) + width / 2;
  const distance = targetX - sourceX;
  const cp1x = sourceX + distance * 0.42;
  const cp2x = sourceX + distance * 0.58;

  return [
    `M ${sourceX} ${sourceTop}`,
    `C ${cp1x} ${sourceTop}, ${cp2x} ${targetTop}, ${targetX} ${targetTop}`,
    `L ${targetX} ${targetBottom}`,
    `C ${cp2x} ${targetBottom}, ${cp1x} ${sourceBottom}, ${sourceX} ${sourceBottom}`,
    'Z',
  ].join(' ');
}

export function computeSankeyLayout(
  nodes: SankeyNode[],
  links: SankeyLink[],
  width: number,
  height: number,
): LayoutGraph | null {
  if (nodes.length === 0 || links.length === 0) return null;

  const { sankeyNodeWidth, sankeyNodePadding, sankeyLabelGutter, sankeyMarginVertical } =
    REPORT_CHART_LAYOUT;

  const graph: LayoutGraph = {
    nodes: nodes.map(node => ({ ...node })),
    links: links.map(link => ({ ...link })),
  };

  const layout = sankey<SankeyNode, SankeyLink>()
    .nodeId(node => node.id)
    .nodeWidth(sankeyNodeWidth)
    .nodePadding(sankeyNodePadding)
    .nodeSort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .extent([
      [sankeyLabelGutter, sankeyMarginVertical],
      [width - sankeyLabelGutter, height - sankeyMarginVertical],
    ]);

  return layout(graph);
}
