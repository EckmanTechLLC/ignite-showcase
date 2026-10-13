# Craft Brewery scenario / command API (ADR-005 Amendment A2).
# Called through POST /script/library {"project": "demo", "path": "brew.<fn>", "args": [...]}.
# Every command writes [default]BR/_Sim_/* or [default]BR/Schedule/* tags; the 1 s br_sim timer does the work.
# Every function returns {ok, message, state}; state is the pre-command state (the timer has not reacted yet).

BASE = "[default]BR/"
RECIPES = ["Pilsner", "IPA", "Stout", "Wheat"]
SCENARIOS = ["normal", "glycol_failure", "filler_jam", "stuck_sparge", "boil_over", "contamination", "rush_order"]
# fault name used by the API -> _Sim_/Fault/<tag>
FAULT_TAGS = {
	"glycol_failure": "GlycolFailure", "filler_jam": "FillerJam", "seamer_fault": "SeamerFault",
	"label_out": "LabelOut", "stuck_sparge": "StuckSparge", "boil_over": "BoilOver",
	"contamination": "Contamination", "co2_leak": "Co2Leak", "air_loss": "AirLoss", "boiler_low": "BoilerLow",
	"cip_dosing": "CipDosing",
}
# faults that belong to a scenario state machine (the timer sets the flag when the scenario starts)
FAULT_SCENARIO = {
	"glycol_failure": "glycol_failure", "filler_jam": "filler_jam", "stuck_sparge": "stuck_sparge",
	"boil_over": "boil_over", "contamination": "contamination",
}
UNITS = ["Mill", "MashTun", "LauterTun", "Kettle", "Whirlpool", "Chiller"]
MACHINES = ["Depal", "Rinser", "Filler", "Seamer", "Pasteurizer", "Labeler", "Packer", "Palletizer"]
NFV = 12
NBBT = 4
NB = 24
MIN_SPEED = 1.0
MAX_SPEED = 600.0
DEFAULT_SPEED = 60.0
DEFAULT_ACCEL = 8.0
MAX_ACCEL = 60.0
DEFAULT_BREWS = 2

_KEYS = [
	"Time/HourOfDay", "Time/DayIndex", "Time/Shift", "Time/BrewDayActive",
	"KPI/BatchesInProgress", "KPI/BrewsToday", "KPI/HlToday", "KPI/CellarOccupancyPct", "KPI/AvgFermentDays",
	"KPI/LineOEE", "KPI/GoodCansToday", "KPI/RejectPct", "KPI/EnergyKwhPerHl", "KPI/WaterHlPerHl",
	"KPI/CO2RecoveredPct", "KPI/ActiveAlarms", "KPI/Mode",
	"Schedule/BrewsPerDay", "Schedule/NextRecipe", "Schedule/NextStartHour", "Schedule/Queue",
	"Packaging/Line/State", "Packaging/Line/SpeedCPM", "Packaging/Line/GoodCount", "Packaging/Line/RejectCount",
	"Packaging/Line/DowntimeReason", "Packaging/Line/DowntimeMin", "Packaging/Line/BatchId", "Packaging/Line/Recipe",
	"Packaging/Line/Format", "Packaging/Line/ShiftTargetCans", "Packaging/Line/PalletsToday",
	"Packaging/OEE/Availability", "Packaging/OEE/Performance", "Packaging/OEE/Quality", "Packaging/OEE/OEE",
	"Utilities/Boiler/PressureBar", "Utilities/Boiler/SteamKgph", "Utilities/Glycol/SupplyC",
	"Utilities/Glycol/LoadPct", "Utilities/Glycol/Fault", "Utilities/CO2/TankPct", "Utilities/Air/PressureBar",
	"Utilities/CIP/Step", "Utilities/CIP/TargetUnit", "Utilities/Water/TodayHl", "Utilities/Energy/TodayKwh",
	"Cellar/OccupancyPct",
	"_Sim_/Enabled", "_Sim_/Scenario", "_Sim_/ScenarioStep", "_Sim_/SpeedFactor", "_Sim_/FermentAccel",
	"_Sim_/TickCount", "_Sim_/LastTickMs", "_Sim_/LastError", "_Sim_/Request/HoldLine", "_Sim_/Request/StartBatch",
	"_Sim_/Request/Changeover", "_Sim_/Request/Cip", "_Sim_/Request/QaRelease", "_Sim_/Request/QaDump",
]
for _f in FAULT_TAGS.values():
	_KEYS.append("_Sim_/Fault/" + _f)
