(*
 * PLCopen MC_* function blocks — CODESYS SoftMotion SM3 compatible.
 *
 * Signatures/units match CODESYS SM3_Basic so CODESYS application code ports
 * unmodified: axis is AXIS_REF_SM3 (VAR_IN_OUT), positions/velocities are LREAL
 * technical units, and the standard PLCopen output set is provided. Each block
 * drives the validated OpenSML CiA 402 engine on the axis's embedded raw drive
 * image (Axis.Drive), converting technical units to increments via
 * Axis.fIncPerUnit (maintained by SM_Drive_GenericDS402).
 *
 * Supported buffering model: single active move (BufferMode Aborting). The
 * BufferMode / Direction inputs are accepted for signature compatibility;
 * blending/queuing across multiple concurrently-executing blocks is not
 * modelled. Acceleration/Deceleration/Jerk are recorded on the axis and, in
 * the drive-side profile modes, honoured by the drive's own ramp objects.
 *)

(* ------------------------------------------------------------------ MC_Power *)
FUNCTION_BLOCK MC_Power
VAR_IN_OUT
	Axis : AXIS_REF_SM3;
END_VAR
VAR_INPUT
	Enable : BOOL;
	bRegulatorOn : BOOL := TRUE;   (* enable power stage / closed loop *)
	bDriveStart : BOOL := TRUE;    (* release quick stop *)
END_VAR
VAR_OUTPUT
	Status : BOOL;                 (* axis ready to move (operation enabled) *)
	bRegulatorRealState : BOOL;
	bDriveStartRealState : BOOL;
	Busy : BOOL;
	Error : BOOL;
	ErrorID : SMC_ERROR;
END_VAR
VAR
	_pwr : OpenSML_Power;
END_VAR
	Axis.bRegulatorOn := Enable AND bRegulatorOn;
	Axis.bDriveStart := Enable AND bDriveStart;
	_pwr(Axis := Axis.Drive,
	     xEnable := Enable AND bRegulatorOn,
	     xEmergencyStop := bDriveStart);
	Status := _pwr.xDone;
	bRegulatorRealState := Axis.bRegulatorRealState;
	bDriveStartRealState := Axis.bDriveStartRealState;
	Busy := (Enable AND bRegulatorOn) AND NOT _pwr.xDone AND NOT _pwr.xError;
	Error := _pwr.xError;
	IF _pwr.xError THEN ErrorID := SMC_REGULATOR_OR_START_NOT_SET;
	ELSE ErrorID := SMC_NO_ERROR; END_IF
END_FUNCTION_BLOCK

(* ---------------------------------------------------------- MC_MoveAbsolute *)
FUNCTION_BLOCK MC_MoveAbsolute
VAR_IN_OUT
	Axis : AXIS_REF_SM3;
END_VAR
VAR_INPUT
	Execute : BOOL;
	Position : LREAL;              (* [u] *)
	Velocity : LREAL;             (* [u/s] *)
	Acceleration : LREAL;
	Deceleration : LREAL;
	Jerk : LREAL;
	Direction : MC_DIRECTION := mcd_positive;
	BufferMode : MC_BUFFER_MODE := mcbm_aborting;
END_VAR
VAR_OUTPUT
	Done : BOOL;
	Busy : BOOL;
	Active : BOOL;
	CommandAborted : BOOL;
	Error : BOOL;
	ErrorID : SMC_ERROR;
END_VAR
VAR
	_pp : OpenSML_ProfilePosition;
END_VAR
	IF Execute THEN
		Axis.byControllerMode := BYTE#3;   (* SMC_position *)
		Axis.fSetPosition := Position;
		Axis.fSetVelocity := Velocity;
		Axis.fSetAcceleration := Acceleration;
		Axis.fSetDeceleration := Deceleration;
		Axis.fSetJerk := Jerk;
	END_IF
	_pp(Axis := Axis.Drive,
	    xEnable := Execute,
	    xExecute := Execute,
	    xContinueMove := (BufferMode <> mcbm_aborting),
	    xRelativeMode := FALSE,
	    diTargetPosition := LREAL_TO_DINT(Position * Axis.fIncPerUnit),
	    udiProfileVelocity := LREAL_TO_UDINT(ABS(Velocity) * Axis.fIncPerUnit));
	Done := _pp.xDone;
	Busy := _pp.xBusy;
	Active := _pp.xBusy;
	CommandAborted := FALSE;
	Error := _pp.xError;
	IF _pp.xError THEN ErrorID := SMC_MA_INVALID_ACCDEC_VALUES;
	ELSE ErrorID := SMC_NO_ERROR; END_IF
