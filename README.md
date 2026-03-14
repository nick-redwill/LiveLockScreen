<p align="center">
  <img src="https://img.shields.io/github/stars/nick-redwill/LiveLockScreen">
  <img src="https://img.shields.io/github/license/nick-redwill/LiveLockScreen">
  <img src="https://img.shields.io/badge/GNOME%20Shell-47--50-blue">
  <img src="https://img.shields.io/badge/status-legacy-red">
</p>
<p align="center">
  <img src="icon.png" width="128" height="128" alt="Live Lock Screen icon">
</p>

# Live Lock Screen

A GNOME Shell extension that lets you set any video as your lock screen background.

> ⚠️ This is the **legacy** branch. For the latest version with more features and better stability, switch to the `main` branch.

> 💡 If you experience issues, check the **Debug** section in preferences for workarounds.

## Features

- 🎬 Play any video file as the lock screen background
- 🔁 Loop support
- 🎨 Video scaling modes (cover, fit, stretch)
- 🔲 Transparent video support (RGBA)
- ⏸️ Auto pause/play on suspend/wake
- 🌌 Configurable fade-in animation
- 🖥️ Multiple monitor support
- 🌫️ Blur effect with adjustable radius and brightness
- 🎞️ Configurable framerate (1–120 FPS)
- 🔊 Optional audio output with volume control and fade-in/out
- 🔑 Interactive changes on password prompt (blur/brightness change, video pause, etc)

## Screenshots

<p align="center">
  <img src="screenshots/main-window1.png" alt="Extension Preferences" width="600">
  <img src="screenshots/main-window2.png" alt="Extension Preferences" width="600">
  <br><br>
  <img src="screenshots/lockscreen-clock.png" alt="Lock Screen with Clock" width="600">
  <br><br>
  <img src="screenshots/lockscreen-prompt.png" alt="Lock Screen with Password Prompt" width="600">
</p>

## TODO

- [ ] Improve performance for high-res videos
- [ ] ~~Per-monitor video selection~~ — not planned, single pipeline is used for performance

## Known Issues

- Possible audio and video desync after suspend/wake
- Brief green frame at video start (enable "Skip first frame" in Debug settings to fix)
- Possible clicking/crackling sounds when pausing/playing video with audio
- Performance issues and shell crashes with high-res videos (hardware dependent)

## Installation

### Install from GNOME Extensions (recommended)

  <a href="https://extensions.gnome.org/extension/9419/live-lock-screen/">
    <img src="https://github.com/user-attachments/assets/d15de748-11b8-4a85-ad34-ec7786547b3c" width="250" alt="Install from GNOME Extensions">
  </a>

### Manual

1. Clone the repository:
   ```bash
   git clone https://github.com/nick-redwill/LiveLockScreen.git
   ```

2. Copy to your extensions folder:
   ```bash
   cp -r LiveLockScreen ~/.local/share/gnome-shell/extensions/live-lockscreen@nick-redwill
   ```

3. Log out and back in, then enable the extension:
   ```bash
   gnome-extensions enable live-lockscreen@nick-redwill
   ```

4. Open the extension preferences and select your video file.

## Support

If you enjoy this extension, consider buying me a tea 🍵 (I'm not really a coffee person :D)

<p align="center">
  <a href="https://www.buymeacoffee.com/nick-redwill">
    <img src="https://github.com/user-attachments/assets/3b58a7fc-e605-4742-94e9-0bf3144c5021" width="200"/>
  </a>
</p>

## License

AGPL-3.0
