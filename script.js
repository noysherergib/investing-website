// ================= Formatting =================
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const $ = (id) => document.getElementById(id);

// ================= Math =================
// Returns the balance at the end of each year (index 0 = start), compounding monthly.
function simulate({ initial = 0, monthly = 0, rate, years, stopAfter = Infinity, startAt = 0 }) {
  const r = rate / 100 / 12;
  let value = initial, contributed = initial;
  const out = [{ value, contributed }];
  for (let y = 1; y <= years; y++) {
    const paying = y > startAt && y <= stopAfter;
    for (let m = 0; m < 12; m++) {
      value = value * (1 + r) + (paying ? monthly : 0);
      if (paying) contributed += monthly;
    }
    out.push({ value, contributed });
  }
  return out;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

// ================= Chart =================
const SVG_NS = "http://www.w3.org/2000/svg";
const tooltip = $("tooltip");

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

/**
 * Draws a line or stacked-area chart into `container`.
 * opts: { xs, series: [{ name, color, values }], stacked, xLabel(x), directLabels }
 */
function drawChart(container, opts) {
  const { xs, series, stacked, xLabel, directLabels } = opts;
  const W = container.clientWidth;
  const H = container.clientHeight;
  const m = { top: 12, right: directLabels ? 64 : 12, bottom: 28, left: 56 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  // cumulative values for stacking
  const layers = series.map((s, si) =>
    s.values.map((v, i) => (stacked ? series.slice(0, si + 1).reduce((a, t) => a + t.values[i], 0) : v))
  );
  const yMax = niceMax(Math.max(...layers.flat()));
  const x = (i) => m.left + (i / (xs.length - 1)) * iw;
  const y = (v) => m.top + ih - (v / yMax) * ih;

  container.innerHTML = "";
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label || "chart" }, container);

  // gridlines + y ticks
  const TICKS = 4;
  for (let t = 0; t <= TICKS; t++) {
    const v = (yMax / TICKS) * t;
    el("line", { x1: m.left, x2: m.left + iw, y1: y(v), y2: y(v), style: `stroke:var(${t === 0 ? "--axis" : "--grid"});stroke-width:1` }, svg);
    const label = el("text", { x: m.left - 10, y: y(v) + 4, "text-anchor": "end" }, svg);
    label.textContent = compact.format(v);
  }

  // x ticks (~6 of them)
  const step = Math.max(1, Math.ceil((xs.length - 1) / 6));
  for (let i = 0; i < xs.length; i += step) {
    const label = el("text", { x: x(i), y: H - 6, "text-anchor": "middle" }, svg);
    label.textContent = xLabel(xs[i]);
  }

  // series
  const linePath = (vals) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  layers.forEach((vals, si) => {
    const color = series[si].color;
    if (stacked) {
      const lower = si === 0 ? vals.map(() => 0) : layers[si - 1];
      const d = linePath(vals) + lower.map((v, i) => `L${x(lower.length - 1 - i)},${y(lower[lower.length - 1 - i])}`).join("") + "Z";
      el("path", { d, style: `fill:var(${color});fill-opacity:0.85` }, svg);
    } else {
      el("path", { d: linePath(vals), style: `fill:none;stroke:var(${color});stroke-width:2;stroke-linejoin:round;stroke-linecap:round` }, svg);
    }
  });
  // 2px surface gap between stacked bands
  if (stacked) {
    layers.slice(0, -1).forEach((vals) =>
      el("path", { d: linePath(vals), style: "fill:none;stroke:var(--surface);stroke-width:2" }, svg)
    );
  }

  // direct labels at line ends, nudged apart if they collide
  if (directLabels) {
    const ends = layers.map((vals, si) => ({ y: y(vals[vals.length - 1]), name: series[si].name }));
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 16) ends[i].y = ends[i - 1].y + 16;
    ends.forEach((e) => {
      const t = el("text", { x: m.left + iw + 8, y: e.y + 4, class: "direct-label" }, svg);
      t.textContent = e.name;
    });
  }

  // hover layer
  const hover = el("g", { style: "display:none" }, svg);
  const vline = el("line", { y1: m.top, y2: m.top + ih, style: "stroke:var(--axis);stroke-width:1" }, hover);
  const dots = layers.map((_, si) =>
    el("circle", { r: 5, style: `fill:var(${series[si].color});stroke:var(--surface);stroke-width:2` }, hover)
  );
  const hit = el("rect", { x: m.left, y: 0, width: iw, height: H, fill: "transparent" }, svg);

  function show(evt) {
    const rect = svg.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(xs.length - 1, Math.round(((px - m.left) / iw) * (xs.length - 1))));
    hover.style.display = "";
    vline.setAttribute("x1", x(i));
    vline.setAttribute("x2", x(i));
    dots.forEach((d, si) => { d.setAttribute("cx", x(i)); d.setAttribute("cy", y(layers[si][i])); });

    const rows = series.map((s) =>
      `<div class="tt-row"><b class="swatch" style="background:var(${s.color})"></b>${s.name}<strong>${money.format(s.values[i])}</strong></div>`
    ).join("");
    const total = stacked
      ? `<div class="tt-row tt-total">Total<strong>${money.format(layers[layers.length - 1][i])}</strong></div>`
      : "";
    tooltip.innerHTML = `<div class="tt-title">${opts.tooltipTitle(xs[i])}</div>${rows}${total}`;
    tooltip.hidden = false;
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    let left = evt.clientX + 16;
    if (left + tw > window.innerWidth - 8) left = evt.clientX - tw - 16;
    tooltip.style.left = left + "px";
    tooltip.style.top = Math.max(8, evt.clientY - th / 2) + "px";
  }
  function hide() { hover.style.display = "none"; tooltip.hidden = true; }

  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", hide);
}

