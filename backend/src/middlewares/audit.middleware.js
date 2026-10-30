// Eslabón de Auditoría
const auditLog = async (req, res, next) => {
    const userId = req.user ? req.user.id : 'Anónimo';
    const action = `${req.method} ${req.originalUrl}`;
    const ip = req.ip;

    try {
        // Aquí iría la inserción en base de datos:
        // await db.query('INSERT INTO audit_logs (user_id, action, ip_address) VALUES ($1, $2, $3)', [userId, action, ip]);
        console.log(`[AUDIT LOG] User: ${userId} | Action: ${action} | IP: ${ip} | Date: ${new Date().toISOString()}`);
        next();
    } catch (error) {
        console.error('Error guardando log de auditoría', error);
        next();
    }
};

module.exports = { auditLog };
