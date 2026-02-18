FUNCTION _ARRAY_SHUFFLE : BOOL
VAR_INPUT
	pt : POINTER TO ARRAY[0..32000] OF REAL;
	size : UINT;
END_VAR
VAR
	temp : REAL;
	pos  : INT;
	i: INT;
	stop: INT;
END_VAR


(*
version 1.2	30. mar. 2008
programmer 	kurt
tested by		hugo

this function will randomly shuffle the elements of an array
*)

stop := UINT_TO_INT(SHR(size,2)-1);
FOR i := 0 TO stop DO
        pos := RDM2(i+pos,0,stop);
        (* swap elements *)
        temp := pt^[i];
        pt^[i] := pt^[pos];
        pt^[pos] := temp;
END_FOR;

_ARRAY_SHUFFLE := TRUE;


(* revision History
hm 	4. mar 2008	rev 1.0
	original version

hm	16. mar. 2008	rev 1.1
	changed type of input size to uint

hm	30. mar. 2008	rev 1.2
	changed last in rdm2 fromm pos to i + pos to allow for more randomness

*)

END_FUNCTION
