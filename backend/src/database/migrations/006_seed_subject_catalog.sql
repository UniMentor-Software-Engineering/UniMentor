-- Subject catalog for every database, production included.
-- Until now the subjects only came from seeds.sql, which must never run against a real
-- database, so a fresh deployment had an empty catalog: tutors could not save their profile
-- (CU-03 requires at least one subject) and the search by subject (CU-06) found nothing.
-- Same IDs and codes as seeds.sql. ON CONFLICT keeps this safe on databases that already
-- have them (a seeded development database); the seed still empties and reloads the table.
INSERT INTO subjects (id, code, name, department) VALUES
('d0000000-0000-0000-0000-000000000001', 'COMP101', 'Estructura de Computadores', 'Ingeniería Informática'),
('d0000000-0000-0000-0000-000000000002', 'MATH201', 'Álgebra Lineal y Geometría', 'Matemáticas'),
('d0000000-0000-0000-0000-000000000003', 'SOFT301', 'Ingeniería del Software', 'Ingeniería Informática')
ON CONFLICT DO NOTHING;
