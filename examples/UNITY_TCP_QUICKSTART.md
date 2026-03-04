# Unity TCP Quick Start (Simple)

Use this if you want the shortest path to run Unity + local ST controller on your Mac.

## 1) Compile ST controller

```bash
node dist/cli.js examples/unity_conveyor_controller.st -o examples/output/unity_conveyor_controller.cpp
```

## 2) Build TCP server

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

## 4) Unity setup

In `Sorting_Machine_OPCUA_Unity_App`:

1. Open `SampleScene`.
2. On `Control` object:
  - Disable `br_data_processing`.
  - Enable/add `local_tcp_data_processing`.
3. Set:
  - `serverIp = 127.0.0.1`
  - `serverPort = 9100`
4. Press Play.

## 5) Controls

- Hold `S`: start
- Hold `X`: stop
- Press `J`: jam toggle
- Hold `R`: reset
- Press `E`: E-stop toggle
- Press `G`: guard toggle

## 6) Expected

- Conveyor and XYZ motion update in scene.
- Attach/detach/scan events occur in cycle.
- Blue/orange sorting behavior follows original object type map.