END_FUNCTION_BLOCK

(* ---------------------------------------------------------- MC_MoveRelative *)
FUNCTION_BLOCK MC_MoveRelative
VAR_IN_OUT
	Axis : AXIS_REF_SM3;
END_VAR
VAR_INPUT
	Execute : BOOL;
	Distance : LREAL;             (* [u] *)
	Velocity : LREAL;             (* [u/s] *)
	Acceleration : LREAL;
	Deceleration : LREAL;
	Jerk : LREAL;
	BufferMode : MC_BUFFER_MODE := mcbm_aborting;
END_VAR
VAR_OUTPUT
	Done : BOOL;
	Busy : BOOL;
	Active : BOOL;
	CommandAborted : BOOL;
	Error : BOOL;
	ErrorID : SMC_ERROR;
END_VAR
VAR
	_pp : OpenSML_ProfilePosition;
END_VAR
	IF Execute THEN
		Axis.byControllerMode := BYTE#3;
		Axis.fSetVelocity := Velocity;
	END_IF
	_pp(Axis := Axis.Drive,
	    xEnable := Execute,
	    xExecute := Execute,
	    xContinueMove := (BufferMode <> mcbm_aborting),
	    xRelativeMode := TRUE,
	    diTargetPosition := LREAL_TO_DINT(Distance * Axis.fIncPerUnit),
	    udiProfileVelocity := LREAL_TO_UDINT(ABS(Velocity) * Axis.fIncPerUnit));
	Done := _pp.xDone;
	Busy := _pp.xBusy;
	Active := _pp.xBusy;
	CommandAborted := FALSE;
	Error := _pp.xError;
	IF _pp.xError THEN ErrorID := SMC_MA_INVALID_ACCDEC_VALUES;
	ELSE ErrorID := SMC_NO_ERROR; END_IF
END_FUNCTION_BLOCK

(* ---------------------------------------------------------- MC_MoveVelocity *)
FUNCTION_BLOCK MC_MoveVelocity
VAR_IN_OUT
	Axis : AXIS_REF_SM3;
END_VAR
VAR_INPUT
	Execute : BOOL;
	Velocity : LREAL;             (* [u/s], signed *)
	Acceleration : LREAL;
	Deceleration : LREAL;
	Jerk : LREAL;
	Direction : MC_DIRECTION := mcd_current;
	BufferMode : MC_BUFFER_MODE := mcbm_aborting;
END_VAR
VAR_OUTPUT
	InVelocity : BOOL;
	Busy : BOOL;
	Active : BOOL;
	CommandAborted : BOOL;
	Error : BOOL;
	ErrorID : SMC_ERROR;
END_VAR
VAR
	_pv : OpenSML_ProfileVelocity;
END_VAR
	IF Execute THEN
		Axis.byControllerMode := BYTE#2;   (* SMC_velocity *)
		Axis.fSetVelocity := Velocity;
	END_IF
	_pv(Axis := Axis.Drive,
	    xEnable := Execute,
	    diTargetVelocity := LREAL_TO_DINT(Velocity * Axis.fIncPerUnit));
	Busy := Execute AND NOT _pv.xError;
	Active := Busy;
	CommandAborted := FALSE;
	Error := _pv.xError;
	(* target reached: commanded, no fault, and actual within 1% of target *)
	InVelocity := Execute AND NOT _pv.xError
	              AND (ABS(Axis.fActVelocity - Velocity) <= (ABS(Velocity) * 0.01 + 1.0));
	IF _pv.xError THEN ErrorID := SMC_MV_INVALID_VELACC_VALUES;
	ELSE ErrorID := SMC_NO_ERROR; END_IF
END_FUNCTION_BLOCK

(* ------------------------------------------------------------------- MC_Halt *)
FUNCTION_BLOCK MC_Halt
VAR_IN_OUT
	Axis : AXIS_REF_SM3;
