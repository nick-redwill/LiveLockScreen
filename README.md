<div align="center">

<img src="icon.png" width="128" height="128" alt="Live Lock Screen icon">

# Live Lock Screen

**Set any video or GIF as your GNOME lock screen background.**

<p>
  <img alt="GNOME Shell 46+" src="https://img.shields.io/badge/GNOME_Shell-46%2B-4A86CF?style=for-the-badge&logo=gnome&logoColor=white&labelColor=2B2B2B">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/nick-redwill/LiveLockScreen?style=for-the-badge&color=7E57C2&labelColor=2B2B2B"></a>
  <a href="https://github.com/nick-redwill/LiveLockScreen/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/nick-redwill/LiveLockScreen?style=for-the-badge&logo=github&color=FFB300&labelColor=2B2B2B"></a>
  <img alt="Status" src="https://img.shields.io/badge/Status-Experimental_(MPV)-FB8C00?style=for-the-badge&labelColor=2B2B2B">
</p>

<p>
  <a href="https://www.buymeacoffee.com/nick_redwill"><img alt="Buy me a tea" src="https://img.shields.io/badge/Buy_me_a_tea-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black"></a>
</p>

<p>
  <a href="#installation">Installation</a> •
  <a href="#requirements">Requirements</a> •
  <a href="#support">Support</a>
</p>

</div>

---

> [!WARNING]
> **This is the `experimental-mpv` branch.** It contains an alternative MPV-based playback backend that is still under active development.
>
> While it is expected to become the future default backend, it may contain bugs or missing features.

> [!TIP]
> For the stable implementation, use the [`main`](https://github.com/nick-redwill/LiveLockScreen) branch.

## Installation

**1. Clone the experimental-mpv branch**

```bash
git clone -b experimental-mpv https://github.com/nick-redwill/LiveLockScreen.git
```

**2. Copy it to your extensions folder**

```bash
cp -r LiveLockScreen ~/.local/share/gnome-shell/extensions/live-lockscreen@nick-redwill
```

**3. Log out and back in, then enable the extension**

```bash
gnome-extensions enable live-lockscreen@nick-redwill
```

**4. Open the extension preferences and pick your file** 🎉

## Requirements

- **GNOME Shell 46+**
- **MPV**

### Installing MPV

| Distro | Command |
|---|---|
| Fedora | `sudo dnf install mpv` |
| Ubuntu / Debian | `sudo apt install mpv` |

## Support

If you enjoy this extension, consider buying me a tea. I'm not really a coffee person :D

<p align="center">
  <a href="https://www.buymeacoffee.com/nick_redwill">
    <img src="https://img.buymeacoffee.com/button-api/?text=Buy%20Me%20a%20Tea&emoji=%F0%9F%8D%B5&slug=nick_redwill&button_colour=FFDD00&font_colour=000000&font_family=Lato&outline_colour=000000&coffee_colour=ffffff" height="50" alt="Buy me a tea">
  </a>
</p>

## License

Released under the [AGPL-3.0](LICENSE) license.
