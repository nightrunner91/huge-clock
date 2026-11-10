import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/* ─── tweak here ─────────────────────────────────────────────────────────── */

// GNOME's default interface font, with fallbacks
const FONT_FAMILY = '"Adwaita Sans", "Cantarell"';
// Font weight (400 regular, 500 medium, 700 bold)
const FONT_WEIGHT = 500;
// Font size as a fraction of the monitor's long side
// (1920 → 288 px, both on a 1920×1080 landscape and a 1080×1920 portrait)
const SIZE_RATIO = 0.15;
// Text colour
const COLOR_ON_DARK = 'rgba(255, 255, 255, 0.95)';
const COLOR_ON_LIGHT = 'rgba(18, 18, 22, 0.88)';
// Set to true to show seconds (18:51:07) instead of 18:51
const SHOW_SECONDS = false;
// Show clocks only on monitors from these panel vendors (EDID codes):
// 'SAM' = Samsung, 'BNQ' = BenQ. Empty array = every monitor.
const ONLY_VENDORS = ['SAM'];
// Hide the clock on the primary monitor while it has any windows on it
const HIDE_ON_PRIMARY_WITH_WINDOWS = true;

/* ────────────────────────────────────────────────────────────────────────── */

export default class HugeClock {
    enable() {
        this._iface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._clocks = [];
        this._buildSeq = 0;
        this._backgroundGroup = Main.layoutManager._backgroundGroup;

        this._buildClocks();

        this._signals = [
            this._iface.connect('changed::color-scheme', () => this._refreshStyle()),
            Main.layoutManager.connect('monitors-changed', () => this._buildClocks()),
        ];

        // Tick once a second: updates the time and the primary-monitor visibility.
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            const text = this._timeText();
            for (const {label} of this._clocks) {
                if (label.text !== text)
                    label.text = text;
            }

            this._updateVisibility();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        this._buildSeq++;

        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }

        for (const id of this._signals ?? [])
            this._iface.disconnect(id);
        this._signals = [];

        this._destroyClocks();

        this._backgroundGroup = null;
        this._iface = null;
    }

    _timeText() {
        return GLib.DateTime.new_now_local().format(SHOW_SECONDS ? '%H:%M:%S' : '%H:%M');
    }

    _buildClocks() {
        const seq = ++this._buildSeq;
        this._destroyClocks();

        if (ONLY_VENDORS.length === 0) {
            this._populateClocks(seq, null);
            return;
        }

        // Asynchronous on purpose: DisplayConfig is served by this very shell,
        // so a blocking call from here would deadlock and time out.
        Gio.DBus.session.call(
            'org.gnome.Mutter.DisplayConfig',
            '/org/gnome/Mutter/DisplayConfig',
            'org.gnome.Mutter.DisplayConfig',
            'GetCurrentState',
            null, null,
            Gio.DBusCallFlags.NONE, 3000, null,
            (bus, res) => {
                let vendors = null;
                try {
                    vendors = this._parseVendors(bus.call_finish(res));
                } catch (e) {
                    logError(e, 'hugeclock: cannot read monitor vendors');
                }
                this._populateClocks(seq, vendors);
            });
    }

    _populateClocks(seq, vendors) {
        if (seq !== this._buildSeq || !this._backgroundGroup || !this._iface)
            return;

        const monitors = Main.layoutManager.monitors;
        const text = this._timeText();

        for (const monitor of monitors) {
            // If the vendor is unknown, keep the clock rather than hide it.
            const vendor = vendors?.get(`${monitor.x},${monitor.y}`);
            if (vendor && !ONLY_VENDORS.includes(vendor))
                continue;

            // BinLayout centers its child: natural size, dead center.
            const label = new St.Label({text});

            const container = new St.Widget({
                layout_manager: new Clutter.BinLayout(),
            });
            container.add_child(label);

            container.set_position(monitor.x, monitor.y);
            container.set_size(monitor.width, monitor.height);
            this._backgroundGroup.add_child(container);

            this._clocks.push({monitor, container, label});
        }

        this._refreshStyle();
        this._updateVisibility();
    }

    _destroyClocks() {
        for (const {container} of this._clocks)
            container.destroy();
        this._clocks = [];
    }

    // Maps stage position ("x,y") to the panel vendor reported by Mutter.
    _parseVendors(reply) {
        const [, physical, logical] = reply.deepUnpack();

        const vendorByConnector = new Map();
        for (const [ids] of physical)
            vendorByConnector.set(ids[0], ids[1]);

        const vendorByPosition = new Map();
        for (const [x, y, , , , connectors] of logical)
            vendorByPosition.set(`${x},${y}`, vendorByConnector.get(connectors[0][0]));

        return vendorByPosition;
    }

    _updateVisibility() {
        const primaryIndex = Main.layoutManager.primaryIndex;

        for (const {monitor, container} of this._clocks) {
            const busy = HIDE_ON_PRIMARY_WITH_WINDOWS &&
                monitor.index === primaryIndex &&
                this._hasWindowsOn(monitor);

            container.visible = !busy;
        }
    }

    _windowsOn(monitor) {
        const workspace = global.workspace_manager.get_active_workspace();

        return global.get_window_actors()
            .map(actor => actor.meta_window)
            .filter(win => win && !win.is_skip_taskbar() && !win.minimized)
            .filter(win => win.located_on_workspace(workspace))
            .filter(win => win.get_monitor() === monitor.index);
    }

    _hasWindowsOn(monitor) {
        return this._windowsOn(monitor).length > 0;
    }

    _refreshStyle() {
        if (!this._iface)
            return;

        const dark = this._iface.get_string('color-scheme') === 'prefer-dark';
        const color = dark ? COLOR_ON_DARK : COLOR_ON_LIGHT;

        for (const {monitor, label} of this._clocks) {
            // Rotation is already applied to the monitor geometry, so a portrait
            // screen reports e.g. 1080×1920 and the long side stays 1920.
            const longSide = Math.max(monitor.width, monitor.height);
            const fontSize = Math.round(longSide * SIZE_RATIO);

            label.set_style(
                `font-family: ${FONT_FAMILY}; ` +
                `font-weight: ${FONT_WEIGHT}; ` +
                `font-size: ${fontSize}px; ` +
                `font-feature-settings: "tnum" 1; ` +
                `color: ${color};`);
        }
    }
}
