-- Limpiar tablas en orden inverso
TRUNCATE appointments, availability_slots, tutor_subjects, tutor_profiles, subjects, audit_logs, users CASCADE;

-- Contraseña para todos: Password123!
-- Hash: $2b$10$wT0k8/uNq3wY0Q56zC6jgej2z6Q8l3xTqR9I4A1GgG7O2hQy0Syea

-- 1. Usuarios (Admin, Tutores, Estudiantes)
INSERT INTO users (id, email, password_hash, first_name, last_name, role, status) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin@unimentor.edu', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQmG6FeVEGz8paC35BCe6', 'Admin', 'Root', 'ADMIN', 'ACTIVE'),
('b0000000-0000-0000-0000-000000000001', 'laura.garcia@unimentor.edu', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQmG6FeVEGz8paC35BCe6', 'Laura', 'García', 'TUTOR', 'ACTIVE'),
('b0000000-0000-0000-0000-000000000002', 'carlos.martin@unimentor.edu', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQmG6FeVEGz8paC35BCe6', 'Carlos', 'Martín', 'TUTOR', 'ACTIVE'),
('c0000000-0000-0000-0000-000000000001', 'diego.student@unimentor.edu', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQmG6FeVEGz8paC35BCe6', 'Diego', 'López', 'STUDENT', 'ACTIVE');

-- 2. Asignaturas
INSERT INTO subjects (id, code, name, department) VALUES
('d0000000-0000-0000-0000-000000000001', 'COMP101', 'Estructura de Computadores', 'Ingeniería Informática'),
('d0000000-0000-0000-0000-000000000002', 'MATH201', 'Álgebra Lineal y Geometría', 'Matemáticas'),
('d0000000-0000-0000-0000-000000000003', 'SOFT301', 'Ingeniería del Software', 'Ingeniería Informática');

-- 3. Perfiles de tutor
INSERT INTO tutor_profiles (user_id, bio, meeting_url) VALUES
('b0000000-0000-0000-0000-000000000001', 'Tutora de arquitectura de sistemas y programación.', 'https://meet.google.com/abc-defg-hij'),
('b0000000-0000-0000-0000-000000000002', 'Docente de matemáticas avanzadas.', 'https://zoom.us/j/1234567890');

-- 4. Asignaciones tutor - asignatura
INSERT INTO tutor_subjects (tutor_id, subject_id) VALUES
('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003'),
('b0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002');

-- 5. Slots (a horas en punto y > 2h de antelación o fechas de referencia)
INSERT INTO availability_slots (id, tutor_id, time_range, status) VALUES
('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', tstzrange(CURRENT_DATE + INTERVAL '1 day 10 hours', CURRENT_DATE + INTERVAL '1 day 11 hours'), 'BOOKED'),
('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', tstzrange(CURRENT_DATE + INTERVAL '1 day 11 hours', CURRENT_DATE + INTERVAL '1 day 12 hours'), 'AVAILABLE'),
('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', tstzrange(CURRENT_DATE - INTERVAL '2 days 10 hours', CURRENT_DATE - INTERVAL '2 days 9 hours'), 'BOOKED'),
('e0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', tstzrange(CURRENT_DATE + INTERVAL '2 days 16 hours', CURRENT_DATE + INTERVAL '2 days 17 hours'), 'AVAILABLE');

-- 6. Citas de prueba (Confirmada, Completada, Cancelada)
INSERT INTO appointments (id, slot_id, tutor_id, student_id, time_range, status, student_inquiry, tutor_notes, student_feedback) VALUES
-- Cita confirmada futura
('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', tstzrange(CURRENT_DATE + INTERVAL '1 day 10 hours', CURRENT_DATE + INTERVAL '1 day 11 hours'), 'CONFIRMED', 'Dudas con segmentación de cauce (pipelining).', NULL, NULL),
-- Cita completada pasada
('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', tstzrange(CURRENT_DATE - INTERVAL '2 days 10 hours', CURRENT_DATE - INTERVAL '2 days 9 hours'), 'COMPLETED', 'Repaso de memorias caché.', 'El estudiante completó los ejercicios con éxito.', 'Excelente explicación de las políticas de reemplazo.');

-- Cita cancelada de prueba
INSERT INTO appointments (
  id, tutor_id, student_id, subject_id, slot_start, slot_end, status, cancelled_by, cancelled_at
) VALUES (
  'c0000000-0000-0000-0000-000000000003',
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
  's0000000-0000-0000-0000-000000000001',
  '2026-11-01 12:00:00+00',
  '2026-11-01 13:00:00+00',
  'cancelled',
  'a0000000-0000-0000-0000-000000000002',
  NOW()
);