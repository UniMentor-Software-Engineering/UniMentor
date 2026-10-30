const express = require('express');
const router = express.Router();
const { verifyJWT, requireRole } = require('../middlewares/auth.middleware');
const { auditLog } = require('../middlewares/audit.middleware');

// Controlador simulado para el ejemplo
const banUser = (req, res) => {
    res.json({ message: `Usuario con ID ${req.body.userId} ha sido baneado exitosamente.` });
};

// Ruta protegida para administradores aplicando Chain of Responsibility
router.post(
    '/users/ban', 
    verifyJWT,                  // 1. ¿Tiene token válido?
    requireRole('admin'),       // 2. ¿Es administrador?
    auditLog,                   // 3. Registrar acción
    banUser                     // 4. Lógica final
);

module.exports = router;
