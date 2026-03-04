# Unity + STruC++ Local TCP Pipeline

This setup replaces the PLC server with a local ST controller process on your Mac.

## Reference & Inspiration

- Original digital-twin project (Unity + B&R OPC UA):
  https://github.com/rparak/Unity3D_Robotics_Sorting_Machine

## 1) Compile ST controller to C++

```bash
node dist/cli.js examples/unity_conveyor_controller.st -o examples/output/unity_conveyor_controller.cpp
```

Generated:
- `examples/output/unity_conveyor_controller.cpp`
- `examples/output/unity_conveyor_controller.hpp`

## 2) Build local TCP controller server

```bash
c++ -std=c++17 \
  -Iexamples/output \
  -Isrc/runtime/include \
  examples/output/unity_conveyor_controller.cpp \
  examples/unity_conveyor_tcp_server.cc \
  -o examples/output/unity_conveyor_tcp_server
```

## 3) Run server

```bash
./examples/output/unity_conveyor_tcp_server 9100
```

Server protocol:
- Request: `start,stop,jam,reset,estop,guard`
- Response:
  `motor,alarm,jam,ready,cam_pos,cam_vel,x,y,z,attach,detach,scan,obj_id,obj_type,state`

The local server now includes a B&R-like sequencing model (main state transitions, axis target motion, attach/detach pulses, camera scan pulse, object routing by type).

## 4) Unity wiring

Unity script added:
- `Sorting_Machine_OPCUA_Unity_App/Assets/Scripts/Sorting_machine/local_tcp_data_processing.cs`

In Unity:
1. Add `local_tcp_data_processing` component to a GameObject in `SampleScene`.
2. Disable/remove `br_data_processing` component to avoid parallel OPC UA threads.
3. Set `serverIp=127.0.0.1`, `serverPort=9100`.
4. Press Play.

Keyboard test controls:
- Hold `S`: StartPB
- Hold `X`: StopPB
- Press `J`: Toggle jam sensor
- Hold `R`: ResetPB
- Press `E`: Toggle EStopOK
- Press `G`: Toggle GuardDoorClosed

## 5) Expected behavior

- `S` starts conveyor motion (`cam_conv_x_pos` increases).
- `X` stops conveyor.
- Keep jam active (`J`) while running for ~2 seconds to trigger alarm.
- Clear jam (`J`) and hold `R` to reset, then start again with `S`.
