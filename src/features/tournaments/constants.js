// src/features/tournaments/constants.js
// Tournament-domain constants: pilot venue, fee/prize tables, bot player roster.

export const PILOT_VENUE = {
  id:"sydney-boys", name:"Sydney Boys High School", suburb:"Moore Park",
  address:"556 Cleveland St, Moore Park",
  url:"https://www.tennisvenues.com.au/booking/sydney-boys-high-school",
  courts:["Court 1","Court 2","Court 3","Court 4"], hours:"6am–11pm"
};

export const ENTRY_FEES = { 8:39, 16:45, 32:39 };

export const PRIZES = {
  8:{item:"Babolat Pure Drive Lite",value:159},
  16:{item:"Wilson Clash 100 v2",value:419},
  32:{item:"Head Speed Pro 2024",value:499}
};

export const BOT_PLAYERS = [
  {id:"bot-1",  name:"Alex Chen",     avatar:"AC", skill:"Intermediate"},
  {id:"bot-2",  name:"Jordan Smith",  avatar:"JS", skill:"Intermediate"},
  {id:"bot-3",  name:"Sam Williams",  avatar:"SW", skill:"Intermediate"},
  {id:"bot-4",  name:"Riley Brown",   avatar:"RB", skill:"Intermediate"},
  {id:"bot-5",  name:"Morgan Davis",  avatar:"MD", skill:"Intermediate"},
  {id:"bot-6",  name:"Taylor Wilson", avatar:"TW", skill:"Intermediate"},
  {id:"bot-7",  name:"Casey Moore",   avatar:"CM", skill:"Intermediate"},
  {id:"bot-8",  name:"Jamie Taylor",  avatar:"JT", skill:"Intermediate"},
  {id:"bot-9",  name:"Drew Anderson", avatar:"DA", skill:"Intermediate"},
  {id:"bot-10", name:"Quinn Thomas",  avatar:"QT", skill:"Intermediate"},
  {id:"bot-11", name:"Blake Jackson", avatar:"BJ", skill:"Intermediate"},
  {id:"bot-12", name:"Reese White",   avatar:"RW", skill:"Intermediate"},
  {id:"bot-13", name:"Avery Harris",  avatar:"AH", skill:"Intermediate"},
  {id:"bot-14", name:"Parker Martin", avatar:"PM", skill:"Intermediate"},
  {id:"bot-15", name:"Skyler Lee",    avatar:"SL", skill:"Intermediate"},
];
