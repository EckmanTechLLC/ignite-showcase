# Launch Operations sequencer / scenario API (ADR-005 section 3/6).
# Called through POST /script/library {"project": "demo", "path": "launch.<fn>", "args": [...]}.
# Every command writes only [default]Launch/_Sim_/* tags; the 1 s launch_sim timer does the work.
# status() returns the state dict itself; every other function returns {ok, message, state}.

BASE = "[default]Launch/"
CONSOLES = ["Propellant", "GSE", "Range", "Weather", "Vehicle", "LaunchDirector"]
SCENARIOS = ["nominal", "hold_t40s", "lox_leak_abort", "weather_scrub"]
FAULTS = {"LOXLeak": "_Sim_/Fault/LOXLeak", "WeatherScrub": "_Sim_/Fault/WeatherScrub"}
HOLDABLE = ["CHILLDOWN", "LOADING", "TERMINAL_COUNT"]
ABORTABLE = ["CHILLDOWN", "LOADING", "HOLD", "TERMINAL_COUNT", "IGNITION"]
RECYCLABLE = ["HOLD", "ABORT", "SAFING", "ORBIT"]
MIN_T = -3600
MAX_T = -30
MIN_SPEED = 0.25
MAX_SPEED = 20.0

_KEYS = [
	"Clock/TMinusSeconds", "Clock/ClockRunning", "Clock/Phase", "Clock/HoldReason", "Clock/NextHoldAtSeconds",
	"Clock/CycleCount",
	"Clock/GoNoGo/Propellant", "Clock/GoNoGo/GSE", "Clock/GoNoGo/Range", "Clock/GoNoGo/Weather",
	"Clock/GoNoGo/Vehicle", "Clock/GoNoGo/LaunchDirector",
	"_Sim_/Enabled", "_Sim_/Scenario", "_Sim_/ScenarioStep", "_Sim_/SpeedFactor", "_Sim_/AutoCycle",
	"_Sim_/StartTMinus", "_Sim_/TickCount", "_Sim_/LastError", "_Sim_/Fault/LOXLeak", "_Sim_/Fault/WeatherScrub",
	"_Sim_/Cmd/Pending",
	"Propellant/LOX/TankLevelPct", "Propellant/CH4/TankLevelPct", "Propellant/LOX/PressureBar",
	"Weather/WindSpeedMS",
]


