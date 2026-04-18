export default function Pill({label, color, bg}) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center",
      fontSize:10, fontWeight:700, color:color,
      background:bg||color+"18", border:"1px solid "+color+"30",
      borderRadius:4, padding:"2px 7px", whiteSpace:"nowrap",
      letterSpacing:"0.04em", textTransform:"uppercase"
    }}>
      {label}
    </span>
  );
}
