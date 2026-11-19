// Unit tests for the P4 additions to bookingService: session type (CU-08 step 2),
// cancellation reason (CU-09 step 3) and the dashboard / calendar listings.
const bookingService = require('../../src/services/bookingService');
const appointmentRepository = require('../../src/repositories/appointmentRepository');

jest.mock('../../src/repositories/appointmentRepository');

const STUDENT_ID = 'c0000000-0000-0000-0000-000000000001';
const TUTOR_ID = 'b0000000-0000-0000-0000-000000000001';
const SLOT_ID = 'e0000000-0000-0000-0000-000000000002';
const APPOINTMENT_ID = 'f0000000-0000-0000-0000-000000000001';

afterEach(() => jest.clearAllMocks());

describe('createBooking (CU-08)', () => {
  beforeEach(() => {
    appointmentRepository.findSlotById.mockResolvedValue({ id: SLOT_ID, status: 'AVAILABLE' });
    appointmentRepository.createBooking.mockResolvedValue({ id: APPOINTMENT_ID });
  });

  it('defaults the session type to STANDARD', async () => {
    await bookingService.createBooking(STUDENT_ID, SLOT_ID, 'Help');
    expect(appointmentRepository.createBooking)
      .toHaveBeenCalledWith(SLOT_ID, STUDENT_ID, 'Help', 'STANDARD');
  });

  it.each(['QUICK_CHECK', 'STANDARD', 'DEEP_DIVE'])('accepts the session type %s', async (type) => {
    await bookingService.createBooking(STUDENT_ID, SLOT_ID, null, type);
    expect(appointmentRepository.createBooking)
      .toHaveBeenCalledWith(SLOT_ID, STUDENT_ID, null, type);
  });

  it('rejects an unknown session type', async () => {
    await expect(bookingService.createBooking(STUDENT_ID, SLOT_ID, null, 'MARATHON'))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_SESSION_TYPE' });
    expect(appointmentRepository.createBooking).not.toHaveBeenCalled();
  });

  it('stores an empty inquiry as null', async () => {
    await bookingService.createBooking(STUDENT_ID, SLOT_ID, '   ');
    expect(appointmentRepository.createBooking)
      .toHaveBeenCalledWith(SLOT_ID, STUDENT_ID, null, 'STANDARD');
  });

  it('uses the CU-08 A1 message when the slot is already booked', async () => {
    appointmentRepository.findSlotById.mockResolvedValue({ id: SLOT_ID, status: 'BOOKED' });
    await expect(bookingService.createBooking(STUDENT_ID, SLOT_ID))
      .rejects.toMatchObject({
        statusCode: 409,
        code: 'SLOT_UNAVAILABLE',
        message: 'This time slot has just been reserved by another student.',
      });
  });
});

describe('cancelAppointment (CU-09)', () => {
  beforeEach(() => {
    appointmentRepository.cancelAppointment.mockResolvedValue({ id: APPOINTMENT_ID });
  });

  it('passes a trimmed reason to the repository', async () => {
    await bookingService.cancelAppointment(STUDENT_ID, APPOINTMENT_ID, '  Exam moved  ');
    expect(appointmentRepository.cancelAppointment)
      .toHaveBeenCalledWith(APPOINTMENT_ID, STUDENT_ID, 'Exam moved');
  });

  it('stores a missing or blank reason as null', async () => {
    await bookingService.cancelAppointment(STUDENT_ID, APPOINTMENT_ID);
    await bookingService.cancelAppointment(STUDENT_ID, APPOINTMENT_ID, ' ');
    expect(appointmentRepository.cancelAppointment).toHaveBeenNthCalledWith(1, APPOINTMENT_ID, STUDENT_ID, null);
    expect(appointmentRepository.cancelAppointment).toHaveBeenNthCalledWith(2, APPOINTMENT_ID, STUDENT_ID, null);
  });

  it('rejects a reason longer than 500 characters or not a string', async () => {
    await expect(bookingService.cancelAppointment(STUDENT_ID, APPOINTMENT_ID, 'x'.repeat(501)))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_REASON' });
    await expect(bookingService.cancelAppointment(STUDENT_ID, APPOINTMENT_ID, { a: 1 }))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_REASON' });
    expect(appointmentRepository.cancelAppointment).not.toHaveBeenCalled();
  });
});

describe('listMyAppointments', () => {
  it('lists upcoming appointments by default', async () => {
    appointmentRepository.findAppointmentsForUser.mockResolvedValue([]);
    await bookingService.listMyAppointments(STUDENT_ID);
    expect(appointmentRepository.findAppointmentsForUser).toHaveBeenCalledWith(STUDENT_ID, 'upcoming');
  });

  it('rejects an unknown scope', async () => {
    await expect(bookingService.listMyAppointments(STUDENT_ID, 'all'))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_SCOPE' });
  });
});

