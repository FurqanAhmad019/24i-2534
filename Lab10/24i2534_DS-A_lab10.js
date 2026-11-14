// ---------- Configuration: every tunable value lives here ----------
const CFG = {
  file: "air_quality_2025.csv",
  parse: d3.timeParse("%Y-%m-%d"),
  guides: [{ v: 15, label: "WHO guideline: 15" }, { v: 75, label: "Interim target 1: 75" }],
  levels: [{ name: "Low", max: 35 }, { name: "Moderate", max: 75 }, { name: "High", max: 150 }, { name: "Severe", max: Infinity }],
  ma: 7, topN: 2, overviewH: 70, chartH: 340,
  m: { t: 16, r: 24, b: 56, l: 50 },
  colors: { city: "#2563eb", suburb: "#ea580c", faint: "#93c5fd", avg: "#1e3a8a", guide: "#dc2626", gap: "#9ca3af" }
};
const fmtD = d3.timeFormat("%d %b"), f1 = d3.format(".1f"), fMon = d3.timeFormat("%b"), pct = d3.format(".0%");
const monthName = m => fMon(new Date(2000, m, 1));
const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const levelOf = v => CFG.levels.find(l => v <= l.max).name;

// ---------- Helpers ----------
function section(id, title, q) {
  const s = d3.select("#app").append("section").attr("id", id);
  s.append("h2").text(title); s.append("p").attr("class", "q").text(q);
  return s;
}
function mk(sec, H = CFG.chartH) {
  const m = CFG.m, W = sec.node().clientWidth - 36;
  const svg = sec.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
  const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
  return { svg, g, w: W - m.l - m.r, h: H - m.t - m.b };
}
const yearTicks = (x) => d3.axisBottom(x).ticks(d3.timeMonth).tickFormat(fMon);
function axes(g, x, y, w, h, yLabel, xAxis = yearTicks(x)) {
  g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat(""));
  g.append("g").attr("transform", `translate(0,${h})`).call(xAxis);
  g.append("g").call(d3.axisLeft(y).ticks(5));
  if (yLabel) g.append("text").attr("transform", "rotate(-90)").attr("x", -h / 2).attr("y", -36).attr("text-anchor", "middle").text(yLabel);
}
function legend(g, items, x0 = 0, y0 = 0) {
  items.forEach((it, i) => {
    g.append("rect").attr("x", x0 + i * 110).attr("y", y0).attr("width", 12).attr("height", 12).attr("fill", it.color);
    g.append("text").attr("x", x0 + i * 110 + 16).attr("y", y0 + 10).text(it.name);
  });
}
// split into runs of consecutive days; record gaps between runs
function splitRuns(arr) {
  const segs = [[arr[0]]], gaps = [];
  for (let i = 1; i < arr.length; i++) {
    const n = d3.timeDay.count(arr[i - 1].date, arr[i].date);
    if (n > 1) { gaps.push({ a: arr[i - 1].date, b: arr[i].date, miss: n - 1 }); segs.push([]); }
    segs[segs.length - 1].push(arr[i]);
  }
  return { segs, gaps };
}
const lineGen = (x, y, key) => d3.line().x(d => x(d.date)).y(d => y(d[key]));
const nameOf = (m) => monthName(m);

// ---------- Load ----------
d3.csv(CFG.file, d => ({ date: CFG.parse(d.date), city: +d.pm25_city, sub: +d.pm25_suburb, temp: +d.temp_c }))
  .then(raw => run(d3.sort(raw.filter(d => d.date && isFinite(d.city)), (a, b) => a.date - b.date)))
  .catch(e => d3.select("#app").append("p").text("Could not load " + CFG.file + ": " + e.message));

