export function groupRuntimeObservations(deployments) {
  const groups=new Map(),unassigned=[];
  const newest=(a,b)=>(b.freshness.observedAt || '').localeCompare(a.freshness.observedAt || '')
    || (b.deployment.deployedAt || '').localeCompare(a.deployment.deployedAt || '')
    || (a.deployment.reference || '').localeCompare(b.deployment.reference || '');
  for (const entry of deployments) {
    if (!entry.serviceInstance) { unassigned.push(entry);continue; }
    const key=`${entry.environment}:${entry.serviceInstance.key}`,group=groups.get(key) || [];
    group.push(entry);groups.set(key,group);
  }
  return { instances: [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,entries])=>{
    const [latest,...history]=[...entries].sort(newest);return { key,latest,history };
  }),unassigned: [...unassigned].sort(newest) };
}

