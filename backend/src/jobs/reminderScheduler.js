// CU-10: background scheduler (sequence diagram C of 03-architecture).
// Every 10 minutes:
//  1. CU-11 business rule: confirmed sessions that have ended become COMPLETED.
//  2. CU-10 step 1: confirmed sessions starting within 24 hours with reminder_sent = FALSE.
//  3. Steps 2-3: send the reminder to the student and the tutor.
//  4. Step 4: set reminder_sent = TRUE only after the provider accepted both messages.
//     A1: on a failure the error is logged and the appointment stays queued for the next cycle.
// A 10-minute period keeps every reminder inside the ±15 minute tolerance of goal G5.
//
// It runs inside the API process with setInterval (no extra dependency or worker).
// Limitation: Render's free instance sleeps when idle, and no cycle runs while it sleeps.
// The dashboard completes finished sessions on its own, but reminders need the process awake.
const appointmentRepository = require('../repositories/appointmentRepository');
const notifications = require('../notifications');

const INTERVAL_MS = 10 * 60 * 1000;

/**
 * Runs one cycle. Dependencies can be injected for tests.
 * @returns {Promise<{ completed: number, sent: number, failed: number }>}
 */
async function runReminderCycle({
  repository = appointmentRepository,
  notifier = notifications,
  logger = console,
} = {}) {
  const completed = await repository.completeFinishedAppointments();
  const pending = await repository.findPendingReminders();

  let sent = 0;
  let failed = 0;
  // One by one: a slow or failing message must not stop the others.
  for (const appointment of pending) {
    try {
      await notifier.sendReminder(appointment);
      await repository.markReminderSent(appointment.id);
      sent += 1;
    } catch (err) {
      failed += 1;
      logger.error(`[reminders] appointment ${appointment.id}: ${err.message} (will retry next cycle)`);
    }
  }

  if (completed || sent || failed) {
    logger.log(`[reminders] completed=${completed} sent=${sent} failed=${failed}`);
  }
  return { completed, sent, failed };
}

/**
 * Starts the periodic job. Returns a stop() function (used on shutdown).
 */
function startReminderScheduler({ intervalMs = INTERVAL_MS, logger = console } = {}) {
  let running = false;

  async function tick() {
    // Never run two cycles at once (a cycle can be slower than the period if the provider hangs).
    if (running) return;
    running = true;
    try {
      await runReminderCycle({ logger });
    } catch (err) {
      logger.error(`[reminders] cycle failed: ${err.message}`);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, intervalMs);
  timer.unref();
  // First cycle shortly after start-up, so a restart does not delay pending reminders.
  const first = setTimeout(tick, 5000);
  first.unref();
  logger.log(`[reminders] scheduler started (every ${Math.round(intervalMs / 60000)} min)`);

  return function stop() {
    clearInterval(timer);
    clearTimeout(first);
  };
}

module.exports = { runReminderCycle, startReminderScheduler, INTERVAL_MS };
