// src/components/ui/PlayerAvatar.jsx
// Round avatar — renders the uploaded photo (avatar_url) if present, else
// falls back to the deterministic colour + initials block.
//
// Back-compat: existing call sites pass `name` + `avatar` (initials string).
// New call sites can pass the whole profile or include `avatarUrl`.

import { avColor, initials, avatarUrl } from "../../lib/utils/avatar.js";

export default function PlayerAvatar({ name, avatar, avatarUrl: urlProp, profile, size=36, blurred }) {
  var url = urlProp || avatarUrl(profile) || null;
  var label = avatar || initials(name);

  // Blurred mode: anonymous map preview — viewers without an account see
  // shapes + counts ("4 players in this zone") but can't identify
  // individuals until they sign up. CSS-only obfuscation, but no
  // identifying URLs leak (we still render the photo, just behind a
  // blur filter). Pair this with a name-mask in the parent label render.
  var blurStyle = blurred ? {
    filter: "blur(8px)",
    pointerEvents: "none",
  } : {};

  if(url){
    return (
      <img
        src={url}
        alt={blurred ? "Sign in to see" : (name||"avatar")}
        width={size} height={size}
        style={Object.assign({
          width:size, height:size, borderRadius:"50%", flexShrink:0,
          objectFit:"cover", display:"block", background:"#eee",
        }, blurStyle)}
      />
    );
  }

  return (
    <div style={Object.assign({
      width:size, height:size, borderRadius:"50%", flexShrink:0,
      background:avColor(name), display:"flex", alignItems:"center",
      justifyContent:"center", fontSize:Math.round(size*0.33), fontWeight:700, color:"#fff",
      letterSpacing:"-0.5px"
    }, blurStyle)}>
      {blurred ? "?" : label}
    </div>
  );
}
