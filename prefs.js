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
            page.add(this._buildDependencyErrorGroup());
        }

        page.add(this._buildGeneralGroup(window))
        page.add(this._buildAppearanceGroup(window))
        page.add(this._buildPromptGroup(window))
        page.add(this._buildDebugGroup(window))

        window.add(page);
    }
}
