export default function FormatExplainer({t}) {
  var steps=[
    {n:"5",title:"League",sub:"Matches each"},
    {n:"4",title:"Top 4",sub:"Qualify"},
    {n:"2",title:"Semis",sub:"1v4 · 2v3"},
    {n:"1",title:"Final",sub:"Champion"},
  ];
  return (
    <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:2}}>
      {steps.map(function(s,i){
        return (
          <div key={i} style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <div style={{
              textAlign:"center", background:t.bgTertiary,
              border:"1px solid "+t.border, borderRadius:8,
              padding:"10px 14px", minWidth:68
            }}>
              <div style={{fontSize:20,fontWeight:800,color:t.accent,lineHeight:1}}>{s.n}</div>
              <div style={{fontSize:11,fontWeight:600,color:t.text,marginTop:3}}>{s.title}</div>
              <div style={{fontSize:10,color:t.textTertiary,marginTop:1}}>{s.sub}</div>
            </div>
            {i<steps.length-1&&<div style={{fontSize:11,color:t.textTertiary}}>→</div>}
          </div>
        );
      })}
    </div>
  );
}
