(*
 * MC_Power power stage / CiA402 enable sequence
 * Vendored from OpenSML (https://github.com/feecat/OpenSML), GPL-3.0.
 * Part of the strucpp plcopen-softmotion bundled library.
 *)
FUNCTION_BLOCK OpenSML_Power
VAR_IN_OUT
	Axis:OpenSML_Axis;
END_VAR
VAR_INPUT
	xEnable: BOOL;
	xEmergencyStop: BOOL:=TRUE;
END_VAR
VAR_OUTPUT
	xDone: BOOL;
	xError: BOOL;
END_VAR
VAR
	iState:INT;
	tonTimeout:TON;
	tTimeOut:TIME:=T#500MS;
END_VAR


(*
MC_Power
Can Also be used MC_Reset, just trigger xEnable.
It is Highly Recommend to use OpenSML_Stop to force stop movements.
*)
Axis.ControlWord.2:=xEmergencyStop;//QuickStop
CASE iState OF
	0://start
		xDone:=FALSE;
		xError:=FALSE;
		Axis.ControlWord.0:=FALSE;//SwitchOn
		Axis.ControlWord.1:=FALSE;//EnableVoltage
		Axis.ControlWord.3:=FALSE;//EnableOperation
		Axis.ControlWord.7:=FALSE;//FaultReset
		IF xEnable THEN
			IF Axis.StatusWord.3 THEN iState:=10;//If there have error, Reset first
			ELSE iState:=20;//No error, go go
			END_IF
		END_IF
	10://reset
		Axis.ControlWord.7:=TRUE;//bit7 faultreset
		tonTimeout(IN:=TRUE,PT:=tTimeOut);
		IF tonTimeout.Q AND NOT Axis.StatusWord.3 THEN//not fault
			Axis.ControlWord.7:=FALSE;//bit7 faultreset
			tonTimeout(IN:=FALSE);
			iState:=20;
		ELSIF tonTimeout.Q THEN iState:=999;//error
		END_IF
	20://Enable Voltage
		Axis.ControlWord.1:=TRUE;
		tonTimeout(IN:=TRUE,PT:=tTimeOut);
		IF Axis.StatusWord.0 THEN//ReadyToSwitchOn
			tonTimeout(IN:=FALSE);
			iState:=30;
		ELSIF tonTimeout.Q THEN iState:=999;//error
		END_IF
	30://Switch ON
		Axis.ControlWord.0:=TRUE;
		tonTimeout(IN:=TRUE,pt:=tTimeOut);
		IF Axis.StatusWord.1 THEN
			tonTimeout(IN:=FALSE);
			iState:=40;
		ELSIF tonTimeout.Q THEN iState:=999;//error
		END_IF
	40://EnableOperation
		Axis.Target_Position:=Axis.Position_Actual_Value;
		Axis.ControlWord.3:=TRUE;
		tonTimeout(IN:=TRUE,pt:=tTimeOut);
		IF Axis.StatusWord.2 THEN
			tonTimeout(IN:=FALSE);
			iState:=50;
		ELSIF tonTimeout.Q THEN iState:=999;//error
		END_IF
	50://Success
		xDone:=TRUE;
		IF NOT xEnable THEN
			Axis.ControlWord.3:=FALSE;
			iState:=0;
		END_IF
		IF Axis.StatusWord.3 THEN
			iState:=999;//Error when running
		END_IF
	999://Error wait
		tonTimeout(IN:=FALSE);
		xError:=TRUE;
		IF NOT xEnable THEN
			iState:=0;
		END_IF
END_CASE





END_FUNCTION_BLOCK
