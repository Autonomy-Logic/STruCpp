(*
 * OpenSML Cyclic Synchronous Velocity via S7RTT OTG (streams position in mode 8).
 * Vendored from OpenSML (https://github.com/feecat/OpenSML), GPL-3.0.
 *)
FUNCTION_BLOCK OpenSML_SyncVelocity
VAR_IN_OUT
	Axis:OpenSML_Axis;
END_VAR
VAR_INPUT
	MaxVelocity :LREAL:=2000;
	MaxAcceleration :LREAL:=200;
	MaxJerk :LREAL:=200;
	CycleTime:LREAL:=0.001;//0.001 = 1ms

	TargetVelocity :LREAL;
	xEnable: BOOL;
	lrScale:LREAL:=1.0;
	xSimulation: BOOL;
END_VAR
VAR_OUTPUT
	xError: BOOL;
END_VAR
VAR
	otg : FB_S7RTT_OTG;
	iState:INT;
	
END_VAR


(*
Normally we use CSP(=8) as CSV(=9) cus mostly servo dont have TargetVelocity PDO by default.
If you really want use CSV mode, Please connect OpenSML_SyncVelocity.otg.NewVelocity to TargetVelocity PDO after scale.

Cyclic Synchronous Position Mode (=8)
Set 6060(Op mode) and 60C2(Interpolation time period) at Startup Parameters.

#####################################
NEED StruckigLight Library for Quadratic Velocity Ramp Calculate.

If in movement, Please DO NOT Drop down xEnable.
#####################################
*)
CASE iState OF
	0://start
		xError:=FALSE;
		IF xEnable AND Axis.StatusWord.1 AND Axis.StatusWord.2 AND Axis.Modes_of_operation_display = 8 AND NOT Axis.StatusWord.3 THEN//ready
			iState:=10;//go go
		ELSIF xEnable AND Axis.StatusWord.1 AND Axis.Modes_of_operation_display <> 8 THEN//need switch mode
			Axis.ControlWord.3:=FALSE;//drop down operation enabled, motor could free move
			iState:=10;
		ELSIF xSimulation THEN
			iState:=20;
		ELSIF xEnable THEN
			iState:=999;//error
		END_IF
	10://Set Mode
		Axis.Modes_of_operation:=8;//Cyclic Synchronous Position Mode
		Axis.ControlWord.3:=Axis.Modes_of_operation_display=8;//Success change mode, enable operation
		otg.CurrentPosition:=DINT_TO_LREAL(Axis.Position_Actual_Value) / lrScale;//Write actual position to otg
		IF Axis.StatusWord.2 AND Axis.Modes_of_operation_display = 8 THEN//Operation Enabled, Mode Changed success
			iState:=20;
		END_IF
	20://Movement
		otg(
			ControlInterface:= TRUE , 
			TargetPosition:= 0 , 
			TargetVelocity:= TargetVelocity , 
			CycleTime:=CycleTime,
			MaxVelocity:= MaxVelocity , 
			MaxAcceleration:= MaxAcceleration , 
			MaxJerk:= MaxJerk);//accept new velocity and going on
			
		IF otg.NewPosition >= 0 THEN
			Axis.Target_Position := LREAL_TO_DINT(otg.NewPosition * lrScale);
		ELSE
			Axis.Target_Position := - LREAL_TO_DINT( - otg.NewPosition * lrScale);//it fix negative overflow problem.
		END_IF
		
		IF Axis.StatusWord.13 OR Axis.StatusWord.3 OR otg.xError THEN//Axis Error
			iState:=999;
		ELSIF NOT xEnable THEN
			iState:=0;
		END_IF
	999://Error wait
		xError:=TRUE;
		IF NOT xEnable THEN
			iState:=0;
		END_IF
END_CASE





END_FUNCTION_BLOCK
