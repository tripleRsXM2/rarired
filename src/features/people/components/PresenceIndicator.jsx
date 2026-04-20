// src/features/people/components/PresenceIndicator.jsx
//
// Two reusable presence visual primitives:
//  • <PresenceDot/>   — overlays a small green dot on an avatar (when online)
//  • <PresenceLabel/> — renders a small text label ("Active now" / "Last seen…")
//
// Both gracefully render nothing if the profile is hidden / has no data.

import { getPresence } from "../services/presenceService.js";

export function PresenceDot({ profile, t, size, viewerIsSelf }){
  var p = getPresence(profile, viewerIsSelf);
  if(!p.dot) return null;
  var s = size || 11;
  return (
    <div style={{
      position:"absolute", bottom:1, right:1,
      width:s, height:s, borderRadius:"50%",
      background:t.green, border:"2px solid "+t.bg,
    }}/>
  );
}

export function PresenceLabel({ profile, t, viewerIsSelf, style }){
  var p = getPresence(profile, viewerIsSelf);
  if(!p.label) return null;
  return (
    <span style={Object.assign({
      fontSize:11,
      color: p.online ? t.green : t.textTertiary,
      fontWeight: p.online ? 600 : 400,
    }, style||{})}>
      {p.label}
    </span>
  );
}

// Convenience: avatar + dot wrapper. Pass children = the avatar circle.
export function PresenceAvatarWrap({ profile, t, viewerIsSelf, children, dotSize }){
  return (
    <div style={{position:"relative", flexShrink:0}}>
      {children}
      <PresenceDot profile={profile} t={t} viewerIsSelf={viewerIsSelf} size={dotSize}/>
    </div>
  );
}
