(* OSCAT Encoding/Numeric Functions — End-to-End Tests *)

(* === INT_TO_BCDC: integer to BCD byte === *)

TEST 'INT_TO_BCDC: 0 -> 0x00'
  VAR result : BYTE; END_VAR
  result := INT_TO_BCDC(IN := 0);
  ASSERT_EQ(result, 0);
END_TEST

TEST 'INT_TO_BCDC: 9 -> 0x09'
  VAR result : BYTE; END_VAR
  result := INT_TO_BCDC(IN := 9);
  ASSERT_EQ(result, 9);
END_TEST

TEST 'INT_TO_BCDC: 10 -> 0x10'
  VAR result : BYTE; END_VAR
  result := INT_TO_BCDC(IN := 10);
  ASSERT_EQ(result, 16);
END_TEST

TEST 'INT_TO_BCDC: 42 -> 0x42'
  VAR result : BYTE; END_VAR
  result := INT_TO_BCDC(IN := 42);
  ASSERT_EQ(result, 66);
END_TEST

TEST 'INT_TO_BCDC: 99 -> 0x99'
  VAR result : BYTE; END_VAR
  result := INT_TO_BCDC(IN := 99);
  ASSERT_EQ(result, 153);
END_TEST

(* === BINOM: binomial coefficient C(n,k) === *)

TEST 'BINOM: C(0,0) = 1'
  VAR result : DINT; END_VAR
  result := BINOM(N := 0, K := 0);
  ASSERT_EQ(result, 1);
END_TEST

TEST 'BINOM: C(5,0) = 1'
  VAR result : DINT; END_VAR
  result := BINOM(N := 5, K := 0);
  ASSERT_EQ(result, 1);
END_TEST

TEST 'BINOM: C(5,1) = 5'
  VAR result : DINT; END_VAR
  result := BINOM(N := 5, K := 1);
  ASSERT_EQ(result, 5);
END_TEST

TEST 'BINOM: C(5,2) = 10'
  VAR result : DINT; END_VAR
  result := BINOM(N := 5, K := 2);
  ASSERT_EQ(result, 10);
END_TEST

TEST 'BINOM: C(10,3) = 120'
  VAR result : DINT; END_VAR
  result := BINOM(N := 10, K := 3);
  ASSERT_EQ(result, 120);
END_TEST

TEST 'BINOM: C(10,5) = 252'
  VAR result : DINT; END_VAR
  result := BINOM(N := 10, K := 5);
  ASSERT_EQ(result, 252);
END_TEST

TEST 'BINOM: C(20,10) = 184756'
  VAR result : DINT; END_VAR
  result := BINOM(N := 20, K := 10);
  ASSERT_EQ(result, 184756);
END_TEST

(* === FIB: Fibonacci number === *)

TEST 'FIB: fib(0) = 0'
  VAR result : DINT; END_VAR
  result := FIB(X := 0);
  ASSERT_EQ(result, 0);
END_TEST

TEST 'FIB: fib(1) = 1'
  VAR result : DINT; END_VAR
  result := FIB(X := 1);
  ASSERT_EQ(result, 1);
END_TEST

TEST 'FIB: fib(2) = 1'
  VAR result : DINT; END_VAR
  result := FIB(X := 2);
  ASSERT_EQ(result, 1);
END_TEST

TEST 'FIB: fib(5) = 5'
  VAR result : DINT; END_VAR
  result := FIB(X := 5);
  ASSERT_EQ(result, 5);
END_TEST

TEST 'FIB: fib(10) = 55'
  VAR result : DINT; END_VAR
  result := FIB(X := 10);
  ASSERT_EQ(result, 55);
END_TEST

TEST 'FIB: fib(20) = 6765'
  VAR result : DINT; END_VAR
  result := FIB(X := 20);
  ASSERT_EQ(result, 6765);
END_TEST

TEST 'FIB: negative input returns -1'
  VAR result : DINT; END_VAR
  result := FIB(X := -1);
  ASSERT_EQ(result, -1);
END_TEST

TEST 'FIB: overflow input returns -1'
  VAR result : DINT; END_VAR
  result := FIB(X := 47);
  ASSERT_EQ(result, -1);
END_TEST
