/**
 * Deduplicate async room creation so concurrent joins cannot each build and
 * cache a different RoomData object (#71).
 */
export function getOrCreateCached<T>(
  key: string,
  cache: Map<string, T>,
  inFlight: Map<string, Promise<T>>,
  create: () => Promise<T>
): Promise<T> {
  const cached = cache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);

  const pending = inFlight.get(key);
  if (pending) return pending;

  let creation: Promise<T>;
  creation = (async () => {
    const created = await create();
    // Another path may have populated the cache while loaders were awaiting.
    const raced = cache.get(key);
    if (raced !== undefined) return raced;
    cache.set(key, created);
    return created;
  })().finally(() => {
    if (inFlight.get(key) === creation) inFlight.delete(key);
  });

  inFlight.set(key, creation);
  return creation;
}
