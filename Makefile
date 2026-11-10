UUID    := huge-clock@nightrunner91.github.io
FILES   := extension.js impl.js metadata.json
EXTDIR  := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
ZIP     := $(UUID).zip

.PHONY: all zip install uninstall clean

all: zip

zip:
	rm -f $(ZIP)
	zip -q $(ZIP) $(FILES)

install:
	mkdir -p $(EXTDIR)
	cp -f $(FILES) $(EXTDIR)/
	@echo
	@echo "Installed to $(EXTDIR)"
	@echo "Log out and back in, then enable it:"
	@echo "  gnome-extensions enable $(UUID)"

uninstall:
	rm -rf $(EXTDIR)

clean:
	rm -f $(ZIP)
