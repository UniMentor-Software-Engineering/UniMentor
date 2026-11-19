
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
      bookingData.studentInquiry,
      undefined
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
      APPOINTMENT_ID,
      undefined
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


describe('Availability Publication Tests (CU-04)', () => {
  const startTime = '2030-01-07T15:00:00.000Z';
  const endTime = '2030-01-07T18:00:00.000Z';

  const availabilityData = {
    startTime,
    endTime
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 when the tutor is not authenticated', async () => {
    const res = await request(app)
      .post('/api/appointments/availability')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send(availabilityData);

    expect(res.status).toBe(401);
    expect(bookingService.publishAvailability).not.toHaveBeenCalled();
  });

  it('should return 403 when a student tries to publish slots', async () => {
    const res = await request(app)
      .post('/api/appointments/availability')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('STUDENT'))
      .send(availabilityData);

    expect(res.status).toBe(403);
    expect(bookingService.publishAvailability).not.toHaveBeenCalled();
  });

  it('should return 201 when a tutor publishes slots successfully', async () => {
    const result = {
      published: [
        { id: 'slot-1', status: 'AVAILABLE' },
        { id: 'slot-2', status: 'AVAILABLE' },
        { id: 'slot-3', status: 'AVAILABLE' }
      ],
      skipped: []
    };

    bookingService.publishAvailability.mockResolvedValue(result);

    const res = await request(app)
      .post('/api/appointments/availability')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('TUTOR'))
      .send(availabilityData);

    expect(res.status).toBe(201);
    expect(res.body.published).toHaveLength(3);
    expect(res.body.skipped).toHaveLength(0);

    expect(bookingService.publishAvailability).toHaveBeenCalledWith(
      STUDENT_ID,
      startTime,
      endTime
    );
  });

  it('should report overlapping slots without rejecting valid ones', async () => {
    bookingService.publishAvailability.mockResolvedValue({
      published: [{ id: 'slot-1', status: 'AVAILABLE' }],
      skipped: [{
        startTime,
        endTime,
        reason: 'OVERLAPPING_SLOT'
      }]
    });

    const res = await request(app)
      .post('/api/appointments/availability')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('TUTOR'))
      .send(availabilityData);

    expect(res.status).toBe(201);
    expect(res.body.published).toHaveLength(1);
    expect(res.body.skipped).toHaveLength(1);
    expect(res.body.skipped[0].reason).toBe('OVERLAPPING_SLOT');
  });
});


describe('Availability Slot Blocking Tests (CU-05)', () => {
  const SLOT_ID = 'e0000000-0000-0000-0000-000000000003';

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 when the tutor is unauthenticated', async () => {
    const res = await request(app)
      .patch(`/api/appointments/availability/${SLOT_ID}/block`)
      .set('X-Requested-With', 'XMLHttpRequest');

    expect(res.status).toBe(401);
    expect(bookingService.blockAvailabilitySlot).not.toHaveBeenCalled();
  });

  it('should return 403 when a student tries to block a slot', async () => {
    const res = await request(app)
      .patch(`/api/appointments/availability/${SLOT_ID}/block`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('STUDENT'));

    expect(res.status).toBe(403);
    expect(bookingService.blockAvailabilitySlot).not.toHaveBeenCalled();
  });

  it('should return 200 when a tutor blocks an available slot', async () => {
    const blockedSlot = {
      id: SLOT_ID,
      status: 'UNAVAILABLE'
    };

    bookingService.blockAvailabilitySlot.mockResolvedValue(blockedSlot);

    const res = await request(app)
      .patch(`/api/appointments/availability/${SLOT_ID}/block`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('TUTOR'));

    expect(res.status).toBe(200);
    expect(res.body.slot).toEqual(blockedSlot);
    expect(bookingService.blockAvailabilitySlot).toHaveBeenCalledWith(
      STUDENT_ID,
      SLOT_ID
    );
  });

  it('should return 409 when the slot has already been booked', async () => {
    const AppError = require('../../src/utils/AppError');

    bookingService.blockAvailabilitySlot.mockRejectedValue(
      new AppError(
        409,
        'This slot has just been booked. Please cancel it from your appointments dashboard.',
        'SLOT_ALREADY_BOOKED'
      )
    );

    const res = await request(app)
      .patch(`/api/appointments/availability/${SLOT_ID}/block`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('TUTOR'));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_ALREADY_BOOKED');
  });
});


