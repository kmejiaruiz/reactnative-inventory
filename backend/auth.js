import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const SECRET = process.env.JWT_SECRET || 'clave_secreta_para_jwt_12345';

export function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(403).json({ mensaje: 'No se proporcionó token de acceso.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(403).json({ mensaje: 'Formato de token inválido. Use "Bearer <token>"' });
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded; // { id, nombre, email, rol }
    next();
  } catch (error) {
    return res.status(401).json({ mensaje: 'Token no autorizado o expirado.' });
  }
}

export function verificarRol(rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({ mensaje: 'Acceso denegado: rol insuficiente.' });
    }
    next();
  };
}
