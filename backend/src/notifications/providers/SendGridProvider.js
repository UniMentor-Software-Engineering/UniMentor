// Adapter / ConcreteStrategy (section 4.3.3, ADR 6): the only module that knows SendGrid.
// It converts our provider interface, send({ to, subject, text, html }), into a call to the
// SendGrid v3 Mail Send API. It uses the built-in fetch instead of the @sendgrid/mail SDK:
// the request is a single POST, and one dependency less keeps `npm audit` (NFR-02) quiet.
const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';
const TIMEOUT_MS = 10000;

// "UniMentor <no-reply@x.edu>" -> { name, email }
function parseAddress(address) {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(address);
  return match ? { name: match[1] || undefined, email: match[2] } : { email: address.trim() };
}

class SendGridProvider {
  /**
   * @param {{ apiKey: string, from: string, fetchImpl?: typeof fetch }} options
   */
  constructor({ apiKey, from, fetchImpl = fetch }) {
    if (!apiKey) throw new Error('SendGridProvider needs an API key');
    this.apiKey = apiKey;
    this.from = parseAddress(from);
    this.fetch = fetchImpl;
    this.name = 'sendgrid';
  }

  async send({ to, subject, text, html }) {
    const response = await this.fetch(SENDGRID_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: this.from,
        subject,
        content: [
          { type: 'text/plain', value: text },
          ...(html ? [{ type: 'text/html', value: html }] : []),
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // CU-10 step 4: the message counts as sent only when SendGrid accepts it (HTTP 202).
    if (response.status !== 202) {
      const detail = await response.text().catch(() => '');
      throw new Error(`SendGrid rejected the message (HTTP ${response.status}) ${detail.slice(0, 300)}`);
    }
  }
}

module.exports = SendGridProvider;
