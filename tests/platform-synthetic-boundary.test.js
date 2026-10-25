import assert from 'node:assert/strict';
import test from 'node:test';
import { platformAdminBoundaryViolations } from '../scripts/platform-admin-boundary-policy.mjs';

test('only composition may consume shared flag metadata and only the fixed customer-workspace client consumes the native form contract',()=>{
  const values={ 'src/platform/feature-flags.js': 'export const featureFlags=true;',
    'src/shared/authentication-form-navigation.js': 'export const navigation=true;' };
  assert.deepEqual(platformAdminBoundaryViolations({ ...values,
    'src/platform-admin/production/bootstrap.js': "import '../../platform/feature-flags.js';",
    'src/platform-admin/production/customer-workspace-client.js': "import '../../shared/authentication-form-navigation.js';",
  }),[]);
  for (const dependency of ['src/shared/private-customer-ui.js','src/platform/customer-authentication/bootstrap.js']) {
    const path=dependency.replace('src/','../../');
    const result=platformAdminBoundaryViolations({ ...values,[dependency]: 'export const privateAuthority=true;',
      'src/platform-admin/production/bootstrap.js': `import '${path}';` });
    assert.equal(result.some(line=>line.includes('must not depend on customer capability')),true);
  }
  for (const file of Object.keys(values)) {
    const result=platformAdminBoundaryViolations({ ...values,[file]: "import '../customer-authority.js';\nfetch('/unsafe');" });
    assert.equal(result.some(line=>line.includes('must remain import-free')),true);
  }
});
