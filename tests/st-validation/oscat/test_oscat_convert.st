(* OSCAT Conversion Functions — End-to-End Tests *)

(* === KMH_TO_MS: km/h to m/s === *)

TEST 'KMH_TO_MS: 3.6 km/h = 1 m/s'
  VAR result : REAL; END_VAR
  result := KMH_TO_MS(KMH := 3.6);
  ASSERT_NEAR(result, 1.0, 0.001);
END_TEST

TEST 'KMH_TO_MS: 100 km/h ~ 27.778 m/s'
  VAR result : REAL; END_VAR
  result := KMH_TO_MS(KMH := 100.0);
  ASSERT_NEAR(result, 27.778, 0.01);
END_TEST

TEST 'KMH_TO_MS: 0 km/h = 0 m/s'
  VAR result : REAL; END_VAR
  result := KMH_TO_MS(KMH := 0.0);
  ASSERT_NEAR(result, 0.0, 0.001);
END_TEST

(* === BFT_TO_MS: Beaufort to m/s === *)

TEST 'BFT_TO_MS: Beaufort 0 = 0 m/s'
  VAR result : REAL; END_VAR
  result := BFT_TO_MS(BFT := 0);
  ASSERT_NEAR(result, 0.0, 0.001);
END_TEST

TEST 'BFT_TO_MS: Beaufort 1 ~ 0.836 m/s'
  VAR result : REAL; END_VAR
  result := BFT_TO_MS(BFT := 1);
  ASSERT_NEAR(result, 0.836, 0.01);
END_TEST

TEST 'BFT_TO_MS: Beaufort 4 ~ 6.688 m/s'
  VAR result : REAL; END_VAR
  result := BFT_TO_MS(BFT := 4);
  ASSERT_NEAR(result, 6.688, 0.1);
END_TEST

(* === MS_TO_BFT: m/s to Beaufort === *)

TEST 'MS_TO_BFT: 0 m/s = Beaufort 0'
  VAR result : INT; END_VAR
  result := MS_TO_BFT(MS := 0.0);
  ASSERT_EQ(result, 0);
END_TEST

TEST 'MS_TO_BFT: 0.836 m/s ~ Beaufort 1'
  VAR result : INT; END_VAR
  result := MS_TO_BFT(MS := 0.836);
  ASSERT_EQ(result, 1);
END_TEST

(* === BYTE_TO_RANGE: byte to real range === *)

TEST 'BYTE_TO_RANGE: 0 maps to low'
  VAR result : REAL; END_VAR
  result := BYTE_TO_RANGE(X := 0, LOW := 0.0, HIGH := 100.0);
  ASSERT_NEAR(result, 0.0, 0.01);
END_TEST

TEST 'BYTE_TO_RANGE: 255 maps to high'
  VAR result : REAL; END_VAR
  result := BYTE_TO_RANGE(X := 255, LOW := 0.0, HIGH := 100.0);
  ASSERT_NEAR(result, 100.0, 0.01);
END_TEST

TEST 'BYTE_TO_RANGE: 127 maps to midpoint'
  VAR result : REAL; END_VAR
  result := BYTE_TO_RANGE(X := 127, LOW := 0.0, HIGH := 100.0);
  ASSERT_NEAR(result, 49.8, 0.2);
END_TEST

TEST 'BYTE_TO_RANGE: negative range'
  VAR result : REAL; END_VAR
  result := BYTE_TO_RANGE(X := 0, LOW := -10.0, HIGH := 10.0);
  ASSERT_NEAR(result, -10.0, 0.01);
END_TEST

(* === RANGE_TO_BYTE: real range to byte === *)

TEST 'RANGE_TO_BYTE: low maps to 0'
  VAR result : BYTE; END_VAR
  result := RANGE_TO_BYTE(X := 0.0, LOW := 0.0, HIGH := 100.0);
  ASSERT_EQ(result, 0);
END_TEST

TEST 'RANGE_TO_BYTE: high maps to 255'
  VAR result : BYTE; END_VAR
  result := RANGE_TO_BYTE(X := 100.0, LOW := 0.0, HIGH := 100.0);
  ASSERT_EQ(result, 255);
END_TEST

TEST 'RANGE_TO_BYTE: midpoint maps to ~127'
  VAR result : BYTE; END_VAR
  result := RANGE_TO_BYTE(X := 50.0, LOW := 0.0, HIGH := 100.0);
  ASSERT_EQ(result, 127);
END_TEST

TEST 'RANGE_TO_BYTE: clamps below to 0'
  VAR result : BYTE; END_VAR
  result := RANGE_TO_BYTE(X := -10.0, LOW := 0.0, HIGH := 100.0);
  ASSERT_EQ(result, 0);
END_TEST

TEST 'RANGE_TO_BYTE: clamps above to 255'
  VAR result : BYTE; END_VAR
  result := RANGE_TO_BYTE(X := 200.0, LOW := 0.0, HIGH := 100.0);
  ASSERT_EQ(result, 255);
END_TEST
