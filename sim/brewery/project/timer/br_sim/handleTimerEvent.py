def handleTimerEvent():
	import math

	# Craft Brewery simulation - 1 s gateway timer (ADR-005 Amendment A2).
	# All state lives in tags under [default]BR/ (see sim/brewery/README.md); this script keeps no state of its own.
	# One main readBlocking (plus a one-tag read of the active batch-slot list) and one diff-only writeBlocking per
	# tick. Jython 2.7 only.

	BASE = "[default]BR/"
	LOGGER = "br_sim"

	RECIPES = ["Pilsner", "IPA", "Stout", "Wheat"]
	UNITS = ["Mill", "MashTun", "LauterTun", "Kettle", "Whirlpool", "Chiller"]
	MACH = ["Depal", "Rinser", "Filler", "Seamer", "Pasteurizer", "Labeler", "Packer", "Palletizer"]
	NFV = 12
	NBBT = 4
	NB = 24
	SCENARIOS = ["normal", "glycol_failure", "filler_jam", "stuck_sparge", "boil_over", "contamination", "rush_order"]
	FAULTS = ["GlycolFailure", "FillerJam", "SeamerFault", "LabelOut", "StuckSparge", "BoilOver", "Contamination",
			  "Co2Leak", "AirLoss", "BoilerLow", "CipDosing"]
	BFIELDS = ["Id", "Recipe", "State", "StartHour", "Phase", "FV", "BBT", "Hl", "OG", "FG", "ABV", "pH", "IBU", "DO",
			   "QAStatus", "Cans", "Pallets", "Yield", "Timeline"]
	BTYPE = {"StartHour": 1.0, "Hl": 1.0, "OG": 1.0, "FG": 1.0, "ABV": 1.0, "pH": 1.0, "IBU": 1.0, "DO": 1.0,
			 "Yield": 1.0, "Cans": 1, "Pallets": 1}
	PHASE_STATE = {"MILLING": "BREWING", "MASH": "BREWING", "LAUTER": "BREWING", "BOIL": "BREWING",
				   "WHIRLPOOL": "BREWING", "KNOCKOUT": "BREWING", "FERMENTATION": "FERMENTING",
				   "DIACETYL_REST": "FERMENTING", "CRASH": "CONDITIONING", "CONDITIONING": "CONDITIONING",
				   "TRANSFER": "CONDITIONING", "CARBONATING": "CONDITIONING", "READY": "CONDITIONING",
				   "PACKAGING": "PACKAGING", "COMPLETE": "COMPLETE", "DUMPED": "DUMPED"}
	CARB = {"Pilsner": 2.6, "IPA": 2.5, "Stout": 2.2, "Wheat": 2.9}

	# --- plant constants (times in simulated minutes unless noted) -------------------------------------------
	BATCH_HL = 6.0            # scaled-down batch so one batch packages in about 6 real minutes at 300 cpm
	FV_CAP = 10.0
	BBT_CAP = 8.0
	HLT_CAP = 40.0
	CLT_CAP = 40.0
	CANS_PER_HL = 281.7       # 355 ml
	PACK_YIELD = 0.97         # packages per theoretical can (fill loss)
	CANS_PER_PALLET = 960.0
	CANS_PER_CASE = 24.0
	MILL_MIN = 15.0
	MASHIN_MIN = 10.0
	MASHOUT_MIN = 10.0
	VORLAUF_MIN = 15.0
	RUNOFF_MIN = 90.0
	HEAT_MIN = 25.0
	KXFER_MIN = 10.0
	WFILL_MIN = 10.0
	WREST_MIN = 30.0
	PRECOOL_MIN = 5.0
	KO_MIN = 40.0
	FLUSH_MIN = 5.0
	XFER_MIN = 30.0
	DR_DAYS = 1.0             # biological days
	CRASH_DAYS = 1.0
	CARB_DAYS = 0.8
	CIP_STEPS = [["PRE_RINSE", 5.0], ["CAUSTIC", 12.0], ["RINSE", 5.0], ["ACID", 8.0], ["FINAL_RINSE", 5.0]]
	COOL_K = 0.02             # FV jacket conductance per minute at full valve
	AMB_K = 0.004
	CELLAR_AMB = 22.0
	RATED_CPM = 300.0

	# --- random numbers ----------------------------------------------------------------------------
	# A fresh generator per tick seeded with consecutive integers gave strongly correlated first draws on the
	# gateway (see sim/microgrid), so the seed is hashed and a few draws are discarded.
	class Rng:
		def __init__(self, seed):
			x = (seed * 2654435761 + 1013904223) % 4294967296
			if x == 0:
				x = 2463534242
			self.x = x
			for i in range(8):
				self.random()

		def random(self):
			x = self.x
			x = x ^ ((x << 13) & 4294967295)
			x = x ^ (x >> 17)
			x = x ^ ((x << 5) & 4294967295)
			self.x = x
			return x / 4294967296.0

		def gauss(self, mu, sigma):
			u1 = max(self.random(), 1e-9)
			u2 = self.random()
			return mu + sigma * math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)

	# --- keys --------------------------------------------------------------------------------------
	def U(u, f):
		return "Brewhouse/%s/%s" % (u, f)

	def FK(n, f):
		return "Cellar/FV%02d/%s" % (n, f)

	def BK(n, f):
		return "Cellar/BBT%d/%s" % (n, f)

	def SK(k):
		return "_Sim_/State/" + k

	def LK(k):
		return "Packaging/Line/" + k

	def LS(k):
		return "_Sim_/State/Line/" + k

	def bkey(sl, f):
		return "Batches/B%02d/%s" % (sl, f)

	KEYS = []

	def add(prefix, names):
		for nm in names:
			KEYS.append(prefix + nm)

	add("Time/", ["HourOfDay", "DayIndex", "Shift", "BrewDayActive"])
	for r in RECIPES:
		add("Recipes/%s/" % r, ["MashTempC", "MashMin", "BoilMin", "TargetOGP", "TargetFGP", "FermentTempC",
								"FermentDays", "ConditionDays", "Yeast", "IBU", "Format"])
	UX = {"Mill": [], "MashTun": ["pH", "GravityP", "RakeRPM"], "LauterTun": ["RunoffLpm", "TurbidityNTU", "SpargeLpm"],
		  "Kettle": ["GravityP", "SteamKgph", "EvapPct", "FoamLevelPct", "BoilOverRisk"],
		  "Whirlpool": ["RestMin", "TrubPct"], "Chiller": ["WortOutC", "FlowLpm", "GlycolValvePct"]}
	for u in UNITS:
		add("Brewhouse/%s/" % u, ["Phase", "PhaseRemainingMin", "BatchId", "Recipe", "LevelPct", "TempC", "SetpointC",
								  "Fault"] + UX[u])
	for u in ("HLT", "CLT"):
		add("Brewhouse/%s/" % u, ["LevelPct", "TempC"])
	for n in range(1, NFV + 1):
		add("Cellar/FV%02d/" % n, ["BatchId", "Recipe", "Phase", "TempC", "SetpointC", "GravityP", "pH", "DOppb",
								   "PressurePSI", "CO2VolPct", "ABVEst", "LevelPct", "DaysInTank", "GlycolValvePct",
								   "Fault"])
	for n in range(1, NBBT + 1):
		add("Cellar/BBT%d/" % n, ["BatchId", "Recipe", "Phase", "LevelPct", "TempC", "CO2Vol", "ReadyToPackage"])
	add("Cellar/Yeast/", ["Strain", "Generation", "ViabilityPct"])
	KEYS.append("Cellar/OccupancyPct")
	add("Packaging/Line/", ["State", "SpeedCPM", "RatedCPM", "GoodCount", "RejectCount", "RejectFill", "RejectSeam",
							"RejectLabel", "DowntimeReason", "DowntimeMin", "BatchId", "Recipe", "Format",
							"ShiftTargetCans", "PalletsToday", "CasesToday"])
	for m in MACH:
		add("Packaging/%s/" % m, ["State", "Fault", "CountIn", "CountOut"])
	add("Packaging/OEE/", ["Availability", "Performance", "Quality", "OEE", "RunMin", "DownMin", "PlannedMin"])
	add("Utilities/", ["Boiler/PressureBar", "Boiler/SteamKgph", "Boiler/FuelKwh", "Boiler/State", "Glycol/SupplyC",
					   "Glycol/ReturnC", "Glycol/LoadPct", "Glycol/CompressorOn", "Glycol/Fault", "CO2/TankPct",
					   "CO2/ConsumptionKgph", "CO2/RecoveredPct", "Air/PressureBar", "CIP/Step", "CIP/TargetUnit",
					   "CIP/ConductivitymS", "CIP/TempC", "CIP/Active", "Water/TodayHl", "Energy/TodayKwh"])
	add("Batches/", ["NextIndex", "ActiveCount"])
	add("Schedule/", ["BrewsPerDay", "NextRecipe", "NextStartHour", "Queue"])
	add("KPI/", ["BatchesInProgress", "BrewsToday", "HlToday", "CellarOccupancyPct", "AvgFermentDays", "LineOEE",
				 "GoodCansToday", "RejectPct", "EnergyKwhPerHl", "WaterHlPerHl", "CO2RecoveredPct", "ActiveAlarms",
				 "Mode"])
	add("_Sim_/", ["Enabled", "Scenario", "ScenarioStep", "SpeedFactor", "FermentAccel", "Seed", "TickCount",
				   "LastTickMs", "LastError"])
	add("_Sim_/Fault/", FAULTS)
	add("_Sim_/Request/", ["StartBatch", "HoldLine", "Changeover", "Cip", "QaRelease", "QaDump"])
	add("_Sim_/State/", ["LastEpochMs", "OkStreak", "ScenarioApplied", "ScenarioClock", "BatchSeq", "NextStartAbs",
						 "PlannedSlot", "ActiveSlots", "PrevBrews", "ContamFV", "ShiftApplied", "RecoverPct", "CipRemaining", "LauterProg", "LauterRate", "BoilOverClock"])
	for u in UNITS:
		KEYS.append(SK("BH/%s/Total" % u))
	add("_Sim_/State/Line/", ["GoodF", "RejFillF", "RejSeamF", "RejLabelF", "RunS", "DownS", "PlannedS", "Ramp",
							  "StopS", "StopReason", "ChangeS", "LineCipS", "RunTotal", "RunGoodF", "RunRejF",
							  "RejBoost", "GoodDayF", "FaultAutoS", "BBT", "RecentGood", "RecentRej"])
	for n in range(1, NFV + 1):
		add("_Sim_/State/FV/FV%02d/" % n, ["PhaseDays", "OG", "FGt", "LagDays", "Stall", "XferMin", "DOBase"])
	for n in range(1, NBBT + 1):
		KEYS.append(SK("BBT/BBT%d/PhaseDays" % n))

	# --- helpers -----------------------------------------------------------------------------------
	def clamp(x, lo, hi):
		if x < lo:
			return lo
		if x > hi:
			return hi
		return x

	def lag(cur, target, dt, tau):
		return cur + (target - cur) * (1.0 - math.exp(-dt / tau))

	def sg(p):
		return 1.0 + p / (258.6 - 0.879 * p)

	def abv_of(og, g):
		return max(0.0, (sg(og) - sg(g)) * 131.25)

	def coerce(key, orig, v):
		if isinstance(orig, bool):
			return bool(v)
		if isinstance(orig, float):
			return round(float(v), 4)
		if isinstance(orig, (int, long)):
			return int(v)
		return v

	def coerce_new(key, v):
		f = key.split("/")[-1]
		t = BTYPE.get(f)
		if t is None:
			return v
		if isinstance(t, float):
			return round(float(v), 4)
		return int(v)

	def rp(S, rec, f, d):
		if rec in RECIPES:
			return S["Recipes/%s/%s" % (rec, f)]
		return d

	# --- batch ring ----------------------------------------------------------------------------------
	def bslot(S, bid):
		if not bid:
			return 0
		return S["_ids"].get(bid, 0)

	def bget(S, bid, f, d):
		sl = bslot(S, bid)
		if sl:
			return S[bkey(sl, f)]
		return d

	def bset(S, bid, f, v):
		sl = bslot(S, bid)
		if sl:
			S[bkey(sl, f)] = v

	def bphase(S, C, bid, ph):
		sl = bslot(S, bid)
		if not sl:
			return
		if S[bkey(sl, "Phase")] == ph:
			return
		S[bkey(sl, "Phase")] = ph
		tl = S[bkey(sl, "Timeline")]
		if tl:
			tl = tl + ","
		S[bkey(sl, "Timeline")] = tl + "%s@%.2f" % (ph, C["ab"])
		S[bkey(sl, "State")] = PHASE_STATE[ph]

	def new_record(S, sl, bid, recipe, state, start_abs):
		vals = {"Id": bid, "Recipe": recipe, "State": state, "StartHour": start_abs, "Phase": "", "FV": "", "BBT": "",
				"Hl": 0.0, "OG": 0.0, "FG": 0.0, "ABV": 0.0, "pH": 0.0, "IBU": 0.0, "DO": 0.0, "QAStatus": "PENDING",
				"Cans": 0, "Pallets": 0, "Yield": 0.0, "Timeline": ""}
		fresh = sl not in S["_slots"]
		for f in BFIELDS:
			k = bkey(sl, f)
			S[k] = vals[f]
			if fresh:
				S["_new"].append(k)
		if fresh:
			S["_slots"].append(sl)
		S["_ids"][bid] = sl

	def alloc_slot(S):
		ni = S["Batches/NextIndex"]
		for i in range(NB):
			sl = (ni - 1 + i) % NB + 1
			if sl not in S["_slots"]:
				S["Batches/NextIndex"] = sl % NB + 1
				return sl
		return 0

	def next_bid(S):
		S[SK("BatchSeq")] += 1
		return "BR%04d" % S[SK("BatchSeq")]

	def og_plan(S, bid, rec):
		seq = 0
		if bid[2:].isdigit():
			seq = int(bid[2:])
		return rp(S, rec, "TargetOGP", 12.0) + ((seq * 37) % 21 - 10) * 0.012

	def free_fv(S):
		for n in range(1, NFV + 1):
			if S[FK(n, "Phase")] == "EMPTY" and not S[FK(n, "BatchId")]:
				return n
		return 0

	def free_bbt(S):
		for n in range(1, NBBT + 1):
			if S[BK(n, "Phase")] == "EMPTY" and not S[BK(n, "BatchId")]:
				return n
		return 0

	def fv_of(S, bid):
		fv = bget(S, bid, "FV", "")
		if fv:
			return int(fv[2:])
		return 0

	def bbt_of(S, bid):
		bb = bget(S, bid, "BBT", "")
		if bb:
			return int(bb[3:])
		return 0

	# --- brewhouse unit helpers ------------------------------------------------------------------------
	def u_phase(S, u, phase, total):
		S[U(u, "Phase")] = phase
		S[U(u, "PhaseRemainingMin")] = float(total)
		S[SK("BH/%s/Total" % u)] = float(total)

	def u_start(S, u, phase, total, bid, rec):
		u_phase(S, u, phase, total)
		S[U(u, "BatchId")] = bid
		S[U(u, "Recipe")] = rec

	def u_idle(S, u):
		u_phase(S, u, "IDLE", 0.0)
		S[U(u, "BatchId")] = ""
		S[U(u, "Recipe")] = ""
		S[U(u, "Fault")] = False

	def u_tick(S, u, dm):
		v = max(0.0, S[U(u, "PhaseRemainingMin")] - dm)
		S[U(u, "PhaseRemainingMin")] = v
		return v

	# --- time and scenarios ----------------------------------------------------------------------------
	def clock(S, C):
		h = S["Time/HourOfDay"] + C["ds"] / 3600.0
		day = S["Time/DayIndex"]
		C["newday"] = False
		if h >= 24.0:
			h -= 24.0
			day += 1
			C["newday"] = True
		S["Time/HourOfDay"] = h
		S["Time/DayIndex"] = day
		C["h"] = h
		C["day"] = day
		C["ab"] = day * 24.0 + h
		if 6.0 <= h < 14.0:
			sh = "DAY"
		elif 14.0 <= h < 22.0:
			sh = "SWING"
		else:
			sh = "NIGHT"
		S["Time/Shift"] = sh
		C["shift"] = sh
		C["shift_new"] = sh != S[SK("ShiftApplied")]
		S[SK("ShiftApplied")] = sh
		if C["newday"]:
			S["KPI/BrewsToday"] = 0
			S["KPI/HlToday"] = 0.0
			S["Utilities/Water/TodayHl"] = 0.0
			S["Utilities/Energy/TodayKwh"] = 0.0
			S["Utilities/Boiler/FuelKwh"] = 0.0
			S[LS("GoodDayF")] = 0.0

	def next_slot(after_t, n):
		sp = 10.0 / n
		d = int(math.floor(after_t / 24.0))
		for dd in (d, d + 1, d + 2):
			for i in range(n):
				t = 24.0 * dd + 6.0 + i * sp
				if t > after_t + 0.01:
					return t
		return after_t + 24.0

	def pick_contam_fv(S):
		for want in ("FERMENTING", "DIACETYL_REST", "CRASH", "CONDITIONING"):
			best = 0
			bestd = -1.0
			for n in range(1, NFV + 1):
				if S[FK(n, "Phase")] == want and S[FK(n, "BatchId")]:
					d = S[FK(n, "DaysInTank")]
					if d > bestd:
						bestd = d
						best = n
			if best:
				return "FV%02d" % best
		return ""

	def apply_scenario(S, C):
		sc = S["_Sim_/Scenario"]
		if sc not in SCENARIOS:
			S["_log"].append("unknown scenario %s, back to normal" % sc)
			S["_log_err"].append("unknown scenario '%s'" % sc)
			sc = "normal"
			S["_Sim_/Scenario"] = "normal"
		prev = S[SK("ScenarioApplied")]
		if sc != prev:
			S["_log"].append("scenario %s -> %s" % (prev, sc))
			S[SK("ScenarioApplied")] = sc
			S[SK("ScenarioClock")] = 0.0
			S["_Sim_/ScenarioStep"] = 0
			fm = {"glycol_failure": "GlycolFailure", "filler_jam": "FillerJam", "stuck_sparge": "StuckSparge",
				  "boil_over": "BoilOver", "contamination": "Contamination"}
			if prev in fm:
				S["_Sim_/Fault/" + fm[prev]] = False
			if prev == "rush_order":
				S["Schedule/BrewsPerDay"] = S[SK("PrevBrews")]
				S[SK("NextStartAbs")] = 0.0
			if sc in fm:
				S["_Sim_/Fault/" + fm[sc]] = True
				S["_Sim_/ScenarioStep"] = 1
				if sc == "contamination":
					S[SK("ContamFV")] = pick_contam_fv(S)
			elif sc == "rush_order":
				if prev != "rush_order":
					S[SK("PrevBrews")] = S["Schedule/BrewsPerDay"]
				S["Schedule/BrewsPerDay"] = 3
				S[SK("NextStartAbs")] = C["ab"]
				S["_Sim_/ScenarioStep"] = 1
		return sc

	def scenario_step(S, C, sc):
		step = S["_Sim_/ScenarioStep"]
		clk = S[SK("ScenarioClock")] + C["dm"]
		S[SK("ScenarioClock")] = clk
		done = False
		if sc == "glycol_failure":
			if step == 1:
				if not S["_Sim_/Fault/GlycolFailure"]:
					step = 2
				elif clk > 480.0:
					S["_Sim_/Fault/GlycolFailure"] = False
					S["_log"].append("glycol failure: automatic restore after 8 simulated hours")
			elif step == 2:
				if S["Utilities/Glycol/SupplyC"] < -1.5:
					done = True
		elif sc == "filler_jam":
			if step == 1:
				if not S["_Sim_/Fault/FillerJam"]:
					step = 2
				elif clk > 720.0:
					S["_Sim_/Fault/FillerJam"] = False
			elif step == 2:
				if S[LS("RejBoost")] < 0.5:
					done = True
		elif sc == "stuck_sparge":
			if step == 1:
				if not S["_Sim_/Fault/StuckSparge"]:
					step = 2
				elif clk > 200.0:
					S["_Sim_/Fault/StuckSparge"] = False
					S["_log"].append("stuck sparge: bed raked, run-off recovers")
			elif step == 2:
				if clk > 0.0 and S[SK("LauterRate")] > 0.8:
					done = True
		elif sc == "boil_over":
			if step == 1:
				if not S["_Sim_/Fault/BoilOver"]:
					step = 3
				elif S["Brewhouse/Kettle/BoilOverRisk"] > 80.0:
					step = 2
				elif clk > 480.0:
					S["_Sim_/Fault/BoilOver"] = False
			elif step == 2:
				if S[SK("BoilOverClock")] > 8.0:
					S["_Sim_/Fault/BoilOver"] = False
					S["_log"].append("boil-over: operator reduces kettle steam")
				if not S["_Sim_/Fault/BoilOver"]:
					step = 3
			elif step == 3:
				if S["Brewhouse/Kettle/BoilOverRisk"] < 35.0:
					done = True
		elif sc == "contamination":
			if step == 1:
				if not S["_Sim_/Fault/Contamination"]:
					done = True
				elif not S[SK("ContamFV")]:
					S[SK("ContamFV")] = pick_contam_fv(S)
					if clk > 300.0:
						S["_Sim_/Fault/Contamination"] = False
				else:
					step = 2
			elif step == 2:
				if not S[SK("ContamFV")]:
					done = True
		if sc == "contamination" and step == 2 and S[SK("ContamFV")]:
			cn = int(S[SK("ContamFV")][2:])
			if not S[FK(cn, "BatchId")]:
				S[SK("ContamFV")] = ""
		S["_Sim_/ScenarioStep"] = step
		if done:
			S["_Sim_/Scenario"] = "normal"

	# --- commands ---------------------------------------------------------------------------------------
	def dump_batch(S, C, bid):
		fn = fv_of(S, bid)
		bn = bbt_of(S, bid)
		sl = bslot(S, bid)
		if not sl:
			return "unknown batch"
		ph = S[bkey(sl, "Phase")]
		if ph in ("MILLING", "MASH", "LAUTER", "BOIL", "WHIRLPOOL", "KNOCKOUT", "PACKAGING", "TRANSFER", "COMPLETE", "DUMPED", ""):
			return "batch %s cannot be dumped in phase %s" % (bid, ph)
		if bn and S[BK(bn, "BatchId")] == bid:
			S[BK(bn, "Phase")] = "CIP"
			S[BK(bn, "BatchId")] = ""
			S[BK(bn, "Recipe")] = ""
			S[BK(bn, "LevelPct")] = 0.0
			S[BK(bn, "ReadyToPackage")] = False
		elif fn and S[FK(fn, "BatchId")] == bid:
			S[FK(fn, "Phase")] = "CIP"
			S[FK(fn, "BatchId")] = ""
			S[FK(fn, "Recipe")] = ""
			S[FK(fn, "LevelPct")] = 0.0
			S["_Sim_/State/FV/FV%02d/Stall" % fn] = 0.0
		else:
			return "batch %s is not in a tank" % bid
		S[bkey(sl, "QAStatus")] = "FAIL"
		bphase(S, C, bid, "DUMPED")
		if fn and S[SK("ContamFV")] == "FV%02d" % fn:
			S[SK("ContamFV")] = ""
			S["_Sim_/Fault/Contamination"] = False
		S["_log"].append("batch %s dumped" % bid)
		return ""

	def requests(S, C):
		# QA release
		rel = S["_Sim_/Request/QaRelease"]
		if rel:
			S["_Sim_/Request/QaRelease"] = ""
			for sl in list(S["_slots"]):
				if S[bkey(sl, "QAStatus")] == "HOLD" and (rel == "ALL" or S[bkey(sl, "Id")] == rel):
					bid = S[bkey(sl, "Id")]
					S[bkey(sl, "QAStatus")] = "PASS"
					fn = fv_of(S, bid)
					if fn:
						S["_Sim_/State/FV/FV%02d/Stall" % fn] = 0.0
						if S[SK("ContamFV")] == "FV%02d" % fn:
							S[SK("ContamFV")] = ""
							S["_Sim_/Fault/Contamination"] = False
					S["_log"].append("batch %s released from QA hold" % bid)
		dmp = S["_Sim_/Request/QaDump"]
		if dmp:
			S["_Sim_/Request/QaDump"] = ""
			msg = dump_batch(S, C, dmp)
			if msg:
				S["_log_err"].append("qa_dump: " + msg)
		cp = S["_Sim_/Request/Cip"]
		if cp:
			S["_Sim_/Request/Cip"] = ""
			ok = False
			if cp.startswith("FV") and len(cp) == 4 and cp[2:].isdigit() and 1 <= int(cp[2:]) <= NFV:
				n = int(cp[2:])
				if S[FK(n, "Phase")] == "EMPTY" and not S[FK(n, "BatchId")]:
					S[FK(n, "Phase")] = "CIP"
					ok = True
			elif cp.startswith("BBT") and len(cp) == 4 and cp[3:].isdigit() and 1 <= int(cp[3:]) <= NBBT:
				n = int(cp[3:])
				if S[BK(n, "Phase")] == "EMPTY" and not S[BK(n, "BatchId")]:
					S[BK(n, "Phase")] = "CIP"
					ok = True
			elif cp == "LINE":
				if S[LK("State")] == "IDLE" and not S[LK("BatchId")]:
					S[LK("State")] = "CIP"
					S[LK("DowntimeReason")] = "CIP"
					S[LS("LineCipS")] = 45.0
					ok = True
			if not ok:
				S["_log_err"].append("cip: %s is not an empty, idle unit" % cp)
		co = S["_Sim_/Request/Changeover"]
		if co:
			if co not in ("CAN", "KEG"):
				S["_Sim_/Request/Changeover"] = ""
				S["_log_err"].append("changeover: format must be CAN or KEG")
			elif S[LK("State")] == "IDLE" and not S[LK("BatchId")]:
				S["_Sim_/Request/Changeover"] = ""
				if co != S[LK("Format")]:
					S[LK("Format")] = co
					S[LK("State")] = "CHANGEOVER"
					S[LK("DowntimeReason")] = "CHANGEOVER"
					S[LS("ChangeS")] = 45.0

	# --- scheduler ---------------------------------------------------------------------------------------
	def start_batch(S, C, recipe, scheduled):
		fn = free_fv(S)
		if not fn:
			return False
		if scheduled and S[SK("PlannedSlot")]:
			sl = S[SK("PlannedSlot")]
			bid = S[bkey(sl, "Id")]
		else:
			sl = alloc_slot(S)
			if not sl:
				return False
			bid = next_bid(S)
		new_record(S, sl, bid, recipe, "BREWING", C["ab"])
		hl = round(BATCH_HL * (1.0 + 0.03 * (C["rng"].random() - 0.5)), 3)
		S[bkey(sl, "Hl")] = hl
		S[bkey(sl, "FV")] = "FV%02d" % fn
		S[FK(fn, "BatchId")] = bid
		S[FK(fn, "Recipe")] = recipe
		u_start(S, "Mill", "MILLING", MILL_MIN, bid, recipe)
		S[U("Mill", "LevelPct")] = 100.0
		bphase(S, C, bid, "MILLING")
		S["KPI/BrewsToday"] += 1
		S["KPI/HlToday"] += hl
		S["_log"].append("batch %s (%s) started into %s" % (bid, recipe, "FV%02d" % fn))
		if scheduled:
			q = [x for x in S["Schedule/Queue"].split(",") if x in RECIPES]
			if q:
				q = q[1:] + q[:1]
			S["Schedule/Queue"] = ",".join(q)
			n = int(clamp(S["Schedule/BrewsPerDay"], 1, 6))
			S[SK("NextStartAbs")] = next_slot(S[SK("NextStartAbs")], n)
			S[SK("PlannedSlot")] = 0
		return True

	def scheduler(S, C):
		n = int(clamp(S["Schedule/BrewsPerDay"], 1, 6))
		if S[SK("NextStartAbs")] <= 0.0:
			S[SK("NextStartAbs")] = next_slot(C["ab"] - 0.02, n)
		q = [x for x in S["Schedule/Queue"].split(",") if x in RECIPES]
		if not q:
			q = list(RECIPES)
			S["Schedule/Queue"] = ",".join(q)
		S["Schedule/NextRecipe"] = q[0]
		can = S["Brewhouse/Mill/Phase"] == "IDLE" and S["Brewhouse/MashTun/Phase"] == "IDLE"
		man = S["_Sim_/Request/StartBatch"]
		if man:
			if man not in RECIPES:
				S["_Sim_/Request/StartBatch"] = ""
				S["_log_err"].append("start_batch: unknown recipe '%s'" % man)
			elif can and start_batch(S, C, man, False):
				S["_Sim_/Request/StartBatch"] = ""
				can = False
		if can and C["ab"] >= S[SK("NextStartAbs")]:
			if start_batch(S, C, q[0], True):
				can = False
		# the PLANNED record for the next scheduled brew
		ps = S[SK("PlannedSlot")]
		if ps and S[bkey(ps, "State")] != "PLANNED":
			ps = 0
			S[SK("PlannedSlot")] = 0
		if not ps:
			sl = alloc_slot(S)
			if sl:
				new_record(S, sl, next_bid(S), q[0], "PLANNED", S[SK("NextStartAbs")])
				S[SK("PlannedSlot")] = sl
		else:
			if S[bkey(ps, "Recipe")] != q[0]:
				S[bkey(ps, "Recipe")] = q[0]
			if abs(S[bkey(ps, "StartHour")] - S[SK("NextStartAbs")]) > 0.001:
				S[bkey(ps, "StartHour")] = S[SK("NextStartAbs")]
		S["Schedule/NextStartHour"] = S[SK("NextStartAbs")] % 24.0

	# --- brewhouse ----------------------------------------------------------------------------------------
	def fv_begin(S, C, rng, n, bid, rec):
		P = "_Sim_/State/FV/FV%02d/" % n
		ft = rp(S, rec, "FermentTempC", 18.0)
		fd = rp(S, rec, "FermentDays", 5.0)
		S[FK(n, "Phase")] = "FILLING"
		S[FK(n, "Recipe")] = rec
		S[FK(n, "SetpointC")] = ft
		S[FK(n, "TempC")] = S["Brewhouse/Chiller/WortOutC"]
		S[FK(n, "GravityP")] = bget(S, bid, "OG", 12.0)
		S[FK(n, "pH")] = 5.3
		S[FK(n, "DOppb")] = 8000.0
		S[FK(n, "PressurePSI")] = 0.2
		S[FK(n, "CO2VolPct")] = 0.0
		S[FK(n, "ABVEst")] = 0.0
		S[FK(n, "LevelPct")] = 0.0
		S[FK(n, "DaysInTank")] = 0.0
		S[P + "PhaseDays"] = 0.0
		S[P + "OG"] = bget(S, bid, "OG", 12.0)
		S[P + "FGt"] = rp(S, rec, "TargetFGP", 3.0) + rng.gauss(0.0, 0.08)
		S[P + "LagDays"] = clamp(0.08 * fd + 0.1 * rng.random(), 0.3, 1.0)
		S[P + "Stall"] = 0.0
		S[P + "XferMin"] = 0.0
		S[P + "DOBase"] = 8000.0

	def brewhouse(S, C, rng):
		dm = C["dm"]
		boilp = S["Utilities/Boiler/PressureBar"]
		auth = clamp(boilp / 8.0, 0.3, 1.0)
		cl = {"water": 0.0, "clt": 0.0, "steam": 0.0}
		gly = S["Utilities/Glycol/SupplyC"]

		# ---- chiller / knock-out
		u = "Chiller"
		ph = S[U(u, "Phase")]
		if ph == "IDLE":
			S[U(u, "FlowLpm")] = 0.0
			S[U(u, "GlycolValvePct")] = lag(S[U(u, "GlycolValvePct")], 0.0, dm, 1.0)
			S[U(u, "WortOutC")] = lag(S[U(u, "WortOutC")], 20.0, dm, 5.0)
			S[U(u, "LevelPct")] = 0.0
			S[U(u, "TempC")] = S[U(u, "WortOutC")]
		else:
			bid = S[U(u, "BatchId")]
			rec = S[U(u, "Recipe")]
			hl = bget(S, bid, "Hl", BATCH_HL)
			fn = fv_of(S, bid)
			ft = rp(S, rec, "FermentTempC", 18.0)
			rem = u_tick(S, u, dm)
			S[U(u, "SetpointC")] = ft
			S[U(u, "Fault")] = bool(S["_Sim_/Fault/GlycolFailure"] and ph == "KNOCKOUT")
			if ph == "PRECOOL":
				S[U(u, "GlycolValvePct")] = lag(S[U(u, "GlycolValvePct")], 55.0, dm, 1.0)
				S[U(u, "WortOutC")] = lag(S[U(u, "WortOutC")], ft + 1.0, dm, 1.5)
				S[U(u, "LevelPct")] = 100.0
				if rem <= 0.0:
					u_phase(S, u, "KNOCKOUT", KO_MIN)
					S["Brewhouse/Whirlpool/Phase"] = "KNOCKOUT"
					S["Brewhouse/Whirlpool/PhaseRemainingMin"] = KO_MIN
					if fn:
						fv_begin(S, C, rng, fn, bid, rec)
			elif ph == "KNOCKOUT":
				frac = dm / KO_MIN
				lt = hl / FV_CAP * 100.0
				if fn:
					S[FK(fn, "LevelPct")] = min(lt, S[FK(fn, "LevelPct")] + lt * frac)
				S["Brewhouse/Whirlpool/LevelPct"] = max(0.0, S["Brewhouse/Whirlpool/LevelPct"] - 80.0 * frac)
				S["Brewhouse/Whirlpool/PhaseRemainingMin"] = rem
				S[U(u, "FlowLpm")] = hl * 100.0 / KO_MIN * (0.97 + 0.06 * rng.random())
				warm = 0.0
				if S["_Sim_/Fault/GlycolFailure"]:
					warm = 5.0
				S[U(u, "WortOutC")] = lag(S[U(u, "WortOutC")], ft + 0.8 + warm + rng.gauss(0.0, 0.1), dm, 1.0)
				S[U(u, "GlycolValvePct")] = lag(S[U(u, "GlycolValvePct")], clamp(45.0 + 8.0 * (S[U(u, "WortOutC")] - ft), 0.0, 100.0), dm, 1.0)
				S[U(u, "LevelPct")] = 100.0
				cl["clt"] += hl * 1.5 * frac
				if rem <= 0.0:
					u_phase(S, u, "FLUSH", FLUSH_MIN)
					S[U(u, "FlowLpm")] = 0.0
					u_idle(S, "Whirlpool")
					S["Brewhouse/Whirlpool/LevelPct"] = 0.0
					S["Brewhouse/Whirlpool/TempC"] = lag(S["Brewhouse/Whirlpool/TempC"], 40.0, dm, 5.0)
					if fn:
						S[FK(fn, "Phase")] = "FERMENTING"
						S[FK(fn, "LevelPct")] = lt
						bphase(S, C, bid, "FERMENTATION")
						rec_y = rp(S, rec, "Yeast", "")
						if S["Cellar/Yeast/Strain"] == rec_y:
							S["Cellar/Yeast/Generation"] += 1
						else:
							S["Cellar/Yeast/Strain"] = rec_y
							S["Cellar/Yeast/Generation"] = 1
						S["Cellar/Yeast/ViabilityPct"] = clamp(98.5 - 1.6 * S["Cellar/Yeast/Generation"] + rng.gauss(0.0, 0.3), 70.0, 99.0)
			elif ph == "FLUSH":
				S[U(u, "GlycolValvePct")] = lag(S[U(u, "GlycolValvePct")], 0.0, dm, 1.0)
				S[U(u, "WortOutC")] = lag(S[U(u, "WortOutC")], 20.0, dm, 2.0)
				if rem <= 0.0:
					u_idle(S, u)
			S[U(u, "TempC")] = S[U(u, "WortOutC")]

		# ---- whirlpool
		u = "Whirlpool"
		ph = S[U(u, "Phase")]
		if ph == "IDLE":
			S[U(u, "RestMin")] = 0.0
			S[U(u, "TrubPct")] = 0.0
			S[U(u, "SetpointC")] = 20.0
			S[U(u, "TempC")] = lag(S[U(u, "TempC")], 20.0, dm, 20.0)
		elif ph in ("FILL", "REST", "WAIT_CHILLER"):
			bid = S[U(u, "BatchId")]
			rec = S[U(u, "Recipe")]
			S[U(u, "SetpointC")] = 85.0
			S[U(u, "TempC")] = lag(S[U(u, "TempC")], 85.0 - 6.0 * (1.0 if ph != "FILL" else 0.0), dm, 25.0)
			if ph == "FILL":
				rem = u_tick(S, u, dm)
				S[U(u, "LevelPct")] = min(80.0, S[U(u, "LevelPct")] + 80.0 * dm / WFILL_MIN)
				if rem <= 0.0:
					u_phase(S, u, "REST", WREST_MIN)
			elif ph == "REST":
				rem = u_tick(S, u, dm)
				S[U(u, "RestMin")] = rem
				S[U(u, "TrubPct")] = 8.0 * (1.0 - rem / WREST_MIN)
				if rem <= 0.0:
					u_phase(S, u, "WAIT_CHILLER", 0.0)
			else:
				S[U(u, "RestMin")] = 0.0
				if S["Brewhouse/Chiller/Phase"] == "IDLE":
					u_start(S, "Chiller", "PRECOOL", PRECOOL_MIN, bid, rec)
					bphase(S, C, bid, "KNOCKOUT")
		else:
			S[U(u, "TempC")] = lag(S[U(u, "TempC")], 80.0, dm, 20.0)
			S[U(u, "Fault")] = False

		# ---- kettle
		u = "Kettle"
		ph = S[U(u, "Phase")]
		flag_bo = S["_Sim_/Fault/BoilOver"]
		if ph == "IDLE":
			S[U(u, "SteamKgph")] = lag(S[U(u, "SteamKgph")], 0.0, dm, 1.0)
			S[U(u, "TempC")] = lag(S[U(u, "TempC")], 20.0, dm, 20.0)
			S[U(u, "SetpointC")] = 20.0
			S[U(u, "LevelPct")] = 0.0
			S[U(u, "GravityP")] = 0.0
			S[U(u, "EvapPct")] = 0.0
			S[U(u, "FoamLevelPct")] = lag(S[U(u, "FoamLevelPct")], 0.0, dm, 3.0)
			S[U(u, "BoilOverRisk")] = lag(S[U(u, "BoilOverRisk")], 0.0, dm, 3.0)
			S[SK("BoilOverClock")] = 0.0
		else:
			bid = S[U(u, "BatchId")]
			rec = S[U(u, "Recipe")]
			og = og_plan(S, bid, rec)
			boil = float(rp(S, rec, "BoilMin", 60))
			etot = boil * 0.0017
			rem = u_tick(S, u, dm)
			tot = S[SK("BH/Kettle/Total")]
			risk_t = 5.0
			foam_t = 5.0
			steam_t = 0.0
			if ph == "HEAT":
				S[U(u, "SetpointC")] = 100.0
				S[U(u, "TempC")] = lag(S[U(u, "TempC")], 100.0 + 0.0, dm, 7.0)
				steam_t = 320.0
				S[U(u, "GravityP")] = og * (1.0 - etot)
				S[U(u, "LevelPct")] = 85.0
				risk_t = 10.0
				foam_t = 5.0
				if rem <= 0.0 or S[U(u, "TempC")] > 99.0:
					u_phase(S, u, "BOIL", boil)
					S[U(u, "EvapPct")] = 0.0
					bphase(S, C, bid, "BOIL")
			elif ph == "BOIL":
				S[U(u, "SetpointC")] = 100.0
				S[U(u, "TempC")] = lag(S[U(u, "TempC")], 100.0 + rng.gauss(0.0, 0.1), dm, 2.0)
				steam_t = 130.0
				risk_t = 18.0 + 4.0 * rng.random()
				foam_t = 25.0 + 6.0 * rng.random()
				if flag_bo:
					steam_t = 560.0
					risk_t = 100.0
					foam_t = 100.0
				e = clamp(1.0 - rem / max(tot, 1.0), 0.0, 1.0) * etot
				S[U(u, "EvapPct")] = e * 100.0
				S[U(u, "GravityP")] = og * (1.0 - etot) / (1.0 - e)
				S[U(u, "LevelPct")] = 85.0 * (1.0 - e) + max(0.0, S[U(u, "BoilOverRisk")] - 60.0) * 0.45
				if rem <= 0.0:
					# lab sample at the end of the boil
					S[U(u, "GravityP")] = og
					bset(S, bid, "OG", round(og, 2))
					bset(S, bid, "IBU", round(rp(S, rec, "IBU", 30.0) * (1.0 + 0.04 * rng.gauss(0.0, 1.0)), 1))
					bset(S, bid, "pH", round(5.35 + rng.gauss(0.0, 0.04), 2))
					if S["Brewhouse/Whirlpool/Phase"] == "IDLE":
						u_phase(S, u, "TRANSFER", KXFER_MIN)
						u_start(S, "Whirlpool", "FILL", WFILL_MIN, bid, rec)
						S["Brewhouse/Whirlpool/LevelPct"] = 0.0
						bphase(S, C, bid, "WHIRLPOOL")
					else:
						u_phase(S, u, "WAIT_WHIRLPOOL", 0.0)
			elif ph == "WAIT_WHIRLPOOL":
				steam_t = 40.0
				risk_t = 12.0
				foam_t = 8.0
				S[U(u, "TempC")] = lag(S[U(u, "TempC")], 98.0, dm, 20.0)
				if S["Brewhouse/Whirlpool/Phase"] == "IDLE":
					u_phase(S, u, "TRANSFER", KXFER_MIN)
					u_start(S, "Whirlpool", "FILL", WFILL_MIN, bid, rec)
					S["Brewhouse/Whirlpool/LevelPct"] = 0.0
					bphase(S, C, bid, "WHIRLPOOL")
			elif ph == "TRANSFER":
				S[U(u, "TempC")] = lag(S[U(u, "TempC")], 98.0, dm, 20.0)
				S[U(u, "LevelPct")] = max(0.0, S[U(u, "LevelPct")] - 85.0 * dm / KXFER_MIN)
				steam_t = 0.0
				risk_t = 5.0
				foam_t = 5.0
				if rem <= 0.0:
					u_idle(S, u)
			S[U(u, "SteamKgph")] = lag(S[U(u, "SteamKgph")], steam_t, dm, 1.0)
			S[U(u, "BoilOverRisk")] = clamp(lag(S[U(u, "BoilOverRisk")], risk_t, dm, 5.0), 0.0, 100.0)
			S[U(u, "FoamLevelPct")] = clamp(lag(S[U(u, "FoamLevelPct")], foam_t, dm, 4.0), 0.0, 100.0)
			S[U(u, "Fault")] = bool(S[U(u, "BoilOverRisk")] > 80.0)
			if S[U(u, "BoilOverRisk")] > 80.0:
				S[SK("BoilOverClock")] += dm
			else:
				S[SK("BoilOverClock")] = 0.0
			cl["steam"] += S[U(u, "SteamKgph")]

		# ---- lauter tun
		u = "LauterTun"
		ph = S[U(u, "Phase")]
		stuck = S["_Sim_/Fault/StuckSparge"]
		rate = S[SK("LauterRate")]
		if ph == "IDLE":
			S[U(u, "RunoffLpm")] = 0.0
			S[U(u, "SpargeLpm")] = 0.0
			S[U(u, "TurbidityNTU")] = 0.0
			S[U(u, "LevelPct")] = 0.0
			S[U(u, "TempC")] = lag(S[U(u, "TempC")], 20.0, dm, 25.0)
			S[U(u, "SetpointC")] = 20.0
			S[SK("LauterRate")] = 1.0
		else:
			bid = S[U(u, "BatchId")]
			rec = S[U(u, "Recipe")]
			hl = bget(S, bid, "Hl", BATCH_HL)
			S[U(u, "SetpointC")] = 76.0
			S[U(u, "TempC")] = lag(S[U(u, "TempC")], 76.0, dm, 5.0)
			if ph == "VORLAUF":
				rem = u_tick(S, u, dm)
				S[U(u, "LevelPct")] = 88.0
				S[U(u, "RunoffLpm")] = 4.0 + 0.3 * rng.random()
				S[U(u, "SpargeLpm")] = 0.0
				S[U(u, "TurbidityNTU")] = 15.0 + 75.0 * rem / VORLAUF_MIN + rng.gauss(0.0, 1.0)
				if rem <= 0.0:
					u_phase(S, u, "RUNOFF", RUNOFF_MIN)
					S[SK("LauterProg")] = 0.0
			elif ph == "RUNOFF":
				tgt = 1.0
				if stuck:
					tgt = 0.12
				rate = lag(rate, tgt, dm, 3.0)
				S[SK("LauterRate")] = rate
				dp = rate * dm / RUNOFF_MIN
				prog = min(1.0, S[SK("LauterProg")] + dp)
				S[SK("LauterProg")] = prog
				S[U(u, "PhaseRemainingMin")] = (1.0 - prog) * RUNOFF_MIN / max(rate, 0.05)
				S[U(u, "RunoffLpm")] = 8.3 * rate * (0.97 + 0.06 * rng.random())
				S[U(u, "SpargeLpm")] = 7.5 * rate * (0.97 + 0.06 * rng.random())
				S[U(u, "TurbidityNTU")] = 12.0 + (70.0 if stuck else 0.0) + rng.gauss(0.0, 1.0) + 6.0 * prog
				S[U(u, "LevelPct")] = 88.0 - 55.0 * prog
				cl["water"] += hl * 2.6 * dp
				if prog >= 1.0:
					u_phase(S, u, "WAIT_KETTLE", 0.0)
			else:
				S[U(u, "RunoffLpm")] = 0.0
				S[U(u, "SpargeLpm")] = 0.0
				S[U(u, "TurbidityNTU")] = 10.0
				S[U(u, "LevelPct")] = 33.0
				if S["Brewhouse/Kettle/Phase"] == "IDLE":
					u_start(S, "Kettle", "HEAT", HEAT_MIN, bid, rec)
					S["Brewhouse/Kettle/TempC"] = 75.0
					S["Brewhouse/Kettle/LevelPct"] = 85.0
					bphase(S, C, bid, "BOIL")
					u_idle(S, u)
					S[SK("LauterRate")] = 1.0
			S[U(u, "Fault")] = bool(stuck and ph == "RUNOFF")

		# ---- mash tun
		u = "MashTun"
		ph = S[U(u, "Phase")]
		if ph == "IDLE":
			S[U(u, "LevelPct")] = 0.0
			S[U(u, "RakeRPM")] = 0.0
			S[U(u, "GravityP")] = 0.0
			S[U(u, "TempC")] = lag(S[U(u, "TempC")], 20.0, dm, 25.0)
			S[U(u, "SetpointC")] = 20.0
			S[U(u, "Fault")] = False
		else:
			bid = S[U(u, "BatchId")]
			rec = S[U(u, "Recipe")]
			hl = bget(S, bid, "Hl", BATCH_HL)
			mt = rp(S, rec, "MashTempC", 66.0)
			mm = float(rp(S, rec, "MashMin", 60))
			og = og_plan(S, bid, rec)
			if ph == "MASH_IN":
				rem = u_tick(S, u, dm)
				S[U(u, "SetpointC")] = mt
				S[U(u, "LevelPct")] = min(80.0, S[U(u, "LevelPct")] + 80.0 * dm / MASHIN_MIN)
				S[U(u, "RakeRPM")] = 12.0
				cl["water"] += hl * 1.4 * dm / MASHIN_MIN
				S[U(u, "TempC")] = lag(S[U(u, "TempC")], mt - 12.0 * (1.0 - auth), dm, 2.0)
				S[U(u, "pH")] = lag(S[U(u, "pH")], 5.45, dm, 3.0)
				if rem <= 0.0:
					u_phase(S, u, "MASH_REST", mm)
			elif ph == "MASH_REST":
				rem = u_tick(S, u, dm)
				S[U(u, "SetpointC")] = mt
				S[U(u, "RakeRPM")] = 6.0
				S[U(u, "TempC")] = lag(S[U(u, "TempC")], mt - 12.0 * (1.0 - auth) + rng.gauss(0.0, 0.05), dm, 1.5)
				S[U(u, "pH")] = lag(S[U(u, "pH")], 5.32, dm, 12.0)
				el = max(0.0, mm - rem)
				S[U(u, "GravityP")] = 1.15 * og * (1.0 - math.exp(-el / (0.3 * mm)))
				cl["steam"] += 70.0
				if rem <= 0.0:
					u_phase(S, u, "MASH_OUT", MASHOUT_MIN)
			elif ph == "MASH_OUT":
				rem = u_tick(S, u, dm)
				S[U(u, "SetpointC")] = 76.0
				S[U(u, "RakeRPM")] = 8.0
				S[U(u, "TempC")] = lag(S[U(u, "TempC")], 76.0 - 12.0 * (1.0 - auth), dm, 2.5)
				cl["steam"] += 90.0
				if rem <= 0.0:
					u_phase(S, u, "WAIT_LAUTER", 0.0)
			else:
				S[U(u, "RakeRPM")] = 0.0
				S[U(u, "SetpointC")] = 76.0
				S[U(u, "TempC")] = lag(S[U(u, "TempC")], 75.0, dm, 20.0)
				if S["Brewhouse/LauterTun/Phase"] == "IDLE":
					u_start(S, "LauterTun", "VORLAUF", VORLAUF_MIN, bid, rec)
					S["Brewhouse/LauterTun/TempC"] = S[U(u, "TempC")]
					S[SK("LauterRate")] = 1.0
					S[SK("LauterProg")] = 0.0
					bphase(S, C, bid, "LAUTER")
					u_idle(S, u)
			if S[U(u, "Phase")] == "MASH_REST":
				S[U(u, "Fault")] = bool(abs(S[U(u, "TempC")] - S[U(u, "SetpointC")]) > 2.0)

		# ---- mill
		u = "Mill"
		ph = S[U(u, "Phase")]
		if ph == "IDLE":
			S[U(u, "LevelPct")] = 0.0
			S[U(u, "TempC")] = 20.0
			S[U(u, "SetpointC")] = 20.0
		else:
			bid = S[U(u, "BatchId")]
			rec = S[U(u, "Recipe")]
			if ph == "MILLING":
				rem = u_tick(S, u, dm)
				S[U(u, "LevelPct")] = 100.0 * rem / MILL_MIN
				if rem <= 0.0:
					u_phase(S, u, "WAIT_MASH", 0.0)
					ph = "WAIT_MASH"
			if ph == "WAIT_MASH" and S["Brewhouse/MashTun/Phase"] == "IDLE":
				u_start(S, "MashTun", "MASH_IN", MASHIN_MIN, bid, rec)
				S["Brewhouse/MashTun/LevelPct"] = 0.0
				S["Brewhouse/MashTun/GravityP"] = 0.0
				bphase(S, C, bid, "MASH")
				u_idle(S, u)

		# ---- liquor tanks
		hlt = S["Brewhouse/HLT/LevelPct"] - cl["water"] / HLT_CAP * 100.0
		refilling = hlt < 97.0 and (hlt < 80.0 or S["Brewhouse/HLT/TempC"] < 77.0)
		if refilling:
			hlt = min(100.0, hlt + 4.0 * dm)
			cl["steam"] += 60.0
		S["Brewhouse/HLT/LevelPct"] = hlt
		S["Brewhouse/HLT/TempC"] = lag(S["Brewhouse/HLT/TempC"], 70.0 if refilling else 78.0, dm, 10.0)
		clt = S["Brewhouse/CLT/LevelPct"] - cl["clt"] / CLT_CAP * 100.0
		if clt < 70.0:
			clt = min(100.0, clt + 4.0 * dm)
		S["Brewhouse/CLT/LevelPct"] = clt
		S["Brewhouse/CLT/TempC"] = lag(S["Brewhouse/CLT/TempC"], 4.0 + (1.5 if S["Brewhouse/Chiller/Phase"] == "KNOCKOUT" else 0.0), dm, 15.0)
		S["Utilities/Water/TodayHl"] += cl["water"] + cl["clt"] * 0.4
		C["steam_bh"] = cl["steam"]

	# --- cellar -----------------------------------------------------------------------------------------
	def qa_ferment(S, C, rng, n, bid):
		P = "_Sim_/State/FV/FV%02d/" % n
		g = S[FK(n, "GravityP")]
		fgt = S[P + "FGt"]
		fg = round(g + rng.gauss(0.0, 0.02), 3)
		og = bget(S, bid, "OG", 12.0)
		bset(S, bid, "FG", fg)
		bset(S, bid, "ABV", round(abv_of(og, fg), 2))
		bset(S, bid, "pH", round(S[FK(n, "pH")], 2))
		bad = (g - fgt) > 0.9 or S[FK(n, "pH")] < 4.15 or S[P + "Stall"] > 0.35
		cur = bget(S, bid, "QAStatus", "PENDING")
		if bad:
			if cur != "HOLD":
				S["_log"].append("QA hold: %s (%s) fermentation sample out of spec" % (bid, "FV%02d" % n))
			bset(S, bid, "QAStatus", "HOLD")
		elif cur == "PENDING":
			bset(S, bid, "QAStatus", "PASS")

	def cellar(S, C, rng):
		dm = C["dm"]
		bd = C["bd"]
		tg = S["Utilities/Glycol/SupplyC"]
		contam = S[SK("ContamFV")]
		contam_on = S["_Sim_/Fault/Contamination"]
		duty = 0.0
		act_sum = 0.0
		occ = 0
		age_sum = 0.0
		age_n = 0
		for n in range(1, NFV + 1):
			nm = "FV%02d" % n
			P = "_Sim_/State/FV/%s/" % nm
			ph = S[FK(n, "Phase")]
			bid = S[FK(n, "BatchId")]
			rec = S[FK(n, "Recipe")]
			T = S[FK(n, "TempC")]
			sp = S[FK(n, "SetpointC")]
			g = S[FK(n, "GravityP")]
			og = S[P + "OG"]
			fgt = S[P + "FGt"]
			lagd = S[P + "LagDays"]
			stall = S[P + "Stall"]
			fd = rp(S, rec, "FermentDays", 5.0)
			cd = rp(S, rec, "ConditionDays", 3.0)
			ft = rp(S, rec, "FermentTempC", 18.0)
			hl = bget(S, bid, "Hl", BATCH_HL)
			act = 0.0
			tsp = sp
			rr = 0.05
			thermal = ph in ("FERMENTING", "DIACETYL_REST", "CRASH", "CONDITIONING", "TRANSFER")
			if bid:
				occ += 1
			if ph in ("FERMENTING", "DIACETYL_REST", "CRASH", "CONDITIONING") and nm == contam and contam_on:
				stall = min(1.0, stall + dm / 60.0)
				S[P + "Stall"] = stall
			if stall > 0.35 and bid and bget(S, bid, "QAStatus", "") in ("PENDING", "PASS"):
				bset(S, bid, "QAStatus", "HOLD")
				S["_log"].append("QA hold: %s in %s (in-process pH / gravity check failed)" % (bid, nm))
			if ph == "FILLING":
				S[FK(n, "TempC")] = lag(T, S["Brewhouse/Chiller/WortOutC"], dm, 4.0)
				T = S[FK(n, "TempC")]
				tsp = ft
				S[FK(n, "SetpointC")] = ft
				sp = ft
				g = og
			elif ph == "FERMENTING":
				kk = max(fd - lagd, 0.5)
				tm = lagd + 0.35 * kk
				w = kk / 7.0
				rate = (1.0 - 0.85 * stall) * clamp(1.0 + 0.05 * (T - sp), 0.6, 1.5)
				t = S[P + "PhaseDays"] + bd * rate
				a0 = 1.0 / (1.0 + math.exp(tm / w))
				ar = 1.0 / (1.0 + math.exp(-(t - tm) / w))
				a = max(0.0, (ar - a0) / (1.0 - a0))
				g = og - (og - fgt) * a
				act = clamp(4.0 * ar * (1.0 - ar), 0.0, 1.0)
				if t < lagd:
					act = 0.05 + 0.2 * t / max(lagd, 0.1)
				tsp = ft
				S[P + "PhaseDays"] = t
				S[FK(n, "DOppb")] = 15.0 + S[P + "DOBase"] * math.exp(-12.0 * t)
				if t >= fd:
					S[P + "PhaseDays"] = 0.0
					S[FK(n, "Phase")] = "DIACETYL_REST"
					bphase(S, C, bid, "DIACETYL_REST")
					ph = "DIACETYL_REST"
			elif ph in ("DIACETYL_REST", "CRASH", "CONDITIONING"):
				t = S[P + "PhaseDays"] + bd
				g = fgt + (g - fgt) * math.exp(-3.0 * bd * (1.0 - 0.85 * stall))
				S[P + "PhaseDays"] = t
				S[FK(n, "DOppb")] = lag(S[FK(n, "DOppb")], 11.0, dm, 30.0)
				if ph == "DIACETYL_REST":
					tsp = ft + 2.0
					rr = 0.015
					act = 0.08
					if t >= DR_DAYS:
						qa_ferment(S, C, rng, n, bid)
						S[P + "PhaseDays"] = 0.0
						S[FK(n, "Phase")] = "CRASH"
						bphase(S, C, bid, "CRASH")
				elif ph == "CRASH":
					tsp = 2.5
					rr = 0.12
					if t >= CRASH_DAYS:
						S[P + "PhaseDays"] = 0.0
						S[FK(n, "Phase")] = "CONDITIONING"
						bphase(S, C, bid, "CONDITIONING")
				else:
					tsp = 2.0
					if t >= cd:
						q = bget(S, bid, "QAStatus", "")
						bn = free_bbt(S)
						if q == "PASS" and bn:
							S[SK("BBT/BBT%d/PhaseDays" % bn)] = 0.0
							S[BK(bn, "BatchId")] = bid
							S[BK(bn, "Recipe")] = rec
							S[BK(bn, "Phase")] = "FILLING"
							S[BK(bn, "LevelPct")] = 0.0
							S[BK(bn, "CO2Vol")] = 0.9
							S[BK(bn, "ReadyToPackage")] = False
							bset(S, bid, "BBT", "BBT%d" % bn)
							bset(S, bid, "DO", round(S[FK(n, "DOppb")] + 8.0 + 20.0 * rng.random(), 1))
							S[P + "XferMin"] = XFER_MIN
							S[FK(n, "Phase")] = "TRANSFER"
							bphase(S, C, bid, "TRANSFER")
							ph = "TRANSFER"
			elif ph == "TRANSFER":
				xm = max(0.0, S[P + "XferMin"] - dm)
				S[P + "XferMin"] = xm
				tsp = 2.0
				lv0 = hl / FV_CAP * 100.0
				S[FK(n, "LevelPct")] = lv0 * xm / XFER_MIN
				bn = bbt_of(S, bid)
				if bn:
					S[BK(bn, "LevelPct")] = hl / BBT_CAP * 100.0 * (1.0 - xm / XFER_MIN)
				if xm <= 0.0:
					S[FK(n, "Phase")] = "CIP"
					S[FK(n, "BatchId")] = ""
					S[FK(n, "Recipe")] = ""
					S[FK(n, "LevelPct")] = 0.0
					if bn:
						S[BK(bn, "Phase")] = "CARBONATING"
						S[SK("BBT/BBT%d/PhaseDays" % bn)] = 0.0
						bphase(S, C, bid, "CARBONATING")
					S[FK(n, "GravityP")] = 0.0
					S[FK(n, "pH")] = 0.0
					S[FK(n, "DOppb")] = 0.0
					S[FK(n, "CO2VolPct")] = 0.0
					S[FK(n, "ABVEst")] = 0.0
					S[FK(n, "PressurePSI")] = 0.0
					S[FK(n, "GlycolValvePct")] = 0.0
					S[FK(n, "DaysInTank")] = 0.0
					S[FK(n, "Fault")] = False
					continue
			else:
				S[FK(n, "TempC")] = lag(T, 18.0, dm, 30.0)
				S[FK(n, "SetpointC")] = S[FK(n, "TempC")]
				S[FK(n, "GlycolValvePct")] = 0.0
				S[FK(n, "PressurePSI")] = 0.0
				S[FK(n, "Fault")] = False
				if not bid:
					S[FK(n, "GravityP")] = 0.0
					S[FK(n, "pH")] = 0.0
					S[FK(n, "DOppb")] = 0.0
					S[FK(n, "CO2VolPct")] = 0.0
					S[FK(n, "ABVEst")] = 0.0
					S[FK(n, "DaysInTank")] = 0.0
				continue
			# ----- common: thermal, derived values
			thermal = ph in ("FERMENTING", "DIACETYL_REST", "CRASH", "CONDITIONING", "TRANSFER")
			if thermal:
				step = rr * dm
				sp = sp + clamp(tsp - sp, -step, step)
				S[FK(n, "SetpointC")] = sp
				v = S[FK(n, "GlycolValvePct")]
				v = lag(v, clamp(8.0 + 60.0 * (T - sp), 0.0, 100.0), dm, 2.0)
				S[FK(n, "GlycolValvePct")] = v
				kc = COOL_K * v / 100.0
				a_ = kc + AMB_K
				teq = (kc * tg + AMB_K * CELLAR_AMB + 0.07 * act) / a_
				T = T + (teq - T) * (1.0 - math.exp(-a_ * dm))
				S[FK(n, "TempC")] = T
				duty += 0.45 * (v / 100.0) * max(0.0, T - tg)
			else:
				S[FK(n, "GlycolValvePct")] = 0.0
			S[FK(n, "GravityP")] = g
			att = 0.0
			if og > fgt + 0.01 and ph != "FILLING":
				att = clamp((og - g) / (og - fgt), 0.0, 1.0)
			if ph == "FILLING":
				ph_t = 5.3
			else:
				ph_t = 5.3 - 0.85 * att - 0.5 * stall
			S[FK(n, "pH")] = lag(S[FK(n, "pH")], ph_t, dm, 5.0)
			co_t = {"FILLING": 0.0, "FERMENTING": 15.0 + 75.0 * att, "DIACETYL_REST": 92.0, "CRASH": 96.0,
					"CONDITIONING": 100.0, "TRANSFER": 100.0}[ph]
			S[FK(n, "CO2VolPct")] = lag(S[FK(n, "CO2VolPct")], co_t, dm, 10.0)
			pr_t = {"FILLING": 0.2, "FERMENTING": 0.4 + 1.4 * act, "DIACETYL_REST": 4.0, "CRASH": 7.0,
					"CONDITIONING": 11.5, "TRANSFER": 3.0}[ph]
			pr_t = pr_t * clamp(1.0 + 0.07 * (T - sp), 0.5, 1.6) + 6.0 * stall
			S[FK(n, "PressurePSI")] = max(0.0, lag(S[FK(n, "PressurePSI")], pr_t, dm, 3.0))
			if ph == "FILLING":
				S[FK(n, "ABVEst")] = 0.0
			else:
				S[FK(n, "ABVEst")] = abv_of(og, g)
			S[FK(n, "DaysInTank")] = S[FK(n, "DaysInTank")] + bd
			S[FK(n, "Fault")] = bool(abs(T - sp) > 3.0 or stall > 0.2)
			act_sum += act
			if ph != "FILLING":
				age_sum += S[FK(n, "DaysInTank")]
				age_n += 1
		C["glycol_duty"] = duty
		C["act_sum"] = act_sum
		S["Cellar/OccupancyPct"] = 100.0 * occ / NFV
		C["fv_age"] = 0.0
		if age_n:
			C["fv_age"] = age_sum / age_n

		# ---- bright tanks
		for n in range(1, NBBT + 1):
			ph = S[BK(n, "Phase")]
			bid = S[BK(n, "BatchId")]
			rec = S[BK(n, "Recipe")]
			T = S[BK(n, "TempC")]
			if ph in ("EMPTY", "CIP"):
				S[BK(n, "TempC")] = lag(T, 15.0, dm, 30.0)
				S[BK(n, "CO2Vol")] = 0.0
				S[BK(n, "ReadyToPackage")] = False
				if ph == "EMPTY":
					S[BK(n, "LevelPct")] = 0.0
				continue
			S[BK(n, "TempC")] = lag(T, 2.0, dm, 20.0)
			tgt = CARB.get(rec, 2.5)
			if ph == "FILLING":
				S[BK(n, "CO2Vol")] = 0.9
			elif ph == "CARBONATING":
				kp = SK("BBT/BBT%d/PhaseDays" % n)
				t = S[kp] + bd
				S[kp] = t
				S[BK(n, "CO2Vol")] = 0.9 + (tgt - 0.9) * (1.0 - math.exp(-5.0 * t / CARB_DAYS))
				if t >= CARB_DAYS and S[BK(n, "CO2Vol")] >= tgt - 0.06:
					q = bget(S, bid, "QAStatus", "")
					if q == "PASS":
						S[BK(n, "Phase")] = "READY"
						S[BK(n, "ReadyToPackage")] = True
						S[BK(n, "CO2Vol")] = tgt
						bphase(S, C, bid, "READY")
			elif ph == "READY":
				S[BK(n, "CO2Vol")] = tgt
				S[BK(n, "ReadyToPackage")] = bool(bget(S, bid, "QAStatus", "") == "PASS")

	# --- clean in place ----------------------------------------------------------------------------------
	def cip(S, C, rng):
		dm = C["dm"]
		active = S["Utilities/CIP/Active"]
		C["cip_steam"] = 0.0
		if active:
			tu = S["Utilities/CIP/TargetUnit"]
			step = S["Utilities/CIP/Step"]
			rem = S[SK("CipRemaining")] - dm
			S[SK("CipRemaining")] = rem
			dose_low = S["_Sim_/Fault/CipDosing"]
			ttemp = {"PRE_RINSE": 25.0, "CAUSTIC": 75.0, "RINSE": 40.0, "ACID": 55.0, "FINAL_RINSE": 25.0}.get(step, 20.0)
			S["Utilities/CIP/TempC"] = lag(S["Utilities/CIP/TempC"], ttemp, dm, 3.0)
			if step == "CAUSTIC":
				C["cip_steam"] = 50.0
			S["Utilities/Water/TodayHl"] += 0.05 * dm
			if step == "CAUSTIC" and dose_low and S["Utilities/CIP/ConductivitymS"] > 20.0:
				S["Utilities/CIP/ConductivitymS"] = 12.0 + rng.gauss(0.0, 0.5)
			if rem <= 0.0:
				names = [x[0] for x in CIP_STEPS]
				i = names.index(step) if step in names else -1
				if i + 1 < len(CIP_STEPS):
					nx = CIP_STEPS[i + 1]
					S["Utilities/CIP/Step"] = nx[0]
					S[SK("CipRemaining")] = nx[1]
					cond = {"RINSE": 6.0, "ACID": 18.0, "FINAL_RINSE": 1.0}.get(nx[0], 45.0)
					if nx[0] == "CAUSTIC":
						cond = 12.0 if dose_low else 45.0
					S["Utilities/CIP/ConductivitymS"] = cond + rng.gauss(0.0, 0.4)
				else:
					if tu.startswith("FV"):
						S[FK(int(tu[2:]), "Phase")] = "EMPTY"
					elif tu.startswith("BBT"):
						S[BK(int(tu[3:]), "Phase")] = "EMPTY"
					S["Utilities/CIP/Active"] = False
					S["Utilities/CIP/Step"] = "IDLE"
					S["Utilities/CIP/TargetUnit"] = ""
					S["_log"].append("CIP of %s complete" % tu)
		else:
			S["Utilities/CIP/ConductivitymS"] = lag(S["Utilities/CIP/ConductivitymS"], 0.5, dm, 2.0)
			S["Utilities/CIP/TempC"] = lag(S["Utilities/CIP/TempC"], 20.0, dm, 5.0)
			pick = ""
			for n in range(1, NFV + 1):
				if S[FK(n, "Phase")] == "CIP" and not S[FK(n, "BatchId")]:
					pick = "FV%02d" % n
					break
			if not pick:
				for n in range(1, NBBT + 1):
					if S[BK(n, "Phase")] == "CIP" and not S[BK(n, "BatchId")]:
						pick = "BBT%d" % n
						break
			if pick:
				S["Utilities/CIP/Active"] = True
				S["Utilities/CIP/TargetUnit"] = pick
				S["Utilities/CIP/Step"] = CIP_STEPS[0][0]
				S[SK("CipRemaining")] = CIP_STEPS[0][1]
				S["Utilities/CIP/ConductivitymS"] = 2.0
				S["_log"].append("CIP of %s starts" % pick)

	# --- packaging line (real time) ----------------------------------------------------------------------
	def ready_bbt(S):
		best = 0
		bests = 1e12
		for n in range(1, NBBT + 1):
			if S[BK(n, "Phase")] == "READY" and S[BK(n, "ReadyToPackage")]:
				bid = S[BK(n, "BatchId")]
				if bget(S, bid, "QAStatus", "") == "PASS":
					s0 = bget(S, bid, "StartHour", 0.0)
					if s0 < bests:
						bests = s0
						best = n
		return best

	def finish_run(S, C):
		bid = S[LK("BatchId")]
		bn = int(S[LS("BBT")][3:]) if S[LS("BBT")] else 0
		cans = int(S[LS("RunGoodF")])
		hl = bget(S, bid, "Hl", BATCH_HL)
		bset(S, bid, "Cans", cans)
		bset(S, bid, "Pallets", int(math.ceil(cans / CANS_PER_PALLET)))
		bset(S, bid, "Yield", round(cans * 0.355 / max(hl, 0.1), 2))
		bphase(S, C, bid, "COMPLETE")
		S["_log"].append("batch %s packaged: %d good packages" % (bid, cans))
		if bn:
			S[BK(bn, "Phase")] = "CIP"
			S[BK(bn, "BatchId")] = ""
			S[BK(bn, "Recipe")] = ""
			S[BK(bn, "LevelPct")] = 0.0
			S[BK(bn, "ReadyToPackage")] = False
		S[LK("BatchId")] = ""
		S[LS("BBT")] = ""
		S[LK("State")] = "IDLE"
		S[LK("DowntimeReason")] = "NO_BEER"
		S[LS("Ramp")] = 0.0
		S[LS("RunTotal")] = 0.0
		S[LS("StopReason")] = ""
		S[LS("StopS")] = 0.0

	def line(S, C, rng):
		real = C["real"]
		L = LS
		if C["shift_new"]:
			for k in ("GoodF", "RejFillF", "RejSeamF", "RejLabelF", "RunS", "DownS", "PlannedS"):
				S[L(k)] = 0.0
		st = S[LK("State")]
		reason = S[LK("DowntimeReason")]
		held = S["_Sim_/Request/HoldLine"]
		fmt = S[LK("Format")]
		feff = 0.5 if fmt == "KEG" else 1.0
		counted = False
		jam = None
		if S["_Sim_/Fault/FillerJam"]:
			jam = "FILLER_JAM"
		elif S["_Sim_/Fault/SeamerFault"]:
			jam = "SEAMER_FAULT"
		elif S["_Sim_/Fault/LabelOut"]:
			jam = "LABEL_OUT"
		if st == "CIP":
			S[L("LineCipS")] = S[L("LineCipS")] - real
			if S[L("LineCipS")] <= 0.0:
				st = "IDLE"
				reason = "NO_BEER"
		elif st == "CHANGEOVER":
			S[L("ChangeS")] = S[L("ChangeS")] - real
			if S[L("ChangeS")] <= 0.0:
				if S[LK("BatchId")]:
					st = "RUNNING"
					reason = "NONE"
					S[L("Ramp")] = 0.1
				else:
					st = "IDLE"
					reason = "NO_BEER"
		elif st == "IDLE":
			if held:
				reason = "NONE"
			elif S[LK("BatchId")]:
				st = "RUNNING"
				reason = "NONE"
				S[L("Ramp")] = 0.2
			else:
				bn = ready_bbt(S)
				if bn:
					bid = S[BK(bn, "BatchId")]
					rec = S[BK(bn, "Recipe")]
					nf = rp(S, rec, "Format", "CAN")
					chg = 0.0
					if nf != fmt:
						chg = 45.0
					elif S[LK("Recipe")] and S[LK("Recipe")] != rec:
						chg = 15.0
					hl = bget(S, bid, "Hl", BATCH_HL)
					S[LK("BatchId")] = bid
					S[LK("Recipe")] = rec
					S[LK("Format")] = nf
					S[L("BBT")] = "BBT%d" % bn
					S[L("RunTotal")] = hl * CANS_PER_HL * PACK_YIELD
					S[L("RunGoodF")] = 0.0
					S[L("RunRejF")] = 0.0
					S[L("StopReason")] = ""
					S[BK(bn, "Phase")] = "PACKAGING"
					S[BK(bn, "ReadyToPackage")] = False
					bphase(S, C, bid, "PACKAGING")
					S["_log"].append("packaging of %s starts from BBT%d%s" % (bid, bn, " (changeover %d s)" % chg if chg else ""))
					if chg > 0.0:
						st = "CHANGEOVER"
						reason = "CHANGEOVER"
						S[L("ChangeS")] = chg
					else:
						st = "RUNNING"
						reason = "NONE"
						S[L("Ramp")] = 0.1
				else:
					reason = "NO_BEER"
		else:
			# RUNNING, DOWN or STARVED with a batch on the line
			if held:
				st = "IDLE"
				reason = "NONE"
				S[L("Ramp")] = 0.0
				S[L("StopReason")] = ""
			elif jam:
				if st != "DOWN" or reason != jam:
					st = "DOWN"
					reason = jam
					S[L("StopReason")] = ""
					S[L("Ramp")] = 0.0
				S[L("FaultAutoS")] = S[L("FaultAutoS")] + real
				lim = 150.0
				if jam != "FILLER_JAM":
					lim = 60.0
				if S[L("FaultAutoS")] > lim and jam != "FILLER_JAM":
					S["_Sim_/Fault/" + {"SEAMER_FAULT": "SeamerFault", "LABEL_OUT": "LabelOut"}[jam]] = False
				elif S[L("FaultAutoS")] > 120.0:
					S["_Sim_/Fault/FillerJam"] = False
			elif st == "DOWN" and reason in ("FILLER_JAM", "SEAMER_FAULT", "LABEL_OUT") and not S[L("StopReason")]:
				st = "RUNNING"
				S[L("Ramp")] = 0.2
				S[L("RejBoost")] = 8.0 if reason == "FILLER_JAM" else 3.0
				S[L("FaultAutoS")] = 0.0
				S["_log"].append("line restarts after %s" % reason)
				reason = "NONE"
			elif S[L("StopReason")]:
				S[L("StopS")] = S[L("StopS")] - real
				if S[L("StopS")] <= 0.0:
					st = "RUNNING"
					reason = "NONE"
					S[L("StopReason")] = ""
					S[L("Ramp")] = 0.3
			if st == "RUNNING":
				ramp = min(1.0, S[L("Ramp")] + real / 6.0)
				S[L("Ramp")] = ramp
				speed = RATED_CPM * feff * ramp * (1.0 - 0.03 * abs(rng.gauss(0.0, 1.0)))
				cans = speed * real / 60.0
				mult = 1.0 + S[L("RejBoost")]
				rf = cans * 0.006 * mult
				rs = cans * 0.003 * mult
				rl = cans * 0.004 * mult
				good = max(0.0, cans - rf - rs - rl)
				S[L("GoodF")] = S[L("GoodF")] + good
				S[L("RunGoodF")] = S[L("RunGoodF")] + good
				S[L("GoodDayF")] = S[L("GoodDayF")] + good
				S[L("RejFillF")] = S[L("RejFillF")] + rf
				S[L("RejSeamF")] = S[L("RejSeamF")] + rs
				S[L("RejLabelF")] = S[L("RejLabelF")] + rl
				S[L("RunRejF")] = S[L("RunRejF")] + rf + rs + rl
				S[L("RejBoost")] = S[L("RejBoost")] * math.exp(-real / 40.0)
				S[L("RecentGood")] = S[L("RecentGood")] * math.exp(-real / 60.0) + good
				S[L("RecentRej")] = S[L("RecentRej")] * math.exp(-real / 60.0) + rf + rs + rl
				S[LK("SpeedCPM")] = speed
				counted = True
				bn = int(S[L("BBT")][3:]) if S[L("BBT")] else 0
				done = S[L("RunGoodF")] + S[L("RunRejF")]
				if bn:
					lv0 = bget(S, S[LK("BatchId")], "Hl", BATCH_HL) / BBT_CAP * 100.0
					S[BK(bn, "LevelPct")] = max(0.0, lv0 * (1.0 - done / max(S[L("RunTotal")], 1.0)))
				if done >= S[L("RunTotal")]:
					finish_run(S, C)
					st = "IDLE"
					reason = "NO_BEER"
					counted = False
				elif ramp > 0.6 and rng.random() < real / 80.0:
					x = rng.random()
					if x < 0.7:
						rs_ = "CAN_SUPPLY"
					elif x < 0.8:
						rs_ = "LABEL_OUT"
					elif x < 0.9:
						rs_ = "SEAMER_FAULT"
					else:
						rs_ = "FILLER_JAM"
					S[L("StopReason")] = rs_
					S[L("StopS")] = 4.0 + 12.0 * rng.random()
					st = "STARVED" if rs_ == "CAN_SUPPLY" else "DOWN"
					reason = rs_
		if not counted:
			S[LK("SpeedCPM")] = 0.0
			S[L("RecentRej")] = S[L("RecentRej")] * math.exp(-real / 15.0)
			S[L("RecentGood")] = S[L("RecentGood")] * math.exp(-real / 60.0)
		S[LK("State")] = st
		S[LK("DowntimeReason")] = reason
		# ---- accounting
		if st != "IDLE":
			S[L("PlannedS")] = S[L("PlannedS")] + real
		if st == "RUNNING":
			S[L("RunS")] = S[L("RunS")] + real
		elif st in ("DOWN", "STARVED", "BLOCKED", "CHANGEOVER", "CIP"):
			S[L("DownS")] = S[L("DownS")] + real
		gd = S[L("GoodF")]
		rj = S[L("RejFillF")] + S[L("RejSeamF")] + S[L("RejLabelF")]
		S[LK("GoodCount")] = int(gd)
		S[LK("RejectFill")] = int(S[L("RejFillF")])
		S[LK("RejectSeam")] = int(S[L("RejSeamF")])
		S[LK("RejectLabel")] = int(S[L("RejLabelF")])
		S[LK("RejectCount")] = int(S[L("RejFillF")]) + int(S[L("RejSeamF")]) + int(S[L("RejLabelF")])
		S[LK("RatedCPM")] = RATED_CPM
		S[LK("DowntimeMin")] = S[L("DownS")] / 60.0
		run_min = S[L("RunS")] / 60.0
		S["Packaging/OEE/RunMin"] = run_min
		S["Packaging/OEE/DownMin"] = S[L("DownS")] / 60.0
		S["Packaging/OEE/PlannedMin"] = S[L("PlannedS")] / 60.0
		av = 0.0
		pf = 0.0
		ql = 1.0
		if S[L("PlannedS")] > 1.0:
			av = clamp(S[L("RunS")] / S[L("PlannedS")], 0.0, 1.0)
		if run_min > 0.05:
			pf = clamp((gd + rj) / (RATED_CPM * feff * run_min), 0.0, 1.0)
		if gd + rj > 1.0:
			ql = clamp(gd / (gd + rj), 0.0, 1.0)
		S["Packaging/OEE/Availability"] = av
		S["Packaging/OEE/Performance"] = pf
		S["Packaging/OEE/Quality"] = ql
		S["Packaging/OEE/OEE"] = av * pf * ql
		tot_new = S[L("RecentGood")] + S[L("RecentRej")]
		S["KPI/RejectPct"] = 100.0 * S[L("RecentRej")] / tot_new if tot_new > 1.0 else 0.0
		S["KPI/LineOEE"] = S["Packaging/OEE/OEE"]
		S["KPI/GoodCansToday"] = int(S[L("GoodDayF")])
		S[LK("PalletsToday")] = int(S[L("GoodDayF")] / CANS_PER_PALLET)
		S[LK("CasesToday")] = int(S[L("GoodDayF")] / CANS_PER_CASE)
		nshift = 2.0 if S["_Sim_/Scenario"] == "rush_order" else 3.0
		S[LK("ShiftTargetCans")] = int(S["Schedule/BrewsPerDay"] * BATCH_HL * CANS_PER_HL * PACK_YIELD / nshift)
		# ---- machines
		f = -1
		if st in ("DOWN", "STARVED", "BLOCKED"):
			f = {"CAN_SUPPLY": 0, "FILLER_JAM": 2, "SEAMER_FAULT": 3, "LABEL_OUT": 5}.get(reason, 2)
		cin = gd + rj
		fo = S[L("RejFillF")]
		so = S[L("RejSeamF")]
		lo = S[L("RejLabelF")]
		ins = [cin, cin, cin, cin - fo, cin - fo - so, cin - fo - so, gd, gd]
		outs = [cin, cin, cin - fo, cin - fo - so, cin - fo - so, gd, gd, gd]
		for i, m in enumerate(MACH):
			p = "Packaging/%s/" % m
			if st == "RUNNING":
				ms = "RUNNING"
			elif f < 0:
				ms = "IDLE"
			elif i < f:
				ms = "BLOCKED"
			elif i == f:
				ms = "STARVED" if reason == "CAN_SUPPLY" else "FAULT"
			else:
				ms = "STARVED"
			S[p + "State"] = ms
			S[p + "Fault"] = bool(ms == "FAULT")
			S[p + "CountIn"] = int(ins[i])
			S[p + "CountOut"] = int(outs[i])

	# --- utilities ------------------------------------------------------------------------------------------
	def utilities(S, C, rng):
		dm = C["dm"]
		ds = C["ds"]
		dh = ds / 3600.0
		# steam demand
		st = S[LK("State")]
		demand = C["steam_bh"] + C["cip_steam"] + 15.0
		if st == "RUNNING":
			demand += 60.0
		low = S["_Sim_/Fault/BoilerLow"]
		pt = 8.0 - 0.003 * max(0.0, demand - 500.0)
		if low:
			pt = 4.5
		P = lag(S["Utilities/Boiler/PressureBar"], pt, dm, 1.0)
		S["Utilities/Boiler/PressureBar"] = P + rng.gauss(0.0, 0.01)
		sf = demand * clamp(P / 8.0, 0.4, 1.0)
		S["Utilities/Boiler/SteamKgph"] = lag(S["Utilities/Boiler/SteamKgph"], sf, dm, 0.7)
		S["Utilities/Boiler/State"] = "LOW_FIRE" if low else ("RUN" if demand > 40.0 else "STANDBY")
		fuel_kw = S["Utilities/Boiler/SteamKgph"] * 0.75
		S["Utilities/Boiler/FuelKwh"] += fuel_kw * dh
		# glycol
		fail = S["_Sim_/Fault/GlycolFailure"]
		duty = C["glycol_duty"]
		for n in range(1, NBBT + 1):
			if S[BK(n, "Phase")] in ("CARBONATING", "READY", "FILLING", "PACKAGING"):
				duty += 1.0
		duty += 0.8 * S["Brewhouse/Chiller/GlycolValvePct"]
		load = 100.0 * duty / 90.0
		if fail:
			load = 100.0
		S["Utilities/Glycol/LoadPct"] = lag(S["Utilities/Glycol/LoadPct"], clamp(load, 0.0, 100.0), dm, 1.0)
		gt = -3.0 + 0.04 * max(0.0, S["Utilities/Glycol/LoadPct"] - 85.0)
		if fail:
			gt = 24.0
		S["Utilities/Glycol/SupplyC"] = lag(S["Utilities/Glycol/SupplyC"], gt, dm, 6.0 if fail else 8.0)
		S["Utilities/Glycol/ReturnC"] = S["Utilities/Glycol/SupplyC"] + 1.0 + 0.07 * S["Utilities/Glycol/LoadPct"]
		S["Utilities/Glycol/CompressorOn"] = bool((not fail) and S["Utilities/Glycol/LoadPct"] > 3.0)
		S["Utilities/Glycol/Fault"] = bool(fail)
		# CO2
		cons = 0.4
		for n in range(1, NBBT + 1):
			if S[BK(n, "Phase")] == "CARBONATING":
				cons += 2.0
		if st == "RUNNING":
			cons += 3.0
		if S["_Sim_/Fault/Co2Leak"]:
			cons += 150.0
		S["Utilities/CO2/ConsumptionKgph"] = lag(S["Utilities/CO2/ConsumptionKgph"], cons, dm, 1.0)
		tank = S["Utilities/CO2/TankPct"] - S["Utilities/CO2/ConsumptionKgph"] * dh / 10.0
		if tank < 22.0 and not S["_Sim_/Fault/Co2Leak"]:
			tank = 92.0
			S["_log"].append("CO2 delivery: tank back to 92 %")
		S["Utilities/CO2/TankPct"] = max(0.0, tank)
		rec_t = clamp(30.0 + 55.0 * min(1.0, C["act_sum"] / 2.5), 0.0, 95.0)
		S[SK("RecoverPct")] = lag(S[SK("RecoverPct")], rec_t, dm, 10.0)
		S["Utilities/CO2/RecoveredPct"] = S[SK("RecoverPct")]
		# air
		at = 7.0 + 0.1 * math.sin(C["ab"] * 3.0)
		if S["_Sim_/Fault/AirLoss"]:
			at = 3.5
		S["Utilities/Air/PressureBar"] = lag(S["Utilities/Air/PressureBar"], at, dm, 1.0) + rng.gauss(0.0, 0.01)
		# energy
		kw = 25.0 + 0.5 * S["Utilities/Glycol/LoadPct"] + fuel_kw
		if st == "RUNNING":
			kw += 40.0
		S["Utilities/Energy/TodayKwh"] += kw * dh

	# --- KPIs -----------------------------------------------------------------------------------------------
	def kpis(S, C, tick):
		prog = 0
		hold = False
		for sl in S["_slots"]:
			stt = S[bkey(sl, "State")]
			if stt in ("BREWING", "FERMENTING", "CONDITIONING", "PACKAGING"):
				prog += 1
			if S[bkey(sl, "QAStatus")] == "HOLD" and stt not in ("COMPLETE", "DUMPED"):
				hold = True
		S["Batches/ActiveCount"] = prog
		S["KPI/BatchesInProgress"] = prog
		S["KPI/CellarOccupancyPct"] = S["Cellar/OccupancyPct"]
		S["KPI/AvgFermentDays"] = C["fv_age"]
		hlt = S["KPI/HlToday"]
		if hlt > 0.5:
			S["KPI/EnergyKwhPerHl"] = (S["Utilities/Energy/TodayKwh"]) / hlt
			S["KPI/WaterHlPerHl"] = S["Utilities/Water/TodayHl"] / hlt
		else:
			S["KPI/EnergyKwhPerHl"] = 0.0
			S["KPI/WaterHlPerHl"] = 0.0
		S["KPI/CO2RecoveredPct"] = S["Utilities/CO2/RecoveredPct"]
		busy = False
		for u in UNITS:
			if S[U(u, "Phase")] != "IDLE":
				busy = True
		S["Time/BrewDayActive"] = bool(busy or (S["KPI/BrewsToday"] < S["Schedule/BrewsPerDay"] and C["h"] < 20.0))
		risk = S["_Sim_/Fault/GlycolFailure"] or S["Cellar/OccupancyPct"] > 90.0
		for n in range(1, NFV + 1):
			if S[FK(n, "Fault")]:
				risk = True
		if hold:
			mode = "QA_HOLD"
		elif S[LK("State")] == "DOWN":
			mode = "LINE_DOWN"
		elif risk:
			mode = "CELLAR_RISK"
		elif S["_Sim_/Scenario"] == "rush_order":
			mode = "RUSH"
		elif S["Time/BrewDayActive"]:
			mode = "BREW_DAY"
		else:
			mode = "NORMAL"
		S["KPI/Mode"] = mode
		if tick % 2 == 0:
			try:
				res = system.alarm.queryStatus(source=["prov:default:/tag:BR/*"], state=["ActiveUnacked", "ActiveAcked"])
				S["KPI/ActiveAlarms"] = len(res)
			except Exception as e:
				S["_log_err"].append("alarm query failed: %s" % e)

	def model(S, C, rng):
		C["rng"] = rng
		clock(S, C)
		requests(S, C)
		sc = apply_scenario(S, C)
		scheduler(S, C)
		brewhouse(S, C, rng)
		cellar(S, C, rng)
		cip(S, C, rng)
		line(S, C, rng)
		utilities(S, C, rng)
		scenario_step(S, C, sc)
		kpis(S, C, C["tick"])

	# --- tag io --------------------------------------------------------------------------------------------
	def read_state():
		q0 = system.tag.readBlocking([BASE + SK("ActiveSlots")])[0]
		if not q0.quality.isGood() or q0.value is None:
			raise Exception("ActiveSlots tag unreadable")
		slots = []
		for x in str(q0.value).split(","):
			if x.strip().isdigit():
				slots.append(int(x))
		keys = list(KEYS)
		for sl in slots:
			for f in BFIELDS:
				keys.append(bkey(sl, f))
		qvs = system.tag.readBlocking([BASE + k for k in keys])
		S = {}
		bad = []
		for k, qv in zip(keys, qvs):
			if qv.value is None or not qv.quality.isGood():
				bad.append(k)
			S[k] = qv.value
		if bad:
			raise Exception("%d tags unreadable, first %s" % (len(bad), bad[0]))
		S["_keys"] = keys
		S["_slots"] = list(slots)
		S["_new"] = []
		S["_ids"] = {}
		for sl in slots:
			S["_ids"][S[bkey(sl, "Id")]] = sl
		S["_log"] = []
		S["_log_err"] = []
		return S

	def write_changes(S, orig):
		paths = []
		vals = []
		for k in S["_keys"]:
			nv = coerce(k, orig[k], S[k])
			if nv != orig[k]:
				paths.append(BASE + k)
				vals.append(nv)
		for k in S["_new"]:
			paths.append(BASE + k)
			vals.append(coerce_new(k, S[k]))
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
			accel = clamp(S["_Sim_/FermentAccel"], 1.0, 60.0)
			ds = speed * real
			S["_Sim_/State/LastEpochMs"] = now
			S["_Sim_/TickCount"] += 1
			tick = S["_Sim_/TickCount"]
			rng = Rng(S["_Sim_/Seed"] * 100003 + tick)
			C = {"ds": ds, "dm": ds / 60.0, "real": real, "bd": ds * accel / 86400.0, "tick": tick}
			model(S, C, rng)
			for m in S["_log_err"]:
				S["_Sim_/LastError"] = m
				S["_Sim_/State/OkStreak"] = 0
			if S["_Sim_/LastError"] and not S["_log_err"]:
				S["_Sim_/State/OkStreak"] += 1
				if S["_Sim_/State/OkStreak"] >= 30:
					S["_Sim_/LastError"] = ""
			# slots the next tick reads: everything not finished
			act = []
			for sl in S["_slots"]:
				if S[bkey(sl, "State")] not in ("COMPLETE", "DUMPED"):
					act.append(sl)
			S["_Sim_/State/ActiveSlots"] = ",".join([str(x) for x in sorted(act)])
			t1 = system.date.toMillis(system.date.now())
			S["_Sim_/LastTickMs"] = int(t1 - t0)
			n = write_changes(S, orig)
			t2 = system.date.toMillis(system.date.now())
			for m in S["_log"]:
				log.info(m)
			for m in S["_log_err"]:
				log.warn("br_sim: " + m)
			if tick % 60 == 1:
				log.info("br_sim tick %d: read+compute %d ms, write %d ms (%d tags)" % (tick, t1 - t0, t2 - t1, n))
		except Exception as e:
			import traceback
			msg = "%s: %s" % (e.__class__.__name__, e)
			try:
				tb = traceback.format_exc()
				msg = (msg + " | " + tb.replace("\n", " | "))[:900]
			except Exception:
				pass
			log.error("br_sim tick failed: " + msg)
			try:
				system.tag.writeBlocking([BASE + "_Sim_/LastError", BASE + "_Sim_/State/OkStreak"], [msg, 0])
			except Exception:
				pass

	main()
