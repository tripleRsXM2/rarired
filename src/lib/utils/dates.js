// src/lib/utils/dates.js
// Generic date helpers: short en-AU formatter and "days until" countdown.

export function fmtDate(d) {
  return d.toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"});
}

export function daysUntil(dateStr) {
  if(!dateStr) return null;
  var parts=dateStr.split("-");
  if(parts.length!==3) return null;
  var target=new Date(parseInt(parts[0]),parseInt(parts[1])-1,parseInt(parts[2]));
  var now=new Date(); now.setHours(0,0,0,0);
  return Math.ceil((target-now)/86400000);
}
