import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../context/AppContext.jsx';

/** Gold/cocoa tones, interleaved dark/light so neighbouring slices stay distinct. */
const CAT_COLORS = ['#8A6406', '#F2D06B', '#57400A', '#FDEEB2', '#B8892A', '#3B2F12', '#FBE38E'];
const OTHER = '#E3D8BC';
const INCOME = '#15803D';
const EXPENSE = '#DC2626';
const MUTED = '#6B5A33';
const LINE = '#F5E2A8';

const reduced = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
const utc = (s) => new Date(s.length === 7 ? `${s}-01T00:00:00Z` : `${s}T00:00:00Z`);
const dayShort = (s) => utc(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayLong = (s) =>
  utc(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const monShort = (s) => utc(s).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const monLong = (s) => utc(s).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const compact = (n) =>
  n >= 1000 ? `${(n / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k` : String(Math.round(n));

const axis = {
  tick: { fill: MUTED, fontSize: 11, fontFamily: 'Poppins, sans-serif' },
  tickLine: false,
  axisLine: false,
};

function Tip({ active, payload, label, fmt, title }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-t">{title ? title(label, payload) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey ?? p.name} className="chart-tip-r">
          <span className="chart-dot" style={{ background: p.payload?.fill || p.color || p.fill }} />
          <span>{p.name}</span>
          <b>{fmt(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, sub, children }) {
  return (
    <section className="card chart-card">
      <header>
        <h3 className="chart-h">{title}</h3>
        {sub && <span className="small-muted">{sub}</span>}
      </header>
      {children}
    </section>
  );
}

function Empty({ emoji, text }) {
  return (
    <div className="chart-empty">
      <span aria-hidden="true">{emoji}</span>
      <span>{text}</span>
    </div>
  );
}

function Skeleton() {
  return <span className="skel" style={{ display: 'block', height: 220, borderRadius: 18 }} />;
}

function WhereItWent({ data, fmt, anim }) {
  const slices = useMemo(() => {
    if (!data) return [];
    const top = data
      .slice(0, CAT_COLORS.length)
      .map((d, i) => ({ name: d.category, value: d.total, fill: CAT_COLORS[i] }));
    const rest = data.slice(CAT_COLORS.length).reduce((a, d) => a + d.total, 0);
    return rest > 0 ? [...top, { name: 'Other', value: rest, fill: OTHER }] : top;
  }, [data]);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const month = new Date().toLocaleDateString('en-US', { month: 'long' });

  return (
    <ChartCard title="Where your money went" sub={month}>
      {!data ? (
        <Skeleton />
      ) : total <= 0 ? (
        <Empty emoji="🍩" text="No expenses this month yet. Your categories will show up here." />
      ) : (
        <div className="donut-wrap">
          <div className="donut" role="img" aria-label={`Expenses this month by category, total ${fmt(total)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="66%"
                  outerRadius="96%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="#fff"
                  strokeWidth={2}
                  isAnimationActive={anim}
                  animationDuration={900}
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.fill} />
                  ))}
                </Pie>
                <Tooltip content={<Tip fmt={fmt} title={() => 'This month'} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-mid">
              <span className="small-muted" style={{ fontSize: 11 }}>
                Total
              </span>
              <b>{fmt(total)}</b>
            </div>
          </div>
          <ul className="legend">
            {slices.map((s) => (
              <li key={s.name}>
                <span className="chart-dot" style={{ background: s.fill }} />
                <span className="legend-n">{s.name}</span>
                <span className="legend-v">{fmt(s.value)}</span>
                <span className="legend-p">{Math.round((s.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}

function DailySpending({ data, fmt, anim }) {
  const total = data?.reduce((a, d) => a + d.total, 0) || 0;
  return (
    <ChartCard title="Daily spending" sub="Last 30 days">
      {!data ? (
        <Skeleton />
      ) : total <= 0 ? (
        <Empty emoji="📅" text="No spending in the last 30 days. Log a purchase to see your rhythm." />
      ) : (
        <>
          <div className="chart-kpi">
            <b>{fmt(total)}</b>
            <span className="small-muted">· avg {fmt(total / data.length)} / day</span>
          </div>
          <div
            className="chart-box"
            role="img"
            aria-label={`Daily expenses over the last 30 days, total ${fmt(total)}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dailyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F2D06B" stopOpacity={0.75} />
                    <stop offset="100%" stopColor="#FDEEB2" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={LINE} strokeDasharray="3 5" />
                <XAxis
                  dataKey="date"
                  {...axis}
                  tickFormatter={dayShort}
                  minTickGap={28}
                  interval="preserveStartEnd"
                  tickMargin={8}
                />
                <YAxis {...axis} width={38} tickFormatter={compact} allowDecimals={false} />
                <Tooltip
                  cursor={{ stroke: '#8A6406', strokeWidth: 1, strokeDasharray: '3 3' }}
                  content={<Tip fmt={fmt} title={(l) => dayLong(l)} />}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Spent"
                  stroke="#8A6406"
                  strokeWidth={2}
                  fill="url(#dailyFill)"
                  activeDot={{ r: 5, fill: '#8A6406', stroke: '#fff', strokeWidth: 2 }}
                  isAnimationActive={anim}
                  animationDuration={900}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </ChartCard>
  );
}

function InVsOut({ data, fmt, anim }) {
  const any = data?.some((m) => m.income > 0 || m.expense > 0);
  return (
    <ChartCard title="Money in vs out" sub="Last 6 months">
      {!data ? (
        <Skeleton />
      ) : !any ? (
        <Empty emoji="⚖️" text="Once money comes in and goes out, you'll see each month side by side." />
      ) : (
        <>
          <div className="chart-keys">
            <span>
              <span className="chart-dot" style={{ background: INCOME }} />
              Money in
            </span>
            <span>
              <span className="chart-dot" style={{ background: EXPENSE }} />
              Money out
            </span>
          </div>
          <div className="chart-box" role="img" aria-label="Income versus expenses for each of the last 6 months">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke={LINE} strokeDasharray="3 5" />
                <XAxis dataKey="month" {...axis} tickFormatter={monShort} tickMargin={8} />
                <YAxis {...axis} width={38} tickFormatter={compact} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#FFFBEF' }} content={<Tip fmt={fmt} title={(l) => monLong(l)} />} />
                <Bar
                  dataKey="income"
                  name="Money in"
                  fill={INCOME}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                  isAnimationActive={anim}
                  animationDuration={900}
                />
                <Bar
                  dataKey="expense"
                  name="Money out"
                  fill={EXPENSE}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                  isAnimationActive={anim}
                  animationDuration={900}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </ChartCard>
  );
}

/** The three dashboard charts. `data` is the /api/analytics payload (null while loading). */
export default function Insights({ data }) {
  const { fmt } = useApp();
  const anim = !reduced();
  return (
    <div className="insights">
      <WhereItWent data={data?.byCategory} fmt={fmt} anim={anim} />
      <DailySpending data={data?.daily} fmt={fmt} anim={anim} />
      <InVsOut data={data?.monthly} fmt={fmt} anim={anim} />
    </div>
  );
}
