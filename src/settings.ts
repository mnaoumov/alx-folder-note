import "./settings.less";

import { getApi } from "@aidenlx/obsidian-icon-shortcodes";
import { App, Modifier, Platform, PluginSettingTab, Setting } from "obsidian";

import { folderIconMark } from "./fe-handler/folder-mark";
import ALxFolderNote from "./fn-main";
import { NoteLoc } from "./misc";

export const noHideNoteMark = "alx-no-hide-note";
export const MobileNoClickMark = "alx-no-click-on-mobile";

export interface ALxFolderNoteSettings {
  modifierForNewNote: Modifier;
  hideNoteInExplorer: boolean;
  hideCollapseIndicator: boolean;
  longPressFocus: boolean;
  folderIcon: boolean;
  folderNotePref: NoteLoc | null;
  deleteOutsideNoteWithFolder: boolean | null;
  indexName: string | null;
  autoRename: boolean | null;
  folderNoteTemplate: string | null;
  mobileClickToOpen: boolean;
  longPressDelay: number;
  expandFolderOnClick: boolean;
}

export const DEFAULT_SETTINGS: ALxFolderNoteSettings = {
  modifierForNewNote: "Mod",
  hideNoteInExplorer: true,
  hideCollapseIndicator: false,
  longPressFocus: false,
  folderIcon: true,
  folderNotePref: null,
  deleteOutsideNoteWithFolder: null,
  indexName: null,
  autoRename: null,
  folderNoteTemplate: null,
  mobileClickToOpen: true,
  longPressDelay: 800,
  expandFolderOnClick: false,
};

type SettingKeyWithType<T> = {
  [K in keyof ALxFolderNoteSettings]: ALxFolderNoteSettings[K] extends T
    ? K
    : never;
}[keyof ALxFolderNoteSettings];

const old = [
  "folderNotePref",
  "deleteOutsideNoteWithFolder",
  "indexName",
  "autoRename",
  "folderNoteTemplate",
] as const;

export class ALxFolderNoteSettingTab extends PluginSettingTab {
  plugin: ALxFolderNote;

  constructor(app: App, plugin: ALxFolderNote) {
    super(app, plugin);
    this.plugin = plugin;
  }

  checkMigrated(): boolean {
    return old.every((key) => this.plugin.settings[key] === null);
  }

  getInitGuide(
    desc: string,
    targetPluginID: string,
    container: HTMLElement,
  ): Setting {
    return new Setting(container)
      .setDesc(
        desc +
          "use the buttons to install & enable it then reload alx-folder-note to take effects",
      )
      .addButton((btn) =>
        btn
          .setIcon("down-arrow-with-tail")
          .setTooltip("Go to Plugin Page")
          .onClick(() =>
            window.open(`obsidian://show-plugin?id=${targetPluginID}`),
          ),
      )
      .addButton((btn) =>
        btn
          .setIcon("reset")
          .setTooltip("Reload alx-folder-note")
          .onClick(async () => {
            await this.app.plugins.disablePlugin(this.plugin.manifest.id);
            await this.app.plugins.enablePlugin(this.plugin.manifest.id);
            this.app.setting.openTabById(this.plugin.manifest.id);
          }),
      );
  }