def _label(t):
	sign = "-"
	if t >= 0:
		sign = "+"
	a = abs(int(t))
	return "T%s%02d:%02d:%02d" % (sign, a // 3600, (a % 3600) // 60, a % 60)


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


def _state(raw=None):
	r = raw
	if r is None:
		r = _read(_KEYS)
	t = r["Clock/TMinusSeconds"]
	if t is None:
		t = 0
	go = {}
	for c in CONSOLES:
		go[c] = bool(r["Clock/GoNoGo/" + c])
	phase = r["Clock/Phase"]
	enabled = bool(r["_Sim_/Enabled"])
	pending = bool(r["_Sim_/Cmd/Pending"])
	nogo = [c for c in CONSOLES[:5] if not go[c]]
	can = {}
	can["start_count"] = bool(enabled and phase == "IDLE" and not pending)
	can["hold"] = bool(enabled and phase in HOLDABLE and t <= -10 and not pending)
	can["resume"] = bool(enabled and phase == "HOLD" and not nogo and not pending)
	can["abort"] = bool(enabled and phase in ABORTABLE and not pending)
	can["recycle"] = bool(enabled and phase in RECYCLABLE and not pending)
	return {
		"phase": phase,
		"t_minus": int(t),
		"t_minus_label": _label(t),
		"clock_running": bool(r["Clock/ClockRunning"]),
		"hold_reason": r["Clock/HoldReason"],
		"next_hold_at": r["Clock/NextHoldAtSeconds"],
		"cycle": r["Clock/CycleCount"],
		"scenario": r["_Sim_/Scenario"],
		"scenario_step": r["_Sim_/ScenarioStep"],
		"speed": r["_Sim_/SpeedFactor"],
		"enabled": enabled,
		"auto_cycle": bool(r["_Sim_/AutoCycle"]),
		"start_t_minus": r["_Sim_/StartTMinus"],
		"go": go,
		"no_go": nogo,
		"faults": {"LOXLeak": bool(r["_Sim_/Fault/LOXLeak"]), "WeatherScrub": bool(r["_Sim_/Fault/WeatherScrub"])},
		"lox_level_pct": r["Propellant/LOX/TankLevelPct"],
		"ch4_level_pct": r["Propellant/CH4/TankLevelPct"],
		"lox_pressure_bar": r["Propellant/LOX/PressureBar"],
		"wind_ms": r["Weather/WindSpeedMS"],
		"tick_count": r["_Sim_/TickCount"],
		"last_error": r["_Sim_/LastError"],
		"command_pending": pending,
		"can": can,
	}


def _result(ok, message, raw=None):
	return {"ok": bool(ok), "message": message, "state": _state(raw)}


def _is_number(x):
	return isinstance(x, (int, long, float)) and not isinstance(x, bool)


def _reason(reason, default):
	if reason is None or reason == "":
		return default
	if not isinstance(reason, basestring):
		return None
	r = str(reason).strip()
	if len(r) > 120:
		return None
	return r or default


def status():
	return _state()


def start_count(t_minus=None):
	try:
		st = _state()
		if not st["enabled"]:
			return _result(False, "simulation is disabled (_Sim_/Enabled is false)")
		if st["phase"] != "IDLE":
			return _result(False, "count already running (phase %s); recycle first" % st["phase"])
		if st["command_pending"]:
			return _result(False, "a command is still pending; try again in a second")
		if t_minus is None:
			t = st["start_t_minus"]
		elif not _is_number(t_minus):
			return _result(False, "t_minus must be a number of seconds")
		else:
			t = int(t_minus)
		if t < MIN_T or t > MAX_T:
			return _result(False, "t_minus must be between %d and %d seconds" % (MIN_T, MAX_T))
		_write([("_Sim_/Cmd/Arg", str(t)), ("_Sim_/Cmd/Pending", "START")])
		return _result(True, "count start queued at %s" % _label(t))
	except Exception as e:
		return _result(False, "start_count failed: %s" % e)


def resume():
	try:
		st = _state()
		if not st["enabled"]:
			return _result(False, "simulation is disabled")
		if st["phase"] != "HOLD":
			return _result(False, "not in a hold (phase %s)" % st["phase"])
		if st["command_pending"]:
			return _result(False, "a command is still pending; try again in a second")
		if st["no_go"]:
			return _result(False, "cannot resume: NO-GO from %s" % ", ".join(st["no_go"]))
		_write([("_Sim_/Cmd/Pending", "RESUME")])
		return _result(True, "resume queued")
	except Exception as e:
		return _result(False, "resume failed: %s" % e)


def hold(reason=None):
	try:
		st = _state()
		r = _reason(reason, "Manual hold")
		if r is None:
			return _result(False, "reason must be text of at most 120 characters")
		if not st["enabled"]:
			return _result(False, "simulation is disabled")
		if st["phase"] == "HOLD":
			return _result(False, "already holding")
		if st["phase"] not in HOLDABLE or st["t_minus"] > -10:
			return _result(False, "cannot hold in phase %s at %s" % (st["phase"], st["t_minus_label"]))
		if st["command_pending"]:
			return _result(False, "a command is still pending; try again in a second")
		_write([("_Sim_/Cmd/Arg", r), ("_Sim_/Cmd/Pending", "HOLD")])
		return _result(True, "hold queued: %s" % r)
	except Exception as e:
		return _result(False, "hold failed: %s" % e)


def abort(reason=None):
	try:
		st = _state()
		r = _reason(reason, "Operator abort")
		if r is None:
			return _result(False, "reason must be text of at most 120 characters")
		if not st["enabled"]:
			return _result(False, "simulation is disabled")
		if st["phase"] not in ABORTABLE:
			return _result(False, "cannot abort in phase %s" % st["phase"])
		if st["command_pending"]:
			return _result(False, "a command is still pending; try again in a second")
		_write([("_Sim_/Cmd/Arg", r), ("_Sim_/Cmd/Pending", "ABORT")])
		return _result(True, "abort queued: %s" % r)
	except Exception as e:
		return _result(False, "abort failed: %s" % e)


def recycle():
	try:
		st = _state()
		if not st["enabled"]:
			return _result(False, "simulation is disabled")
		if st["phase"] not in RECYCLABLE:
			return _result(False, "cannot recycle in phase %s" % st["phase"])
		if st["command_pending"]:
			return _result(False, "a command is still pending; try again in a second")
		_write([("_Sim_/Cmd/Arg", "Recycle requested"), ("_Sim_/Cmd/Pending", "RECYCLE")])
		return _result(True, "recycle queued")
	except Exception as e:
		return _result(False, "recycle failed: %s" % e)


def set_scenario(name):
	try:
		if not isinstance(name, basestring) or str(name) not in SCENARIOS:
			return _result(False, "scenario must be one of: %s" % ", ".join(SCENARIOS))
		_write([("_Sim_/ScenarioStep", 0), ("_Sim_/Scenario", str(name))])
		return _result(True, "scenario set to %s" % name)
	except Exception as e:
		return _result(False, "set_scenario failed: %s" % e)


def set_speed(factor):
	try:
		if not _is_number(factor):
			return _result(False, "factor must be a number")
		f = float(factor)
		if f != f or f < MIN_SPEED or f > MAX_SPEED:
			return _result(False, "factor must be between %s and %s" % (MIN_SPEED, MAX_SPEED))
		_write([("_Sim_/SpeedFactor", f)])
		return _result(True, "speed factor set to %s" % f)
	except Exception as e:
		return _result(False, "set_speed failed: %s" % e)


def set_go(console, value):
	try:
		if not isinstance(console, basestring) or str(console) not in CONSOLES:
			return _result(False, "console must be one of: %s" % ", ".join(CONSOLES))
		if value is None:
			v = "AUTO"
		elif isinstance(value, bool):
			if value:
				v = "GO"
			else:
				v = "NOGO"
		elif isinstance(value, basestring) and str(value).upper() in ("GO", "NOGO", "AUTO"):
			v = str(value).upper()
		else:
			return _result(False, "value must be true, false, null (auto), or GO / NOGO / AUTO")
		_write([("_Sim_/GoOverride/" + str(console), v)])
		return _result(True, "%s override set to %s" % (console, v))
	except Exception as e:
		return _result(False, "set_go failed: %s" % e)


def inject_fault(name, on):
	try:
		if not isinstance(name, basestring) or str(name) not in FAULTS:
			return _result(False, "fault must be one of: %s" % ", ".join(sorted(FAULTS.keys())))
		if not isinstance(on, bool):
			return _result(False, "on must be true or false")
		_write([(FAULTS[str(name)], on)])
		return _result(True, "fault %s %s" % (name, "injected" if on else "cleared"))
	except Exception as e:
		return _result(False, "inject_fault failed: %s" % e)