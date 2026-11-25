'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { entorno, cliente, fijarHora, DOC, ServicioSMS, ConexionBD } = require('./ayuda');

describe('Sprint 2 - HU-0501 Crear los cupos del día', () => {
  let e, enc, pac;
  before(async () => { e = await entorno(); enc = cliente(e.base); pac = cliente(e.base); await enc.entrar(DOC.encargada); await pac.entrar(DOC.ana); });
  after(() => e.cerrar());
  test('CP-0501-01 crea una jornada válida en estado Abierta', async () => {
    const r = await enc.pedir('POST', '/jornadas', { fecha: '2026-11-26', horaInicio: '07:00', horaFin: '12:00', cuposTotales: 15 });
    assert.equal(r.status, 201); assert.equal(r.body.estado, 'Abierta'); assert.equal(r.body.cupos_totales, 15);
  });
  test('CP-0501-02 rechaza una segunda jornada para la misma fecha (409)', async () => {
    const r = await enc.pedir('POST', '/jornadas', { fecha: '2026-11-26', horaInicio: '08:00', horaFin: '12:00', cuposTotales: 10 });
    assert.equal(r.status, 409); assert.match(r.body.mensaje, /Ya existe una jornada/);
  });
  test('CP-0501-03 valida fecha pasada, más de 14 días, horario y cupos', async () => {
    const casos = [
      [{ fecha: '2026-11-22', horaInicio: '07:00', horaFin: '12:00', cuposTotales: 10 }, /fecha pasada/],
      [{ fecha: '2026-12-08', horaInicio: '07:00', horaFin: '12:00', cuposTotales: 10 }, /14 días/],
      [{ fecha: '2026-11-27', horaInicio: '05:00', horaFin: '12:00', cuposTotales: 10 }, /06:00 y 18:00/],
      [{ fecha: '2026-11-27', horaInicio: '10:00', horaFin: '10:30', cuposTotales: 10 }, /1 hora/],
      [{ fecha: '2026-11-27', horaInicio: '07:00', horaFin: '12:00', cuposTotales: 41 }, /entre 1 y 40/],
      [{ fecha: '2026-11-27', horaInicio: '07:00', horaFin: '12:00', cuposTotales: 0 }, /entre 1 y 40/],
    ];
    for (const [d, re] of casos) { const r = await enc.pedir('POST', '/jornadas', d); assert.equal(r.status, 400); assert.match(r.body.mensaje, re); }
  });
  test('CP-0501-04 un paciente no puede crear cupos (403)', async () => {
    const r = await pac.pedir('POST', '/jornadas', { fecha: '2026-11-27', horaInicio: '07:00', horaFin: '12:00', cuposTotales: 10 });
    assert.equal(r.status, 403);
  });
});

describe('Sprint 2 - HU-0201 Ver turnos disponibles del día', () => {
  let e, pac;
  before(async () => { e = await entorno(); pac = cliente(e.base); await pac.entrar(DOC.ana); });
  after(() => e.cerrar());
  test('CP-0201-01 muestra jornadas de hoy a 7 días con cupos libres calculados', async () => {
    const r = await pac.pedir('GET', '/jornadas/disponibles');
    assert.equal(r.status, 200); assert.equal(r.body.length, 2);
    assert.equal(r.body[0].fecha, '2026-11-23'); assert.equal(r.body[0].cuposDisponibles, 16); assert.equal(r.body[0].cuposTotales, 20);
  });
  test('CP-0201-02 una jornada sin cupos aparece con disponible=false', async () => {
    await ConexionBD.obtener().ejecutar('UPDATE jornada SET cupos_totales = 4 WHERE id_jornada = 1');
    const r = await pac.pedir('GET', '/jornadas/disponibles');
    assert.equal(r.body[0].cuposDisponibles, 0); assert.equal(r.body[0].disponible, false);
  });
  test('CP-0201-03 sin sesión responde 401', async () => {
    const r = await cliente(e.base).pedir('GET', '/jornadas/disponibles'); assert.equal(r.status, 401);
  });
});

