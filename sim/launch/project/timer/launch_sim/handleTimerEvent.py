def handleTimerEvent():
	import math
	import random

	# Launch Operations simulation - 1 s gateway timer (ADR-005 section 3/6).
	# All state lives in tags under [default]Launch/ (see sim/launch/README.md); this module
	# keeps no state of its own. Jython 2.7 only.

	BASE = "[default]Launch/"
	LOGGER = "launch_sim"

	KEYS = [
		'Clock/TMinusSeconds',
		'Clock/ClockRunning',
		'Clock/Phase',
		'Clock/HoldReason',
		'Clock/NextHoldAtSeconds',
		'Clock/CycleCount',
		'Clock/GoNoGo/Propellant',
		'Clock/GoNoGo/GSE',
		'Clock/GoNoGo/Range',
		'Clock/GoNoGo/Weather',
		'Clock/GoNoGo/Vehicle',
		'Clock/GoNoGo/LaunchDirector',
		'Propellant/LOX/TankLevelPct',
		'Propellant/LOX/FlowKgS',
		'Propellant/LOX/TempK',
		'Propellant/LOX/PressureBar',
		'Propellant/LOX/ChilldownState',
		'Propellant/LOX/FillValveOpen',
		'Propellant/LOX/VentValveOpen',
		'Propellant/LOX/BoiloffKgS',
		'Propellant/CH4/TankLevelPct',
		'Propellant/CH4/FlowKgS',
		'Propellant/CH4/TempK',
		'Propellant/CH4/PressureBar',
		'Propellant/CH4/ChilldownState',
		'Propellant/CH4/FillValveOpen',
		'Propellant/CH4/VentValveOpen',
		'Propellant/CH4/BoiloffKgS',
		'Vehicle/Stage1/LOXPressureBar',
		'Vehicle/Stage1/CH4PressureBar',
		'Vehicle/Stage2/LOXPressureBar',
		'Vehicle/Stage2/CH4PressureBar',
		'Vehicle/BatteryVoltage',
		'Vehicle/BatterySOCPct',
		'Vehicle/AvionicsTempC',
		'Vehicle/EngineChillState',
		'Vehicle/GimbalCheckOK',
		'Vehicle/ThrustPct',
		'Vehicle/AltitudeM',
		'Vehicle/VelocityMS',
		'Vehicle/DownrangeKm',
		'Vehicle/AccelG',
		'Vehicle/MaxQ',
		'Vehicle/MECO',
		'Vehicle/StageSep',
		'Vehicle/SECO',
		'Pad/DelugeArmed',
		'Pad/DelugeFlowLpm',
		'Pad/WaterTowerLevelPct',
		'Pad/GSEPower/BusAVolts',
		'Pad/GSEPower/BusBVolts',
		'Pad/GSEPower/BusAAmps',
		'Pad/GSEPower/BusBAmps',
		'Pad/UmbilicalConnected',
		'Pad/StrongbackRetractPct',
		'Pad/FlameTrenchTempC',
		'Pad/FlameTrenchHumidityPct',
		'Pad/PadClear',
		'Weather/WindSpeedMS',
		'Weather/WindDirDeg',
		'Weather/GustMS',
		'Weather/TempC',
		'Weather/HumidityPct',
		'Weather/PressureHPa',
		'Weather/LightningDistanceKm',
		'Weather/CeilingM',
		'Weather/UpperWindsMS',
		'Weather/GoForWeather',
		'Range/RangeClear',
		'Range/TrackingLock',
		'Range/FTSArmed',
		'_Sim_/Enabled',
		'_Sim_/Scenario',
		'_Sim_/ScenarioStep',
		'_Sim_/SpeedFactor',
		'_Sim_/Seed',
		'_Sim_/TickCount',
		'_Sim_/LastTickMs',
		'_Sim_/AutoCycle',
		'_Sim_/StartTMinus',
		'_Sim_/Fault/LOXLeak',
		'_Sim_/Fault/WeatherScrub',
		'_Sim_/LastError',
		'_Sim_/Cmd/Pending',
		'_Sim_/Cmd/Arg',
		'_Sim_/GoOverride/Propellant',
		'_Sim_/GoOverride/GSE',
		'_Sim_/GoOverride/Range',
		'_Sim_/GoOverride/Weather',
		'_Sim_/GoOverride/Vehicle',
		'_Sim_/GoOverride/LaunchDirector',
		'_Sim_/State/TMinusExact',
		'_Sim_/State/PhaseTime',
		'_Sim_/State/CountTime',
		'_Sim_/State/HoldsDone',
		'_Sim_/State/HoldKind',
		'_Sim_/State/HoldIndex',
		'_Sim_/State/HoldTime',
		'_Sim_/State/HoldDwellLeft',
		'_Sim_/State/GoStableTime',
		'_Sim_/State/NoGoTime',
		'_Sim_/State/ScenarioApplied',
		'_Sim_/State/ScenarioClock',
		'_Sim_/State/FlightTime',
		'_Sim_/State/MassKg',
		'_Sim_/State/VxMS',
		'_Sim_/State/VyMS',
		'_Sim_/State/QMaxPa',
		'_Sim_/State/GustBoost',
		'_Sim_/State/OkStreak',
	]

	DEFAULTS = {
		'Clock/TMinusSeconds': -2400,
		'Clock/ClockRunning': False,
		'Clock/Phase': 'IDLE',
		'Clock/HoldReason': '',
		'Clock/NextHoldAtSeconds': -2400,
		'Clock/CycleCount': 0,
		'Clock/GoNoGo/Propellant': False,
		'Clock/GoNoGo/GSE': False,
		'Clock/GoNoGo/Range': False,
		'Clock/GoNoGo/Weather': False,
		'Clock/GoNoGo/Vehicle': False,
		'Clock/GoNoGo/LaunchDirector': False,
		'Propellant/LOX/TankLevelPct': 0.0,
		'Propellant/LOX/FlowKgS': 0.0,
		'Propellant/LOX/TempK': 294.0,
		'Propellant/LOX/PressureBar': 1.5,
		'Propellant/LOX/ChilldownState': 'WARM',
		'Propellant/LOX/FillValveOpen': False,
		'Propellant/LOX/VentValveOpen': False,
		'Propellant/LOX/BoiloffKgS': 0.0,
		'Propellant/CH4/TankLevelPct': 0.0,
		'Propellant/CH4/FlowKgS': 0.0,
		'Propellant/CH4/TempK': 294.0,
		'Propellant/CH4/PressureBar': 1.5,
		'Propellant/CH4/ChilldownState': 'WARM',
		'Propellant/CH4/FillValveOpen': False,
		'Propellant/CH4/VentValveOpen': False,
		'Propellant/CH4/BoiloffKgS': 0.0,
		'Vehicle/Stage1/LOXPressureBar': 1.2,
		'Vehicle/Stage1/CH4PressureBar': 1.2,
		'Vehicle/Stage2/LOXPressureBar': 1.2,
		'Vehicle/Stage2/CH4PressureBar': 1.2,
		'Vehicle/BatteryVoltage': 27.7,
		'Vehicle/BatterySOCPct': 90.0,
		'Vehicle/AvionicsTempC': 24.0,
		'Vehicle/EngineChillState': 'WARM',
		'Vehicle/GimbalCheckOK': False,
		'Vehicle/ThrustPct': 0.0,
		'Vehicle/AltitudeM': 0.0,
		'Vehicle/VelocityMS': 0.0,
		'Vehicle/DownrangeKm': 0.0,
		'Vehicle/AccelG': 1.0,
		'Vehicle/MaxQ': False,
		'Vehicle/MECO': False,
		'Vehicle/StageSep': False,
		'Vehicle/SECO': False,
		'Pad/DelugeArmed': False,
		'Pad/DelugeFlowLpm': 0.0,
		'Pad/WaterTowerLevelPct': 100.0,
		'Pad/GSEPower/BusAVolts': 480.0,
		'Pad/GSEPower/BusBVolts': 480.0,
		'Pad/GSEPower/BusAAmps': 40.0,
		'Pad/GSEPower/BusBAmps': 35.0,
		'Pad/UmbilicalConnected': True,
		'Pad/StrongbackRetractPct': 0.0,
		'Pad/FlameTrenchTempC': 25.0,
		'Pad/FlameTrenchHumidityPct': 40.0,
		'Pad/PadClear': False,
		'Weather/WindSpeedMS': 5.5,
		'Weather/WindDirDeg': 80.0,
		'Weather/GustMS': 7.0,
		'Weather/TempC': 22.0,
		'Weather/HumidityPct': 60.0,
		'Weather/PressureHPa': 1013.0,
		'Weather/LightningDistanceKm': 70.0,
		'Weather/CeilingM': 3000.0,
		'Weather/UpperWindsMS': 22.0,
		'Weather/GoForWeather': True,
		'Range/RangeClear': True,
		'Range/TrackingLock': True,
		'Range/FTSArmed': False,
		'_Sim_/Enabled': True,
		'_Sim_/Scenario': 'nominal',
		'_Sim_/ScenarioStep': 0,
		'_Sim_/SpeedFactor': 4.0,
		'_Sim_/Seed': 52,
		'_Sim_/TickCount': 0,
		'_Sim_/LastTickMs': 0,
		'_Sim_/AutoCycle': True,
		'_Sim_/StartTMinus': -2400,
		'_Sim_/Fault/LOXLeak': False,
		'_Sim_/Fault/WeatherScrub': False,
		'_Sim_/LastError': '',
		'_Sim_/Cmd/Pending': '',
		'_Sim_/Cmd/Arg': '',
		'_Sim_/GoOverride/Propellant': 'AUTO',
		'_Sim_/GoOverride/GSE': 'AUTO',
		'_Sim_/GoOverride/Range': 'AUTO',
		'_Sim_/GoOverride/Weather': 'AUTO',
		'_Sim_/GoOverride/Vehicle': 'AUTO',
		'_Sim_/GoOverride/LaunchDirector': 'AUTO',
		'_Sim_/State/TMinusExact': -2400.0,
		'_Sim_/State/PhaseTime': 0.0,
		'_Sim_/State/CountTime': 0.0,
		'_Sim_/State/HoldsDone': 0,
		'_Sim_/State/HoldKind': '',
		'_Sim_/State/HoldIndex': -1,
		'_Sim_/State/HoldTime': 0.0,
		'_Sim_/State/HoldDwellLeft': 0.0,
		'_Sim_/State/GoStableTime': 0.0,
		'_Sim_/State/NoGoTime': 0.0,
		'_Sim_/State/ScenarioApplied': 'nominal',
		'_Sim_/State/ScenarioClock': 0.0,
		'_Sim_/State/FlightTime': 0.0,
		'_Sim_/State/MassKg': 0.0,
		'_Sim_/State/VxMS': 0.0,
		'_Sim_/State/VyMS': 0.0,
		'_Sim_/State/QMaxPa': 0.0,
		'_Sim_/State/GustBoost': 0.0,
		'_Sim_/State/OkStreak': 0,
	}

	G0 = 9.80665
	RE = 6371000.0
	CONSOLES = ["Propellant", "GSE", "Range", "Weather", "Vehicle", "LaunchDirector"]
	ACTIVE = ("CHILLDOWN", "LOADING", "HOLD", "TERMINAL_COUNT", "IGNITION")
	FLIGHT = ("LIFTOFF", "ASCENT", "ORBIT")

	# built-in holds: (T-minus s, reason)
	HOLDS = [(-2400.0, "T-40:00 hold - go/no-go poll before propellant loading"),
			 (-600.0, "T-10:00 hold - terminal count go/no-go poll"),
			 (-40.0, "T-0:40 hold - final go/no-go poll")]
	HOLD_DWELL = 30.0        # sim s a built-in hold lasts when everything is GO
	HOLD_LIMIT = -10.0       # holds are possible until T-10 s; inside that an autosequence cutoff aborts
	NOGO_DEBOUNCE = 3.0
	GO_STABLE = 5.0
	LEAK_ABORT_AFTER = 45.0  # unresolved propellant NO-GO hold becomes an ABORT
	SCRUB_AFTER = 90.0       # unresolved weather NO-GO hold becomes a scrub (RECYCLE)
	SCENARIO_HOLD_TIMEOUT = 600.0
	IDLE_DWELL = 30.0
	ABORT_DWELL = 60.0
	SAFING_MIN = 30.0
	RECYCLE_MIN = 30.0
	ORBIT_DWELL = 20.0

	TANKS = ["LOX", "CH4"]
	TK = {
		"LOX": {"cap": 240000.0, "fmax": 210.0, "t0": 90.2, "slope": 5.5, "tau_chill": 65.0, "kb": 0.00085,
				"gp": 0.024, "pad": 1.5, "purge": 8.0},
		"CH4": {"cap": 85000.0, "fmax": 75.0, "t0": 111.7, "slope": 7.0, "tau_chill": 60.0, "kb": 0.00060,
				"gp": 0.034, "pad": 1.5, "purge": 3.0},
	}
	TAPER = 6.0              # percent of level over which the fill flow tapers off
	VENT_HI = 3.0
	VENT_LO = 2.7
	KV = 0.03                # vent conductance (1/s)
	KSEEP = 0.0004           # slow ullage seep to ambient (1/s)
	KLEAK = 0.02             # leak conductance (1/s)
	GF = 0.00002             # bar per kg of fill flow (ullage compression)
	LEAK_KGS = 40.0
	OFFLOAD_PCT_S = 0.8
	WATER_CAP_L = 800000.0
	DELUGE_LPM = 45000.0

	# ascent model (see sim/launch/README.md)
	PITCH = [(0.0, 90.0), (8.0, 89.8), (30.0, 83.3), (60.0, 58.3), (80.0, 43.7), (100.0, 34.3), (120.0, 30.8),
			 (150.0, 30.0), (160.0, 29.9), (250.0, 26.3), (350.0, 10.4), (430.0, 4.8), (480.0, 0.0)]
	T1 = 7218690.0
	T2 = 1002206.0
	THROTTLE_T0 = 62.08
	THROTTLE_T1 = 93.39
	THROTTLE_F = 0.61
	S1_PROP = 375000.0
	S1_DRY = 22000.0
	M_AFTER_SEP = 105165.0
	M0 = M_AFTER_SEP + S1_DRY + S1_PROP
	MDOT1 = S1_PROP / (150.0 - (THROTTLE_T1 - THROTTLE_T0) * (1.0 - THROTTLE_F))
	MDOT2 = T2 / (G0 * 345.0)
	T_MECO = 150.0
	T_SEP = 152.0
	T_S2 = 155.0
	T_SECO = 480.0
	CDA1 = 3.2
	CDA2 = 0.6


	def clamp(x, lo, hi):
		if x < lo:
			return lo
		if x > hi:
			return hi
		return x


	def lag(cur, target, h, tau):
		return cur + (target - cur) * (1.0 - math.exp(-h / tau))


	def fmt_t(t):
		sign = "-"
		if t >= 0:
			sign = "+"
		a = abs(int(t))
		return "T%s%02d:%02d:%02d" % (sign, a // 3600, (a % 3600) // 60, a % 60)


	def tsat(k, p):
		return TK[k]["t0"] + TK[k]["slope"] * (p - 1.013)


	def pitch_deg(t):
		for i in range(1, len(PITCH)):
			if t <= PITCH[i][0]:
				t0, a0 = PITCH[i - 1]
				t1, a1 = PITCH[i]
				return a0 + (a1 - a0) * (t - t0) / (t1 - t0)
		return PITCH[-1][1]


	def coerce(key, v):
		d = DEFAULTS[key]
		if isinstance(d, bool):
			return bool(v)
		if isinstance(d, float):
			return round(float(v), 4)
		if isinstance(d, (int, long)):
			return int(round(v))
		return str(v)


	# ----------------------------------------------------------------------------
	# state helpers

	def note(S, msg):
		S["_log"].append(msg)


	def set_phase(S, ph):
		if S["Clock/Phase"] != ph:
			note(S, "phase %s -> %s at %s" % (S["Clock/Phase"], ph, fmt_t(S["_Sim_/State/TMinusExact"])))
			S["Clock/Phase"] = ph
			S["_Sim_/State/PhaseTime"] = 0.0


	def nogo_list(S):
		out = []
		for c in CONSOLES[:5]:
			if not S["Clock/GoNoGo/" + c]:
				out.append(c)
		return out


	def next_hold(S):
		done = S["_Sim_/State/HoldsDone"]
		for i in range(len(HOLDS)):
			if not (done & (1 << i)):
				return int(HOLDS[i][0])
		return 0


	def enter_hold(S, reason, kind, idx):
		S["Clock/ClockRunning"] = False
		set_phase(S, "HOLD")
		S["Clock/HoldReason"] = reason
		S["_Sim_/State/HoldKind"] = kind
		S["_Sim_/State/HoldIndex"] = idx
		S["_Sim_/State/HoldTime"] = 0.0
		S["_Sim_/State/GoStableTime"] = 0.0
		if kind == "BUILTIN":
			S["_Sim_/State/HoldDwellLeft"] = HOLD_DWELL
			S["_Sim_/State/HoldsDone"] = S["_Sim_/State/HoldsDone"] | (1 << idx)
		note(S, "HOLD (%s): %s" % (kind, reason))


	def release_hold(S):
		S["Clock/ClockRunning"] = True
		S["Clock/HoldReason"] = ""
		S["_Sim_/State/HoldKind"] = ""
		S["_Sim_/State/HoldIndex"] = -1
		S["_Sim_/State/HoldTime"] = 0.0
		S["_Sim_/State/NoGoTime"] = 0.0
		if S["_Sim_/Scenario"] == "hold_t40s" and S["_Sim_/ScenarioStep"] == 1:
			S["_Sim_/ScenarioStep"] = 2
		note(S, "hold released")
		derive_phase(S)


	def derive_phase(S):
		T = S["_Sim_/State/TMinusExact"]
		cur = S["Clock/Phase"]
		if T >= 0.0:
			if cur in FLIGHT:
				return
			set_phase(S, "LIFTOFF")
		elif T >= -3.0:
			set_phase(S, "IGNITION")
		elif T >= -600.0:
			set_phase(S, "TERMINAL_COUNT")
		elif (S["Propellant/LOX/ChilldownState"] == "READY" and S["Propellant/CH4/ChilldownState"] == "READY"):
			set_phase(S, "LOADING")
		else:
			set_phase(S, "CHILLDOWN")


	def clear_faults(S):
		S["_Sim_/Fault/LOXLeak"] = False
		S["_Sim_/Fault/WeatherScrub"] = False
		if S["_Sim_/Scenario"] != "nominal":
			note(S, "scenario %s complete, back to nominal" % S["_Sim_/Scenario"])
		S["_Sim_/Scenario"] = "nominal"
		S["_Sim_/State/ScenarioApplied"] = "nominal"
		S["_Sim_/ScenarioStep"] = 0
		S["_Sim_/State/ScenarioClock"] = 0.0


	def reset_vehicle(S):
		for k in ("MaxQ", "MECO", "StageSep", "SECO", "GimbalCheckOK"):
			S["Vehicle/" + k] = False
		S["Vehicle/ThrustPct"] = 0.0
		S["Vehicle/AltitudeM"] = 0.0
		S["Vehicle/VelocityMS"] = 0.0
		S["Vehicle/DownrangeKm"] = 0.0
		S["Vehicle/AccelG"] = 1.0
		S["Vehicle/EngineChillState"] = "WARM"
		S["Vehicle/BatterySOCPct"] = 90.0
		S["_Sim_/State/FlightTime"] = 0.0
		S["_Sim_/State/MassKg"] = 0.0
		S["_Sim_/State/VxMS"] = 0.0
		S["_Sim_/State/VyMS"] = 0.0
		S["_Sim_/State/QMaxPa"] = 0.0
		S["Pad/UmbilicalConnected"] = True


	def holds_done_mask(t0):
		mask = 0
		for i in range(len(HOLDS)):
			if HOLDS[i][0] < t0 - 1e-9:
				mask = mask | (1 << i)
		return mask


	def begin_count(S, t0):
		S["Clock/CycleCount"] += 1
		S["_Sim_/State/TMinusExact"] = float(t0)
		S["_Sim_/State/CountTime"] = 0.0
		S["_Sim_/State/NoGoTime"] = 0.0
		S["_Sim_/State/HoldKind"] = ""
		S["_Sim_/State/HoldIndex"] = -1
		S["_Sim_/State/HoldsDone"] = holds_done_mask(t0)
		S["Clock/HoldReason"] = ""
		S["Clock/ClockRunning"] = True
		S["Range/RangeClear"] = True
		S["Range/TrackingLock"] = True
		S["Range/FTSArmed"] = False
		S["Pad/PadClear"] = True
		S["_Sim_/State/ScenarioClock"] = 0.0
		S["_Sim_/ScenarioStep"] = 0
		reset_vehicle(S)
		if t0 >= -2200.0:
			# late start: propellant loading already under way
			frac = clamp((t0 + 2190.0) / 1290.0, 0.0, 1.0)
			for k in TANKS:
				b = "Propellant/%s/" % k
				S[b + "ChilldownState"] = "READY"
				S[b + "PressureBar"] = 2.8
				S[b + "TempK"] = tsat(k, 2.8) + 0.4
				S[b + "TankLevelPct"] = 100.0 * frac
				S[b + "FlowKgS"] = 0.0
		S["Vehicle/BatterySOCPct"] = 97.0
		note(S, "count %d started at %s" % (S["Clock/CycleCount"], fmt_t(t0)))
		set_phase(S, "CHILLDOWN")
		derive_phase(S)


	def enter_abort(S, reason):
		S["Clock/ClockRunning"] = False
		S["Clock/HoldReason"] = reason
		S["_Sim_/State/HoldKind"] = ""
		S["_Sim_/State/HoldIndex"] = -1
		note(S, "ABORT: %s" % reason)
		set_phase(S, "ABORT")
		if S["_Sim_/Scenario"] == "lox_leak_abort":
			S["_Sim_/ScenarioStep"] = 3


	def enter_recycle(S, reason):
		S["Clock/ClockRunning"] = False
		S["Clock/HoldReason"] = reason
		S["_Sim_/State/HoldKind"] = ""
		S["_Sim_/State/HoldIndex"] = -1
		if S["_Sim_/State/FlightTime"] > 0.0 or S["Vehicle/MECO"]:
			# a vehicle was flown: fresh tanks for the next cycle
			for k in TANKS:
				b = "Propellant/%s/" % k
				S[b + "TankLevelPct"] = 0.0
				S[b + "FlowKgS"] = 0.0
				S[b + "ChilldownState"] = "WARM"
				S[b + "TempK"] = S["Weather/TempC"] + 273.15
				S[b + "PressureBar"] = TK[k]["pad"]
				S[b + "FillValveOpen"] = False
				S[b + "VentValveOpen"] = False
		reset_vehicle(S)
		S["Range/FTSArmed"] = False
		clear_faults(S)
		set_phase(S, "RECYCLE")


	# ----------------------------------------------------------------------------
	# commands from the library (launch.py)

	def run_commands(S):
		cmd = S["_Sim_/Cmd/Pending"]
		if not cmd:
			return
		arg = S["_Sim_/Cmd/Arg"]
		S["_Sim_/Cmd/Pending"] = ""
		S["_Sim_/Cmd/Arg"] = ""
		ph = S["Clock/Phase"]
		T = S["_Sim_/State/TMinusExact"]
		note(S, "command %s %s" % (cmd, arg))
		if cmd == "START":
			if ph == "IDLE":
				try:
					t0 = int(arg)
				except Exception:
					t0 = S["_Sim_/StartTMinus"]
				begin_count(S, t0)
		elif cmd == "RESUME":
			if ph == "HOLD" and not nogo_list(S):
				release_hold(S)
		elif cmd == "HOLD":
			if ph in ("CHILLDOWN", "LOADING", "TERMINAL_COUNT") and T <= HOLD_LIMIT:
				enter_hold(S, arg or "Manual hold", "MANUAL", -1)
		elif cmd == "ABORT":
			if ph in ACTIVE:
				enter_abort(S, arg or "Operator abort")
		elif cmd == "RECYCLE":
			if ph in ("HOLD", "ABORT", "SAFING", "ORBIT"):
				enter_recycle(S, arg or "Operator recycle")


	def sync_scenario(S):
		sc = S["_Sim_/Scenario"]
		if sc != S["_Sim_/State/ScenarioApplied"]:
			S["_Sim_/State/ScenarioApplied"] = sc
			S["_Sim_/State/ScenarioClock"] = 0.0
			S["_Sim_/ScenarioStep"] = 0
			note(S, "scenario %s armed" % sc)


	# ----------------------------------------------------------------------------
	# weather

	def ou(x, mean, rate, sigma, h, rng):
		return x + (mean - x) * rate * h + sigma * math.sqrt(h) * rng.gauss(0.0, 1.0)


	def weather(S, h, rng):
		scrub = S["_Sim_/Fault/WeatherScrub"]
		w = S["Weather/WindSpeedMS"]
		if scrub:
			w = min(18.0, w + 0.08 * h)
		else:
			rate = 0.01
			if w > 8.5:
				rate = 0.05
			w = ou(w, 5.5, rate, 0.10, h, rng)
			if w < 8.5:
				w = clamp(w, 1.5, 8.5)
		boost = S["_Sim_/State/GustBoost"] * math.exp(-h / 8.0)
		if rng.random() < h / 80.0:
			boost = boost + 1.8 + 1.7 * rng.random()
		gust = w * 1.18 + boost
		if not scrub:
			gust = min(gust, 14.5)
		d = S["Weather/WindDirDeg"]
		d = (d + (80.0 - d) * 0.003 * h + 1.2 * math.sqrt(h) * rng.gauss(0.0, 1.0)) % 360.0
		temp = ou(S["Weather/TempC"], 22.0, 0.002, 0.03, h, rng)
		hum = clamp(ou(S["Weather/HumidityPct"], 60.0, 0.004, 0.25, h, rng), 30.0, 95.0)
		pres = ou(S["Weather/PressureHPa"], 1013.0, 0.001, 0.05, h, rng)
		ltn = clamp(ou(S["Weather/LightningDistanceKm"], 70.0, 0.003, 0.8, h, rng), 40.0, 140.0)
		ceil_ = clamp(ou(S["Weather/CeilingM"], 3000.0, 0.002, 20.0, h, rng), 1800.0, 6000.0)
		up = clamp(ou(S["Weather/UpperWindsMS"], 22.0, 0.003, 0.15, h, rng), 8.0, 38.0)
		S["Weather/WindSpeedMS"] = w
		S["_Sim_/State/GustBoost"] = boost
		S["Weather/GustMS"] = gust
		S["Weather/WindDirDeg"] = d
		S["Weather/TempC"] = temp
		S["Weather/HumidityPct"] = hum
		S["Weather/PressureHPa"] = pres
		S["Weather/LightningDistanceKm"] = ltn
		S["Weather/CeilingM"] = ceil_
		S["Weather/UpperWindsMS"] = up
		S["Weather/GoForWeather"] = bool(w < 12.0 and gust < 16.0 and ltn > 10.0 and ceil_ > 1500.0 and up < 45.0)


	# ----------------------------------------------------------------------------
	# go / no-go

	def go_nogo(S):
		ph = S["Clock/Phase"]
		T = S["_Sim_/State/TMinusExact"]
		auto = {}
		ok = True
		for k in TANKS:
			b = "Propellant/%s/" % k
			if S[b + "ChilldownState"] == "READY" and S[b + "PressureBar"] < 1.8 and ph not in FLIGHT:
				ok = False
		if ph in ACTIVE and T >= -600.0:
			if min(S["Propellant/LOX/TankLevelPct"], S["Propellant/CH4/TankLevelPct"]) < 95.0:
				ok = False
		auto["Propellant"] = ok
		gse = S["Pad/GSEPower/BusAVolts"] > 455.0 and S["Pad/GSEPower/BusBVolts"] > 455.0
		if ph in ACTIVE and not S["Pad/UmbilicalConnected"]:
			gse = False
		if ph in ACTIVE and S["_Sim_/State/CountTime"] > 90.0 and not S["Pad/PadClear"]:
			gse = False
		auto["GSE"] = gse
		auto["Range"] = bool(S["Range/RangeClear"] and S["Range/TrackingLock"])
		auto["Weather"] = bool(S["Weather/GoForWeather"])
		veh = S["Vehicle/BatteryVoltage"] > 25.5 and S["Vehicle/AvionicsTempC"] < 50.0
		if T > -1449.0 and ph in ACTIVE and not S["Vehicle/GimbalCheckOK"]:
			veh = False
		auto["Vehicle"] = bool(veh)
		eff = {}
		for c in CONSOLES[:5]:
			o = S["_Sim_/GoOverride/" + c]
			if o == "GO":
				eff[c] = True
			elif o == "NOGO":
				eff[c] = False
			else:
				eff[c] = auto[c]
			S["Clock/GoNoGo/" + c] = eff[c]
		ld = True
		for c in CONSOLES[:5]:
			if not eff[c]:
				ld = False
		o = S["_Sim_/GoOverride/LaunchDirector"]
		if o == "GO":
			ld = True
		elif o == "NOGO":
			ld = False
		S["Clock/GoNoGo/LaunchDirector"] = ld


	# ----------------------------------------------------------------------------
	# sequencer

	def scenario_tick(S, h):
		sc = S["_Sim_/Scenario"]
		ph = S["Clock/Phase"]
		T = S["_Sim_/State/TMinusExact"]
		if sc == "lox_leak_abort":
			if ph in ("LOADING", "TERMINAL_COUNT", "HOLD") and S["Propellant/LOX/ChilldownState"] == "READY" \
					and S["Propellant/LOX/TankLevelPct"] >= 20.0 and S["_Sim_/ScenarioStep"] == 0:
				S["_Sim_/State/ScenarioClock"] += h
				if S["_Sim_/State/ScenarioClock"] >= 15.0:
					S["_Sim_/Fault/LOXLeak"] = True
					S["_Sim_/ScenarioStep"] = 1
					note(S, "scenario: LOX leak begins")
		elif sc == "weather_scrub":
			if ph == "TERMINAL_COUNT" and T >= -300.0 and S["_Sim_/ScenarioStep"] == 0:
				S["_Sim_/Fault/WeatherScrub"] = True
				S["_Sim_/ScenarioStep"] = 1
				note(S, "scenario: wind rising")


	def hold_tick(S, h):
		kind = S["_Sim_/State/HoldKind"]
		S["_Sim_/State/HoldTime"] += h
		ht = S["_Sim_/State/HoldTime"]
		nogo = nogo_list(S)
		sc = S["_Sim_/Scenario"]
		if kind == "BUILTIN":
			S["_Sim_/State/HoldDwellLeft"] -= h
			if S["_Sim_/State/HoldDwellLeft"] <= 0.0:
				if sc == "hold_t40s" and S["_Sim_/State/HoldIndex"] == 2:
					S["_Sim_/State/HoldKind"] = "SCENARIO"
					S["Clock/HoldReason"] = "Scenario hold at T-0:40 - waiting for launch.resume()"
					S["_Sim_/ScenarioStep"] = 1
					S["_Sim_/State/HoldTime"] = 0.0
				elif nogo:
					S["_Sim_/State/HoldKind"] = "NOGO"
					S["Clock/HoldReason"] = "NO-GO: " + ", ".join(nogo)
					S["_Sim_/State/HoldTime"] = 0.0
					S["_Sim_/State/GoStableTime"] = 0.0
				else:
					release_hold(S)
		elif kind == "NOGO":
			if nogo:
				S["Clock/HoldReason"] = "NO-GO: " + ", ".join(nogo)
				S["_Sim_/State/GoStableTime"] = 0.0
				if sc == "lox_leak_abort" and S["_Sim_/ScenarioStep"] == 1:
					S["_Sim_/ScenarioStep"] = 2
				leak = S["_Sim_/Fault/LOXLeak"]
				for k in TANKS:
					if S["Propellant/%s/ChilldownState" % k] == "READY" and S["Propellant/%s/PressureBar" % k] < 1.8:
						leak = True
				if "Propellant" in nogo and leak and ht >= LEAK_ABORT_AFTER:
					enter_abort(S, "Propellant leak unresolved - abort")
				elif "Weather" in nogo and ht >= SCRUB_AFTER:
					enter_recycle(S, "Scrub - weather outside launch commit criteria")
					if sc == "weather_scrub":
						pass
			else:
				S["_Sim_/State/GoStableTime"] += h
				if S["_Sim_/State/GoStableTime"] >= GO_STABLE:
					release_hold(S)
		elif kind == "SCENARIO":
			if ht >= SCENARIO_HOLD_TIMEOUT:
				note(S, "scenario hold timed out")
				release_hold(S)


	def sequencer(S, h):
		ph = S["Clock/Phase"]
		S["_Sim_/State/PhaseTime"] += h
		pt = S["_Sim_/State/PhaseTime"]
		if ph == "IDLE":
			S["_Sim_/State/TMinusExact"] = float(S["_Sim_/StartTMinus"])
			S["_Sim_/State/HoldsDone"] = holds_done_mask(S["_Sim_/StartTMinus"])
			S["Clock/ClockRunning"] = False
			if S["_Sim_/AutoCycle"] and pt >= IDLE_DWELL:
				begin_count(S, S["_Sim_/StartTMinus"])
			return
		if ph == "ABORT":
			if pt >= ABORT_DWELL:
				set_phase(S, "SAFING")
			return
		if ph == "SAFING":
			if pt >= SAFING_MIN and S["Propellant/LOX/TankLevelPct"] < 2.0 and S["Propellant/CH4/TankLevelPct"] < 2.0:
				enter_recycle(S, "")
			return
		if ph == "RECYCLE":
			if (pt >= RECYCLE_MIN and S["Propellant/LOX/TankLevelPct"] < 1.5 and S["Propellant/CH4/TankLevelPct"] < 1.5
					and S["Propellant/LOX/ChilldownState"] == "WARM" and S["Propellant/CH4/ChilldownState"] == "WARM"):
				S["Clock/HoldReason"] = ""
				S["Pad/PadClear"] = False
				S["_Sim_/State/TMinusExact"] = float(S["_Sim_/StartTMinus"])
				set_phase(S, "IDLE")
			return
		# counting phases
		S["_Sim_/State/CountTime"] += h
		scenario_tick(S, h)
		if ph == "HOLD":
			hold_tick(S, h)
			return
		T = S["_Sim_/State/TMinusExact"]
		if ph in FLIGHT:
			S["_Sim_/State/FlightTime"] += h
			S["_Sim_/State/TMinusExact"] = S["_Sim_/State/FlightTime"]
			if ph == "LIFTOFF" and S["_Sim_/State/FlightTime"] >= 10.0:
				set_phase(S, "ASCENT")
			if S["Vehicle/SECO"] and ph != "ORBIT":
				set_phase(S, "ORBIT")
			if S["Clock/Phase"] == "ORBIT" and S["_Sim_/State/PhaseTime"] >= ORBIT_DWELL:
				set_phase(S, "SAFING")
				S["Clock/ClockRunning"] = False
				S["Range/FTSArmed"] = False
			return
		# pre-launch count
		nogo = nogo_list(S)
		if nogo:
			S["_Sim_/State/NoGoTime"] += h
		else:
			S["_Sim_/State/NoGoTime"] = 0.0
		if S["_Sim_/State/NoGoTime"] >= NOGO_DEBOUNCE:
			if T <= HOLD_LIMIT:
				enter_hold(S, "NO-GO: " + ", ".join(nogo), "NOGO", -1)
				return
			enter_abort(S, "Autosequence cutoff: NO-GO " + ", ".join(nogo))
			return
		T = T + h
		done = S["_Sim_/State/HoldsDone"]
		for i in range(len(HOLDS)):
			if not (done & (1 << i)) and T >= HOLDS[i][0] - 1e-9:
				S["_Sim_/State/TMinusExact"] = HOLDS[i][0]
				enter_hold(S, HOLDS[i][1], "BUILTIN", i)
				return
		S["_Sim_/State/TMinusExact"] = T
		if T >= 0.0:
			S["_Sim_/State/FlightTime"] = T
		derive_phase(S)


	# ----------------------------------------------------------------------------
	# propellant

	def tank(S, h, rng, k, chill_cmd, fill_cmd, drain_cmd, ph):
		b = "Propellant/%s/" % k
		p = TK[k]
		lvl = S[b + "TankLevelPct"]
		P = S[b + "PressureBar"]
		Tt = S[b + "TempK"]
		cs = S[b + "ChilldownState"]
		flow = S[b + "FlowKgS"]
		pamb = S["Weather/PressureHPa"] / 1000.0
		tamb = S["Weather/TempC"] + 273.15
		if ph in FLIGHT or (ph == "SAFING" and S["_Sim_/State/FlightTime"] > 0.0):
			# vehicle tank in flight: level follows propellant burned, everything else frozen
			S[b + "FlowKgS"] = 0.0
			S[b + "FillValveOpen"] = False
			S[b + "VentValveOpen"] = False
			S[b + "BoiloffKgS"] = 0.0
			if S["Vehicle/StageSep"]:
				S[b + "TankLevelPct"] = 0.0
			elif S["_Sim_/State/MassKg"] > 0.0:
				used = clamp(M0 - S["_Sim_/State/MassKg"], 0.0, S1_PROP)
				S[b + "TankLevelPct"] = 100.0 - 99.5 * used / S1_PROP
			return
		ts = tsat(k, P)
		# --- thermal state
		if chill_cmd:
			if cs == "WARM":
				cs = "CHILLING"
			if cs == "CHILLING":
				Tt = lag(Tt, ts - 8.0, h, p["tau_chill"])
				if Tt <= ts + 6.0:
					cs = "READY"
			else:
				Tt = lag(Tt, ts + 0.4, h, 20.0)
		else:
			if cs == "READY" and lvl > 1.0:
				Tt = lag(Tt, ts + 0.4, h, 20.0)
			else:
				Tt = lag(Tt, tamb, h, 60.0)
				if cs != "WARM" and Tt > ts + 8.0:
					cs = "WARM"
		# --- boil-off
		boil = 0.0
		if cs == "READY" and lvl > 0.5:
			boil = p["kb"] * (tamb - ts) * (0.25 + 0.75 * clamp(lvl / 100.0, 0.0, 1.0))
		elif cs == "CHILLING":
			boil = 0.008 * max(Tt - ts, 0.0)
		# --- valves and flow
		fill_open = S[b + "FillValveOpen"]
		flow_set = 0.0
		if cs == "CHILLING":
			fill_open = True
			flow_set = p["purge"]
		elif fill_cmd and cs == "READY":
			if fill_open and lvl >= 99.8:
				fill_open = False
			elif (not fill_open) and lvl < 99.5:
				fill_open = True
			if fill_open:
				flow_set = p["fmax"] * clamp((100.0 - lvl) / TAPER, 0.0, 1.0)
		elif drain_cmd and lvl > 0.3:
			fill_open = True
			flow_set = -OFFLOAD_PCT_S / 100.0 * p["cap"]
		else:
			fill_open = False
		flow = lag(flow, flow_set, h, 10.0 if flow_set >= 0.0 else 4.0)
		if abs(flow) < 0.01:
			flow = 0.0
		# --- mass balance
		m = lvl / 100.0 * p["cap"]
		if cs == "READY":
			m += flow * h
			m -= boil * h
			if S["_Sim_/Fault/LOXLeak"] and k == "LOX" and lvl > 0.5:
				m -= LEAK_KGS * h
		lvl = clamp(m / p["cap"] * 100.0, 0.0, 100.0)
		if drain_cmd and lvl <= 0.3:
			lvl = 0.0
			flow = 0.0
		# --- ullage pressure
		vent = S[b + "VentValveOpen"]
		if drain_cmd or ph in ("ABORT", "SAFING", "RECYCLE"):
			if P > 2.25:
				vent = True
			elif P < 2.05:
				vent = False
		else:
			if P >= VENT_HI:
				vent = True
			elif P <= VENT_LO:
				vent = False
		dP = p["gp"] * boil - KSEEP * (P - pamb)
		if cs == "READY":
			dP += GF * max(flow, 0.0)
		if vent:
			dP -= KV * (P - pamb)
		if S["_Sim_/Fault/LOXLeak"] and k == "LOX" and cs == "READY":
			dP -= KLEAK * (P - pamb)
		if cs == "WARM":
			dP -= 0.05 * (P - p["pad"])
		P = max(P + dP * h + 0.0015 * math.sqrt(h) * rng.gauss(0.0, 1.0), pamb * 0.98)
		S[b + "TankLevelPct"] = lvl
		S[b + "PressureBar"] = P
		S[b + "TempK"] = Tt + 0.04 * rng.gauss(0.0, 1.0)
		S[b + "ChilldownState"] = cs
		S[b + "FlowKgS"] = flow
		S[b + "FillValveOpen"] = fill_open
		S[b + "VentValveOpen"] = vent
		S[b + "BoiloffKgS"] = boil


	def propellant(S, h, rng):
		ph = S["Clock/Phase"]
		chill_cmd = ph in ACTIVE and not (ph == "HOLD" and S["_Sim_/State/HoldIndex"] == 0)
		fill_cmd = ph in ACTIVE
		drain_cmd = ph in ("SAFING", "RECYCLE") or (ph == "ABORT" and S["_Sim_/State/PhaseTime"] > 15.0)
		for k in TANKS:
			tank(S, h, rng, k, chill_cmd, fill_cmd, drain_cmd, ph)


	# ----------------------------------------------------------------------------
	# pad

	def pad(S, h, rng):
		ph = S["Clock/Phase"]
		T = S["_Sim_/State/TMinusExact"]
		ft = S["_Sim_/State/FlightTime"]
		tamb = S["Weather/TempC"]
		running = ph in ACTIVE or ph in FLIGHT
		# strongback
		sb = S["Pad/StrongbackRetractPct"]
		if running:
			if T >= 0.0:
				sb = 100.0
			else:
				sb = clamp((T + 420.0) / 360.0 * 100.0, 0.0, 100.0)
		else:
			sb = max(0.0, sb - 1.5 * h)
		S["Pad/StrongbackRetractPct"] = sb
		S["Pad/UmbilicalConnected"] = not (ph in FLIGHT)
		# FTS
		if running and T >= -60.0:
			S["Range/FTSArmed"] = not S["Vehicle/SECO"]
		elif not running:
			S["Range/FTSArmed"] = False
		# deluge
		armed = running and T >= -10.0 and (T < 0.0 or ft < 40.0)
		S["Pad/DelugeArmed"] = bool(armed)
		target = DELUGE_LPM
		if not armed:
			target = 0.0
		dflow = lag(S["Pad/DelugeFlowLpm"], target, h, 3.0)
		if dflow < 5.0 and not armed:
			dflow = 0.0
		wl = S["Pad/WaterTowerLevelPct"] - dflow / 60.0 * h / WATER_CAP_L * 100.0
		if dflow < 10.0:
			wl += 0.15 * h
		S["Pad/WaterTowerLevelPct"] = clamp(wl, 0.0, 100.0)
		S["Pad/DelugeFlowLpm"] = dflow
		# GSE power: pumps, chill circuit, deluge and strongback load the two buses
		load = 70.0
		if ph in ACTIVE:
			load += 25.0
		load += max(S["Propellant/LOX/FlowKgS"], 0.0) * 0.55 + max(S["Propellant/CH4/FlowKgS"], 0.0) * 0.9
		load += dflow / DELUGE_LPM * 260.0
		if 0.0 < sb < 100.0:
			load += 40.0
		ia = load * 0.55 + rng.gauss(0.0, 1.5)
		ib = load * 0.45 + rng.gauss(0.0, 1.5)
		S["Pad/GSEPower/BusAAmps"] = max(ia, 0.0)
		S["Pad/GSEPower/BusBAmps"] = max(ib, 0.0)
		S["Pad/GSEPower/BusAVolts"] = 480.0 - 0.035 * ia + rng.gauss(0.0, 0.25)
		S["Pad/GSEPower/BusBVolts"] = 480.0 - 0.035 * ib + rng.gauss(0.0, 0.25)
		# flame trench
		thr = S["Vehicle/ThrustPct"]
		heat = 0.0
		if running and (T < 0.0 or ft < 12.0):
			heat = 130.0 * thr / 100.0 * (1.0 - 0.35 * clamp(dflow / DELUGE_LPM, 0.0, 1.0))
		ft_t = S["Pad/FlameTrenchTempC"]
		tgt = tamb + 3.0 + heat
		tau = 6.0
		if tgt < ft_t:
			tau = 60.0
		S["Pad/FlameTrenchTempC"] = lag(ft_t, tgt, h, tau) + 0.05 * rng.gauss(0.0, 1.0)
		hum_tgt = S["Weather/HumidityPct"] * 0.7
		if S["_Sim_/Fault/LOXLeak"] and S["Propellant/LOX/TankLevelPct"] > 0.5:
			hum_tgt = 96.0
		if dflow > 1000.0:
			hum_tgt = max(hum_tgt, 90.0)
		S["Pad/FlameTrenchHumidityPct"] = clamp(lag(S["Pad/FlameTrenchHumidityPct"], hum_tgt, h, 40.0), 0.0, 100.0)


	# ----------------------------------------------------------------------------
	# vehicle

	def vehicle(S, h, rng):
		ph = S["Clock/Phase"]
		T = S["_Sim_/State/TMinusExact"]
		running = ph in ACTIVE or ph in FLIGHT
		if ph in ACTIVE:
			if T >= -1450.0:
				S["Vehicle/GimbalCheckOK"] = True
			both = (S["Propellant/LOX/ChilldownState"] == "READY" and S["Propellant/CH4/ChilldownState"] == "READY")
			if T >= -3.0:
				S["Vehicle/EngineChillState"] = "FIRING"
			elif both:
				S["Vehicle/EngineChillState"] = "READY"
			elif ph != "HOLD" or S["_Sim_/State/HoldIndex"] != 0:
				S["Vehicle/EngineChillState"] = "CHILLING"
			thr = 0.0
			if -3.0 <= T < 0.0:
				thr = 100.0 * (T + 3.0) / 3.0
			S["Vehicle/ThrustPct"] = thr
			S["Vehicle/AccelG"] = 1.0
		elif ph in ("ABORT", "SAFING", "RECYCLE", "IDLE"):
			S["Vehicle/ThrustPct"] = 0.0
			S["Vehicle/AccelG"] = 1.0
			if S["Vehicle/EngineChillState"] in ("FIRING", "READY") and ph != "IDLE":
				S["Vehicle/EngineChillState"] = "WARM"
		# stage tank pressures
		pf = 0.0
		if ph in ACTIVE and T >= -180.0:
			pf = clamp((T + 180.0) / 60.0, 0.0, 1.0)
		sep = S["Vehicle/StageSep"]
		seco = S["Vehicle/SECO"]
		for k, f1, f2 in (("LOX", 3.8, 2.9), ("CH4", 4.2, 3.1)):
			pg = S["Propellant/%s/PressureBar" % k] * 0.98
			if ph in FLIGHT:
				t1 = f1
				if sep:
					t1 = 1.0
				t2 = f2
				if seco:
					t2 = 1.8
			elif S["_Sim_/State/FlightTime"] > 0.0:
				t1 = 1.0
				t2 = 1.0
			else:
				t1 = pg + pf * (f1 - pg)
				t2 = pg + pf * (f2 - pg)
			tau1 = 3.0
			tau2 = 3.0
			if ph in FLIGHT and sep:
				tau1 = 8.0
			if ph in FLIGHT and seco:
				tau2 = 120.0
			if ph not in FLIGHT and S["_Sim_/State/FlightTime"] > 0.0:
				tau1 = 20.0
				tau2 = 20.0
			S["Vehicle/Stage1/%sPressureBar" % k] = lag(S["Vehicle/Stage1/%sPressureBar" % k], t1, h, tau1) + 0.004 * rng.gauss(0.0, 1.0)
			S["Vehicle/Stage2/%sPressureBar" % k] = lag(S["Vehicle/Stage2/%sPressureBar" % k], t2, h, tau2) + 0.004 * rng.gauss(0.0, 1.0)
		# battery and avionics
		soc = S["Vehicle/BatterySOCPct"]
		ft = S["_Sim_/State/FlightTime"]
		if ph in FLIGHT:
			soc = max(soc - 0.0125 * h, 0.0)
		else:
			soc = soc + (100.0 - soc) * h / 900.0
		S["Vehicle/BatterySOCPct"] = soc
		volts = 24.5 + 3.6 * soc / 100.0
		if ph in FLIGHT:
			volts -= 0.3
		S["Vehicle/BatteryVoltage"] = volts + 0.01 * rng.gauss(0.0, 1.0)
		atgt = S["Weather/TempC"] + 2.0
		if running:
			atgt += 6.0
		if ph in FLIGHT:
			atgt += 0.012 * min(ft, 480.0)
		S["Vehicle/AvionicsTempC"] = lag(S["Vehicle/AvionicsTempC"], atgt, h, 200.0) + 0.02 * rng.gauss(0.0, 1.0)
		if ph in FLIGHT:
			flight(S, h)


	def flight(S, h):
		ft_end = S["_Sim_/State/FlightTime"]
		tt = max(ft_end - h, 0.0)
		n = int(math.ceil(h / 0.5))
		if n < 1:
			n = 1
		dt = h / n
		if S["_Sim_/State/MassKg"] <= 0.0:
			S["_Sim_/State/MassKg"] = M0
		m = S["_Sim_/State/MassKg"]
		alt = S["Vehicle/AltitudeM"]
		vx = S["_Sim_/State/VxMS"]
		vy = S["_Sim_/State/VyMS"]
		x = S["Vehicle/DownrangeKm"] * 1000.0
		qmax = S["_Sim_/State/QMaxPa"]
		thrust_pct = S["Vehicle/ThrustPct"]
		accel_g = S["Vehicle/AccelG"]
		for i in range(n):
			tt += dt
			rho = 1.225 * math.exp(-alt / 8500.0)
			v = math.hypot(vx, vy)
			q = 0.5 * rho * v * v
			if q > qmax:
				qmax = q
			elif (not S["Vehicle/MaxQ"]) and tt > 20.0 and q < 0.98 * qmax and qmax > 5000.0:
				S["Vehicle/MaxQ"] = True
			g = G0 * (RE / (RE + alt)) ** 2
			geff = g - vx * vx / (RE + alt)
			e = math.radians(pitch_deg(tt))
			thr = 0.0
			md = 0.0
			cda = CDA1
			if not S["Vehicle/MECO"]:
				if tt >= T_MECO:
					S["Vehicle/MECO"] = True
					S["Vehicle/EngineChillState"] = "SHUTDOWN"
					thrust_pct = 0.0
				else:
					f = 1.0
					if THROTTLE_T0 < tt < THROTTLE_T1:
						f = THROTTLE_F
					thr = T1 * f * (1.0 + 0.08 * (1.0 - math.exp(-alt / 7000.0)))
					md = MDOT1 * f
					frac = f
					if thr / m > 3.8 * G0:
						kf = 3.8 * G0 * m / thr
						thr = thr * kf
						md = md * kf
						frac = f * kf
					thrust_pct = frac * 100.0
					S["Vehicle/EngineChillState"] = "FIRING"
			if S["Vehicle/MECO"] and (not S["Vehicle/StageSep"]) and tt >= T_SEP:
				S["Vehicle/StageSep"] = True
				m = m - S1_DRY
			if S["Vehicle/StageSep"]:
				cda = CDA2
				if (not S["Vehicle/SECO"]) and tt >= T_S2:
					if tt >= T_SECO:
						S["Vehicle/SECO"] = True
						S["Vehicle/EngineChillState"] = "SHUTDOWN"
						thrust_pct = 0.0
					else:
						thr = T2
						md = MDOT2
						thrust_pct = 100.0
						S["Vehicle/EngineChillState"] = "FIRING"
			drag = q * cda
			ax_t = (thr * math.cos(e) - (drag * vx / v if v > 1.0 else 0.0)) / m
			ay_t = (thr * math.sin(e) - (drag * vy / v if v > 1.0 else 0.0)) / m
			accel_g = math.hypot(ax_t, ay_t) / G0
			ay = ay_t - geff
			if alt <= 0.0 and ay < 0.0 and vy <= 0.0:
				ay = 0.0
				vy = 0.0
			vx += ax_t * dt
			vy += ay * dt
			x += vx * dt
			alt += vy * dt
			if alt < 0.0:
				alt = 0.0
				vy = max(vy, 0.0)
			m -= md * dt
		S["_Sim_/State/MassKg"] = m
		S["Vehicle/AltitudeM"] = alt
		S["_Sim_/State/VxMS"] = vx
		S["_Sim_/State/VyMS"] = vy
		S["Vehicle/VelocityMS"] = math.hypot(vx, vy)
		S["Vehicle/DownrangeKm"] = x / 1000.0
		S["_Sim_/State/QMaxPa"] = qmax
		S["Vehicle/ThrustPct"] = thrust_pct
		S["Vehicle/AccelG"] = accel_g


	# ----------------------------------------------------------------------------

	def substep(S, h, rng):
		weather(S, h, rng)
		go_nogo(S)
		sequencer(S, h)
		propellant(S, h, rng)
		pad(S, h, rng)
		vehicle(S, h, rng)
		go_nogo(S)
		S["Clock/TMinusSeconds"] = int(S["_Sim_/State/TMinusExact"])
		S["Clock/NextHoldAtSeconds"] = next_hold(S)


	def advance(S, dt, rng):
		sync_scenario(S)
		run_commands(S)
		n = int(math.ceil(dt))
		if n < 1:
			n = 1
		if n > 60:
			n = 60
		h = dt / n
		for i in range(n):
			substep(S, h, rng)


	def read_state(log):
		paths = [BASE + k for k in KEYS]
		qvs = system.tag.readBlocking(paths)
		S = {}
		missing = 0
		for k, qv in zip(KEYS, qvs):
			v = qv.value
			if v is None or not qv.quality.isGood():
				v = DEFAULTS[k]
				missing += 1
			S[k] = coerce(k, v) if not isinstance(DEFAULTS[k], float) else float(v)
		S["_log"] = []
		return S, missing


	def write_changes(S, orig, log):
		paths = []
		vals = []
		for k in KEYS:
			nv = coerce(k, S[k])
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
		try:
			S, missing = read_state(log)
			if missing > len(KEYS) // 2:
				return
			orig = dict(S)
			if not S["_Sim_/Enabled"]:
				S["_Sim_/LastTickMs"] = system.date.toMillis(system.date.now())
				write_changes(S, orig, log)
				return
			now = system.date.toMillis(system.date.now())
			last = S["_Sim_/LastTickMs"]
			real = 1.0
			if last > 0:
				real = clamp((now - last) / 1000.0, 0.0, 5.0)
			speed = clamp(S["_Sim_/SpeedFactor"], 0.1, 60.0)
			dt = speed * real
			S["_Sim_/LastTickMs"] = now
			S["_Sim_/TickCount"] += 1
			rng = random.Random(S["_Sim_/Seed"] * 100003 + S["_Sim_/TickCount"])
			advance(S, dt, rng)
			if S["_Sim_/LastError"]:
				S["_Sim_/State/OkStreak"] += 1
				if S["_Sim_/State/OkStreak"] >= 30:
					S["_Sim_/LastError"] = ""
			write_changes(S, orig, log)
			for m in S["_log"]:
				log.info(m)
		except Exception as e:
			import traceback
			msg = "%s: %s" % (e.__class__.__name__, e)
			try:
				tb = traceback.format_exc()
				msg = (msg + " | " + tb.replace("\n", " | "))[:900]
			except Exception:
				pass
			log.error("launch_sim tick failed: " + msg)
			try:
				system.tag.writeBlocking([BASE + "_Sim_/LastError", BASE + "_Sim_/State/OkStreak"], [msg, 0])
			except Exception:
				pass

	main()