// ================= Hero number =================
(function heroCount() {
  const target = 10000 * Math.pow(1.07, 40);
  const start = performance.now();
  (function tick(now) {
    const t = Math.min((now - start) / 1800, 1);
    $("heroNumber").textContent = money.format(10000 + (target - 10000) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(tick);
  })(start);
})();

// ================= Calculator =================
const calcInputs = ["initial", "monthly", "rate", "years"].map($);

function updateCalc() {
  const initial = Math.max(0, +$("initial").value || 0);
  const monthly = Math.max(0, +$("monthly").value || 0);
  const rate = +$("rate").value;
  const years = +$("years").value;
  $("rateOut").textContent = rate + "%";
  $("yearsOut").textContent = years;

  const data = simulate({ initial, monthly, rate, years });
  const last = data[data.length - 1];
  $("finalValue").textContent = money.format(last.value);
  $("totalIn").textContent = money.format(last.contributed);
  $("growth").textContent = money.format(last.value - last.contributed);

  const xs = data.map((_, i) => i);
  drawChart($("growthChart"), {
    label: "Portfolio value by year, split into contributions and growth",
    xs,
    stacked: true,
    xLabel: (v) => `Yr ${v}`,
    tooltipTitle: (v) => `Year ${v}`,
    series: [
      { name: "Contributions", color: "--series-1", values: data.map((d) => d.contributed) },
      { name: "Growth", color: "--series-2", values: data.map((d) => Math.max(0, d.value - d.contributed)) },
    ],
  });

  $("growthTable").innerHTML =
    "<thead><tr><th>Year</th><th>Contributions</th><th>Growth</th><th>Total</th></tr></thead><tbody>" +
    data.map((d, i) =>
      `<tr><td>${i}</td><td>${money.format(d.contributed)}</td><td>${money.format(d.value - d.contributed)}</td><td>${money.format(d.value)}</td></tr>`
    ).join("") + "</tbody>";
}
calcInputs.forEach((i) => i.addEventListener("input", updateCalc));
$("calcForm").addEventListener("submit", (e) => e.preventDefault());

// ================= Start early =================
function updateEarly() {
  const rate = 7;
  const years = 40; // age 25 → 65
  const maya = simulate({ monthly: 300, rate, years, stopAfter: 10 });
  const leo = simulate({ monthly: 300, rate, years, startAt: 10 });
  $("earlyRateText").textContent = rate + "%";
  $("mayaIn").textContent = money.format(maya[years].contributed);
  $("leoIn").textContent = money.format(leo[years].contributed);
  $("mayaEnd").textContent = money.format(maya[years].value);
  $("leoEnd").textContent = money.format(leo[years].value);

  drawChart($("earlyChart"), {
    label: "Balance by age for Maya and Leo",
    xs: maya.map((_, i) => 25 + i),
    xLabel: (v) => v,
    tooltipTitle: (v) => `Age ${v}`,
    directLabels: true,
    series: [
      { name: "Maya", color: "--series-1", values: maya.map((d) => d.value) },
      { name: "Leo", color: "--series-2", values: leo.map((d) => d.value) },
    ],
  });
}

// ================= Rule of 72 =================
function updateRule72() {
  const rate = +$("r72").value;
  const yrs = 72 / rate;
  $("r72Out").textContent = rate + "%";
  $("r72Years").textContent = yrs < 10 ? yrs.toFixed(1).replace(/\.0$/, "") : Math.round(yrs);

  // how many doublings fit into 36 years
  const n = Math.min(6, Math.floor(36 / yrs));
  const bars = [1, ...Array.from({ length: n }, (_, i) => Math.pow(2, i + 1))];
  const maxH = 70, maxV = bars[bars.length - 1];
  $("doubles").innerHTML = bars.map((v, i) =>
    `<div style="height:${Math.max(4, (v / maxV) * maxH)}px" title="After ${Math.round(i * yrs)} years"><span>${v}×</span></div>`
  ).join("");
}
$("r72").addEventListener("input", updateRule72);

// ================= Risk dots =================
document.querySelectorAll(".risk").forEach((r) => {
  const level = +r.dataset.level;
  r.querySelector(".dots").innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < level ? "on" : ""}"></i>`).join("");
  r.setAttribute("aria-label", `Risk level ${level} out of 5`);
});

