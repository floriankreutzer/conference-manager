// The browser carries opaque references only. The server supplies identity,
// ownership, clocks and terminal state. Navigation never implies abandonment.
export function createServerRequestWorkflow({ persistence, draftStore = null,
  idFactory = () => globalThis.crypto.randomUUID() } = {}) {
  if (!persistence?.startRequestWorkflow || !persistence?.abandonRequestWorkflow
    || typeof idFactory !== 'function') throw new TypeError('REQUEST_WORKFLOW_DEPENDENCY_INVALID');
  let reference = draftStore?.loadWorkflow?.() ?? null;
  let starting = null;
  let abandoning = null;
  let finished = false;

  function ensureStarted() {
    if (finished) return Promise.reject(new Error('REQUEST_WORKFLOW_CLOSED'));
    if (reference?.workflowId) return Promise.resolve(reference.workflowId);
    if (starting) return starting;
    if (!reference) {
      reference = Object.freeze({ idempotencyKey: idFactory(), workflowId: null });
      draftStore?.saveWorkflow?.(reference);
    }
    const key = reference.idempotencyKey;
    starting = persistence.startRequestWorkflow(key).then((workflow) => {
      reference = Object.freeze({ idempotencyKey: key, workflowId: workflow.id });
      draftStore?.saveWorkflow?.(reference, key);
      return workflow.id;
    }).finally(() => { starting = null; });
    return starting;
  }

  function abandon() {
    if (finished) return Promise.resolve();
    if (abandoning) return abandoning;
    // An untouched form is not a started workflow, including restored v4 drafts.
    if (!reference) {
      finished = true;
      return Promise.resolve();
    }
    abandoning = ensureStarted().then(async (id) => {
      try {
        await persistence.abandonRequestWorkflow(id);
      } catch (error) {
        if (error?.cause?.code !== 'HTTP_409' || error?.cause?.serverCode !== 'REQUEST_STATE_CONFLICT') throw error;
        // A committed submission can lose its browser response. Reconcile that
        // exact owner-scoped key before clearing the local draft; it is never
        // rewritten as an abandoned server workflow.
        const current = await persistence.startRequestWorkflow(reference.idempotencyKey);
        if (current.id !== id || current.status !== 'submitted') throw error;
      }
    })
      .then(() => { finished = true; })
      .finally(() => { abandoning = null; });
    return abandoning;
  }

  return Object.freeze({ ensureStarted, abandon, finish: () => { finished = true; } });
}
