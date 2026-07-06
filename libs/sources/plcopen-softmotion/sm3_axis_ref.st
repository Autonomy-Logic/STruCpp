(*
 * AXIS_REF_SM3 — CODESYS SoftMotion-compatible axis reference.
 *
 * Application code declares an axis of this type (the EtherCAT drive's name),
 * passes it to MC_* blocks by VAR_IN_OUT, and reads/writes its fields
 * (fActPosition, nAxisState, …) — exactly as in CODESYS. It is a STRUCT (not an
 * FB): real CODESYS application code never calls axis methods (those are all
 * driver-internal). All positions/velocities are in technical (user) units;
 * the embedded `Drive` carries the raw CiA 402 PDO words in increments, and
 * SM_Drive_GenericDS402 bridges between them each scan.
 *)
TYPE AXIS_REF_SM3 :
STRUCT
	(* --- Command (written by MC_* blocks, in technical units) --- *)
	fSetPosition : LREAL;              (* commanded position [u] *)
	fSetVelocity : LREAL;              (* commanded velocity [u/s] *)
	fSetAcceleration : LREAL;          (* commanded acceleration [u/s2] *)
	fSetDeceleration : LREAL;          (* commanded deceleration [u/s2] *)
	fSetJerk : LREAL;                  (* commanded jerk [u/s3] *)
	bRegulatorOn : BOOL;               (* power-stage enable command *)
	bDriveStart : BOOL;                (* quick-stop release command *)
	byControllerMode : BYTE;           (* SMC_CONTROLLER_MODE as BYTE *)

	(* --- Feedback (updated by the drive bridge, in technical units) --- *)
	fActPosition : LREAL;              (* actual position [u] *)
	fActVelocity : LREAL;              (* actual velocity [u/s] *)
	fActTorque : LREAL;                (* actual torque *)
	nAxisState : SMC_AXIS_STATE;       (* PLCopen axis state *)
	bRegulatorRealState : BOOL;        (* real power-stage state *)
	bDriveStartRealState : BOOL;       (* real quick-stop-released state *)
	byRealControllerMode : BYTE;       (* actual controller mode *)

	(* --- Error / communication --- *)
	bError : BOOL;
	dwErrorID : DWORD;                 (* SMC_ERROR as DWORD *)
	bCommunication : BOOL;
	wCommunicationState : WORD;

	(* --- Scaling (increments <-> technical units) --- *)
	iRatioTechUnitsNum : DINT := 1;    (* CODESYS param 1052 *)
	dwRatioTechUnitsDenom : DWORD := 1;(* CODESYS param 1051 *)
	fScalefactor : LREAL := 1.0;       (* CODESYS param 1054 *)
	fIncPerUnit : LREAL := 1.0;        (* derived: increments per user unit *)

	(* --- Axis configuration --- *)
	fPositionPeriod : LREAL := 360.0;  (* modulo period [u] *)
	bModulo : BOOL;                    (* TRUE = rotary/modulo axis *)
	fSWLimitPositive : LREAL;
	fSWLimitNegative : LREAL;
	bSWLimitEnable : BOOL;
	fCycleTime : LREAL := 0.01;        (* task cycle [s], for OTG *)

	(* --- Raw CiA 402 interface (increments) bridged to the drive PDOs --- *)
	Drive : OpenSML_Axis;
END_STRUCT
END_TYPE
