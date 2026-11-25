'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { entorno, cliente, fijarHora, DOC, ServicioSMS } = require('./ayuda');

const ultimoCodigo = () => ServicioSMS.bandeja.at(-1).texto.match(/\b(\d{6})\b/)[1];
const otroCodigo = (c) => String((Number(c) + 1) % 1000000).padStart(6, '0');

const nuevo = (x = {}) => ({ rol: 'Paciente', tipoDocumento: 'CC', numeroDocumento: '1099887766', nombres: 'Carlos', apellidos: 'Ríos', celular: '3157778899',
  vereda: 'San José', contrasena: 'Campo2026', aceptaDatos: true, ...x });

describe('Módulo 01 - HU-0101 Registro de usuario', () => {
  let e, anon;
  before(async () => { e = await entorno(); anon = cliente(e.base); });
  after(() => e.cerrar());
  test('CP-0101-01 registra un paciente con datos válidos y la contraseña cifrada', async () => {
    const r = await anon.pedir('POST', '/auth/registro', nuevo());
    assert.equal(r.status, 201);
    assert.equal((await cliente(e.base).pedir('POST', '/auth/login', { numeroDocumento: '1099887766', contrasena: 'Campo2026' })).status, 200);
  });
  test('CP-0101-02 rechaza un documento ya registrado', async () => {
    const r = await anon.pedir('POST', '/auth/registro', nuevo());
    assert.equal(r.status, 409); assert.match(r.body.mensaje, /ya está registrado/);
  });
  test('CP-0101-03 exige contraseña de mínimo 8 caracteres con letras y números', async () => {
    const r = await anon.pedir('POST', '/auth/registro', nuevo({ numeroDocumento: '1099887700', contrasena: 'solotexto' }));
    assert.equal(r.status, 400); assert.match(r.body.mensaje, /mínimo 8/);
  });
  test('CP-0101-04 el encargado necesita el código de autorización del puesto', async () => {
    const base = { rol: 'Encargado', numeroDocumento: '1088776655', vereda: undefined, idPuesto: 1 };
    const malo = await anon.pedir('POST', '/auth/registro', nuevo({ ...base, codigoAutorizacion: 'XXXX' }));
    assert.equal(malo.status, 403);
    const bueno = await anon.pedir('POST', '/auth/registro', nuevo({ ...base, codigoAutorizacion: 'CARMEN-2026' }));
    assert.equal(bueno.status, 201);
  });
  test('CP-0101-05 exige aceptar el tratamiento de datos (Ley 1581 de 2012)', async () => {
    const r = await anon.pedir('POST', '/auth/registro', nuevo({ numeroDocumento: '1099887711', aceptaDatos: false }));
    assert.equal(r.status, 400); assert.match(r.body.mensaje, /tratamiento de datos/);
  });
});

describe('Módulo 01 - HU-0102 Inicio de sesión', () => {
  let e;
  before(async () => { e = await entorno(); });
  after(() => e.cerrar());
  test('CP-0102-01 muestra un mensaje genérico si el documento o la contraseña fallan', async () => {
    const a = await cliente(e.base).pedir('POST', '/auth/login', { numeroDocumento: '9999999999', contrasena: 'Clave2026' });
    const b = await cliente(e.base).pedir('POST', '/auth/login', { numeroDocumento: DOC.maria, contrasena: 'Mala2026' });
    assert.equal(a.status, 401); assert.equal(a.body.mensaje, b.body.mensaje); assert.equal(a.body.mensaje, 'Documento o contraseña incorrectos');
  });
  test('CP-0102-02 bloquea la cuenta 15 minutos después de 5 intentos fallidos', async () => {
    const c = cliente(e.base); let r;
    for (let i = 0; i < 5; i++) r = await c.pedir('POST', '/auth/login', { numeroDocumento: DOC.pedro, contrasena: 'Mala2026' });
    assert.equal(r.status, 423);
    assert.equal((await c.entrar(DOC.pedro)).status, 423, 'ni con la clave correcta mientras está bloqueada');
    fijarHora('2026-11-23T09:16:00');
    assert.equal((await c.entrar(DOC.pedro)).status, 200);
    fijarHora('2026-11-23T09:00:00');
  });
  test('CP-0102-03 con datos correctos entrega el rol para abrir el panel correspondiente', async () => {
    assert.equal((await cliente(e.base).entrar(DOC.ana)).body.rol, 'Paciente');
    assert.equal((await cliente(e.base).entrar(DOC.encargada)).body.rol, 'Encargado');
  });
});

