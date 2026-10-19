<div align="center">

<img src="icon.png" width="128" height="128" alt="Live Lock Screen icon">

# Live Lock Screen

**Set any video as your GNOME lock screen background.**

<p>
  <img alt="GNOME Shell 47-50" src="https://img.shields.io/badge/GNOME_Shell-47--50-4A86CF?style=for-the-badge&logo=gnome&logoColor=white&labelColor=2B2B2B">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/nick-redwill/LiveLockScreen?style=for-the-badge&color=7E57C2&labelColor=2B2B2B"></a>
  <a href="https://github.com/nick-redwill/LiveLockScreen/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/nick-redwill/LiveLockScreen?style=for-the-badge&logo=github&color=FFB300&labelColor=2B2B2B"></a>
  <img alt="Status" src="https://img.shields.io/badge/Status-Legacy-E53935?style=for-the-badge&labelColor=2B2B2B">
</p>

<p>
  <a href="https://github.com/sponsors/nick-redwill"><img alt="Sponsor" src="https://img.shields.io/badge/Sponsor-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white"></a>
  <a href="https://www.buymeacoffee.com/nick_redwill"><img alt="Buy me a tea" src="https://img.shields.io/badge/Buy_me_a_tea-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black"></a>
</p>

<p>
  <a href="#features">Features</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#known-issues">Known Issues</a> •
  <a href="#installation">Installation</a> •
  <a href="#support">Support</a>
</p>

</div>

---

> [!WARNING]
> **This is the `legacy` branch.** For the latest version with more features and better stability, switch to the [`main`](https://github.com/nick-redwill/LiveLockScreen) branch.

> [!TIP]
> If you experience issues, check the **Debug** section in preferences for workarounds.

## Features

| | Feature | |
|:-:|---|---|
| 🎬 | **Video playback** | Use any video file as the lock screen background |
| 🔁 | **Looping** | Seamless loop support |
| 🎨 | **Scaling modes** | Cover, fit, or stretch |
| 🔲 | **Transparency** | Transparent video support (RGBA) |
| ⏸️ | **Auto pause** | Pauses and resumes on suspend/wake |
| 🌌 | **Fade-in** | Configurable fade-in animation |
| 🖥️ | **Multi-monitor** | Multiple monitor support |
| 🌫️ | **Blur effect** | Adjustable blur radius and brightness |
| 🎞️ | **Frame rate control** | Configurable from 1 to 120 FPS |
| 🔊 | **Audio** | Optional audio output with volume control and fade-in/out |
| 🔑 | **Password prompt reactions** | Blur/brightness change, video pause, and more |

## Known Issues

- Possible audio and video desync after suspend/wake
- Brief green frame at video start — enable **Skip first frame** in Debug settings to fix
- Possible clicking/crackling sounds when pausing/playing video with audio
- Performance issues and shell crashes with high-res videos (hardware dependent)

## Installation

### From GNOME Extensions (recommended)

<a href="https://extensions.gnome.org/extension/9419/live-lock-screen/">
  <img src="https://github.com/user-attachments/assets/d15de748-11b8-4a85-ad34-ec7786547b3c" width="220" alt="Get it on GNOME Extensions">
</a>

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

**4. Open the extension preferences and pick your video file** 🎉

## Support

If you enjoy this extension, consider buying me a tea. I'm not really a coffee person :D

<p align="center">
  <a href="https://github.com/sponsors/nick-redwill">
    <img src="https://img.shields.io/badge/Sponsor_on_GitHub-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white" height="50" alt="Sponsor on GitHub">
  </a>
  <br>
  <a href="https://www.buymeacoffee.com/nick_redwill">
    <img src="https://img.buymeacoffee.com/button-api/?text=Buy%20Me%20a%20Tea&emoji=%F0%9F%8D%B5&slug=nick_redwill&button_colour=FFDD00&font_colour=000000&font_family=Lato&outline_colour=000000&coffee_colour=ffffff" height="50" alt="Buy me a tea">
  </a>
</p>

## License

Released under the [AGPL-3.0](LICENSE) license.
