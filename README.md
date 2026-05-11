<p align="center">
  <img src="https://img.shields.io/github/stars/nick-redwill/LiveLockScreen">
  <img src="https://img.shields.io/github/license/nick-redwill/LiveLockScreen">
  <img alt="GNOME Shell" src="https://img.shields.io/badge/GNOME_Shell-46%2B-4A86CF?logo=gnome&logoColor=white"/>
  <img src="https://img.shields.io/badge/status-active-success">
</p>

<p align="center">
  <img src="icon.png" width="128" height="128" alt="Live Lock Screen icon">
</p>

# Live Lock Screen

A GNOME Shell extension that lets you set any video as your lock screen background.

> ⚠️ If you are having issues with current version you may check out legacy branch however it is highly recommended to stick with new versions for better performance.

## Design Philosophy

> "Do one thing and do it well."  
> — Unix philosophy

This extension focuses on a single goal: playing videos on the lock screen.

It is designed to be simple, lightweight, and reliable.

If you're looking for more advanced lock screen or desktop customization, you may want to explore alternative extensions or check out some forks of this project.

## Features

- 🎬 Play any video file as the lock screen background
- 🔁 Loop support
- 🎨 Video scaling modes (cover, fit, stretch)
- 🔲 Transparent video support (RGBA)
- ⏸️ Automatic pause/play on suspend and wake
- 🌌 Configurable fade-in animation
- 🖥️ Multi-monitor support
- 🌫️ Blur effect with adjustable radius and brightness
- 🎞️ Configurable frame rate (1–120 FPS)
- 🔊 Optional audio output with volume control and fade-in/out
- 🔑 Interactive behavior on password prompt (blur/brightness change, video pause, grayscale)

## Known Issues

- Possible audio and video desync after suspend/wake
- Possible clicking/crackling sounds when pausing/playing video with audio
- Video positioning issues when connecting/disconnecting monitors with lock screen on

## Installation

### Install from GNOME Extensions

<a href="https://extensions.gnome.org/extension/9419/live-lock-screen/">
  <img src="https://github.com/user-attachments/assets/d15de748-11b8-4a85-ad34-ec7786547b3c" width="250" alt="Install from GNOME Extensions">
</a>

> ⚠️ Due to the review process, the version on GNOME Extensions may lag behind the latest code in this repository.  
> For the newest features, it is recommended to install manually from this branch.  
> If you’d like to try the latest (possibly unstable) features, you can switch to the `experimental` branch.
  
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

## Requirements

- GNOME Shell 46+
- GStreamer with good/bad plugins:
  ```bash
  # Fedora
  sudo dnf install gstreamer1-plugins-good gstreamer1-plugins-bad-free gstreamer1-plugins-ugly gstreamer1-plugins-bad-free-extras

  # Ubuntu/Debian
  sudo apt install gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly
  ```
- GStreamer GTK4 video sink (`gtk4paintablesink`):
  ```bash
  # Fedora
  sudo dnf install gstreamer1-plugin-gtk4

  # Ubuntu 24.10+ / Debian (newer)
  sudo apt install gstreamer1.0-gtk4

  # Ubuntu 24.04 — not available as a package.
  # Either build from source or download from launchpad
  ```

## Support

If you enjoy this extension, consider buying me a tea 🍵 (I’m not really a coffee person :D)

<p align="center">
  <a href="https://www.buymeacoffee.com/nick_redwill">
    <img src="https://github.com/user-attachments/assets/3b58a7fc-e605-4742-94e9-0bf3144c5021" width="200"/>
  </a>
</p>

## License

AGPL-3.0
