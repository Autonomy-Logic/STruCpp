(* Regression suite for the temporal-to-numeric scaling fix.
   The original bug: TO_UINT(T#5s) returned the low 16 bits of the
   nanosecond count (61952) instead of the expected ms count (5000).
   Codegen now wraps temporal args with the appropriate *_TO_MS
   helper before the integer cast.  These tests pin every elementary
   temporal source so the scaling can't silently regress. *)

TEST 'TIME_TO_DINT returns milliseconds'
  VAR uut : TimeConversions; END_VAR
  uut();
  ASSERT_EQ(uut.ms_via_dint, 1500);
END_TEST

TEST 'TIME_TO_UINT returns milliseconds (low 16 bits when overflowing)'
  VAR uut : TimeConversions; END_VAR
  uut();
  ASSERT_EQ(uut.ms_via_uint, 1500);
END_TEST

TEST 'TIME_TO_REAL returns milliseconds as float'
  VAR uut : TimeConversions; END_VAR
  uut();
  ASSERT_EQ(uut.ms_via_real, 1500.0);
END_TEST

TEST 'TIME_TO_US returns microseconds (explicit helper, not codegen wrap)'
  VAR uut : TimeConversions; END_VAR
  uut();
  ASSERT_EQ(uut.unit_us, 1500000);
END_TEST

TEST 'TIME_TO_S returns seconds as float'
  VAR uut : TimeConversions; END_VAR
  uut();
  ASSERT_EQ(uut.unit_seconds, 1.5);
END_TEST

TEST 'TOD_TO_DINT returns milliseconds since midnight'
  VAR uut : TimeConversions; END_VAR
  uut();
  ASSERT_EQ(uut.tod_ms, 21600000);
END_TEST

TEST 'DT_TO_LINT returns milliseconds since epoch'
  VAR uut : TimeConversions; END_VAR
  uut();
  ASSERT_EQ(uut.dt_ms, 1000);
END_TEST

TEST 'DATE_TO_UINT returns days since 1970-01-01 (identity, no scaling)'
  VAR uut : TimeConversions; END_VAR
  uut();
  ASSERT_EQ(uut.date_days, 14);
END_TEST
