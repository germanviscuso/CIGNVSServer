# CignvsLab Server
Servidor de soporte de proyectos de Cignvs Lab

- Servidor básico bidireccional que utiliza websockets para envia y recibir mensajes con Unity (puerto 3000)
- Sirve de esqueleto para comenzar el desarrollo del servidor Dharana
- Agrega MQTT para manejo de canales de comunicación en puerto 1883 (pub/sub)

## Prerequisitos
- Instalar el MQTT broker Mosquitto en donde corre el server (puerto default, 1883)
- En mosquitto.conf setear
-- allow_anonymous true

## Uso
- Poner las gafas y el ordenador que correo el servidor en la misma Wifi
- En el directorio raiz hacer: `npm install && npm start` (copiar IP)
- Abrir proyecto de Unity e importar package por url:
-- https://github.com/germanviscuso/DharanaServer
- Ir a Samples y volcar prefab CommsManager al top level de la escena
- Luego en cualquier objeto se puede hacer:
-- TODO

## Comando de mosquitto utiles (CLI)
- Instalar mosquitto (brew, Mac)
-- brew install mosquitto
- Correr mosquitto (brew, Mac)
-- brew services <start|stop|restart|status> mosquitto
- Config (brew, Mac)
-- /opt/homebrew/etc/mosquitto/mosquitto.conf
- Binario (brew, Mac)
-- /opt/homebrew/opt/mosquitto/sbin/mosquitto
- Publicar en un topic
-- mosquitto_pub -h localhost -t test/topic -m "Hello from CLI"
- Subscribir a y monitorear un topic
-- mosquitto_sub -h localhost -t test/topic -v
- Eliminar mensajes retenidos de un topic
-- mosquitto_pub -h localhost -t test/topic -m "" -r
- Desubscribir subscriptores a un topic
-- mosquitto_pub -h localhost -t "test/topic" -r -n
-- mosquitto_pub -h localhost -t "debug/logs" -r -n
- Verificar topics acticos/con subscriptores
-- mosquitto_sub -h localhost -t "#" -v
- Desconectar a todos los clientes
-- mosquitto_ctrl -h localhost disconnect all

## Ventajas
- Permite hacer DEBUG remoto de lo que sucede en las gafas (Debug.Log también se direcciona al servidor)

## TODO
- Agregar estructura de mensajes de más alto nivel
- Publicar capabilities (topicos, si persisten, si es bidireccional, etc)
- Agregar persistencia (eg SQLite)
- Agregar funcinalidad de servidor de señalización (para Unity Render Streaming)