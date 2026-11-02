// Publishing must never relabel an old source collection as fresh.
export function assertSourceHealth(status, { now = Date.now(), maxAgeHours = 3 } = {}) {
  const rows = ['daily', 'weekly', 'monthly'].map(period => {
    const collection = status.periods?.[period], raw = collection?.latest;
    const time = typeof raw === 'string' ? Date.parse(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z') : NaN;
    if (!Number.isInteger(collection?.count) || collection.count < 1 || !Number.isFinite(time)) throw new Error(`${period}: missing or invalid source collection`);
    const age = now - time;
    if (age < -300000) throw new Error(`${period}: source timestamp is in the future`);
    if (age > maxAgeHours * 3600000) throw new Error(`${period}: source collection exceeds ${maxAgeHours} hours; keep the last published release and inspect refresh logs`);
    return { period, count: collection.count, collectedAt: raw, ageMinutes: Math.max(0, Math.round(age / 60000)) };
  });
  return rows;
}
