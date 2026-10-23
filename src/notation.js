// Shared engraving settings for the interactive score and the PDF renderer.
function createScoreDisplay(target,version,options={}) {
  const library=globalThis.opensheetmusicdisplay;
  if(!library)throw Error('乐谱渲染组件未加载。请重新安装依赖。');
  // OSMD 1.9.x draws both VexFlow modifiers and skyline fingering labels.
  // Keep its collision-aware labels, including during page reflow.
  library.VexFlowMeasure.prototype.createFingerings=()=>{};
  const [beats,beatType]=version.timeSignature;
  const osmd=new library.OpenSheetMusicDisplay(target,{
    autoResize:false,backend:'svg',drawTitle:false,drawComposer:false,drawPartNames:version.parts?.length>1,
    autoBeam:true,autoBeamOptions:{beam_rests:false,maintain_stem_directions:false,
      groups:[[beatType===8&&beats>3&&beats%3===0?3:1,beatType]]},
    drawFingerings:true,fingeringPosition:'aboveorbelow',fingeringInsideStafflines:false,
    drawMeasureNumbersOnlyAtSystemStart:true,newSystemFromXML:false,newPageFromXML:false,
    spacingFactorSoftmax:12,stretchLastSystemLine:false,percussionOneLineCutoff:0,
    cursorsOptions:[{type:1,color:'#4eac62',alpha:.9,follow:false}],...options
  });
  Object.assign(osmd.EngravingRules,{
    FingeringTextSize:1.25,FingeringLabelFontHeight:1.4,FingeringPaddingY:.4,
    StaffDistance:8,BetweenStaffDistance:6,MinSkyBottomDistBetweenStaves:1.8,
    MinimumDistanceBetweenSystems:8,MinSkyBottomDistBetweenSystems:5,
    VoiceSpacingMultiplierVexflow:1,MeasureLeftMargin:1.2,MeasureRightMargin:1.2
  });
  return osmd;
}
