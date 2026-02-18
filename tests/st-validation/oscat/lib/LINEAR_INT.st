FUNCTION LINEAR_INT : REAL
VAR_INPUT
	X : REAL;
	XY : ARRAY[1..20,0..1] OF REAL;
	Pts : INT;
END_VAR
VAR
	i : INT;
END_VAR

(*
	version 1.1	27 dec 2007
	programmer 	oscat
	tested BY		oscat

LINEAR_INT calculates an output based on a linear interpolation of up to 20 coordinates given in an array
the input coordinates have to start at the lowest array position and must be sorted ba ascending X values.

*)

(*make sure n is bound within the array size *)
pts := MIN(pts,20);

(* calculate the linear segement interpolation *)
i := 2;
(* search for segment and calculate output
	below and above the defined segments we interpolate the last segment *)
WHILE (i < pts) AND (XY[i,0] < X) DO
	i := i + 1;
END_WHILE;

(* calculate the output value on the corresponding segment coordinates *)
LINEAR_INT := ((XY[i,1] - XY[i-1,1]) * X - XY[i,1] * XY[i-1,0] + XY[i-1,1] * XY[i,0]) / (XY[i,0] - XY[i-1,0]);

(* revision history
hm	7. oct 2007		rev 1.0
	original version

hm	27 dec 2007		rev 1.1
	changed code for better performance
*)

END_FUNCTION