describe('Sprint 2 - HU-0202 Solicitar un turno', () => {
  let e, ana, enc;
  before(async () => { e = await entorno(); ana = cliente(e.base); enc = cliente(e.base); await ana.entrar(DOC.ana); await enc.entrar(DOC.encargada); });
  after(() => e.cerrar());
  test('CP-0202-01 asigna el siguiente número, hora estimada y envía SMS', async () => {
    const r = await ana.pedir('POST', '/turnos', { idJornada: 1 });
    assert.equal(r.status, 201); assert.equal(r.body.numero, 5); assert.equal(r.body.horaEstimada, '08:00'); assert.equal(r.body.smsEnviado, true);
    assert.equal(ServicioSMS.bandeja.length, 1); assert.match(ServicioSMS.bandeja[0].texto, /No\. 5/);
  });
  test('CP-0202-02 no permite dos turnos activos el mismo día', async () => {
    const r = await ana.pedir('POST', '/turnos', { idJornada: 1 }); assert.equal(r.status, 409); assert.equal(r.body.codigo, 'YA_TIENE');
  });
  test('CP-0202-03 rechaza cuando no quedan cupos', async () => {
    await ConexionBD.obtener().ejecutar('UPDATE jornada SET cupos_totales = 1 WHERE id_jornada = 2');
    const pedro = cliente(e.base); await pedro.entrar(DOC.pedro);
    const jose = cliente(e.base); await jose.entrar(DOC.jose);
    assert.equal((await pedro.pedir('POST', '/turnos', { idJornada: 2 })).status, 201);
    const r = await jose.pedir('POST', '/turnos', { idJornada: 2 }); assert.equal(r.status, 409); assert.equal(r.body.codigo, 'SIN_CUPOS');
  });
  test('CP-0202-04 bloquea solicitudes del mismo día después de 1 hora antes del cierre', async () => {
    fijarHora('2026-11-23T16:10:00');
    const rosa = cliente(e.base); await rosa.entrar(DOC.rosa);
    const r = await rosa.pedir('POST', '/turnos', { idJornada: 1 }); assert.equal(r.status, 409); assert.equal(r.body.codigo, 'TARDE');
    fijarHora('2026-11-23T09:00:00');
  });
  test('CP-0202-05 si el SMS falla el turno queda guardado y se informa', async () => {
    const maria = cliente(e.base); await maria.entrar(DOC.maria); // celular termina en 0000 (falla simulada)
    await ConexionBD.obtener().ejecutar("UPDATE turno SET estado = 'Cancelado' WHERE id_paciente = (SELECT id_usuario FROM usuario WHERE numero_documento = ?)", [DOC.maria]);
    const r = await maria.pedir('POST', '/turnos', { idJornada: 1 });
    assert.equal(r.status, 201); assert.equal(r.body.smsEnviado, false);
    const n = await ConexionBD.obtener().consultar("SELECT estado, intentos FROM notificacion_sms WHERE id_turno = ?", [r.body.idTurno]);
    assert.equal(n[0].estado, 'Fallida'); assert.equal(n[0].intentos, 2);
  });
  test('CP-0202-06 paciente con 3 inasistencias en 30 días queda suspendido 7 días', async () => {
    const bd = ConexionBD.obtener();
    for (const [f, i] of [['2026-11-10', 21], ['2026-11-14', 22], ['2026-11-18', 23]]) {
      const { idInsertado } = await bd.ejecutar("INSERT INTO jornada (id_puesto, id_encargado, fecha, hora_inicio, hora_fin, cupos_totales, estado, fecha_creacion) VALUES (1, 1, ?, '07:00', '12:00', 5, 'Cerrada', '2026-11-01 08:00:00')", [f]);
      await bd.ejecutar("INSERT INTO turno (id_jornada, id_paciente, numero, estado, fecha_solicitud) VALUES (?, (SELECT id_usuario FROM usuario WHERE numero_documento = ?), 1, 'NoAsistio', '2026-11-01 08:00:00')", [idInsertado, DOC.jose]);
    }
    const jose = cliente(e.base); await jose.entrar(DOC.jose);
    await bd.ejecutar("UPDATE turno SET estado='Cancelado' WHERE id_jornada = 1 AND id_paciente = (SELECT id_usuario FROM usuario WHERE numero_documento = ?)", [DOC.jose]);
    const r = await jose.pedir('POST', '/turnos', { idJornada: 1 });
    assert.equal(r.status, 403); assert.equal(r.body.codigo, 'SUSPENDIDO'); assert.match(r.body.mensaje, /2026-11-25/);
  });
});

describe('Sprint 2 - HU-0203 Consultar posición en la fila', () => {
  let e, ana;
  before(async () => { e = await entorno(); ana = cliente(e.base); await ana.entrar(DOC.ana); await ana.pedir('POST', '/turnos', { idJornada: 1 }); });
  after(() => e.cerrar());
  test('CP-0203-01 muestra turnos antes y tiempo estimado (posición x 15 min)', async () => {
    const r = await ana.pedir('GET', '/turnos/mios');
    assert.equal(r.body[0].numero, 5); assert.equal(r.body[0].turnosAntes, 4); assert.equal(r.body[0].minutosEstimados, 60);
  });
  test('CP-0203-02 la posición baja cuando un turno anterior se cancela o se atiende', async () => {
    await ConexionBD.obtener().ejecutar("UPDATE turno SET estado = 'Atendido' WHERE id_jornada = 1 AND numero = 1");
    await ConexionBD.obtener().ejecutar("UPDATE turno SET estado = 'Cancelado' WHERE id_jornada = 1 AND numero = 2");
    const r = await ana.pedir('GET', '/turnos/mios'); assert.equal(r.body[0].turnosAntes, 2); assert.equal(r.body[0].minutosEstimados, 30);
  });
  test('CP-0203-03 un paciente no puede consultar el turno de otro (404)', async () => {
    const pedro = cliente(e.base); await pedro.entrar(DOC.pedro);
    const r = await pedro.pedir('GET', '/turnos/5/posicion'); assert.equal(r.status, 404);
  });
});

