# Data Center scenario / control API (ADR-005 section 4/6).
# Called through POST /script/library {"project": "demo", "path": "dc.<fn>", "args": [...]}.
# Every command writes [default]DC/_Sim_/* tags (restore() also clears the PDU BreakerTripped flags);
# the 1 s dc_sim timer does the work.
# Every function returns {ok, message, state}; state is the pre-command state (the timer has not reacted yet).

BASE = "[default]DC/"
SCENARIOS = ["normal", "utility_loss", "crah_failure", "rack_migration"]
PROFILES = ["diurnal", "flat", "bursty"]
CRAH_UNITS = [1, 2, 3, 4]
PDUS = ["A1", "A2", "A3", "B1", "B2", "B3"]
MIN_SPEED = 0.25
MAX_SPEED = 60.0

_KEYS = [
	"Hall/Mode", "Hall/ITLoadKW", "Hall/TotalFacilityKW", "Hall/PUE", "Hall/CoolingKW", "Hall/LossesKW",
	"Hall/HeadroomPct", "Hall/HallAvgInletC", "Hall/HallMaxInletC", "Hall/ActiveAlarms",
	"Power/Utility/Available", "Power/Generator/State", "Power/Generator/FuelPct",
	"Power/Generator/StartCountdownS", "Power/Switchgear/ATSPosition",
	"Power/UPS/A/State", "Power/UPS/A/BatterySOCPct", "Power/UPS/A/RuntimeMin", "Power/UPS/A/LoadPct",
	"Power/UPS/B/State", "Power/UPS/B/BatterySOCPct", "Power/UPS/B/RuntimeMin", "Power/UPS/B/LoadPct",
	"Cooling/CRAH/1/State", "Cooling/CRAH/2/State", "Cooling/CRAH/3/State", "Cooling/CRAH/4/State",
	"_Sim_/Enabled", "_Sim_/Scenario", "_Sim_/ScenarioStep", "_Sim_/SpeedFactor", "_Sim_/WorkloadProfile",
	"_Sim_/Fault/CRAH", "_Sim_/Fault/UtilityOut", "_Sim_/TickCount", "_Sim_/LastTickMs", "_Sim_/LastError",
]


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
	crah = {}
	for n in CRAH_UNITS:
		crah[str(n)] = r["Cooling/CRAH/%d/State" % n]
	return {
		"mode": r["Hall/Mode"],
		"scenario": r["_Sim_/Scenario"],
		"scenario_step": r["_Sim_/ScenarioStep"],
		"speed": r["_Sim_/SpeedFactor"],
		"workload_profile": r["_Sim_/WorkloadProfile"],
		"enabled": bool(r["_Sim_/Enabled"]),
		"it_load_kw": _num(r["Hall/ITLoadKW"]),
		"total_facility_kw": _num(r["Hall/TotalFacilityKW"]),
		"pue": _num(r["Hall/PUE"], 3),
		"cooling_kw": _num(r["Hall/CoolingKW"]),
		"losses_kw": _num(r["Hall/LossesKW"]),
		"headroom_pct": _num(r["Hall/HeadroomPct"]),
		"avg_inlet_c": _num(r["Hall/HallAvgInletC"]),
		"max_inlet_c": _num(r["Hall/HallMaxInletC"]),
		"active_alarms": r["Hall/ActiveAlarms"],
		"utility_available": bool(r["Power/Utility/Available"]),
		"ats": r["Power/Switchgear/ATSPosition"],
		"generator": {
			"state": r["Power/Generator/State"],
			"fuel_pct": _num(r["Power/Generator/FuelPct"], 2),
			"start_countdown_s": _num(r["Power/Generator/StartCountdownS"]),
		},
		"ups": {
			"A": {"state": r["Power/UPS/A/State"], "soc_pct": _num(r["Power/UPS/A/BatterySOCPct"]),
				  "runtime_min": _num(r["Power/UPS/A/RuntimeMin"]), "load_pct": _num(r["Power/UPS/A/LoadPct"])},
			"B": {"state": r["Power/UPS/B/State"], "soc_pct": _num(r["Power/UPS/B/BatterySOCPct"]),
				  "runtime_min": _num(r["Power/UPS/B/RuntimeMin"]), "load_pct": _num(r["Power/UPS/B/LoadPct"])},
		},
		"crah": crah,
		"faults": {"crah": r["_Sim_/Fault/CRAH"], "utility_out": bool(r["_Sim_/Fault/UtilityOut"])},
		"tick_count": r["_Sim_/TickCount"],
		"last_tick_ms": r["_Sim_/LastTickMs"],
		"last_error": r["_Sim_/LastError"],
	}


