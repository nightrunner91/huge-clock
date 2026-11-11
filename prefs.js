import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function rgbaToCss(rgba) {
    const channel = value => Math.round(value * 255);
    const alpha = Math.round(rgba.alpha * 100) / 100;

    return `rgba(${channel(rgba.red)}, ${channel(rgba.green)}, ` +
           `${channel(rgba.blue)}, ${alpha})`;
}

function cssToRgba(string, fallback) {
    const rgba = new Gdk.RGBA();

    if (!rgba.parse(string))
        rgba.parse(fallback);

    return rgba;
}

export default class HugeClockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });

        page.add(this._textGroup());
        page.add(this._colourGroup());
        page.add(this._visibilityGroup());
        page.add(this._monitorGroup());

        window.add(page);
        window.set_default_size(520, 640);
    }

    _bindIntValue(settings, key, row) {
        const sync = () => {
            const value = settings.get_int(key);

            if (row.value !== value)
                row.value = value;
        };

        sync();
        row.connect('notify::value', () => {
            const value = Math.round(row.value);

            if (value !== settings.get_int(key))
                settings.set_int(key, value);
        });
        settings.connect(`changed::${key}`, sync);
    }

    _textGroup() {
        const settings = this._settings;

        const group = new Adw.PreferencesGroup({
            title: 'Text',
            description: 'How the clock digits look.',
        });

        const family = new Adw.EntryRow({title: 'Font family'});
        settings.bind('font-family', family, 'text', Gio.SettingsBindFlags.DEFAULT);
        group.add(family);

        const weight = new Adw.SpinRow({
            title: 'Font weight',
            subtitle: '400 regular, 500 medium, 700 bold',
            digits: 0,
            adjustment: new Gtk.Adjustment({
                lower: 100,
                upper: 900,
                step_increment: 100,
                page_increment: 100,
            }),
        });
        this._bindIntValue(settings, 'font-weight', weight);
        group.add(weight);

        const size = new Adw.SpinRow({
            title: 'Size',
            subtitle: 'Percentage of the monitor’s long side',
            digits: 1,
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 50,
                step_increment: 0.5,
                page_increment: 1,
            }),
        });
        settings.bind('size-percent', size, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(size);

        const seconds = new Adw.SwitchRow({title: 'Show seconds'});
        settings.bind('show-seconds', seconds, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(seconds);

        return group;
    }

    _colourGroup() {
        const group = new Adw.PreferencesGroup({
            title: 'Colour',
            description: 'Picked automatically from the system light or dark preference.',
        });

        group.add(this._colourRow(
            'Colour in dark mode', 'color-on-dark', 'rgba(255, 255, 255, 0.95)'));
        group.add(this._colourRow(
            'Colour in light mode', 'color-on-light', 'rgba(18, 18, 22, 0.88)'));

        return group;
    }

    _colourRow(title, key, fallback) {
        const settings = this._settings;

        const dialog = new Gtk.ColorDialog({title, with_alpha: true});
        const button = new Gtk.ColorDialogButton({
            dialog,
            valign: Gtk.Align.CENTER,
        });
        button.set_rgba(cssToRgba(settings.get_string(key), fallback));

        button.connect('notify::rgba', () => {
            const css = rgbaToCss(button.get_rgba());

            if (css !== settings.get_string(key))
                settings.set_string(key, css);
        });

        settings.connect(`changed::${key}`, () => {
            button.set_rgba(cssToRgba(settings.get_string(key), fallback));
        });

        const row = new Adw.ActionRow({title, activatable_widget: button});
        row.add_suffix(button);

        return row;
    }

    _visibilityGroup() {
        const group = new Adw.PreferencesGroup({
            title: 'Visibility',
            description: 'When the clock gets out of the way.',
        });

        const hide = new Adw.SwitchRow({
            title: 'Hide on the primary monitor while it has windows',
        });
        this._settings.bind(
            'hide-on-primary-with-windows', hide, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(hide);

        return group;
    }

    _monitorGroup() {
        const settings = this._settings;

        const group = new Adw.PreferencesGroup({
            title: 'Monitors',
            description: 'Show the clock only on monitors from these panel vendors. ' +
                         'Comma-separated EDID codes such as SAM or BNQ; ' +
                         'leave empty for every monitor.',
        });

        const vendors = new Adw.EntryRow({
            title: 'Vendor allow-list',
            show_apply_button: true,
        });

        const syncVendors = () => {
            vendors.text = settings.get_strv('only-vendors').join(', ');
        };

        syncVendors();
        vendors.connect('apply', () => {
            const list = vendors.text
                .split(',')
                .map(entry => entry.trim().toUpperCase())
                .filter(Boolean);

            settings.set_strv('only-vendors', list);
            syncVendors();
        });
        settings.connect('changed::only-vendors', syncVendors);
        group.add(vendors);

        return group;
    }
}
