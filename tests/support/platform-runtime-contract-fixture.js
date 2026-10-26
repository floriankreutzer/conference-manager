export const RUNTIME_CONTRACT_NOW=Date.parse('2026-10-25T12:00:00.000Z');
export function platformRuntimeContractRecords() {
  const reference='int:'+'a'.repeat(124),identifier='v'+'a'.repeat(63);
  const component=environment=>({ environment,deploymentReference: reference,expectedVersion: identifier,
    expectedBuildId: identifier,version: identifier,buildId: identifier });
  const record=environment=>({ environment,deployment: { reference,deployedAt: '2026-10-25T11:50:00.000Z' },
    frontend: component(environment),api: component(environment),
    schema: { environment,deploymentReference: reference,expectedVersion: 100000,currentVersion: 100000 },
    dependencies: { environment,deploymentReference: reference,required: 'ready',optional: 'ready' },
    observedAt: '2026-10-25T11:59:00.000Z',evidence: { release: 'release:'+'a'.repeat(247),
      change: 'github:pr:330',rollback: 'change:rollback:330',runbook: 'docs:platform-operations#rollback' } });
  const unknown=environment=>{
    const value=record(environment);value.deployment.reference=null;
    for (const key of ['frontend','api','schema','dependencies']) value[key].deploymentReference=null;
    return value;
  };
  return [record('test'),record('production'),unknown('development'),unknown('pilot')];
}
