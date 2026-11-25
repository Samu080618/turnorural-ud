'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { entorno, cliente, fijarHora, DOC, ServicioSMS, ConexionBD } = require('./ayuda');

describe('Sprint 3 - HU-0301 Ver lista de turnos del día', () => {
  let e, enc;
  before(async () => { e = await entorno(); enc = cliente(e.base); await enc.entrar(DOC.encargada); });
  after(() => e.cerrar());
  test('CP-0301-01 muestra los turnos de hoy en orden, con contadores y siguiente en fila', async () => {
    const r = await enc.pedir('GET', '/atencion/hoy');
    assert.equal(r.status, 200); assert.equal(r.body.turnos.length, 4);
    assert.deepEqual(r.body.turnos.map((t) => t.numero), [1, 2, 3, 4]);
    assert.equal(r.body.conteo.Asignado, 4); assert.equal(r.body.siguienteNumero, 1);
    assert.ok(r.body.turnos[0].nombres && r.body.turnos[0].numero_documento && r.body.turnos[0].vereda);
  });
  test('CP-0301-02 filtra por estado y busca por documento', async () => {
    const r = await enc.pedir('GET', `/atencion/hoy?documento=${DOC.maria}`);
    assert.equal(r.body.turnos.length, 1); assert.equal(r.body.turnos[0].numero_documento, DOC.maria);
    const r2 = await enc.pedir('GET', '/atencion/hoy?estado=Atendido'); assert.equal(r2.body.turnos.length, 0);
    const r3 = await enc.pedir('GET', '/atencion/hoy?documento=abc'); assert.equal(r3.status, 400);
  });
  test('CP-0301-03 sin jornada hoy informa SIN_JORNADA y un paciente no tiene acceso', async () => {
    fijarHora('2026-11-25T09:00:00');
    const c = cliente(e.base); await c.entrar(DOC.encargada);
    const r = await c.pedir('GET', '/atencion/hoy'); assert.equal(r.status, 404); assert.equal(r.body.codigo, 'SIN_JORNADA');
    const p = cliente(e.base); await p.entrar(DOC.ana);
    assert.equal((await p.pedir('GET', '/atencion/hoy')).status, 403);
    fijarHora('2026-11-23T09:00:00');
  });
});

describe('Sprint 3 - HU-0302 / HU-0303 Marcar atendido y "no llegó"', () => {
  let e, enc;
  before(async () => { e = await entorno(); enc = cliente(e.base); await enc.entrar(DOC.encargada); });
  after(() => e.cerrar());
  test('CP-0302-01 marca atendido, guarda la hora y la jornada pasa a En atención', async () => {
    const r = await enc.pedir('POST', '/atencion/turnos/1/atendido');
    assert.equal(r.status, 200); assert.equal(r.body.estado, 'Atendido');
    const t = (await ConexionBD.obtener().consultar('SELECT * FROM turno WHERE id_turno = 1'))[0];
    assert.ok(t.fecha_marca); assert.equal(t.id_encargado_marca, 1);
    const j = (await ConexionBD.obtener().consultar('SELECT estado FROM jornada WHERE id_jornada = 1'))[0];
    assert.equal(j.estado, 'EnAtencion');
  });
  test('CP-0302-02 no se puede marcar dos veces el mismo turno', async () => {
    const r = await enc.pedir('POST', '/atencion/turnos/1/no-asistio'); assert.equal(r.status, 409); assert.equal(r.body.codigo, 'YA_MARCADO');
  });
  test('CP-0303-01 marca "no llegó" y cuenta para la regla de suspensión', async () => {
    const r = await enc.pedir('POST', '/atencion/turnos/2/no-asistio'); assert.equal(r.body.estado, 'NoAsistio');
    const lista = await enc.pedir('GET', '/atencion/hoy'); assert.equal(lista.body.conteo.NoAsistio, 1); assert.equal(lista.body.siguienteNumero, 3);
  });
  test('CP-0302-03 permite deshacer la marca solo dentro de 10 minutos', async () => {
    fijarHora('2026-11-23T09:08:00');
    assert.equal((await enc.pedir('POST', '/atencion/turnos/2/corregir')).body.estado, 'Asignado');
    await enc.pedir('POST', '/atencion/turnos/2/no-asistio');
    fijarHora('2026-11-23T09:20:00');
    const r = await enc.pedir('POST', '/atencion/turnos/2/corregir'); assert.equal(r.status, 409); assert.equal(r.body.codigo, 'FUERA_DE_TIEMPO');
  });
  test('CP-0302-04 no permite marcar turnos de otra fecha', async () => {
    const pac = cliente(e.base); await pac.entrar(DOC.ana);
    const t = await pac.pedir('POST', '/turnos', { idJornada: 2 });
    const r = await enc.pedir('POST', `/atencion/turnos/${t.body.idTurno}/atendido`); assert.equal(r.status, 409); assert.equal(r.body.codigo, 'NO_ES_HOY');
  });
});

