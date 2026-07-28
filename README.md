<p align="center">
  <img src="https://img.shields.io/github/stars/nick-redwill/LiveLockScreen">
  <img src="https://img.shields.io/github/license/nick-redwill/LiveLockScreen">
  <img alt="GNOME Shell" src="https://img.shields.io/badge/GNOME_Shell-46%2B-4A86CF?logo=gnome&logoColor=white"/>
  <img src="https://img.shields.io/badge/status-experimental (mpv)-orange">
</p>

<p align="center">
  <img src="icon.png" width="128" height="128" alt="Live Lock Screen icon">
</p>

# Live Lock Screen

A GNOME Shell extension that lets you set any video/GIF as your lock screen background.

> ⚠️ **This is the `experimental-mpv` branch.**
> It contains an alternative MPV-based playback backend that is still under active development.
> While expected to become the future default backend, it may contain bugs or missing features.
> For the stable implementation, use the `main` branch.

## Installation

1. Clone the repository:

   ```bash
   git clone -b experimental-mpv https://github.com/nick-redwill/LiveLockScreen.git
   ```
2. Copy to your extensions folder:

   ```bash
   cp -r LiveLockScreen ~/.local/share/gnome-shell/extensions/live-lockscreen@nick-redwill
   ```
3. Log out and back in, then enable the extension:

   ```bash
   gnome-extensions enable live-lockscreen@nick-redwill
   ```
4. Open the extension preferences and select your file.

## Requirements

- GNOME Shell 46+
- MPV:
  ```bash
  # Fedora
  sudo dnf install mpv

  # Ubuntu/Debian
  sudo apt install mpv
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
