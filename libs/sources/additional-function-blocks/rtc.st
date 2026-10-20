(* SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception *)
(* Copyright (C) 2026 Autonomy *)
(* Additional Function Blocks: RTC (real time clock)                      *)
(* IN = FALSE: CDT is the runtime clock, TIME() as a DT. Rising edge of  *)
(* IN latches PDT; while IN stays TRUE, CDT = PDT + time since the edge.  *)

FUNCTION_BLOCK RTC
  VAR_INPUT
    IN  : BOOL ;
    PDT : DT ;
  END_VAR
  VAR_OUTPUT
    Q   : BOOL := FALSE ;
    CDT : DT ;
  END_VAR
  VAR
    running    : BOOL := FALSE ;
    edge_time  : TIME ;
    preset     : DT ;
  END_VAR

  IF IN THEN
    IF NOT running THEN
      edge_time := TIME() ;
      preset := PDT ;
      running := TRUE ;
    END_IF ;
    CDT := preset + (TIME() - edge_time) ;
  ELSE
    running := FALSE ;
    CDT := DT#1970-01-01-00:00:00 + TIME() ;
  END_IF ;
  Q := IN ;
END_FUNCTION_BLOCK
