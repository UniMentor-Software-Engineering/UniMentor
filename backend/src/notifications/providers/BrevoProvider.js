// Adapter / ConcreteStrategy (section 4.3.3, ADR 6): the only module that knows Brevo.
// It converts our provider interface, send({ to, subject, text, html }), into a call to the
// Brevo v3 transactional email API. Added after SendGrid replaced its permanent free plan
// with a 60-day trial: Brevo's free plan allows 300 emails a day. Like SendGridProvider it
// uses the built-in fetch, so no SDK is added (NFR-02).
const { parseAddress } = require('./address');

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 10000;

class BrevoProvider {
  /**
   * @param {{ apiKey: string, from: string, fetchImpl?: typeof fetch }} options
   */
  constructor({ apiKey, from, fetchImpl = fetch }) {
    if (!apiKey) throw new Error('BrevoProvider needs an API key');
    this.apiKey = apiKey;
    this.from = parseAddress(from);
    this.fetch = fetchImpl;
    this.name = 'brevo';
  }

  async send({ to, subject, text, html }) {
    const response = await this.fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: this.from,
        to: [{ email: to }],
        subject,
        textContent: text,
        ...(html ? { htmlContent: html } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // CU-10 step 4: the message counts as sent only when Brevo accepts it (HTTP 201 Created).
    if (response.status !== 201) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Brevo rejected the message (HTTP ${response.status}) ${detail.slice(0, 300)}`);
    }
  }
}

module.exports = BrevoProvider;