for _u in UNITS:
	for _k in ("Phase", "PhaseRemainingMin", "BatchId", "Recipe", "LevelPct", "TempC", "Fault"):
		_KEYS.append("Brewhouse/%s/%s" % (_u, _k))
for _n in range(1, NFV + 1):
	for _k in ("BatchId", "Phase", "TempC", "SetpointC", "GravityP", "pH", "PressurePSI", "LevelPct", "DaysInTank",
			   "GlycolValvePct", "Fault"):
		_KEYS.append("Cellar/FV%02d/%s" % (_n, _k))
for _n in range(1, NBBT + 1):
	for _k in ("BatchId", "Phase", "LevelPct", "CO2Vol", "ReadyToPackage"):
		_KEYS.append("Cellar/BBT%d/%s" % (_n, _k))
_BFIELDS = ["Id", "Recipe", "State", "StartHour", "Phase", "FV", "BBT", "Hl", "OG", "FG", "ABV", "pH", "IBU", "DO",
			"QAStatus", "Cans", "Pallets", "Yield"]
for _s in range(1, NB + 1):
	for _k in _BFIELDS:
		_KEYS.append("Batches/B%02d/%s" % (_s, _k))


def _read(keys):
	qvs = system.tag.readBlocking([BASE + k for k in keys])
	out = {}
	for k, qv in zip(keys, qvs):
		if qv.quality.isGood():
			out[k] = qv.value
		else:
			out[k] = None
	return out


def _write(pairs):
	# pairs: list of (key, value), written in order, one blocking call each so ordering is guaranteed
	for k, v in pairs:
		res = system.tag.writeBlocking([BASE + k], [v])
		if not res[0].isGood():
			raise Exception("write failed for %s: %s" % (k, res[0]))


def _num(v, d=1):
	if v is None:
		return None
	return round(float(v), d)


