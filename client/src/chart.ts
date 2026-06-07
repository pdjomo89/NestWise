// Shared chart helpers.

// Build a rounded axis max and evenly spaced ticks (~targetCount intervals),
// e.g. niceTicks(1800) -> { axisMax: 2000, ticks: [0, 500, 1000, 1500, 2000] }.
export function niceTicks(max: number, targetCount = 4) {
  if (max <= 0) return { axisMax: 1, ticks: [0, 1] };
  const rawStep = max / targetCount;
  const base = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const f = rawStep / base;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * base;
  const axisMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= axisMax + step / 1000; v += step) ticks.push(v);
  return { axisMax, ticks };
}
