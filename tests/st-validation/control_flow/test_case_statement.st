TEST 'CASE selects correct branch'
  VAR uut : CaseTest; END_VAR
  uut();
  ASSERT_EQ(uut.basic_result, 20);
END_TEST

TEST 'CASE ELSE for unmatched value'
  VAR uut : CaseTest; END_VAR
  uut();
  ASSERT_EQ(uut.else_result, -1);
END_TEST

TEST 'CASE with range selects correctly'
  VAR uut : CaseTest; END_VAR
  uut();
  ASSERT_EQ(uut.range_result, 2);
END_TEST
