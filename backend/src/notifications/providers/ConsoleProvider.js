// ConcreteStrategy for development and tests (section 4.3.3): it "sends" a message by
// writing it to the log. Selected whenever SENDGRID_API_KEY is not set, so a developer's
// machine can never send real email. It keeps the last messages in memory, which lets
// tests check what would have been sent.
class ConsoleProvider {
  constructor({ silent = false, keep = 50 } = {}) {
    this.silent = silent;
    this.keep = keep;
    this.sent = [];
    this.name = 'console';
  }

  async send(message) {
    this.sent.push(message);
    if (this.sent.length > this.keep) this.sent.shift();
    if (!this.silent) {
      console.log(`[email] to=${message.to} subject="${message.subject}"\n${message.text}\n`);
    }
  }
}

module.exports = ConsoleProvider;
