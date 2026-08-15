export interface DataPoint {
  x: number; // timestamp
  y: number; // value
}

export interface HorizontalLine {
  value: number;
  label?: string;
  color?: string;
  strokeDasharray?: string;
}

/**
 * Performs a binary search to find the index of the nearest DataPoint by x timestamp.
 * Assumes `data` is sorted ascending by `x` and contains finite `x` values.
 */
export const findNearestIndex = (data: readonly DataPoint[], targetX: number): number => {
  if (data.length === 0 || !Number.isFinite(targetX)) return -1;
  if (data.length === 1) return 0;

  let left = 0;
  let right = data.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (data[mid].x === targetX) return mid;
    if (data[mid].x < targetX) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  const leftIdx = Math.max(0, right);
  const rightIdx = Math.min(data.length - 1, left);

  if (leftIdx === rightIdx) return leftIdx;

  const leftDiff = Math.abs(data[leftIdx].x - targetX);
  const rightDiff = Math.abs(data[rightIdx].x - targetX);

  return leftDiff <= rightDiff ? leftIdx : rightIdx;
};

export interface ChartGeometry {
  path: string;
  secondaryPath: string;
  gradientPath: string;
  minX: number;
  maxX: number;
  displayMinY: number;
  displayRange: number;
  primaryMaxPoint?: DataPoint;
  sortedData: DataPoint[];
  visibleData: DataPoint[];
}

