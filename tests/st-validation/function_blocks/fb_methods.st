FUNCTION_BLOCK Motor
  VAR
    _speed : INT;
    _running : BOOL;
  END_VAR

  METHOD PUBLIC Start
    _running := TRUE;
  END_METHOD

  METHOD PUBLIC Stop
    _running := FALSE;
    _speed := 0;
  END_METHOD

  METHOD PUBLIC SetSpeed
    VAR_INPUT newSpeed : INT; END_VAR
    IF _running THEN
      _speed := newSpeed;
    END_IF;
  END_METHOD

  METHOD PUBLIC GetSpeed : INT
    GetSpeed := _speed;
  END_METHOD

  METHOD PUBLIC IsRunning : BOOL
    IsRunning := _running;
  END_METHOD
END_FUNCTION_BLOCK
