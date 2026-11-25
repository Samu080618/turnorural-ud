'use strict';
const ControlSesion = require('../control/ControlSesion');
const COOKIE = 'tr_sesion';
/** Middleware: valida la cookie de sesión en cada petición protegida. */
function requiereSesion(rol = null) {
  return async (req, res, next) => {
    try {
      req.sesion = await ControlSesion.validarSesion(req.cookies[COOKIE]);
      if (rol && req.sesion.rol !== rol) return res.status(403).json({ codigo: 'ROL', mensaje: 'No tiene permiso para esta opción' });
      next();
    } catch (e) {
      res.clearCookie(COOKIE);
      next(e);
    }
  };
}
module.exports = { requiereSesion, COOKIE };
