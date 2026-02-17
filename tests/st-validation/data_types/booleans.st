PROGRAM BooleanTypeTest
  VAR
    t : BOOL;
    f : BOOL;
    and_tt : BOOL;
    and_tf : BOOL;
    or_ff : BOOL;
    or_tf : BOOL;
    not_t : BOOL;
    not_f : BOOL;
  END_VAR

  t := TRUE;
  f := FALSE;
  and_tt := t AND t;
  and_tf := t AND f;
  or_ff := f OR f;
  or_tf := t OR f;
  not_t := NOT t;
  not_f := NOT f;
END_PROGRAM
