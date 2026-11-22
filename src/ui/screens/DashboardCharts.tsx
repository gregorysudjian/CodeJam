import { useReducedMotion } from 'motion/react';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MoveType } from '@/contracts';
import { Eyebrow, GlassPanel, MoveChip, MOVE_ORDER, MOVE_LABELS } from '@/ui/kit';
import type { ActivityDay } from '@/ui/screens/dashboardStats';
import { localDay } from '@/ui/screens/dashboardStats';

// Montreal streets: slate ink for the week, maple red for today, metro blue for the goal pace.
// Every mark is at least 3:1 on the card (--na-bg-raised); text is the 5.3:1 dim ink or darker.
const tick = { fill: 'var(--na-text-dim)', fontFamily: 'var(--font-display)', fontSize: 16 };
const GRID = 'var(--na-glass-border)';
const CURSOR = { fill: 'var(--na-glass-strong)', fillOpacity: 0.6 };
const MOVE_TOKEN: Record<MoveType, string> = {
  sidestep: 'var(--na-cyan)',
  jump: 'var(--na-lime)',
  squat: 'var(--na-amber)',
  armsUp: 'var(--na-magenta)',
  reachLeft: 'var(--na-violet)',
  reachRight: 'var(--na-violet)',
};
function ChartTip({ title, value, unit }: { title: string; value: number; unit: string }) {
  return (
    <GlassPanel padding="sm" className="chart-tooltip rounded-xl">
      <p className="eyebrow text-text-muted">{title}</p>
      <p className="mt-1 font-display-italic text-title text-text">
        {Math.round(value * 10) / 10} <span className="text-caption text-text-muted">{unit}</span>
      </p>
    </GlassPanel>
  );
}
function MoveTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const move = MOVE_ORDER.find((m) => m === payload?.value);
  if (!move) return null;
  return (
    <foreignObject x={x - 142} y={y - 16} width={138} height={32}>
      <div className="flex justify-end pr-2">
        <MoveChip move={move} size="sm" />
      </div>
    </foreignObject>
  );
}
export function DashboardCharts({
  days,
  reps,
  weeklyGoalMin,
  now,
}: {
  days: ActivityDay[];
  reps: Record<MoveType, number>;
  weeklyGoalMin: number;
  now: number;
}) {
  const reduce = useReducedMotion();
  const repRows = MOVE_ORDER.map((move) => ({ move, reps: reps[move] }));
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[1.2fr_1fr]">
      <GlassPanel as="section" className="min-w-0 p-5 md:p-6" aria-label="Active minutes chart">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Eyebrow>ACTIVE MINUTES · THIS WEEK</Eyebrow>
          <span className="flex items-center gap-4 text-caption text-text-muted">
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded-sm bg-lime" />
              Today
            </span>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="w-5 border-t-2 border-dashed border-cyan" />
              Goal pace {Math.round((weeklyGoalMin / 7) * 10) / 10} min / day
            </span>
          </span>
        </div>
        <div
          className="arena-chart h-[240px] short:h-[210px] w-full"
          role="img"
          aria-label={days.map((d) => `${d.label}: ${d.activeMin} minutes`).join(', ')}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              data={days}
              margin={{ top: 15, right: 6, bottom: 0, left: -20 }}
              accessibilityLayer
            >
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis
                dataKey="label"
                tick={tick}
                axisLine={false}
                tickLine={false}
                tickMargin={12}
              />
              <YAxis
                tick={tick}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                domain={[0, (max: number) => Math.max(max, weeklyGoalMin / 7) * 1.2]}
              />
              <ReferenceLine
                y={weeklyGoalMin / 7}
                stroke="var(--na-cyan)"
                strokeWidth={2}
                strokeDasharray="6 5"
              />
              <Tooltip
                cursor={CURSOR}
                content={({ active, payload, label }) =>
                  active && payload?.[0] ? (
                    <ChartTip title={String(label)} value={Number(payload[0].value)} unit="MIN" />
                  ) : null
                }
              />
              <Bar
                dataKey="activeMin"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
                isAnimationActive={!reduce}
                animationDuration={650}
              >
                {days.map((day) => (
                  <Cell
                    key={day.date}
                    fill={day.date === localDay(now) ? 'var(--na-lime)' : 'var(--na-text-muted)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassPanel>
      <GlassPanel as="section" className="min-w-0 p-5 md:p-6" aria-label="Reps by move chart">
        <Eyebrow className="mb-4">REPS BY MOVE · THIS WEEK</Eyebrow>
        <div
          className="arena-chart h-[240px] w-full"
          role="img"
          aria-label={repRows.map((r) => `${MOVE_LABELS[r.move]}: ${r.reps} reps`).join(', ')}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              data={repRows}
              layout="vertical"
              margin={{ top: 0, right: 44, bottom: 0, left: 0 }}
              accessibilityLayer
            >
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis
                type="number"
                tick={tick}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                dataKey="move"
                type="category"
                width={144}
                interval={0}
                tick={<MoveTick />}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={CURSOR}
                content={({ active, payload }) => {
                  const row = payload?.[0];
                  const move = MOVE_ORDER.find((m) => m === row?.payload?.move);
                  return active && row && move ? (
                    <ChartTip title={MOVE_LABELS[move]} value={Number(row.value)} unit="REPS" />
                  ) : null;
                }}
              />
              <Bar
                dataKey="reps"
                radius={[0, 6, 6, 0]}
                barSize={18}
                isAnimationActive={!reduce}
                animationDuration={650}
              >
                {repRows.map((row) => (
                  <Cell key={row.move} fill={MOVE_TOKEN[row.move]} />
                ))}
                <LabelList
                  dataKey="reps"
                  position="right"
                  offset={8}
                  fill="var(--na-text)"
                  fontFamily="var(--font-display)"
                  fontWeight={700}
                  fontSize={18}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassPanel>
    </div>
  );
}
