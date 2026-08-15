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

export const findNearestIndex = (data: DataPoint[], targetX: number): number => {
  if (data.length === 0) return -1;
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
  maxValPoint?: DataPoint;
  sortedData: DataPoint[];
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
  data: T[];
  secondaryData?: T[];
  domainX?: [number, number];
  height: number;
  plotWidth: number;
  paddingVertical: number;
  paddingLeft: number;
}): ChartGeometry {
  if (data.length === 0) {
    return {
      path: '',
      secondaryPath: '',
      gradientPath: '',
      minX: 0,
      maxX: 0,
      displayMinY: 0,
      displayRange: 0,
      maxValPoint: undefined,
      sortedData: [],
    };
  }

  const activeData = [...data].sort((a, b) => a.x - b.x);
  const activeSecondaryData = secondaryData
    ? [...secondaryData].sort((a, b) => a.x - b.x)
    : undefined;

  const yValues = activeData.map(d => d.y);
  const xValues = activeData.map(d => d.x);

  if (activeSecondaryData && activeSecondaryData.length > 0) {
    yValues.push(...activeSecondaryData.map(d => d.y));
    xValues.push(...activeSecondaryData.map(d => d.x));
  }

  const minXVal = domainX ? domainX[0] : Math.min(...xValues);
  const maxXVal = domainX ? domainX[1] : Math.max(...xValues);
  const minYVal = Math.min(...yValues);
  const maxYVal = Math.max(...yValues);

  const yRange = maxYVal - minYVal || 1;
  const displayMinYVal = minYVal - yRange * 0.1;
  const displayMaxYVal = maxYVal + yRange * 0.1;
  const displayRangeVal = displayMaxYVal - displayMinYVal;
  const xRangeVal = maxXVal - minXVal;

  const maxValIndex = data.map(d => d.y).indexOf(Math.max(...data.map(d => d.y)));
  const maxValPointVal = maxValIndex >= 0 ? data[maxValIndex] : undefined;

  let pathStr = '';
  let gradientPathStr = '';

  data.forEach((point, index) => {
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
    const lastPoint = activeData[activeData.length - 1];
    const normalizedLastX = xRangeVal === 0 ? 0.5 : (lastPoint.x - minXVal) / xRangeVal;
    const lastX = paddingLeft + normalizedLastX * plotWidth;
    gradientPathStr += ` L ${lastX} ${height - paddingVertical} L ${paddingLeft} ${height - paddingVertical} Z`;
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
    maxValPoint: maxValPointVal,
    sortedData: activeData,
  };
}
