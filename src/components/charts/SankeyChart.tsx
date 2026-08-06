import {
  computeSankeyLayout,
  countSankeySideRows,
  LayoutLink,
  LayoutNode,
  resolveSankeyChartHeight,
  sankeyRibbonPath,
} from '@/src/components/charts/sankeyLayout';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { useTheme } from '@/src/hooks/use-theme';
import { SankeyLink, SankeyNode } from '@/src/services/reports/reportSnapshot';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';

interface SankeyChartProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  width: number;
  height?: number;
}

function linkNodeId(endpoint: string | SankeyNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id;
}

function getNodeLabelPosition(node: LayoutNode) {
  const x0 = node.x0 ?? 0;
  const x1 = node.x1 ?? 0;
  const y0 = node.y0 ?? 0;
  const y1 = node.y1 ?? 0;
  const depth = node.depth ?? 0;
  const offset = REPORT_CHART_LAYOUT.sankeyLabelOffset;
  const midY = (y0 + y1) / 2 + 4;

  if (depth === 0) {
    return { x: x1 + offset, y: midY, textAnchor: 'start' as const };
  }
  if (depth === 2) {
    return { x: x0 - offset, y: midY, textAnchor: 'end' as const };
  }
  return { x: x1 + offset, y: y0 + 12, textAnchor: 'start' as const };
}

export const SankeyChart: React.FC<SankeyChartProps> = ({
  nodes,
  links,
  width,
  height: customHeight,
}) => {
  const { theme } = useTheme();
  const sideRows = useMemo(() => countSankeySideRows(nodes, links), [nodes, links]);
  const chartHeight = customHeight ?? resolveSankeyChartHeight(sideRows);
  const minLinkWidth = REPORT_CHART_LAYOUT.sankeyMinLinkWidth;
  const labelFontSize = REPORT_CHART_LAYOUT.sankeyChartLabelFontSize;

  const layout = useMemo(
    () => computeSankeyLayout(nodes, links, width, chartHeight),
    [nodes, links, width, chartHeight],
  );

  if (!layout) return null;

  const getLinkColor = (link: LayoutLink) => {
    const targetId = linkNodeId(link.target);
    const sourceId = linkNodeId(link.source);
    if (targetId === 'surplus' || targetId === 'savings') return theme.success;
    if (sourceId === 'drawdown') return theme.warning;
    if (sourceId === 'total_income') return theme.error;
    return theme.primary;
  };

  const getNodeColor = (node: LayoutNode) => {
    if (node.id === 'surplus') return theme.success;
    if (node.id === 'drawdown') return theme.warning;
    if (node.id === 'total_income') return theme.textSecondary;
    if ((node.depth ?? 0) === 0) return theme.primary;
    return theme.error;
  };

  return (
    <View style={[styles.container, { height: chartHeight, width }]}>
      <Svg height={chartHeight} width={width}>
        {layout.links
          .filter(link => (link.width ?? 0) >= minLinkWidth)
          .map((link, index) => {
            const path = sankeyRibbonPath(link);
            if (!path) return null;

            return (
              <Path
                key={`${linkNodeId(link.source)}-${linkNodeId(link.target)}-${index}`}
                d={path}
                fill={getLinkColor(link)}
                opacity={0.32}
              />
            );
          })}

        {layout.nodes.map(node => {
          const x0 = node.x0 ?? 0;
          const x1 = node.x1 ?? 0;
          const y0 = node.y0 ?? 0;
          const y1 = node.y1 ?? 0;
          const nodeWidth = x1 - x0;
          const nodeHeight = y1 - y0;
          if (nodeWidth <= 0 || nodeHeight <= 1) return null;

          const showLabel = nodeHeight >= 18;
          const label = getNodeLabelPosition(node);

          return (
            <React.Fragment key={node.id}>
              <Rect
                x={x0}
                y={y0}
                width={nodeWidth}
                height={nodeHeight}
                fill={getNodeColor(node)}
                rx={2}
              />
              {showLabel ? (
                <SvgText
                  x={label.x}
                  y={label.y}
                  fontSize={labelFontSize}
                  fontWeight="700"
                  fill={theme.text}
                  textAnchor={label.textAnchor}
                >
                  {node.name}
                </SvgText>
              ) : null}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
