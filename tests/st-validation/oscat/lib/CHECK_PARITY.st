FUNCTION CHECK_PARITY : BOOL
VAR_INPUT
	in : DWORD;
	p : BOOL;
END_VAR


(*
version 1.3	18 feb 2008
programmer 	hugo
tested by	tobias

this function checks for an even partity for a dword and partity bit.

*)

CHECK_PARITY := NOT p;
WHILE in > 0 DO
	CHECK_PARITY := CHECK_PARITY XOR in.0 XOR in.1 XOR in.2 XOR in.3;
	in := SHR(in,4);
END_WHILE;

(* code before rev 1.2
WHILE in > 0 DO
	IF in.0 THEN cnt := cnt + 1; END_IF;
	in := SHR(in,1);
END_WHILE;
check_parity := even(cnt) XOR P;
*)


(* revision history

rev 1.0 HM  1.oct.2006

rev 1.1 hm	10.sep.2007
	changed algorithm to improove performance

rev 1.2	hm	8 dec 2007
	changed algorithm to improove performance

rev 1.3 hm	18. feb 2008
	changed algorithm to improove performance
*)

END_FUNCTION
