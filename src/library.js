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

module.exports = { deleteVersion };
