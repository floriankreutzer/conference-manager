// Hosted runs use the real approved HTTPS origins (including same-origin consent).
// Isolated runs use the repository's fixed TLS edge; no caller-chosen destination.
export function scenarioOrigins(env = process.env) {
  const supplied = [env.SHARED_DEMO_CUSTOMER_ORIGIN, env.SHARED_DEMO_PLATFORM_ORIGIN];
  if (supplied.every((value) => value === undefined)) {
    return Object.freeze({ customer: 'https://customer.demo.test:4443', platform: 'https://platform.demo.test:4443', hosted: false });
  }
  if (supplied[0] !== 'https://conference-manager-demo.onrender.com'
    || supplied[1] !== 'https://conference-manager-ops-demo.onrender.com') {
    throw new TypeError('SAAS37_SCENARIO_ORIGINS_INVALID');
  }
  return Object.freeze({ customer: supplied[0], platform: supplied[1], hosted: true });
}
