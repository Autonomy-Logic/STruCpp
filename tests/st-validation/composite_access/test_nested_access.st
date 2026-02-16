TEST 'Nested struct member access'
  VAR uut : NestedAccessTest; END_VAR
  uut();
  ASSERT_EQ(uut.data.inner.value, 42);
END_TEST

TEST 'Nested struct in expression'
  VAR uut : NestedAccessTest; END_VAR
  uut();
  ASSERT_EQ(uut.result, 47);
END_TEST