describe('Sprint 3 - HU-0304 Cerrar la jornada de turnos', () => {
  let e, enc;
  before(async () => { e = await entorno(); enc = cliente(e.base); await enc.entrar(DOC.encargada); await enc.pedir('POST', '/atencion/turnos/1/atendido'); });
  after(() => e.cerrar());
  test('CP-0304-01 el resumen muestra los conteos antes de cerrar', async () => {
    const r = await enc.pedir('GET', '/atencion/cierre'); assert.equal(r.body.conteo.Atendido, 1); assert.equal(r.body.conteo.Asignado, 3);
  });
  test('CP-0304-02 sin confirmación no cierra', async () => {
    const r = await enc.pedir('POST', '/atencion/jornadas/1/cerrar', {}); assert.equal(r.status, 400);
  });
  test('CP-0304-03 al confirmar, los pendientes pasan a "no llegó" y la jornada queda Cerrada', async () => {
    const r = await enc.pedir('POST', '/atencion/jornadas/1/cerrar', { confirmar: true });
    assert.equal(r.body.estado, 'Cerrada'); assert.equal(r.body.pendientesMarcadosNoAsistio, 3); assert.equal(r.body.conteo.NoAsistio, 3);
  });
  test('CP-0304-04 después del cierre no se permiten marcas ni cancelaciones', async () => {
    assert.equal((await enc.pedir('POST', '/atencion/turnos/2/atendido')).body.codigo, 'JORNADA_CERRADA');
    assert.equal((await enc.pedir('POST', '/atencion/jornadas/1/cerrar', { confirmar: true })).status, 409);
  });
  test('CP-0304-05 no se puede cerrar una jornada futura', async () => {
    const r = await enc.pedir('POST', '/atencion/jornadas/2/cerrar', { confirmar: true }); assert.equal(r.body.codigo, 'FUTURA');
  });
});

describe('Sprint 3 - HU-0305 Reportar una novedad', () => {
  let e, enc;
  before(async () => { e = await entorno(); enc = cliente(e.base); await enc.entrar(DOC.encargada); });
  after(() => e.cerrar());
  test('CP-0305-01 valida tipo, descripción y minutos de retraso', async () => {
    assert.equal((await enc.pedir('POST', '/novedades', { idJornada: 1, tipo: 'X', descripcion: 'Descripción válida' })).status, 400);
    assert.equal((await enc.pedir('POST', '/novedades', { idJornada: 1, tipo: 'Otra', descripcion: 'corta' })).status, 400);
    assert.equal((await enc.pedir('POST', '/novedades', { idJornada: 1, tipo: 'Retraso', descripcion: 'El médico llega tarde', minutosRetraso: 5 })).status, 400);
  });
  test('CP-0305-02 un retraso avisa por SMS a los turnos en espera sin cancelar la jornada', async () => {
    const r = await enc.pedir('POST', '/novedades', { idJornada: 1, tipo: 'Retraso', descripcion: 'El médico llega tarde por la vía', minutosRetraso: 45 });
    assert.equal(r.status, 201); assert.equal(r.body.jornadaCancelada, false); assert.equal(r.body.turnosAfectados, 4);
    assert.equal(r.body.smsEnviados, 3); assert.equal(r.body.smsFallidos, 1); // María: celular de prueba que falla
    assert.ok(ServicioSMS.bandeja.some((m) => /se retrasa 45 min/.test(m.texto)));
  });
  test('CP-0305-03 "médico no asiste" cancela la jornada y los turnos en espera', async () => {
    const r = await enc.pedir('POST', '/novedades', { idJornada: 1, tipo: 'MedicoNoAsiste', descripcion: 'El médico está incapacitado hoy' });
    assert.equal(r.body.jornadaCancelada, true);
    const c = await ConexionBD.obtener().consultar("SELECT COUNT(*) AS n FROM turno WHERE id_jornada = 1 AND estado = 'CanceladoNovedad'");
    assert.equal(Number(c[0].n), 4);
    const pac = cliente(e.base); await pac.entrar(DOC.jose);
    const mios = await pac.pedir('GET', '/turnos/mios');
    assert.equal(mios.body[0].estado, 'CanceladoNovedad'); assert.match(mios.body[0].novedades[0].descripcion, /incapacitado/);
  });
  test('CP-0305-04 no se reportan novedades en jornadas canceladas o cerradas', async () => {
    const r = await enc.pedir('POST', '/novedades', { idJornada: 1, tipo: 'Otra', descripcion: 'Otro aviso cualquiera' }); assert.equal(r.status, 409);
  });
});
