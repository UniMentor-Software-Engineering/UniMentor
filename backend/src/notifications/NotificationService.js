// Context of the Strategy pattern (section 4.3.3, ADR 6). Use cases speak its language
// (welcome, booking confirmation, cancellation notice, reminder); the injected provider
// (SendGrid, console or a test fake) only knows send({ to, subject, text, html }).
//
// Failure policy:
//  - Confirmations and notices are sent after the COMMIT. Callers use notifyInBackground(),
//    so a failed email is logged and never undoes a valid booking or cancellation.
//  - Reminders (CU-10) are awaited by the scheduler, which marks reminder_sent only when
//    both messages were accepted; a failure leaves the appointment for the next cycle.
const templates = require('./templates');

class NotificationService {
  constructor(provider, { logger = console } = {}) {
    this.provider = provider;
    this.logger = logger;
  }

  // CU-01, step 8
  async sendWelcome(user) {
    await this.provider.send({ to: user.email, ...templates.welcome(user) });
  }

  // CU-08, step 8: both participants, each with their own message
  async sendBookingConfirmation(appointment) {
    await Promise.all([
      this.provider.send({ to: appointment.student.email, ...templates.bookingConfirmation(appointment, 'STUDENT') }),
      this.provider.send({ to: appointment.tutor.email, ...templates.bookingConfirmation(appointment, 'TUTOR') }),
    ]);
  }

  // CU-09, step 6 (both users) and CU-13 (byAdmin: the suspended user's counterpart only,
  // or both when `recipients` says so)
  async sendCancellationNotice(appointment, { byAdmin = false, recipients = ['STUDENT', 'TUTOR'] } = {}) {
    await Promise.all(recipients.map((role) => this.provider.send({
      to: role === 'STUDENT' ? appointment.student.email : appointment.tutor.email,
      ...templates.cancellationNotice(appointment, role, { byAdmin }),
    })));
  }

  // CU-10, steps 2-3
  async sendReminder(appointment) {
    await Promise.all([
      this.provider.send({ to: appointment.student.email, ...templates.reminder(appointment, 'STUDENT') }),
      this.provider.send({ to: appointment.tutor.email, ...templates.reminder(appointment, 'TUTOR') }),
    ]);
  }

  /**
   * Runs a notification without blocking the caller and logs a failure instead of throwing
   * (section 4.3.3: "asynchronous failures must be logged"). Returns the promise so tests
   * can await it; production code does not.
   * @param {string} label  what is being sent, for the log
   * @param {() => Promise<unknown>} work
   */
  notifyInBackground(label, work) {
    return Promise.resolve()
      .then(work)
      .catch((err) => {
        this.logger.error(`[notifications] ${label} failed: ${err.message}`);
      });
  }
}

module.exports = NotificationService;
