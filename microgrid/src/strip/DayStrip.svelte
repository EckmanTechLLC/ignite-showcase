<script lang="ts">
  import { tagBool, tagNum, tagStr } from '../live/store.svelte';
  import { hhmm, num, pretty } from '../fmt';

  // The compressed day made legible: sun arc and cloud layer (top), time-of-use band with the hour marker (bottom).
  // Drawn at the element's real pixel width so text is never stretched; height is the fixed 74-unit viewBox.
  let W = $state(1200);
  const SKY_H = 46;
  const BAND_Y = 52;
  const BAND_H = 14;
  const SUNRISE = 4.75;
  const SUNSET = 19.25;
  const MAX_ELEV = 76; // 37 N at the June solstice: the arc's peak

  const hour = $derived(tagNum('Time/HourOfDay'));
  const elev = $derived(tagNum('Time/SunElevationDeg'));
  const cloud = $derived(tagNum('Time/Cloudiness'));
  const irr = $derived(tagNum('Time/IrradianceWm2'));
  const clear = $derived(tagNum('Time/ClearSkyIrradianceWm2'));
  const band = $derived(tagStr('Time/TariffBand'));
  const rate = $derived(tagNum('Time/TariffRate'));
  const weekend = $derived(tagBool('Time/IsWeekend'));
  const window_ = $derived(tagBool('Time/DemandWindow'));
  const day = $derived(tagNum('Time/DayIndex'));
  const season = $derived(tagStr('Time/Season'));
  const co2 = $derived(tagNum('Time/GridCO2gPerKWh'));
  const temp = $derived(tagNum('Time/AmbientTempC'));

  const X = (h: number) => (h / 24) * W;
  const horizon = SKY_H - 4;
  const arcY = (h: number) => horizon - (horizon - 6) * Math.sin((Math.PI * (h - SUNRISE)) / (SUNSET - SUNRISE));
  const arc = $derived.by(() => {
    const pts: string[] = [];
    for (let h = SUNRISE; h <= SUNSET + 0.001; h += 0.25) pts.push(`${pts.length ? 'L' : 'M'}${X(h).toFixed(1)} ${arcY(h).toFixed(1)}`);
    return pts.join(' ');
  });
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const sunX = $derived(Number.isFinite(hour) ? X(hour) : -50);
  const sunY = $derived(Number.isFinite(elev) ? horizon - (horizon - 6) * Math.max(-0.35, Math.min(1, elev / MAX_ELEV)) : horizon);
  const night = $derived(!(elev > 0));
  const segs = $derived(
    weekend
      ? [[0, 8, 'OFFPEAK', 0.09], [8, 22, 'SHOULDER', 0.14], [22, 24, 'OFFPEAK', 0.09]]
      : [[0, 7, 'OFFPEAK', 0.09], [7, 16, 'SHOULDER', 0.16], [16, 21, 'PEAK', 0.34], [21, 22, 'SHOULDER', 0.16], [22, 24, 'OFFPEAK', 0.09]],
  );
  const BAND_COLOR: Record<string, string> = { OFFPEAK: 'var(--ok)', SHOULDER: 'var(--warn)', PEAK: 'var(--alarm)' };
  const bandColor = $derived(BAND_COLOR[band] ?? 'var(--fg-2)');
  const cloudOp = $derived(Number.isFinite(cloud) ? Math.min(1, Math.max(0, cloud)) : 0);
  const irrFrac = $derived(Number.isFinite(irr) ? Math.min(1, irr / 1000) : 0);
  const clearFrac = $derived(Number.isFinite(clear) ? Math.min(1, clear / 1000) : 0);
  const dow = $derived(Number.isFinite(day) ? DAYS[((day % 7) + 7) % 7] : '—');
</script>

