TEST 'Struct member assignment'
  VAR uut : StructMemberTest; END_VAR
  uut();
  ASSERT_EQ(uut.p.x, 3);
  ASSERT_EQ(uut.p.y, 4);
END_TEST

TEST 'Struct member in expression'
  VAR uut : StructMemberTest; END_VAR
  uut();
  ASSERT_EQ(uut.dist, 7);
END_TEST
