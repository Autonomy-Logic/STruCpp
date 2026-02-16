TEST 'FB implements interface method'
  VAR bot : Robot; ok : BOOL; END_VAR
  ok := bot.MoveTo(x := 10, y := 20);
  ASSERT_TRUE(ok);
  ASSERT_EQ(bot.posX, 10);
  ASSERT_EQ(bot.posY, 20);
END_TEST
