using System;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using NativeWebSocket;
using Newtonsoft.Json;
using UnityEngine.XR.Interaction.Toolkit.Interactables;
using UnityEngine.XR.Interaction.Toolkit;

public class WS_XRGrabListener : MonoBehaviour
{
    private XRGrabInteractable grabbable;
    private CommsManager wsManager;

    private void Awake()
    {
        grabbable = GetComponent<XRGrabInteractable>();
        wsManager = FindObjectOfType<CommsManager>(); // Buscar el WebSocketManager en la escena

        if (grabbable != null)
        {
            grabbable.selectEntered.AddListener(OnGrab);
            grabbable.selectExited.AddListener(OnRelease);
        }
        else
        {
            Debug.LogWarning("⚠️ No XRGrabInteractable found on this GameObject.");
        }

        if (wsManager == null)
        {
            Debug.LogError("❌ WebSocketManager not found in the scene!");
        }
    }

    private void OnGrab(SelectEnterEventArgs arg)
    {
        SendMessageToServer("🟢 Sphere grabbed!", true);
    }

    private void OnRelease(SelectExitEventArgs arg)
    {
        SendMessageToServer("🔴 Sphere released!", true);
    }

    private void SendMessageToServer(string message, bool needsAck)
    {
        if (wsManager != null)
        {
            wsManager.SendMessageToServer("xr/grab", message, needsAck);
        }
        else
        {
            Debug.LogWarning("⚠️ WebSocketManager is null. Message not sent.");
        }
    }
}
