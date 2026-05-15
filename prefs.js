import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import { isGtk4PaintableSinkAvailable } from "./utils/check_dependencies.js";

import { GeneralPage } from "./ui/general_page.js";
import { AppearancePage } from "./ui/appearance_page.js";
import { PromptPage } from "./ui/prompt_page.js";
import { DebugPage } from "./ui/debug_page.js";
import { DependencyErrorPage } from "./ui/dependency_error_page.js";
import { AboutPage } from "./ui/about_page.js";

export default class LLSPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_default_size(500, 600);
        window.set_search_enabled(true);

        if (!isGtk4PaintableSinkAvailable()) {
            window.add(new DependencyErrorPage());
            window.add(new AboutPage(this.metadata, this.path));
            return;
        }

        window.add(new GeneralPage(settings));
        window.add(new AppearancePage(settings));
        window.add(new PromptPage(settings));
        window.add(new DebugPage(settings));
        window.add(new AboutPage(this.metadata, this.path));
    }
}