def _state(raw=None):
	r = raw
	if r is None:
		r = _read(_KEYS)
	batches = []
	for s in range(1, NB + 1):
		b = {}
		for f in _BFIELDS:
			b[f] = r["Batches/B%02d/%s" % (s, f)]
		if b["Id"]:
			batches.append({
				"slot": s, "id": b["Id"], "recipe": b["Recipe"], "state": b["State"], "start_hour": _num(b["StartHour"], 2),
				"phase": b["Phase"], "fv": b["FV"], "bbt": b["BBT"], "hl": _num(b["Hl"], 2), "og": _num(b["OG"], 2),
				"fg": _num(b["FG"], 2), "abv": _num(b["ABV"], 2), "ph": _num(b["pH"], 2), "ibu": _num(b["IBU"], 1),
				"do_ppb": _num(b["DO"], 1), "qa": b["QAStatus"], "cans": b["Cans"], "pallets": b["Pallets"],
				"yield_pct": _num(b["Yield"], 1),
			})
	units = {}
	for u in UNITS:
		units[u] = {
			"phase": r["Brewhouse/%s/Phase" % u], "remaining_min": _num(r["Brewhouse/%s/PhaseRemainingMin" % u]),
			"batch": r["Brewhouse/%s/BatchId" % u], "recipe": r["Brewhouse/%s/Recipe" % u],
			"level_pct": _num(r["Brewhouse/%s/LevelPct" % u]), "temp_c": _num(r["Brewhouse/%s/TempC" % u]),
			"fault": bool(r["Brewhouse/%s/Fault" % u]),
		}
	fv = {}
	for n in range(1, NFV + 1):
		p = "Cellar/FV%02d/" % n
		fv["FV%02d" % n] = {
			"batch": r[p + "BatchId"], "phase": r[p + "Phase"], "temp_c": _num(r[p + "TempC"]),
			"setpoint_c": _num(r[p + "SetpointC"]), "gravity_p": _num(r[p + "GravityP"], 2), "ph": _num(r[p + "pH"], 2),
			"pressure_psi": _num(r[p + "PressurePSI"]), "level_pct": _num(r[p + "LevelPct"]),
			"days": _num(r[p + "DaysInTank"], 2), "glycol_valve_pct": _num(r[p + "GlycolValvePct"], 0),
			"fault": bool(r[p + "Fault"]),
		}
	bbt = {}
	for n in range(1, NBBT + 1):
		p = "Cellar/BBT%d/" % n
		bbt["BBT%d" % n] = {
			"batch": r[p + "BatchId"], "phase": r[p + "Phase"], "level_pct": _num(r[p + "LevelPct"]),
			"co2_vol": _num(r[p + "CO2Vol"], 2), "ready": bool(r[p + "ReadyToPackage"]),
		}
	faults = []
	for name in sorted(FAULT_TAGS.keys()):
		if r["_Sim_/Fault/" + FAULT_TAGS[name]]:
			faults.append(name)
	return {
		"mode": r["KPI/Mode"],
		"scenario": r["_Sim_/Scenario"],
		"scenario_step": r["_Sim_/ScenarioStep"],
		"speed": r["_Sim_/SpeedFactor"],
		"ferment_accel": r["_Sim_/FermentAccel"],
		"enabled": bool(r["_Sim_/Enabled"]),
		"time": {
			"hour": _num(r["Time/HourOfDay"], 2), "day": r["Time/DayIndex"], "shift": r["Time/Shift"],
			"brew_day_active": bool(r["Time/BrewDayActive"]),
		},
		"kpi": {
			"batches_in_progress": r["KPI/BatchesInProgress"], "brews_today": r["KPI/BrewsToday"],
			"hl_today": _num(r["KPI/HlToday"], 1), "cellar_occupancy_pct": _num(r["KPI/CellarOccupancyPct"]),
			"avg_ferment_days": _num(r["KPI/AvgFermentDays"], 2), "line_oee": _num(r["KPI/LineOEE"], 3),
			"good_cans_today": r["KPI/GoodCansToday"], "reject_pct": _num(r["KPI/RejectPct"], 2),
			"energy_kwh_per_hl": _num(r["KPI/EnergyKwhPerHl"]), "water_hl_per_hl": _num(r["KPI/WaterHlPerHl"], 2),
			"co2_recovered_pct": _num(r["KPI/CO2RecoveredPct"]), "active_alarms": r["KPI/ActiveAlarms"],
		},
		"schedule": {
			"brews_per_day": r["Schedule/BrewsPerDay"], "next_recipe": r["Schedule/NextRecipe"],
			"next_start_hour": _num(r["Schedule/NextStartHour"], 2), "queue": r["Schedule/Queue"],
		},
		"batches": batches,
		"brewhouse": units,
		"cellar": {"occupancy_pct": _num(r["Cellar/OccupancyPct"]), "fv": fv, "bbt": bbt},
		"line": {
			"state": r["Packaging/Line/State"], "speed_cpm": _num(r["Packaging/Line/SpeedCPM"], 0),
			"good_count": r["Packaging/Line/GoodCount"], "reject_count": r["Packaging/Line/RejectCount"],
			"downtime_reason": r["Packaging/Line/DowntimeReason"], "downtime_min": _num(r["Packaging/Line/DowntimeMin"], 2),
			"batch": r["Packaging/Line/BatchId"], "recipe": r["Packaging/Line/Recipe"], "format": r["Packaging/Line/Format"],
			"shift_target_cans": r["Packaging/Line/ShiftTargetCans"], "pallets_today": r["Packaging/Line/PalletsToday"],
			"held": bool(r["_Sim_/Request/HoldLine"]),
			"oee": {
				"availability": _num(r["Packaging/OEE/Availability"], 3), "performance": _num(r["Packaging/OEE/Performance"], 3),
				"quality": _num(r["Packaging/OEE/Quality"], 3), "oee": _num(r["Packaging/OEE/OEE"], 3),
			},
		},
		"utilities": {
			"boiler_bar": _num(r["Utilities/Boiler/PressureBar"], 2), "steam_kgph": _num(r["Utilities/Boiler/SteamKgph"], 0),
			"glycol_supply_c": _num(r["Utilities/Glycol/SupplyC"]), "glycol_load_pct": _num(r["Utilities/Glycol/LoadPct"], 0),
			"glycol_fault": bool(r["Utilities/Glycol/Fault"]), "co2_tank_pct": _num(r["Utilities/CO2/TankPct"]),
			"air_bar": _num(r["Utilities/Air/PressureBar"], 2), "cip_step": r["Utilities/CIP/Step"],
			"cip_target": r["Utilities/CIP/TargetUnit"], "water_today_hl": _num(r["Utilities/Water/TodayHl"]),
			"energy_today_kwh": _num(r["Utilities/Energy/TodayKwh"], 0),
		},
		"faults": faults,
		"pending": {
			"start_batch": r["_Sim_/Request/StartBatch"], "changeover": r["_Sim_/Request/Changeover"],
			"cip": r["_Sim_/Request/Cip"], "qa_release": r["_Sim_/Request/QaRelease"], "qa_dump": r["_Sim_/Request/QaDump"],
		},
		"tick_count": r["_Sim_/TickCount"],
		"last_tick_ms": r["_Sim_/LastTickMs"],
		"last_error": r["_Sim_/LastError"],
	}


