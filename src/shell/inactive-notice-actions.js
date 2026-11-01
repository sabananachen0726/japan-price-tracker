// Delete only the notifications present when the action was requested. New
// notices and product availability/settings remain untouched across retries.
export async function deleteInactiveNotices({entries, runTransaction, db, catalogRef, plannerRef, deleteField}) {
  return runTransaction(db, async tx => {
    const catalogSnap = await tx.get(catalogRef), plannerSnap = await tx.get(plannerRef);
    const catalog = catalogSnap.exists() ? catalogSnap.data() : {}, planner = plannerSnap.exists() ? plannerSnap.data() : {};
    const items = {}, removed = new Set();
    let count = 0;
    for (const entry of entries) {
      const notice = catalog.items?.[entry.code]?.inactiveNotices?.[entry.noticeKey];
      if (!notice || notice.at !== entry.at || notice.uid !== entry.uid || (notice.id || entry.noticeKey) !== entry.id) continue;
      ((items[entry.code] ||= {}).inactiveNotices ||= {})[entry.noticeKey] = deleteField(); removed.add(entry.id); count++;
    }
    if (!count) return 0;
    const noticeReads = {};
    for (const [uid, reads] of Object.entries(planner.noticeReads || {})) {
      for (const id of removed) if (Object.hasOwn(reads, id)) (noticeReads[uid] ||= {})[id] = deleteField();
    }
    tx.set(catalogRef, {items}, {merge:true});
    if (Object.keys(noticeReads).length) tx.set(plannerRef, {noticeReads}, {merge:true});
    return count;
  });
}