describe('listMySlots', () => {
  it('normalizes the window to ISO strings', async () => {
    appointmentRepository.findSlotsByTutorInRange.mockResolvedValue([]);
    await bookingService.listMySlots(TUTOR_ID, '2030-01-07T00:00:00Z', '2030-01-14T00:00:00Z');
    expect(appointmentRepository.findSlotsByTutorInRange).toHaveBeenCalledWith(
      TUTOR_ID, '2030-01-07T00:00:00.000Z', '2030-01-14T00:00:00.000Z'
    );
  });

  it.each([
    [undefined, undefined],
    ['nope', '2030-01-14T00:00:00Z'],
    ['2030-01-14T00:00:00Z', '2030-01-07T00:00:00Z'],
    ['2030-01-01T00:00:00Z', '2030-03-01T00:00:00Z'],
  ])('rejects the window %s - %s', async (from, to) => {
    await expect(bookingService.listMySlots(TUTOR_ID, from, to))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_INTERVAL' });
  });
});

describe('P5 additions', () => {
  const notifications = require('../../src/notifications');

  it('listMyAppointments without scope completes finished sessions and returns both lists (CU-11)', async () => {
    appointmentRepository.completeFinishedAppointments.mockResolvedValue(0);
    appointmentRepository.findAppointmentsForUser
      .mockResolvedValueOnce([{ id: 'u' }])
      .mockResolvedValueOnce([{ id: 'h' }]);
    const result = await bookingService.listMyAppointments(STUDENT_ID);
    expect(appointmentRepository.completeFinishedAppointments).toHaveBeenCalled();
    expect(result).toEqual({ upcoming: [{ id: 'u' }], history: [{ id: 'h' }] });
  });

  it('sends the booking confirmation after the booking is stored (CU-08 step 8)', async () => {
    appointmentRepository.findSlotById.mockResolvedValue({ id: SLOT_ID, status: 'AVAILABLE' });
    appointmentRepository.createBooking.mockResolvedValue({ id: APPOINTMENT_ID });
    appointmentRepository.findAppointmentDetails.mockResolvedValue([{ id: APPOINTMENT_ID }]);
    const spy = jest.spyOn(notifications, 'sendBookingConfirmation').mockResolvedValue();

    await bookingService.createBooking(STUDENT_ID, SLOT_ID);
    await new Promise((resolve) => setImmediate(resolve));

    expect(appointmentRepository.findAppointmentDetails).toHaveBeenCalledWith([APPOINTMENT_ID]);
    expect(spy).toHaveBeenCalledWith({ id: APPOINTMENT_ID });
    spy.mockRestore();
  });

  it('a failed confirmation email does not fail the booking', async () => {
    appointmentRepository.findSlotById.mockResolvedValue({ id: SLOT_ID, status: 'AVAILABLE' });
    appointmentRepository.createBooking.mockResolvedValue({ id: APPOINTMENT_ID });
    appointmentRepository.findAppointmentDetails.mockResolvedValue([{ id: APPOINTMENT_ID }]);
    const spy = jest.spyOn(notifications, 'sendBookingConfirmation').mockRejectedValue(new Error('down'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(bookingService.createBooking(STUDENT_ID, SLOT_ID)).resolves.toEqual({ id: APPOINTMENT_ID });
    await new Promise((resolve) => setImmediate(resolve));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('booking confirmation failed'));
    spy.mockRestore();
    log.mockRestore();
  });

  it.each([0, 6, 3.5, '5', null])('rejects the rating %p (CU-12)', async (rating) => {
    await expect(bookingService.submitReview(STUDENT_ID, APPOINTMENT_ID, rating))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_RATING' });
    expect(appointmentRepository.submitStudentReview).not.toHaveBeenCalled();
  });

  it('passes a trimmed review and stores empty feedback as null', async () => {
    appointmentRepository.submitStudentReview.mockResolvedValue({});
    await bookingService.submitReview(STUDENT_ID, APPOINTMENT_ID, 5, '  ');
    expect(appointmentRepository.submitStudentReview).toHaveBeenCalledWith(APPOINTMENT_ID, STUDENT_ID, 5, null);
  });

  it('rejects notes that are not text or too long', async () => {
    await expect(bookingService.saveTutorNotes(TUTOR_ID, APPOINTMENT_ID, 42))
      .rejects.toMatchObject({ code: 'INVALID_NOTES' });
    await expect(bookingService.saveTutorNotes(TUTOR_ID, APPOINTMENT_ID, 'x'.repeat(2001)))
      .rejects.toMatchObject({ code: 'INVALID_NOTES' });
  });
});
