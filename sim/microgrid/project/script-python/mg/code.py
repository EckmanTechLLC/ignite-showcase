# Campus Microgrid scenario / control API (ADR-005 Amendment A1).
# Called through POST /script/library {"project": "demo", "path": "mg.<fn>", "args": [...]}.
# Every command writes [default]MG/_Sim_/* tags (plus the BESS Mode, PV curtailment setpoints and EV Smart flags,
# which the operator owns); the 1 s mg_sim timer does the work.
# Every function returns {ok, message, state}; state is the pre-command state (the timer has not reacted yet).

BASE = "[default]MG/"
SCENARIOS = ["normal", "grid_outage", "cloud_front_ev_rush", "peak_shave_day", "inverter_fault"]
MODES = ["PEAK_SHAVE", "SELF_CONSUME", "BACKUP", "IDLE"]
DEFAULT_MODES = {1: "PEAK_SHAVE", 2: "SELF_CONSUME"}
ARRAYS = [1, 2, 3, 4]
INVERTERS = ["A", "B"]
CHARGERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
ARRAY_AC_KW = 150.0
MIN_SPEED = 1.0
MAX_SPEED = 600.0

_KEYS = [
	"Time/HourOfDay", "Time/DayIndex", "Time/Season", "Time/IsWeekend", "Time/Cloudiness", "Time/IrradianceWm2",
	"Time/AmbientTempC", "Time/TariffBand", "Time/TariffRate",
	"KPI/Mode", "KPI/NetLoadkW", "KPI/PVTotalkW", "KPI/BESSTotalkW", "KPI/PVFractionPct", "KPI/SelfSufficiencyPct",
	"KPI/TodayPVkWh", "KPI/TodaySavingsUSD", "KPI/TodayCO2AvoidedKg", "KPI/ActiveAlarms",
	"Grid/Available", "Grid/Islanded", "Grid/ImportkW", "Grid/ExportkW", "Grid/VoltageV", "Grid/FrequencyHz",
	"Grid/TodayCostUSD", "Grid/BaselineCostUSD", "Grid/DemandkW", "Grid/DemandLimitkW",
	"Loads/TotalkW", "Loads/CriticalkW", "EV/TotalkW", "EV/ActiveSessions",
	"BESS/B1/SOCPct", "BESS/B1/kW", "BESS/B1/Mode", "BESS/B1/State",
	"BESS/B2/SOCPct", "BESS/B2/kW", "BESS/B2/Mode", "BESS/B2/State",
	"Genset/State", "Genset/kW", "Genset/FuelPct", "Genset/StartCountdownS",
	"PV/A1/Curtailed", "PV/A2/Curtailed", "PV/A3/Curtailed", "PV/A4/Curtailed",
	"PV/A1/CurtailSetpointkW", "PV/A2/CurtailSetpointkW", "PV/A3/CurtailSetpointkW", "PV/A4/CurtailSetpointkW",
	"Forecast/PVkW", "Forecast/LoadkW",
	"_Sim_/Enabled", "_Sim_/Scenario", "_Sim_/ScenarioStep", "_Sim_/SpeedFactor", "_Sim_/Cloudiness",
	"_Sim_/Fault/GridOut", "_Sim_/Fault/Charger", "_Sim_/Fault/BESS/B1", "_Sim_/Fault/BESS/B2",
	"_Sim_/TickCount", "_Sim_/LastTickMs", "_Sim_/LastError",
]
for _a in ARRAYS:
	for _i in INVERTERS:
		_KEYS.append("_Sim_/Fault/Inv/A%d%s" % (_a, _i))
		_KEYS.append("PV/A%d/Inverter/%s/State" % (_a, _i))
