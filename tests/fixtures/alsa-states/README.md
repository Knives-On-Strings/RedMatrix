# ALSA State Files

Demo state files from [alsa-scarlett-gui](https://github.com/geoffreybennett/alsa-scarlett-gui) by Geoffrey Bennett.

These capture the full ALSA control state of each supported device, including all mixer gains, routing, input settings, and monitor configuration. They can be used to:

- Validate UI rendering for devices we don't own
- Test state parsing and device config accuracy
- Drive simulation mode (display realistic state without hardware)

## Files

| File | Device |
|------|--------|
| `Scarlett_Gen_2_6i6.state` | Scarlett 6i6 Gen 2 |
| `Scarlett_Gen_2_18i8.state` | Scarlett 18i8 Gen 2 |
| `Scarlett_Gen_2_18i20.state` | Scarlett 18i20 Gen 2 |
| `Scarlett_Gen_3_Solo.state` | Scarlett Solo Gen 3 |
| `Scarlett_Gen_3_2i2.state` | Scarlett 2i2 Gen 3 |
| `Scarlett_Gen_3_4i4.state` | Scarlett 4i4 Gen 3 |
| `Scarlett_Gen_3_8i6.state` | Scarlett 8i6 Gen 3 |
| `Scarlett_Gen_3_18i8.state` | Scarlett 18i8 Gen 3 |
| `Scarlett_Gen_3_18i20.state` | Scarlett 18i20 Gen 3 |
| `Clarett_Plus_2Pre.state` | Clarett+ 2Pre (also valid for Clarett USB 2Pre) |
| `Clarett_Plus_4Pre.state` | Clarett+ 4Pre (also valid for Clarett USB 4Pre) |
| `Clarett_Plus_8Pre.state` | Clarett+ 8Pre (also valid for Clarett USB 8Pre) |

## Source

Downloaded from the `demo/` directory of https://github.com/geoffreybennett/alsa-scarlett-gui

These files are used under the same license as alsa-scarlett-gui (GPL-2.0).