def _result(ok, message, raw=None):
	return {"ok": bool(ok), "message": message, "state": _state(raw)}


def _is_number(x):
	return isinstance(x, (int, long, float)) and not isinstance(x, bool)


def _is_unit(n):
	return isinstance(n, (int, long)) and not isinstance(n, bool) and n in CRAH_UNITS


def _enabled_or(msg_prefix):
	st = _state()
	if not st["enabled"]:
		return st, _result(False, "%s: simulation is disabled (_Sim_/Enabled is false)" % msg_prefix)
	return st, None


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
		writes = [("Power/PDU/%s/BreakerTripped" % p, False) for p in PDUS]
		writes += [("_Sim_/Fault/CRAH", 0), ("_Sim_/Fault/UtilityOut", False), ("_Sim_/Scenario", "normal")]
		_write(writes)
		return _result(True, "restoring: faults cleared, breakers reset, scenario normal")
	except Exception as e:
		return _result(False, "restore failed: %s" % e)


def fail_crah(n):
	try:
		if not _is_unit(n):
			return _result(False, "n must be a CRAH unit number 1-4")
		st, err = _enabled_or("fail_crah")
		if err:
			return err
		_write([("_Sim_/Fault/CRAH", int(n)), ("_Sim_/Scenario", "crah_failure")])
		return _result(True, "CRAH %d failed" % n)
	except Exception as e:
		return _result(False, "fail_crah failed: %s" % e)


def restore_crah(n):
	try:
		if not _is_unit(n):
			return _result(False, "n must be a CRAH unit number 1-4")
		st, err = _enabled_or("restore_crah")
		if err:
			return err
		if st["faults"]["crah"] != n:
			return _result(False, "CRAH %d is not faulted" % n)
		writes = [("_Sim_/Fault/CRAH", 0)]
		if st["scenario"] == "crah_failure":
			writes.append(("_Sim_/Scenario", "normal"))
		_write(writes)
		return _result(True, "CRAH %d restored" % n)
	except Exception as e:
		return _result(False, "restore_crah failed: %s" % e)


def utility_loss():
	try:
		st, err = _enabled_or("utility_loss")
		if err:
			return err
		if st["faults"]["utility_out"]:
			return _result(False, "utility is already out")
		_write([("_Sim_/Fault/UtilityOut", True), ("_Sim_/Scenario", "utility_loss")])
		return _result(True, "utility lost")
	except Exception as e:
		return _result(False, "utility_loss failed: %s" % e)


def utility_restore():
	try:
		st, err = _enabled_or("utility_restore")
		if err:
			return err
		if not st["faults"]["utility_out"]:
			return _result(False, "utility is not out")
		writes = [("_Sim_/Fault/UtilityOut", False)]
		if st["scenario"] == "utility_loss":
			writes.append(("_Sim_/Scenario", "normal"))
		_write(writes)
		return _result(True, "utility restored; the ATS re-transfers after the stability delay")
	except Exception as e:
		return _result(False, "utility_restore failed: %s" % e)


def start_migration():
	try:
		st, err = _enabled_or("start_migration")
		if err:
			return err
		if st["scenario"] == "rack_migration":
			return _result(False, "a migration is already running; restore() first")
		_write([("_Sim_/Scenario", "rack_migration")])
		return _result(True, "rack migration started: load moves from rows A-B to E-F")
	except Exception as e:
		return _result(False, "start_migration failed: %s" % e)


def set_workload_profile(name):
	try:
		if name not in PROFILES:
			return _result(False, "profile must be one of %s" % ", ".join(PROFILES))
		_write([("_Sim_/WorkloadProfile", str(name))])
		return _result(True, "workload profile set to %s" % name)
	except Exception as e:
		return _result(False, "set_workload_profile failed: %s" % e)


def set_speed(factor):
	try:
		if not _is_number(factor):
			return _result(False, "factor must be a number")
		if factor < MIN_SPEED or factor > MAX_SPEED:
			return _result(False, "factor must be between %s and %s" % (MIN_SPEED, MAX_SPEED))
		_write([("_Sim_/SpeedFactor", float(factor))])
		return _result(True, "speed factor set to %s" % factor)
	except Exception as e:
		return _result(False, "set_speed failed: %s" % e)


def acknowledge_all():
	# Placeholder: acknowledging alarms goes through Ignite POST /alarms/acknowledge.
	try:
		st = _state()
		return _result(True, "no-op: acknowledge through /alarms/acknowledge; %s active alarms" % st["active_alarms"])
	except Exception as e:
		return _result(False, "acknowledge_all failed: %s" % e)
