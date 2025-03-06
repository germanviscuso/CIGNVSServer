using System;
using UnityEngine;
using Newtonsoft.Json;
using System.Collections;

namespace CignvsLab
{
    // Script to drop in Unity objects that want to do comms via CommsManager
    public class TestMessenger : MonoBehaviour
    {
        private CommsManager commsManager;
        private string testTopic = "test/topic";

        [Obsolete]
        void Start()
        {
            commsManager = FindObjectOfType<CommsManager>();

            if (commsManager == null)
            {
                Debug.LogError("❌ CommsManager not found in scene!");
                return;
            }

            // ✅ Subscribe immediately (CommsManager queues if not connected)
            commsManager.SubscribeToChannel(testTopic, OnMessageReceived);

            // ✅ Wait 3 seconds and then send a test message
            Invoke(nameof(SendTestMessage), 3f);
        }

        private void SendTestMessage()
        {
            string message = $"Hello from Unity! {DateTime.Now:HH:mm:ss}";
            Debug.Log($"📤 Sending test message: {message}");

            commsManager.PublishToChannel(testTopic, message);
        }

        private void OnMessageReceived(string message)
        {
            Debug.Log($"📩 Received test message echo: {message}");
        }
    }
}