END_VAR
VAR_INPUT
	Execute : BOOL;
	Deceleration : LREAL;
	Jerk : LREAL;
	BufferMode : MC_BUFFER_MODE := mcbm_aborting;
END_VAR
VAR_OUTPUT
	Done : BOOL;
	Busy : BOOL;
	Active : BOOL;
	CommandAborted : BOOL;
	Error : BOOL;
	ErrorID : SMC_ERROR;
END_VAR
VAR
	_stp : OpenSML_Stop;
END_VAR
	IF Execute THEN
		Axis.fSetDeceleration := Deceleration;
		Axis.fSetJerk := Jerk;
	END_IF
	_stp(Axis := Axis.Drive, xStop := Execute);
	(* standstill reached (SW bit14) => done; axis remains ready for new moves *)
	Done := Execute AND Axis.Drive.StatusWord.14;
	Busy := Execute AND NOT Done;
	Active := Busy;
	CommandAborted := FALSE;
	Error := Axis.Drive.StatusWord.3;
	IF Error THEN ErrorID := SMC_STOP_ERROR_DURING_STOP;
	ELSE ErrorID := SMC_NO_ERROR; END_IF
END_FUNCTION_BLOCK

(* ------------------------------------------------------------------- MC_Stop *)
FUNCTION_BLOCK MC_Stop
VAR_IN_OUT
	Axis : AXIS_REF_SM3;
END_VAR
VAR_INPUT
	Execute : BOOL;
	Deceleration : LREAL;
	Jerk : LREAL;
END_VAR
VAR_OUTPUT
	Done : BOOL;
	Busy : BOOL;
	Error : BOOL;
	ErrorID : SMC_ERROR;
END_VAR
VAR
	_stp : OpenSML_Stop;
END_VAR
	IF Execute THEN
		Axis.fSetDeceleration := Deceleration;
		Axis.fSetJerk := Jerk;
	END_IF
	(* MC_Stop locks the axis while Execute is held (no new motion accepted) *)
	_stp(Axis := Axis.Drive, xStop := Execute);
	Done := Execute AND Axis.Drive.StatusWord.14;
	Busy := Execute AND NOT Done;
	Error := Axis.Drive.StatusWord.3;
	IF Error THEN ErrorID := SMC_STOP_ERROR_DURING_STOP;
	ELSE ErrorID := SMC_NO_ERROR; END_IF
END_FUNCTION_BLOCK

(* ------------------------------------------------------------------ MC_Reset *)
FUNCTION_BLOCK MC_Reset
VAR_IN_OUT
	Axis : AXIS_REF_SM3;
END_VAR
VAR_INPUT
	Execute : BOOL;
END_VAR
VAR_OUTPUT
	Done : BOOL;
	Busy : BOOL;
	Error : BOOL;
	ErrorID : SMC_ERROR;
END_VAR
	(* CiA 402 fault reset (Controlword bit 7); Done when fault (SW bit3) clears *)
	Axis.Drive.ControlWord.7 := Execute;
	Done := Execute AND NOT Axis.Drive.StatusWord.3;
	Busy := Execute AND Axis.Drive.StatusWord.3;
	Error := FALSE;
	ErrorID := SMC_NO_ERROR;
END_FUNCTION_BLOCK

(* ------------------------------------------------------------------- MC_Home *)
FUNCTION_BLOCK MC_Home
VAR_IN_OUT
	Axis : AXIS_REF_SM3;
END_VAR
VAR_INPUT
	Execute : BOOL;
	Position : LREAL;             (* absolute position at reference [u] *)
END_VAR
VAR_OUTPUT
	Done : BOOL;
	Busy : BOOL;
	CommandAborted : BOOL;
	Error : BOOL;
	ErrorID : SMC_ERROR;
END_VAR
VAR
	_hm : OpenSML_Home;
END_VAR
	IF Execute THEN
		Axis.fSetPosition := Position;
	END_IF
	_hm(Axis := Axis.Drive, xEnable := Execute);
	Done := _hm.xDone;
	Busy := Execute AND NOT _hm.xDone AND NOT _hm.xError;
	CommandAborted := FALSE;
	Error := _hm.xError;
	IF _hm.xError THEN ErrorID := SMC_H_HOMING_TIMEOUT;
	ELSE ErrorID := SMC_NO_ERROR; END_IF
END_FUNCTION_BLOCK

