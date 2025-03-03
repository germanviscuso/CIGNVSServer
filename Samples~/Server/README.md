# DharanaServer
Servidor de soporte del proyecto Dharana

- Servidor básico bidireccional que utiliza websockets para envia y recibir mensajes con Unity\
- Sirve de esqueleto para comenzar el desarrollo del servidor Dharana
- No requiere librerias externas

## Uso
- Poner las gafas y el ordenador que correo el servidor en la misma Wifi
- En el directorio raiz hacer: `npm install && npm start` (copiar IP)
- Abrir proyecto de Unity, cliquear en la esfera y actualizar la IP en el ultimo script asociado
- Deployar app en las gafas (Build and Run)
- Coger la esfera (grab) y ver mensajes en el servidor

## Ventajas
- Permite hacer DEBUG remoto de lo que sucede en las gafas (Debug.Log se pierde en las gafas por lom que se puede redireccionar el debug log al servidor)

## TODO
- Agregar estructura de mensajes de más alto nivel
- Agregar persistencia
- Agregar funcinalidad de servidor de señalización (para Unity Render Streaming)