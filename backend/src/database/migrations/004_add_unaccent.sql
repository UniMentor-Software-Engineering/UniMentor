-- Accent-insensitive tutor search (CU-06): "algebra" must find "Álgebra Lineal"
-- and "garcia" must find "García". unaccent is a standard contrib extension,
-- available in Render's managed PostgreSQL.
CREATE EXTENSION IF NOT EXISTS unaccent;