def _result(ok, message, raw=None):
	return {"ok": bool(ok), "message": message, "state": _state(raw)}


def _is_number(x):
	return isinstance(x, (int, long, float)) and not isinstance(x, bool)


def _is_int(x):
	return isinstance(x, (int, long)) and not isinstance(x, bool)


def _enabled_or(msg_prefix):
	st = _state()
	if not st["enabled"]:
		return st, _result(False, "%s: simulation is disabled (_Sim_/Enabled is false)" % msg_prefix)
	return st, None


def _find_batch(st, batch):
	# accepts "BR0003", "B03", a slot number 1-24 or its string
	if _is_int(batch):
		for b in st["batches"]:
			if b["slot"] == batch:
				return b
		return None
	if isinstance(batch, basestring):
		t = batch.strip().upper()
		for b in st["batches"]:
			if b["id"].upper() == t or ("B%02d" % b["slot"]) == t:
				return b
	return None


def _unit(unit):
	# "FV03", "fv3", "BBT2", "LINE" -> canonical name or None
	if not isinstance(unit, basestring):
		return None
	t = unit.strip().upper()
	if t == "LINE":
		return "LINE"
	if t.startswith("FV") and t[2:].isdigit() and 1 <= int(t[2:]) <= NFV:
		return "FV%02d" % int(t[2:])
	if t.startswith("BBT") and t[3:].isdigit() and 1 <= int(t[3:]) <= NBBT:
		return "BBT%d" % int(t[3:])
	return None


def status():
	return _state()


def set_scenario(name):
	try:
		if name not in SCENARIOS:
			return _result(False, "scenario must be one of %s" % ", ".join(SCENARIOS))
		st, err = _enabled_or("set_scenario")
		if err:
			return err
		_write([("_Sim_/Scenario", str(name))])
		return _result(True, "scenario set to %s" % name)
	except Exception as e:
		return _result(False, "set_scenario failed: %s" % e)


def restore():
	try:
		st, err = _enabled_or("restore")
		if err:
			return err
		writes = []
		for tag in FAULT_TAGS.values():
			writes.append(("_Sim_/Fault/" + tag, False))
		writes.append(("_Sim_/Request/HoldLine", False))
		writes.append(("_Sim_/Request/QaRelease", "ALL"))
		writes.append(("_Sim_/SpeedFactor", DEFAULT_SPEED))
		writes.append(("_Sim_/FermentAccel", DEFAULT_ACCEL))
		writes.append(("Schedule/BrewsPerDay", DEFAULT_BREWS))
		writes.append(("Schedule/Queue", ",".join(RECIPES)))
		writes.append(("_Sim_/State/NextStartAbs", 0.0))
		writes.append(("_Sim_/Scenario", "normal"))
		_write(writes)
		return _result(True, "restoring: faults cleared, line released, QA holds released, %d brews per day, speed %d, ferment acceleration %d, scenario normal" % (DEFAULT_BREWS, DEFAULT_SPEED, DEFAULT_ACCEL))
	except Exception as e:
		return _result(False, "restore failed: %s" % e)


