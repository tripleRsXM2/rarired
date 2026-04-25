import { PILOT_VENUE } from "../constants.js";
import { inputStyle } from "../../../lib/theme.js";

export default function ScheduleModal({
  t, scheduleModal, setScheduleModal,
  scheduleDraft, setScheduleDraft, scheduleMatch,
}) {
  var iStyle=inputStyle(t);
  if(!scheduleModal) return null;
  return (
    <div
      onClick={function(){setScheduleModal(null);}}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}}>
      <div
        onClick={function(e){e.stopPropagation();}}
        className="slide-up"
        style={{background:t.modalBg,borderTop:"1px solid "+t.border,borderRadius:"16px 16px 0 0",padding:"24px 22px 48px",width:"100%",maxWidth:540}}>
        <div style={{width:32,height:3,borderRadius:2,background:t.border,margin:"0 auto 20px"}}/>
        <h2 style={{fontSize:18,fontWeight:700,color:t.text,marginBottom:4,letterSpacing:"-0.3px"}}>Schedule Match</h2>
        <p style={{fontSize:12,color:t.textSecondary,marginBottom:20}}>{PILOT_VENUE.name} · Players book own court</p>
        {[{l:"Date",k:"date",type:"date"},{l:"Time",k:"time",type:"text",ph:"e.g. 6:00 PM"},{l:"Court",k:"court",type:"text",ph:"e.g. Court 3"}].map(function(f){
          return (
            <div key={f.k} style={{marginBottom:12}}>
              <label style={{fontSize:10,fontWeight:700,color:t.textSecondary,display:"block",marginBottom:5,letterSpacing:"0.12em",textTransform:"uppercase"}}>{f.l}</label>
              <input type={f.type} value={scheduleDraft[f.k]} placeholder={f.ph||""}
                onChange={function(e){var v=e.target.value;setScheduleDraft(function(d){return Object.assign({},d,{[f.k]:v});});}}
                style={iStyle}/>
            </div>
          );
        })}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,padding:"9px 0"}}>
          <a href={PILOT_VENUE.url} target="_blank" rel="noopener noreferrer"
            style={{fontSize:12,color:t.accent,fontWeight:600,textDecoration:"none"}}>
            Book at {PILOT_VENUE.name} →
          </a>
          <span style={{fontSize:12,color:t.green}}>New balls provided</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button
            onClick={function(){setScheduleModal(null);}}
            style={{flex:1,padding:"12px",borderRadius:8,border:"1px solid "+t.border,background:"transparent",color:t.text,fontSize:13,fontWeight:500}}>
            Cancel
          </button>
          <button
            onClick={function(){scheduleMatch(scheduleModal.tournId,scheduleModal.roundIdx,scheduleModal.matchId,scheduleDraft.date,scheduleDraft.time,scheduleDraft.court);setScheduleModal(null);}}
            style={{flex:2,padding:"12px",borderRadius:8,border:"none",background:t.accent,color:"#fff",fontSize:13,fontWeight:600}}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
