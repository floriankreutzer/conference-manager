import { createApiClient } from '../../core/api-client.js';
import { createPlatformAdminApplication } from '../index.js';
import {
  createPlatformOperatorSessionApi,
  createPlatformSessionBoundary,
  PLATFORM_ADMIN_STEP_UP_PATH,
} from './operator-session.js';
import { createPlatformPasskeyLogin } from './passkey-login.js';
import { createPlatformPasskeyLoginView } from './passkey-login-view.js';
import { createPlatformPasskeyManagement } from './passkey-management.js';
import { createPlatformPasskeyOperationsClient, loadPlatformPasskeyConfiguration } from './passkey-operations-client.js';
import { createPlatformMicrosoftOperationsClient,loadPlatformMicrosoftConfiguration } from './microsoft-operations-client.js';
import { confirmPlatformMicrosoftOperation } from './microsoft-operation-confirmation.js';
import { createPlatformOperationPresentation } from './operation-presentation.js';
import { featureFlags } from '../../platform/feature-flags.js';
import { createPlatformCustomerInvitationApi } from '../customer-invitation-api.js';
import { createPlatformInvitationPresentation } from '../customer-invitations-presentation.js';
import { createPlatformSyntheticWorkspaceClient } from './synthetic-workspace/client.js';
import { createPlatformSyntheticWorkspacePresentation } from './synthetic-workspace/presentation.js';
import { createPlatformOwnerCustomerClient } from './owner-customer/client.js';
import { createPlatformOwnerCustomerPresentation } from './owner-customer/presentation.js';
import { announce,button,el } from '../../core/ui.js';
import { t } from '../../core/i18n.js';
import { createPlatformAdminApi } from '../platform-api.js';
import { createProtectedPlatformInsights } from './insights-api.js';
import { mountAuthenticationPage } from '../../shared/authentication-page.js';

