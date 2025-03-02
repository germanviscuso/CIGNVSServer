using System;
using UnityEngine;
using Newtonsoft.Json;
using NativeWebSocket;

public class RemoteLogHandler : ILogHandler
{
    private ILogHandler defaultLogHandler = Debug.unityLogger.logHandler;
    private static WebSocket websocket;
    private static string debugChannel = "debug/logs"; // Canal MQTT de logs
    private static bool enableRemoteLogging = true;

    public static void Initialize(WebSocket ws)
    {
        websocket = ws;
        Debug.unityLogger.logHandler = new RemoteLogHandler();
    }

    public void LogFormat(LogType logType, UnityEngine.Object context, string format, params object[] args)
    {
        string message = string.Format(format, args);
        defaultLogHandler.LogFormat(logType, context, format, args);
        SendLogToServer($"[{logType}] {message}");
    }

    public void LogException(Exception exception, UnityEngine.Object context)
    {
        defaultLogHandler.LogException(exception, context);
        SendLogToServer($"[EXCEPTION] {exception.Message}\n{exception.StackTrace}");
    }

    private static async void SendLogToServer(string message)
    {
        if (enableRemoteLogging && websocket != null && websocket.State == WebSocketState.Open)
        {
            var jsonLogMessage = JsonConvert.SerializeObject(new
            {
                channel = debugChannel,
                message = message,
                needsAck = false
            });

            await websocket.SendText(jsonLogMessage);
        }
    }
}