  display(): void {
    let { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setHeading().setName("Core");
    try {
      this.plugin.CoreApi; // throw error when not available
      if (this.checkMigrated()) {
        this.plugin.CoreApi.renderCoreSettings(containerEl);
      } else this.setMigrate();
    } catch (error) {
      this.getInitGuide(
        "Seems like Folder Note Core is not enabled, ",
        "folder-note-core",
        containerEl,
      );
      return;
    }

    this.setFolderIcon();
    this.setModifier();
    this.setHide();
    this.addToggle(this.containerEl, "expandFolderOnClick")
      .setName("Expand Folder on Click")
      .setDesc(
        "Expand collapsed folders with note while opening them by clicking on folder title",
      );
    this.setMobile();
    this.setFocus();

    new Setting(containerEl).setHeading().setName("Folder Overview");
    const folderv = this.app.plugins.plugins["alx-folder-note-folderv"];
    if (folderv?.renderFoldervSettings) {
      folderv.renderFoldervSettings(containerEl);
    } else {
      this.getInitGuide(
        "Folder Overview (folderv) is now an optional component, ",
        "alx-folder-note-folderv",
        containerEl,
      );
    }

    new Setting(containerEl).setHeading().setName("Debug");
    this.plugin.CoreApi.renderLogLevel(containerEl);
  }

  setMigrate() {
    new Setting(this.containerEl)
      .setName("Migrate settings to Folder Note Core")
      .setDesc(
        "Some settings has not been migrated to Folder Note Core, " +
          "click Migrate to migrate old config " +
          "or Cancel to use config in Folder Note Core in favor of old config",
      )
      .addButton((cb) =>
        cb.setButtonText("Migrate").onClick(async () => {
          const toImport = old.reduce(
            (obj, k) => ((obj[k] = this.plugin.settings[k] ?? undefined), obj),
            {} as any,
          );
          this.plugin.CoreApi.importSettings(toImport);
          old.forEach((k) => ((this.plugin.settings as any)[k] = null));
          await this.plugin.saveSettings();
          this.display();
        }),
      )
      .addButton((cb) =>
        cb.setButtonText("Cancel").onClick(async () => {
          old.forEach((k) => ((this.plugin.settings as any)[k] = null));
          await this.plugin.saveSettings();
          this.display();
        }),
      );
  }

  setMobile() {
    if (!Platform.isMobile) return;
    this.addToggle(this.containerEl, "mobileClickToOpen", (value) =>
      document.body.toggleClass(MobileNoClickMark, !value),
    )
      .setName("Click folder title to open folder note on mobile")
      .setDesc(
        "Disable this if you want to the default action. You can still use context menu to open folder note",
      );
  }

  setModifier = () => {
    new Setting(this.containerEl)
      .setName("Modifier for New Note")
      .setDesc("Choose a modifier to click folders with to create folder notes")
      .addDropdown((dropDown) => {
        type NoShift = Exclude<Modifier, "Shift">;
        const windowsOpts: Record<NoShift, string> = {
          Mod: "Ctrl (Cmd in macOS)",
          Ctrl: "Ctrl (Ctrl in macOS)",
          Meta: "⊞ Win",
          // Shift: "Shift",
          Alt: "Alt",
        };
        const macOSOpts: Record<NoShift, string> = {
          Mod: "⌘ Cmd (Ctrl in Windows)",
          Ctrl: "⌃ Control",
          Meta: "⌘ Cmd (Win in Windows)",
          // Shift: "⇧ Shift",
          Alt: "⌥ Option",
        };

        const options = Platform.isMacOS ? macOSOpts : windowsOpts;

        dropDown
          .addOptions(options)
          .setValue(this.plugin.settings.modifierForNewNote)
          .onChange(async (value: string) => {
            this.plugin.settings.modifierForNewNote = value as NoShift;
            await this.plugin.saveSettings();
          });
      });
  };

  setHide() {
    this.addToggle(this.containerEl, "hideNoteInExplorer", (value) =>
      document.body.toggleClass(noHideNoteMark, !value),
    )
      .setName("Hide Folder Note")
      .setDesc("Hide folder note files from file explorer");
    this.addToggle(this.containerEl, "hideCollapseIndicator")
      .setName("Hide Collapse Indicator")
      .setDesc(
        "Hide collapse indicator when folder contains only folder note, reload obsidian to take effects",
      );
  }
  setFolderIcon() {
    this.addToggle(this.containerEl, "folderIcon", (value) =>
      document.body.toggleClass(folderIconMark, value),
    )
      .setName("Set Folder Icon in Folder Notes")
      .setDesc(
        createFragment((el) => {
          el.appendText(
            "Set `icon` field with icon shortcode in frontmatter of foler note to specify linked folder's icon",
          );
          el.createEl("br");

          el.createEl("a", {
            href: "https://github.com/aidenlx/obsidian-icon-shortcodes",
            text: "Icon Shortcodes v0.5.1+",
          });
          el.appendText(" Required. ");
          if (!getApi(this.plugin)) el.appendText("(Currently not enabled)");
          el.createEl("br");

          el.appendText("Restart obsidian to take effects");
        }),
      );
  }
  setFocus() {
    new Setting(this.containerEl)
      .setHeading()
      .setName("Focus")
      .setDesc(
        `You can use "Toggle Focus" option in folder context menu${
          Platform.isMobile ? "" : " or long press on folder title"
        } to focus on a specific folder`,
      );
    if (!Platform.isMobile)
      this.addToggle(this.containerEl, "longPressFocus")
        .setName("Long Press on Folder to Focus")
        .setDesc(
          "Long press with mouse on folder name inside file explorer to focus the folder. " +
            "Only work on Desktop, reload obsidian to take effects",
        );
    new Setting(this.containerEl)
      .addText((text) => {
        Object.assign(text.inputEl, {
          type: "number",
          min: "0.2",
          step: "0.1",
          required: true,
        });
        text.inputEl.addClass("input-short");
        text.inputEl.insertAdjacentElement(
          "afterend",
          createSpan({ cls: ["validity", "unit"], text: "second(s)" }),
        );
        text
          .setValue(`${this.plugin.longPressDelay / 1e3}`)
          .onChange(async (val) => {
            const delay = +val * 1e3;
            this.plugin.longPressDelay = delay;
            await this.plugin.saveSettings();
          });
      })
      .setName("Long Press Delay");
  }

  addToggle(
    addTo: HTMLElement,
    key: SettingKeyWithType<boolean>,
    onSet?: (value: boolean) => any,
  ): Setting {
    return new Setting(addTo).addToggle((toggle) => {
      toggle
        .setValue(this.plugin.settings[key])
        .onChange(
          (value) => (
            (this.plugin.settings[key] = value),
            onSet && onSet(value),
            this.plugin.saveSettings()
          ),
        );
    });
  }
}
