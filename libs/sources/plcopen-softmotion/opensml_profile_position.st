(*
 * Profile Position mode (CiA402 mode 1)
 * Vendored from OpenSML (https://github.com/feecat/OpenSML), GPL-3.0.
 * Part of the strucpp plcopen-softmotion bundled library.
 *)
FUNCTION_BLOCK OpenSML_ProfilePosition
VAR_IN_OUT
	Axis:OpenSML_Axis;
END_VAR
VAR_INPUT
	xEnable:BOOL;
	xExecute: BOOL;
	xContinueMove: BOOL;
	xRelativeMode: BOOL;
	diTargetPosition:DINT;
	udiProfileVelocity:UDINT;
END_VAR
VAR_OUTPUT
	xDone: BOOL;
	xBusy: BOOL;
	xMoving: BOOL;
	xError: BOOL;
END_VAR
VAR
	iState:INT;
	tonTimeout:TON;
	tTimeOut:TIME:=T#200MS;
END_VAR


(*
Profile Position Mode (=1)
Manually Write To SDO or Write To PDO If Needed:
6083: Profile Acceleration
6084: Profile Deceleration
6085: Quick Stop Deceleration
*)
//Settings
Axis.ControlWord.5:=xContinueMove;//It means if 1st positon not arrived and there got 2st position, It Will No Deceleration And continues the movements.
Axis.ControlWord.6:=xRelativeMode;//0 is Absolute, 1 is Relative
Axis.ControlWord.4:=xExecute AND iState = 20;
xBusy:=iState=20 AND Axis.StatusWord.12 AND NOT Axis.StatusWord.10;//Acknowledge and not Reached
xDone:=iState=20 AND Axis.StatusWord.10 AND NOT Axis.StatusWord.13;//Target Reached and not Following Error
xMoving:=NOT Axis.StatusWord.14;//Not Standstill

CASE iState OF
	0://start
		xDone:=FALSE;
		xBusy:=FALSE;
		xError:=FALSE;
		IF xEnable AND Axis.StatusWord.1 AND Axis.StatusWord.2 AND Axis.Modes_of_operation_display = 1 AND NOT Axis.StatusWord.3 THEN//ready
			iState:=10;//go go
		ELSIF xEnable AND Axis.StatusWord.1 AND Axis.Modes_of_operation_display <> 1 THEN//need switch mode
			Axis.ControlWord.3:=FALSE;//drop down operation enabled
			iState:=10;
		ELSIF xEnable THEN
			iState:=999;//error
		END_IF
	10://Set Mode
		Axis.Modes_of_operation:=1;//Profile Position Mode
		Axis.ControlWord.3:=Axis.Modes_of_operation_display=1;//Success change mode, enable operation
		IF Axis.StatusWord.2 AND Axis.Modes_of_operation_display = 1 THEN//Operation Enabled, Mode Changed success
			iState:=20;
		END_IF
	20://Movement
		Axis.Profile_Velocity:=udiProfileVelocity;
		Axis.Target_Position:=diTargetPosition;
		IF Axis.StatusWord.13 OR Axis.StatusWord.3 THEN//Axis Error
			iState:=999;
		ELSIF NOT xEnable THEN
			Axis.Profile_Velocity:=0;
			Axis.Target_Position:=0;
			iState:=0;
		END_IF
	999://Error wait
		Axis.Profile_Velocity:=0;
		Axis.Target_Position:=0;
		tonTimeout(IN:=FALSE);
		xError:=TRUE;
		IF NOT xEnable THEN
			iState:=0;
		END_IF
END_CASE





END_FUNCTION_BLOCK
