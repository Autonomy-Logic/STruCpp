FUNCTION_BLOCK State_Display
VAR_INPUT
	State : INT;
END_VAR

VAR_OUTPUT
	Stopped_led : BOOL;
	Running_led : BOOL;
	Manual_led : BOOL;
END_VAR

(* Determine State *)
LD State
EQ 0
JMPC state_stopped
LD State
EQ 1
JMPC state_running
LD State
EQ 2
JMPC state_manual
JMP exit_prg

state_stopped:
LD 1
ST Stopped_led
LD 0
ST Manual_led
ST Running_led
JMP exit_prg

state_running:
LD 1
ST Running_led
LD 0
ST Manual_led
ST Stopped_led
JMP exit_prg

state_manual:
LD 1
ST Manual_led
LD 0
ST Stopped_led
ST Running_led
JMP exit_prg


exit_prg:

END_FUNCTION_BLOCK