// src/components/ui/PlayerAvatar.jsx
// Round avatar — renders the uploaded photo (avatar_url) if present, else
// falls back to the deterministic colour + initials block.
//
// Back-compat: existing call sites pass `name` + `avatar` (initials string).
// New call sites can pass the whole profile or include `avatarUrl`.

import { avColor, initials, avatarUrl } from "../../lib/utils/avatar.js";

export default function PlayerAvatar({ name, avatar, avatarUrl: urlProp, profile, size=36 }) {
  var url = urlProp || avatarUrl(profile) || null;
  var label = avatar || initials(name);

  if(url){
    return (
      <img
        src={url}
        alt={name||"avatar"}
        width={size} height={size}
        style={{
          width:size, height:size, borderRadius:"50%", flexShrink:0,
          objectFit:"cover", display:"block", background:"#eee",
        }}
      />
    );
  }

  return (
    <div style={{
      width:size, height:size, borderRadius:"50%", flexShrink:0,
      background:avColor(name), display:"flex", alignItems:"center",
      justifyContent:"center", fontSize:Math.round(size*0.33), fontWeight:700, color:"#fff",
      letterSpacing:"-0.5px"
    }}>
      {label}
    </div>
  );
}
