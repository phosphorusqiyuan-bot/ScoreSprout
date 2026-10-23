const fs=require('node:fs');
const path=require('node:path');

async function exportScorePDF(BrowserWindow,payload,filePath) {
  const win=new BrowserWindow({show:false,width:820,height:1160,
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  let timer;
  try {
    const operation=(async()=>{
      await win.loadFile(path.join(__dirname,'pdf.html'));
      const report=await win.webContents.executeJavaScript(`renderPDFScore(${JSON.stringify(payload)})`);
      const buffer=await win.webContents.printToPDF({pageSize:'A4',preferCSSPageSize:true,printBackground:true,
        displayHeaderFooter:true,headerTemplate:'<div></div>',
        footerTemplate:'<div style="font-size:8px;width:100%;text-align:center;color:#666"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        margins:{top:10/25.4,bottom:10/25.4,left:10/25.4,right:10/25.4}});
      if(buffer.subarray(0,5).toString()!=='%PDF-')throw Error('PDF 生成失败。');
      await fs.promises.writeFile(filePath,buffer);
      return report;
    })();
    return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('PDF 导出超时，请减小谱面大小后重试。')),60000);})]);
  } finally {clearTimeout(timer);if(!win.isDestroyed())win.destroy();}
}
module.exports={exportScorePDF};
