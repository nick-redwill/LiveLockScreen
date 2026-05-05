import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";

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
            margin_top: 32,
            margin_bottom: 24,
            halign: Gtk.Align.CENTER,
        });

        const logo = Gtk.Picture.new_for_filename(
            GLib.build_filenamev([this._path, "icon.png"]),
        );
        logo.set_size_request(96, 96);
        logo.add_css_class("icon-dropshadow");
        box.append(logo);

        const name = new Gtk.Label({
            label: this._metadata.name ?? "Live Lockscreen",
            css_classes: ["title-2"],
            margin_top: 8,
        });
        box.append(name);

        const version = new Gtk.Label({
            label: `Version ${this._metadata["version-name"] ?? "—"}`,
            css_classes: ["dim-label"],
        });
        box.append(version);

        const description = new Gtk.Label({
            label:
                this._metadata.description ??
                "Play a video or GIF as your GNOME lock screen background.",
            wrap: true,
            justify: Gtk.Justification.CENTER,
            margin_top: 8,
            margin_start: 10,
            margin_end: 10,
            max_width_chars: 50,
        });
        box.append(description);

        row.set_child(box);
        group.add(row);
        return group;
    }

    _buildLinksGroup() {
        const group = new Adw.PreferencesGroup({ title: "Links" });

        const links = [
            {
                title: "Source Code",
                subtitle: "View the project on GitHub",
                icon: "code-symbolic",
                url: this._metadata.url ?? "https://github.com/",
            },
            {
                title: "Report a Bug",
                subtitle: "Open an issue on the bug tracker",
                icon: "bug-symbolic",
                url:
                    (this._metadata.url ?? "https://github.com/") +
                    "/issues",
            },
            {
                title: "Donate",
                subtitle: "Support the developer",
                icon: "emblem-favorite-symbolic",
                // hardcoded for reliability
                url: "https://buymeacoffee.com/nick_redwill", 
            },
        ];

        for (const { title, subtitle, icon, url } of links)
            group.add(this._buildLinkRow(title, subtitle, icon, url));

        return group;
    }

    _buildLinkRow(title, subtitle, iconName, url) {
        const row = new Adw.ActionRow({
            title,
            subtitle,
            activatable: true,
        });

        row.add_suffix(
            new Gtk.Image({
                icon_name: "adw-external-link-symbolic",
                css_classes: ["dim-label"],
                valign: Gtk.Align.CENTER,
            }),
        );

        row.connect("activated", () => {
            Gio.AppInfo.launch_default_for_uri(url, null);
        });

        return row;
    }
});
