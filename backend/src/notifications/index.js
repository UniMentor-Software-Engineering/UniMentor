// Chooses the provider (the Strategy) once, from the configuration, when the app starts
// (section 4.3.3). Every module imports this single NotificationService instance.
//  - BREVO_API_KEY set     -> BrevoProvider (real email, the one used in production)
//  - SENDGRID_API_KEY set  -> SendGridProvider (real email, ADR 6's original choice)
//  - otherwise             -> ConsoleProvider (logs the message; silent under Jest)
const config = require('../config/env');
const NotificationService = require('./NotificationService');
const BrevoProvider = require('./providers/BrevoProvider');
const SendGridProvider = require('./providers/SendGridProvider');
const ConsoleProvider = require('./providers/ConsoleProvider');

function createProvider() {
  if (config.email.brevoApiKey) {
    return new BrevoProvider({ apiKey: config.email.brevoApiKey, from: config.email.from });
  }
  if (config.email.sendgridApiKey) {
    return new SendGridProvider({ apiKey: config.email.sendgridApiKey, from: config.email.from });
  }
  if (config.isProduction) {
    console.warn('[notifications] Neither BREVO_API_KEY nor SENDGRID_API_KEY is set: emails are only written to the log.');
  }
  return new ConsoleProvider({ silent: config.nodeEnv === 'test' });
}

module.exports = new NotificationService(createProvider());