<section class="strip mono" aria-label="Simulated day">
  <div class="clock">
    <div class="t">{hhmm(hour)}</div>
    <div class="d">{dow} &middot; day {Number.isFinite(day) ? day : '—'} &middot; {season || '—'}</div>
    <div class="d">{num(temp, 0)} &deg;C ambient</div>
  </div>

  <svg bind:clientWidth={W} viewBox={`0 0 ${W} 74`} preserveAspectRatio="none" role="img" aria-label={`Sun at ${hhmm(hour)}, cloud cover ${num(cloudOp * 100, 0)} percent, tariff ${band}`}>
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--bg-3)" />
        <stop offset="1" stop-color="var(--bg-2)" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width={W} height={SKY_H} fill="url(#sky)" />
    <!-- darkness outside the sunrise / sunset window -->
    <rect x="0" y="0" width={X(SUNRISE)} height={SKY_H} fill="var(--bg-0)" opacity="0.55" />
    <rect x={X(SUNSET)} y="0" width={W - X(SUNSET)} height={SKY_H} fill="var(--bg-0)" opacity="0.55" />
    <line x1="0" y1={horizon} x2={W} y2={horizon} stroke="var(--line-strong)" stroke-width="1" vector-effect="non-scaling-stroke" />
    <path d={arc} fill="none" stroke="var(--solar)" stroke-opacity="0.35" stroke-width="1.5" stroke-dasharray="3 4" vector-effect="non-scaling-stroke" />
    <!-- cloud layer: opacity follows Cloudiness -->
    <g class="clouds" style:opacity={cloudOp} style:transition="opacity 1s linear">
      <ellipse cx="180" cy="16" rx="90" ry="9" /><ellipse cx="250" cy="22" rx="70" ry="8" />
      <ellipse cx="520" cy="12" rx="110" ry="9" /><ellipse cx="610" cy="20" rx="80" ry="8" />
      <ellipse cx="860" cy="16" rx="100" ry="9" /><ellipse cx="940" cy="24" rx="70" ry="7" />
      <ellipse cx="1090" cy="14" rx="80" ry="8" />
    </g>
    <!-- sun / moon at the current hour -->
    {#if night}
      <circle cx={sunX} cy={Math.min(sunY, SKY_H - 6)} r="4" fill="var(--fg-1)" opacity="0.7" />
    {:else}
      <circle cx={sunX} cy={sunY} r="12" fill="var(--solar)" opacity="0.18" />
      <circle cx={sunX} cy={sunY} r="6" fill="var(--solar)" />
    {/if}

    <!-- tariff band -->
    {#each segs as [a, b, name, r] (`${a}-${name}`)}
      <rect x={X(a as number) + 1} y={BAND_Y} width={X((b as number) - (a as number)) - 2} height={BAND_H} rx="2" fill={BAND_COLOR[name as string]} opacity={name === band ? 0.85 : 0.32} />
      {#if (b as number) - (a as number) >= 3}<text class="seg" class:cur={name === band} x={X(((a as number) + (b as number)) / 2)} y={BAND_Y + 11} text-anchor="middle">{name} {(r as number).toFixed(2)}</text>{/if}
    {/each}
    {#if !weekend}
      <rect class="win" class:on={window_} x={X(16)} y={BAND_Y - 2} width={X(5)} height={BAND_H + 4} rx="3" />
    {/if}
    {#each [0, 6, 12, 18, 24] as h (h)}<text class="hr" x={Math.min(Math.max(X(h), 8), W - 8)} y="73" text-anchor="middle">{String(h).padStart(2, '0')}</text>{/each}
    <!-- current hour marker -->
    <line class="now" x1={sunX} y1="0" x2={sunX} y2={BAND_Y + BAND_H + 2} vector-effect="non-scaling-stroke" />
  </svg>

  <div class="side">
    <div class="tile">
      <div class="k">TARIFF</div>
      <div class="v" style:color={bandColor}>{band || '—'}</div>
      <div class="s">${num(rate, 2)}/kWh{window_ ? ' · DEMAND WINDOW' : ''}</div>
    </div>
    <div class="tile">
      <div class="k">SUN</div>
      <div class="irr"><i class="clr" style:transform={`scaleX(${clearFrac})`}></i><i class="act" style:transform={`scaleX(${irrFrac})`}></i></div>
      <div class="s">{num(irr, 0)} W/m&sup2; &middot; cloud {num(cloudOp * 100, 0)} %</div>
    </div>
    <div class="tile">
      <div class="k">GRID CO&#8322;</div>
      <div class="v2">{num(co2, 0)}</div>
      <div class="s">g/kWh &middot; {pretty(weekend ? 'weekend' : 'weekday')}</div>
    </div>
  </div>
</section>

<style>
  .strip { position: fixed; left: 0; right: 0; top: var(--hud-h); height: var(--strip-h); z-index: 9; display: flex; align-items: stretch; gap: var(--space-4); padding: var(--space-2) var(--space-4); padding-right: 64px; background: color-mix(in srgb, var(--bg-1) 62%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent); color: var(--fg-1); }
  .clock { display: flex; flex-direction: column; justify-content: center; min-width: 150px; }
  .t { font-size: var(--text-xl); font-weight: 600; color: var(--fg-0); line-height: 1.05; }
  .d { font-size: var(--text-xs); color: var(--fg-2); white-space: nowrap; }
  svg { flex: 1; min-width: 0; height: 100%; display: block; border-radius: var(--radius-2); }
  .clouds ellipse { fill: var(--fg-1); animation: drift 40s linear infinite alternate; }
  @keyframes drift { from { transform: translateX(-30px); } to { transform: translateX(30px); } }
  .seg { font: 500 9px var(--font-mono); fill: var(--fg-1); pointer-events: none; }
  .seg.cur { fill: var(--bg-0); font-weight: 700; }
  .hr { font: 400 9px var(--font-mono); fill: var(--fg-2); }
  .win { fill: none; stroke: var(--alarm); stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.45; vector-effect: non-scaling-stroke; }
  .win.on { stroke-width: 2; opacity: 1; stroke-dasharray: none; }
  .now { stroke: var(--fg-0); stroke-width: 1.5; opacity: 0.9; }
  .side { display: flex; gap: var(--space-4); }
  .tile { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 120px; }
  .k { color: var(--fg-2); font-size: var(--text-xs); letter-spacing: 0.1em; }
  .v { font-size: var(--text-md); font-weight: 700; letter-spacing: 0.06em; line-height: 1.1; }
  .v2 { font-size: var(--text-lg); font-weight: 600; color: var(--fg-0); line-height: 1.1; }
  .s { color: var(--fg-2); font-size: var(--text-xs); white-space: nowrap; }
  .irr { position: relative; height: 8px; border-radius: 4px; background: var(--bg-3); overflow: hidden; }
  .irr i { position: absolute; inset: 0; transform-origin: left; display: block; }
  .irr .clr { background: color-mix(in srgb, var(--solar) 25%, transparent); }
  .irr .act { background: var(--solar); transition: transform var(--dur-slow) var(--ease-out); }
  @media (max-width: 1500px) {
    .side { gap: var(--space-3); }
    .tile { min-width: 0; }
    .clock { min-width: 120px; }
  }
</style>
