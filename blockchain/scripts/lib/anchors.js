// Rebuild every record's history using ONLY the contract's event logs.
// No database is consulted, so an attacker who edits a database cannot change the answer.
async function collectAnchors(registry) {
  const anchored = await registry.queryFilter(registry.filters.HashAnchored(), 0, "latest");
  const deleted = await registry.queryFilter(registry.filters.RecordMarkedDeleted(), 0, "latest");

  const records = new Map();
  for (const ev of anchored) {
    const { recordType, recordId, version, hash, timestamp } = ev.args;
    const key = `${recordType}:${recordId}`;
    if (!records.has(key)) {
      records.set(key, { recordType, recordId: Number(recordId), deleted: false, versions: [] });
    }
    records.get(key).versions.push({
      version: Number(version),
      hash,
      timestamp: Number(timestamp),
      blockNumber: ev.blockNumber,
    });
  }
  for (const ev of deleted) {
    const key = `${ev.args.recordType}:${ev.args.recordId}`;
    if (records.has(key)) records.get(key).deleted = true;
  }
  return [...records.values()];
}

module.exports = { collectAnchors };
