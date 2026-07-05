(*
 * PLCopen Motion Control (Part 1) function-block wrappers.
 *
 * Thin adapters exposing the canonical PLCopen `MC_*` names/interface over
 * the vendored OpenSML CiA 402 blocks. Position/velocity are expressed in
 * RAW DRIVE UNITS (increments / increments-per-second), matching the CiA 402
 * PDOs the OpenSML_Axis carries; engineering-unit scaling (LREAL) is a
 * planned enhancement once AXIS_REF carries a scale factor.
 *
 * NOTE ON SEMANTICS: OpenSML blocks are level-controlled. These wrappers map
 * PLCopen `Execute`/`Enable` directly to the OpenSML enable inputs, so a move
 * stays active while its trigger is held. Strict PLCopen rising-edge latching
 * (buffered modes, Aborting/Buffered) is not yet modelled.
 *)

FUNCTION_BLOCK MC_Power
VAR_IN_OUT
	Axis : OpenSML_Axis;
END_VAR
VAR_INPUT
	Enable : BOOL;
	EmergencyStop : BOOL := TRUE;   (* TRUE = quick-stop released (drive may run) *)
END_VAR
VAR_OUTPUT
	Status : BOOL;                  (* power stage enabled *)
	Error : BOOL;
END_VAR
VAR
	_impl : OpenSML_Power;
END_VAR
	_impl(Axis := Axis, xEnable := Enable, xEmergencyStop := EmergencyStop);
	Status := _impl.xDone;
	Error := _impl.xError;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_Home
VAR_IN_OUT
	Axis : OpenSML_Axis;
END_VAR
VAR_INPUT
	Execute : BOOL;
END_VAR
VAR_OUTPUT
	Done : BOOL;
	Error : BOOL;
END_VAR
VAR
	_impl : OpenSML_Home;
END_VAR
	_impl(Axis := Axis, xEnable := Execute);
	Done := _impl.xDone;
	Error := _impl.xError;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_MoveAbsolute
VAR_IN_OUT
	Axis : OpenSML_Axis;
END_VAR
VAR_INPUT
	Execute : BOOL;
	Position : DINT;                (* absolute target, drive increments *)
	Velocity : UDINT;              (* profile velocity, increments/s *)
	ContinuousUpdate : BOOL;       (* CiA402 change-set-immediately (CW bit 5) *)
END_VAR
VAR_OUTPUT
	Done : BOOL;
	Busy : BOOL;
	Error : BOOL;
END_VAR
VAR
	_impl : OpenSML_ProfilePosition;
END_VAR
	_impl(Axis := Axis, xEnable := Execute, xExecute := Execute,
	      xContinueMove := ContinuousUpdate, xRelativeMode := FALSE,
	      diTargetPosition := Position, udiProfileVelocity := Velocity);
	Done := _impl.xDone;
	Busy := _impl.xBusy;
	Error := _impl.xError;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_MoveRelative
VAR_IN_OUT
	Axis : OpenSML_Axis;
END_VAR
VAR_INPUT
	Execute : BOOL;
	Distance : DINT;               (* relative distance, drive increments *)
	Velocity : UDINT;
	ContinuousUpdate : BOOL;
END_VAR
VAR_OUTPUT
	Done : BOOL;
	Busy : BOOL;
	Error : BOOL;
END_VAR
VAR
	_impl : OpenSML_ProfilePosition;
END_VAR
	_impl(Axis := Axis, xEnable := Execute, xExecute := Execute,
	      xContinueMove := ContinuousUpdate, xRelativeMode := TRUE,
	      diTargetPosition := Distance, udiProfileVelocity := Velocity);
	Done := _impl.xDone;
	Busy := _impl.xBusy;
	Error := _impl.xError;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_MoveVelocity
VAR_IN_OUT
	Axis : OpenSML_Axis;
END_VAR
VAR_INPUT
	Execute : BOOL;
	Velocity : DINT;               (* target velocity, increments/s (signed) *)
END_VAR
VAR_OUTPUT
	InVelocity : BOOL;
	Error : BOOL;
END_VAR
VAR
	_impl : OpenSML_ProfileVelocity;
END_VAR
	_impl(Axis := Axis, xEnable := Execute, diTargetVelocity := Velocity);
	Error := _impl.xError;
	(* target-reached: velocity commanded and no error while enabled *)
	InVelocity := Execute AND NOT _impl.xError;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_Stop
VAR_IN_OUT
	Axis : OpenSML_Axis;
END_VAR
VAR_INPUT
	Execute : BOOL;
END_VAR
VAR_OUTPUT
	Done : BOOL;
END_VAR
VAR
	_impl : OpenSML_Stop;
END_VAR
	_impl(Axis := Axis, xStop := Execute);
	(* halt requested via CW bit 8; Done once axis reaches standstill (SW bit 14) *)
	Done := Execute AND Axis.StatusWord.14;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_Halt
VAR_IN_OUT
	Axis : OpenSML_Axis;
END_VAR
VAR_INPUT
	Execute : BOOL;
END_VAR
VAR_OUTPUT
	Done : BOOL;
END_VAR
VAR
	_impl : OpenSML_Stop;
END_VAR
	_impl(Axis := Axis, xStop := Execute);
	Done := Execute AND Axis.StatusWord.14;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_Reset
VAR_IN_OUT
	Axis : OpenSML_Axis;
END_VAR
VAR_INPUT
	Execute : BOOL;
END_VAR
VAR_OUTPUT
	Done : BOOL;
	Error : BOOL;
END_VAR
	(* Pulse CiA402 fault-reset (CW bit 7); Done when fault (SW bit 3) clears *)
	Axis.ControlWord.7 := Execute;
	Done := Execute AND NOT Axis.StatusWord.3;
	Error := FALSE;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_ReadActualPosition
VAR_IN_OUT
	Axis : OpenSML_Axis;
END_VAR
VAR_INPUT
	Enable : BOOL;
END_VAR
VAR_OUTPUT
	Valid : BOOL;
	Position : DINT;               (* drive increments *)
END_VAR
	Valid := Enable;
	IF Enable THEN
		Position := Axis.Position_Actual_Value;
	END_IF
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_ReadActualVelocity
VAR_IN_OUT
	Axis : OpenSML_Axis;
END_VAR
VAR_INPUT
	Enable : BOOL;
END_VAR
VAR_OUTPUT
	Valid : BOOL;
	Velocity : DINT;               (* increments/s *)
END_VAR
	Valid := Enable;
	IF Enable THEN
		Velocity := Axis.Velocity_Actual_Value;
	END_IF
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_ReadStatus
VAR_IN_OUT
	Axis : OpenSML_Axis;
END_VAR
VAR_INPUT
	Enable : BOOL;
END_VAR
VAR_OUTPUT
	Valid : BOOL;
	ErrorStop : BOOL;              (* SW bit 3: fault *)
	Disabled : BOOL;              (* NOT operation-enabled *)
	Standstill : BOOL;            (* SW bit 14 *)
	OperationEnabled : BOOL;      (* SW bit 2 *)
END_VAR
	Valid := Enable;
	IF Enable THEN
		ErrorStop := Axis.StatusWord.3;
		OperationEnabled := Axis.StatusWord.2;
		Disabled := NOT Axis.StatusWord.2;
		Standstill := Axis.StatusWord.14;
	END_IF
END_FUNCTION_BLOCK
