const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel,...args) => ipcRenderer.invoke(channel,...args).then(result => {
  if (!result.ok) throw new Error(result.error); return result.data;
});
contextBridge.exposeInMainWorld('scoresprout', {
  importMidi:()=>invoke('import-midi'), getSource:id=>invoke('get-source',id),
  selectAudio:()=>invoke('select-audio'), saveTranscription:(token,notes)=>invoke('save-transcription',token,notes),
  exportSourceMidi:id=>invoke('export-source-midi',id),
  renameSong:(id,title)=>invoke('rename-song',id,title), previewTrack:(id,trackId)=>invoke('preview-track',id,trackId),
  generate:(...args)=>invoke('generate-version',...args), listLibrary:()=>invoke('list-library'),
  loadVersion:(songId,variantId)=>invoke('load-version',songId,variantId),
  deleteVersion:(songId,variantId)=>invoke('delete-version',songId,variantId),
  exportVersion:(songId,variantId,format)=>invoke('export-version',songId,variantId,format)
});
