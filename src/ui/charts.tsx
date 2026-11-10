// Charts drawn by hand in SVG, in real pixels (no scaling of text).
// Rules: one hue for the main data element, everything else in ink and grey; 3-4 faint gridlines;
// round y ticks above the maximum; straight segments; a hover tooltip on every mark.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { dShort, money, moneyShort } from '../lib/format';
import type { ForecastDay, WeekFlow } from '../data/select';

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Round step so that 3-4 ticks land on round numbers and the top tick sits above the maximum. */
function niceStep(max: number, ticks = 4): number {
  const raw = max / ticks || 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

interface Tip { x: number; y: number; body: ReactNode }

/**
 * Money in and out by week: columns above and below one zero line on one scale.
 * The current week carries the hue; past weeks are ink (in) and grey (out).
 */
export function FlowChart({ weeks, height = 220 }: { weeks: WeekFlow[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const padL = 56, padR = 8, padT = 8, padB = 24;
  const maxIn = Math.max(...weeks.map((x) => x.in), 1);
  const maxOut = Math.max(...weeks.map((x) => x.out), 1);
  const step = niceStep(Math.max(maxIn, maxOut), 2);
  const top = Math.ceil(maxIn / step) * step || step;
  const bottom = Math.ceil(maxOut / step) * step || step;
  const plotH = height - padT - padB;
  const y = (v: number) => padT + ((top - v) / (top + bottom)) * plotH;
  const plotW = Math.max(0, w - padL - padR);
  const slot = plotW / weeks.length;
  const bw = Math.max(6, Math.min(28, slot * 0.46));
  const ticks: number[] = [];
  for (let v = top; v >= -bottom - 1e-6; v -= step) ticks.push(v);
  const labelEvery = slot < 46 ? 2 : 1;
  return (
    <div className="chart-box" ref={ref} onMouseLeave={() => setTip(null)}>
      {w > 0 && (
        <svg className="chart" width={w} height={height} role="img"
          aria-label={`Поступления и расходы по неделям. Текущая неделя: поступило ${money(weeks[weeks.length - 1].in)}, потрачено ${money(weeks[weeks.length - 1].out)}.`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className={Math.abs(t) < 1e-6 ? 'base' : 'grid'} x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end">{t === 0 ? '0' : (t < 0 ? '−' : '+') + moneyShort(Math.abs(t))}</text>
            </g>
          ))}
          {weeks.map((wk, i) => {
            const cx = padL + slot * i + slot / 2;
            const hIn = y(0) - y(wk.in);
            const hOut = y(-wk.out) - y(0);
            return (
              <g key={wk.start}>
                {wk.in > 0 && <rect x={cx - bw / 2} y={y(wk.in)} width={bw} height={Math.max(1, hIn - 1)} rx={2} fill={wk.current ? 'var(--hue)' : 'var(--text)'} />}
                {wk.out > 0 && <rect x={cx - bw / 2} y={y(0) + 1} width={bw} height={Math.max(1, hOut - 1)} rx={2} fill={wk.current ? '#9dbcec' : '#aab0b7'} />}
                {i % labelEvery === (weeks.length - 1) % labelEvery && <text x={cx} y={height - 6} textAnchor="middle">{dShort(wk.start)}</text>}
                <rect className="hit" x={padL + slot * i} y={padT} width={slot} height={plotH} tabIndex={0}
                  onMouseEnter={() => setTip({ x: cx, y: y(wk.in) - 6, body: <>{dShort(wk.start)} – {dShort(wk.end)}<br />+{money(wk.in)} · −{money(wk.out)}</> })}
                  onFocus={() => setTip({ x: cx, y: y(wk.in) - 6, body: <>{dShort(wk.start)} – {dShort(wk.end)}<br />+{money(wk.in)} · −{money(wk.out)}</> })}
                  onClick={() => setTip({ x: cx, y: y(wk.in) - 6, body: <>{dShort(wk.start)} – {dShort(wk.end)}<br />+{money(wk.in)} · −{money(wk.out)}</> })} />
              </g>
            );
          })}
        </svg>
      )}
      {tip && <div className="chart-tip" style={{ left: Math.min(Math.max(tip.x, 80), w - 80), top: Math.max(tip.y, 34) }}>{tip.body}</div>}
      <div className="legend" style={{ marginTop: 4 }}>
        <span><i style={{ background: 'var(--text)' }} />поступления</span>
        <span><i style={{ background: '#aab0b7' }} />расходы</span>
        <span><i style={{ background: 'var(--hue)' }} />текущая неделя</span>
      </div>
    </div>
  );
}

/** Forecast of the money on hand by day. A forecast is not a fact: the line is dashed after today. */
export function ForecastChart({ days, height = 170 }: { days: ForecastDay[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const padL = 56, padR = 12, padT = 12, padB = 24;
  const vals = days.map((d) => d.balance);
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const step = niceStep(max - min, 4);
  const top = Math.ceil((max * 1.02) / step) * step || step;
  const bot = Math.floor(min / step) * step;
  const plotH = height - padT - padB;
  const plotW = Math.max(0, w - padL - padR);
  const x = (i: number) => padL + (plotW * i) / Math.max(1, days.length - 1);
  const y = (v: number) => padT + ((top - v) / (top - bot || 1)) * plotH;
  const ticks: number[] = [];
  for (let v = top; v >= bot - 1e-6; v -= step) ticks.push(v);
  const path = days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.balance).toFixed(1)}`).join(' ');
  const low = days.reduce((a, b) => (b.balance < a.balance ? b : a), days[0]);
  const lowI = days.indexOf(low);
  const every = plotW / days.length < 44 ? Math.ceil(44 / (plotW / days.length || 1)) : 1;
  return (
    <div className="chart-box" ref={ref} onMouseLeave={() => setTip(null)}>
      {w > 0 && (
        <svg className="chart" width={w} height={height} role="img" aria-label={`Прогноз остатка денег на ${days.length - 1} дней. Минимум ${money(low.balance)} ${dShort(low.date)}.`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className={Math.abs(t) < 1e-6 ? 'base' : 'grid'} x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end">{moneyShort(t)}</text>
            </g>
          ))}
          <path d={path} fill="none" stroke="var(--hue)" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
          <circle cx={x(0)} cy={y(days[0].balance)} r={4} fill="var(--hue)" stroke="var(--surface)" strokeWidth={2} />
          {lowI > 0 && (
            <g>
              <circle cx={x(lowI)} cy={y(low.balance)} r={4} fill="var(--surface)" stroke="var(--hue)" strokeWidth={2} />
              <text x={Math.min(Math.max(x(lowI), padL + 60), w - padR - 60)} y={Math.min(y(low.balance) + 18, height - padB - 4)} textAnchor="middle" style={{ fill: 'var(--text)' }}>
                минимум {moneyShort(low.balance)}
              </text>
            </g>
          )}
          {days.map((d, i) => (
            <g key={d.date}>
              {i % every === 0 && <text x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}>{i === 0 ? 'Сегодня' : dShort(d.date)}</text>}
              <rect className="hit" x={x(i) - plotW / days.length / 2} y={padT} width={plotW / days.length} height={plotH} tabIndex={0}
                onMouseEnter={() => setTip({ x: x(i), y: y(d.balance) - 8, body: <>{i === 0 ? 'Сегодня' : dShort(d.date)}: {money(d.balance)}{(d.in > 0 || d.out > 0) && <><br />+{money(d.in)} · −{money(d.out)}</>}</> })}
                onClick={() => setTip({ x: x(i), y: y(d.balance) - 8, body: <>{i === 0 ? 'Сегодня' : dShort(d.date)}: {money(d.balance)}{(d.in > 0 || d.out > 0) && <><br />+{money(d.in)} · −{money(d.out)}</>}</> })} />
            </g>
          ))}
        </svg>
      )}
      {tip && <div className="chart-tip" style={{ left: Math.min(Math.max(tip.x, 90), w - 90), top: Math.max(tip.y, 34) }}>{tip.body}</div>}
    </div>
  );
}

/** A ranked list with thin proportional bars: the top item in ink, the rest in grey. */
export function BarList({ rows, total }: { rows: { label: string; value: number }[]; total?: number }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const sum = total ?? rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="stack" style={{ gap: 10 }}>
      {rows.map((r, i) => (
        <div key={r.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
            <span className="num nowrap">{money(r.value)} <span className="muted">· {Math.round((r.value / (sum || 1)) * 100)}%</span></span>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: i === 0 ? 'var(--text)' : '#aab0b7', width: `${Math.max(2, (r.value / max) * 100)}%`, marginTop: 5 }} />
        </div>
      ))}
    </div>
  );
}
