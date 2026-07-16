(*
 * OpenSML_Control — aggregate axis command/status structure.
 * Vendored from OpenSML (https://github.com/feecat/OpenSML), GPL-3.0.
 *)
TYPE OpenSML_Control :
STRUCT
	xAxisEnable: BOOL;//Axis Hardware Enable
	xMoveEnable: BOOL;//Jog&Pos Movement Enable
	xHomeEnable: BOOL;//Home Function Enable
	xSimulation: BOOL;//Simulation Mode
	xEmergencyStop: BOOL:=TRUE;//Emergency Stop
	
	JogPos: BOOL;//Jog Positive
	JogNeg: BOOL;//Jog Negative
	JogVelocity: LREAL:=10;//Jog Velocity
	
	lrActualPosition: LREAL;//Actual Position Feedback
	
	lrFollowPosition: LREAL;//Follow Target Position, Can be set to new value at any time
	lrFollowVelocity: LREAL:=20;//Follow Move Velocity, Can be set to new value at any time
	xFollowEnable: BOOL;//Follow Move Enable

	xError: BOOL;//Error
	xBusy: BOOL;//Busy, Normal Working State
	xInPosition: BOOL;//In Position
	xEnabled: BOOL;//Axis Hardware Enabled
	xHomeDone: BOOL;//Axis Home Done
	
	MaxVelocity: LREAL:=100;//Max Velocity
	MaxAcceleration: LREAL:=1000;//Max Acceleration
	MaxJerk: LREAL:=10000;//Max Jerk
	CycleTime: LREAL:=0.001;//Task Cycle Time, 0.001 = 1ms
	Scale: LREAL:=16#1000;//Scale
	
	Axis:OpenSML_Axis;//Axis Reference
END_STRUCT
END_TYPE