function run(data) {
  const first = data[0].date, last = data.at(-1).date;
  const { segs, gaps } = splitRuns(data);
  const missing = d3.sum(gaps, g => g.miss);
  const x = d3.scaleTime().domain(d3.extent(data, d => d.date));
  const months = d3.sort(new Set(data.map(d => d.date.getMonth())));
  const byMonth = d3.group(data, d => d.date.getMonth());

  // ===== Task 1 =====
  {
    const s = section("t1", "Task 1 – Data check", "How many rows, which dates, and is anything missing?");
    const yStart = d3.timeYear(first), expected = d3.timeDay.count(yStart, d3.timeYear.offset(yStart, 1));
    s.append("p").attr("class", "sub").text(`${data.length} rows · first ${d3.timeFormat("%d %b %Y")(first)} · last ${d3.timeFormat("%d %b %Y")(last)}`);
    s.append("p").attr("class", "note").text(`The year has ${expected} days, so ${expected - data.length} day(s) are missing` +
      (gaps.length ? ": " + gaps.map(g => `${g.miss} day(s) between ${fmtD(g.a)} and ${fmtD(g.b)}`).join("; ") : "."));
  }

  // ===== Task 2 =====
  const counts = CFG.guides.map(r => data.filter(d => d.city > r.v).length);
  const top = d3.sort(data, (a, b) => d3.descending(a.city, b.city)).slice(0, CFG.topN);
  {
    const s = section("t2", "Task 2 – Daily city-centre PM2.5", "How did PM2.5 in the city centre change through the year?");
    s.append("p").attr("class", "sub").text(CFG.guides.map((r, i) => `Days above ${r.v}: ${counts[i]}`).join("   |   "));
    const { g, w, h } = mk(s);
    x.range([0, w]);
    const y = d3.scaleLinear([0, d3.max(data, d => d.city)], [h, 0]).nice();
    axes(g, x, y, w, h, "PM2.5 (µg/m³)");
    segs.forEach(sg => g.append("path").datum(sg).attr("fill", "none").attr("stroke", CFG.colors.city).attr("stroke-width", 1.3).attr("d", lineGen(x, y, "city")));
    CFG.guides.forEach(r => {
      g.append("line").attr("x1", 0).attr("x2", w).attr("y1", y(r.v)).attr("y2", y(r.v)).attr("stroke", CFG.colors.guide).attr("stroke-dasharray", "5 4");
      g.append("text").attr("x", w).attr("y", y(r.v) - 4).attr("text-anchor", "end").attr("fill", CFG.colors.guide).text(r.label);
    });
    top.forEach(d => {
      g.append("circle").attr("cx", x(d.date)).attr("cy", y(d.city)).attr("r", 4.5).attr("fill", CFG.colors.guide);
      g.append("text").attr("x", x(d.date)).attr("y", y(d.city) - 9).attr("text-anchor", x(d.date) > w - 90 ? "end" : "middle").text(`${fmtD(d.date)}: ${f1(d.city)}`);
    });
    // hover with bisector
    const bis = d3.bisector(d => d.date).center, dot = g.append("circle").attr("r", 4).attr("fill", CFG.colors.city).attr("display", "none");
    const tip = g.append("text").attr("display", "none");
    g.append("rect").attr("width", w).attr("height", h).attr("fill", "none").attr("pointer-events", "all")
      .on("mousemove", e => {
        const d = data[bis(data, x.invert(d3.pointer(e)[0]))];
        dot.attr("display", null).attr("cx", x(d.date)).attr("cy", y(d.city));
        tip.attr("display", null).attr("x", Math.min(x(d.date) + 8, w - 90)).attr("y", y(d.city) - 10).text(`${fmtD(d.date)}: ${f1(d.city)}`);
      }).on("mouseleave", () => { dot.attr("display", "none"); tip.attr("display", "none"); });
  }

  // ===== Task 3 =====
  const cumVals = d3.cumsum(data, d => d.city > CFG.guides.at(-1).v ? 1 : 0);
  data.forEach((d, i) => d.cum = cumVals[i]);
  {
    const lim = CFG.guides.at(-1).v;
    const s = section("t3", "Task 3 – Build-up of unhealthy days", `How quickly did days above ${lim} µg/m³ accumulate?`);
    s.append("p").attr("class", "sub").text(`Final running total: ${cumVals.at(-1)} — ${cumVals.at(-1) === counts.at(-1) ? "matches" : "DOES NOT match"} the Task 2 count (${counts.at(-1)})`);
    const { g, w, h } = mk(s);
    const y = d3.scaleLinear([0, cumVals.at(-1) || 1], [h, 0]).nice();
    axes(g, x, y, w, h, "Cumulative unhealthy days");
    g.append("path").datum(data).attr("fill", CFG.colors.guide).attr("fill-opacity", .25).attr("stroke", CFG.colors.guide)
      .attr("d", d3.area().x(d => x(d.date)).y0(h).y1(d => y(d.cum)).curve(d3.curveStepAfter));
  }

  // ===== Task 4 =====
  {
    const s = section("t4", "Task 4 – City vs suburb", "Does the suburb behave like the city centre?");
    const { g, w, h } = mk(s);
    const y = d3.scaleLinear([0, d3.max(data, d => Math.max(d.city, d.sub || 0))], [h, 0]).nice();
    axes(g, x, y, w, h, "PM2.5 (µg/m³)");
    [["city", CFG.colors.city], ["sub", CFG.colors.suburb]].forEach(([k, c]) =>
      segs.forEach(sg => g.append("path").datum(sg.filter(d => isFinite(d[k]))).attr("fill", "none").attr("stroke", c).attr("stroke-width", 1.2).attr("d", lineGen(x, y, k))));
    legend(g, [{ name: "City centre", color: CFG.colors.city }, { name: "Suburb", color: CFG.colors.suburb }], 10, 0);
  }

  // ===== Task 5 =====
  const names = CFG.levels.map(l => l.name);
  const rows = months.map(m => {
    const ds = byMonth.get(m), o = { m, total: ds.length, cal: d3.timeDay.count(d3.timeMonth(ds[0].date), d3.timeMonth.offset(ds[0].date, 1)) };
    names.forEach(n => o[n] = ds.filter(d => levelOf(d.city) === n).length);
    return o;
  });
  {
    const s = section("t5", "Task 5 – Monthly composition of pollution levels", "In each month, how are the days split between levels?");
    const { g, w, h } = mk(s);
    const xb = d3.scaleBand(months, [0, w]).padding(.2), y = d3.scaleLinear([0, d3.max(rows, r => r.cal)], [h, 0]).nice();
    const col = d3.scaleOrdinal(names, names.map((_, i) => d3.interpolateYlOrRd(.2 + .75 * i / (names.length - 1))));
    g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat(""));
    g.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(xb).tickFormat(monthName));
    g.append("g").call(d3.axisLeft(y).ticks(5));
    g.append("text").attr("transform", "rotate(-90)").attr("x", -h / 2).attr("y", -36).attr("text-anchor", "middle").text("Days");
    g.selectAll("g.layer").data(d3.stack().keys(names)(rows)).join("g").attr("class", "layer").attr("fill", d => col(d.key))
      .selectAll("rect").data(d => d).join("rect").attr("x", d => xb(d.data.m)).attr("y", d => y(d[1])).attr("width", xb.bandwidth()).attr("height", d => y(d[0]) - y(d[1]));
    g.selectAll(".tot").data(rows).join("text").attr("x", d => xb(d.m) + xb.bandwidth() / 2).attr("y", d => y(d.total) - 4).attr("text-anchor", "middle").text(d => d.total);
    legend(g, names.map(n => ({ name: n, color: col(n) })), 10, -4);
    const short = rows.filter(r => r.total < r.cal).map(r => `${monthName(r.m)} (${r.total} of ${r.cal})`);
    s.append("p").attr("class", "note").text(`Calendar months have different lengths (${d3.min(rows, r => r.cal)}–${d3.max(rows, r => r.cal)} days).` +
      (short.length ? ` Months with fewer recorded days than the calendar: ${short.join(", ")} – because of the sensor gap.` : ""));
  }

  // ===== Task 6 =====
  const dow = d => (d.date.getDay() + 6) % 7;
  const cells = [];
  d3.rollup(data, v => d3.mean(v, d => d.city), d => d.date.getMonth(), dow).forEach((inner, m) => inner.forEach((v, dd) => cells.push({ m, dd, v })));
  {
    const s = section("t6", "Task 6 – Month × day-of-week heatmap", "Is pollution tied to the day of the week, the month, or both?");
    const { g, w, h } = mk(s);
    const xb = d3.scaleBand(months, [0, w]).padding(.04), yb = d3.scaleBand(d3.range(dayNames.length), [0, h]).padding(.04);
    const c = d3.scaleSequential(d3.interpolateYlOrRd).domain(d3.extent(cells, d => d.v));
    g.selectAll("rect").data(cells).join("rect").attr("x", d => xb(d.m)).attr("y", d => yb(d.dd)).attr("width", xb.bandwidth()).attr("height", yb.bandwidth()).attr("fill", d => c(d.v))
      .append("title").text(d => `${monthName(d.m)} ${dayNames[d.dd]}: ${f1(d.v)}`);
    g.append("g").attr("transform", `translate(0,${h})`).call(d3.axisBottom(xb).tickFormat(monthName));
    g.append("g").call(d3.axisLeft(yb).tickFormat(i => dayNames[i]));
    const defs = g.append("defs").append("linearGradient").attr("id", "lg");
    d3.range(0, 1.01, .1).forEach(t => defs.append("stop").attr("offset", t).attr("stop-color", d3.interpolateYlOrRd(t)));
    const lw = Math.min(260, w), ly = h + 32;
    g.append("rect").attr("x", 0).attr("y", ly).attr("width", lw).attr("height", 8).attr("fill", "url(#lg)");
    g.append("text").attr("x", 0).attr("y", ly + 20).text(f1(c.domain()[0]));
    g.append("text").attr("x", lw).attr("y", ly + 20).attr("text-anchor", "end").text(f1(c.domain()[1]) + " µg/m³ (avg)");
  }

  // ===== Task 7 =====
  const ms = months.map(m => {
    const v = byMonth.get(m).map(d => d.city);
    return { m, min: d3.min(v), max: d3.max(v), mean: d3.mean(v), date: new Date(first.getFullYear(), m, 15), unhealthy: v.filter(a => a > CFG.guides.at(-1).v).length };
  });
  {
    const s = section("t7", "Task 7 – Monthly min–max band with mean", "How wide is the gap between the best and worst day in each month?");
    const { g, w, h } = mk(s);
    const xm = d3.scaleTime().domain(x.domain()).range([0, w]), y = d3.scaleLinear([0, d3.max(ms, d => d.max)], [h, 0]).nice();
    axes(g, xm, y, w, h, "PM2.5 (µg/m³)");
    g.append("path").datum(ms).attr("fill", CFG.colors.suburb).attr("fill-opacity", .25).attr("d", d3.area().x(d => xm(d.date)).y0(d => y(d.min)).y1(d => y(d.max)).curve(d3.curveMonotoneX));
    g.append("path").datum(ms).attr("fill", "none").attr("stroke", CFG.colors.suburb).attr("stroke-width", 2.5).attr("d", d3.line().x(d => xm(d.date)).y(d => y(d.mean)).curve(d3.curveMonotoneX));
    legend(g, [{ name: "Min to max", color: "#fbd5bd" }, { name: "Monthly mean", color: CFG.colors.suburb }], 10, 0);
  }

  // ===== Tasks 8 & 9 =====
  segs.forEach(sg => sg.forEach((d, j) => d.ma = j >= CFG.ma - 1 ? d3.mean(sg.slice(j - CFG.ma + 1, j + 1), e => e.city) : null));
  {
    const s = section("t8", "Tasks 8 & 9 – Trend, data gap and zoom", `${CFG.ma}-day moving average (never averaged across a gap). Drag on the small chart to zoom.`);
    s.append("p").attr("class", "note").text(gaps.length ? `Missing days: ${missing} (${gaps.map(g => `${fmtD(g.a)} → ${fmtD(g.b)}`).join("; ")})` : "No gaps in the dates.");
    const btn = s.append("button").text("Reset to full year"), lab = s.append("span").attr("class", "note").text("  Showing: full year");
    const { svg, g, w, h } = mk(s, CFG.chartH + CFG.overviewH + 30);
    const mh = h - CFG.overviewH - 30, xm = d3.scaleTime().domain(x.domain()).range([0, w]), y = d3.scaleLinear().range([mh, 0]);
    g.append("defs").append("clipPath").attr("id", "clip").append("rect").attr("width", w).attr("height", mh);
    const layer = g.append("g");
    const draw = dom => {
      xm.domain(dom);
      const vis = data.filter(d => d.date >= dom[0] && d.date <= dom[1]);
      y.domain([0, d3.max(vis, d => d.city) || 1]).nice();
      layer.selectAll("*").remove();
      layer.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat(""));
      layer.append("g").attr("transform", `translate(0,${mh})`).call(d3.axisBottom(xm).ticks(Math.max(3, w / 90)).tickFormat(d3.timeFormat("%d %b")));
      layer.append("g").call(d3.axisLeft(y).ticks(5));
      layer.append("text").attr("transform", "rotate(-90)").attr("x", -mh / 2).attr("y", -36).attr("text-anchor", "middle").text("PM2.5 (µg/m³)");
      const p = layer.append("g").attr("clip-path", "url(#clip)");
      gaps.forEach(gp => {
        p.append("rect").attr("x", xm(gp.a)).attr("width", Math.max(0, xm(gp.b) - xm(gp.a))).attr("y", 0).attr("height", mh).attr("fill", CFG.colors.gap).attr("fill-opacity", .25);
        p.append("text").attr("x", (xm(gp.a) + xm(gp.b)) / 2).attr("y", 14).attr("text-anchor", "middle").text(`No data: sensor offline (${gp.miss} days)`);
      });
      segs.forEach(sg => {
        p.append("path").datum(sg).attr("fill", "none").attr("stroke", CFG.colors.faint).attr("stroke-width", 1).attr("d", lineGen(xm, y, "city"));
        p.append("path").datum(sg.filter(d => d.ma != null)).attr("fill", "none").attr("stroke", CFG.colors.avg).attr("stroke-width", 3).attr("d", lineGen(xm, y, "ma"));
      });
      legend(layer, [{ name: "Daily", color: CFG.colors.faint }, { name: `${CFG.ma}-day average`, color: CFG.colors.avg }], w - 240, -14);
    };
    // overview
    const oy = d3.scaleLinear([0, d3.max(data, d => d.city)], [CFG.overviewH, 0]);
    const og = g.append("g").attr("transform", `translate(0,${mh + 30})`);
    segs.forEach(sg => og.append("path").datum(sg).attr("fill", "none").attr("stroke", CFG.colors.city).attr("stroke-width", 1).attr("d", lineGen(x.copy().range([0, w]), oy, "city")));
    og.append("g").attr("transform", `translate(0,${CFG.overviewH})`).call(yearTicks(xm.copy().domain(x.domain())));
    const brush = d3.brushX().extent([[0, 0], [w, CFG.overviewH]]).on("brush end", e => {
      const dom = e.selection ? e.selection.map(x.copy().range([0, w]).invert) : x.domain();
      lab.text(e.selection ? `  Showing: ${fmtD(dom[0])} – ${fmtD(dom[1])}` : "  Showing: full year");
      draw(dom);
    });
    og.append("g").call(brush);
    btn.on("click", () => og.select("g").call(brush.move, null));
    draw(x.domain());
  }

}
