TEST 'TIME literal stored in nanoseconds'
  VAR uut : TimeTest; END_VAR
  uut();
  ASSERT_EQ(uut.result_ms, 1500000000);
END_TEST