export function computeLineChartGeometry<T extends DataPoint>({
  data,
  secondaryData,
  domainX,
  height,
  plotWidth,
  paddingVertical,
  paddingLeft,
}: {
  data: readonly T[];
  secondaryData?: readonly T[];
  domainX?: [number, number];
  height: number;
  plotWidth: number;
  paddingVertical: number;
  paddingLeft: number;
}): ChartGeometry {
  const isFinitePoint = (p: DataPoint) => Number.isFinite(p.x) && Number.isFinite(p.y);
  const validData = data.filter(isFinitePoint);
  const validSecondaryData = secondaryData?.filter(isFinitePoint);

  const hasValidDomainX =
    domainX !== undefined && Number.isFinite(domainX[0]) && Number.isFinite(domainX[1]);

  const minXDomain = hasValidDomainX ? Math.min(domainX[0], domainX[1]) : undefined;
  const maxXDomain = hasValidDomainX ? Math.max(domainX[0], domainX[1]) : undefined;

  const sortedData = [...validData].sort((a, b) => a.x - b.x);
  const sortedSecondaryData = validSecondaryData
    ? [...validSecondaryData].sort((a, b) => a.x - b.x)
    : undefined;

  // Viewport filtering when domainX is specified
  const activeData =
    minXDomain !== undefined && maxXDomain !== undefined
      ? sortedData.filter(pt => pt.x >= minXDomain && pt.x <= maxXDomain)
      : sortedData;

  const activeSecondaryData =
    sortedSecondaryData && minXDomain !== undefined && maxXDomain !== undefined
      ? sortedSecondaryData.filter(pt => pt.x >= minXDomain && pt.x <= maxXDomain)
      : sortedSecondaryData;

  const hasActiveData =
    activeData.length > 0 || (activeSecondaryData !== undefined && activeSecondaryData.length > 0);

  if (!hasActiveData) {
    return {
      path: '',
      secondaryPath: '',
      gradientPath: '',
      minX: minXDomain ?? 0,
      maxX: maxXDomain ?? 0,
      displayMinY: 0,
      displayRange: 1,
      primaryMaxPoint: undefined,
      sortedData,
      visibleData: [],
    };
  }

  let minXVal = minXDomain ?? Infinity;
  let maxXVal = maxXDomain ?? -Infinity;
  let minYVal = Infinity;
  let maxYVal = -Infinity;

  for (let i = 0; i < activeData.length; i++) {
    const pt = activeData[i];
    if (minXDomain === undefined) {
      if (pt.x < minXVal) minXVal = pt.x;
      if (pt.x > maxXVal) maxXVal = pt.x;
    }
    if (pt.y < minYVal) minYVal = pt.y;
    if (pt.y > maxYVal) maxYVal = pt.y;
  }

  if (activeSecondaryData) {
    for (let i = 0; i < activeSecondaryData.length; i++) {
      const pt = activeSecondaryData[i];
      if (minXDomain === undefined) {
        if (pt.x < minXVal) minXVal = pt.x;
        if (pt.x > maxXVal) maxXVal = pt.x;
      }
      if (pt.y < minYVal) minYVal = pt.y;
      if (pt.y > maxYVal) maxYVal = pt.y;
    }
  }

  if (!Number.isFinite(minXVal) || !Number.isFinite(maxXVal)) {
    minXVal = 0;
    maxXVal = 0;
  }
  if (!Number.isFinite(minYVal) || !Number.isFinite(maxYVal)) {
    minYVal = 0;
    maxYVal = 0;
  }

  const rawYRange = maxYVal - minYVal;
  const displayMinYVal =
    rawYRange > 0
      ? minYVal - rawYRange * 0.1
      : minYVal - (minYVal === 0 ? 1 : Math.max(Math.abs(minYVal) * 0.1, 1));

  const displayMaxYVal =
    rawYRange > 0
      ? maxYVal + rawYRange * 0.1
      : maxYVal + (maxYVal === 0 ? 1 : Math.max(Math.abs(maxYVal) * 0.1, 1));

  const displayRangeVal = displayMaxYVal - displayMinYVal;
  const xRangeVal = maxXVal - minXVal;

  const primaryMaxPointVal =
    activeData.length > 0
      ? activeData.reduce((max, curr) => (curr.y > max.y ? curr : max), activeData[0])
      : undefined;

  let pathStr = '';
  let gradientPathStr = '';

  activeData.forEach((point, index) => {
    const normalizedX = xRangeVal === 0 ? 0.5 : (point.x - minXVal) / xRangeVal;
    const x = paddingLeft + normalizedX * plotWidth;
    const y =
      height -
      paddingVertical -
      ((point.y - displayMinYVal) / displayRangeVal) * (height - paddingVertical * 2);

    if (index === 0) {
      pathStr += `M ${x} ${y}`;
      gradientPathStr += `M ${x} ${height - paddingVertical} L ${x} ${y}`;
    } else {
      pathStr += ` L ${x} ${y}`;
      gradientPathStr += ` L ${x} ${y}`;
    }
  });

  if (activeData.length > 0) {
    const firstPoint = activeData[0];
    const normalizedFirstX = xRangeVal === 0 ? 0.5 : (firstPoint.x - minXVal) / xRangeVal;
    const firstX = paddingLeft + normalizedFirstX * plotWidth;

    const lastPoint = activeData[activeData.length - 1];
    const normalizedLastX = xRangeVal === 0 ? 0.5 : (lastPoint.x - minXVal) / xRangeVal;
    const lastX = paddingLeft + normalizedLastX * plotWidth;
    gradientPathStr += ` L ${lastX} ${height - paddingVertical} L ${firstX} ${height - paddingVertical} Z`;
  }

  let secondaryPathStr = '';
  if (activeSecondaryData && activeSecondaryData.length > 0) {
    activeSecondaryData.forEach((point, index) => {
      const normalizedX = xRangeVal === 0 ? 0.5 : (point.x - minXVal) / xRangeVal;
      const x = paddingLeft + normalizedX * plotWidth;
      const y =
        height -
        paddingVertical -
        ((point.y - displayMinYVal) / displayRangeVal) * (height - paddingVertical * 2);

      if (index === 0) {
        secondaryPathStr += `M ${x} ${y}`;
      } else {
        secondaryPathStr += ` L ${x} ${y}`;
      }
    });
  }

  return {
    path: pathStr,
    secondaryPath: secondaryPathStr,
    gradientPath: gradientPathStr,
    minX: minXVal,
    maxX: maxXVal,
    displayMinY: displayMinYVal,
    displayRange: displayRangeVal,
    primaryMaxPoint: primaryMaxPointVal,
    sortedData,
    visibleData: activeData,
  };
}
