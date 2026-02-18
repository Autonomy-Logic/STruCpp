FUNCTION _ARRAY_ADD : BOOL
VAR_INPUT
	pt : POINTER TO ARRAY[0..32000] OF REAL;
	size : UINT;
	X : REAL;
END_VAR
VAR
	i: UINT;
	stop: UINT;
END_VAR

(*
version 1.0	2. apr. 2008
programmer 	hugo
tested by	tobias

this function will add an offset X to each element of the array and stroe the result instead of the element.
Array[i] := ARRAY[i] + X.
the function needs to be called:	array_avg(adr("array"),sizeof("array"));
because this function works with pointers its very time efficient and it needs no extra memory.

*)

stop := SHR(size,2)-1;
FOR i := 0 TO stop DO
	PT^[i] := PT^[i] + X;
END_FOR;
_ARRAY_ADD := TRUE;


(* revision history
hm	2. apr 2008		rev 1.0
	original version

*)

END_FUNCTION
