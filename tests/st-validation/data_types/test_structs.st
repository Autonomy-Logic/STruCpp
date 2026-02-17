TEST 'Struct member access'
  VAR uut : StructTest; END_VAR
  uut();
  ASSERT_EQ(uut.p.x, 10);
  ASSERT_EQ(uut.p.y, 20);
END_TEST

TEST 'Struct member arithmetic'
  VAR uut : StructTest; END_VAR
  uut();
  ASSERT_EQ(uut.sum, 30);
END_TEST
