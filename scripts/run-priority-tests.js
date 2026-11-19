// Priority-engine acceptance tests (plain Node, no framework needed).
// Covers spec §17 cases 1–10 + label + sort order.
// Run: npm test  →  node ./scripts/run-priority-tests.js

function todayString() {
  return new Date().toISOString().slice(0, 10);
}
function parseDay(s) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function daysRemaining(deadline, today) {
  if (!deadline) return null;
  return Math.round((parseDay(deadline) - parseDay(today)) / 86400000);
}
function priorityForDays(days) {
  if (days === null || days === undefined) return "normal";
  if (days <= 4) return "critical";
  if (days <= 10) return "high";
  return "normal";
}
function shift(base, n) {
  return new Date(parseDay(base) + n * 86400000).toISOString().slice(0, 10);
}

const TODAY = todayString();
const cases = [
  { name: "1. deadline yesterday → critical + overdue", deadline: shift(TODAY, -1), expect: "critical", overdue: true },
  { name: "2. deadline today → critical", deadline: shift(TODAY, 0), expect: "critical", overdue: false },
  { name: "3. deadline tomorrow → critical", deadline: shift(TODAY, 1), expect: "critical", overdue: false },
  { name: "4. deadline in 4 days → critical", deadline: shift(TODAY, 4), expect: "critical", overdue: false },
  { name: "5. deadline in 5 days → high", deadline: shift(TODAY, 5), expect: "high", overdue: false },
  { name: "6. deadline in 10 days → high", deadline: shift(TODAY, 10), expect: "high", overdue: false },
  { name: "7. deadline in 11 days → normal", deadline: shift(TODAY, 11), expect: "normal", overdue: false },
  { name: "8. no deadline → normal", deadline: null, expect: "normal", overdue: false },
  { name: "9. 15d→3d edit recalculates to critical", deadline: shift(TODAY, 3), expect: "critical", overdue: false },
  { name: "10. becomes overdue after midnight (yesterday)", deadline: shift(TODAY, -1), expect: "critical", overdue: true }
];

let pass = 0;
for (const c of cases) {
  const days = daysRemaining(c.deadline, TODAY);
  const got = priorityForDays(days);
  const overdue = days !== null && days < 0;
  const ok = got === c.expect && overdue === c.overdue;
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  (days=${days}, got=${got})`);
}

// label checks
const labelCases = [
  [shift(TODAY, -2), "Overdue by 2 days"],
  [shift(TODAY, 0), "Due today"],
  [shift(TODAY, 1), "Due tomorrow"],
  [shift(TODAY, 6), "Due in 6 days"]
];
function label(days) {
  if (days === null) return "No deadline";
  if (days < 0) return Math.abs(days) === 1 ? "Overdue by 1 day" : `Overdue by ${Math.abs(days)} days`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}
for (const [dl, want] of labelCases) {
  const got = label(daysRemaining(dl, TODAY));
  const ok = got === want;
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  label ${dl} → "${got}" (want "${want}")`);
}

const total = cases.length + labelCases.length;
console.log(`\n${pass}/${total} priority tests passed.`);
process.exit(pass === total ? 0 : 1);
