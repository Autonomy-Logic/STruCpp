(* OSCAT Hyperbolic Functions — End-to-End Tests *)

(* === ACOSH: inverse hyperbolic cosine === *)

TEST 'ACOSH: acosh(1) = 0'
  VAR result : REAL; END_VAR
  result := ACOSH(X := 1.0);
  ASSERT_NEAR(result, 0.0, 0.001);
END_TEST

TEST 'ACOSH: acosh(2) ~ 1.3169'
  VAR result : REAL; END_VAR
  result := ACOSH(X := 2.0);
  ASSERT_NEAR(result, 1.3169, 0.001);
END_TEST

TEST 'ACOSH: acosh(10) ~ 2.9932'
  VAR result : REAL; END_VAR
  result := ACOSH(X := 10.0);
  ASSERT_NEAR(result, 2.9932, 0.001);
END_TEST

(* === ASINH: inverse hyperbolic sine === *)

TEST 'ASINH: asinh(0) = 0'
  VAR result : REAL; END_VAR
  result := ASINH(X := 0.0);
  ASSERT_NEAR(result, 0.0, 0.001);
END_TEST

TEST 'ASINH: asinh(1) ~ 0.8814'
  VAR result : REAL; END_VAR
  result := ASINH(X := 1.0);
  ASSERT_NEAR(result, 0.8814, 0.001);
END_TEST

TEST 'ASINH: asinh(-1) ~ -0.8814'
  VAR result : REAL; END_VAR
  result := ASINH(X := -1.0);
  ASSERT_NEAR(result, -0.8814, 0.001);
END_TEST

TEST 'ASINH: asinh(5) ~ 2.3124'
  VAR result : REAL; END_VAR
  result := ASINH(X := 5.0);
  ASSERT_NEAR(result, 2.3124, 0.001);
END_TEST

(* === ATANH: inverse hyperbolic tangent === *)

TEST 'ATANH: atanh(0) = 0'
  VAR result : REAL; END_VAR
  result := ATANH(X := 0.0);
  ASSERT_NEAR(result, 0.0, 0.001);
END_TEST

TEST 'ATANH: atanh(0.5) ~ 0.5493'
  VAR result : REAL; END_VAR
  result := ATANH(X := 0.5);
  ASSERT_NEAR(result, 0.5493, 0.001);
END_TEST

TEST 'ATANH: atanh(-0.5) ~ -0.5493'
  VAR result : REAL; END_VAR
  result := ATANH(X := -0.5);
  ASSERT_NEAR(result, -0.5493, 0.001);
END_TEST

(* === ACOTH: inverse hyperbolic cotangent === *)

TEST 'ACOTH: acoth(2) ~ 0.5493'
  VAR result : REAL; END_VAR
  result := ACOTH(X := 2.0);
  ASSERT_NEAR(result, 0.5493, 0.001);
END_TEST

TEST 'ACOTH: acoth(5) ~ 0.2027'
  VAR result : REAL; END_VAR
  result := ACOTH(X := 5.0);
  ASSERT_NEAR(result, 0.2027, 0.001);
END_TEST

TEST 'ACOTH: acoth(-2) ~ -0.5493'
  VAR result : REAL; END_VAR
  result := ACOTH(X := -2.0);
  ASSERT_NEAR(result, -0.5493, 0.001);
END_TEST

(* === SIGN_R: returns TRUE if input is negative === *)

TEST 'SIGN_R: positive is FALSE'
  VAR result : BOOL; END_VAR
  result := SIGN_R(IN := 5.0);
  ASSERT_FALSE(result);
END_TEST

TEST 'SIGN_R: negative is TRUE'
  VAR result : BOOL; END_VAR
  result := SIGN_R(IN := -3.14);
  ASSERT_TRUE(result);
END_TEST

TEST 'SIGN_R: zero is FALSE'
  VAR result : BOOL; END_VAR
  result := SIGN_R(IN := 0.0);
  ASSERT_FALSE(result);
END_TEST
