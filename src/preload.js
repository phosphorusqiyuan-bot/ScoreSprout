const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel,...args) => ipcRenderer.invoke(channel,...args).then(result => {
  if (!result.ok) throw new Error(result.error); return result.data;
});
contextBridge.exposeInMainWorld('scoresprout', {
  importMidi:()=>invoke('import-midi'), getSource:id=>invoke('get-source',id),
  renameSong:(id,title)=>invoke('rename-song',id,title), previewTrack:(id,trackId)=>invoke('preview-track',id,trackId),
  generate:(...args)=>invoke('generate-version',...args), listLibrary:()=>invoke('list-library'),
  loadVersion:(songId,variantId)=>invoke('load-version',songId,variantId),
  exportVersion:(songId,variantId,format)=>invoke('export-version',songId,variantId,format)
});
