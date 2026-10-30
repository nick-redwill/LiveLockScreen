import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Pango from "gi://Pango";

export var AboutPage = GObject.registerClass(
class LLSAboutPage extends Adw.PreferencesPage {
    _init(metadata, path) {
        super._init({
            title: "About",
            icon_name: "help-about-symbolic",
            name: "AboutPage",
        });

        this._metadata = metadata;
        this._path = path;

        this.add(this._buildBannerGroup());
        this.add(this._buildLinksGroup());
        this.add(this._buildSupportGroup());
    }

    _buildBannerGroup() {
        const group = new Adw.PreferencesGroup();

        const row = new Adw.PreferencesRow({
            activatable: false,
            selectable: false,
            focusable: false,
        });
        row.add_css_class("no-activatable-frame");

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 30,
            margin_bottom: 30,
            halign: Gtk.Align.CENTER,
        });

        const logo = Gtk.Image.new_from_file(
            GLib.build_filenamev([this._path, "icon.png"]),
        );
        logo.set_pixel_size(128);
        logo.add_css_class("icon-dropshadow");
        box.append(logo);

        const name = new Gtk.Label({
            label: this._metadata.name ?? "Live Lockscreen",
            css_classes: ["title-1"],
            margin_top: 8,
        });
        box.append(name);

        //NOTE:
        // libadwaita has no style class between body text and title-4,
        // so the tagline is scaled up slightly instead
        const taglineAttrs = new Pango.AttrList();
        taglineAttrs.insert(Pango.attr_scale_new(1.15));

        const tagline = new Gtk.Label({
            label: "Bring your lock screen to life",
            attributes: taglineAttrs,
            css_classes: ["dim-label"],
            wrap: true,
            justify: Gtk.Justification.CENTER,
            max_width_chars: 50,
            margin_top: 8,
        });
        box.append(tagline);

        const version = new Gtk.Label({
            label: `Version ${this._metadata["version-name"] ?? "—"}`,
            css_classes: ["caption", "dim-label"],
            margin_top: 8,
        });
        box.append(version);

        row.set_child(box);
        group.add(row);
        return group;
    }

    _buildLinksGroup() {
        const group = new Adw.PreferencesGroup({ title: "Links" });
        //NOTE: Honestly just hardcoding links is fine
        const links = [
            {
                title: "Source Code",
                subtitle: "View the project on GitHub",
                icon: "adw-external-link-symbolic",
                url: "https://github.com/nick-redwill/LiveLockScreen",
            },
            {
                title: "Report a Bug",
                subtitle: "Open an issue on the bug tracker",
                icon: "adw-external-link-symbolic",
                url: "https://github.com/nick-redwill/LiveLockScreen/issues",
            },
        ];

        for (const { title, subtitle, icon, url } of links)
            group.add(this._buildLinkRow(title, subtitle, icon, url));

        return group;
    }

    _buildSupportGroup() {
        const group = new Adw.PreferencesGroup({ title: "Support the Developer" });

        group.add(this._buildLinkRow(
            "GitHub Sponsors",
            "Become a sponsor on GitHub",
            "emblem-favorite-symbolic",
            "https://github.com/sponsors/nick-redwill",
        ));

        const wallets = [
            {
                title: "Bitcoin (BTC)",
                address: "bc1qw6eclug78e2fhx6g5kk88mljcsf4l48y8sxg02",
            },
            {
                title: "USDT (TRC20)",
                address: "TFk1UM72jCXCVX53hbVoncFp5k8bVGbhAe",
            },
        ];

        for (const { title, address } of wallets)
            group.add(this._buildWalletRow(title, address));

        return group;
    }

    _buildWalletRow(title, address) {
        const row = new Adw.ActionRow({
            title,
            subtitle: address,
            subtitle_selectable: true,
        });

        const copyButton = new Gtk.Button({
            icon_name: "edit-copy-symbolic",
            tooltip_text: "Copy address",
            css_classes: ["flat"],
            valign: Gtk.Align.CENTER,
        });

        copyButton.connect("clicked", () => {
            copyButton.get_clipboard().set(address);
            this.get_root()?.add_toast(
                new Adw.Toast({ title: `${title} address copied` }),
            );
        });

        row.add_suffix(copyButton);
        return row;
    }

    _buildLinkRow(title, subtitle, iconName, url) {
        const row = new Adw.ActionRow({
            title,
            subtitle,
            activatable: true,
        });

        row.add_suffix(
            new Gtk.Image({
                icon_name: iconName,
                css_classes: ["dim-label"],
                valign: Gtk.Align.CENTER,
                // Lines up with the icon inside the wallet copy buttons
                margin_end: 10,
            }),
        );

        row.connect("activated", () => {
            Gio.AppInfo.launch_default_for_uri(url, null);
        });

        return row;
    }
});
