async function renderPDFScore({musicxml,version,showFingerings=true,zoom=100}) {
  const instrument={piano:'钢琴',guitar:'吉他',bass:'贝斯',drums:'鼓',ensemble:'合奏'}[version.instrument];
  const difficulty={beginner:'新手版',intermediate:'进阶版',full:'完整版'}[version.difficulty];
  document.title=`${version.title} · ${difficulty} · ${instrument}`;
  const documentXML=new DOMParser().parseFromString(musicxml,'application/xml');
  if(documentXML.querySelector('parsererror'))throw Error('乐谱文件损坏，无法导出 PDF。');
  for(const title of documentXML.querySelectorAll('work-title,movement-title'))title.textContent=document.title;
  const target=document.getElementById('notation');
  const osmd=createScoreDisplay(target,version,{drawTitle:true,drawSubtitle:false,drawFingerings:showFingerings});
  // Match A4's printable area, so a grand-staff system stays on one page.
  osmd.setCustomPageFormat(190,277);
  osmd.Zoom=zoom/100;
  await osmd.load(new XMLSerializer().serializeToString(documentXML));
  await document.fonts.ready;
  osmd.render();
  const pages=[...target.querySelectorAll('svg')];
  if(!pages.length)throw Error('乐谱未生成可打印页面。');
  const output=document.getElementById('pages');
  for(const svg of pages) {
    const page=document.createElement('section');page.className='pdf-page';
    if(!svg.hasAttribute('viewBox'))svg.setAttribute('viewBox',`0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`);
    svg.setAttribute('preserveAspectRatio','xMidYMin meet');
    page.append(svg);output.append(page);
  }
  target.remove();
  await document.fonts.ready;
  return {pages:pages.length,measures:osmd.GraphicSheet.MeasureList.length};
}
