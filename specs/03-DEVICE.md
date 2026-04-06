# 03 — Device Reference: Scarlett 18i20 Gen 3

## Overview

- 18 inputs / 20 outputs total
- 8 mic/line preamps with 56dB gain range
- USB 2.0 High Speed (Type C connector)
- Mains powered (IEC)
- 1U rack-mountable
- Built-in talkback microphone
- MIDI I/O (5-pin DIN)
- Word clock output (BNC)
- Sample rates: 44.1, 48, 88.2, 96, 176.4, 192 kHz

## Analogue Output Map

| Line Output | UI Name | Alias | Location | Anti-thump |
|-------------|---------|-------|----------|-----------|
| 1 | Mon 1 L | MAIN | Rear panel | Yes |
| 2 | Mon 1 R | MAIN | Rear panel | Yes |
| 3 | Mon 2 L | ALT | Rear panel | Yes |
| 4 | Mon 2 R | ALT | Rear panel | Yes |
| 5 | Line 5 | — | Rear panel | No |
| 6 | Line 6 | — | Rear panel | No |
| 7 | HP 1 L | — | Front panel HP jack 1 | No |
| 8 | HP 1 R | — | Front panel HP jack 1 | No |
| 9 | HP 2 L | — | Front panel HP jack 2 | No |
| 10 | HP 2 R | — | Front panel HP jack 2 | No |

## Port Counts at Each Sample Rate

### 44.1 / 48 kHz

| Port Type | Inputs | Outputs |
|-----------|--------|---------|
| Analogue | 9 (8 + talkback) | 10 |
| S/PDIF | 2 | 2 |
| ADAT | 8 | 8 |
| Mixer | 12 | 25 |
| PCM (DAW) | 20 | 20 |

### 88.2 / 96 kHz

| Port Type | Inputs | Outputs |
|-----------|--------|---------|
| Analogue | 9 | 10 |
| S/PDIF | 2 (mode-dependent) | 2 |
| ADAT | 4 or 8 (mode-dependent) | 4 or 8 |
| Mixer | 12 | 25 |
| PCM (DAW) | 16 | 18 |

### 176.4 / 192 kHz

| Port Type | Inputs | Outputs |
|-----------|--------|---------|
| Analogue | 9 | 10 |
| S/PDIF | 2 (coaxial mode only) | 0 |
| ADAT | 0 | 0 |
| Mixer | 0 | 0 |
| PCM (DAW) | 10 | 10 |

## Digital I/O Modes

Three modes selectable in software. Affects how optical ports and S/PDIF coaxial map.

### Mode 1: Coaxial S/PDIF (factory default)
- S/PDIF via RCA coaxial jacks
- Optical port 1: ADAT (8ch at 48kHz, 4ch at 96kHz)
- Optical port 2: unused at 48kHz; unused at 96kHz

### Mode 2: Optical S/PDIF
- S/PDIF input via optical port 2 (replaces coaxial S/PDIF input)
- S/PDIF output via both coaxial AND optical port 2
- Optical port 1: ADAT (8ch at 48kHz, 4ch at 96kHz)

### Mode 3: Dual ADAT
- No S/PDIF input (coaxial S/PDIF output still available)
- Optical port 1: ADAT 1-4/1-8
- Optical port 2: ADAT 5-8 (at 96kHz only — enables 8ch ADAT at 96kHz via S/MUX)

At 176.4/192kHz: all optical I/O disabled regardless of mode.

**The app must dynamically show/hide port groups when sample rate or I/O mode changes.**

## Analogue Input Controls

| Control | Type | Channels | Notes |
|---------|------|----------|-------|
| Gain | Knob (front panel) | 1-8 | 56dB range, not software-controllable |
| INST | Toggle | 1-2 only | Unbalanced, 1.5MΩ impedance, optimised for guitar/bass |
| PAD | Toggle | 1-8 | -10dB attenuation |
| AIR | Software toggle | 1-8 | ISA preamp frequency response modelling |
| 48V | Toggle | Groups 1-4, 5-8 | Phantom power, shared switch per group |

Inputs 1-2 are on the front panel (Combo XLR/TRS). Inputs 3-8 are on the rear panel (Combo XLR/TRS).

## Monitor Section

| Control | Default Target | Configurable? | Notes |
|---------|---------------|---------------|-------|
| MONITOR knob | Outputs 1/2 | Yes — any analogue outputs | Front panel, analogue |
| DIM button | Outputs 1/2 | Yes — any analogue outputs | -18dB exactly |
| MUTE button | Outputs 1/2 | Yes — any analogue outputs | Full silence |
| HP 1 knob | Outputs 7/8 | No | Front panel, analogue |
| HP 2 knob | Outputs 9/10 | No | Front panel, analogue |

## Speaker Switching (ALT)

- MAIN = Line Outputs 1/2
- ALT = Line Outputs 3/4
- ALT must be enabled in software settings before the button works
- When ALT is active: MAIN outputs muted, ALT outputs receive the monitor mix
- When ALT is inactive: ALT outputs muted
- Front panel ALT button toggles, green LED when active

## Talkback

- Built-in microphone on front panel (Analogue Input 9 in the routing)
- TALKBACK button: momentary (press and hold) on hardware
- Software can set it to momentary or latching
- Default routing: HP 1 + HP 2 (outputs 7-10)
- Configurable to route to any combination of outputs
- Green LED when active

## Loopback

- Virtual inputs 9/10 in the DAW (not physical ports)
- Records audio playing on the computer (e.g. browser audio)
- Configured via mixer routing

## Stand-alone Mode

The device can store a mix configuration in hardware flash (via DATA_CMD CONFIG_SAVE). Once stored, it operates as a standalone mixer without a computer connected. Useful for keyboard rigs or stage monitoring.

## MSD Mode

- Factory default: MSD enabled (presents "Welcome Disk" mass storage device)
- Must be disabled for full audio functionality
- Can be disabled by: holding 48V button for 5 seconds, or via software
- Disabling MSD unlocks sample rates above 48kHz and MIDI I/O

## DSP Mixer

- 25-input × 12-output gain matrix
- Gain range: -80dB to +6dB in 0.5dB steps (173 values)
- Hardware value encoding uses a non-linear lookup table (see `02-PROTOCOL.md`)
- Mix buses labelled A through L

## Front Panel LEDs

| LED | Colour | Signal Source |
|-----|--------|--------------|
| USB active | Green | Device connected and recognised |
| Lock | Green | Clock synchronised (internal or external) |
| MIDI | Green | MIDI data received at MIDI IN |
| 48V 1-4 | Red | Phantom power active, inputs 1-4 |
| 48V 5-8 | Red | Phantom power active, inputs 5-8 |
| INST 1 | Red | Instrument mode, input 1 |
| INST 2 | Red | Instrument mode, input 2 |
| AIR 1-8 | Yellow | AIR mode active per channel |
| PAD 1-8 | Green | PAD active per channel |
| Input meters 1-8 | 5-seg | Levels: -42 (grn), -18 (grn), -6 (grn), -3 (yel), 0 dBFS (red) |
| Talkback | Green | Talkback active |
| ALT | Green | ALT speakers selected |
| DIM | Yellow | DIM active |
| MUTE | Red | MUTE active |

## MIDI

- 5-pin DIN in/out on rear panel
- Device acts as USB-MIDI interface
- MIDI LED on front panel indicates received data
- MIDI is disabled while MSD mode is active

## Word Clock

- BNC output on rear panel
- Outputs the device's word clock for synchronising external digital equipment
- Clock source selected in software: Internal, S/PDIF, ADAT
