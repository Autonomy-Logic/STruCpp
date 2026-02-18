FUNCTION OSCAT_VERSION : DWORD
VAR_INPUT
	IN : BOOL;
END_VAR


(*
version 1.1	16 dec 2007
programmer 	hugo
tested by		oscat

oscat_version returns the version number in dword format
132 is library version 1.32
if IN = true, the release date will be returned

*)

IF in THEN
	OSCAT_VERSION := DATE_TO_DWORD(D#2024-07-16);
ELSE
	OSCAT_VERSION := 335;
END_IF;

(* revision history
hm	6. oct 2006	rev 1.0
	original version

hm	16. dec 2007	rev 1.1
	added possibility to return date and version depending on IN.

*)

END_FUNCTION
