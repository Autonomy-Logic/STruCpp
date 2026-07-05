(*
 * OpenSML_AxisController — high-level jog/follow controller over OpenSML_Control.
 * Vendored from OpenSML (https://github.com/feecat/OpenSML), GPL-3.0.
 *)
FUNCTION_BLOCK OpenSML_AxisController
VAR_IN_OUT
	Axis:OpenSML_Axis;
	Control:OpenSML_Control;
END_VAR
VAR
	Power:OpenSML_Power;
	Home:OpenSML_Home;
	iState:INT;
	otg : FB_S7RTT_OTG;
	InterfaceType:BOOL;
	JogVel:LREAL;
	MoveVel:LREAL;
END_VAR




Power(
	Axis:=Axis , 
	xEnable:=Control.xAxisEnable , 
	xEmergencyStop:=Control.xEmergencyStop ,
	xDone=>Control.xEnabled );

Home(
	Axis:=Axis , 
	xEnable:=Control.xHomeEnable AND NOT Control.xMoveEnable ,
	xDone=>Control.xHomeDone );

(*
Cyclic Synchronous Position Mode (=8)
Set 6060(Op mode) and 60C2(Interpolation time period) at Startup Parameters.

#####################################
NEED StruckigLight Library for Quadratic Velocity Ramp Calculate.

If in movement, Please DO NOT Drop down xEnable.
#####################################
*)

Control.xInPosition:=FALSE;

IF control.xSimulation THEN
	Axis.Position_Actual_Value:=Axis.Target_Position;
END_IF

control.lrActualPosition:=DINT_TO_LREAL(Axis.Position_Actual_Value) / Control.Scale;

CASE iState OF
	0://start
		Control.xError:=FALSE;
		IF Control.xMoveEnable AND Axis.StatusWord.1 AND Axis.StatusWord.2 AND Axis.Modes_of_operation_display = 8 AND NOT Axis.StatusWord.3 THEN//ready
			iState:=10;//go go
		ELSIF Control.xMoveEnable AND Axis.StatusWord.1 AND Axis.Modes_of_operation_display <> 8 THEN//need switch mode
			Axis.ControlWord.3:=FALSE;//drop down operation enabled, motor could free move
			iState:=10;
		ELSIF Control.xMoveEnable AND Control.xSimulation THEN
			iState:=20;
		ELSIF Control.xMoveEnable THEN
			iState:=999;//error
		END_IF
	10://Set Mode
		Axis.Modes_of_operation:=8;//Cyclic Synchronous Position Mode
		Axis.ControlWord.3:=Axis.Modes_of_operation_display=8;//Success change mode, enable operation
		otg.CurrentPosition:=DINT_TO_LREAL(Axis.Position_Actual_Value) / Control.Scale;//Write actual position to otg
		IF Axis.StatusWord.2 AND Axis.Modes_of_operation_display = 8 THEN//Operation Enabled, Mode Changed success
			iState:=20;
		END_IF
	20://Movement
		IF Control.JogPos AND NOT Control.xFollowEnable THEN
			InterfaceType:=1;
			JogVel:=MIN(Control.JogVelocity, Control.MaxVelocity);
		ELSIF Control.JogNeg AND NOT Control.xFollowEnable THEN
			InterfaceType:=1;
			JogVel:=MAX(-Control.JogVelocity, -Control.MaxVelocity);
		ELSE
			InterfaceType:=1;
			JogVel:=0;
		END_IF
		
		IF Control.xFollowEnable AND Control.lrFollowVelocity > 0 THEN
			InterfaceType:=0;
			MoveVel:=MIN(Control.lrFollowVelocity, Control.MaxVelocity);
		ELSE
			MoveVel:= Control.MaxVelocity;
		END_IF
		
		otg(
			ControlInterface:= InterfaceType,
			TargetPosition:= Control.lrFollowPosition , 
			TargetVelocity:= JogVel , 
			CycleTIme:= Control.CycleTime,
			MaxVelocity:= MoveVel,//Control.para.MaxVelocity , 
			MaxAcceleration:= Control.MaxAcceleration , 
			MaxJerk:= Control.MaxJerk);//accept new position and going on
			
		IF otg.NewPosition >= 0 THEN
			Axis.Target_Position := LREAL_TO_DINT(otg.NewPosition * Control.Scale);
		ELSE
			Axis.Target_Position := - LREAL_TO_DINT( - otg.NewPosition * Control.Scale);//it fix negative overflow problem.
		END_IF
		
		Control.xInPosition := ABS(otg.NewPosition - Control.lrActualPosition) < 0.01;
		
		IF Axis.StatusWord.13 OR Axis.StatusWord.3 OR otg.xError OR Power.xError OR Home.xError THEN//Axis Error
			iState:=999;
		ELSIF NOT Control.xMoveEnable THEN
			iState:=0;
		END_IF
	999://Error wait
		Control.xError:=TRUE;
		IF NOT Control.xMoveEnable THEN
			iState:=0;
		END_IF
END_CASE








END_FUNCTION_BLOCK