for _c in CHARGERS:
	_KEYS.append("EV/C%02d/Smart" % _c)


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
	pv = {}
	for a in ARRAYS:
		pv["A%d" % a] = {
			"curtailed": bool(r["PV/A%d/Curtailed" % a]),
			"setpoint_kw": _num(r["PV/A%d/CurtailSetpointkW" % a]),
			"inverters": {
				"A": r["PV/A%d/Inverter/A/State" % a],
				"B": r["PV/A%d/Inverter/B/State" % a],
			},
		}
	inv_faults = []
	for a in ARRAYS:
		for i in INVERTERS:
			if r["_Sim_/Fault/Inv/A%d%s" % (a, i)]:
				inv_faults.append("A%d%s" % (a, i))
	smart = 0
	for c in CHARGERS:
		if r["EV/C%02d/Smart" % c]:
			smart += 1
	return {
		"mode": r["KPI/Mode"],
		"scenario": r["_Sim_/Scenario"],
		"scenario_step": r["_Sim_/ScenarioStep"],
		"speed": r["_Sim_/SpeedFactor"],
		"enabled": bool(r["_Sim_/Enabled"]),
		"time": {
			"hour": _num(r["Time/HourOfDay"], 2), "day": r["Time/DayIndex"], "season": r["Time/Season"],
			"weekend": bool(r["Time/IsWeekend"]), "cloudiness": _num(r["Time/Cloudiness"], 2),
			"cloud_override": _num(r["_Sim_/Cloudiness"], 2), "irradiance_wm2": _num(r["Time/IrradianceWm2"], 0),
			"ambient_c": _num(r["Time/AmbientTempC"]), "tariff_band": r["Time/TariffBand"],
			"tariff_rate": _num(r["Time/TariffRate"], 3),
		},
		"kpi": {
			"net_load_kw": _num(r["KPI/NetLoadkW"]), "pv_kw": _num(r["KPI/PVTotalkW"]),
			"bess_kw": _num(r["KPI/BESSTotalkW"]), "pv_fraction_pct": _num(r["KPI/PVFractionPct"]),
			"self_sufficiency_pct": _num(r["KPI/SelfSufficiencyPct"]), "today_pv_kwh": _num(r["KPI/TodayPVkWh"]),
			"today_savings_usd": _num(r["KPI/TodaySavingsUSD"], 2),
			"today_co2_avoided_kg": _num(r["KPI/TodayCO2AvoidedKg"], 2), "active_alarms": r["KPI/ActiveAlarms"],
			"forecast_pv_kw": _num(r["Forecast/PVkW"]), "forecast_load_kw": _num(r["Forecast/LoadkW"]),
		},
		"grid": {
			"available": bool(r["Grid/Available"]), "islanded": bool(r["Grid/Islanded"]),
			"import_kw": _num(r["Grid/ImportkW"]), "export_kw": _num(r["Grid/ExportkW"]),
			"voltage_v": _num(r["Grid/VoltageV"]), "frequency_hz": _num(r["Grid/FrequencyHz"], 2),
			"demand_kw": _num(r["Grid/DemandkW"]), "demand_limit_kw": _num(r["Grid/DemandLimitkW"], 0),
			"today_cost_usd": _num(r["Grid/TodayCostUSD"], 2), "baseline_cost_usd": _num(r["Grid/BaselineCostUSD"], 2),
		},
		"loads": {
			"total_kw": _num(r["Loads/TotalkW"]), "critical_kw": _num(r["Loads/CriticalkW"]),
			"ev_kw": _num(r["EV/TotalkW"]), "ev_sessions": r["EV/ActiveSessions"], "ev_smart_chargers": smart,
		},
		"bess": {
			"B1": {"soc_pct": _num(r["BESS/B1/SOCPct"]), "kw": _num(r["BESS/B1/kW"]), "mode": r["BESS/B1/Mode"],
				   "state": r["BESS/B1/State"]},
			"B2": {"soc_pct": _num(r["BESS/B2/SOCPct"]), "kw": _num(r["BESS/B2/kW"]), "mode": r["BESS/B2/Mode"],
				   "state": r["BESS/B2/State"]},
		},
		"genset": {
			"state": r["Genset/State"], "kw": _num(r["Genset/kW"]), "fuel_pct": _num(r["Genset/FuelPct"], 2),
			"start_countdown_s": _num(r["Genset/StartCountdownS"]),
		},
		"pv": pv,
		"faults": {
			"grid_out": bool(r["_Sim_/Fault/GridOut"]), "inverters": inv_faults, "charger": r["_Sim_/Fault/Charger"],
			"bess_offline": [b for b in ("B1", "B2") if r["_Sim_/Fault/BESS/" + b]],
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


def _bess_no(bess):
	# accepts 1, 2, "1", "2", "B1", "B2"
	if _is_int(bess) and bess in (1, 2):
		return int(bess)
	if isinstance(bess, basestring):
		t = bess.strip().upper()
		if t in ("1", "B1"):
			return 1
		if t in ("2", "B2"):
			return 2
	return None


def _inv_letter(inv):
	if isinstance(inv, basestring) and inv.strip().upper() in INVERTERS:
		return inv.strip().upper()
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
		writes = [("_Sim_/Fault/GridOut", False), ("_Sim_/Fault/Charger", 0), ("_Sim_/Fault/BESS/B1", False),
				  ("_Sim_/Fault/BESS/B2", False), ("_Sim_/Cloudiness", -1.0)]
		for a in ARRAYS:
			for i in INVERTERS:
				writes.append(("_Sim_/Fault/Inv/A%d%s" % (a, i), False))
			writes.append(("PV/A%d/CurtailSetpointkW" % a, ARRAY_AC_KW))
		for c in CHARGERS:
			writes.append(("EV/C%02d/Smart" % c, True))
		if not st["grid"]["islanded"]:
			writes.append(("BESS/B1/Mode", DEFAULT_MODES[1]))
			writes.append(("BESS/B2/Mode", DEFAULT_MODES[2]))
		writes.append(("_Sim_/Scenario", "normal"))
		_write(writes)
		return _result(True, "restoring: faults cleared, curtailment and cloud override released, smart charging on, BESS modes default, scenario normal")
	except Exception as e:
		return _result(False, "restore failed: %s" % e)


def grid_outage():
	try:
		st, err = _enabled_or("grid_outage")
		if err:
			return err
		if st["faults"]["grid_out"]:
			return _result(False, "the grid is already out")
		_write([("_Sim_/Fault/GridOut", True), ("_Sim_/Scenario", "grid_outage")])
		return _result(True, "grid lost: the campus islands, the BESS forms the grid, the genset starts, PV curtails to balance")
	except Exception as e:
		return _result(False, "grid_outage failed: %s" % e)


def grid_restore():
	try:
		st, err = _enabled_or("grid_restore")
		if err:
			return err
		if not st["faults"]["grid_out"]:
			return _result(False, "the grid is not out")
		_write([("_Sim_/Fault/GridOut", False)])
		return _result(True, "grid restored; the campus resynchronises after the delay, then the genset cools down")
	except Exception as e:
		return _result(False, "grid_restore failed: %s" % e)


def set_mode(bess, mode):
	try:
		n = _bess_no(bess)
		if n is None:
			return _result(False, "bess must be 1 or 2 (or 'B1' / 'B2')")
		if mode not in MODES:
			return _result(False, "mode must be one of %s" % ", ".join(MODES))
		st, err = _enabled_or("set_mode")
		if err:
			return err
		if st["grid"]["islanded"]:
			return _result(False, "the campus is islanded: the BESS is grid-forming until resync")
		_write([("BESS/B%d/Mode" % n, str(mode))])
		return _result(True, "BESS B%d mode set to %s" % (n, mode))
	except Exception as e:
		return _result(False, "set_mode failed: %s" % e)


def set_cloudiness(x):
	try:
		st, err = _enabled_or("set_cloudiness")
		if err:
			return err
		if x is None or (_is_number(x) and x < 0):
			_write([("_Sim_/Cloudiness", -1.0)])
			return _result(True, "cloudiness override released: automatic clouds and fronts")
		if not _is_number(x) or x > 1:
			return _result(False, "x must be a number between 0 and 1 (negative or null releases the override)")
		_write([("_Sim_/Cloudiness", float(x))])
		return _result(True, "cloudiness held at %s" % x)
	except Exception as e:
		return _result(False, "set_cloudiness failed: %s" % e)


def set_hour(h):
	try:
		if not _is_number(h) or h < 0 or h >= 24:
			return _result(False, "h must be a number in [0, 24)")
		st, err = _enabled_or("set_hour")
		if err:
			return err
		_write([("_Sim_/SetHour", float(h))])
		return _result(True, "clock jumps to %s h on the next tick; today's totals restart" % h)
	except Exception as e:
		return _result(False, "set_hour failed: %s" % e)


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


def inverter_fault(array, inv, on):
	try:
		if not _is_int(array) or array not in ARRAYS:
			return _result(False, "array must be 1-4")
		letter = _inv_letter(inv)
		if letter is None:
			return _result(False, "inv must be 'A' or 'B'")
		if not isinstance(on, bool):
			return _result(False, "on must be true or false")
		st, err = _enabled_or("inverter_fault")
		if err:
			return err
		key = "A%d%s" % (array, letter)
		if on:
			_write([("_Sim_/Fault/Inv/" + key, True)])
			if st["scenario"] == "normal":
				_write([("_Sim_/Scenario", "inverter_fault")])
			return _result(True, "inverter %s faulted" % key)
		if key not in st["faults"]["inverters"]:
			return _result(False, "inverter %s is not faulted" % key)
		_write([("_Sim_/Fault/Inv/" + key, False)])
		return _result(True, "inverter %s fault cleared" % key)
	except Exception as e:
		return _result(False, "inverter_fault failed: %s" % e)


def curtail_pv(array, kw):
	try:
		if not _is_int(array) or array not in ARRAYS:
			return _result(False, "array must be 1-4")
		st, err = _enabled_or("curtail_pv")
		if err:
			return err
		if kw is None:
			kw = ARRAY_AC_KW
		if not _is_number(kw) or kw < 0 or kw > ARRAY_AC_KW:
			return _result(False, "kw must be between 0 and %s (%s or null = no limit)" % (ARRAY_AC_KW, ARRAY_AC_KW))
		_write([("PV/A%d/CurtailSetpointkW" % array, float(kw))])
		if kw >= ARRAY_AC_KW:
			return _result(True, "array A%d curtailment released" % array)
		return _result(True, "array A%d limited to %s kW AC" % (array, kw))
	except Exception as e:
		return _result(False, "curtail_pv failed: %s" % e)


def ev_smart(on):
	try:
		if not isinstance(on, bool):
			return _result(False, "on must be true or false")
		st, err = _enabled_or("ev_smart")
		if err:
			return err
		pairs = [("EV/C%02d/Smart" % c, on) for c in CHARGERS]
		res = system.tag.writeBlocking([BASE + k for k, v in pairs], [v for k, v in pairs])
		for r in res:
			if not r.isGood():
				raise Exception("write failed: %s" % r)
		if on:
			return _result(True, "smart charging on: chargers accept curtailment on grid stress")
		return _result(True, "smart charging off: chargers ignore grid stress")
	except Exception as e:
		return _result(False, "ev_smart failed: %s" % e)


def charger_fault(n, on):
	try:
		if not _is_int(n) or n not in CHARGERS:
			return _result(False, "n must be a charger number 1-10")
		if not isinstance(on, bool):
			return _result(False, "on must be true or false")
		st, err = _enabled_or("charger_fault")
		if err:
			return err
		if on:
			_write([("_Sim_/Fault/Charger", int(n))])
			return _result(True, "charger C%02d faulted" % n)
		if st["faults"]["charger"] != n:
			return _result(False, "charger C%02d is not faulted" % n)
		_write([("_Sim_/Fault/Charger", 0)])
		return _result(True, "charger C%02d fault cleared" % n)
	except Exception as e:
		return _result(False, "charger_fault failed: %s" % e)
