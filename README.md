<p align="center">
  <img src="https://img.shields.io/github/stars/rmacordeiro/LiveLockScreen">
  <img src="https://img.shields.io/github/license/rmacordeiro/LiveLockScreen">
  <img alt="GNOME Shell" src="https://img.shields.io/badge/GNOME_Shell-46%2B-4A86CF?logo=gnome&logoColor=white"/>
  <img src="https://img.shields.io/badge/status-active-success">
</p>

<p align="center">
  <img src="icon.png" width="128" height="128" alt="ScreenSaver icon">
</p>

# ScreenSaver

A GNOME Shell extension that rotates images as your lock screen background.

## Design Philosophy

> "Do one thing and do it well."  
> — Unix philosophy

ScreenSaver focuses on a single goal: showing still images on the lock screen.

It is designed to be simple, lightweight, and reliable.

## Features

- 🖼️ Rotate images from a selected folder in random order
- 📁 Recursive image discovery across the selected folder and nested folders
- 🔁 Loop support
- 🎨 Slideshow scaling modes (cover, fit, stretch)
- ⏸️ Automatic pause/play on suspend and wake
- 🌌 Configurable fade-in animation
- 🖥️ Multi-monitor support
- 🌫️ Blur effect with adjustable radius and brightness
- 🔑 Interactive behavior on password prompt (blur/brightness change, slideshow pause, grayscale)

## Installation

### Install from GNOME Extensions

<a href="https://extensions.gnome.org/extension/9419/live-lock-screen/">
  <img src="https://github.com/user-attachments/assets/d15de748-11b8-4a85-ad34-ec7786547b3c" width="250" alt="Install from GNOME Extensions">
</a>

> ⚠️ Due to the review process, the version on GNOME Extensions may lag behind the latest code in this repository.  
> For the newest features, it is recommended to install manually from this branch.

### Manual

1. Clone your fork and checkout the branch you want to test:

   ```bash
   git clone --branch <branch-name> --single-branch https://github.com/rmacordeiro/LiveLockScreen.git ScreenSaver
   cd ScreenSaver
   ```
2. Copy to your extensions folder:

   ```bash
   cp -r ScreenSaver ~/.local/share/gnome-shell/extensions/screensaver@rmacordeiro
   ```
3. Compile the schema, log out and back in, then enable the extension:

   ```bash
   glib-compile-schemas schemas
   gnome-extensions enable screensaver@rmacordeiro
   ```
4. Open the extension preferences and select the top-level image folder that should be scanned.
   ScreenSaver will recursively scan that folder and all nested folders for supported images.

## Requirements

- GNOME Shell 46+
- mpv:
  ```bash
  # Fedora
  sudo dnf install mpv

  # Ubuntu/Debian
  sudo apt install mpv

  # Arch
  sudo pacman -S mpv
  ```

## Supported image formats

ScreenSaver scans for files with these extensions:

- `.jpg`
- `.jpeg`
- `.png`
- `.gif`
- `.webp`
- `.bmp`
- `.tif`
- `.tiff`

## mpv test command

Use this command to verify that mpv finds the same files ScreenSaver expects and rotates them on screen:

```bash
find "/absolute/path/to/your/image-folder" -type f \
  \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.gif' -o -iname '*.webp' -o -iname '*.bmp' -o -iname '*.tif' -o -iname '*.tiff' \) \
  | sort \
  | mpv --no-audio --vo=gpu-next --keepaspect=no --keep-open=yes --image-display-duration=10 --shuffle --loop-playlist=inf --playlist=-
```

Adjust `--image-display-duration=10` if you want to test a different slide duration.

## Notes

- ScreenSaver uses mpv only; all GStreamer support has been removed.
- The selected folder itself is scanned, not just its subfolders.
- If only one supported image is found, mpv will keep showing that image and loop it when looping is enabled.

## Support

If you enjoy this extension, consider buying me a tea 🍵 (I’m not really a coffee person :D)

<p align="center">
  <a href="https://www.buymeacoffee.com/rmacordeiro">
    <img src="https://github.com/user-attachments/assets/3b58a7fc-e605-4742-94e9-0bf3144c5021" width="200"/>
  </a>
</p>

## License

AGPL-3.0
