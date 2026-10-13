# sim - gateway-side simulations

Everything in here runs **inside the Ignition gateway** and is loaded through Ignite itself. The demos only ever
see tags, alarms and history; they steer the simulation through project-library functions called with
`POST /script/library`.

```
sim/
  launch/                 Demo 1 - Launch Operations (see launch/README.md)
    tags.json             tag model in system.tag.configure format
    project/              files copied into <data>/projects/demo/ignition/
      timer/launch_sim/         1 s timer: the physics + sequencer
      script-python/launch/     library module: the API the UI calls
  datacenter/             Demo 2 - Data Center (see datacenter/README.md)
    tags.json             675 tags under [default]DC/
    project/              same layout: timer/dc_sim, script-python/dc
  microgrid/              Demo 3 - Campus Microgrid (see microgrid/README.md)
    tags.json             405 tags under [default]MG/
    project/              same layout: timer/mg_sim, script-python/mg
  scripts/
    load-tags.mjs         load a tag model through Ignite (operator tier)
    install-project.sh    copy project resources to the gateway host and restart the gateway
    tag-table.mjs         render a tag model as a Markdown table (used for the READMEs)
```

## Flow

1. **Tags first** (no restart needed). The historian provider `IgniteHistorian` must already exist; trended tags
   reference it by name.

       export IGNITE_URL=http://<gateway>:8088/data/ignite IGNITE_SITE=<site> IGNITE_USER=<operator> IGNITE_PASS=<secret>
       node sim/scripts/load-tags.mjs sim/launch/tags.json

   The script logs in, calls `system.tag.configure` with overwrite (`--policy m` merges instead and keeps the
   current values of existing memory tags), browses the result to count the tags and re-reads a sample.
   The credentials come from the environment only; nothing is read from or written to files.

2. **Project resources, then restart.**

       sim/scripts/install-project.sh <ssh-host> <data>/projects/demo/ignition launch

   rsyncs `sim/launch/project/` into the project's `ignition/` directory (nothing is deleted, so existing
   resources stay), runs `sudo systemctl restart Ignition-Gateway` over ssh and polls `StatusPing` (derived from
   `IGNITE_URL`) until the gateway reports `RUNNING`. `<ssh-host>` needs key auth and sudo for that one command.

3. The timer starts about 20 seconds after the gateway is up and the sim begins counting by itself
   (`_Sim_/AutoCycle`).

## Why a restart is required

Timer and library resources written to disk by anything other than the Designer are **not** noticed by a running
gateway; they are loaded when the gateway (re)starts. Tag changes made through `system.tag.configure` are live
immediately and need no restart. So: tags can be reloaded any time; changing the timer script or the library means
running `install-project.sh` again. (Measured behaviour is recorded in
`docs/reference/ignition-8.3-project-files.md` in the ignite repository.)

## Format facts worth knowing

* A timer script file is `def handleTimerEvent():` followed by an indented body. The gateway compiles everything
  after the first line as the function body, so a timer script cannot have module-level imports or helper
  functions: `launch_sim` defines its helpers as nested functions inside `handleTimerEvent`.
* Both scripts are Jython 2.7 (no f-strings, no `nonlocal`, no `print()`), and keep **no** state outside tags.
* `lastModificationSignature` in the two `resource.json` files is copied from the Designer-made sample resources;
  the gateway accepts it unvalidated.
