(* End-to-end coverage for STRING / WSTRING → numeric conversions.
   STRING parsers route through `strtol` / `strtoul` / `strtod`; WSTRING
   parsers route through `WSTRING_TO_STRING` first so the wide path
   stays byte-identical with the narrow one.  Pin both surfaces so a
   future reroute (e.g. someone switching to a UTF-16-aware parser)
   doesn't silently change observable behaviour. *)

TEST 'TO_UINT of "3.14" stops at the dot (parses to 3)'
  VAR uut : StringConversions; END_VAR
  uut();
  ASSERT_EQ(uut.str_to_uint, 3);
END_TEST

TEST 'TO_INT of "3.14" stops at the dot (parses to 3)'
  VAR uut : StringConversions; END_VAR
  uut();
  ASSERT_EQ(uut.str_to_int, 3);
END_TEST

TEST 'TO_DINT of "3.14" stops at the dot (parses to 3)'
  VAR uut : StringConversions; END_VAR
  uut();
  ASSERT_EQ(uut.str_to_dint, 3);
END_TEST

TEST 'TO_LINT of "3.14" stops at the dot (parses to 3)'
  VAR uut : StringConversions; END_VAR
  uut();
  ASSERT_EQ(uut.str_to_lint, 3);
END_TEST

TEST 'TO_REAL of "4.5" parses the fraction (bit-exact via REAL)'
  VAR uut : StringConversions; END_VAR
  uut();
  ASSERT_EQ(uut.str_to_real, 4.5);
END_TEST

TEST 'TO_LREAL of "3.14" parses the fraction at LREAL precision'
  VAR uut : StringConversions; END_VAR
  uut();
  ASSERT_EQ(uut.str_to_lreal, 3.14);
END_TEST

TEST 'TO_INT of "-42" parses the sign'
  VAR uut : StringConversions; END_VAR
  uut();
  ASSERT_EQ(uut.str_negative, -42);
END_TEST

TEST 'TO_UINT of "12abc" stops at the first non-digit (parses to 12)'
  VAR uut : StringConversions; END_VAR
  uut();
  ASSERT_EQ(uut.str_hex_skip, 12);
END_TEST

TEST 'TO_BOOL of "TRUE" returns TRUE'
  VAR uut : StringConversions; END_VAR
  uut();
  ASSERT_EQ(uut.str_bool_true, TRUE);
END_TEST

TEST 'TO_BOOL of "no" returns FALSE'
  VAR uut : StringConversions; END_VAR
  uut();
  ASSERT_EQ(uut.str_bool_false, FALSE);
END_TEST

TEST 'WSTRING TO_UINT of "3.14" parses to 3 (matches STRING surface)'
  VAR uut : StringConversions; END_VAR
  uut();
  ASSERT_EQ(uut.wstr_to_uint, 3);
END_TEST

TEST 'WSTRING TO_LREAL of "3.14" parses to 3.14 (matches STRING surface)'
  VAR uut : StringConversions; END_VAR
  uut();
  ASSERT_EQ(uut.wstr_to_real, 3.14);
END_TEST

TEST 'WSTRING TO_BOOL of "true" returns TRUE'
  VAR uut : StringConversions; END_VAR
  uut();
  ASSERT_EQ(uut.wstr_to_bool, TRUE);
END_TEST
