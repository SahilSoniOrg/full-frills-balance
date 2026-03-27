import { Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { useTheme } from '@/src/hooks/use-theme';
import { SankeyLink, SankeyNode } from '@/src/services/report-service';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React, { useMemo } from 'react';
import { Dimensions, View } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';

interface SankeyChartProps {
    nodes: SankeyNode[];
    links: SankeyLink[];
    height?: number;
    width?: number;
}

export const SankeyChart: React.FC<SankeyChartProps> = ({
    nodes,
    links,
    height = REPORT_CHART_LAYOUT.sankeyDefaultHeight,
    width: customWidth
}) => {
    const { theme } = useTheme();
    const windowWidth = Dimensions.get('window').width;
    const CHART_WIDTH = customWidth || (windowWidth - Spacing.lg * 2);

    const NODE_WIDTH = REPORT_CHART_LAYOUT.sankeyNodeWidth;
    const NODE_SPACING = REPORT_CHART_LAYOUT.sankeyNodeSpacing;
    const LABEL_OFFSET = REPORT_CHART_LAYOUT.sankeyLabelOffset;

    const layout = useMemo(() => {
        if (nodes.length === 0 || links.length === 0) return null;

        // Columns: Sources (0) -> Total (1) -> Sinks (2)
        const columns: Record<string, number> = {};
        const sources = links.filter(l => l.target === 'total_income').map(l => l.source);

        nodes.forEach(n => {
            if (n.id === 'total_income') columns[n.id] = 1;
            else if (sources.includes(n.id)) columns[n.id] = 0;
            else columns[n.id] = 2;
        });

        const columnNodes: SankeyNode[][] = [[], [], []];
        nodes.forEach(n => columnNodes[columns[n.id]].push(n));

        const nodeY: Record<string, number> = {};
        const nodeHeight: Record<string, number> = {};
        const nodeValue: Record<string, number> = {};

        // Calculate node total values
        nodes.forEach(n => {
            if (n.id === 'total_income') {
                nodeValue[n.id] = links.filter(l => l.target === 'total_income').reduce((sum, l) => sum + l.value, 0);
            } else {
                // Sum of all links connected to this node
                nodeValue[n.id] = links.filter(l => l.source === n.id || l.target === n.id).reduce((sum, l) => sum + l.value, 0);
            }
        });

        const maxColumnValue = Math.max(
            columnNodes[0].reduce((sum, n) => sum + nodeValue[n.id], 0),
            nodeValue['total_income'] || 0,
            columnNodes[2].reduce((sum, n) => sum + nodeValue[n.id], 0)
        );

        const CHART_CONTENT_HEIGHT = height - 40;
        const scale = CHART_CONTENT_HEIGHT / Math.max(maxColumnValue, 1);

        columnNodes.forEach((col, colIdx) => {
            // Sort column 0 (sources) and column 2 (sinks) for better flow
            if (colIdx === 0) col.sort((a, b) => nodeValue[b.id] - nodeValue[a.id]);
            if (colIdx === 2) col.sort((a, b) => nodeValue[b.id] - nodeValue[a.id]);

            const colTotalValueWithSpacing = col.reduce((sum, n) => sum + nodeValue[n.id], 0) * scale + (col.length - 1) * NODE_SPACING;
            let currentY = (height - colTotalValueWithSpacing) / 2;

            col.forEach(n => {
                const h = Math.max(nodeValue[n.id] * scale, 6); // Minimum height for visibility
                nodeY[n.id] = currentY;
                nodeHeight[n.id] = h;
                currentY += h + NODE_SPACING;
            });
        });

        // Calculate link offsets for stacking
        const outOffsets: Record<string, number> = {};
        const inOffsets: Record<string, number> = {};
        nodes.forEach(n => { outOffsets[n.id] = 0; inOffsets[n.id] = 0; });

        // Sort links so they stack in the same order as the nodes appear vertically
        const sortedLinks = [...links].sort((a, b) => {
            const syDiff = nodeY[a.source] - nodeY[b.source];
            if (syDiff !== 0) return syDiff;
            return nodeY[a.target] - nodeY[b.target];
        });

        const formattedLinks = sortedLinks.map(l => {
            const h = l.value * scale;
            const sy = nodeY[l.source] + outOffsets[l.source] + h / 2;
            const ty = nodeY[l.target] + inOffsets[l.target] + h / 2;

            outOffsets[l.source] += h;
            inOffsets[l.target] += h;

            return { ...l, sy, ty, h: Math.max(h, 2) };
        });

        return { columnNodes, nodeY, nodeHeight, nodeValue, formattedLinks };
    }, [nodes, links, height, theme]);

    if (!layout) return null;

    const { formattedLinks, nodeY, nodeHeight, nodeValue } = layout;
    const colX = [0, CHART_WIDTH / 2 - NODE_WIDTH / 2, CHART_WIDTH - NODE_WIDTH];

    const getLinkColor = (l: SankeyLink) => {
        if (l.target === 'surplus' || l.target === 'savings') return theme.success;
        if (l.source === 'total_income') return theme.error;
        return theme.primary;
    };

    return (
        <View style={{ height, width: CHART_WIDTH }}>
            <Svg height={height} width={CHART_WIDTH}>
                {/* Links */}
                {formattedLinks.map((l, i) => {
                    const sourceCol = nodes.find(n => n.id === l.source && links.some(link => link.target === 'total_income' && link.source === n.id)) ? 0 : 1;
                    const sourceX = colX[sourceCol] + NODE_WIDTH;
                    const targetX = colX[l.target === 'total_income' ? 1 : 2];

                    const cp1x = sourceX + (targetX - sourceX) * 0.45;
                    const cp2x = sourceX + (targetX - sourceX) * 0.55;

                    const d = `M ${sourceX} ${l.sy} C ${cp1x} ${l.sy}, ${cp2x} ${l.ty}, ${targetX} ${l.ty}`;

                    return (
                        <Path
                            key={i}
                            d={d}
                            stroke={getLinkColor(l)}
                            strokeWidth={l.h}
                            opacity={0.2}
                            fill="none"
                        />
                    );
                })}

                {/* Nodes & Labels */}
                {nodes.map(n => {
                    const col = n.id === 'total_income' ? 1 : links.some(l => l.target === 'total_income' && l.source === n.id) ? 0 : 2;
                    const x = colX[col];
                    const y = nodeY[n.id];
                    const h = nodeHeight[n.id];
                    const val = nodeValue[n.id] || 0;

                    const nodeColor = n.id === 'total_income' ? theme.textSecondary : n.id === 'surplus' ? theme.success : col === 0 ? theme.primary : theme.error;
                    const isRightSide = col === 2;
                    const isTotal = col === 1;

                    return (
                        <React.Fragment key={n.id}>
                            <Rect
                                x={x}
                                y={y}
                                width={NODE_WIDTH}
                                height={h}
                                fill={nodeColor}
                                rx={2}
                            />
                            <SvgText
                                x={isTotal ? x + NODE_WIDTH + LABEL_OFFSET : isRightSide ? x - LABEL_OFFSET : x + NODE_WIDTH + LABEL_OFFSET}
                                y={y + h / 2 + 4}
                                fontSize={10}
                                fontWeight="700"
                                fill={theme.text}
                                textAnchor={isRightSide ? "end" : "start"}
                                opacity={h < 8 ? 0.7 : 1}
                            >
                                {n.name} {h > 12 ? CurrencyFormatter.formatShort(val) : ''}
                            </SvgText>
                        </React.Fragment>
                    );
                })}
            </Svg>
        </View>
    );
};
