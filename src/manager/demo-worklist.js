const PENDING = new Set(['Submitted', 'In Review']);
const STUDIO_ID = 'contoso-paris-room-2';

export function deriveDemoManagerTasks({ requests, locations, catalogue }) {
  const studio = locations?.rooms?.find(({ id }) => id === STUDIO_ID);
  if (!studio || !Array.isArray(requests) || !catalogue) return Object.freeze([]);
  const tasks = requests.filter(({ status }) => PENDING.has(status)).map((request) => ({
    id: `request:${request.id}`,
    key: 'demoManager.task.review',
    title: request.details?.title || request.id,
    target: 'BOOKINGS',
  }));
  if (!studio.description) tasks.push({
    id: 'room:description', key: 'demoManager.task.description', target: 'ADMIN',
  });
  if (!catalogue.roomPrices?.some(({ roomId }) => roomId === STUDIO_ID)) tasks.push({
    id: 'room:price', key: 'demoManager.task.price', target: 'ADMIN',
  });
  if (!studio.mediaAssetIds?.length) tasks.push({
    id: 'room:image', key: 'demoManager.task.image', target: 'ADMIN',
  });
  if (!catalogue.cateringPackages?.length) tasks.push({
    id: 'catalogue:catering', key: 'demoManager.task.catering', target: 'ADMIN',
  });
  return Object.freeze(tasks.map((task) => Object.freeze(task)));
}
