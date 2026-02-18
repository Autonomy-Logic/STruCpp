(* OSCAT Bit Manipulation Functions — End-to-End Tests *)

(* === BIT_TOGGLE_B: toggle a bit in a BYTE at a given position === *)

TEST 'BIT_TOGGLE_B: toggle bit 0 of 0 -> 1'
  VAR result : BYTE; END_VAR
  result := BIT_TOGGLE_B(IN := 0, POS := 0);
  ASSERT_EQ(result, 1);
END_TEST

TEST 'BIT_TOGGLE_B: toggle bit 0 of 1 -> 0'
  VAR result : BYTE; END_VAR
  result := BIT_TOGGLE_B(IN := 1, POS := 0);
  ASSERT_EQ(result, 0);
END_TEST

TEST 'BIT_TOGGLE_B: toggle bit 7 of 0 -> 128'
  VAR result : BYTE; END_VAR
  result := BIT_TOGGLE_B(IN := 0, POS := 7);
  ASSERT_EQ(result, 128);
END_TEST

TEST 'BIT_TOGGLE_B: toggle bit 3 of 255 -> 247'
  VAR result : BYTE; END_VAR
  result := BIT_TOGGLE_B(IN := 255, POS := 3);
  ASSERT_EQ(result, 247);
END_TEST

TEST 'BIT_TOGGLE_B: toggle bit 4 of 16#AA -> 16#BA'
  VAR result : BYTE; END_VAR
  result := BIT_TOGGLE_B(IN := 16#AA, POS := 4);
  (* 16#AA = 10101010, toggle bit 4 -> 10111010 = 16#BA = 186 *)
  ASSERT_EQ(result, 186);
END_TEST

(* === BYTE_TO_GRAY: binary to Gray code === *)

TEST 'BYTE_TO_GRAY: 0 -> 0'
  VAR result : BYTE; END_VAR
  result := BYTE_TO_GRAY(IN := 0);
  ASSERT_EQ(result, 0);
END_TEST

TEST 'BYTE_TO_GRAY: 1 -> 1'
  VAR result : BYTE; END_VAR
  result := BYTE_TO_GRAY(IN := 1);
  ASSERT_EQ(result, 1);
END_TEST

TEST 'BYTE_TO_GRAY: 2 -> 3'
  VAR result : BYTE; END_VAR
  result := BYTE_TO_GRAY(IN := 2);
  ASSERT_EQ(result, 3);
END_TEST

TEST 'BYTE_TO_GRAY: 3 -> 2'
  VAR result : BYTE; END_VAR
  result := BYTE_TO_GRAY(IN := 3);
  ASSERT_EQ(result, 2);
END_TEST

TEST 'BYTE_TO_GRAY: 4 -> 6'
  VAR result : BYTE; END_VAR
  result := BYTE_TO_GRAY(IN := 4);
  ASSERT_EQ(result, 6);
END_TEST

TEST 'BYTE_TO_GRAY: 255 -> 128'
  VAR result : BYTE; END_VAR
  result := BYTE_TO_GRAY(IN := 255);
  ASSERT_EQ(result, 128);
END_TEST

(* === GRAY_TO_BYTE: Gray code to binary === *)

TEST 'GRAY_TO_BYTE: 0 -> 0'
  VAR result : BYTE; END_VAR
  result := GRAY_TO_BYTE(IN := 0);
  ASSERT_EQ(result, 0);
END_TEST

TEST 'GRAY_TO_BYTE: 1 -> 1'
  VAR result : BYTE; END_VAR
  result := GRAY_TO_BYTE(IN := 1);
  ASSERT_EQ(result, 1);
END_TEST

TEST 'GRAY_TO_BYTE: 3 -> 2'
  VAR result : BYTE; END_VAR
  result := GRAY_TO_BYTE(IN := 3);
  ASSERT_EQ(result, 2);
END_TEST

TEST 'GRAY_TO_BYTE: 2 -> 3'
  VAR result : BYTE; END_VAR
  result := GRAY_TO_BYTE(IN := 2);
  ASSERT_EQ(result, 3);
END_TEST

TEST 'GRAY_TO_BYTE: 128 -> 255'
  VAR result : BYTE; END_VAR
  result := GRAY_TO_BYTE(IN := 128);
  ASSERT_EQ(result, 255);
END_TEST

(* === Round-trip: BYTE_TO_GRAY then GRAY_TO_BYTE === *)

TEST 'Round-trip: Gray(42) back to 42'
  VAR gray : BYTE; result : BYTE; END_VAR
  gray := BYTE_TO_GRAY(IN := 42);
  result := GRAY_TO_BYTE(IN := gray);
  ASSERT_EQ(result, 42);
END_TEST

TEST 'Round-trip: Gray(100) back to 100'
  VAR gray : BYTE; result : BYTE; END_VAR
  gray := BYTE_TO_GRAY(IN := 100);
  result := GRAY_TO_BYTE(IN := gray);
  ASSERT_EQ(result, 100);
END_TEST

TEST 'Round-trip: Gray(200) back to 200'
  VAR gray : BYTE; result : BYTE; END_VAR
  gray := BYTE_TO_GRAY(IN := 200);
  result := GRAY_TO_BYTE(IN := gray);
  ASSERT_EQ(result, 200);
END_TEST
