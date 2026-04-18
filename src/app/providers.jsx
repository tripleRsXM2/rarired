// src/app/providers.jsx
import { useEffect } from "react";

export default function Providers({ t, dark, children }){
  useEffect(function(){
    var el=document.createElement("style");
    el.id="cs-css";
    el.textContent=[
      "body{background:"+t.bg+";color:"+t.text+";font-family:'Space Grotesk',-apple-system,BlinkMacSystemFont,sans-serif}",
      "@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}",
      "@keyframes pop{0%{transform:scale(.97);opacity:0}100%{transform:scale(1);opacity:1}}",
      "@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}",
      "@keyframes reveal{from{clip-path:inset(100% 0 0 0)}to{clip-path:inset(0 0 0 0)}}",
      ".fade-up{animation:fadeUp .3s cubic-bezier(.32,.72,0,1) both}",
      ".pop{animation:pop .22s cubic-bezier(.34,2.27,.64,1) both}",
      ".slide-up{animation:slideUp .36s cubic-bezier(.32,.72,0,1) both}",
      ".reveal{animation:reveal .4s cubic-bezier(.32,.72,0,1) both}",
      "button{cursor:pointer;font-family:inherit;letter-spacing:0.01em}",
      "input,select,textarea{font-family:inherit;letter-spacing:0.01em}",
      "input:focus,select:focus,textarea:focus{outline:none}",
      "::-webkit-scrollbar{width:0;height:0}",
    ].join("");
    document.head.appendChild(el);
    document.body.style.background=t.bg;
    return function(){var o=document.getElementById("cs-css");if(o)o.remove();};
  },[dark]);
  return children;
}