(* ------------------------------------------------------------- MC_ReadStatus *)
FUNCTION_BLOCK MC_ReadStatus
VAR_IN_OUT
	Axis : AXIS_REF_SM3;
END_VAR
VAR_INPUT
	Enable : BOOL;
END_VAR
VAR_OUTPUT
	Valid : BOOL;
	Busy : BOOL;
	Error : BOOL;
	ErrorID : SMC_ERROR;
	Disabled : BOOL;
	Errorstop : BOOL;
	Stopping : BOOL;
	StandStill : BOOL;
	DiscreteMotion : BOOL;
	ContinuousMotion : BOOL;
	SynchronizedMotion : BOOL;
	Homing : BOOL;
	ConstantVelocity : BOOL;
	Accelerating : BOOL;
	Decelerating : BOOL;
	FBErrorOccured : BOOL;
END_VAR
	Valid := Enable;
	Busy := FALSE;
	IF Enable THEN
		Disabled := Axis.nAxisState = SMC_AXIS_STATE.power_off;
		Errorstop := Axis.nAxisState = SMC_AXIS_STATE.errorstop;
		Stopping := Axis.nAxisState = SMC_AXIS_STATE.stopping;
		StandStill := Axis.nAxisState = SMC_AXIS_STATE.standstill;
		DiscreteMotion := Axis.nAxisState = SMC_AXIS_STATE.discrete_motion;
		ContinuousMotion := Axis.nAxisState = SMC_AXIS_STATE.continuous_motion;
		SynchronizedMotion := Axis.nAxisState = SMC_AXIS_STATE.synchronized_motion;
		Homing := Axis.nAxisState = SMC_AXIS_STATE.homing;
		Error := Axis.bError;
		FBErrorOccured := Axis.bError;
		IF Axis.bError THEN ErrorID := SMC_DI_AXIS_ERROR;
		ELSE ErrorID := SMC_NO_ERROR; END_IF
	END_IF
END_FUNCTION_BLOCK

(* ------------------------------------------------------ MC_ReadActualPosition *)
FUNCTION_BLOCK MC_ReadActualPosition
VAR_IN_OUT
	Axis : AXIS_REF_SM3;
END_VAR
VAR_INPUT
	Enable : BOOL;
END_VAR
VAR_OUTPUT
	Valid : BOOL;
	Busy : BOOL;
	Error : BOOL;
	ErrorID : SMC_ERROR;
	Position : LREAL;             (* [u] *)
END_VAR
	Valid := Enable;
	Busy := FALSE;
	Error := FALSE;
	ErrorID := SMC_NO_ERROR;
	IF Enable THEN
		Position := Axis.fActPosition;
	END_IF
END_FUNCTION_BLOCK

(* ------------------------------------------------------ MC_ReadActualVelocity *)
FUNCTION_BLOCK MC_ReadActualVelocity
VAR_IN_OUT
	Axis : AXIS_REF_SM3;
END_VAR
VAR_INPUT
	Enable : BOOL;
END_VAR
VAR_OUTPUT
	Valid : BOOL;
	Busy : BOOL;
	Error : BOOL;
	ErrorID : SMC_ERROR;
	Velocity : LREAL;            (* [u/s] *)
END_VAR
	Valid := Enable;
	Busy := FALSE;
	Error := FALSE;
	ErrorID := SMC_NO_ERROR;
	IF Enable THEN
		Velocity := Axis.fActVelocity;
	END_IF
END_FUNCTION_BLOCK

(* ---------------------------------------------------------- MC_ReadAxisError *)
FUNCTION_BLOCK MC_ReadAxisError
VAR_IN_OUT
	Axis : AXIS_REF_SM3;
END_VAR
VAR_INPUT
	Enable : BOOL;
END_VAR
VAR_OUTPUT
	Valid : BOOL;
	Busy : BOOL;
	Error : BOOL;
	ErrorID : SMC_ERROR;
	AxisError : BOOL;
	AxisErrorID : DWORD;
END_VAR
	Valid := Enable;
	Busy := FALSE;
	Error := FALSE;
	ErrorID := SMC_NO_ERROR;
	IF Enable THEN
		AxisError := Axis.bError;
		AxisErrorID := Axis.dwErrorID;
	END_IF
END_FUNCTION_BLOCK
