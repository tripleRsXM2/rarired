import { avColor, initials } from "../../lib/utils/avatar.js";

export default function PlayerAvatar({name, avatar, size=36}) {
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%", flexShrink:0,
      background:avColor(name), display:"flex", alignItems:"center",
      justifyContent:"center", fontSize:Math.round(size*0.33), fontWeight:700, color:"#fff",
      letterSpacing:"-0.5px"
    }}>
      {avatar||initials(name)}
    </div>
  );
}
