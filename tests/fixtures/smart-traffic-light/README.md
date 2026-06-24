# Smart Traffic Light

IEC 61131-3 Structured Text traffic light controller — a demo project for [STruC++](https://github.com/Autonomy-Logic/STruCpp).

[![CI](https://github.com/Autonomy-Logic/smart-traffic-light/actions/workflows/ci.yml/badge.svg)](https://github.com/Autonomy-Logic/smart-traffic-light/actions/workflows/ci.yml)

## Overview

This project implements a smart traffic light intersection controller using IEC 61131-3 Structured Text. It demonstrates how to structure, compile, and test an ST project using the STruC++ compiler in a CI pipeline.

## Features

- **Enum types** with CODESYS dot notation (`TrafficState.RED`)
- **Function blocks** with methods, EXTENDS, and OVERRIDE
- **State machines** using CASE statements with enum labels
- **Timer-based** phase control using TON standard function block
- **Dynamic memory** with POINTER TO, `__NEW`, `__DELETE`
- **Variable-length arrays** (ARRAY[\*] OF TIME)
- **Located variables** for physical I/O mapping
- **CONFIGURATION/RESOURCE/TASK** project structure
- **Automated testing** with STruC++ test framework

## Getting Started

Install STruC++:

```bash
# Via npm
npm install -g strucpp

# Or download from releases
# https://github.com/Autonomy-Logic/STruCpp/releases
```

Compile the project:

```bash
strucpp \
  src/DataTypes/TrafficTypes.st \
  src/Functions/TimingUtils.st \
  src/FunctionBlocks/TrafficLight.st \
  src/FunctionBlocks/PedestrianLight.st \
  src/FunctionBlocks/VehicleDetector.st \
  src/FunctionBlocks/TrafficLogger.st \
  src/Programs/IntersectionController.st \
  -o build/intersection.cpp
```

Run tests:

```bash
strucpp --test src/DataTypes/TrafficTypes.st src/FunctionBlocks/TrafficLight.st tests/test_traffic_light.st
```

## Project Structure

```
src/
├── DataTypes/        # ENUM and STRUCT type definitions
│   └── TrafficTypes.st
├── Functions/        # Standalone functions (timing utilities)
│   └── TimingUtils.st
├── FunctionBlocks/   # Function blocks
│   ├── TrafficLight.st       # Base traffic signal state machine
│   ├── PedestrianLight.st    # Pedestrian signal (EXTENDS TrafficLight)
│   ├── VehicleDetector.st    # Sensor-based vehicle counting
│   └── TrafficLogger.st      # Circular buffer event logger
└── Programs/         # Main programs
    └── IntersectionController.st  # 4-way intersection coordinator
tests/                # Test files using STruC++ test framework
```

## CI

This project uses GitHub Actions with [setup-strucpp](https://github.com/Autonomy-Logic/setup-strucpp) to compile and test on every push and pull request.

## License

MIT
