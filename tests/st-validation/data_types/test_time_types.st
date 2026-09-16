(* Regression suite for the temporal-to-numeric scaling fix.
   The original bug: TO_UINT(T#5s) returned the low 16 bits of the
   nanosecond count (61952) instead of the expected ms count (5000).
   Codegen wraps temporal args with a unit helper before the integer
   cast.  The unit is CODESYS's, per type: milliseconds for TIME and
   TOD, seconds for DT and DATE (DOPE-618).  These tests pin every
   elementary temporal source so the scaling can't silently regress. *)

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

TEST 'DT_TO_LINT returns seconds since epoch, as CODESYS does'
  VAR uut : TimeConversions; END_VAR
  uut();
  (* Was 1000 (milliseconds) before DOPE-618.  CODESYS holds DT in seconds:
     DT_TO_DINT(DT#2019-9-1-12:0:0.0) = 1567339200. *)
  ASSERT_EQ(uut.dt_seconds, 1);
END_TEST

TEST 'DATE_TO_UDINT returns seconds since 1970-01-01, as CODESYS does'
  VAR uut : TimeConversions; END_VAR
  uut();
  (* Was 14 (a day count) before DOPE-618.  CODESYS keeps DATE in DT's
     memory format: DATE_TO_DINT(D#1970-1-2) = 86400, not 1.  This is why
     every OSCAT DATE helper divided by 86400 and got zero. *)
  ASSERT_EQ(uut.date_seconds, 1209600);
END_TEST
