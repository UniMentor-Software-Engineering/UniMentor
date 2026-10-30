const rateLimit = require('express-rate-limit');

// Limitar intentos de Login (Bloqueo temporal en memoria tras 5 intentos)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // Límite de 5 intentos fallidos
    message: { error: 'Demasiados intentos de inicio de sesión. Cuenta bloqueada temporalmente durante 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = { loginLimiter };
