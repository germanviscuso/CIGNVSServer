# CignvsLab Server
Servidor de soporte de proyectos de Cignvs Lab

- Servidor bidireccional que utiliza websockets para envia y recibir mensajes con Unity (websockets, puerto 3000)
- Agrega MQTT para manejo de canales de comunicación en puerto 1883 (pub/sub)
- Funciona también como servidor de señalización de WebRTC con SimpleWebRTC

## Prerequisitos
- Node.js para correr el servidor en Samples~\Server (ver README allí)
  - Instalador para Windows: https://nodejs.org/es/download

## Uso
- Poner las gafas y el ordenador que correo el servidor en la misma Wifi
- En el directorio raiz hacer: `npm install && npm start` (copiar IP)
- Abrir proyecto de Unity e importar packages por git url:
  - https://github.com/endel/NativeWebSocket.git#upm
  - https://github.com/jilleJr/Newtonsoft.Json-for-Unity.git#upm
  - com.unity.webrtc@3.0.0-pre.8
  - https://github.com/FireDragonGameStudio/SimpleWebRTC.git?path=/Assets/SimpleWebRTC#upm
  - https://github.com/germanviscuso/DharanaServer.git (en Samples importar tambien Scripts y Prefabs)
- Ir a Samples y volcar prefab `CommsManager` al top level de la escena
- Luego en cualquier objeto se puede hacer por ejemplo:
  - https://gist.github.com/germanviscuso/d6d93f30427b7d3250cdb8e9870d9836

## Ventajas
- Permite hacer DEBUG remoto de lo que sucede en las gafas (Debug.Log también se direcciona al servidor)
- Manejos de mensajes genéricos json con pub/sub y persistencia local
- Sirve de servidor de señalización de WebRTC via web sockets