async function bootstrapProductionPlatformAdmin() {
  let csrfToken = null;const presentationFlags=featureFlags.forProtectedDocument(globalThis.document);
  let application=null,operationPresentation=null,protectedClient=null,keyManagement=null;
  let customerInvitations=null,syntheticWorkspace=null,ownerCustomer=null;
  const boundary=createPlatformSessionBoundary({ onExpired() {
    csrfToken=null;
    delete document.documentElement.dataset.authenticationReady;
    protectedClient?.stop();keyManagement?.stop();syntheticWorkspace?.stop();ownerCustomer?.stop();
    customerInvitations?.clear();operationPresentation?.clear();application?.invalidateSession();
    const title=el('h2'),description=el('p'),retry=button('',{ className: 'primary' });
    const content=el('section',{ className: 'card platform-admin-session-gate',attrs: { role: 'alert' } },[title,description,retry]);
    const translate=()=>{
      title.textContent=t('platformAdmin.session.expiredTitle');description.textContent=t('platformAdmin.session.expiredText');
      retry.textContent=t('platformAdmin.session.signIn');
    };
    translate();retry.addEventListener('click',()=>globalThis.location.reload());
    const entry=mountAuthenticationPage({ content,surface: 'platform',onLanguageChange: translate });
    entry.element.querySelector('main').focus();
    globalThis.addEventListener('pagehide',()=>entry.dispose(),{ once: true });
  } });
  globalThis.addEventListener('pagehide',()=>{ boundary.stop();application?.stop(); },{ once: true });
  try {
    const apiClient = createApiClient({
      baseUrl: '/api/v1/platform/',fetchImpl: boundary.fetch,
      csrfTokenProvider: () => csrfToken,
    });
    const sessionApi = createPlatformOperatorSessionApi({ apiClient });
    const session = await sessionApi.loadSession();
    if (!session) {
      let loginView;
      const login = createPlatformPasskeyLogin({ onChange: state => loginView?.update(state) });
      loginView = createPlatformPasskeyLoginView({ controller: login });
      document.getElementById('skipLink').textContent = t('a11y.skip');
      const entry = mountAuthenticationPage({ content: loginView.render(), surface: 'platform', onLanguageChange: () => loginView.update() });
      globalThis.addEventListener('pagehide', () => { login.stop(); loginView.stop(); entry.dispose(); }, { once: true });
      await login.load();
      return;
    }
    boundary.activate();
    csrfToken = session.csrfToken;
    document.documentElement.dataset.authenticationReady = 'true';
    const configuration = await loadPlatformPasskeyConfiguration(apiClient);
    const microsoftConfiguration=configuration===null ? await loadPlatformMicrosoftConfiguration(apiClient) : null;
    if (configuration?.mode === 'passkey_setup') throw new TypeError('PLATFORM_SETUP_SESSION_REJECTED');
    async function refreshSession() {
      const refreshed = await sessionApi.loadSession();
      if (!refreshed) { boundary.expire();return false; }
      csrfToken = refreshed.csrfToken; return true;
    }
    operationPresentation=createPlatformOperationPresentation();
    globalThis.addEventListener('pagehide',()=>operationPresentation.clear(),{ once: true });
    protectedClient = configuration?.mode === 'application_passkey' ? createPlatformPasskeyOperationsClient({
      fetchImpl: boundary.fetch,onSessionRefreshRequired: boundary.expire,
      csrfTokenProvider: () => csrfToken, onPrompt: () => announce(t('platformAdmin.passkey.busy')), refreshSession,
    }) : microsoftConfiguration ? createPlatformMicrosoftOperationsClient({ fetchImpl: boundary.fetch,onSessionRefreshRequired: boundary.expire,csrfTokenProvider: ()=>csrfToken,refreshSession,
      describeOperation: operationPresentation.describe,
      confirmation: confirmPlatformMicrosoftOperation }) : null;
    keyManagement = configuration?.mode==='application_passkey' ? createPlatformPasskeyManagement({ apiClient, refreshSession }) : null;
    if (keyManagement) globalThis.addEventListener('pagehide', () => keyManagement.stop(), { once: true });
    if (protectedClient) globalThis.addEventListener('pagehide', () => protectedClient.stop(), { once: true });
    customerInvitations=presentationFlags.isEnabled('platform.customer-invitations')
      ? createPlatformInvitationPresentation({ api: createPlatformCustomerInvitationApi({ apiClient: protectedClient ?? apiClient }) }) : null;
    syntheticWorkspace=protectedClient && ['dev','int'].includes((configuration ?? microsoftConfiguration)?.environment)
      && session.operator.permissions.includes('platform:lifecycle:manage') && presentationFlags.isEnabled('platform.synthetic-workspace')
      ? createPlatformSyntheticWorkspacePresentation({ onTenant: tenantId=>application.openWorkspaceTenant(tenantId),apiFactory: ()=>createPlatformSyntheticWorkspaceClient({
        apiClient,runExclusive: protectedClient.runExclusive,refreshSession,csrfTokenProvider: ()=>csrfToken,
        assuranceMode: microsoftConfiguration ? 'microsoft_mfa' : 'application_passkey',
        microsoftConfirmation: microsoftConfiguration ? protectedClient.confirmOperation : null,
        describeOperation: operationPresentation.describe,onTenantsLoaded: operationPresentation.rememberTenants,
      }) }) : null;
    if (syntheticWorkspace) globalThis.addEventListener('pagehide',()=>syntheticWorkspace.stop(),{ once: true });
    ownerCustomer=protectedClient && microsoftConfiguration && presentationFlags.isEnabled('platform.owner-customer-access')
      && ['platform_security_admin','platform_tenant_operator','platform_security_auditor','platform_support_reader']
        .every(role=>session.operator.roles.includes(role))
      ? createPlatformOwnerCustomerPresentation({ apiFactory: ()=>createPlatformOwnerCustomerClient({
        apiClient,runExclusive: protectedClient.runExclusive,refreshSession,csrfTokenProvider: ()=>csrfToken,
        microsoftConfirmation: protectedClient.confirmOperation,
        describeOperation: operationPresentation.describe,onTenantsLoaded: operationPresentation.rememberTenants,
      }) }) : null;
    if (ownerCustomer) globalThis.addEventListener('pagehide',()=>ownerCustomer.stop(),{ once: true });
    const insights=session.operator.permissions.includes('platform:runtime:read')
      ? createProtectedPlatformInsights({ apiClient,accessMode: configuration ? 'application_passkey' : 'microsoft_mfa' }) : null;
    application = createPlatformAdminApplication({
      runtime: 'production',
      sessionState: 'authenticated',
      operator: session.operator,
      dataSource: createPlatformAdminApi({ apiClient: protectedClient ?? apiClient,onTenantsLoaded: operationPresentation.rememberTenants }),
      providerUsage: session.operator.roles.includes('platform_security_admin') ? insights?.providerUsage ?? null : null,
      productDelivery: insights?.productDelivery ?? null,
      operationProofAvailable: protectedClient !== null,customerInvitationPresentation: customerInvitations,
      renderSecurityControls: keyManagement || syntheticWorkspace || ownerCustomer ? ()=>el('div',{},[
        ...(keyManagement ? [keyManagement.renderControl()] : []),
        ...(syntheticWorkspace ? [syntheticWorkspace.renderControl()] : []),
        ...(ownerCustomer ? [ownerCustomer.renderControl()] : []),
      ]) : null,
      onSignOut: () => sessionApi.signOut(),
      onStepUp: protectedClient ? null : () => globalThis.location.assign(PLATFORM_ADMIN_STEP_UP_PATH),
    });
    await application.start();
    if (boundary.expired) return;
    // An explicit return intent owns automatic presentation. Otherwise resume
    // only the first pending workspace; both controls remain available manually.
    if (globalThis.location.search==='?auth=owner_intent') await ownerCustomer?.resume();
    else if (globalThis.location.search==='?auth=synthetic_intent') await syntheticWorkspace?.resume();
    else if (!await syntheticWorkspace?.resume()) await ownerCustomer?.resume();
  } catch {
    if (boundary.expired) return;
    const retry = button(t('auth.production.retry'), { className: 'primary' });
    retry.addEventListener('click', () => globalThis.location.reload());
    const content = el('section', { className: 'card platform-admin-session-gate', attrs: { role: 'alert' } }, [
      el('h2', { text: t('platformAdmin.session.unavailableTitle') }),
      el('p', { text: t('platformAdmin.session.unavailableText') }), retry,
    ]);
    const entry = mountAuthenticationPage({ content, surface: 'platform' });
    globalThis.addEventListener('pagehide', () => entry.dispose(), { once: true });
  }
}

await bootstrapProductionPlatformAdmin();
