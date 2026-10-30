<div align="center">

<img src="icon.png" width="128" height="128" alt="Live Lock Screen icon">

# Live Lock Screen

**Bring your lock screen to life.**<br>
Play videos, images and GIFs on the GNOME lock screen.

<p>
  <img alt="GNOME Shell 46+" src="https://img.shields.io/badge/GNOME_Shell-46%2B-4A86CF?style=for-the-badge&logo=gnome&logoColor=white&labelColor=2B2B2B">
  <a href="LICENSE.txt"><img alt="License" src="https://img.shields.io/github/license/nick-redwill/LiveLockScreen?style=for-the-badge&color=7E57C2&labelColor=2B2B2B"></a>
  <a href="https://github.com/nick-redwill/LiveLockScreen/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/nick-redwill/LiveLockScreen?style=for-the-badge&logo=github&color=FFB300&labelColor=2B2B2B"></a>
  <img alt="Status" src="https://img.shields.io/badge/Status-Active-43A047?style=for-the-badge&labelColor=2B2B2B">
</p>

<p>
  <a href="https://github.com/sponsors/nick-redwill"><img alt="Sponsor" src="https://img.shields.io/badge/Sponsor-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white"></a>
</p>

<p>
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#requirements">Requirements</a> •
  <a href="#tips">Tips</a> •
  <a href="#known-issues">Known Issues</a> • 
  <a href="#troubleshooting">Troubleshooting</a> •
  <a href="#support">Support</a>
</p>

</div>

---

> [!TIP]
> Having trouble with the current version? You can try an older version of the extension though sticking with the latest version is highly recommended for better performance.

## Design Philosophy

> *"Do one thing and do it well."*
> 
> — Unix philosophy

Live Lock Screen focuses on a single goal: **playing multimedia on the lock screen**. It is designed to be simple, lightweight, and reliable.

If you're looking for more advanced lock screen or desktop customization, you may want to explore alternative extensions or check out some forks of this project.

## Features

| | Feature | |
|:-:|---|---|
| 🎬 | **Video & Image playback** | Use any video, GIF or static image as the lock screen background, played by MPV |
| 📁 | **Playlists** | Pick a folder instead of a single file. Play the files in order, shuffled, or randomly, and start with the first, a random, or the last played one |
| 🌑 | **Smooth transitions** | Fades through black when switching files, so you never see the next one loading. Disable this if you prefer abrupt switching. |
| 🎨 | **Scaling modes** | Cover, fit, or stretch |
| 🔲 | **Transparency** | Transparent media is shown over the default background |
| 🖥️ | **Multi-monitor** | Works across all your displays |
| 🌌 | **Fade-in & blur** | Configurable fade-in animation, blur radius, and brightness |
| 🔑 | **Password prompt reactions** | Pause, grayscale, or change the blur when the password prompt appears |
| ⏸️ | **Smart pause** | Reacts to playback ending, the screen turning off, suspend, and running on battery |
| ⏯️ | **Media controls** | Play, pause, and skip with media keys or any MPRIS client |
| 🔊 | **Audio** | Optional audio with volume control and smooth fade in/out |
| ⚡ | **Playback profiles** | Quality, Balanced, or Efficient, depending on your hardware |
| 🛠️ | **Custom MPV arguments** | Pass your own MPV options for full control |

## Installation

### From GNOME Extensions (recommended for most users)

<a href="https://extensions.gnome.org/extension/9419/live-lock-screen/">
  <img src="https://github.com/user-attachments/assets/d15de748-11b8-4a85-ad34-ec7786547b3c" width="220" alt="Get it on GNOME Extensions">
</a>

> [!TIP]
> Feeling adventurous? The [`experimental`](https://github.com/nick-redwill/LiveLockScreen/tree/experimental) branch has the latest (possibly unstable) features.

### Manual installation

**1. Clone the repository**

```bash
git clone https://github.com/nick-redwill/LiveLockScreen.git
```

**2. Copy it to your extensions folder**

```bash
cp -r LiveLockScreen ~/.local/share/gnome-shell/extensions/live-lockscreen@nick-redwill
```

**3. Log out and back in, then enable the extension**

```bash
gnome-extensions enable live-lockscreen@nick-redwill
```
**4. Open the extension preferences and pick a file or a folder** 🎉

## Requirements

- **GNOME Shell 46+**
- **MPV**

| Distro | Command |
|---|---|
| Fedora | `sudo dnf install mpv` |
| Ubuntu / Debian | `sudo apt install mpv` |
| Arch | `sudo pacman -S mpv` |

> [!NOTE]
> The GStreamer backend from older versions has been removed, MPV is now the only player.

> [!IMPORTANT]
> **Some formats need extra codecs.** Some distributions ship MPV without patented codecs such as **H.264** and **H.265/HEVC**, which most MP4 and MKV videos use. Without them, those videos stay black or do not play at all.
> 
> Look for your distribution's guide on enabling multimedia codecs.

## Tips

**Keep the screen from turning off**<br>
GNOME turns the screen off on the lock screen. To prevent that use the [Unblank lock screen](https://extensions.gnome.org/extension/1414/unblank/) extension. You can also choose what happens to playback when the screen turns off (ignore, pause, restart, or switch to the next file) under **Events → Action on blank**.

**Playback profiles**<br>
Found under **Performance**:

| Profile | |
|---|---|
| **Quality** | Best image quality, higher GPU usage |
| **Balanced** | Same as Quality with cheaper scaling, a good choice for most laptops |
| **Efficient** | Lowest GPU usage. **Experimental**, may not work on every system and does not support transparency |

If the video does not show up or looks wrong with Efficient, switch to Balanced.

**Media controls**<br>
Enable **Media controls** in the preferences to control playback with media keys or any MPRIS client (e.g. GSConnect).

## Troubleshooting

If the default lock screen shows up instead of your background, check the logs while locking the screen:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep LiveLockScreen
```

Common causes:
- **MPV is not installed** or not in your `PATH`
- **The selected folder has no supported files**. The preferences show the number of playable files and mark the source red if there are none
- **Missing codecs**, the video stays black or only some files play. Check if the file plays with `mpv /path/to/video`, and see the codecs note under [Requirements](#requirements)
- **The Efficient profile does not work on your system**, try Balanced instead
- **Broken custom MPV arguments**, try clearing them

When [reporting a bug](https://github.com/nick-redwill/LiveLockScreen/issues), please include your GNOME Shell version, MPV version (`mpv --version`), and the log output.

## Support

If you enjoy this extension, consider supporting its development.

<p align="center">
  <a href="https://github.com/sponsors/nick-redwill">
    <img src="https://img.shields.io/badge/Sponsor_on_GitHub-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white" height="50" alt="Sponsor on GitHub">
  </a>
</p>

You can also donate with crypto:

**Bitcoin (BTC)**
```
bc1qw6eclug78e2fhx6g5kk88mljcsf4l48y8sxg02
```

**USDT (TRC20)**
```
TFk1UM72jCXCVX53hbVoncFp5k8bVGbhAe
```

## Development

This project is developed with the assistance of AI tools. All changes are planned or approved by the author, and all AI-generated code is reviewed and tested before it is merged.

## License

Released under the [AGPL-3.0](LICENSE.txt) license.
