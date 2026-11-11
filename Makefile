UUID     := huge-clock@nightrunner91.github.io
SCHEMA   := schemas/org.gnome.shell.extensions.huge-clock.gschema.xml
COMPILED := schemas/gschemas.compiled
FILES    := extension.js impl.js prefs.js metadata.json
PACKAGE  := $(FILES) LICENSE
EXTDIR   := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
ZIP      := $(UUID).zip

.PHONY: all zip install uninstall clean

all: zip

$(COMPILED): $(SCHEMA)
	glib-compile-schemas schemas

zip: $(COMPILED)
	rm -f $(ZIP)
	zip -q $(ZIP) $(PACKAGE) $(SCHEMA) $(COMPILED)

install: $(COMPILED)
	mkdir -p $(EXTDIR)/schemas
	cp -f $(FILES) $(EXTDIR)/
	cp -f $(SCHEMA) $(COMPILED) $(EXTDIR)/schemas/
	@echo
	@echo "Installed to $(EXTDIR)"
	@echo "Log out and back in, then enable it:"
	@echo "  gnome-extensions enable $(UUID)"
	@echo "Open the settings:"
	@echo "  gnome-extensions prefs $(UUID)"

uninstall:
	rm -rf $(EXTDIR)

clean:
	rm -f $(ZIP) $(COMPILED)