def start_batch(recipe):
	try:
		if recipe not in RECIPES:
			return _result(False, "recipe must be one of %s" % ", ".join(RECIPES))
		st, err = _enabled_or("start_batch")
		if err:
			return err
		if st["pending"]["start_batch"]:
			return _result(False, "a batch start is already waiting for the mill and mash tun")
		free = 0
		for n in range(1, NFV + 1):
			f = st["cellar"]["fv"]["FV%02d" % n]
			if f["phase"] == "EMPTY" and not f["batch"]:
				free += 1
		if free == 0:
			return _result(False, "no free fermenter: the cellar is full")
		_write([("_Sim_/Request/StartBatch", str(recipe))])
		return _result(True, "%s will start as soon as the mill and mash tun are free" % recipe)
	except Exception as e:
		return _result(False, "start_batch failed: %s" % e)


def set_schedule(brews_per_day, recipes):
	try:
		if not _is_int(brews_per_day) or brews_per_day < 1 or brews_per_day > 6:
			return _result(False, "brews_per_day must be an integer 1-6")
		if isinstance(recipes, basestring):
			recipes = [x.strip() for x in recipes.split(",") if x.strip()]
		if not isinstance(recipes, (list, tuple)) or len(recipes) == 0:
			return _result(False, "recipes must be a non-empty list of %s" % ", ".join(RECIPES))
		for r in recipes:
			if r not in RECIPES:
				return _result(False, "unknown recipe '%s' (use %s)" % (r, ", ".join(RECIPES)))
		st, err = _enabled_or("set_schedule")
		if err:
			return err
		_write([("Schedule/BrewsPerDay", int(brews_per_day)), ("Schedule/Queue", ",".join([str(x) for x in recipes])),
				("_Sim_/State/NextStartAbs", 0.0)])
		return _result(True, "%d brews per day, recipe queue %s" % (brews_per_day, ",".join(recipes)))
	except Exception as e:
		return _result(False, "set_schedule failed: %s" % e)


def set_speed(f):
	try:
		if not _is_number(f):
			return _result(False, "f must be a number")
		if f < MIN_SPEED or f > MAX_SPEED:
			return _result(False, "f must be between %s and %s" % (MIN_SPEED, MAX_SPEED))
		_write([("_Sim_/SpeedFactor", float(f))])
		return _result(True, "speed factor set to %s (24 h in %.1f real minutes)" % (f, 1440.0 / f))
	except Exception as e:
		return _result(False, "set_speed failed: %s" % e)


def set_ferment_accel(x):
	try:
		if not _is_number(x):
			return _result(False, "x must be a number")
		if x < 1.0 or x > MAX_ACCEL:
			return _result(False, "x must be between 1 and %s" % MAX_ACCEL)
		_write([("_Sim_/FermentAccel", float(x))])
		return _result(True, "fermentation acceleration set to %s" % x)
	except Exception as e:
		return _result(False, "set_ferment_accel failed: %s" % e)


def hold_line():
	try:
		st, err = _enabled_or("hold_line")
		if err:
			return err
		if st["line"]["held"]:
			return _result(False, "the line is already held")
		_write([("_Sim_/Request/HoldLine", True)])
		return _result(True, "packaging line held: it stops at the next tick and keeps its batch")
	except Exception as e:
		return _result(False, "hold_line failed: %s" % e)


def resume_line():
	try:
		st, err = _enabled_or("resume_line")
		if err:
			return err
		if not st["line"]["held"]:
			return _result(False, "the line is not held")
		_write([("_Sim_/Request/HoldLine", False)])
		return _result(True, "packaging line released")
	except Exception as e:
		return _result(False, "resume_line failed: %s" % e)


def changeover(fmt):
	try:
		if fmt not in ("CAN", "KEG"):
			return _result(False, "fmt must be CAN or KEG")
		st, err = _enabled_or("changeover")
		if err:
			return err
		if st["line"]["state"] != "IDLE" or st["line"]["batch"]:
			return _result(False, "the line is busy: a changeover needs it idle with no batch")
		if st["line"]["format"] == fmt:
			return _result(False, "the line is already on %s" % fmt)
		_write([("_Sim_/Request/Changeover", str(fmt))])
		return _result(True, "changeover to %s starts (45 s)" % fmt)
	except Exception as e:
		return _result(False, "changeover failed: %s" % e)