describe('Dashboard and calendar listings', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('GET /appointments/me requires a session', async () => {
    const res = await request(app).get('/api/appointments/me');

    expect(res.status).toBe(401);
    expect(bookingService.listMyAppointments).not.toHaveBeenCalled();
  });

  it('GET /appointments/me is not available to admins', async () => {
    const res = await request(app)
      .get('/api/appointments/me')
      .set('Cookie', cookieFor('ADMIN'));

    expect(res.status).toBe(403);
  });

  it('GET /appointments/me returns the user appointments for the scope', async () => {
    bookingService.listMyAppointments.mockResolvedValue([{ id: 'a1' }]);

    const res = await request(app)
      .get('/api/appointments/me?scope=past')
      .set('Cookie', cookieFor('STUDENT'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'a1' }]);
    expect(bookingService.listMyAppointments).toHaveBeenCalledWith(STUDENT_ID, 'past');
  });

  it('GET /appointments/availability/me is only for tutors', async () => {
    const res = await request(app)
      .get('/api/appointments/availability/me?from=2030-01-01&to=2030-01-08')
      .set('Cookie', cookieFor('STUDENT'));

    expect(res.status).toBe(403);
    expect(bookingService.listMySlots).not.toHaveBeenCalled();
  });

  it('GET /appointments/availability/me returns the tutor slots', async () => {
    bookingService.listMySlots.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/appointments/availability/me?from=2030-01-01&to=2030-01-08')
      .set('Cookie', cookieFor('TUTOR'));

    expect(res.status).toBe(200);
    expect(bookingService.listMySlots)
      .toHaveBeenCalledWith(STUDENT_ID, '2030-01-01', '2030-01-08');
  });

  it('PATCH cancel forwards the optional reason and warns on a late cancellation', async () => {
    bookingService.cancelAppointment.mockResolvedValue({
      id: 'a1',
      status: 'CANCELLED',
      is_late_cancellation: true
    });

    const res = await request(app)
      .patch('/api/appointments/f0000000-0000-0000-0000-000000000001/cancel')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('STUDENT'))
      .send({ reason: 'Exam moved' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/late cancellation/);
    expect(bookingService.cancelAppointment).toHaveBeenCalledWith(
      STUDENT_ID,
      'f0000000-0000-0000-0000-000000000001',
      'Exam moved'
    );
  });
});

describe('CU-12 routes', () => {
  const APPOINTMENT = 'f0000000-0000-0000-0000-000000000001';

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('PUT notes is only for tutors', async () => {
    const res = await request(app)
      .put(`/api/appointments/${APPOINTMENT}/notes`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('STUDENT'))
      .send({ notes: 'x' });

    expect(res.status).toBe(403);
    expect(bookingService.saveTutorNotes).not.toHaveBeenCalled();
  });

  it('PUT notes saves the tutor notes', async () => {
    bookingService.saveTutorNotes.mockResolvedValue({ id: APPOINTMENT, tutor_notes: 'Topics' });

    const res = await request(app)
      .put(`/api/appointments/${APPOINTMENT}/notes`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('TUTOR'))
      .send({ notes: 'Topics' });

    expect(res.status).toBe(200);
    expect(bookingService.saveTutorNotes).toHaveBeenCalledWith(STUDENT_ID, APPOINTMENT, 'Topics');
  });

  it('POST review is only for students', async () => {
    const res = await request(app)
      .post(`/api/appointments/${APPOINTMENT}/review`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('TUTOR'))
      .send({ rating: 5 });

    expect(res.status).toBe(403);
  });

  it('POST review returns the CU-12 A1 error before the session ends', async () => {
    const AppError = require('../../src/utils/AppError');
    bookingService.submitReview.mockRejectedValue(
      new AppError(409, 'Ratings and notes are accessible only after session completion.', 'SESSION_NOT_COMPLETED')
    );

    const res = await request(app)
      .post(`/api/appointments/${APPOINTMENT}/review`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookieFor('STUDENT'))
      .send({ rating: 5, feedback: 'Great' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Ratings and notes are accessible only after session completion.');
    expect(bookingService.submitReview).toHaveBeenCalledWith(STUDENT_ID, APPOINTMENT, 5, 'Great');
  });

  it('PUT notes without the CSRF header is rejected', async () => {
    const res = await request(app)
      .put(`/api/appointments/${APPOINTMENT}/notes`)
      .set('Cookie', cookieFor('TUTOR'))
      .send({ notes: 'x' });

    expect(res.status).toBe(403);
  });
});