describe('Módulo 01 - HU-0103 Recuperación de contraseña', () => {
  let e, anon;
  before(async () => { e = await entorno(); anon = cliente(e.base); });
  after(() => e.cerrar());
  test('CP-0103-01 responde el mismo mensaje exista o no el documento', async () => {
    const a = await anon.pedir('POST', '/auth/recuperar', { numeroDocumento: DOC.ana });
    const enviados = ServicioSMS.bandeja.length;
    const b = await anon.pedir('POST', '/auth/recuperar', { numeroDocumento: '9999999999' });
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    assert.deepEqual(a.body, b.body);
    assert.equal(ServicioSMS.bandeja.length, enviados, 'no se envía SMS a un documento inexistente');
  });
  test('CP-0103-02 envía un código de 6 dígitos al celular registrado y vence a los 10 minutos', async () => {
    fijarHora('2026-11-23T09:00:00');
    await anon.pedir('POST', '/auth/recuperar', { numeroDocumento: DOC.ana });
    const sms = ServicioSMS.bandeja.at(-1);
    assert.equal(sms.celular, '3124567890'); assert.match(sms.texto, /\b\d{6}\b/);
    const codigo = ultimoCodigo();
    fijarHora('2026-11-23T09:11:00');
    const r = await anon.pedir('POST', '/auth/restablecer', { numeroDocumento: DOC.ana, codigo, nuevaContrasena: 'Nueva2026x' });
    assert.equal(r.status, 400); assert.equal(r.body.codigo, 'CODIGO_VENCIDO');
    fijarHora('2026-11-23T09:00:00');
  });
  test('CP-0103-03 anula el código al tercer intento incorrecto', async () => {
    await anon.pedir('POST', '/auth/recuperar', { numeroDocumento: DOC.ana });
    const bueno = ultimoCodigo(); const malo = otroCodigo(bueno);
    const r1 = await anon.pedir('POST', '/auth/restablecer', { numeroDocumento: DOC.ana, codigo: malo, nuevaContrasena: 'Nueva2026x' });
    const r2 = await anon.pedir('POST', '/auth/restablecer', { numeroDocumento: DOC.ana, codigo: malo, nuevaContrasena: 'Nueva2026x' });
    const r3 = await anon.pedir('POST', '/auth/restablecer', { numeroDocumento: DOC.ana, codigo: malo, nuevaContrasena: 'Nueva2026x' });
    assert.match(r1.body.mensaje, /2 intento/); assert.match(r2.body.mensaje, /1 intento/); assert.equal(r3.body.codigo, 'CODIGO_ANULADO');
    const r4 = await anon.pedir('POST', '/auth/restablecer', { numeroDocumento: DOC.ana, codigo: bueno, nuevaContrasena: 'Nueva2026x' });
    assert.equal(r4.status, 400); assert.equal(r4.body.codigo, 'SIN_CODIGO');
  });
  test('CP-0103-04 la nueva contraseña cumple las reglas, queda cifrada y cierra las sesiones abiertas', async () => {
    const pac = cliente(e.base); await pac.entrar(DOC.jose);
    assert.equal((await pac.pedir('GET', '/auth/yo')).status, 200);
    await anon.pedir('POST', '/auth/recuperar', { numeroDocumento: DOC.jose });
    const codigo = ultimoCodigo();
    const debil = await anon.pedir('POST', '/auth/restablecer', { numeroDocumento: DOC.jose, codigo, nuevaContrasena: 'corta' });
    assert.equal(debil.status, 400); assert.match(debil.body.mensaje, /mínimo 8/);
    const ok = await anon.pedir('POST', '/auth/restablecer', { numeroDocumento: DOC.jose, codigo, nuevaContrasena: 'Nueva2026x' });
    assert.equal(ok.status, 200);
    assert.equal((await pac.pedir('GET', '/auth/yo')).status, 401, 'la sesión anterior quedó cerrada');
    const vieja = await cliente(e.base).entrar(DOC.jose);
    assert.equal(vieja.status, 401);
    const nueva = await cliente(e.base).pedir('POST', '/auth/login', { numeroDocumento: DOC.jose, contrasena: 'Nueva2026x' });
    assert.equal(nueva.status, 200);
    const reuso = await anon.pedir('POST', '/auth/restablecer', { numeroDocumento: DOC.jose, codigo, nuevaContrasena: 'Otra2026x' });
    assert.equal(reuso.status, 400, 'el código solo sirve una vez');
  });
});

describe('Módulo 01 - HU-0104 Edición del perfil', () => {
  let e, pac, enc;
  before(async () => { e = await entorno(); pac = cliente(e.base); enc = cliente(e.base); await pac.entrar(DOC.ana); await enc.entrar(DOC.encargada); });
  after(() => e.cerrar());
  test('CP-0104-01 muestra documento, rol, nombres, apellidos, celular y la vereda del paciente', async () => {
    const p = (await pac.pedir('GET', '/perfil')).body;
    assert.equal(p.numeroDocumento, DOC.ana); assert.equal(p.rol, 'Paciente'); assert.ok(p.nombres && p.apellidos && p.celular && p.vereda);
    const q = (await enc.pedir('GET', '/perfil')).body;
    assert.equal(q.rol, 'Encargado'); assert.equal(q.vereda, undefined);
  });
  test('CP-0104-02 edita nombres, apellidos, celular y vereda; el documento y el rol no cambian', async () => {
    const r = await pac.pedir('PUT', '/perfil', { nombres: 'Ana María', apellidos: 'Gómez Ruiz', celular: '3209998877', vereda: 'La Esperanza', numeroDocumento: '1', rol: 'Encargado' });
    assert.equal(r.status, 200);
    assert.equal(r.body.perfil.numeroDocumento, DOC.ana); assert.equal(r.body.perfil.rol, 'Paciente'); assert.equal(r.body.perfil.vereda, 'La Esperanza');
  });
  test('CP-0104-03 rechaza un celular que no tiene 10 dígitos y no guarda', async () => {
    const r = await pac.pedir('PUT', '/perfil', { nombres: 'Ana', apellidos: 'Gómez', celular: '32099', vereda: 'El Carmen' });
    assert.equal(r.status, 400); assert.match(r.body.mensaje, /10 dígitos/);
    assert.equal((await pac.pedir('GET', '/perfil')).body.celular, '3209998877');
  });
  test('CP-0104-04 confirma "Los cambios se guardaron" y los datos nuevos se ven de inmediato', async () => {
    const r = await enc.pedir('PUT', '/perfil', { nombres: 'Luz Marina', apellidos: 'Pérez Díaz', celular: '3101112244' });
    assert.equal(r.body.mensaje, 'Los cambios se guardaron');
    assert.equal((await enc.pedir('GET', '/auth/yo')).body.apellidos, 'Pérez Díaz');
  });
});
