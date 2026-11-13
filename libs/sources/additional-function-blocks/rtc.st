(* SPDX-License-Identifier: GPL-3.0-only WITH STruCpp-runtime-exception *)
(* Copyright (c) 2026 Autonomy® *)
(* Additional Function Blocks: RTC (real time clock)                      *)
(* First scan: CDT starts from CURRENT_DT() (1970 + uptime on targets     *)
(* without a system date). SET = TRUE: CDT = PDT. SET = FALSE: CDT counts *)
(* on from the last start value. Q copies SET.                            *)

FUNCTION_BLOCK RTC
  VAR_INPUT
    SET : BOOL ;
    PDT : DT ;
  END_VAR
  VAR_OUTPUT
    Q   : BOOL := FALSE ;
    CDT : DT ;
  END_VAR
  VAR
    started  : BOOL := FALSE ;
    preset   : DT ;
    set_time : TIME ;
  END_VAR

  IF SET THEN
    preset := PDT ;
    set_time := TIME() ;
    started := TRUE ;
  ELSIF NOT started THEN
    preset := CURRENT_DT() ;
    set_time := TIME() ;
    started := TRUE ;
  END_IF ;
  CDT := preset + (TIME() - set_time) ;
  Q := SET ;
END_FUNCTION_BLOCK
