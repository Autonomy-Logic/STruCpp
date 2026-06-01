FUNCTION_BLOCK StringConversions
  VAR_OUTPUT
    (* STRING numeric parsers — strtol / strtoul / strtod under the hood,
       so `'3.14'` parses to 3 as an integer (strtol stops at the '.')
       and to 3.14 as a REAL. *)
    str_to_uint    : UINT;
    str_to_int     : INT;
    str_to_dint    : DINT;
    str_to_lint    : LINT;
    str_to_real    : REAL;
    str_to_lreal   : LREAL;
    str_negative   : INT;
    str_hex_skip   : UINT;
    str_bool_true  : BOOL;
    str_bool_false : BOOL;

    (* WSTRING numeric parsers — route through WSTRING_TO_STRING so the
       parse rules stay byte-identical with the STRING path.  Anything
       beyond the ASCII numeric subset is the user's responsibility
       (the transcoder truncates to the low byte). *)
    wstr_to_uint : UINT;
    wstr_to_real : LREAL;
    wstr_to_bool : BOOL;
  END_VAR
  VAR
    s_pi      : STRING := '3.14';
    s_half    : STRING := '4.5';
    s_neg     : STRING := '-42';
    s_trail   : STRING := '12abc';
    s_true    : STRING := 'TRUE';
    s_false   : STRING := 'no';
    ws_pi     : WSTRING := "3.14";
    ws_true   : WSTRING := "true";
  END_VAR

  str_to_uint    := TO_UINT(s_pi);     (* 3   — strtoul stops at '.' *)
  str_to_int     := TO_INT(s_pi);      (* 3 *)
  str_to_dint    := TO_DINT(s_pi);     (* 3 *)
  str_to_lint    := TO_LINT(s_pi);     (* 3 *)
  (* `3.14` round-trips bit-exact through LREAL (double) but loses
     precision narrowing to REAL (float).  Test framework's ASSERT_EQ
     does bit-exact float compare, so use an exactly-representable
     fraction here (`4.5` = 9/2 = exact in IEEE-754) instead of `3.14`. *)
  str_to_real    := TO_REAL(s_half);   (* 4.5 *)
  str_to_lreal   := TO_LREAL(s_pi);    (* 3.14 *)
  str_negative   := TO_INT(s_neg);     (* -42 *)
  str_hex_skip   := TO_UINT(s_trail);  (* 12  — strtoul stops at 'a' *)
  str_bool_true  := TO_BOOL(s_true);   (* TRUE *)
  str_bool_false := TO_BOOL(s_false);  (* FALSE *)

  wstr_to_uint := TO_UINT(ws_pi);    (* 3 *)
  wstr_to_real := TO_LREAL(ws_pi);   (* 3.14 *)
  wstr_to_bool := TO_BOOL(ws_true);  (* TRUE *)
END_FUNCTION_BLOCK
