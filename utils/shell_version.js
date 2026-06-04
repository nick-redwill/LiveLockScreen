import * as Config from 'resource:///org/gnome/shell/misc/config.js';

const [major] = Config.PACKAGE_VERSION.split('.');
export const SHELL_VERSION = Number.parseInt(major);
