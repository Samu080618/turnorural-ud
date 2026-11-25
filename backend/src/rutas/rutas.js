'use strict';
const express = require('express');
const ControlSesion = require('../control/ControlSesion');
const ControlJornada = require('../control/ControlJornada');
const ControlTurno = require('../control/ControlTurno');
const ControlAtencion = require('../control/ControlAtencion');
const ControlNovedad = require('../control/ControlNovedad');
const PuestoSalud = require('../entidades/PuestoSalud');
const { requiereSesion, COOKIE } = require('../seguridad/autenticacion');

const r = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const opcionesCookie = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' };

// ---------------- Módulo 01 (Sprint 1, corregido HU-0105)
r.get('/puestos', h(async (req, res) => res.json(await PuestoSalud.listar())));
r.post('/auth/registro', h(async (req, res) => res.status(201).json({ idUsuario: await ControlSesion.registrar(req.body) })));
r.post('/auth/login', h(async (req, res) => {
  const s = await ControlSesion.iniciarSesion(req.body.numeroDocumento, req.body.contrasena, req.ip);
  res.cookie(COOKIE, s.token, opcionesCookie).json({ rol: s.rol, nombres: s.nombres });
}));
r.get('/auth/yo', requiereSesion(), h(async (req, res) => res.json(req.sesion)));
r.post('/auth/logout', requiereSesion(), h(async (req, res) => {
  await ControlSesion.cerrarSesion(req.sesion.idSesion, req.sesion.idUsuario, req.body && req.body.motivo === 'inactividad' ? 'expirada' : 'cerrada');
  res.clearCookie(COOKIE, opcionesCookie).status(204).end();
}));

// ---------------- Sprint 2: HU-0501 y Módulo 02
r.post('/jornadas', requiereSesion('Encargado'), h(async (req, res) => res.status(201).json(await ControlJornada.crearJornada(req.sesion, req.body))));
r.get('/jornadas/puesto', requiereSesion('Encargado'), h(async (req, res) => res.json(await ControlJornada.listarDelPuesto(req.sesion))));
r.get('/jornadas/disponibles', requiereSesion(), h(async (req, res) => res.json(await ControlJornada.consultarCuposDisponibles())));
r.post('/turnos', requiereSesion('Paciente'), h(async (req, res) => res.status(201).json(await ControlTurno.solicitarTurno(req.sesion, Number(req.body.idJornada)))));
r.get('/turnos/mios', requiereSesion('Paciente'), h(async (req, res) => res.json(await ControlTurno.consultarMisTurnos(req.sesion))));
r.get('/turnos/historial', requiereSesion('Paciente'), h(async (req, res) => res.json(await ControlTurno.consultarHistorial(req.sesion, req.query.estado, req.query.pagina))));
r.get('/turnos/:id/posicion', requiereSesion('Paciente'), h(async (req, res) => res.json(await ControlTurno.consultarPosicion(req.sesion, Number(req.params.id)))));
r.post('/turnos/:id/cancelar', requiereSesion('Paciente'), h(async (req, res) => res.json(await ControlTurno.cancelarTurno(req.sesion, Number(req.params.id), req.body.motivo))));

// ---------------- Sprint 3: Módulo 03
r.get('/atencion/hoy', requiereSesion('Encargado'), h(async (req, res) => res.json(await ControlAtencion.consultarListaDelDia(req.sesion, req.query.estado, req.query.documento))));
r.post('/atencion/turnos/:id/atendido', requiereSesion('Encargado'), h(async (req, res) => res.json(await ControlAtencion.marcarTurno(req.sesion, Number(req.params.id), 'Atendido'))));
r.post('/atencion/turnos/:id/no-asistio', requiereSesion('Encargado'), h(async (req, res) => res.json(await ControlAtencion.marcarTurno(req.sesion, Number(req.params.id), 'NoAsistio'))));
r.post('/atencion/turnos/:id/corregir', requiereSesion('Encargado'), h(async (req, res) => res.json(await ControlAtencion.corregirMarca(req.sesion, Number(req.params.id)))));
r.get('/atencion/cierre', requiereSesion('Encargado'), h(async (req, res) => res.json(await ControlAtencion.resumenCierre(req.sesion))));
r.post('/atencion/jornadas/:id/cerrar', requiereSesion('Encargado'), h(async (req, res) => res.json(await ControlAtencion.cerrarJornada(req.sesion, Number(req.params.id), req.body.confirmar))));
r.post('/novedades', requiereSesion('Encargado'), h(async (req, res) => res.status(201).json(await ControlNovedad.reportarNovedad(req.sesion, { ...req.body, idJornada: Number(req.body.idJornada) }))));

module.exports = r;
