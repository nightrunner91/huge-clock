import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

/*
 * Stable loader. GNOME caches extension modules forever, so this file must not
 * need edits: all real code lives in impl.js and is re-imported (with a
 * cache-busting query) whenever impl.js changes on disk. Save impl.js and the
 * widget reloads itself within a second, no logout required.
 */

const IMPL = 'impl.js';

export default class HugeClockExtension extends Extension {
    enable() {
        this._enabled = true;
        this._impl = null;
        this._implPath = GLib.build_filenamev([this.path, IMPL]);
        this._stamp = null;

        this._reload();

        this._watchId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            if (this._stampOf() !== this._stamp)
                this._reload();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        this._enabled = false;

        if (this._watchId) {
            GLib.Source.remove(this._watchId);
            this._watchId = null;
        }

        this._teardown();
        this._implPath = null;
        this._stamp = null;
    }

    _stampOf() {
        const file = Gio.File.new_for_path(this._implPath);

        try {
            const info = file.query_info(
                'time::modified,time::modified-usec',
                Gio.FileQueryInfoFlags.NONE, null);
            return `${info.get_attribute_uint64('time::modified')}` +
                   `.${info.get_attribute_uint32('time::modified-usec')}`;
        } catch {
            return 'missing';
        }
    }

    _teardown() {
        if (!this._impl)
            return;

        try {
            this._impl.disable();
        } catch (e) {
            logError(e, 'hugeclock: error while disabling impl');
        }

        this._impl = null;
    }

    async _reload() {
        const stamp = this._stampOf();
        this._stamp = stamp;

        this._teardown();

        try {
            const uri = Gio.File.new_for_path(this._implPath).get_uri();
            const module = await import(`${uri}?v=${stamp}`);
            const impl = new module.default(this.getSettings());

            if (!this._enabled) {
                impl.enable();
                impl.disable();
                return;
            }

            impl.enable();
            this._impl = impl;
        } catch (e) {
            logError(e, 'hugeclock: failed to load impl.js');
        }
    }
}
