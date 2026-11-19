// P5: NotificationService (Strategy context), SendGridProvider (Adapter), templates and
// the CU-10 reminder cycle. No network: fetch and the provider are fakes.
const NotificationService = require('../../src/notifications/NotificationService');
const SendGridProvider = require('../../src/notifications/providers/SendGridProvider');
const ConsoleProvider = require('../../src/notifications/providers/ConsoleProvider');
const templates = require('../../src/notifications/templates');
const { runReminderCycle } = require('../../src/jobs/reminderScheduler');

const appointment = {
  id: 'f0000000-0000-0000-0000-000000000001',
  status: 'CONFIRMED',
  session_type: 'DEEP_DIVE',
  start_time: '2030-03-04T09:00:00.000Z',
  end_time: '2030-03-04T10:00:00.000Z',
  student_inquiry: 'Help with <script>alert(1)</script>',
  meeting_url: 'https://meet.google.com/abc-defg-hij',
  cancellation_reason: null,
  cancelled_by: null,
  student: { id: 's1', email: 'diego@myuax.com', first_name: 'Diego', last_name: 'López' },
  tutor: { id: 't1', email: 'laura@myuax.com', first_name: 'Laura', last_name: 'García' },
};

const silentLogger = { log: jest.fn(), error: jest.fn() };

afterEach(() => jest.clearAllMocks());

describe('templates', () => {
  it('shows the session in the university time zone with the meeting link', () => {
    const { subject, text, html } = templates.bookingConfirmation(appointment, 'STUDENT');
    expect(subject).toContain('Monday, 4 March 2030, 10:00–11:00 (Europe/Madrid)');
    expect(text).toContain('Tutor: Laura García');
    expect(text).toContain('Session type: Deep Dive');
    expect(text).toContain('Meeting link: https://meet.google.com/abc-defg-hij');
    expect(html).toContain('href="https://meet.google.com/abc-defg-hij"');
  });

  it('escapes user text in the HTML version (NFR-02)', () => {
    const { html, text } = templates.bookingConfirmation(appointment, 'TUTOR');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(text).toContain('<script>'); // plain text is not HTML
  });

  it('leaves out a meeting link that is not https', () => {
    const { text, html } = templates.reminder({ ...appointment, meeting_url: 'javascript:alert(1)' }, 'STUDENT');
    expect(text).not.toContain('Meeting link');
    expect(html).not.toContain('javascript:');
  });

  it('says who cancelled and shows the reason', () => {
    const cancelled = { ...appointment, cancelled_by: 't1', cancellation_reason: 'Ill' };
    expect(templates.cancellationNotice(cancelled, 'STUDENT').text).toContain('Laura García cancelled this session.');
    expect(templates.cancellationNotice(cancelled, 'STUDENT').text).toContain('Reason: Ill');
    expect(templates.cancellationNotice(cancelled, 'TUTOR').text).toContain('You cancelled this session.');
    expect(templates.cancellationNotice(cancelled, 'STUDENT', { byAdmin: true }).text)
      .toContain('cancelled by the university administration');
  });
});

describe('NotificationService', () => {
  it('sends the booking confirmation to both participants (CU-08 step 8)', async () => {
    const provider = new ConsoleProvider({ silent: true });
    await new NotificationService(provider).sendBookingConfirmation(appointment);
    expect(provider.sent.map((m) => m.to).sort()).toEqual(['diego@myuax.com', 'laura@myuax.com']);
    expect(provider.sent.every((m) => m.subject.startsWith('Session confirmed'))).toBe(true);
  });

  it('sends cancellation notices only to the given recipients (CU-13)', async () => {
    const provider = new ConsoleProvider({ silent: true });
    await new NotificationService(provider).sendCancellationNotice(appointment, { byAdmin: true, recipients: ['STUDENT'] });
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0].to).toBe('diego@myuax.com');
  });

  it('notifyInBackground logs a failure instead of throwing', async () => {
    const service = new NotificationService({ send: jest.fn() }, { logger: silentLogger });
    await expect(service.notifyInBackground('test', async () => { throw new Error('boom'); })).resolves.toBeUndefined();
    expect(silentLogger.error).toHaveBeenCalledWith(expect.stringContaining('test failed: boom'));
  });
});

describe('SendGridProvider (Adapter)', () => {
  function provider(status, body = '') {
    const fetchImpl = jest.fn().mockResolvedValue({ status, text: async () => body });
    return { fetchImpl, sg: new SendGridProvider({ apiKey: 'SG.test', from: 'UniMentor <no-reply@myuax.com>', fetchImpl }) };
  }

  it('maps our message to the SendGrid v3 request', async () => {
    const { fetchImpl, sg } = provider(202);
    await sg.send({ to: 'a@myuax.com', subject: 'Hi', text: 'Plain', html: '<p>Hi</p>' });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(options.headers.Authorization).toBe('Bearer SG.test');
    expect(JSON.parse(options.body)).toEqual({
      personalizations: [{ to: [{ email: 'a@myuax.com' }] }],
      from: { name: 'UniMentor', email: 'no-reply@myuax.com' },
      subject: 'Hi',
      content: [{ type: 'text/plain', value: 'Plain' }, { type: 'text/html', value: '<p>Hi</p>' }],
    });
  });

  it('fails unless SendGrid answers 202 (CU-10 step 4)', async () => {
    const { sg } = provider(401, '{"errors":[{"message":"bad key"}]}');
    await expect(sg.send({ to: 'a@myuax.com', subject: 'x', text: 'x' })).rejects.toThrow('HTTP 401');
  });

  it('needs an API key', () => {
    expect(() => new SendGridProvider({ apiKey: '', from: 'x@y.z' })).toThrow();
  });
});

describe('runReminderCycle (CU-10)', () => {
  function fakeRepository(pending) {
    return {
      completeFinishedAppointments: jest.fn().mockResolvedValue(2),
      findPendingReminders: jest.fn().mockResolvedValue(pending),
      markReminderSent: jest.fn().mockResolvedValue(true),
    };
  }

  it('marks reminder_sent only after both messages were accepted', async () => {
    const repository = fakeRepository([appointment]);
    const provider = new ConsoleProvider({ silent: true });
    const result = await runReminderCycle({ repository, notifier: new NotificationService(provider), logger: silentLogger });

    expect(provider.sent).toHaveLength(2);
    expect(repository.markReminderSent).toHaveBeenCalledWith(appointment.id);
    expect(result).toEqual({ completed: 2, sent: 1, failed: 0 });
  });

  it('A1: a provider failure is logged and the appointment stays queued', async () => {
    const second = { ...appointment, id: 'f0000000-0000-0000-0000-000000000002' };
    const repository = fakeRepository([appointment, second]);
    const send = jest.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue();
    const result = await runReminderCycle({ repository, notifier: new NotificationService({ send }), logger: silentLogger });

    expect(repository.markReminderSent).toHaveBeenCalledTimes(1);
    expect(repository.markReminderSent).toHaveBeenCalledWith(second.id);
    expect(result).toMatchObject({ sent: 1, failed: 1 });
    expect(silentLogger.error).toHaveBeenCalledWith(expect.stringContaining('will retry next cycle'));
  });
});
