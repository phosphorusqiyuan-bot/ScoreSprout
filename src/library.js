const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function deleteVersion(libraryRoot, songId, variantId) {
  if (typeof songId !== 'string' || !/^[a-f0-9]{24}$/.test(songId))
    throw new Error('音乐库项目标识无效。');
  if (typeof variantId !== 'string' || !/^(?:[a-f0-9]{16}|(?:piano|guitar|bass|drums|ensemble)-(?:beginner|intermediate|full)-[a-f0-9]{12})$/.test(variantId))
    throw new Error('乐谱版本标识无效。');
  const dir = path.join(libraryRoot, songId);
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.variants.some(v => v.id === variantId)) throw new Error('此乐谱已删除或不存在。');
  const token = crypto.randomUUID();
  const temporaryManifest = path.join(dir, `manifest-delete-${token}.tmp`);
  const staged = [];
  try {
    // Stage only this version's files so a failed manifest write can be rolled back.
    for (const extension of ['json', 'musicxml', 'mid']) {
      const file = path.join(dir, 'variants', `${variantId}.${extension}`);
      const backup = `${file}.deleting-${token}`;
      try { fs.renameSync(file, backup); staged.push({file, backup}); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    manifest.variants = manifest.variants.filter(v => v.id !== variantId);
    fs.writeFileSync(temporaryManifest, JSON.stringify(manifest, null, 2), 'utf8');
    fs.renameSync(temporaryManifest, manifestPath);
  } catch (error) {
    let rollbackFailed = false;
    for (const {file, backup} of staged.reverse()) {
      try { fs.renameSync(backup, file); } catch { rollbackFailed = true; }
    }
    try { fs.unlinkSync(temporaryManifest); } catch {}
    throw new Error(rollbackFailed ?
      '删除失败，部分文件未能恢复。请保留音乐库目录并重新启动应用。' :
      `删除失败，乐谱已保留：${error.message}`);
  }
  let cleanupFailed = false;
  for (const {backup} of staged) {
    try { fs.unlinkSync(backup); } catch { cleanupFailed = true; }
  }
  return { deleted:true, warning:cleanupFailed ? '乐谱已移出音乐库，但部分临时文件未能清理。' : '' };
}

function deleteSource(libraryRoot,songId) {
  if(typeof songId!=='string'||!/^[a-f0-9]{24}$/.test(songId))throw Error('音乐库项目标识无效。');
  const root=fs.realpathSync(libraryRoot),dir=path.join(root,songId);
  if(!fs.existsSync(dir))throw Error('此源文件已删除或不存在。');
  // Never recursively remove a linked folder or anything outside this library.
  if(fs.lstatSync(dir).isSymbolicLink()||path.dirname(fs.realpathSync(dir))!==root)
    throw Error('源文件目录异常，无法删除。');
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  if(!Array.isArray(manifest.variants))throw Error('源文件信息损坏，无法安全删除。');
  if(manifest.variants.length)throw Error('此歌曲已有乐谱，请先删除所有乐谱版本，再删除源文件。');
  const variants=path.join(dir,'variants');
  if(fs.existsSync(variants)&&fs.readdirSync(variants).length)
    throw Error('此源文件仍有关联的乐谱文件，请检查音乐库后重试。');
  // Atomically remove the source from the visible library before cleaning up.
  const removed=path.join(root,`.deleted-source-${songId}-${crypto.randomUUID()}`);
  if(path.dirname(path.resolve(removed))!==root)throw Error('源文件目录异常，无法删除。');
  fs.renameSync(dir,removed);
  try {fs.rmSync(removed,{recursive:true,force:true,maxRetries:2,retryDelay:100});}
  catch {return {deleted:true,warning:'源文件已移出音乐库，但部分本地副本未能清理。请关闭占用文件的软件后清理音乐库中的 .deleted-source 临时目录。'};}
  return {deleted:true,warning:''};
}

module.exports = { deleteVersion,deleteSource };
