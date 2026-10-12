def handleTimerEvent():
	import math
	import random

	# Data Center simulation - 1 s gateway timer (ADR-005 section 4/6).
	# All state lives in tags under [default]DC/ (see sim/datacenter/README.md); this script keeps no state
	# of its own. One readBlocking, one writeBlocking per tick. Jython 2.7 only.

	BASE = "[default]DC/"
	LOGGER = "dc_sim"

	NR = 60
	ROWS = "ABCDEF"
	PDU_NAMES = ["A1", "A2", "A3", "B1", "B2", "B3"]
	UPS_NAMES = ["A", "B"]
	CHILLERS = [1, 2]
	CRAHS = [1, 2, 3, 4]

	# --- plant constants -------------------------------------------------------------------------
	UPS_RATED_KW = 500.0
	BATT_KWH = 66.0           # per UPS: about 18 min at the nominal 210 kW load
	CHARGE_PCT_S = 0.05       # battery charge rate, percent per second
	CHARGE_KW = 8.0           # charger draw while charging
	PDU_TRIP_PCT = 125.0
	NOMINAL_V = 480.0
	NOMINAL_HZ = 60.0
	GEN_START_S = 12.0
	GEN_SENSE_S = 2.0         # utility must be out this long before the start command
	GEN_WARM_S = 2.0          # running time before the ATS transfers
	RETRANSFER_S = 30.0       # utility must be stable this long before re-transfer
	COOLDOWN_S = 60.0
	FUEL_PCT_PER_KWS = 0.27 / 3600.0 / 2000.0 * 100.0   # 0.27 L/kWh, 2000 L tank
	CHILLER_RESTART_S = 20.0
	CRAH_CAP = {1: 220.0, 2: 220.0, 3: 220.0, 4: 40.0}   # kW of heat at 100 % fan
	CHILLER_CAP = 350.0
	R_MAX = 26.0              # K of recirculation rise at 100 % cooling shortfall
	TAU_INLET = 150.0
	TAU_FAN = 15.0
	TAU_RETURN = 45.0
	TAU_SUPPLY = 30.0
	MIG_T = 300.0             # simulated seconds for rack_migration to complete
	V0 = 0.45                 # rack airflow at full cooling, m3/s
	SCENARIOS = ["normal", "utility_loss", "crah_failure", "rack_migration"]
	PROFILES = ["diurnal", "flat", "bursty"]

	# workload -> (nameplate kW, base utilisation)
	WL = {"web": (8.0, 0.50), "db": (9.0, 0.60), "batch": (10.0, 0.65), "ml": (18.0, 0.80), "idle": (3.5, 0.10)}

	# --- keys --------------------------------------------------------------------------------------
	def rk(i, name):
		return "Racks/R%02d/%s" % (i + 1, name)

	KEYS = []
	for k in ["ITLoadKW", "TotalFacilityKW", "PUE", "CoolingKW", "LossesKW", "CapacityKW", "HeadroomPct",
			  "OutdoorTempC", "OutdoorHumidityPct", "HallAvgInletC", "HallMaxInletC", "HotAisleAvgC",
			  "ColdAisleAvgC", "ActiveAlarms", "Mode"]:
		KEYS.append("Hall/" + k)
	for k in ["Available", "VoltageV", "FrequencyHz", "KW"]:
		KEYS.append("Power/Utility/" + k)
	for k in ["State", "FuelPct", "KW", "RunHours", "StartCountdownS"]:
		KEYS.append("Power/Generator/" + k)
	KEYS.append("Power/Switchgear/ATSPosition")
	for u in UPS_NAMES:
		for k in ["State", "LoadKW", "LoadPct", "BatterySOCPct", "RuntimeMin", "InputV", "OutputV", "TempC",
				  "Efficiency"]:
			KEYS.append("Power/UPS/%s/%s" % (u, k))
	for p in PDU_NAMES:
		for k in ["LoadKW", "LoadPct", "CapacityKW", "BreakerTripped", "Feed"]:
			KEYS.append("Power/PDU/%s/%s" % (p, k))
	for i in range(NR):
		for k in ["Row", "PowerKW", "InletTempC", "OutletTempC", "UtilPct", "FeedA", "FeedB", "Online",
				  "Workload"]:
			KEYS.append(rk(i, k))
	for n in CHILLERS:
		for k in ["State", "SupplyC", "ReturnC", "KW", "COP"]:
			KEYS.append("Cooling/Chiller/%d/%s" % (n, k))
	for n in CRAHS:
		for k in ["State", "FanPct", "SupplyC", "ReturnC", "KW", "Zone"]:
			KEYS.append("Cooling/CRAH/%d/%s" % (n, k))
	KEYS.append("Cooling/Loop/FlowLps")
	KEYS.append("Cooling/Loop/DeltaT")
	for k in ["Enabled", "Scenario", "ScenarioStep", "SpeedFactor", "Seed", "TickCount", "LastTickMs",
			  "WorkloadProfile", "Fault/CRAH", "Fault/UtilityOut", "LastError", "State/LastEpochMs",
			  "State/OkStreak", "State/ScenarioApplied", "State/ScenarioClock", "State/UtilityLostS",
			  "State/UtilityStableS", "State/GenRunS", "State/CooldownS", "State/MechPowerS"]:
		KEYS.append("_Sim_/" + k)
	for r in ROWS:
		KEYS.append("_Sim_/State/RowScale/" + r)

	# --- helpers -----------------------------------------------------------------------------------
	def clamp(x, lo, hi):
		if x < lo:
			return lo
		if x > hi:
			return hi
		return x

	def lag(cur, target, h, tau):
		return cur + (target - cur) * (1.0 - math.exp(-h / tau))

	def hour_of_day(now):
		return system.date.getHour24(now) + system.date.getMinute(now) / 60.0 + system.date.getSecond(now) / 3600.0

	def ups_loss_kw(load):
		x = load / UPS_RATED_KW
		return UPS_RATED_KW * (0.012 + 0.015 * x + 0.02 * x * x)

	def rows_of(zone):
		out = []
		for c in str(zone):
			if c in ROWS:
				out.append(c)
		return out

	def coerce(orig, v):
		if isinstance(orig, bool):
			return bool(v)
		if isinstance(orig, float):
			return round(float(v), 3)
		if isinstance(orig, (int, long)):
			return int(v)
		return v

	# --- scenarios -----------------------------------------------------------------------------------
	def apply_scenario(S, h):
		sc = S["_Sim_/Scenario"]
		if sc not in SCENARIOS:
			S["_log"].append("unknown scenario %s, back to normal" % sc)
			S["_Sim_/LastError"] = "unknown scenario '%s'" % sc
			S["_Sim_/State/OkStreak"] = 0
			sc = "normal"
			S["_Sim_/Scenario"] = "normal"
		if sc != S["_Sim_/State/ScenarioApplied"]:
			S["_log"].append("scenario %s -> %s" % (S["_Sim_/State/ScenarioApplied"], sc))
			S["_Sim_/State/ScenarioApplied"] = sc
			S["_Sim_/State/ScenarioClock"] = 0.0
			if sc == "normal":
				S["_Sim_/Fault/CRAH"] = 0
				S["_Sim_/Fault/UtilityOut"] = False
				for p in PDU_NAMES:
					S["Power/PDU/%s/BreakerTripped" % p] = False
			elif sc == "utility_loss":
				S["_Sim_/Fault/UtilityOut"] = True
			elif sc == "crah_failure":
				if S["_Sim_/Fault/CRAH"] == 0:
					S["_Sim_/Fault/CRAH"] = 2
		else:
			S["_Sim_/State/ScenarioClock"] += h

	def row_targets(S):
		t = {}
		for r in ROWS:
			t[r] = 1.0
		if S["_Sim_/Scenario"] == "rack_migration":
			p = clamp(S["_Sim_/State/ScenarioClock"] / MIG_T, 0.0, 1.0)
			# rows A-B drain; E-F take the load plus a transient overshoot (source and target both busy during copy)
			down = 1.0 - 0.65 * p
			up = 1.0 + 0.28 * p + 0.40 * math.sin(math.pi * p)
			t["A"] = down
			t["B"] = down
			t["E"] = up
			t["F"] = up
		return t

	# --- power sources --------------------------------------------------------------------------------
	def sources(S, h, rng):
		avail = not S["_Sim_/Fault/UtilityOut"]
		S["Power/Utility/Available"] = avail
		gen = S["Power/Generator/State"]
		ats = S["Power/Switchgear/ATSPosition"]
		if avail:
			S["_Sim_/State/UtilityLostS"] = 0.0
			S["_Sim_/State/UtilityStableS"] += h
		else:
			S["_Sim_/State/UtilityLostS"] += h
			S["_Sim_/State/UtilityStableS"] = 0.0
		# generator state machine
		if not avail and gen in ("OFF", "COOLDOWN") and S["_Sim_/State/UtilityLostS"] >= GEN_SENSE_S:
			if gen == "COOLDOWN":
				gen = "RUNNING"
				S["_log"].append("generator back to RUNNING from COOLDOWN")
			else:
				gen = "STARTING"
				S["Power/Generator/StartCountdownS"] = GEN_START_S
				S["_log"].append("generator STARTING")
		elif gen == "STARTING":
			S["Power/Generator/StartCountdownS"] = max(0.0, S["Power/Generator/StartCountdownS"] - h)
			if S["Power/Generator/StartCountdownS"] <= 0.0:
				gen = "RUNNING"
				S["_Sim_/State/GenRunS"] = 0.0
				S["_log"].append("generator RUNNING")
		elif gen == "RUNNING":
			S["_Sim_/State/GenRunS"] += h
		elif gen == "COOLDOWN":
			S["_Sim_/State/CooldownS"] -= h
			if S["_Sim_/State/CooldownS"] <= 0.0:
				gen = "OFF"
				S["_log"].append("generator OFF")
		# transfer switch
		if ats == "UTILITY" and not avail:
			ats = "OPEN"
			S["_log"].append("ATS OPEN (utility lost)")
		if ats == "OPEN" and avail and S["_Sim_/State/UtilityStableS"] >= GEN_SENSE_S:
			ats = "UTILITY"
			S["_log"].append("ATS UTILITY")
		if ats == "OPEN" and gen == "RUNNING" and S["_Sim_/State/GenRunS"] >= GEN_WARM_S:
			ats = "GENERATOR"
			S["_log"].append("ATS GENERATOR")
		if ats == "GENERATOR" and avail and S["_Sim_/State/UtilityStableS"] >= RETRANSFER_S:
			ats = "UTILITY"
			S["_log"].append("ATS re-transfer to UTILITY")
		if ats == "GENERATOR" and gen != "RUNNING":
			ats = "OPEN"
		if gen == "RUNNING" and ats == "UTILITY":
			gen = "COOLDOWN"
			S["_Sim_/State/CooldownS"] = COOLDOWN_S
			S["_log"].append("generator COOLDOWN")
		if gen in ("RUNNING", "COOLDOWN"):
			S["Power/Generator/RunHours"] += h / 3600.0
		if gen != "STARTING":
			S["Power/Generator/StartCountdownS"] = 0.0
		S["Power/Generator/State"] = gen
		S["Power/Switchgear/ATSPosition"] = ats
		# bus voltage
		bus_ok = (ats == "UTILITY" and avail) or (ats == "GENERATOR" and gen == "RUNNING")
		if avail:
			S["Power/Utility/VoltageV"] = NOMINAL_V * (1.0 + rng.uniform(-0.004, 0.004))
			S["Power/Utility/FrequencyHz"] = NOMINAL_HZ + rng.uniform(-0.02, 0.02)
		else:
			S["Power/Utility/VoltageV"] = 0.0
			S["Power/Utility/FrequencyHz"] = 0.0
		if bus_ok:
			S["_Sim_/State/MechPowerS"] += h
		else:
			S["_Sim_/State/MechPowerS"] = 0.0
		return bus_ok

	# --- environment -------------------------------------------------------------------------------------
	def environment(S, h, rng, hour):
		tt = 17.0 + 9.0 * math.cos(2.0 * math.pi * (hour - 15.0) / 24.0)
		S["Hall/OutdoorTempC"] = lag(S["Hall/OutdoorTempC"], tt, h, 600.0) + rng.uniform(-0.03, 0.03)
		th = 62.0 + 22.0 * math.cos(2.0 * math.pi * (hour - 4.0) / 24.0)
		S["Hall/OutdoorHumidityPct"] = clamp(lag(S["Hall/OutdoorHumidityPct"], th, h, 900.0) + rng.uniform(-0.1, 0.1), 5.0, 100.0)

	# --- main model --------------------------------------------------------------------------------------
	def model(S, h, rng, hour, tick):
		apply_scenario(S, h)
		bus_ok = sources(S, h, rng)
		environment(S, h, rng, hour)
		ats = S["Power/Switchgear/ATSPosition"]
		profile = S["_Sim_/WorkloadProfile"]
		if profile not in PROFILES:
			profile = "diurnal"

		# row scales (rack_migration)
		targets = row_targets(S)
		for r in ROWS:
			k = "_Sim_/State/RowScale/" + r
			S[k] = lag(S[k], targets[r], h, 15.0)

		# UPS state from the bus and the battery
		ups_state = {}
		for u in UPS_NAMES:
			st = "ONLINE"
			soc = S["Power/UPS/%s/BatterySOCPct" % u]
			if not bus_ok:
				if soc > 0.0:
					st = "BATTERY"
				else:
					st = "OFF"
			elif S["Power/UPS/%s/LoadPct" % u] > 105.0:
				st = "BYPASS"
			ups_state[u] = st

		# feeds available per PDU
		feed_ok = {}
		pdu_ups = {}
		for p in PDU_NAMES:
			side = str(S["Power/PDU/%s/Feed" % p])[-1:]
			pdu_ups[p] = side
			feed_ok[p] = (ups_state.get(side) in ("ONLINE", "BATTERY", "BYPASS")) and not S["Power/PDU/%s/BreakerTripped" % p]

		# CRAH zones
		zone_of_row = {}
		for z in (1, 2, 3):
			for r in rows_of(S["Cooling/CRAH/%d/Zone" % z]):
				zone_of_row[r] = z
		for r in ROWS:
			if r not in zone_of_row:
				zone_of_row[r] = 1

		# racks: power
		c = 0.5 + 0.5 * math.cos(2.0 * math.pi * (hour - 15.0) / 24.0)
		pdu_load = {}
		for p in PDU_NAMES:
			pdu_load[p] = 0.0
		power = []
		zone_q = {1: 0.0, 2: 0.0, 3: 0.0}
		it_total = 0.0
		for i in range(NR):
			row = str(S[rk(i, "Row")])
			wl = S[rk(i, "Workload")]
			if wl not in WL:
				wl = "idle"
			nameplate, ubase = WL[wl]
			jit = 1.0 + 0.1 * math.sin(i * 2.399 + 0.5)
			mult = 1.0
			noise = 0.03
			if profile == "diurnal":
				if wl == "web":
					mult = 0.7 + 0.6 * c
				elif wl == "db":
					mult = 0.85 + 0.3 * c
				elif wl == "batch":
					mult = 1.3 - 0.6 * c
			elif profile == "bursty":
				noise = 0.08
				b = math.sin(tick * 0.07 + i * 1.7)
				if b < 0.0:
					b = 0.0
				mult = 0.8 + 0.6 * b * b * b
			u_target = clamp(ubase * mult * (1.0 + rng.uniform(-noise, noise)), 0.02, 1.0)
			util = lag(S[rk(i, "UtilPct")] / 100.0, u_target, h, 3.0)
			scale = S["_Sim_/State/RowScale/" + row]
			fa = str(S[rk(i, "FeedA")])
			fb = str(S[rk(i, "FeedB")])
			oka = feed_ok.get(fa, False)
			okb = feed_ok.get(fb, False)
			p_kw = nameplate * jit * (0.32 + 0.68 * util) * scale
			if not oka and not okb:
				p_kw = 0.0
				S[rk(i, "Online")] = False
			else:
				S[rk(i, "Online")] = True
				if oka and okb:
					pdu_load[fa] += p_kw * 0.5
					pdu_load[fb] += p_kw * 0.5
				elif oka:
					pdu_load[fa] += p_kw
				else:
					pdu_load[fb] += p_kw
			S[rk(i, "UtilPct")] = util * 100.0
			S[rk(i, "PowerKW")] = p_kw
			power.append(p_kw)
			zone_q[zone_of_row[row]] += p_kw
			it_total += p_kw

		# PDUs
		ups_load = {"A": 0.0, "B": 0.0}
		for p in PDU_NAMES:
			cap = S["Power/PDU/%s/CapacityKW" % p]
			if S["Power/PDU/%s/BreakerTripped" % p]:
				pdu_load[p] = 0.0
			pct = 100.0 * pdu_load[p] / cap
			if pct > PDU_TRIP_PCT:
				S["Power/PDU/%s/BreakerTripped" % p] = True
				S["_log"].append("PDU %s breaker tripped at %.0f %%" % (p, pct))
			S["Power/PDU/%s/LoadKW" % p] = pdu_load[p]
			S["Power/PDU/%s/LoadPct" % p] = pct
			if pdu_ups[p] in ups_load:
				ups_load[pdu_ups[p]] += pdu_load[p]

		# UPS, battery, losses
		losses = 4.0 + 0.012 * it_total
		for u in UPS_NAMES:
			pre = "Power/UPS/%s/" % u
			st = ups_state[u]
			load = ups_load[u]
			loss = 0.0
			if st != "OFF":
				loss = ups_loss_kw(load)
			soc = S[pre + "BatterySOCPct"]
			if st == "BATTERY":
				soc = soc - (load + loss) / BATT_KWH * h / 3600.0 * 100.0
			elif st == "ONLINE" and soc < 100.0:
				soc = soc + CHARGE_PCT_S * h
				losses += CHARGE_KW
			soc = clamp(soc, 0.0, 100.0)
			S[pre + "BatterySOCPct"] = soc
			S[pre + "State"] = st
			S[pre + "LoadKW"] = load
			S[pre + "LoadPct"] = 100.0 * load / UPS_RATED_KW
			if load + loss > 1.0:
				S[pre + "RuntimeMin"] = clamp(soc / 100.0 * BATT_KWH / (load + loss) * 60.0, 0.0, 180.0)
			else:
				S[pre + "RuntimeMin"] = 180.0
			if bus_ok:
				S[pre + "InputV"] = S["Power/Utility/VoltageV"]
				if ats == "GENERATOR":
					S[pre + "InputV"] = NOMINAL_V * (1.0 + rng.uniform(-0.006, 0.006))
			else:
				S[pre + "InputV"] = 0.0
			if st == "OFF":
				S[pre + "OutputV"] = 0.0
			else:
				S[pre + "OutputV"] = NOMINAL_V + rng.uniform(-0.3, 0.3)
			ttemp = 24.0 + 22.0 * (load / UPS_RATED_KW)
			if st == "BATTERY":
				ttemp += 4.0
			S[pre + "TempC"] = lag(S[pre + "TempC"], ttemp, h, 120.0)
			if load > 1.0:
				S[pre + "Efficiency"] = 100.0 * load / (load + loss)
			losses += loss

		# --- cooling and thermal -------------------------------------------------------------------------
		fault = S["_Sim_/Fault/CRAH"]
		mech = S["_Sim_/State/MechPowerS"]
		crah_run = {}
		cap = {}
		for n in CRAHS:
			pre = "Cooling/CRAH/%d/" % n
			if fault == n:
				st = "FAULT"
			elif ups_state["A"] == "OFF" and ups_state["B"] == "OFF":   # CRAH fans ride through on UPS-backed supply
				st = "OFF"
			else:
				st = "RUN"
			S[pre + "State"] = st
			crah_run[n] = (st == "RUN")
			cap[n] = CRAH_CAP[n] * S[pre + "FanPct"] / 100.0
			if st != "RUN":
				cap[n] = 0.0
		# own-zone service, deficits, assist
		served = {}
		deficit = {}
		spare = {}
		for z in (1, 2, 3):
			served[z] = min(cap[z], zone_q[z])
			deficit[z] = zone_q[z] - served[z]
			spare[z] = cap[z] - served[z]
		total_def = deficit[1] + deficit[2] + deficit[3]
		pool = cap[4] + 0.3 * (spare[1] + spare[2] + spare[3])
		coverage = {}
		for z in (1, 2, 3):
			extra = 0.0
			if total_def > 0.0:
				extra = min(deficit[z], pool * deficit[z] / total_def)
			if zone_q[z] > 0.5:
				coverage[z] = clamp((served[z] + extra) / zone_q[z], 0.0, 1.0)
			else:
				coverage[z] = 1.0
		# fan targets
		running_duty = 0
		for n in (1, 2, 3):
			if crah_run[n]:
				running_duty += 1
		heat_removed = 0.0
		for z in (1, 2, 3):
			heat_removed += zone_q[z] * coverage[z]
		crah_kw = 0.0
		for n in CRAHS:
			pre = "Cooling/CRAH/%d/" % n
			if not crah_run[n]:
				target = 0.0
				tau = 3.0
			else:
				tau = TAU_FAN
				if n == 4:
					target = clamp(30.0 + 70.0 * total_def / CRAH_CAP[4], 30.0, 100.0)
				else:
					other = total_def - deficit[n]
					need = zone_q[n] + 0.35 * other
					target = clamp(100.0 * need / CRAH_CAP[n] * 1.1 + 8.0, 30.0, 100.0)
			S[pre + "FanPct"] = lag(S[pre + "FanPct"], target, h, tau)
			fan = S[pre + "FanPct"]
			if crah_run[n]:
				kw = 1.2 + 16.8 * (fan / 100.0) ** 3
			else:
				kw = 16.8 * (fan / 100.0) ** 3
			S[pre + "KW"] = kw
			crah_kw += kw

		# chillers
		outdoor = S["Hall/OutdoorTempC"]
		chill_avail = (mech >= CHILLER_RESTART_S)
		heat = heat_removed + crah_kw + 0.012 * it_total
		n_run = 0
		if chill_avail:
			n_run = 1
			if heat > 0.8 * CHILLER_CAP:
				n_run = 2
		chiller_kw = 0.0
		sup_run = []
		sup_all = []
		for n in CHILLERS:
			pre = "Cooling/Chiller/%d/" % n
			running = chill_avail and n <= n_run
			if running:
				frac = clamp(heat / (n_run * CHILLER_CAP), 0.0, 1.2)
				cop = (5.8 - 0.11 * (outdoor - 12.0)) * (0.75 + 0.25 * min(1.0, frac / 0.7))
				cop = max(2.2, cop)
				kw = heat / n_run / cop + 3.0
				S[pre + "State"] = "RUN"
				S[pre + "COP"] = cop
				S[pre + "KW"] = kw
				chiller_kw += kw
				S[pre + "SupplyC"] = lag(S[pre + "SupplyC"], 7.0 + 1.5 * frac * frac + rng.uniform(-0.05, 0.05), h, 20.0)
				sup_run.append(S[pre + "SupplyC"])
			else:
				if chill_avail:
					S[pre + "State"] = "STANDBY"
				else:
					S[pre + "State"] = "OFF"
				S[pre + "COP"] = 0.0
				S[pre + "KW"] = 0.0
				S[pre + "SupplyC"] = lag(S[pre + "SupplyC"], 14.0, h, 400.0)
			sup_all.append(S[pre + "SupplyC"])
		if sup_run:
			chw = sum(sup_run) / len(sup_run)
		else:
			chw = sum(sup_all) / len(sup_all)
		flow = 0.0
		if n_run > 0:
			flow = 11.0 * n_run
		dtl = 0.0
		if flow > 0.0:
			dtl = heat / (flow * 4.186)
		S["Cooling/Loop/FlowLps"] = flow
		S["Cooling/Loop/DeltaT"] = dtl
		for n in CHILLERS:
			pre = "Cooling/Chiller/%d/" % n
			if S[pre + "State"] == "RUN":
				S[pre + "ReturnC"] = lag(S[pre + "ReturnC"], S[pre + "SupplyC"] + dtl, h, 20.0)
			else:
				S[pre + "ReturnC"] = lag(S[pre + "ReturnC"], S[pre + "SupplyC"], h, 120.0)

		# CRAH supply air and zone supply
		running_sup = []
		for n in CRAHS:
			pre = "Cooling/CRAH/%d/" % n
			if crah_run[n]:
				S[pre + "SupplyC"] = lag(S[pre + "SupplyC"], chw + 11.0 + rng.uniform(-0.05, 0.05), h, TAU_SUPPLY)
				running_sup.append(S[pre + "SupplyC"])
		if running_sup:
			mean_sup = sum(running_sup) / len(running_sup)
		else:
			mean_sup = S["Cooling/CRAH/1/SupplyC"]
		zone_sup = {}
		for z in (1, 2, 3):
			if crah_run[z]:
				zone_sup[z] = S["Cooling/CRAH/%d/SupplyC" % z]
			else:
				zone_sup[z] = mean_sup

		# rack inlet / outlet
		sum_in = 0.0
		sum_out = 0.0
		max_in = 0.0
		zone_hot = {1: [], 2: [], 3: []}
		for i in range(NR):
			row = str(S[rk(i, "Row")])
			ri = ROWS.index(row)
			z = zone_of_row[row]
			pos = (i % 10) / 9.0
			p_kw = power[i]
			tgt = zone_sup[z] + 1.2 + 0.45 * ri + 1.0 * pos + 0.045 * (p_kw - 7.0)
			tgt += (1.0 - coverage[z]) * R_MAX * (0.6 + 0.8 * pos)
			tin = lag(S[rk(i, "InletTempC")], tgt, h, TAU_INLET)
			vflow = V0 * (0.35 + 0.65 * coverage[z])
			tout = tin + p_kw / (1.206 * vflow)
			S[rk(i, "InletTempC")] = tin
			S[rk(i, "OutletTempC")] = tout
			sum_in += tin
			sum_out += tout
			if tin > max_in:
				max_in = tin
			zone_hot[z].append(tout)
		# CRAH return follows the hot aisle
		hall_hot = sum_out / NR
		for n in CRAHS:
			pre = "Cooling/CRAH/%d/" % n
			if n <= 3 and zone_hot[n]:
				hot = sum(zone_hot[n]) / len(zone_hot[n])
			else:
				hot = hall_hot
			S[pre + "ReturnC"] = lag(S[pre + "ReturnC"], hot - 1.5, h, TAU_RETURN)
			if not crah_run[n]:
				S[pre + "SupplyC"] = lag(S[pre + "SupplyC"], S[pre + "ReturnC"], h, 120.0)

		# --- hall KPIs -----------------------------------------------------------------------------------
		cooling = chiller_kw + crah_kw
		total = it_total + cooling + losses
		avg_in = sum_in / NR
		S["Hall/ITLoadKW"] = it_total
		S["Hall/CoolingKW"] = cooling
		S["Hall/LossesKW"] = losses
		S["Hall/TotalFacilityKW"] = total
		S["Hall/PUE"] = total / max(it_total, 1.0)
		S["Hall/HeadroomPct"] = 100.0 * (S["Hall/CapacityKW"] - it_total) / S["Hall/CapacityKW"]
		S["Hall/HallAvgInletC"] = avg_in
		S["Hall/HallMaxInletC"] = max_in
		S["Hall/HotAisleAvgC"] = hall_hot
		S["Hall/ColdAisleAvgC"] = mean_sup + 0.6 * (avg_in - mean_sup)

		# generator / utility electrical output
		gen = S["Power/Generator/State"]
		if ats == "UTILITY":
			S["Power/Utility/KW"] = total
		else:
			S["Power/Utility/KW"] = 0.0
		if ats == "GENERATOR" and gen == "RUNNING":
			S["Power/Generator/KW"] = total
			S["Power/Generator/FuelPct"] = max(0.0, S["Power/Generator/FuelPct"] - total * FUEL_PCT_PER_KWS * h)
		else:
			S["Power/Generator/KW"] = 0.0
			if gen in ("RUNNING", "COOLDOWN"):
				S["Power/Generator/FuelPct"] = max(0.0, S["Power/Generator/FuelPct"] - 20.0 * FUEL_PCT_PER_KWS * h)

		# mode and scenario step
		sc = S["_Sim_/Scenario"]
		on_batt = (ups_state["A"] == "BATTERY" or ups_state["B"] == "BATTERY")
		if on_batt:
			mode = "ON_BATTERY"
		elif ats == "GENERATOR":
			mode = "ON_GENERATOR"
		elif fault != 0 or max_in > 27.0:
			mode = "THERMAL_EVENT"
		elif sc == "rack_migration":
			mode = "MIGRATION"
		else:
			mode = "NORMAL"
		S["Hall/Mode"] = mode
		step = 0
		if sc == "utility_loss":
			if S["_Sim_/Fault/UtilityOut"]:
				step = 1
				if gen == "RUNNING" and ats != "GENERATOR":
					step = 2
				if ats == "GENERATOR":
					step = 3
			else:
				step = 4
				if ats == "UTILITY":
					step = 5
		elif sc == "crah_failure":
			step = 1
			if max_in > 27.0:
				step = 2
			if max_in > 32.0:
				step = 3
		elif sc == "rack_migration":
			step = 1
			if S["_Sim_/State/ScenarioClock"] >= MIG_T:
				step = 2
		S["_Sim_/ScenarioStep"] = step

		# active alarms from the alarm system
		try:
			res = system.alarm.queryStatus(source=["prov:default:/tag:DC/*"], state=["ActiveUnacked", "ActiveAcked"])
			S["Hall/ActiveAlarms"] = len(res)
		except Exception as e:
			S["_log_err"].append("alarm query failed: %s" % e)

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
			nv = coerce(orig[k], S[k])
			if k.endswith("FuelPct") or k.endswith("RunHours"):
				nv = round(float(S[k]), 6)
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
			now_d = system.date.now()
			now = system.date.toMillis(now_d)
			if not S["_Sim_/Enabled"]:
				S["_Sim_/State/LastEpochMs"] = now
				write_changes(S, orig)
				return
			last = S["_Sim_/State/LastEpochMs"]
			real = 1.0
			if last > 0:
				real = clamp((now - last) / 1000.0, 0.0, 5.0)
			speed = clamp(S["_Sim_/SpeedFactor"], 0.1, 60.0)
			h = speed * real
			S["_Sim_/State/LastEpochMs"] = now
			S["_Sim_/TickCount"] += 1
			tick = S["_Sim_/TickCount"]
			rng = random.Random(S["_Sim_/Seed"] * 100003 + tick)
			model(S, h, rng, hour_of_day(now_d), tick)
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
				log.warn("dc_sim: " + m)
			if tick % 60 == 1:
				log.info("dc_sim tick %d: read+compute %d ms, write %d ms (%d tags)" % (tick, t1 - t0, t2 - t1, n))
		except Exception as e:
			import traceback
			msg = "%s: %s" % (e.__class__.__name__, e)
			try:
				tb = traceback.format_exc()
				msg = (msg + " | " + tb.replace("\n", " | "))[:900]
			except Exception:
				pass
			log.error("dc_sim tick failed: " + msg)
			try:
				system.tag.writeBlocking([BASE + "_Sim_/LastError", BASE + "_Sim_/State/OkStreak"], [msg, 0])
			except Exception:
				pass

	main()
