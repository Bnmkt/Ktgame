import { useLocale } from "../../locales/LocaleProvider.jsx";
import { useState } from "react";
import { activityChartData } from "../../features/profile/activity-chart.js";
import { CompactNumber, formatExactNumber } from "../../utils/presentation.jsx";

const ranges = [["week", "Semaine", 7], ["month", "Mois", 31], ["quarter", "Trimestre", 92], ["semester", "6 mois", 183], ["year", "Année", 365]];
const dayFormatter = new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeZone: "UTC" });
const formatDay = (date) => dayFormatter.format(new Date(date));

export function DailyActivityChart({ activity = [] }) {
  const { t: localeText } = useLocale();
  const allRows = [...activity].sort((a, b) => a.date.localeCompare(b.date)).slice(-365);
  const firstActive = allRows.findIndex((row) => row.count > 0);
  const span = firstActive < 0 ? 31 : allRows.length - firstActive;
  const [rangeKey, setRangeKey] = useState(ranges.find(([, , days]) => span <= days)?.[0] ?? "year");
  const [selectedDate, setSelectedDate] = useState(null);
  const range = ranges.find(([key]) => key === rangeKey);
  const { rows, peak, maximum, ticks, total } = activityChartData(allRows, range[2]);
  const width = 720, height = 230;
  const plot = { left: 52, top: 24, bottom: 192, right: 700 };
  const slot = (plot.right - plot.left) / Math.max(1, rows.length);
  const y = (value) => plot.bottom - value / maximum * (plot.bottom - plot.top);
  const x = (index) => plot.left + slot * (index + .5);
  const line = rows.map((row, index) => `${index ? "L" : "M"}${x(index)},${y(row.count)}`).join(" ");
  const selected = rows.find((row) => row.date === selectedDate);
  const dateIndices = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])].filter((index) => index >= 0 && index < rows.length);
  return <section className="settings-card activity-card">
    <div className="panel-heading chart-heading"><div><span>{localeText("Activité")}</span><small>{range[1]} · <CompactNumber value={total} />{" " + localeText("parties")}</small></div><div className="range-tabs">{ranges.map(([key, label]) => <button key={key} aria-pressed={rangeKey === key} className={rangeKey === key ? "active" : ""} onClick={() => { setRangeKey(key); setSelectedDate(null); }}>{localeText(label)}</button>)}</div></div>
    <div className="activity-chart activity-plot"><svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={localeText("Parties par jour : {value0}", { value0: range[1] })}>
      {ticks.map((tick) => <g key={tick}><line className="activity-grid-line" x1={plot.left} x2={plot.right} y1={y(tick)} y2={y(tick)} /><text className="activity-axis-label" x={plot.left - 9} y={y(tick) + 4} textAnchor="end">{formatExactNumber(tick)}</text></g>)}
      {rows.length > 0 && <path className="activity-line" d={line} />}
      {rows.map((row, index) => <g key={row.date}>
        <circle className={`activity-point ${selectedDate === row.date ? "selected" : ""}`} cx={x(index)} cy={y(row.count)} r={selectedDate === row.date ? 5 : rows.length <= 31 ? 3.5 : 1.6} />
        {rows.length <= 31 && row.count > 0 && <text className="activity-value-label" x={plot.left + slot * (index + .5)} y={y(row.count) - 6} textAnchor="middle">{row.count}</text>}
        <rect className="activity-point-target" x={plot.left + slot * index} y={plot.top} width={slot} height={plot.bottom - plot.top + 6} tabIndex={0} role="button" aria-label={localeText("{value0} : {value1} parties", { value0: formatDay(row.date), value1: row.count })} onPointerEnter={() => setSelectedDate(row.date)} onFocus={() => setSelectedDate(row.date)} onClick={() => setSelectedDate(row.date)} onKeyDown={(event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); setSelectedDate(row.date); } }}><title>{formatDay(row.date)} : {row.count}{" " + localeText("parties")}</title></rect>
      </g>)}
      {dateIndices.map((index, position) => <text key={index} className="activity-axis-label" x={position === 0 ? plot.left : position === dateIndices.length - 1 ? plot.right : (plot.left + plot.right) / 2} y={height - 12} textAnchor={position === 0 ? "start" : position === dateIndices.length - 1 ? "end" : "middle"}>{new Intl.DateTimeFormat("fr-BE", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(rows[index].date))}</text>)}
    </svg></div>
    <div className="activity-legend"><span>{localeText("Maximum :") + " "}{formatExactNumber(peak)}{" " + localeText("/ jour")}</span><span aria-live="polite">{selected ? localeText("{value0} : {value1} partie(s)", { value0: formatDay(selected.date), value1: selected.count }) : localeText("{value0} jours actifs", { value0: rows.filter((row) => row.count > 0).length })}</span></div>
  </section>;
}
