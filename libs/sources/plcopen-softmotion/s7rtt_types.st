(*
 * S7RTT motion-state / limits structures.
 * Vendored from S7RTT (https://github.com/feecat/S7RTT), Apache-2.0.
 * Converted from PLCopen XML. Single-axis 7-segment S-curve OTG.
 *)

TYPE ST_MotionLimits :
STRUCT
	fVelMax : LREAL;
	fAccMax : LREAL;
	fJerkMax : LREAL;
END_STRUCT
END_TYPE

TYPE ST_MotionState :
STRUCT
	fDuration : LREAL := 0.0;
	fPos : LREAL := 0.0;
	fVel : LREAL := 0.0;
	fAcc : LREAL := 0.0;
	fJerk : LREAL := 0.0;
END_STRUCT
END_TYPE
