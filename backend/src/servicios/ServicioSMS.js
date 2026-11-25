'use strict';
/**
 * ServicioSMS: adaptador hacia el proveedor externo de mensajes de texto (actor secundario).
 * Producción: API HTTPS del proveedor (SMS_API_URL + SMS_API_KEY).
 * Desarrollo/pruebas: modo simulado; los mensajes quedan en ServicioSMS.bandeja y en consola.
 * En modo simulado, los celulares que terminan en 0000 simulan una falla del proveedor.
 */
class ServicioSMS {
  static async enviar(celular, texto) {
    if (process.env.SMS_API_URL) {
      const r = await fetch(process.env.SMS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS_API_KEY}` },
        body: JSON.stringify({ to: '+57' + celular, text: texto }),
        signal: AbortSignal.timeout(10000),
      });
      return r.ok;
    }
    if (String(celular).endsWith('0000')) return false;
    ServicioSMS.bandeja.push({ celular, texto, fecha: new Date().toISOString() });
    if (process.env.NODE_ENV !== 'test') console.log(`[SMS simulado] ${celular}: ${texto}`);
    return true;
  }
}
ServicioSMS.bandeja = [];
module.exports = ServicioSMS;
