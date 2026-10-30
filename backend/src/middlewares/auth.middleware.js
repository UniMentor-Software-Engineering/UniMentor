const jwt = require('jsonwebtoken');

// Eslabón 1: Verificar el JWT
const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_de_desarrollo');
        req.user = decoded; // Guardamos los datos del usuario en la request
        next(); 
    } catch {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
};

// Eslabón 2: Comprobar roles
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'No tienes permisos para realizar esta acción.' });
        }
        next();
    };
};

module.exports = { verifyJWT, requireRole };
