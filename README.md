# API REST – Videojuego por turnos

Express 5 + TypeScript (tsx) + Drizzle ORM + PostgreSQL + JWT.

## Puesta en marcha
```bash
npm install
cp .env.example .env          # edita DATABASE_URL y JWT_SECRET
npm run db:generate           # crea la migración SQL en ./drizzle
npm run db:migrate            # la aplica en PostgreSQL
npm run dev                   # http://localhost:3000
```
Todas las rutas (excepto `register`, `login` y `health`) requieren `Authorization: Bearer <token>`.

## Endpoints
| Método | Endpoint | Funcionalidad |
|---|---|---|
| POST | /api/register | Registrar usuario |
| POST | /api/login | Iniciar sesión (devuelve token) |
| GET | /api/players | Listar jugadores |
| GET | /api/players/{id} | Consultar información del jugador *(extra)* |
| PUT | /api/players/{id} | Actualizar perfil, solo el propio *(extra)* |
| GET | /api/players/{id}/statistics | Victorias, derrotas y % de victorias |
| GET | /api/characters | Mis personajes |
| POST | /api/characters | Crear personaje `{name, characterClass}` |
| PUT | /api/characters/{id} | Actualizar personaje `{name?, characterClass?}` |
| DELETE | /api/characters/{id} | Eliminar personaje |
| POST | /api/games | Crear partida `{characterId, opponentId?}` (opponentId = invitar) |
| GET | /api/games?status= | Mis partidas + partidas abiertas |
| GET | /api/games/{id} | Estado de la partida |
| POST | /api/games/{id}/join | Unirse `{characterId}` |
| POST | /api/games/{id}/actions | Acción `{action: attack\|defend\|special\|heal}` |
| GET | /api/games/{id}/history | Historial de acciones |
| POST | /api/games/{id}/cancel | Cancelar partida pendiente, solo el creador *(extra)* |
| POST | /api/games/{id}/finish | Finalizar partida en curso (rendirse, gana el rival) *(extra)* |

## Reglas implementadas
- Estados: `pendiente`, `en_curso`, `finalizada`, `cancelada`.
- Al unirse, empieza el personaje con mayor **velocidad** (empate: el creador).
- Solo actúa quien tiene el turno; tras cada acción válida el turno cambia.
- No actúa un personaje derrotado ni en una partida que no esté en curso.
- La vida nunca supera el máximo; con vida 0 el personaje queda derrotado y el servidor declara al ganador y actualiza victorias/derrotas.
- Un personaje no se puede editar ni borrar mientras esté en una partida pendiente o en curso.

## Combate
- **Atacar:** `max(1, ataque*2 - defensa_rival)`.
- **Defender:** el próximo daño recibido se reduce a la mitad.
- **Especial** (enfriamiento de 2 turnos): guerrero ignora 50% de la defensa (x1.3); mago hace x1.8; arquero golpea dos veces (x0.8 cada una).
- **Curar:** recupera 25% de la vida máxima (sin pasar del máximo).

## Clases (estadísticas base, +10% por nivel)
| Clase | Vida | Ataque | Defensa | Velocidad |
|---|---|---|---|---|
| guerrero | 120 | 14 | 10 | 6 |
| mago | 90 | 18 | 5 | 8 |
| arquero | 100 | 15 | 7 | 12 |

## Colección de Postman
Importa `postman/API-Videojuego-Turnos.postman_collection.json` en Postman y ejecútala con **Run collection** (API corriendo en `http://localhost:3000`). Guarda tokens e ids automáticamente, elige solo el token del jugador con el turno y trae 54 comprobaciones (casos válidos y de error).

## Prueba rápida (curl)
```bash
curl -X POST localhost:3000/api/register -H "Content-Type: application/json" \
  -d '{"username":"ana","email":"ana@x.com","password":"123456"}'
# guarda el token y úsalo:
curl -X POST localhost:3000/api/characters -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" -d '{"name":"Thor","characterClass":"guerrero"}'
```
