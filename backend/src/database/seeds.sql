-- Insertar asignaturas de prueba
INSERT INTO subjects (id, name, code, description) VALUES
('11111111-1111-1111-1111-111111111111', 'Ingeniería del Software', 'ISW-101', 'Modelado y metodologías'),
('22222222-2222-2222-2222-222222222222', 'Bases de Datos', 'BDA-201', 'Diseño relacional y SQL'),
('33333333-3333-3333-3333-333333333333', 'Estructuras de Datos', 'EDA-102', 'Grafos y árboles');

-- Insertar usuarios de prueba
INSERT INTO users (id, email, password_hash, full_name, role) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'carlos.tutor@uax.es', '$2b$10$wT3WlXmPzPj0Pmockhash1', 'Carlos Mentor', 'TUTOR'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'elena.tutor@uax.es', '$2b$10$wT3WlXmPzPj0Pmockhash2', 'Elena Docente', 'TUTOR'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'diego.student@uax.es', '$2b$10$wT3WlXmPzPj0Pmockhash3', 'Diego Alumno', 'STUDENT');

-- Insertar perfiles de tutores (CU-03)
INSERT INTO tutor_profiles (id, user_id, bio, meeting_url, hourly_rate) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Especialista en arquitecturas web y Node.js.', 'https://meet.google.com/abc-defg-hij', 15.00),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Profesora especializada en bases de datos.', 'https://meet.google.com/xyz-uvwx-rst', 18.00);

-- Asociar materias a tutores
INSERT INTO tutor_subjects (tutor_profile_id, subject_id) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111'),
('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222222'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222222'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '33333333-3333-3333-3333-333333333333');

-- Crear slots de prueba disponibles
INSERT INTO availability_slots (tutor_id, time_range, status) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', tstzrange(NOW() + interval '1 day', NOW() + interval '1 day 1 hour'), 'AVAILABLE'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', tstzrange(NOW() + interval '2 days', NOW() + interval '2 days 1 hour'), 'AVAILABLE'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', tstzrange(NOW() + interval '1 day 2 hours', NOW() + interval '1 day 3 hours'), 'AVAILABLE');