// ================= Allocation mix =================
const ASSETS = {
  stocks: { label: "Stocks", color: "--series-1", avg: 10, bad: -37 },
  bonds: { label: "Bonds", color: "--series-2", avg: 5, bad: -13 },
  cash: { label: "Cash", color: "--series-3", avg: 3, bad: 0 },
};
let mix = { stocks: 60, bonds: 30, cash: 10 };

function setMix(changedKey, newValue) {
  const others = Object.keys(mix).filter((k) => k !== changedKey);
  const remaining = 100 - newValue;
  const otherSum = others.reduce((a, k) => a + mix[k], 0);
  mix[changedKey] = newValue;
  if (otherSum === 0) {
    others.forEach((k, i) => (mix[k] = i === 0 ? remaining : 0));
  } else {
    let used = 0;
    others.forEach((k, i) => {
      mix[k] = i === others.length - 1 ? remaining - used : Math.round((mix[k] / otherSum) * remaining);
      used += mix[k];
    });
  }
  renderMix();
}

function renderMix() {
  for (const key of Object.keys(mix)) {
    $(key).value = mix[key];
    $(key + "Out").textContent = mix[key] + "%";
  }
  $("mixBar").innerHTML = Object.entries(mix)
    .map(([k, v]) =>
      `<div style="flex:0 0 calc(${v}% - 2px);background:var(${ASSETS[k].color})" title="${ASSETS[k].label}: ${v}%">${v >= 12 ? `${ASSETS[k].label} ${v}%` : ""}</div>`
    ).join("");

  const avg = Object.entries(mix).reduce((a, [k, v]) => a + (v / 100) * ASSETS[k].avg, 0);
  const bad = Object.entries(mix).reduce((a, [k, v]) => a + (v / 100) * ASSETS[k].bad, 0);
  $("mixReturn").textContent = `~${avg.toFixed(1)}% / yr`;
  const worst = $("mixWorst");
  worst.textContent = bad < 0 ? `▼ ${Math.abs(bad).toFixed(0)}%` : "0%";
  worst.className = "tile-value" + (bad < 0 ? " neg" : "");
}

["stocks", "bonds", "cash"].forEach((k) =>
  $(k).addEventListener("input", (e) => setMix(k, +e.target.value))
);
document.querySelectorAll("[data-preset]").forEach((b) =>
  b.addEventListener("click", () => {
    const [s, bo, c] = b.dataset.preset.split(",").map(Number);
    mix = { stocks: s, bonds: bo, cash: c };
    renderMix();
  })
);

// ================= Init & resize =================
function renderAll() { updateCalc(); updateEarly(); }
renderAll();
updateRule72();
renderMix();

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderAll, 120);
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);
