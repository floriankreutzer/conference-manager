import { installCateringDeliveryFixture } from './catering-delivery-fixture.js';

const id = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export async function installCateringVersionFixture(page, { language = 'de', failure = null, unsent = false } = {}) {
  const fixture = await installCateringDeliveryFixture(page, { language, extraPosition: true });
  const current = fixture.current;
  current.state = { revision: 6, status: 'confirmed', updatedAt: new Date().toISOString() };
  let basis = { orderVersion: 1, status: 'confirmed', requestVersion: current.order.requestVersion,
    assignmentRevision: current.order.assignmentRevision, providerCost: structuredClone(current.quote.cost) };
  if (unsent) { basis = null; current.quote = null; current.decision = null; current.state.status = 'pending_quote'; current.state.revision = 1; }
  let conference = { version: current.order.requestVersion, status: 'Confirmed' };
  const history = new Map([[1, structuredClone(current)]]); const proposals = []; const writes = [];
  const facts = []; let jobs = []; let readFailure = null; let writeFailure = failure; let stale = false;
  let held = false; const waiting = new Set();
  const withdrawals = new Map(); let withdrawalFailure = null; let withdrawalReadFailure = null; let withdrawalStale = false;
  let withdrawalsHeld = false; const waitingWithdrawals = new Set(); let withdrawalBlocked = false;
  const snapshot = () => { history.set(current.order.orderVersion, structuredClone(current)); };
  const orderState = () => ({ orderVersion: current.order.orderVersion, revision: current.state.revision, status: current.state.status });
  await page.route('**/api/v1/tenant/catering/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname.endsWith('/withdrawal')) {
      const version = Number(url.searchParams.get('orderVersion') || current.order.orderVersion);
      const selected = version === current.order.orderVersion ? current : history.get(version);
      const selectedState = { orderVersion: version, revision: selected.state.revision, status: selected.state.status };
      if (request.method() === 'GET') {
        if (withdrawalsHeld) await new Promise((resolve) => { waitingWithdrawals.add(resolve); });
        if (withdrawalReadFailure) return json({ code: 'SYNTHETIC_WITHDRAWAL_READ_FAILURE' }, withdrawalReadFailure);
        return json({ schemaVersion: 1, orderId: current.order.orderId,
          orderState: { ...selectedState, revision: selectedState.revision + Number(withdrawalStale) },
          eligible: version === current.order.orderVersion && !withdrawalBlocked
            && ['pending_quote','pending_manager_review','released','queued'].includes(selected.state.status) && !facts.length,
          effective: basis === null ? null : { orderVersion: basis.orderVersion, status: basis.status },
          withdrawal: withdrawals.get(version) ?? null });
      }
      const command = request.postDataJSON(); writes.push(command);
      if (withdrawalFailure) return json({ code: 'CATERING_WITHDRAWAL_REVISION_CONFLICT' }, withdrawalFailure);
      if (command.attestNotTransmitted !== true || command.expectedOrderVersion !== current.order.orderVersion
        || command.expectedStateRevision !== current.state.revision || facts.length || withdrawalBlocked) {
        throw new Error('Wrong withdrawal attestation or source CAS');
      }
      const fact = { orderId: current.order.orderId, orderVersion: current.order.orderVersion, previousStatus: current.state.status,
        justification: command.justification, attestNotTransmitted: true, recordedAt: new Date().toISOString() };
      withdrawals.set(current.order.orderVersion, fact);
      current.state = { ...current.state, revision: current.state.revision + 1, status: 'withdrawn' };
      jobs = jobs.map((job) => ({ ...job, revision: job.revision + 1, status: 'superseded', availableAt: null })); snapshot();
      return json({ schemaVersion: 1, replayed: false, withdrawal: fact, orderState: orderState() });
    }
    if (url.pathname.endsWith('/versions')) {
      if (request.method() === 'GET') {
        if (held) await new Promise((resolve) => { waiting.add(resolve); });
        if (readFailure) return json({ code: 'SYNTHETIC_UNAVAILABLE' }, readFailure);
        const after = Number(url.searchParams.get('afterOrderVersion') || 1);
        const selected = proposals.filter((proposal) => proposal.orderVersion > after).slice(0, 20);
        const allowed = basis === null ? current.state.status === 'withdrawn' && conference.status === 'Confirmed' ? ['change'] : []
          : basis.status === 'confirmed' && ['confirmed','rejected','withdrawn'].includes(current.state.status)
            ? conference.status === 'Cancelled' ? ['cancel'] : conference.version > basis.requestVersion ? ['change','cancel'] : ['cancel','exception'] : [];
        return json({ schemaVersion: 1, orderId: current.order.orderId, requestId: current.order.requestId,
          orderState: { ...orderState(), revision: current.state.revision + Number(stale) }, currentRequest: conference,
          currentAssignmentRevision: current.order.assignmentRevision, basis, allowedOperations: allowed, proposals: selected,
          nextAfterOrderVersion: proposals.length > after - 1 + selected.length ? selected.at(-1).orderVersion : null });
      }
      const command = request.postDataJSON(); writes.push(command);
      if (writeFailure) return json({ code: 'CATERING_VERSION_REVISION_CONFLICT' }, writeFailure);
      if (command.expectedOrderVersion !== current.order.orderVersion || command.expectedStateRevision !== current.state.revision) {
        throw new Error('Wrong version proposal CAS');
      }
      snapshot(); current.order = { ...current.order, orderVersion: current.order.orderVersion + 1 };
      if (command.operation === 'change') current.order.requestVersion = conference.version;
      current.order.positions = current.order.positions.map((position, index) => ({ ...position,
        positionId: id(10000 + current.order.orderVersion * 101 + index) }));
      current.operation = command.operation; current.quote = null; current.decision = null;
      if (basis === null) { current.schemaVersion = 2; current.deliveryOperation = 'initial'; }
      current.state = { revision: 1, status: 'pending_quote', updatedAt: new Date().toISOString() };
      const proposal = { orderId: current.order.orderId, orderVersion: current.order.orderVersion,
        priorOrderVersion: command.expectedOrderVersion, basisOrderVersion: basis?.orderVersion ?? command.expectedOrderVersion,
        operation: command.operation,
        requestId: current.order.requestId, requestEvidenceVersion: conference.version, requestEvidenceStatus: conference.status,
        sourceRequestVersion: current.order.requestVersion, assignmentRevision: command.expectedAssignmentRevision,
        configurationRevision: current.configurationRevision, justification: command.justification, proposedAt: current.state.updatedAt };
      proposals.push(proposal); facts.length = 0; jobs = []; snapshot();
      return json({ schemaVersion: 1, replayed: false, proposal, orderState: orderState() });
    }
    if (url.pathname.endsWith('/quote') || url.pathname.endsWith('/decision')) {
      const command = request.postDataJSON(); writes.push(command);
      if (command.expectedOrderVersion !== current.order.orderVersion || command.expectedStateRevision !== current.state.revision) {
        throw new Error('Wrong version review CAS');
      }
      if (url.pathname.endsWith('/quote')) {
        current.quote = { revision: (current.quote?.revision ?? 0) + 1, cost: command.cost, expiresAt: command.expiresAt, expired: false };
        current.decision = null; current.state.status = 'pending_manager_review';
      } else {
        current.decision = { sequence: 1, decision: command.decision, quoteRevision: current.quote.revision, cost: current.quote.cost };
        current.state.status = command.decision === 'approved' ? 'released' : 'rejected';
      }
      current.state.revision++; snapshot(); return json(current);
    }
    if (url.pathname.includes('/delivery-jobs')) {
      if (request.method() === 'GET') return json({ schemaVersion: 1, jobs, nextAfterJobId: null });
      const command = request.postDataJSON(); writes.push(command);
      if (command.expectedOrderVersion !== current.order.orderVersion) throw new Error('Wrong delivery version');
      const now = new Date().toISOString();
      jobs = [{ jobId: id(9000 + current.order.orderVersion), integrationId: current.order.integrationId,
        orderId: current.order.orderId, orderVersion: current.order.orderVersion, operation: current.operation,
        revision: 1, status: 'queued', dispatchAttempts: 0, automaticReconciliationAttempts: 0,
        quoteRevision: current.quote.revision, decisionSequence: current.decision.sequence,
        createdAt: now, updatedAt: now, availableAt: now }];
      current.state.status = 'queued'; current.state.revision++; snapshot();
      return json({ schemaVersion: 1, replayed: false, job: jobs[0] });
    }
    if (url.pathname.endsWith('/manual-delivery')) {
      if (request.method() === 'GET') return json({ schemaVersion: 1, orderId: current.order.orderId,
        orderVersion: current.order.orderVersion, orderState: orderState(), manualSequence: facts.length,
        events: facts, nextAfterSequence: null, effective: basis === null ? null : { orderVersion: basis.orderVersion, status: basis.status } });
      const command = request.postDataJSON(); writes.push(command);
      const complete = command.receipt?.positions.every((position) => position.outcome === 'confirmed');
      const status = complete ? current.operation === 'cancel' ? 'cancelled' : 'confirmed' : 'transmitted';
      const now = new Date().toISOString();
      const fact = { orderId: current.order.orderId, orderVersion: current.order.orderVersion, sequence: facts.length + 1,
        kind: command.kind, channel: command.channel, reference: command.reference, occurredAt: command.occurredAt, recordedAt: now,
        quoteRevision: current.quote.revision, decisionSequence: current.decision.sequence, operation: current.operation,
        status, receipt: command.receipt };
      facts.push(fact); current.state = { revision: current.state.revision + 1, status, updatedAt: now };
      if (complete) basis = { orderVersion: current.order.orderVersion, status, requestVersion: current.order.requestVersion,
        assignmentRevision: current.order.assignmentRevision, providerCost: current.quote.cost };
      snapshot(); return json({ schemaVersion: 1, replayed: false, fact, orderState: orderState() });
    }
    if (url.pathname.endsWith(current.order.orderId) && url.searchParams.has('orderVersion')) {
      return json(history.get(Number(url.searchParams.get('orderVersion'))));
    }
    return route.fallback();
  });
  await page.getByRole('button', { name: language === 'de'
    ? 'Aktuellen Stand laden und Entwurf verwerfen' : 'Load current state and discard draft', exact: true }).click();
  return { current, writes, proposals, history,
    failWithdrawalReads(status) { withdrawalReadFailure = status; }, failWithdrawals(status) { withdrawalFailure = status; },
    staleWithdrawal(value) { withdrawalStale = value; }, blockWithdrawal(value) { withdrawalBlocked = value; },
    holdWithdrawals() { withdrawalsHeld = true; }, releaseWithdrawals() {
      withdrawalsHeld = false; for (const resolve of waitingWithdrawals) resolve(); waitingWithdrawals.clear();
    },
    failReads(status) { readFailure = status; }, failWrites(status) { writeFailure = status; }, setStale(value) { stale = value; },
    changeConference(status = 'Confirmed') { conference = { version: conference.version + 1, status }; },
    holdReads() { held = true; }, releaseReads() { held = false; for (const resolve of waiting) resolve(); waiting.clear(); } };
}
