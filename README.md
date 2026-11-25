# TurnoRural

Aplicación web para reservar turnos de atención médica en un puesto de salud rural.
Proyecto del curso de Ingeniería de Software, Universidad Distrital Francisco José de Caldas.

| Sprint | Módulo | Historias |
|---|---|---|
| 1 | Autenticación y perfiles | HU-0101 a HU-0105 |
| 2 | Gestión de turnos del paciente + crear cupos | HU-0201 a HU-0205, HU-0501, corrección HU-0105 |
| 3 | Panel del encargado | HU-0301 a HU-0305 |

## Estructura

```
backend/   API REST (Node.js 22 + Express). Capas: rutas -> control -> entidades -> datos/ConexionBD
frontend/  Páginas HTML5 + CSS + JavaScript (paciente/ y encargado/)
database/  Script de creación de la base de datos MySQL 8 (turnorural_db.sql)
docs/      Documento del parcial y diagramas
```

## Ejecutar en modo demostración (sin instalar MySQL)

Requiere Node.js 22.13 o superior.

```bash
cd backend
npm install
npm run demo        # SQLite en memoria con datos de prueba; abre http://localhost:3000
```

Usuarios de prueba (contraseña `Clave2026`):

| Rol | Documento |
|---|---|
| Encargada (Luz Marina Pérez) | 1010101010 |
| Pacientes | 1020304050, 1030405060, 1040506070, 1050607080, 1060708090 |

Código de autorización del puesto para registrar encargados: `CARMEN-2026`.
El paciente 1040506070 tiene un celular de prueba que simula una falla del proveedor de SMS.

## Ejecutar con MySQL 8

```bash
mysql -u root -p < database/turnorural_db.sql
cd backend
DB_HOST=localhost DB_USER=turnorural_app DB_PASSWORD=... SEMBRAR=1 npm start
```

Variables opcionales: `SMS_API_URL` y `SMS_API_KEY` (proveedor real de SMS; sin ellas el envío es simulado),
`PORT`, `RELOJ_DEMO` (fija la hora para demostraciones).

## Pruebas

```bash
cd backend
npm test            # 58 casos de prueba (Módulo 01, Sprint 2 y Sprint 3), uno o más por criterio de aceptación
```

Recuperar contraseña en la demostración: como el SMS es simulado, la pantalla muestra el código de 6 dígitos (en producción, con SMS_API_URL configurado, solo llega al celular).
