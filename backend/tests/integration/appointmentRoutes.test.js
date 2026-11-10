
const request = require('supertest');
const app = require('../../src/app');
const jwt = require('jsonwebtoken');
const config = require('../../src/config/env');
const bookingService = require('../../src/services/bookingService');
const userRepository = require('../../src/repositories/userRepository');

jest.mock('../../src/services/bookingService');
jest.mock('../../src/repositories/userRepository');

const STUDENT_ID = 'c0000000-0000-0000-0000-000000000001';
const SLOT_ID = 'e0000000-0000-0000-0000-000000000002';

// Create a signed session cookie for testing
function cookieFor(role) {
  userRepository.findAuthState.mockResolvedValue({
    id: STUDENT_ID,
    role,
    status: 'ACTIVE'
  });

  return `token=${jwt.sign(
    { sub: STUDENT_ID, role },
    config.jwtSecret,
    { expiresIn: '1h' }
  )}`;
}

describe('Appointment Routes Integration Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const bookingData = {
    slotId: SLOT_ID,
    studentInquiry: 'I need help with mathematics.'
  };

  it('should return 401 when the user is unauthenticated', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send(bookingData);

    expect(res.status).toBe(401);
    expect(bookingService.createBooking).not.toHaveBeenCalled();
  });

  it('should return 403 when a tutor tries to book', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('TUTOR'))
      .send(bookingData);

    expect(res.status).toBe(403);
    expect(bookingService.createBooking).not.toHaveBeenCalled();
  });

  it('should return 403 without the CSRF header', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Cookie', cookieFor('STUDENT'))
      .send(bookingData);

    expect(res.status).toBe(403);
    expect(bookingService.createBooking).not.toHaveBeenCalled();
  });

  it('should return 201 when a student books successfully', async () => {
    const appointment = {
      id: 'f0000000-0000-0000-0000-000000000001',
      slot_id: SLOT_ID,
      student_id: STUDENT_ID,
      status: 'CONFIRMED'
    };

    bookingService.createBooking.mockResolvedValue(appointment);

    const res = await request(app)
      .post('/api/appointments')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('STUDENT'))
      .send(bookingData);

    expect(res.status).toBe(201);
    expect(res.body.appointment).toEqual(appointment);

    expect(bookingService.createBooking).toHaveBeenCalledWith(
      STUDENT_ID,
      SLOT_ID,
      bookingData.studentInquiry
    );
  });

  it('should return 409 when the slot is unavailable', async () => {
    const AppError = require('../../src/utils/AppError');

    bookingService.createBooking.mockRejectedValue(
      new AppError(409, 'Slot is not available', 'SLOT_UNAVAILABLE')
    );

    const res = await request(app)
      .post('/api/appointments')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('STUDENT'))
      .send(bookingData);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE');
  });
});


describe('Appointment Cancellation Authorization Tests', () => {
  const APPOINTMENT_ID = 'f0000000-0000-0000-0000-000000000001';

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 when cancelling without authentication', async () => {
    const res = await request(app)
      .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
      .set('X-Requested-With', 'XMLHttpRequest');

    expect(res.status).toBe(401);
    expect(bookingService.cancelAppointment).not.toHaveBeenCalled();
  });

  it('should return 403 when the user is not a participant', async () => {
    const AppError = require('../../src/utils/AppError');

    bookingService.cancelAppointment.mockRejectedValue(
      new AppError(403, 'Not authorized to cancel this appointment', 'FORBIDDEN')
    );

    const res = await request(app)
      .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('STUDENT'));

    expect(res.status).toBe(403);
    expect(bookingService.cancelAppointment).toHaveBeenCalledWith(
      STUDENT_ID,
      APPOINTMENT_ID
    );
  });

  it('should return 409 when the appointment is already cancelled', async () => {
    const AppError = require('../../src/utils/AppError');

    bookingService.cancelAppointment.mockRejectedValue(
      new AppError(409, 'Appointment cannot be cancelled', 'INVALID_STATUS')
    );

    const res = await request(app)
      .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('STUDENT'));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS');
  });
});

