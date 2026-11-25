'use strict';
const bcrypt = require('bcryptjs');
const Usuario = require('../entidades/Usuario');
const Sesion = require('../entidades/Sesion');
const PuestoSalud = require('../entidades/PuestoSalud');
const { fechaHora, minutosDesde, ErrorNegocio } = require('../util');

/** Control del Módulo 01 necesario para los sprints 2 y 3 (registro, ingreso y cierre de sesión). */
class ControlSesion {
  static async registrar(d) {
    if (!['CC', 'TI', 'CE'].includes(d.tipoDocumento)) throw new ErrorNegocio(400, 'DATOS', 'Tipo de documento no válido');
    if (!/^\d{5,15}$/.test(d.numeroDocumento || '')) throw new ErrorNegocio(400, 'DATOS', 'Número de documento no válido');
    if (!/^3\d{9}$/.test(d.celular || '')) throw new ErrorNegocio(400, 'DATOS', 'El celular debe tener 10 dígitos y empezar por 3');
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(d.contrasena || '')) throw new ErrorNegocio(400, 'DATOS', 'La contraseña debe tener mínimo 8 caracteres, con letras y números');
    if (!d.nombres || !d.apellidos) throw new ErrorNegocio(400, 'DATOS', 'Nombres y apellidos son obligatorios');
    if (!d.aceptaDatos) throw new ErrorNegocio(400, 'DATOS', 'Debe aceptar el tratamiento de datos (Ley 1581 de 2012)');
    if (d.rol === 'Paciente' && !d.vereda) throw new ErrorNegocio(400, 'DATOS', 'Indique su vereda o sector');
    if (d.rol === 'Encargado') {
      const puesto = await PuestoSalud.obtener(d.idPuesto);
      if (!puesto || !(await bcrypt.compare(d.codigoAutorizacion || '', puesto.codigo_autorizacion_hash)))
        throw new ErrorNegocio(403, 'CODIGO', 'El código de autorización no es válido');
    }
    if (await Usuario.buscarPorDocumento(d.numeroDocumento)) throw new ErrorNegocio(409, 'DUPLICADO', 'El documento ya está registrado');
    const hash = await bcrypt.hash(d.contrasena, 10);
    return Usuario.registrar(d, hash, fechaHora());
  }

  static async iniciarSesion(documento, contrasena, ip) {
    const u = await Usuario.buscarPorDocumento(documento);
    const generico = new ErrorNegocio(401, 'CREDENCIALES', 'Documento o contraseña incorrectos');
    if (!u || !u.activo) throw generico;
    const c = await Usuario.obtenerCredencial(u.id_usuario);
    if (c.bloqueado_hasta && minutosDesde(c.bloqueado_hasta) < 0)
      throw new ErrorNegocio(423, 'BLOQUEADA', 'La cuenta está bloqueada por 15 minutos');
    if (!(await bcrypt.compare(contrasena || '', c.hash_contrasena))) {
      const n = c.intentos_fallidos + 1;
      const bloqueo = n >= 5 ? fechaHora(new Date(Date.now() + 15 * 60000)) : null;
      await Usuario.actualizarIntentos(u.id_usuario, n >= 5 ? 0 : n, bloqueo);
      await Usuario.registrarAcceso(u.id_usuario, n >= 5 ? 'bloqueo' : 'login_fallido', fechaHora(), ip);
      throw n >= 5 ? new ErrorNegocio(423, 'BLOQUEADA', 'La cuenta está bloqueada por 15 minutos') : generico;
    }
    await Usuario.actualizarIntentos(u.id_usuario, 0, null);
    const token = await Sesion.crear(u.id_usuario, fechaHora());
    await Usuario.registrarAcceso(u.id_usuario, 'login_exitoso', fechaHora(), ip);
    return { token, rol: u.rol, nombres: u.nombres };
  }

  /** Valida el token en cada petición; aplica el cierre por inactividad (HU-0105). */
  static async validarSesion(token) {
    const s = token ? await Sesion.buscarPorToken(token) : null;
    if (!s || s.estado !== 'activa') throw new ErrorNegocio(401, 'SIN_SESION', 'Debe iniciar sesión');
    if (Sesion.estaVencida(s, minutosDesde(s.ultima_actividad))) {
      await Sesion.finalizar(s.id_sesion, 'expirada', fechaHora());
      await Usuario.registrarAcceso(s.id_usuario, 'expiracion', fechaHora());
      throw new ErrorNegocio(401, 'SESION_EXPIRADA', 'Tu sesión se cerró por inactividad');
    }
    await Sesion.registrarActividad(s.id_sesion, fechaHora());
    const u = await Usuario.buscarPorId(s.id_usuario);
    return { idSesion: s.id_sesion, idUsuario: u.id_usuario, rol: u.rol, idPuesto: u.id_puesto, nombres: u.nombres, apellidos: u.apellidos, celular: u.celular };
  }

  static async cerrarSesion(idSesion, idUsuario, motivo = 'cerrada') {
    await Sesion.finalizar(idSesion, motivo, fechaHora());
    await Usuario.registrarAcceso(idUsuario, motivo === 'expirada' ? 'expiracion' : 'cierre_sesion', fechaHora());
  }
}
module.exports = ControlSesion;
