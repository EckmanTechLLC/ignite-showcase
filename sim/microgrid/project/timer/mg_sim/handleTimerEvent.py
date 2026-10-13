def handleTimerEvent():
	import math
	import random

	# Campus Microgrid simulation - 1 s gateway timer (ADR-005 Amendment A1).
	# All state lives in tags under [default]MG/ (see sim/microgrid/README.md); this script keeps no state
	# of its own. One readBlocking, one writeBlocking per tick. Jython 2.7 only.

	BASE = "[default]MG/"
	LOGGER = "mg_sim"

	NA = 4
	ARR = [1, 2, 3, 4]
	INVS = ["A", "B"]
	NC = 10
	SCENARIOS = ["normal", "grid_outage", "cloud_front_ev_rush", "peak_shave_day", "inverter_fault"]
	BMODES = ["PEAK_SHAVE", "SELF_CONSUME", "BACKUP", "IDLE", "ISLAND"]
	DEFAULT_MODES = ["PEAK_SHAVE", "SELF_CONSUME"]

	# --- plant constants -------------------------------------------------------------------------
	LAT = 37.0
	STR_KWP = 30.0            # per string, 6 strings per array
	INV_AC = 75.0             # per inverter
	ARRAY_AC = 150.0
	TEMP_COEF = -0.0040       # module power per K
	BESS_KWH = 500.0
	BESS_KW = 250.0
	BESS_ETA = 0.95           # one way, about 90 % round trip
	SOC_MIN = 5.0             # hard floor
	SOC_RESERVE = 20.0        # kept back from PEAK_SHAVE / SELF_CONSUME for backup
	GEN_RATED = 400.0
	GEN_MIN = 120.0           # 30 % minimum load
	GEN_SENSE_S = 3.0         # island must last this long before the start command
	GEN_START_S = 10.0
	GEN_COOLDOWN_S = 20.0
	RESYNC_S = 6.0
	FUEL_PCT_PER_KWH = 0.28 / 2000.0 * 100.0   # 0.28 L/kWh from a 2000 L tank
	DEMAND_USD_PER_KW = 0.50
	EXPORT_CREDIT = 0.06
	EV_KW = 22.0
	FC_CLOUD = 0.15           # climatological cloudiness the day-ahead PV forecast assumes
	BLD_HVAC = [5.0, 3.5, 3.8]

	# --- keys --------------------------------------------------------------------------------------
	def ik(a, inv, name):
		return "PV/A%d/Inverter/%s/%s" % (a, inv, name)

	def sk(a, s, name):
		return "PV/A%d/String/S%d/%s" % (a, s, name)

	def ek(c, name):
		return "EV/C%02d/%s" % (c, name)

	KEYS = []
	for k in ["HourOfDay", "DayIndex", "Season", "IsWeekend", "SunElevationDeg", "ClearSkyIrradianceWm2",
			  "IrradianceWm2", "Cloudiness", "AmbientTempC", "TariffBand", "TariffRate", "DemandWindow",
			  "GridCO2gPerKWh"]:
		KEYS.append("Time/" + k)
	for a in ARR:
		for k in ["ACkW", "DCkW", "Health", "Curtailed", "CurtailSetpointkW", "ModuleTempC", "IrradianceWm2",
				  "TodaykWh"]:
			KEYS.append("PV/A%d/%s" % (a, k))
		for inv in INVS:
			for k in ["State", "ACkW", "DCkW", "TempC", "Efficiency", "LoadPct"]:
				KEYS.append(ik(a, inv, k))
		for s in range(1, 7):
			for k in ["DCkW", "Voltage", "Current", "Health"]:
				KEYS.append(sk(a, s, k))
	for b in (1, 2):
		for k in ["SOCPct", "kW", "kWhAvailable", "CellTempC", "Mode", "State", "ThroughputMWh", "MaxChargekW",
				  "MaxDischargekW", "SOHPct"]:
			KEYS.append("BESS/B%d/%s" % (b, k))
	for k in ["Available", "Islanded", "ImportkW", "ExportkW", "VoltageV", "FrequencyHz", "TodayImportkWh",
			  "TodayExportkWh", "TodayCostUSD", "BaselineCostUSD", "PeakImportkW", "BaselinePeakkW",
			  "DemandChargeUSD", "DemandkW", "DemandLimitkW", "ExportLimitkW"]:
		KEYS.append("Grid/" + k)
	for k in ["State", "kW", "FuelPct", "RunHours", "StartCountdownS", "CoolantTempC"]:
		KEYS.append("Genset/" + k)
	for c in range(1, NC + 1):
		for k in ["State", "kW", "SessionkWh", "CarSOCPct", "Smart", "CarCapacitykWh", "TargetSOCPct", "MaxkW"]:
			KEYS.append(ek(c, k))
	for k in ["TotalkW", "ActiveSessions", "CurtailedkW"]:
		KEYS.append("EV/" + k)
	for i in (1, 2, 3):
		for k in ["kW", "HVACkW", "Critical", "Shed"]:
			KEYS.append("Loads/Bldg%d/%s" % (i, k))
	for k in ["TotalkW", "CriticalkW", "BuildingsTotalkW"]:
		KEYS.append("Loads/" + k)
	for k in ["NetLoadkW", "PVFractionPct", "SelfSufficiencyPct", "PVTotalkW", "BESSTotalkW", "TodayPVkWh",
			  "TodaySavingsUSD", "TodayCO2AvoidedKg", "ActiveAlarms", "Mode"]:
		KEYS.append("KPI/" + k)
	for k in ["PVkW", "LoadkW", "PricePerkWh"]:
		KEYS.append("Forecast/" + k)
	for k in ["Enabled", "Scenario", "ScenarioStep", "SpeedFactor", "Seed", "TickCount", "LastTickMs", "Cloudiness",
			  "SetHour", "LastError", "Fault/GridOut", "Fault/Charger", "Fault/BESS/B1", "Fault/BESS/B2",
			  "State/LastEpochMs", "State/OkStreak", "State/ScenarioApplied", "State/ScenarioClock",
			  "State/ScenarioStartDay", "State/DayOfYear", "State/CloudBase", "State/HeatC", "State/IslandClockS",
			  "State/ResyncClockS", "State/GenRunS", "State/GenCooldownS", "State/FreqDevHz", "State/VoltDevV",
			  "State/PrevMode/B1", "State/PrevMode/B2", "State/BaselineDemandkW", "State/EnergyCostUSD",
			  "State/BaselineEnergyCostUSD", "State/TargetSOCPct"]:
		KEYS.append("_Sim_/" + k)
	for a in ARR:
		for inv in INVS:
			KEYS.append("_Sim_/Fault/Inv/A%d%s" % (a, inv))
	SIX = ["FuelPct", "RunHours", "ThroughputMWh", "CloudBase", "SOHPct"]

	# --- helpers -----------------------------------------------------------------------------------
	def clamp(x, lo, hi):
		if x < lo:
			return lo
		if x > hi:
			return hi
		return x

	def lag(cur, target, h, tau):
		return cur + (target - cur) * (1.0 - math.exp(-h / tau))

	def sig(h, c, w):
		return 1.0 / (1.0 + math.exp(-(h - c) / w))

	def gauss(h, c, w):
		return math.exp(-0.5 * ((h - c) / w) ** 2)

	def fract(x):
		return x - math.floor(x)

	def coerce(key, orig, v):
		if isinstance(orig, bool):
			return bool(v)
		if isinstance(orig, float):
			for t in SIX:
				if key.endswith(t):
					return round(float(v), 6)
			return round(float(v), 4)
		if isinstance(orig, (int, long)):
			return int(v)
		return v

	# --- environment models (pure functions of the clock; the forecast uses the same ones) --------------
	def sun_elev(h, doy):
		decl = math.radians(23.44 * math.sin(2.0 * math.pi * (284.0 + doy) / 365.0))
		lat = math.radians(LAT)
		ha = math.radians(15.0 * (h - 12.0))
		s = math.sin(lat) * math.sin(decl) + math.cos(lat) * math.cos(decl) * math.cos(ha)
		return math.degrees(math.asin(clamp(s, -1.0, 1.0)))

	def clear_sky(el):
		if el <= 0.5:
			return 0.0
		cz = math.sin(math.radians(el))
		return 1098.0 * cz * math.exp(-0.057 / cz)

	def amb_model(h, doy):
		mean = 16.0 + 9.0 * math.sin(2.0 * math.pi * (doy - 110.0) / 365.0)
		return mean + 6.5 * math.cos(2.0 * math.pi * (h - 15.5) / 24.0)

	def season_of(doy):
		if doy < 80 or doy >= 355:
			return "WINTER"
		if doy < 172:
			return "SPRING"
		if doy < 265:
			return "SUMMER"
		return "AUTUMN"

	def tariff(h, wk):
		if wk:
			if h >= 22.0 or h < 8.0:
				return "OFFPEAK", 0.09, False
			return "SHOULDER", 0.14, False
		if h >= 22.0 or h < 7.0:
			return "OFFPEAK", 0.09, False
		if 16.0 <= h < 21.0:
			return "PEAK", 0.34, True
		return "SHOULDER", 0.16, False

	def co2_int(h, wk):
		v = 400.0 - 110.0 * gauss(h, 13.0, 3.5) + 130.0 * gauss(h, 19.0, 2.0)
		if wk:
			v -= 20.0
		return v

	def bldg_base(i, h, wk):
		if i == 0:
			occ = sig(h, 7.5, 0.7) - sig(h, 18.0, 0.9)
			if wk:
				occ *= 0.15
			return 35.0 + 105.0 * occ, occ
		if i == 1:
			occ = sig(h, 8.0, 0.8) - sig(h, 19.0, 1.0)
			if wk:
				occ *= 0.25
			return 85.0 + 40.0 * occ, 0.5 + 0.5 * occ
		if wk:
			kw = 50.0 + 45.0 * gauss(h, 10.0, 2.5) + 100.0 * gauss(h, 19.5, 2.2)
		else:
			kw = 45.0 + 70.0 * gauss(h, 7.5, 1.2) + 95.0 * gauss(h, 19.5, 2.0) + 25.0 * gauss(h, 13.0, 3.0)
		return kw, clamp((kw - 40.0) / 110.0, 0.0, 1.0)

	def hvac_kw(i, occ, temp):
		cool = max(0.0, temp - 17.0) * BLD_HVAC[i] * (0.30 + 0.70 * occ)
		heat = max(0.0, 12.0 - temp) * 1.2 * (0.30 + 0.70 * occ)
		return cool + heat

	def ev_rate(h, wk):
		if wk:
			return 0.2 + 2.6 * gauss(h, 12.0, 3.0)
		return 0.25 + 6.5 * gauss(h, 8.0, 0.9) + 7.5 * gauss(h, 17.9, 1.1) + 1.8 * gauss(h, 12.3, 2.0)

	def inv_eta(f):
		return clamp(0.985 - 0.015 / (f + 0.1), 0.80, 0.985)

	def pv_forecast(h, doy):
		g = clear_sky(sun_elev(h, doy)) * (1.0 - 0.8 * FC_CLOUD ** 1.2)
		if g <= 0.0:
			return 0.0
		tm = amb_model(h, doy) + 0.031 * g
		dc = 3.0 * STR_KWP * g / 1000.0 * (1.0 + TEMP_COEF * (tm - 25.0)) * 0.97
		return 8.0 * min(INV_AC, dc * inv_eta(dc / INV_AC))

	def load_forecast(h, doy, wk):
		t = amb_model(h, doy)
		tot = 0.0
		for i in range(3):
			base, occ = bldg_base(i, h, wk)
			tot += base + hvac_kw(i, occ, t)
		return tot + min(NC * EV_KW, ev_rate(h, wk) * 26.0 * 0.8)

	def taper(soc):
		if soc <= 80.0:
			return 1.0
		return clamp((100.0 - soc) / 20.0, 0.15, 1.0)

	# --- time and scenarios ----------------------------------------------------------------------------
	def reset_daily(S):
		for k in ["Grid/TodayImportkWh", "Grid/TodayExportkWh", "Grid/PeakImportkW", "Grid/BaselinePeakkW",
				  "KPI/TodayPVkWh", "KPI/TodayCO2AvoidedKg", "_Sim_/State/EnergyCostUSD",
				  "_Sim_/State/BaselineEnergyCostUSD"]:
			S[k] = 0.0
		for a in ARR:
			S["PV/A%d/TodaykWh" % a] = 0.0

	def set_hour(S, h):
		S["Time/HourOfDay"] = h % 24.0
		reset_daily(S)

	def to_weekday(S):
		d = S["Time/DayIndex"]
		if d % 7 >= 5:
			S["Time/DayIndex"] = d + 7 - d % 7
			S["_Sim_/State/ScenarioStartDay"] = S["Time/DayIndex"]
			S["_log"].append("scenario moves to Monday (day %d)" % S["Time/DayIndex"])

	def set_default_modes(S):
		for b in (1, 2):
			S["BESS/B%d/Mode" % b] = DEFAULT_MODES[b - 1]

	def any_inv_fault(S):
		for a in ARR:
			for inv in INVS:
				if S["_Sim_/Fault/Inv/A%d%s" % (a, inv)]:
					return True
		return False

	def apply_scenario(S):
		sc = S["_Sim_/Scenario"]
		if sc not in SCENARIOS:
			S["_log"].append("unknown scenario %s, back to normal" % sc)
			S["_Sim_/LastError"] = "unknown scenario '%s'" % sc
			S["_Sim_/State/OkStreak"] = 0
			sc = "normal"
			S["_Sim_/Scenario"] = "normal"
		prev = S["_Sim_/State/ScenarioApplied"]
		if sc != prev:
			S["_log"].append("scenario %s -> %s" % (prev, sc))
			S["_Sim_/State/ScenarioApplied"] = sc
			S["_Sim_/State/ScenarioClock"] = 0.0
			S["_Sim_/State/ScenarioStartDay"] = S["Time/DayIndex"]
			if prev == "grid_outage":
				S["_Sim_/Fault/GridOut"] = False
			if prev == "inverter_fault":
				for a in ARR:
					for inv in INVS:
						S["_Sim_/Fault/Inv/A%d%s" % (a, inv)] = False
			if prev == "peak_shave_day":
				S["_Sim_/State/HeatC"] = 0.0
				set_default_modes(S)
			if sc == "grid_outage":
				S["_Sim_/Fault/GridOut"] = True
			elif sc == "cloud_front_ev_rush":
				to_weekday(S)
				set_hour(S, 16.0)
			elif sc == "peak_shave_day":
				to_weekday(S)
				set_hour(S, 5.0)
				S["_Sim_/State/HeatC"] = 7.0
				S["BESS/B1/Mode"] = "PEAK_SHAVE"
				S["BESS/B2/Mode"] = "PEAK_SHAVE"
			elif sc == "inverter_fault":
				if not any_inv_fault(S):
					S["_Sim_/Fault/Inv/A2B"] = True
		return sc

	def scenario_step(S, sc, h, minhealth):
		step = 0
		if sc == "grid_outage":
			gen = S["Genset/State"]
			if S["Grid/Islanded"] and not S["Grid/Available"]:
				step = 1
				if gen == "STARTING":
					step = 2
				if gen == "RUNNING":
					step = 3
			elif S["Grid/Islanded"]:
				step = 4
			else:
				step = 5
				S["_Sim_/Scenario"] = "normal"
		elif sc == "cloud_front_ev_rush":
			if h < 17.0:
				step = 1
			elif h < 19.0:
				step = 2
			else:
				step = 3
			if h >= 20.0 or S["Time/DayIndex"] != S["_Sim_/State/ScenarioStartDay"]:
				S["_Sim_/Scenario"] = "normal"
		elif sc == "peak_shave_day":
			if h < 16.0:
				step = 1
			elif h < 21.0:
				step = 2
			else:
				step = 3
			if S["Time/DayIndex"] != S["_Sim_/State/ScenarioStartDay"]:
				S["_Sim_/Scenario"] = "normal"
		elif sc == "inverter_fault":
			if any_inv_fault(S):
				step = 1
				if minhealth < 75.0:
					step = 2
			else:
				step = 3
				S["_Sim_/Scenario"] = "normal"
		S["_Sim_/ScenarioStep"] = step

	# --- the model ------------------------------------------------------------------------------------
	def model(S, ds, he, real, rng, tick):
		dh = ds / 3600.0
		sc = apply_scenario(S)
		S["_Sim_/State/ScenarioClock"] += ds

		# ---- clock
		req = S["_Sim_/SetHour"]
		if req >= 0.0:
			set_hour(S, req)
			S["_Sim_/SetHour"] = -1.0
			S["_log"].append("hour set to %.2f" % S["Time/HourOfDay"])
		else:
			hr = S["Time/HourOfDay"] + dh
			if hr >= 24.0:
				hr -= 24.0
				S["Time/DayIndex"] += 1
				S["_Sim_/State/DayOfYear"] = S["_Sim_/State/DayOfYear"] % 365 + 1
				reset_daily(S)
				S["_log"].append("day %d begins" % S["Time/DayIndex"])
			S["Time/HourOfDay"] = hr
		h = S["Time/HourOfDay"]
		doy = S["_Sim_/State/DayOfYear"]
		wk = (S["Time/DayIndex"] % 7) >= 5
		S["Time/IsWeekend"] = wk
		S["Time/Season"] = season_of(doy)

		# ---- sun, cloud, ambient, tariff
		el = sun_elev(h, doy)
		clear = clear_sky(el)
		S["Time/SunElevationDeg"] = el
		S["Time/ClearSkyIrradianceWm2"] = clear
		cb = S["_Sim_/State/CloudBase"]
		cb = clamp(cb + (0.22 - cb) * 0.04 * real + 0.035 * rng.gauss(0.0, 1.0) * math.sqrt(real), 0.0, 0.75)
		S["_Sim_/State/CloudBase"] = cb
		if S["_Sim_/Cloudiness"] >= 0.0:
			ctarget = clamp(S["_Sim_/Cloudiness"], 0.0, 1.0)
		else:
			w = 0.0
			if sc == "cloud_front_ev_rush":
				if h < 16.7:
					w = 0.0
				elif h < 17.4:
					w = (h - 16.7) / 0.7
				elif h < 19.0:
					w = 1.0
				elif h < 19.8:
					w = 1.0 - (h - 19.0) / 0.8
			ctarget = clamp(cb + (0.95 - cb) * w, 0.0, 1.0)
		cloud = clamp(lag(S["Time/Cloudiness"], ctarget, real, 3.0), 0.0, 1.0)
		S["Time/Cloudiness"] = cloud
		irr_site = clear * (1.0 - 0.8 * cloud ** 1.2)
		if irr_site < 2.0:
			irr_site = 0.0
		S["Time/IrradianceWm2"] = irr_site
		amb_t = amb_model(h, doy) + S["_Sim_/State/HeatC"] - 2.5 * cloud * (clear / 1000.0)
		amb = lag(S["Time/AmbientTempC"], amb_t, ds, 1800.0)
		S["Time/AmbientTempC"] = amb
		band, rate, window = tariff(h, wk)
		if band != S["Time/TariffBand"]:
			S["_log"].append("tariff band %s -> %s at %.2f h" % (S["Time/TariffBand"], band, h))
		S["Time/TariffBand"] = band
		S["Time/TariffRate"] = rate
		S["Time/DemandWindow"] = window
		ci = co2_int(h, wk)
		S["Time/GridCO2gPerKWh"] = ci

		# ---- grid / island state machine (electrical clock he)
		grid_out = bool(S["_Sim_/Fault/GridOut"])
		S["Grid/Available"] = not grid_out
		isl = bool(S["Grid/Islanded"])
		gen = S["Genset/State"]
		if grid_out and not isl:
			isl = True
			S["Grid/Islanded"] = True
			S["_Sim_/State/IslandClockS"] = 0.0
			S["_Sim_/State/ResyncClockS"] = 0.0
			S["_Sim_/State/FreqDevHz"] = -1.6
			S["_Sim_/State/VoltDevV"] = -38.0
			for b in (1, 2):
				if S["BESS/B%d/Mode" % b] != "ISLAND":
					S["_Sim_/State/PrevMode/B%d" % b] = S["BESS/B%d/Mode" % b]
				S["BESS/B%d/Mode" % b] = "ISLAND"
			S["_log"].append("grid lost: islanded, BESS grid-forming")
		elif isl:
			S["_Sim_/State/IslandClockS"] += he
			if grid_out:
				S["_Sim_/State/ResyncClockS"] = 0.0
			else:
				S["_Sim_/State/ResyncClockS"] += he
				if S["_Sim_/State/ResyncClockS"] >= RESYNC_S:
					isl = False
					S["Grid/Islanded"] = False
					for b in (1, 2):
						if S["BESS/B%d/Mode" % b] == "ISLAND":
							S["BESS/B%d/Mode" % b] = S["_Sim_/State/PrevMode/B%d" % b]
					S["_log"].append("grid resynchronised: islanded false")
		# genset
		if gen == "OFF":
			if isl and S["_Sim_/State/IslandClockS"] >= GEN_SENSE_S:
				gen = "STARTING"
				S["Genset/StartCountdownS"] = GEN_START_S
				S["_log"].append("genset STARTING")
		elif gen == "STARTING":
			S["Genset/StartCountdownS"] = max(0.0, S["Genset/StartCountdownS"] - he)
			if not isl:
				gen = "OFF"
				S["Genset/StartCountdownS"] = 0.0
			elif S["Genset/StartCountdownS"] <= 0.0:
				gen = "RUNNING"
				S["_Sim_/State/GenRunS"] = 0.0
				S["_Sim_/State/FreqDevHz"] -= 0.5
				S["_Sim_/State/VoltDevV"] -= 10.0
				S["_log"].append("genset RUNNING")
		elif gen == "RUNNING":
			S["_Sim_/State/GenRunS"] += he
			if not isl:
				gen = "COOLDOWN"
				S["_Sim_/State/GenCooldownS"] = 0.0
				S["_log"].append("genset COOLDOWN")
		elif gen == "COOLDOWN":
			S["_Sim_/State/GenCooldownS"] += he
			if isl:
				gen = "RUNNING"
			elif S["_Sim_/State/GenCooldownS"] >= GEN_COOLDOWN_S:
				gen = "OFF"
				S["_log"].append("genset OFF")
		S["Genset/State"] = gen

		# ---- PV, phase 1: what each inverter could deliver
		inv_rows = []
		pv_avail = 0.0
		min_health = 100.0
		for a in ARR:
			sh = (1.0 - abs(2.0 * cloud - 1.0)) * 0.35
			local = clamp(cloud + (rng.random() - 0.5) * sh, 0.0, 1.0)
			g_t = clear * (1.0 - 0.8 * local ** 1.2)
			g = lag(S["PV/A%d/IrradianceWm2" % a], g_t, real, 1.5)
			if g < 2.0:
				g = 0.0
			S["PV/A%d/IrradianceWm2" % a] = g
			tm = lag(S["PV/A%d/ModuleTempC" % a], amb + 0.031 * g, ds, 240.0)
			S["PV/A%d/ModuleTempC" % a] = tm
			avail = []
			for s in range(1, 7):
				soil = 0.94 + 0.06 * fract(abs(math.sin((a * 6 + s) * 12.9898)) * 43758.5453)
				avail.append(g / 1000.0 * STR_KWP * (1.0 + TEMP_COEF * (tm - 25.0)) * soil)
			n_run = 0
			for inv in INVS:
				if not S["_Sim_/Fault/Inv/A%d%s" % (a, inv)]:
					n_run += 1
			setp = S["PV/A%d/CurtailSetpointkW" % a]
			for ii in range(2):
				inv = INVS[ii]
				fault = bool(S["_Sim_/Fault/Inv/A%d%s" % (a, inv)])
				dc_av = avail[ii * 3] + avail[ii * 3 + 1] + avail[ii * 3 + 2]
				temp = S[ik(a, inv, "TempC")]
				derate = clamp(1.0 - 0.04 * max(0.0, temp - 60.0), 0.3, 1.0)
				rated_eff = INV_AC * derate
				limit = rated_eff
				if n_run > 0:
					limit = min(rated_eff, setp / float(n_run))
				ac_nom = dc_av * inv_eta(dc_av / INV_AC)
				ac_free = min(ac_nom, rated_eff)
				ac = min(ac_nom, limit)
				night = (g < 8.0)
				if fault or night:
					ac = 0.0
					ac_free = 0.0
				pv_avail += ac
				inv_rows.append({"a": a, "inv": inv, "ii": ii, "fault": fault, "night": night, "ac": ac,
								 "ac_free": ac_free, "dc_av": dc_av, "avail": avail, "g": g, "tm": tm})

		# ---- loads: buildings
		bl_total = 0.0
		bl_crit = 0.0
		bl_demand = 0.0
		for i in range(3):
			base, occ = bldg_base(i, h, wk)
			hv = hvac_kw(i, occ, amb)
			tgt = (base + hv) * (1.0 + (rng.random() - 0.5) * 0.04)
			key = "Loads/Bldg%d/" % (i + 1)
			shed = bool(isl and not S[key + "Critical"])
			cur = S[key + "kW"] if not S[key + "Shed"] else tgt
			kw = lag(cur, tgt, ds, 240.0)
			bl_demand += kw
			S[key + "Shed"] = shed
			if shed:
				S[key + "kW"] = 0.0
				S[key + "HVACkW"] = 0.0
			else:
				S[key + "kW"] = kw
				S[key + "HVACkW"] = hv
				bl_total += kw
				if S[key + "Critical"]:
					bl_crit += kw

		# ---- loads: EV charging
		stress = False
		if window and (S["Grid/DemandkW"] > 0.9 * S["Grid/DemandLimitkW"] or S["Grid/ImportkW"] > 0.85 * S["Grid/DemandLimitkW"]):
			stress = True
		mult = 1.0
		if sc == "cloud_front_ev_rush" and 16.5 <= h < 19.5:
			mult = 2.0
		lam = ev_rate(h, wk) * mult
		m = lam * ds / 3600.0
		n_arr = int(m)
		if rng.random() < m - n_arr:
			n_arr += 1
		fault_ch = S["_Sim_/Fault/Charger"]
		ev_tot = 0.0
		ev_curt = 0.0
		ev_act = 0
		ev_pot = 0.0
		for c in range(1, NC + 1):
			st = S[ek(c, "State")]
			if fault_ch == c:
				if st != "FAULT":
					S["_log"].append("charger C%02d FAULT" % c)
				S[ek(c, "State")] = "FAULT"
				S[ek(c, "kW")] = 0.0
				S[ek(c, "SessionkWh")] = 0.0
				S[ek(c, "CarSOCPct")] = 0.0
				S[ek(c, "CarCapacitykWh")] = 0.0
				S[ek(c, "TargetSOCPct")] = 0.0
				continue
			if st == "FAULT":
				st = "IDLE"
			if st == "IDLE" and n_arr > 0 and not isl and rng.random() < 0.7:
				n_arr -= 1
				S[ek(c, "CarCapacitykWh")] = round(30.0 + rng.random() * 50.0, 1)
				S[ek(c, "CarSOCPct")] = round(10.0 + rng.random() * 45.0, 1)
				S[ek(c, "TargetSOCPct")] = round(80.0 + rng.random() * 20.0, 0)
				S[ek(c, "SessionkWh")] = 0.0
				st = "CHARGING"
			if st in ("CHARGING", "CURTAILED"):
				soc = S[ek(c, "CarSOCPct")]
				want = S[ek(c, "MaxkW")] * taper(soc)
				kw = want
				if isl:
					kw = 0.0
				elif stress and S[ek(c, "Smart")]:
					kw = 0.4 * want
				en = kw * dh
				cap = max(1.0, S[ek(c, "CarCapacitykWh")])
				soc += en / cap * 100.0
				S[ek(c, "SessionkWh")] += en
				S[ek(c, "CarSOCPct")] = soc
				if soc >= S[ek(c, "TargetSOCPct")]:
					st = "IDLE"
					kw = 0.0
					S[ek(c, "CarSOCPct")] = 0.0
					S[ek(c, "SessionkWh")] = 0.0
					S[ek(c, "CarCapacitykWh")] = 0.0
					S[ek(c, "TargetSOCPct")] = 0.0
				else:
					st = "CHARGING"
					if kw < 0.95 * want:
						st = "CURTAILED"
					ev_act += 1
					ev_curt += want - kw
				S[ek(c, "kW")] = kw
				ev_tot += kw
			else:
				S[ek(c, "kW")] = 0.0
			S[ek(c, "State")] = st
		S["EV/TotalkW"] = ev_tot
		S["EV/ActiveSessions"] = ev_act
		S["EV/CurtailedkW"] = ev_curt
		load = bl_total + ev_tot
		S["Loads/BuildingsTotalkW"] = bl_total
		S["Loads/TotalkW"] = load
		S["Loads/CriticalkW"] = bl_crit
		base_load = bl_demand + ev_tot

		# ---- BESS limits
		bu = []
		for b in (1, 2):
			p = "BESS/B%d/" % b
			soc = S[p + "SOCPct"]
			tc = S[p + "CellTempC"]
			st = S[p + "State"]
			if S["_Sim_/Fault/BESS/B%d" % b]:
				st = "OFF"
			elif tc > 55.0:
				st = "FAULT"
			elif st == "FAULT" and tc > 45.0:
				st = "FAULT"
			else:
				st = "ONLINE"
			S[p + "State"] = st
			mode = S[p + "Mode"]
			if mode not in BMODES:
				mode = "IDLE"
				S[p + "Mode"] = "IDLE"
			soh = S[p + "SOHPct"]
			cap = BESS_KWH * soh / 100.0
			td = clamp((50.0 - tc) / 10.0, 0.0, 1.0)
			floor = SOC_MIN
			if mode in ("PEAK_SHAVE", "SELF_CONSUME", "BACKUP", "IDLE") and not isl:
				floor = SOC_RESERVE
			if mode == "BACKUP" and not isl:
				floor = 100.0
			mdis = BESS_KW * td * clamp((soc - floor) / 3.0, 0.0, 1.0)
			mchg = BESS_KW * td * taper_chg(soc)
			if st != "ONLINE":
				mdis = 0.0
				mchg = 0.0
			bu.append({"b": b, "p": p, "soc": soc, "mode": mode, "cap": cap, "mdis": mdis, "mchg": mchg,
					   "kw": S[p + "kW"], "tc": tc, "want": 0.0})

		pv_use = pv_avail
		gen_p = 0.0
		bess_tot = 0.0
		imp = 0.0
		exp_kw = 0.0
		imb = 0.0
		if isl:
			# ---- island balance: PV, then genset (30 % minimum load), BESS grid-forming balances
			mdis_t = bu[0]["mdis"] + bu[1]["mdis"]
			mchg_t = (bu[0]["mchg"] + bu[1]["mchg"]) * 0.3
			gp_min = 0.0
			if gen == "RUNNING":
				gp_min = GEN_MIN
			pv_use = max(0.0, min(pv_avail, load + mchg_t - gp_min))
			gen_p = 0.0
			if gen == "RUNNING":
				gen_p = clamp(load - pv_use, gp_min, GEN_RATED)
			bess_tot = load - pv_use - gen_p
			if bess_tot > mdis_t:
				imb = mdis_t - bess_tot
				bess_tot = mdis_t
			elif bess_tot < -(bu[0]["mchg"] + bu[1]["mchg"]):
				imb = -(bu[0]["mchg"] + bu[1]["mchg"]) - bess_tot
				bess_tot = -(bu[0]["mchg"] + bu[1]["mchg"])
			# split pro rata to capability
			if bess_tot >= 0.0:
				tot = max(0.001, bu[0]["mdis"] + bu[1]["mdis"])
				for u in bu:
					u["want"] = bess_tot * u["mdis"] / tot
			else:
				tot = max(0.001, bu[0]["mchg"] + bu[1]["mchg"])
				for u in bu:
					u["want"] = bess_tot * u["mchg"] / tot
		else:
			# ---- grid-connected dispatch
			limit = S["Grid/DemandLimitkW"]
			tgt_imp = 0.9 * limit
			peak_goal = 0.65 * limit
			# pre-peak SOC target from the day-ahead functions (5 evaluations)
			if not wk:
				need = 0.0
				for hh in (16.5, 17.5, 18.5, 19.5, 20.5):
					need += max(0.0, load_forecast(hh, doy, False) - pv_forecast(hh, doy) - peak_goal)
				S["_Sim_/State/TargetSOCPct"] = clamp(25.0 + need / (2.0 * BESS_KWH * 0.8) * 130.0, 40.0, 95.0)
			else:
				S["_Sim_/State/TargetSOCPct"] = 40.0
			net = load - pv_use
			rem = net
			ps = [u for u in bu if u["mode"] == "PEAK_SHAVE"]
			sc_u = [u for u in bu if u["mode"] == "SELF_CONSUME"]
			if rem < 0.0 and sc_u:
				dist(sc_u, rem)
				for u in sc_u:
					rem -= u["want"]
				sc_u = []
			if ps:
				want = 0.0
				if rem < 0.0:
					want = rem
				else:
					over = rem - tgt_imp
					if over > 0.0:
						want = over
					if band == "PEAK":
						hl = max(0.25, 21.0 - h)
						e = 0.0
						for u in ps:
							e += max(0.0, (u["soc"] - SOC_RESERVE) / 100.0 * u["cap"])
						rate_b = e * 0.95 / hl
						w2 = min(rem, max(rem - peak_goal, 0.5 * rate_b))
						want = max(want, min(w2, 1.8 * rate_b))
					elif band == "OFFPEAK":
						msoc = 0.0
						for u in ps:
							msoc += u["soc"]
						msoc /= len(ps)
						if msoc < S["_Sim_/State/TargetSOCPct"]:
							want = -clamp(tgt_imp - rem, 0.0, 100.0 * len(ps))
				dist(ps, want)
				for u in ps:
					rem -= u["want"]
			if sc_u:
				dist(sc_u, rem)
				for u in sc_u:
					rem -= u["want"]
			bk = [u for u in bu if u["mode"] == "BACKUP"]
			if bk:
				for u in bk:
					gc = 0.0
					if u["soc"] < 99.5:
						gc = min(u["mchg"], 80.0)
					if rem < 0.0:
						gc = max(gc, min(u["mchg"], -rem / len(bk)))
					u["want"] = -gc
					rem += gc
			bess_tot = 0.0
			for u in bu:
				bess_tot += u["want"]
			imp_raw = load - pv_use - bess_tot
			if imp_raw < -S["Grid/ExportLimitkW"]:
				excess = -imp_raw - S["Grid/ExportLimitkW"]
				pv_use = max(0.0, pv_use - excess)

		# ---- BESS update
		bess_kw = 0.0
		for u in bu:
			p = u["p"]
			kw = u["kw"] + (u["want"] - u["kw"]) * (1.0 - math.exp(-real / 1.2))
			kw = clamp(kw, -u["mchg"], u["mdis"])
			if u["mdis"] <= 0.0 and kw > 0.0:
				kw = 0.0
			if u["mchg"] <= 0.0 and kw < 0.0:
				kw = 0.0
			if kw >= 0.0:
				de = -kw * dh / BESS_ETA
			else:
				de = -kw * dh * BESS_ETA
			soc = clamp(u["soc"] + de / max(1.0, u["cap"]) * 100.0, 0.0, 100.0)
			S[p + "SOCPct"] = soc
			S[p + "kW"] = kw
			S[p + "kWhAvailable"] = max(0.0, (soc - SOC_MIN) / 100.0 * u["cap"])
			tt = 24.0 + 0.35 * (amb - 20.0) + 15.0 * (abs(kw) / BESS_KW) ** 1.5
			S[p + "CellTempC"] = lag(u["tc"], tt, ds, 900.0)
			tp = S[p + "ThroughputMWh"] + abs(kw) * dh / 1000.0
			S[p + "ThroughputMWh"] = tp
			S[p + "SOHPct"] = clamp(100.0 - 0.25 * tp, 80.0, 100.0)
			S[p + "MaxChargekW"] = u["mchg"]
			S[p + "MaxDischargekW"] = u["mdis"]
			u["kw_new"] = kw
			bess_kw += kw
		if not isl:
			# actual flows with the lagged BESS power
			flow = load - pv_use - bess_kw
			if flow >= 0.0:
				imp = flow
				exp_kw = 0.0
			else:
				imp = 0.0
				exp_kw = -flow
		else:
			bess_tot = bess_kw
			if gen == "RUNNING":
				gen_p = clamp(load - pv_use - bess_kw, 0.0, GEN_RATED)

		# ---- PV, phase 2: apply the curtailment factor and write the plant
		cf = 1.0
		if pv_avail > 0.01:
			cf = clamp(pv_use / pv_avail, 0.0, 1.0)
		pv_total = 0.0
		arr_ac = {}
		arr_dc = {}
		arr_cur = {}
		inv_factor = {}
		for r in inv_rows:
			a = r["a"]
			inv = r["inv"]
			ac = r["ac"] * cf
			f = ac / INV_AC
			eta = inv_eta(ac / INV_AC)
			dc = 0.0
			if ac > 0.01:
				dc = ac / eta
			fac = 0.0
			if r["dc_av"] > 0.001:
				fac = clamp(dc / r["dc_av"], 0.0, 1.0)
			inv_factor[(a, inv)] = fac
			curtailed = (not r["fault"]) and (not r["night"]) and (ac < r["ac_free"] - 0.05)
			if r["fault"]:
				state = "FAULT"
			elif r["night"]:
				state = "OFF"
			elif curtailed:
				state = "CURTAILED"
			else:
				state = "RUN"
			if state != S[ik(a, inv, "State")]:
				if state == "FAULT" or S[ik(a, inv, "State")] == "FAULT":
					S["_log"].append("inverter A%d%s %s -> %s" % (a, inv, S[ik(a, inv, "State")], state))
			S[ik(a, inv, "State")] = state
			S[ik(a, inv, "ACkW")] = ac
			S[ik(a, inv, "DCkW")] = dc
			S[ik(a, inv, "LoadPct")] = ac / INV_AC * 100.0
			S[ik(a, inv, "Efficiency")] = eta * 100.0 if ac > 0.5 else 0.0
			ttarget = amb + 2.0
			if not r["fault"] and not r["night"]:
				ttarget = amb + 4.0 + 32.0 * (min(1.5, f)) ** 1.2
			S[ik(a, inv, "TempC")] = lag(S[ik(a, inv, "TempC")], ttarget, ds, 180.0)
			pv_total += ac
			arr_ac[a] = arr_ac.get(a, 0.0) + ac
			arr_dc[a] = arr_dc.get(a, 0.0) + dc
			if curtailed:
				arr_cur[a] = True
		for a in ARR:
			g = S["PV/A%d/IrradianceWm2" % a]
			tm = S["PV/A%d/ModuleTempC" % a]
			ref = max(inv_factor[(a, "A")], inv_factor[(a, "B")])
			avail = None
			for r in inv_rows:
				if r["a"] == a:
					avail = r["avail"]
					break
			mean_av = (avail[0] + avail[1] + avail[2] + avail[3] + avail[4] + avail[5]) / 6.0
			hsum = 0.0
			for s in range(1, 7):
				ii = 0 if s <= 3 else 1
				inv = INVS[ii]
				fac = inv_factor[(a, inv)]
				fault = bool(S["_Sim_/Fault/Inv/A%d%s" % (a, inv)])
				dcs = avail[s - 1] * fac
				voc = 740.0 * (1.0 + (-0.0028) * (tm - 25.0))
				vmp = 610.0 * (1.0 - 0.0030 * (tm - 25.0)) * (1.0 - 0.06 * math.exp(-g / 200.0))
				if g < 8.0:
					v = 0.0
				elif fault:
					v = voc
				else:
					v = vmp + (voc - vmp) * (1.0 - fac) * 0.7
				S[sk(a, s, "DCkW")] = dcs
				S[sk(a, s, "Voltage")] = v
				S[sk(a, s, "Current")] = dcs * 1000.0 / v if v > 50.0 else 0.0
				if g < 30.0:
					ht = 100.0
				else:
					ht = clamp(100.0 * dcs / max(0.001, mean_av * ref), 0.0, 100.0) if ref > 0.01 else 100.0
				hv_ = lag(S[sk(a, s, "Health")], ht, he, 3.0)
				S[sk(a, s, "Health")] = hv_
				hsum += hv_
				if hv_ < min_health:
					min_health = hv_
			S["PV/A%d/Health" % a] = hsum / 6.0
			S["PV/A%d/ACkW" % a] = arr_ac.get(a, 0.0)
			S["PV/A%d/DCkW" % a] = arr_dc.get(a, 0.0)
			S["PV/A%d/Curtailed" % a] = bool(arr_cur.get(a, False))
			S["PV/A%d/TodaykWh" % a] += arr_ac.get(a, 0.0) * dh
		any_cur = len(arr_cur) > 0

		# ---- genset, grid tags, bus V/Hz
		if gen == "RUNNING":
			S["Genset/kW"] = gen_p
			S["Genset/FuelPct"] = max(0.0, S["Genset/FuelPct"] - gen_p * dh * FUEL_PCT_PER_KWH)
		else:
			S["Genset/kW"] = 0.0
			if gen == "COOLDOWN":
				S["Genset/FuelPct"] = max(0.0, S["Genset/FuelPct"] - 20.0 * dh * FUEL_PCT_PER_KWH)
		if gen in ("RUNNING", "COOLDOWN"):
			S["Genset/RunHours"] += dh
		ct = 30.0
		if gen == "RUNNING":
			ct = 82.0 + 8.0 * gen_p / GEN_RATED
		elif gen in ("STARTING", "COOLDOWN"):
			ct = 55.0
		S["Genset/CoolantTempC"] = lag(S["Genset/CoolantTempC"], ct, he, 8.0)

		if isl:
			S["Grid/ImportkW"] = 0.0
			S["Grid/ExportkW"] = 0.0
			imb = clamp(pv_use + gen_p + bess_kw - load, -300.0, 300.0)
			fdev_t = -0.45 * bess_kw / (2.0 * BESS_KW) - 0.35 * gen_p / GEN_RATED + 1.5 * imb / 500.0
			vdev_t = -8.0 * bess_kw / (2.0 * BESS_KW) - 3.0 * gen_p / GEN_RATED
		else:
			S["Grid/ImportkW"] = imp
			S["Grid/ExportkW"] = exp_kw
			fdev_t = -0.02 * (imp - exp_kw) / 1000.0
			vdev_t = -0.012 * 480.0 * imp / 1000.0 + 0.012 * 480.0 * exp_kw / 300.0 + 1.5 * math.sin(h * math.pi / 12.0)
		fdev = lag(S["_Sim_/State/FreqDevHz"], fdev_t, he, 3.5)
		vdev = lag(S["_Sim_/State/VoltDevV"], vdev_t, he, 4.0)
		S["_Sim_/State/FreqDevHz"] = fdev
		S["_Sim_/State/VoltDevV"] = vdev
		S["Grid/FrequencyHz"] = 60.0 + fdev + (rng.random() - 0.5) * 0.02
		S["Grid/VoltageV"] = 480.0 + vdev + (rng.random() - 0.5) * 1.0

		# ---- demand, costs, CO2
		g_imp = S["Grid/ImportkW"]
		g_exp = S["Grid/ExportkW"]
		al = 1.0 - math.exp(-ds / 900.0)
		S["Grid/DemandkW"] = S["Grid/DemandkW"] + (g_imp - S["Grid/DemandkW"]) * al
		b_imp = 0.0
		if not isl:
			b_imp = base_load
		S["_Sim_/State/BaselineDemandkW"] = S["_Sim_/State/BaselineDemandkW"] + (b_imp - S["_Sim_/State/BaselineDemandkW"]) * al
		if window:
			S["Grid/PeakImportkW"] = max(S["Grid/PeakImportkW"], S["Grid/DemandkW"])
			S["Grid/BaselinePeakkW"] = max(S["Grid/BaselinePeakkW"], S["_Sim_/State/BaselineDemandkW"])
		S["Grid/TodayImportkWh"] += g_imp * dh
		S["Grid/TodayExportkWh"] += g_exp * dh
		if not isl:
			S["_Sim_/State/EnergyCostUSD"] += (g_imp * rate - g_exp * EXPORT_CREDIT) * dh
			S["_Sim_/State/BaselineEnergyCostUSD"] += b_imp * rate * dh
			S["KPI/TodayCO2AvoidedKg"] += (b_imp - (g_imp - g_exp)) * dh * ci / 1000.0
		S["Grid/DemandChargeUSD"] = S["Grid/PeakImportkW"] * DEMAND_USD_PER_KW
		S["Grid/TodayCostUSD"] = S["_Sim_/State/EnergyCostUSD"] + S["Grid/DemandChargeUSD"]
		S["Grid/BaselineCostUSD"] = S["_Sim_/State/BaselineEnergyCostUSD"] + S["Grid/BaselinePeakkW"] * DEMAND_USD_PER_KW

		# ---- KPIs
		S["KPI/PVTotalkW"] = pv_total
		S["KPI/BESSTotalkW"] = bess_kw
		S["KPI/NetLoadkW"] = load - pv_total
		S["KPI/TodayPVkWh"] += pv_total * dh
		if load > 0.5:
			S["KPI/PVFractionPct"] = clamp(100.0 * min(pv_total, load) / load, 0.0, 100.0)
			S["KPI/SelfSufficiencyPct"] = clamp(100.0 * (1.0 - g_imp / load), 0.0, 100.0)
		else:
			S["KPI/PVFractionPct"] = 0.0
			S["KPI/SelfSufficiencyPct"] = 100.0
		S["KPI/TodaySavingsUSD"] = S["Grid/BaselineCostUSD"] - S["Grid/TodayCostUSD"]
		if gen in ("STARTING", "RUNNING"):
			mode = "GENSET"
		elif isl:
			mode = "ISLAND"
		elif any_cur:
			mode = "CURTAILING"
		elif stress or ev_curt > 1.0:
			mode = "STRESS"
		else:
			mode = "NORMAL"
		S["KPI/Mode"] = mode

		# ---- forecast for the present hour (clock and profiles only: no cloud, no noise, no heat wave)
		S["Forecast/PVkW"] = pv_forecast(h, doy)
		S["Forecast/LoadkW"] = load_forecast(h, doy, wk)
		S["Forecast/PricePerkWh"] = rate

		scenario_step(S, sc, h, min_health)
		try:
			res = system.alarm.queryStatus(source=["prov:default:/tag:MG/*"], state=["ActiveUnacked", "ActiveAcked"])
			S["KPI/ActiveAlarms"] = len(res)
		except Exception as e:
			S["_log_err"].append("alarm query failed: %s" % e)

	def taper_chg(soc):
		if soc >= 99.9:
			return 0.0
		if soc <= 90.0:
			return 1.0
		return (100.0 - soc) / 10.0

	def dist(units, want):
		# split a wanted BESS power (positive = discharge) over units, pro rata to their present limit
		if want >= 0.0:
			tot = 0.0
			for u in units:
				tot += u["mdis"]
			for u in units:
				u["want"] = 0.0
				if tot > 0.001:
					u["want"] = min(1.0, want / tot) * u["mdis"]
		else:
			tot = 0.0
			for u in units:
				tot += u["mchg"]
			for u in units:
				u["want"] = 0.0
				if tot > 0.001:
					u["want"] = -min(1.0, -want / tot) * u["mchg"]

	# --- tag io --------------------------------------------------------------------------------------------
	def read_state():
		qvs = system.tag.readBlocking([BASE + k for k in KEYS])
		S = {}
		bad = []
		for k, qv in zip(KEYS, qvs):
			if qv.value is None or not qv.quality.isGood():
				bad.append(k)
			S[k] = qv.value
		if bad:
			raise Exception("%d tags unreadable, first %s" % (len(bad), bad[0]))
		S["_log"] = []
		S["_log_err"] = []
		return S

	def write_changes(S, orig):
		paths = []
		vals = []
		for k in KEYS:
			nv = coerce(k, orig[k], S[k])
			if nv != orig[k]:
				paths.append(BASE + k)
				vals.append(nv)
		if paths:
			res = system.tag.writeBlocking(paths, vals)
			bad = 0
			first = ""
			for p, r in zip(paths, res):
				if not r.isGood():
					bad += 1
					if not first:
						first = p
			if bad:
				raise Exception("%d tag writes failed, first %s" % (bad, first))
		return len(paths)

	def main():
		log = system.util.getLogger(LOGGER)
		t0 = system.date.toMillis(system.date.now())
		try:
			S = read_state()
			orig = dict(S)
			now = system.date.toMillis(system.date.now())
			if not S["_Sim_/Enabled"]:
				S["_Sim_/State/LastEpochMs"] = now
				write_changes(S, orig)
				return
			last = S["_Sim_/State/LastEpochMs"]
			real = 1.0
			if last > 0:
				real = clamp((now - last) / 1000.0, 0.0, 5.0)
			speed = clamp(S["_Sim_/SpeedFactor"], 1.0, 600.0)
			ds = speed * real
			he = real * clamp(speed / 120.0, 0.25, 4.0)
			S["_Sim_/State/LastEpochMs"] = now
			S["_Sim_/TickCount"] += 1
			tick = S["_Sim_/TickCount"]
			rng = random.Random(S["_Sim_/Seed"] * 100003 + tick)
			model(S, ds, he, real, rng, tick)
			for m in S["_log_err"]:
				S["_Sim_/LastError"] = m
				S["_Sim_/State/OkStreak"] = 0
			if S["_Sim_/LastError"] and not S["_log_err"]:
				S["_Sim_/State/OkStreak"] += 1
				if S["_Sim_/State/OkStreak"] >= 30:
					S["_Sim_/LastError"] = ""
			t1 = system.date.toMillis(system.date.now())
			S["_Sim_/LastTickMs"] = int(t1 - t0)
			n = write_changes(S, orig)
			t2 = system.date.toMillis(system.date.now())
			for m in S["_log"]:
				log.info(m)
			for m in S["_log_err"]:
				log.warn("mg_sim: " + m)
			if tick % 60 == 1:
				log.info("mg_sim tick %d: read+compute %d ms, write %d ms (%d tags)" % (tick, t1 - t0, t2 - t1, n))
		except Exception as e:
			import traceback
			msg = "%s: %s" % (e.__class__.__name__, e)
			try:
				tb = traceback.format_exc()
				msg = (msg + " | " + tb.replace("\n", " | "))[:900]
			except Exception:
				pass
			log.error("mg_sim tick failed: " + msg)
			try:
				system.tag.writeBlocking([BASE + "_Sim_/LastError", BASE + "_Sim_/State/OkStreak"], [msg, 0])
			except Exception:
				pass

	main()
