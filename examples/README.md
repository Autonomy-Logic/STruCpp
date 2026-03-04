# STruC++ Example Programs

This directory contains example IEC 61131-3 Structured Text programs that can be compiled with STruC++.

## Examples

### blink.st
A simple "Hello World" program that toggles an output at a fixed interval. Demonstrates:
- Basic program structure
- Timer function block usage
- Located variables (direct I/O addressing)

### counter.st
An up/down counter function block with reset functionality. Demonstrates:
- Function block structure
- Input/output variables
- Edge detection
- Conditional logic

### motor_control.st
A motor control program with start/stop buttons and safety features. Demonstrates:
- Real-world I/O mapping
- Safety interlocks
- State management

### pid_controller.st
A PID controller function block for process control. Demonstrates:
- Complex algorithm implementation
- Anti-windup protection
- Output limiting

### unity_conveyor_controller.st
A Unity-friendly virtual commissioning controller for a conveyor. Demonstrates:
- Safety interlocks (`EStopOK`, `GuardDoorClosed`)
- Run/stop latching behavior
- Jam timeout alarm logic (2s with 10ms scan assumption)
- Tag-style I/O suitable for Unity/C#/OPC UA bridging

### unity_conveyor_controller_tests.st
Companion test file for `unity_conveyor_controller.st`. Demonstrates:
- Start/stop behavior checks
- Jam timeout verification
- Alarm reset and restart validation

### Unity TCP docs
- `UNITY_TCP_QUICKSTART.md` -- minimal setup steps for Unity + local TCP server
- `UNITY_TCP_PIPELINE.md` -- detailed protocol and integration notes
- Reference/inspiration: https://github.com/rparak/Unity3D_Robotics_Sorting_Machine

## Usage

Once STruC++ is fully implemented (Phase 3+), you can compile these examples:

```bash
# Compile a single file
strucpp examples/blink.st -o output/blink.cpp

# Compile with debug info
strucpp examples/motor_control.st -o output/motor_control.cpp --debug

# Compile with line directives for debugging
strucpp examples/pid_controller.st -o output/pid.cpp --line-directives

# Run virtual commissioning controller tests
strucpp examples/unity_conveyor_controller.st --test examples/unity_conveyor_controller_tests.st
```

## Notes

- These examples follow IEC 61131-3 Edition 3 syntax
- Located variables (AT %IX0.0) are mapped to OpenPLC runtime I/O
- Timer and counter function blocks (TON, CTU, etc.) are provided by the standard library
