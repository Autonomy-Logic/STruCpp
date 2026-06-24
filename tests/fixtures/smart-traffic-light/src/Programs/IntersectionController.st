(* IntersectionController Program
   Main control program for a 4-way intersection.
   Uses located variables for I/O mapping and coordinates
   traffic lights, pedestrian signals, and vehicle detection. *)

PROGRAM IntersectionController
  VAR_INPUT
    (* Sensor inputs — mapped to physical I/O *)
    northSensor AT %IX0.0 : BOOL;
    southSensor AT %IX0.1 : BOOL;
    eastSensor  AT %IX0.2 : BOOL;
    westSensor  AT %IX0.3 : BOOL;
    pedestrianButton AT %IX0.4 : BOOL;
  END_VAR

  VAR_OUTPUT
    (* Signal outputs — mapped to physical I/O *)
    northRed    AT %QX0.0 : BOOL;
    northYellow AT %QX0.1 : BOOL;
    northGreen  AT %QX0.2 : BOOL;
    southRed    AT %QX0.3 : BOOL;
    southYellow AT %QX0.4 : BOOL;
    southGreen  AT %QX0.5 : BOOL;
    pedestrianWalk AT %QX1.0 : BOOL;
    pedestrianStop AT %QX1.1 : BOOL;
  END_VAR

  VAR
    northSouthLight : TrafficLight;
    eastWestLight   : TrafficLight;
    pedestrian      : PedestrianLight;
    northDetector   : VehicleDetector;
    southDetector   : VehicleDetector;
    logger          : TrafficLogger;
    nsTiming        : PhaseTiming;
    ewTiming        : PhaseTiming;
    systemReady     : BOOL := FALSE;
    cycleCount      : DINT := 0;
    otherCount      : INT := 0;
    someString      : STRING := 'hello';
  END_VAR

  (* Initialize on first scan *)
  IF NOT systemReady THEN
    nsTiming.redDuration := T#35s;
    nsTiming.greenDuration := T#30s;
    nsTiming.yellowDuration := T#5s;

    ewTiming.redDuration := T#35s;
    ewTiming.greenDuration := T#25s;
    ewTiming.yellowDuration := T#5s;

    northSouthLight.timing := nsTiming;
    eastWestLight.timing := ewTiming;
    pedestrian.timing := nsTiming;

    logger.Initialize();
    northDetector.Initialize();
    southDetector.Initialize();
    
    systemReady := TRUE;
  END_IF;


  (* Update vehicle detectors *)
  northDetector.sensorInput := northSensor;
  northDetector();
  southDetector.sensorInput := southSensor;
  southDetector();

  (* Update pedestrian request *)
  IF pedestrianButton THEN
    pedestrian.RequestWalk();
  END_IF;

  (* Run traffic light state machines *)
  northSouthLight();
  eastWestLight();
  pedestrian();

  (* Map to physical outputs *)
  northRed    := northSouthLight.redLight;
  northYellow := northSouthLight.yellowLight;
  northGreen  := northSouthLight.greenLight;
  southRed    := northSouthLight.redLight;
  southYellow := northSouthLight.yellowLight;
  southGreen  := northSouthLight.greenLight;
  pedestrianWalk := pedestrian.walkLight;
  pedestrianStop := pedestrian.dontWalkLight;

  cycleCount := cycleCount + 1;

END_PROGRAM

(* Project configuration *)
CONFIGURATION DefaultConfig
  RESOURCE DefaultResource ON DefaultTarget
    TASK MainTask(INTERVAL := T#100ms, PRIORITY := 1);
    PROGRAM IntersectionInstance WITH MainTask : IntersectionController;
  END_RESOURCE
END_CONFIGURATION
