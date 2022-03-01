import { around } from "monkey-around";
import type {
  FileExplorerPlugin as FEPluginCls,
  FileExplorerView as FEViewCls,
  FolderItem as FolderItemCls,
} from "obsidian";
import { TAbstractFile, TFile, TFolder } from "obsidian";

import { getClickHandler, pressHandler } from "./click-handler";
import getFileExplorerHandlers from "./fe-handler";
import ALxFolderNote from "./fn-main";
import { getViewOfType } from "./misc";
import AddLongPressEvt, { LongPressEvent } from "./modules/long-press";

const getFolderItemFromEl = (navEl: HTMLElement, view: FEViewCls) => {
  const folder = view.files.get(navEl);
  return folder instanceof TFolder
    ? (view.fileItems[folder.path] as FolderItemCls)
    : null;
};
/**
 * reset existing file explorer views
 */
const resetFileExplorer = async (plugin: ALxFolderNote) => {
  for (const leaf of plugin.app.workspace.getLeavesOfType("file-explorer")) {
    let state = leaf.getViewState();
    await leaf.setViewState({ type: "empty" });
    leaf.setViewState(state);
  }
};

export const monkeyPatch = (plugin: ALxFolderNote) => {
  const { getFolderFromNote } = plugin.CoreApi,
    clickHandler = getClickHandler(plugin);

  let FileExplorerViewInst: FEViewCls | null = getViewOfType<FEViewCls>(
      "file-explorer",
      plugin.app,
    ),
    FileExplorerPluginInst =
      plugin.app.internalPlugins.plugins["file-explorer"]?.instance;
  if (!FileExplorerViewInst || !FileExplorerPluginInst) return;

  // get constructors
  const FileExplorerView = FileExplorerViewInst.constructor as typeof FEViewCls,
    FileExplorerPlugin =
      FileExplorerPluginInst.constructor as typeof FEPluginCls,
    FolderItem = FileExplorerViewInst.createFolderDom(
      plugin.app.vault.getRoot(),
    ).constructor as typeof FolderItemCls;

  FileExplorerViewInst = null;

  const uninstallers: ReturnType<typeof around>[] = [
    around(FileExplorerView.prototype, {
      load: (next) =>
        function (this: FEViewCls) {
          const self = this;
          next.call(self);
          self.folderNoteUtils = getFileExplorerHandlers(plugin, self);
          AddLongPressEvt(plugin, self.dom.navFileContainerEl);
          self.containerEl.on(
            "auxclick",
            ".nav-folder",
            (evt: MouseEvent, navEl: HTMLElement) => {
              const item = getFolderItemFromEl(navEl, self);
              item && clickHandler(item, evt);
            },
          );
          self.containerEl.on(
            "long-press" as any,
            ".nav-folder",
            (evt: LongPressEvent, navEl: HTMLElement) => {
              const item = getFolderItemFromEl(navEl, self);
              item && pressHandler(item, evt);
            },
          );
        },
    }),
    // patch reveal in folder to alter folder note target to linked folder
    around(FileExplorerPlugin.prototype, {
      revealInFolder: (next) =>
        function (this: FEPluginCls, file: TAbstractFile) {
          if (file instanceof TFile && plugin.settings.hideNoteInExplorer) {
            const findResult = getFolderFromNote(file);
            if (findResult) file = findResult;
          }
          return next.call(this, file);
        },
    }),
    around(FolderItem.prototype, {
      onTitleElClick: (next) =>
        async function (this: FolderItemCls, evt) {
          // if folder note click not success,
          // fallback to default
          if (!(await clickHandler(this, evt))) next.call(this, evt);
        },
    }),
  ];
  resetFileExplorer(plugin);
  plugin.register(() => {
    // uninstall monkey patches
    uninstallers.forEach((revert) => revert());
    resetFileExplorer(plugin);
  });
};
