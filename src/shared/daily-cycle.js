// Brisbane is UTC+10 all year. The daily cycle starts at 08:30 local time.
export function dailyBoundary(now=Date.now()) {
 const shifted=new Date(now+10*3600000);
 let start=Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate(),8,30)-10*3600000;
 if(now<start)start-=86400000;return start;
}
export function dueDaily(at,now=Date.now()){return !Number.isFinite(Number(at))||Number(at)<dailyBoundary(now)}