def inject_fault(name):
	try:
		if name not in FAULT_TAGS:
			return _result(False, "fault must be one of %s" % ", ".join(sorted(FAULT_TAGS.keys())))
		st, err = _enabled_or("inject_fault")
		if err:
			return err
		if name in st["faults"]:
			return _result(False, "fault %s is already active" % name)
		if name in FAULT_SCENARIO:
			if st["scenario"] != "normal" and st["scenario"] != FAULT_SCENARIO[name]:
				return _result(False, "scenario %s is running; set it to normal first" % st["scenario"])
			if st["scenario"] == "normal":
				_write([("_Sim_/Scenario", FAULT_SCENARIO[name])])
				return _result(True, "fault %s injected (scenario %s starts)" % (name, FAULT_SCENARIO[name]))
		_write([("_Sim_/Fault/" + FAULT_TAGS[name], True)])
		return _result(True, "fault %s injected" % name)
	except Exception as e:
		return _result(False, "inject_fault failed: %s" % e)


def clear_fault(name):
	try:
		if name not in FAULT_TAGS:
			return _result(False, "fault must be one of %s" % ", ".join(sorted(FAULT_TAGS.keys())))
		st, err = _enabled_or("clear_fault")
		if err:
			return err
		if name not in st["faults"]:
			return _result(False, "fault %s is not active" % name)
		_write([("_Sim_/Fault/" + FAULT_TAGS[name], False)])
		return _result(True, "fault %s cleared" % name)
	except Exception as e:
		return _result(False, "clear_fault failed: %s" % e)


def glycol_restore():
	return clear_fault("glycol_failure")


def cip(unit):
	try:
		u = _unit(unit)
		if u is None:
			return _result(False, "unit must be FV01-FV12, BBT1-BBT4 or LINE")
		st, err = _enabled_or("cip")
		if err:
			return err
		if st["pending"]["cip"]:
			return _result(False, "a CIP request is already waiting")
		if u == "LINE":
			if st["line"]["state"] != "IDLE" or st["line"]["batch"]:
				return _result(False, "the line is busy")
		elif u.startswith("FV"):
			f = st["cellar"]["fv"][u]
			if f["phase"] != "EMPTY" or f["batch"]:
				return _result(False, "%s is not empty (phase %s)" % (u, f["phase"]))
		else:
			f = st["cellar"]["bbt"][u]
			if f["phase"] != "EMPTY" or f["batch"]:
				return _result(False, "%s is not empty (phase %s)" % (u, f["phase"]))
		_write([("_Sim_/Request/Cip", u)])
		return _result(True, "CIP of %s queued" % u)
	except Exception as e:
		return _result(False, "cip failed: %s" % e)


def qa_release(batch):
	try:
		st, err = _enabled_or("qa_release")
		if err:
			return err
		b = _find_batch(st, batch)
		if b is None:
			return _result(False, "unknown batch '%s'" % batch)
		if b["qa"] != "HOLD":
			return _result(False, "batch %s is not on QA hold (QA status %s)" % (b["id"], b["qa"]))
		if st["pending"]["qa_release"]:
			return _result(False, "a release is already waiting")
		_write([("_Sim_/Request/QaRelease", str(b["id"]))])
		return _result(True, "batch %s released from QA hold" % b["id"])
	except Exception as e:
		return _result(False, "qa_release failed: %s" % e)


def qa_dump(batch):
	try:
		st, err = _enabled_or("qa_dump")
		if err:
			return err
		b = _find_batch(st, batch)
		if b is None:
			return _result(False, "unknown batch '%s'" % batch)
		if b["phase"] not in ("FERMENTATION", "DIACETYL_REST", "CRASH", "CONDITIONING", "CARBONATING", "READY"):
			return _result(False, "batch %s cannot be dumped in phase %s (only beer in a tank)" % (b["id"], b["phase"]))
		if st["pending"]["qa_dump"]:
			return _result(False, "a dump is already waiting")
		_write([("_Sim_/Request/QaDump", str(b["id"]))])
		return _result(True, "batch %s will be dumped to drain; its tank goes to CIP" % b["id"])
	except Exception as e:
		return _result(False, "qa_dump failed: %s" % e)
