TYPE Inner :
  STRUCT
    value : INT;
  END_STRUCT;
END_TYPE

TYPE Outer :
  STRUCT
    inner : Inner;
    count : INT;
  END_STRUCT;
END_TYPE

PROGRAM NestedAccessTest
  VAR
    data : Outer;
    result : INT;
  END_VAR

  data.inner.value := 42;
  data.count := 5;
  result := data.inner.value + data.count;
END_PROGRAM
