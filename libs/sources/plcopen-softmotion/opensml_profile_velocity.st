(*
 * Profile Velocity mode (CiA402 mode 3)
 * Vendored from OpenSML (https://github.com/feecat/OpenSML), GPL-3.0.
 * Part of the strucpp plcopen-softmotion bundled library.
 *)
FUNCTION_BLOCK OpenSML_ProfileVelocity
VAR_IN_OUT
	Axis:OpenSML_Axis;
END_VAR
VAR_INPUT
	xEnable:BOOL;
	diTargetVelocity:DINT;
END_VAR
VAR_OUTPUT
	xError: BOOL;
END_VAR
VAR
	iState:INT;
	tonTimeout:TON;
	tTimeOut:TIME:=T#200MS;
END_VAR



(*
Profile Velocity Mode (=3)
Manually Write To SDO or Write To PDO If Needed:
6083: Profile Acceleration
6084: Profile Deceleration
6085: Quick Stop Deceleration
*)
CASE iState OF
	0://start
		xError:=FALSE;
		IF xEnable AND Axis.StatusWord.1 AND Axis.StatusWord.2 AND Axis.Modes_of_operation_display = 3 AND NOT Axis.StatusWord.3 THEN//ready
			iState:=10;//go go
		ELSIF xEnable AND Axis.StatusWord.1 AND Axis.Modes_of_operation_display <> 3 THEN//need switch mode
			Axis.ControlWord.3:=FALSE;//drop down operation enabled
			iState:=10;
		ELSIF xEnable THEN
			iState:=999;//error
		END_IF
	10://Set Mode
		Axis.Modes_of_operation:=3;//Profile Velocity Mode
		Axis.ControlWord.3:=Axis.Modes_of_operation_display=3;//Success change mode, enable operation
		IF Axis.StatusWord.2 AND Axis.Modes_of_operation_display = 3 THEN//Operation Enabled, Mode Changed success
			iState:=20;
		END_IF
	20://Movement
		Axis.Target_Velocity:=diTargetVelocity;
		IF Axis.StatusWord.3 THEN
			iState:=999;
		ELSIF NOT xEnable THEN
			Axis.Target_Velocity:=0;
			iState:=0;
		END_IF
	999://Error wait
		Axis.Target_Velocity:=0;
		tonTimeout(IN:=FALSE);
		xError:=TRUE;
		IF NOT xEnable THEN
			iState:=0;
		END_IF
END_CASE





END_FUNCTION_BLOCK
