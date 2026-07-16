(*
 * Homing (CiA402 mode 6)
 * Vendored from OpenSML (https://github.com/feecat/OpenSML), GPL-3.0.
 * Part of the strucpp plcopen-softmotion bundled library.
 *)
FUNCTION_BLOCK OpenSML_Home
VAR_IN_OUT
	Axis:OpenSML_Axis;
END_VAR
VAR_INPUT
	xEnable:BOOL;
END_VAR
VAR_OUTPUT
	xDone:BOOL;
	xError:BOOL;
END_VAR
VAR
	iState:INT;
	tonTimeout:TON;
	Pos_Old:DINT;
END_VAR



(*
Home Function Block
Need Manually Write To SDO:
607C: Home Offset
6098: Home method
6099: Home Speeds*
609A: Home Acceleration

6099.01 - Home Speed for Search Limit Switch
6099.02 - Home Speed for Index Pulse
*)
CASE iState OF
	0:
		xDone:=FALSE;
		xError:=FALSE;
		IF xEnable AND Axis.StatusWord.1 AND Axis.StatusWord.2 AND Axis.Modes_of_operation_display = 6 AND NOT Axis.StatusWord.3 THEN//ready
			iState:=10;//go go
		ELSIF xEnable AND Axis.StatusWord.1 AND Axis.Modes_of_operation_display <> 6 THEN//need switch mode
			Axis.ControlWord.3:=FALSE;//drop down operation enabled
			iState:=10;
		ELSIF xEnable THEN
			iState:=999;//error
		END_IF
	10:
		Axis.ControlWord.4 := FALSE;//Reset reference bit
		Axis.Modes_of_operation:=6;//Home Mode
		Axis.ControlWord.3:=Axis.Modes_of_operation_display=6;//Success change mode, enable operation
		IF Axis.StatusWord.2 THEN//Operation Enabled
			iState:=20;
		END_IF
	20:
		Axis.ControlWord.4 := TRUE;//start reference
		tonTimeout(IN:=axis.Position_Actual_Value = Pos_Old, pt:=T#10S);//If Position didnt change, error
		Pos_Old:=Axis.Position_Actual_Value;
		IF Axis.StatusWord.12 THEN//If HomeAttained, Success
			tonTimeout(IN:=FALSE);
			Axis.ControlWord.4:=FALSE;
			Axis.Target_Position:=Axis.Position_Actual_Value;
			iState:=30;
		ELSIF tonTimeout.Q OR NOT xEnable OR Axis.StatusWord.3 OR Axis.StatusWord.13 THEN iState:=999;//error
		END_IF
	30:
		xDone:=TRUE;
		IF NOT xEnable THEN//Wait next home
			iState:=0;
		END_IF
	999:
		tonTimeout(IN:=FALSE);
		Axis.ControlWord.4:=FALSE;
		xError:=TRUE;
		IF NOT xEnable THEN
			iState:=0;
		END_IF
END_CASE

END_FUNCTION_BLOCK
