function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('en');
}

function workIdentity(work) {
  return JSON.stringify([
    normalize(work.name),
    normalize(work.category?._id || work.category),
    normalize(work.subCategory),
    normalize(work.location?.state),
    normalize(work.location?.district),
    normalize(work.location?.block),
    normalize(work.location?.gramPanchayat),
  ]);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex, workIdentity };
