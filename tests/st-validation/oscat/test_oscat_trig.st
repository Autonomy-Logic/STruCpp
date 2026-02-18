(* OSCAT Trigonometric/Math Functions with Dependencies *)
(* Tests multi-function call chains: DEG -> MODR -> FLOOR2 *)

(* === FLOOR2: floor function for REAL === *)

TEST 'FLOOR2: positive exact'
  VAR result : DINT; END_VAR
  result := FLOOR2(X := 3.0);
  ASSERT_EQ(result, 3);
END_TEST

TEST 'FLOOR2: positive fractional'
  VAR result : DINT; END_VAR
  result := FLOOR2(X := 3.14);
  ASSERT_EQ(result, 3);
END_TEST

TEST 'FLOOR2: negative fractional rounds down'
  VAR result : DINT; END_VAR
  result := FLOOR2(X := -3.14);
  ASSERT_EQ(result, -4);
END_TEST

TEST 'FLOOR2: zero'
  VAR result : DINT; END_VAR
  result := FLOOR2(X := 0.0);
  ASSERT_EQ(result, 0);
END_TEST

(* === MODR: real modulo === *)

TEST 'MODR: 5.5 mod 2.5 = 0.5'
  VAR result : REAL; END_VAR
  result := MODR(IN := 5.5, DIVI := 2.5);
  ASSERT_NEAR(result, 0.5, 0.001);
END_TEST

TEST 'MODR: 10.0 mod 3.0 = 1.0'
  VAR result : REAL; END_VAR
  result := MODR(IN := 10.0, DIVI := 3.0);
  ASSERT_NEAR(result, 1.0, 0.001);
END_TEST

TEST 'MODR: division by 0 returns 0'
  VAR result : REAL; END_VAR
  result := MODR(IN := 5.0, DIVI := 0.0);
  ASSERT_NEAR(result, 0.0, 0.001);
END_TEST

TEST 'MODR: exact multiple returns 0'
  VAR result : REAL; END_VAR
  result := MODR(IN := 6.0, DIVI := 3.0);
  ASSERT_NEAR(result, 0.0, 0.001);
END_TEST

(* === DEG: radians to degrees === *)

TEST 'DEG: 0 radians = 0 degrees'
  VAR result : REAL; END_VAR
  result := DEG(rad := 0.0);
  ASSERT_NEAR(result, 0.0, 0.01);
END_TEST

TEST 'DEG: PI radians ~ 180 degrees'
  VAR result : REAL; END_VAR
  result := DEG(rad := 3.14159265358979);
  ASSERT_NEAR(result, 180.0, 0.01);
END_TEST

TEST 'DEG: PI/2 radians ~ 90 degrees'
  VAR result : REAL; END_VAR
  result := DEG(rad := 1.5707963267949);
  ASSERT_NEAR(result, 90.0, 0.01);
END_TEST

TEST 'DEG: 2*PI radians wraps to 0 degrees'
  VAR result : REAL; END_VAR
  result := DEG(rad := 6.28318530717959);
  ASSERT_NEAR(result, 0.0, 0.1);
END_TEST

TEST 'DEG: negative radians wrap correctly'
  VAR result : REAL; END_VAR
  result := DEG(rad := -1.5707963267949);
  (* -90 degrees, modulo 360 should wrap *)
  ASSERT_NEAR(result, 270.0, 0.1);
END_TEST
