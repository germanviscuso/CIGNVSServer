namespace CignvsLab
{
    using System;
    using System.Diagnostics;
    using UnityEngine;
    using Newtonsoft.Json;

    public class RemoteLogHandler : ILogHandler
    {
        private RemoteLogHandler() { }
        private static RemoteLogHandler instance;
        private ILogHandler defaultLogHandler = UnityEngine.Debug.unityLogger.logHandler;
        private CommsManager commsManager;
        private static bool enableRemoteLogging = true;
        private static bool extendedLogging = false;
        private static string debugChannel = "debug";

        // Constants for truncation
        private const int MAX_MESSAGE_PART_LENGTH = 2048; // Max length for the main message part
        private const int MAX_STACK_TRACE_LENGTH = 4096; // Max length for the stack trace part
        private const string TRUNCATED_INDICATOR = " ...[truncated]";

        // Recursion guard
        [ThreadStatic] // Important for multi-threaded scenarios, though Unity main logging is single-threaded
        private static bool isSendingRemotely = false;


        public static void Initialize(CommsManager comms)
        {
            if (comms == null)
            {
                // Use default logger directly here to avoid initializing instance if comms is null
                UnityEngine.Debug.unityLogger.Log(LogType.Warning, "CommsManager instance is null for RemoteLogHandler. Remote logging will not be available.");
                return;
            }

            if (instance == null)
                instance = new RemoteLogHandler();

            enableRemoteLogging = comms.enableLogging;
            extendedLogging = comms.extendedLogs;
            debugChannel = string.IsNullOrEmpty(comms.loggingChannel) ? "debug" : comms.loggingChannel;
            
            instance.commsManager = comms;
            
            // Set this instance as the active log handler
            UnityEngine.Debug.unityLogger.logHandler = instance;
            
            // This log will now go through the instance's LogFormat method
            UnityEngine.Debug.Log($"Remote logging initialized. Extended: {extendedLogging}, Channel: {debugChannel}");
        }

        public static void SetLoggingEnabled(bool enabled)
        {
            enableRemoteLogging = enabled;
            // This log will go through the instance's LogFormat method
            UnityEngine.Debug.Log($"Remote logging set to: {enabled}");
        }

        public static void SetExtendedLogging(bool enabled)
        {
            extendedLogging = enabled;
            // This log will go through the instance's LogFormat method
            UnityEngine.Debug.Log($"Extended logging set to: {enabled}");
        }

        public void LogFormat(LogType logType, UnityEngine.Object context, string format, params object[] args)
        {
            // Pass to default logger first (e.g., Unity console)
            defaultLogHandler.LogFormat(logType, context, format, args);

            // Prevent recursive logging if this call originated from within SendLogToServer
            if (isSendingRemotely)
            {
                return;
            }

            if (!enableRemoteLogging || commsManager == null)
            {
                return; // Don't proceed if remote logging is off or not set up
            }

            string message = "";
            try
            {
                message = string.Format(format, args);
            }
            catch (Exception ex)
            {
                message = $"Error formatting log message: {format}. Details: {ex.Message}";
                // Log this formatting error locally without trying to send it remotely again immediately
                isSendingRemotely = true;
                defaultLogHandler.LogFormat(LogType.Error, context, message);
                isSendingRemotely = false;
                return; // Don't attempt to send a malformed original message
            }
            
            string timestamp = DateTime.Now.ToString("HH:mm:ss");
            string stackTrace = extendedLogging ? GetUnityFormattedStackTrace() : null; 
            string topic = GetLogTopic(logType);

            SendLogToServer(topic, message, stackTrace, timestamp, logType, context);
        }

        public void LogException(Exception exception, UnityEngine.Object context)
        {
            defaultLogHandler.LogException(exception, context);

            if (isSendingRemotely)
            {
                return;
            }

            if (!enableRemoteLogging || commsManager == null)
            {
                return;
            }

            string timestamp = DateTime.Now.ToString("HH:mm:ss");
            // Use exception.ToString() for a more comprehensive initial message, then truncate
            string message = $"[EXCEPTION] {exception}"; // This includes type, message, and inner exceptions + basic stack
            string stackTrace = extendedLogging ? GetUnityFormattedStackTrace(exception) : null; 
            string topic = debugChannel + "/exceptions";

            SendLogToServer(topic, message, stackTrace, timestamp, LogType.Exception, context);
        }

        private static string GetLogTopic(LogType logType)
        {
            switch (logType)
            {
                case LogType.Warning:
                    return debugChannel + "/warnings";
                case LogType.Error:
                case LogType.Assert: // Assertions are often treated as errors
                    return debugChannel + "/errors";
                default: // LogType.Log
                    return debugChannel + "/logs";
            }
        }

        private void SendLogToServer(string topic, string message, string stackTrace, string timestamp, LogType originalLogType, UnityEngine.Object originalContext)
        {
            if (isSendingRemotely) return; // Should be caught by callers, but as an extra safeguard.
            isSendingRemotely = true; // Set recursion guard

            try
            {
                // Truncate message if too long
                if (message != null && message.Length > MAX_MESSAGE_PART_LENGTH)
                {
                    message = message.Substring(0, MAX_MESSAGE_PART_LENGTH - TRUNCATED_INDICATOR.Length) + TRUNCATED_INDICATOR;
                }

                // Truncate stack trace if too long
                if (extendedLogging && stackTrace != null && stackTrace.Length > MAX_STACK_TRACE_LENGTH)
                {
                    stackTrace = stackTrace.Substring(0, MAX_STACK_TRACE_LENGTH - TRUNCATED_INDICATOR.Length) + TRUNCATED_INDICATOR;
                }
                
                var logEntry = new
                {
                    command = "debug_log", // This is the command for our Node.js server
                    message = message,
                    timestamp = timestamp, // Already a string from HH:mm:ss
                    stackTrace = extendedLogging ? stackTrace : null,
                    // Optionally add logType and context if our server needs them
                    // logType = originalLogType.ToString(), 
                    // context = originalContext ? originalContext.name : "null"
                };
                
                string jsonLogMessage = JsonConvert.SerializeObject(logEntry);

                // Final check on overall JSON length (optional, simpler to rely on part truncation first)
                // const int MAX_JSON_LENGTH = 8192; // Example
                // if (jsonLogMessage.Length > MAX_JSON_LENGTH) {
                //     // Handle overly large JSON - perhaps we could send a simplified "log too large" message
                //     var simplifiedEntry = new { command="debug_log", message="Log entry too large, original message truncated.", timestamp=timestamp, stackTrace="Truncated."};
                //     jsonLogMessage = JsonConvert.SerializeObject(simplifiedEntry);
                // }

                commsManager.LogToChannel(topic, jsonLogMessage);
            }
            catch (Exception ex)
            {
                // If sending itself fails, log to default Unity console ONLY (to prevent recursion)
                defaultLogHandler.LogFormat(LogType.Error, null, $"CRITICAL: Failed to send log to server. Error: {ex.Message}\nOriginal Log: Topic={topic}, Msg={message}");
            }
            finally
            {
                isSendingRemotely = false; // Release recursion guard
            }
        }

        private static string GetUnityFormattedStackTrace(Exception exception = null)
        {
            // Evaluate using Unity's StackTraceUtility.ExtractStringFromException instead.
            
            var st = exception != null ? new StackTrace(exception, true) : new StackTrace(true); // f_GetFrameInfo set to true for file/line info
            System.Text.StringBuilder sb = new System.Text.StringBuilder();

            for (int i = 0; i < st.FrameCount; i++)
            {
                StackFrame sf = st.GetFrame(i);
                var method = sf.GetMethod();
                if (method == null || method.DeclaringType == null) continue;

                // Skip frames from RemoteLogHandler itself to avoid noise, and some common system/unity ones
                if (method.DeclaringType == typeof(RemoteLogHandler) || 
                    method.DeclaringType.FullName.StartsWith("UnityEngine.Debug") ||
                    method.DeclaringType.FullName.StartsWith("System."))
                {
                    continue;
                }
                
                sb.Append(method.DeclaringType.FullName)
                  .Append(':')
                  .Append(method.Name)
                  .Append(" (");

                // Parameters - can be verbose, evaluate omitting or simplifying
                // ParameterInfo[] pis = method.GetParameters();
                // for (int j = 0; j < pis.Length; j++)
                // {
                //     sb.Append((j == 0 ? "" : ", ") + pis[j].ParameterType.Name + " " + pis[j].Name);
                // }
                sb.Append(")");

                string fileName = sf.GetFileName();
                if (!string.IsNullOrEmpty(fileName))
                {
                    // Try to make path relative to project if possible, or just use filename
                    fileName = fileName.Replace(Application.dataPath, "Assets"); 
                    sb.Append(" (at ")
                      .Append(fileName)
                      .Append(':')
                      .Append(sf.GetFileLineNumber())
                      .Append(')');
                }
                sb.AppendLine();

                // Limit the number of stack frames to prevent excessively long traces
                if (sb.Length > MAX_STACK_TRACE_LENGTH - 500 && i < st.FrameCount -1 ) { // -500 to leave room for truncation indicator & final lines
                    sb.AppendLine(TRUNCATED_INDICATOR + " (stack frame limit reached)");
                    break;
                }
            }
            return sb.ToString();
        }
    }
}