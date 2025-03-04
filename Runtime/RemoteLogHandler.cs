namespace CignvsLab
{
    using System;
    using System.Diagnostics;
    using UnityEngine;
    using Newtonsoft.Json;
    using NativeWebSocket;
    using System.Linq;

    public class RemoteLogHandler : ILogHandler
    {
        private ILogHandler defaultLogHandler = UnityEngine.Debug.unityLogger.logHandler;
        private static WebSocket websocket;
        private static bool enableRemoteLogging = true;
        private static bool extendedLogging = false;

        public static void Initialize(WebSocket ws, bool enableLogging, bool useExtendedLogging)
        {
            if (ws == null)
            {
                UnityEngine.Debug.LogWarning("[RemoteLogHandler] WebSocket instance is null. CommsManager might be missing from the scene.");
                return;
            }
            websocket = ws;
            enableRemoteLogging = enableLogging;
            extendedLogging = useExtendedLogging;
            UnityEngine.Debug.unityLogger.logHandler = new RemoteLogHandler();
        }

        public static void SetLoggingEnabled(bool enabled)
        {
            enableRemoteLogging = enabled;
            UnityEngine.Debug.Log($"🔧 Remote logging set to: {enabled}");
        }

        public static void SetExtendedLogging(bool enabled)
        {
            extendedLogging = enabled;
            UnityEngine.Debug.Log($"🔧 Extended logging set to: {enabled}");
        }

        public void LogFormat(LogType logType, UnityEngine.Object context, string format, params object[] args)
        {
            string message = string.Format(format, args);
            string timestamp = DateTime.Now.ToString("HH:mm:ss");

            // ✅ Use correct Unity stack trace formatting
            string stackTrace = extendedLogging ? GetUnityFormattedStackTrace() : null; 

            defaultLogHandler.LogFormat(logType, context, format, args);

            string topic = GetLogTopic(logType);
            SendLogToServer(topic, message, stackTrace, timestamp);
        }

        public void LogException(Exception exception, UnityEngine.Object context)
        {
            string timestamp = DateTime.Now.ToString("HH:mm:ss");
            string message = $"[EXCEPTION] {exception.Message}";

            // ✅ Use correct Unity stack trace formatting
            string stackTrace = extendedLogging ? GetUnityFormattedStackTrace(exception) : null; 

            defaultLogHandler.LogException(exception, context);

            string topic = "debug/exceptions";
            SendLogToServer(topic, message, stackTrace, timestamp);
        }

        private static string GetLogTopic(LogType logType)
        {
            switch (logType)
            {
                case LogType.Warning:
                    return "debug/warnings";
                case LogType.Error:
                case LogType.Assert:
                    return "debug/errors";
                case LogType.Exception:
                    return "debug/exceptions";
                default:
                    return "debug/logs";
            }
        }

        private static async void SendLogToServer(string topic, string message, string stackTrace, string timestamp)
        {
            if (enableRemoteLogging && websocket != null && websocket.State == WebSocketState.Open)
            {
                var jsonLogMessage = JsonConvert.SerializeObject(new
                {
                    command = "debug_log",
                    channel = topic,
                    message = message,
                    timestamp = timestamp,
                    stackTrace = extendedLogging ? stackTrace : null 
                });

                await websocket.SendText(jsonLogMessage);
            }
        }

        /// <summary>
        /// ✅ Extracts a Unity-style stack trace with (at path/to/file.cs:XX) formatting.
        /// </summary>
        private static string GetUnityFormattedStackTrace(Exception exception = null)
        {
            var stackTrace = exception != null ? new StackTrace(exception, true) : new StackTrace(true);
            var frames = stackTrace.GetFrames();

            if (frames == null)
                return "No stack trace available.";

            System.Text.StringBuilder sb = new System.Text.StringBuilder();

            // ✅ Add Unity's DebugLogHandler at the top
            sb.AppendLine("UnityEngine.DebugLogHandler:LogFormat (UnityEngine.LogType,UnityEngine.Object,string,object[])");

            bool skipInternalMethods = true; // ✅ Skip GetUnityFormattedStackTrace itself
            foreach (var frame in frames)
            {
                string fullClassName = frame.GetMethod()?.DeclaringType?.FullName;  // ✅ Full namespace + class
                string methodName = frame.GetMethod()?.Name;
                string fileName = frame.GetFileName();
                int lineNumber = frame.GetFileLineNumber();

                // ✅ Ignore first stack entries until we reach relevant user code
                if (skipInternalMethods)
                {
                    if (!string.IsNullOrEmpty(fileName) && fileName.Contains("RemoteLogHandler.cs"))
                    {
                        skipInternalMethods = false; // ✅ Start logging real stack trace from this point
                    }
                    continue;
                }

                // ✅ Skip system and compiler-generated calls
                if (string.IsNullOrEmpty(fileName) || 
                    //fileName.Contains("mscorlib") || 
                    fileName.Contains("System.") || 
                    //fileName.Contains("bokken") || 
                    fullClassName?.StartsWith("System.") == true)
                    //fullClassName?.StartsWith("Microsoft.") == true || 
                    //fullClassName?.Contains("CompilerServices") == true || 
                    //fullClassName?.Contains("Threading.Tasks") == true)
                {
                    continue;
                }

                // ✅ Detect lambda or compiler-generated methods
                if (methodName.StartsWith("<"))
                {
                    methodName = methodName.Replace("<", "").Replace(">", "").Split('_')[0] + "_lambda";
                }

                // ✅ Format correctly: `Namespace.ClassName:MethodName`
                if (!string.IsNullOrEmpty(fullClassName))
                {
                    sb.AppendLine($"{fullClassName}:{methodName} (at {fileName}:{lineNumber})");
                }
            }

            return sb.Length > 0 ? sb.ToString().Trim() : "No relevant stack trace available.";
        }

    }
}
