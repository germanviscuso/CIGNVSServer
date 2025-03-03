# CignvsLab Server
Servidor de soporte de proyectos de Cignvs Lab

- Servidor básico bidireccional que utiliza websockets para envia y recibir mensajes con Unity (puerto 3000)
- Sirve de esqueleto para comenzar el desarrollo del servidor Dharana
- Agrega MQTT para manejo de canales de comunicación en puerto 1883 (pub/sub)

## Uso
- Poner las gafas y el ordenador que correo el servidor en la misma Wifi
- En el directorio raiz hacer: `npm install && npm start` (copiar IP)
- Abrir proyecto de Unity e importar package por url:
-- https://github.com/germanviscuso/DharanaServer
- Ir a Samples y volcar prefab CommsManager al top level de la escena
- Luego en cualquier objeto se puede hacer:
-- TODO

## Ventajas
- Permite hacer DEBUG remoto de lo que sucede en las gafas (Debug.Log también se direcciona al servidor)
## TODO
- Agregar estructura de mensajes de más alto nivel
- Publicar capabilities (topicos, si persisten, si es bidireccional, etc)
- Agregar persistencia (eg SQLite)
- Agregar funcinalidad de servidor de señalización (para Unity Render Streaming)