describe('Sprint 2 - HU-0204 Cancelar su turno', () => {
  let e, ana;
  before(async () => { e = await entorno(); ana = cliente(e.base); await ana.entrar(DOC.ana); await ana.pedir('POST', '/turnos', { idJornada: 1 }); });
  after(() => e.cerrar());
  test('CP-0204-01 exige un motivo válido', async () => {
    const r = await ana.pedir('POST', '/turnos/5/cancelar', { motivo: '' }); assert.equal(r.status, 400);
  });
  test('CP-0204-02 cancela, libera el cupo y no reutiliza el número', async () => {
    const antes = (await ana.pedir('GET', '/jornadas/disponibles')).body[0].cuposDisponibles;
    const r = await ana.pedir('POST', '/turnos/5/cancelar', { motivo: 'No tengo transporte' });
    assert.equal(r.status, 200); assert.equal(r.body.estado, 'Cancelado');
    const despues = (await ana.pedir('GET', '/jornadas/disponibles')).body[0].cuposDisponibles;
    assert.equal(despues, antes + 1);
    const nuevo = await ana.pedir('POST', '/turnos', { idJornada: 1 }); assert.equal(nuevo.body.numero, 6);
  });
  test('CP-0204-03 no se puede cancelar un turno ya cancelado o atendido', async () => {
    const r = await ana.pedir('POST', '/turnos/5/cancelar', { motivo: 'Otro' }); assert.equal(r.status, 409);
  });
});

describe('Sprint 2 - HU-0205 Ver historial de turnos anteriores', () => {
  let e, ana;
  before(async () => {
    e = await entorno(); ana = cliente(e.base); await ana.entrar(DOC.ana);
    const bd = ConexionBD.obtener();
    for (let k = 0; k < 12; k++) {
      const { idInsertado } = await bd.ejecutar("INSERT INTO jornada (id_puesto, id_encargado, fecha, hora_inicio, hora_fin, cupos_totales, estado, fecha_creacion) VALUES (1, 1, ?, '07:00', '12:00', 5, 'Cerrada', '2026-01-01 08:00:00')", [`2026-${String(k % 10 + 1).padStart(2, '0')}-${String(k + 1).padStart(2, '0')}`]);
      await bd.ejecutar("INSERT INTO turno (id_jornada, id_paciente, numero, estado, fecha_solicitud) VALUES (?, 2, 1, ?, '2026-01-01 08:00:00')", [idInsertado, k % 3 ? 'Atendido' : 'Cancelado']);
    }
  });
  after(() => e.cerrar());
  test('CP-0205-01 pagina de 10 en 10, del más reciente al más antiguo', async () => {
    const r = await ana.pedir('GET', '/turnos/historial?pagina=1');
    assert.equal(r.body.turnos.length, 10); assert.equal(r.body.total, 12); assert.equal(r.body.totalPaginas, 2);
    assert.ok(r.body.turnos[0].fecha >= r.body.turnos[9].fecha);
  });
  test('CP-0205-02 filtra por estado', async () => {
    const r = await ana.pedir('GET', '/turnos/historial?estado=Cancelado');
    assert.equal(r.body.total, 4); assert.ok(r.body.turnos.every((t) => t.estado === 'Cancelado'));
  });
  test('CP-0205-03 rechaza un estado inválido', async () => {
    const r = await ana.pedir('GET', '/turnos/historial?estado=Perdido'); assert.equal(r.status, 400);
  });
});

describe('Sprint 2 - HU-0105 Cierre de sesión seguro (corrección del Sprint 1)', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());
  test('CP-0105-01 cerrar sesión invalida el token en el servidor', async () => {
    const c = cliente(e.base); await c.entrar(DOC.ana);
    const cookieVieja = c; // mismo cliente guarda la cookie
    assert.equal((await c.pedir('POST', '/auth/logout')).status, 204);
    assert.equal((await cookieVieja.pedir('GET', '/turnos/mios')).status, 401);
  });
  test('CP-0105-02 a los 15 minutos sin uso la sesión expira', async () => {
    const c = cliente(e.base); await c.entrar(DOC.ana);
    fijarHora('2026-11-23T09:16:00');
    const r = await c.pedir('GET', '/turnos/mios'); assert.equal(r.status, 401); assert.equal(r.body.codigo, 'SESION_EXPIRADA');
    fijarHora('2026-11-23T09:00:00');
  });
  test('CP-0105-03 con actividad antes de 15 minutos la sesión sigue activa', async () => {
    const c = cliente(e.base); await c.entrar(DOC.ana);
    fijarHora('2026-11-23T09:14:00'); assert.equal((await c.pedir('GET', '/turnos/mios')).status, 200);
    fijarHora('2026-11-23T09:28:00'); assert.equal((await c.pedir('GET', '/turnos/mios')).status, 200);
    fijarHora('2026-11-23T09:00:00');
  });
});
