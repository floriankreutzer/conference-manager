// Explicit module-contract bridge. Manager code may consume the request-card
// identity helper only through the Employee module public API.
export { requestIdFromCard } from '../employee/index.js';
