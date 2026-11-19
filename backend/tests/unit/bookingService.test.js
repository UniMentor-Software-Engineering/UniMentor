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
