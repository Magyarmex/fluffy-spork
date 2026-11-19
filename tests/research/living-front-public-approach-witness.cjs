'use strict';
// Research-only #1029. A falsifiable public-motion witness, not production AI.
// Each observer may infer an approach only from repeated *visible* hull positions.
// It never reads another tank's AI assignment, velocity, upgrades or target id.
function createPublicApproachWitness(options={}) {
  const perObserver=new WeakMap();
  const cap=options.cap??13,range=options.range??700;
  const minDt=options.minDt??0.12,maxDt=options.maxDt??0.45;
  const maxSpeed=options.maxSpeed??400,required=options.required??2;
  if(!(cap>=1&&cap<=64&&range>0&&minDt>0&&maxDt>minDt&&maxSpeed>0&&required>=1))
    throw Error('invalid public witness limits');
  function sample(observer,contacts,goal,now,visible){
    if(!observer||!goal||!Number.isFinite(goal.x)||!Number.isFinite(goal.y)||
       !Number.isFinite(now)||typeof visible!=='function')return 0;
    let records=perObserver.get(observer);
    if(!records){records=new Map();perObserver.set(observer,records);}
    for(const [id,r] of records)
      if(now<r.time||now-r.time>maxDt*2)records.delete(id);
    let approaching=0;
    for(const q of contacts||[]){
      if(!q||q===observer||q.id==null||q.alive===false||!(q.hp>0)||
         q.spawnShieldT>0||!Number.isFinite(q.x)||!Number.isFinite(q.y)||
         !visible(observer,q)){
        if(q&&q.id!=null)records.delete(String(q.id));
        continue;
      }
      const id=String(q.id),dist=Math.hypot(q.x-goal.x,q.y-goal.y);
      if(dist>range){records.delete(id);continue;}
      const prior=records.get(id);
      let streak=0;
      if(prior&&prior.ref===q){
        const dt=now-prior.time,move=Math.hypot(q.x-prior.x,q.y-prior.y),
          progress=prior.dist-dist;
        if(dt>=minDt&&dt<=maxDt&&move>=4&&move<=maxSpeed*dt+10&&
           progress>=Math.max(10,move*.45))
          streak=prior.streak+1;
      }
      // A confirmed witness needs repeated consecutive visible progress.
      records.delete(id);
      records.set(id,{ref:q,x:q.x,y:q.y,dist,time:now,streak});
      if(streak>=required)approaching++;
      while(records.size>cap)records.delete(records.keys().next().value);
    }
    return Math.min(approaching,4);
  }
  return {sample};
}
module.exports={createPublicApproachWitness};
