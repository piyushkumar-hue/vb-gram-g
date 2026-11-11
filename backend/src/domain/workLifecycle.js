const WORK_STATUSES = ['Proposed', 'Approved', 'Started', 'Completed'];

function getWorkStatusTransitionError(currentStatus, nextStatus) {
  if (!WORK_STATUSES.includes(currentStatus) || !WORK_STATUSES.includes(nextStatus)) {
    return 'Work status is invalid.';
  }
  if (currentStatus === nextStatus) return null;

  const currentIndex = WORK_STATUSES.indexOf(currentStatus);
  if (WORK_STATUSES[currentIndex + 1] !== nextStatus) {
    return `Work status must move one step at a time from ${currentStatus} to ${WORK_STATUSES[currentIndex + 1] || 'no further stage'}.`;
  }
  return null;
}

module.exports = { WORK_STATUSES, getWorkStatusTransitionError };
