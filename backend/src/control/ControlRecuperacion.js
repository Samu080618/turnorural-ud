'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Usuario = require('../entidades/Usuario');
const Sesion = require('../entidades/Sesion');
const CodigoRecuperacion = require('../entidades/CodigoRecuperacion');
const ServicioSMS = require('../servicios/ServicioSMS');
const ControlSesion = require('./ControlSesion');
const { reloj, fechaHora, minutosDesde, ErrorNegocio } = require('../util');

const MENSAJE_GENERICO = 'Si el documento está registrado, enviamos un código de 6 dígitos al celular registrado. El código vence en 10 minutos.';

/** Control de la recuperación de contraseña por SMS (HU-0103, CU-03). */
class ControlRecuperacion {
  /** CA1 y CA2: responde lo mismo exista o no el documento; genera y envía el código. */
  static async solicitarCodigo(numeroDocumento) {
    const u = numeroDocumento ? await Usuario.buscarPorDocumento(String(numeroDocumento).trim()) : null;
    const respuesta = { mensaje: MENSAJE_GENERICO };
    if (!u || !u.activo) return respuesta;
    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const vence = new Date(reloj.ahora().getTime() + CodigoRecuperacion.MINUTOS_VIGENCIA * 60000);
    await CodigoRecuperacion.anularPendientes(u.id_usuario);
    await CodigoRecuperacion.crear(u.id_usuario, await bcrypt.hash(codigo, 8), fechaHora(vence));
    await ServicioSMS.enviar(u.celular, `TurnoRural: tu código para cambiar la contraseña es ${codigo}. Vence en 10 minutos. No lo compartas.`);
    await Usuario.registrarAcceso(u.id_usuario, 'solicitud_recuperacion', fechaHora());
    // Solo en modo simulado (sin proveedor SMS real) se devuelve el código para poder hacer la demostración.
    if (!process.env.SMS_API_URL && process.env.NODE_ENV !== 'test') respuesta.codigoDemo = codigo;
    return respuesta;
  }

  /** CA2, CA3 y CA4: valida el código y cambia la contraseña. */
  static async restablecer(numeroDocumento, codigo, nuevaContrasena) {
    const invalido = new ErrorNegocio(400, 'CODIGO_INVALIDO', 'El código no es válido');
    if (!/^\d{6}$/.test(codigo || '')) throw invalido;
    ControlSesion.validarContrasena(nuevaContrasena);
    const u = await Usuario.buscarPorDocumento(String(numeroDocumento || '').trim());
    const c = u ? await CodigoRecuperacion.obtenerVigente(u.id_usuario) : null;
    if (!c) throw new ErrorNegocio(400, 'SIN_CODIGO', 'No hay un código vigente. Pide uno nuevo.');
    if (minutosDesde(c.fecha_expiracion) >= 0) {
      await CodigoRecuperacion.marcarUsado(c.id_codigo);
      throw new ErrorNegocio(400, 'CODIGO_VENCIDO', 'El código venció. Pide uno nuevo.');
    }
    if (!(await bcrypt.compare(codigo, c.codigo_hash))) {
      const n = c.intentos + 1;
      const anular = n >= CodigoRecuperacion.MAX_INTENTOS;
      await CodigoRecuperacion.registrarIntento(c.id_codigo, n, anular);
      if (anular) throw new ErrorNegocio(400, 'CODIGO_ANULADO', 'Fallaste 3 veces y el código se anuló. Pide uno nuevo.');
      throw new ErrorNegocio(400, 'CODIGO_INVALIDO', `El código no es válido. Te quedan ${CodigoRecuperacion.MAX_INTENTOS - n} intento(s).`);
    }
    const ahora = fechaHora();
    await Usuario.cambiarContrasena(u.id_usuario, await bcrypt.hash(nuevaContrasena, 10), ahora);
    await CodigoRecuperacion.marcarUsado(c.id_codigo);
    await Sesion.finalizarTodas(u.id_usuario, ahora);
    await Usuario.registrarAcceso(u.id_usuario, 'cambio_contrasena', ahora);
    return { mensaje: 'Tu contraseña se cambió. Ingresa con la nueva contraseña.' };
  }
}
module.exports = ControlRecuperacion;
