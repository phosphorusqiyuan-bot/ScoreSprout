const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel,...args) => ipcRenderer.invoke(channel,...args).then(result => {
  if (!result.ok) throw new Error(result.error); return result.data;
});
contextBridge.exposeInMainWorld('scoresprout', {
  importMidi:()=>invoke('import-midi'), getSource:id=>invoke('get-source',id),
  selectAudio:()=>invoke('select-audio'),
  transcribeAudio:(token,samples,onProgress)=>{
    const listener=(_event,message)=>{if(message.token===token)onProgress(message.progress);};
    ipcRenderer.on('transcription-progress',listener);
    return invoke('transcribe-audio',token,samples).finally(()=>ipcRenderer.removeListener('transcription-progress',listener));
  },
  saveTranscription:token=>invoke('save-transcription',token),
  exportSourceMidi:id=>invoke('export-source-midi',id),
  renameSong:(id,title)=>invoke('rename-song',id,title), previewTrack:(id,trackId)=>invoke('preview-track',id,trackId),
  generate:(...args)=>invoke('generate-version',...args), listLibrary:()=>invoke('list-library'),
  loadVersion:(songId,variantId)=>invoke('load-version',songId,variantId),
  deleteVersion:(songId,variantId)=>invoke('delete-version',songId,variantId),
  exportVersion:(songId,variantId,format,options)=>invoke('export-version',songId,variantId,format,options)
});
