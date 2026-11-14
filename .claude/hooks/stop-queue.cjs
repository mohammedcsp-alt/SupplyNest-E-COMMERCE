// Project-scoped Stop hook for B2B-STORE (V3.3).
// Reads MASTER_TASK_QUEUE.json. If an executable task is still pending (status "pending" and every dependency "done"),
// it blocks the stop once per distinct progress state and names the next task. It allows the stop when:
//   - nothing executable remains (all actionable tasks are done or blocked),
//   - the queue is missing or unreadable (fails open, reported on stderr),
//   - no progress was made since the previous block (prevents an infinite loop),
//   - a task is marked "blocked" with a reason (genuine blocker: continue elsewhere, stop safely).
// It also refuses to accept "done" without verification evidence (the queue itself must show proof).
// It never changes permissions, settings, or files other than its own state file.
const fs = require('node:fs');
const path = require('node:path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const queuePath = path.join(projectDir, 'MASTER_TASK_QUEUE.json');
const statePath = path.join(projectDir, '.claude', 'hooks', 'stop-queue.state.json');

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function allow(note) {
  if (note) process.stderr.write(`[stop-queue] ${note}\n`);
  process.exit(0);
}

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

function loadQueue() {
  return JSON.parse(fs.readFileSync(queuePath, 'utf8'));
}

function main() {
  const input = readStdin();
  let queue;
  try {
    queue = loadQueue();
  } catch (err) {
    allow(`queue unreadable (${err.code || err.message}); allowing stop`);
    return;
  }
  const tasks = Array.isArray(queue.tasks) ? queue.tasks : [];
  const byId = new Map(tasks.map((t) => [t.id, t]));

  // Evidence rule: a task cannot count as done without evidence.
  const unproven = tasks.filter((t) => t.status === 'done' && !(t.verification_evidence && String(t.verification_evidence).trim()));
  if (unproven.length > 0) {
    block(`Task(s) marked done without verification evidence: ${unproven.map((t) => t.id).join(', ')}. Add evidence or set them back to pending before stopping.`);
    return;
  }

  const depsDone = (t) => (t.dependencies || []).every((d) => byId.get(d)?.status === 'done');
  const executable = tasks.filter((t) => t.status === 'pending' && depsDone(t));
  const blocked = tasks.filter((t) => t.status === 'blocked');
  const pending = tasks.filter((t) => t.status === 'pending');

  if (executable.length === 0) {
    allow(`no executable tasks (pending: ${pending.length}, blocked: ${blocked.length})`);
    return;
  }

  // Progress signature: if nothing changed since the last block, do not block again.
  const signature = JSON.stringify(tasks.map((t) => [t.id, t.status]));
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    state = {};
  }
  if (input.stop_hook_active && state.lastSignature === signature) {
    allow('no queue progress since the previous continuation; allowing stop to avoid a loop');
    return;
  }
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({ lastSignature: signature, updated: new Date().toISOString() }, null, 2));

  const next = executable.sort((a, b) => (a.priority || 'P9').localeCompare(b.priority || 'P9'))[0];
  block(
    `MASTER_TASK_QUEUE.json still has ${executable.length} executable pending task(s). Next: ${next.id} - ${next.title}. ` +
      `Acceptance: ${next.acceptance}. Implement it, verify it, record evidence and set its status to "done" in MASTER_TASK_QUEUE.json, then continue with the next executable task. ` +
      `If it is genuinely blocked, set status to "blocked" with a blocker_reason and continue with independent tasks.`,
  );
}

main();
