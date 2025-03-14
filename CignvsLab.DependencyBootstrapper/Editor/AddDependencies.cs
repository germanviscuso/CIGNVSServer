using System.IO;
using UnityEditor;
using UnityEngine;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using UnityEditor.Build;

namespace CignvsLab.Editor
{
    public static class AddDependencies
    {
        private static readonly Dictionary<string, string> dependenciesToAdd = new Dictionary<string, string>
        {
            { "com.endel.nativewebsocket", "https://github.com/endel/NativeWebSocket.git#upm" },
            { "jillejr.newtonsoft.json-for-unity", "https://github.com/jilleJr/Newtonsoft.Json-for-Unity.git#upm" },
            { "org.cignvslab", "https://github.com/germanviscuso/DharanaServer.git"}
        };

        [MenuItem("CignvsLab/Install")]
        public static void InstallDependencies()
        {
            string manifestPath = Path.Combine(Application.dataPath, "../Packages/manifest.json");

            if (!File.Exists(manifestPath))
            {
                Debug.LogError("❌ manifest.json not found!");
                return;
            }

            string json = File.ReadAllText(manifestPath);
            bool changed = false;

                        var match = Regex.Match(json, "\"dependencies\"\\s*:\\s*{([\\s\\S]*?)}");

            if (match.Success)
            {
                string dependenciesBlock = match.Groups[1].Value;
                foreach (var dep in dependenciesToAdd)
                {
                    if (!dependenciesBlock.Contains($"\"{dep.Key}\""))
                    {
                        // Add new dependency line before existing block content
                        dependenciesBlock = $"    \"{dep.Key}\": \"{dep.Value}\",\n{dependenciesBlock}";
                        Debug.Log($"📦 Added dependency: {dep.Key} → {dep.Value}");
                        changed = true;
                    }
                    else
                    {
                        Debug.Log($"✅ Dependency already exists: {dep.Key}");
                    }
                }

                // Replace the dependencies block inside the full JSON
                json = Regex.Replace(json, "\"dependencies\"\\s*:\\s*{([\\s\\S]*?)}", $"\"dependencies\": {{\n{dependenciesBlock}\n}}");
            }
            else
            {
                Debug.LogError("❌ Could not locate 'dependencies' block in manifest.json!");
                return;
            }

            if (changed)
            {
                File.WriteAllText(manifestPath, json);
                AssetDatabase.Refresh();
                Debug.Log("✅ Dependencies added to manifest. Unity will reload.");
            }
            else
            {
                Debug.Log("⚠️ All dependencies already present. No changes made.");
            }

            TrySelfDestruct(manifestPath);
            ForceDomainReload();
        }

        private static void TrySelfDestruct(string manifestPath)
        {
            string scriptPath = GetSelfPath();

            if (!string.IsNullOrEmpty(scriptPath) && File.Exists(scriptPath))
            {
                try
                {
                    File.Delete(scriptPath);
                    string metaPath = scriptPath + ".meta";
                    if (File.Exists(metaPath)) File.Delete(metaPath);

                    Debug.Log("🧹 Self-cleanup complete: Removed AddDependencies.cs after successful run.");
                }
                catch (IOException e)
                {
                    Debug.LogWarning($"⚠️ Could not delete AddDependencies.cs: {e.Message}");
                }
            }

            // 🧹 Remove bootstrapper from manifest (regex-based fallback cleanup)
            string manifestJson = File.ReadAllText(manifestPath);

            // Match any org.cignvslab.dependency-bootstrapper entry
            string pattern = "\\s*\"org\\.cignvslab\\.dependency-bootstrapper\"\\s*:\\s*\"[^\"]+\",?";
            string cleanedJson = Regex.Replace(manifestJson, pattern, "", RegexOptions.Multiline);

            if (!manifestJson.Equals(cleanedJson))
            {
                File.WriteAllText(manifestPath, cleanedJson);
                Debug.Log("🧹 Removed bootstrapper entry from manifest.json.");
                AssetDatabase.Refresh();
            }
        }

        private static string GetSelfPath()
        {
            string[] files = Directory.GetFiles(Application.dataPath, "AddDependencies.cs", SearchOption.AllDirectories);
            return files.Length > 0 ? files[0] : null;
        }

        // private static void ForceDomainReload()
        // {
        //     var buildTarget = NamedBuildTarget.FromBuildTargetGroup(EditorUserBuildSettings.selectedBuildTargetGroup);
        //     string defines = PlayerSettings.GetScriptingDefineSymbols(buildTarget);
        //     string magicToken = "CIGNVSLAB_FORCE_REFRESH";

        //     if (!defines.Contains(magicToken))
        //     {
        //         PlayerSettings.SetScriptingDefineSymbols(buildTarget, $"{defines};{magicToken}");
        //     }
        //     else
        //     {
        //         PlayerSettings.SetScriptingDefineSymbols(buildTarget, defines.Replace(magicToken, ""));
        //     }

        //     Debug.Log("🔁 Triggered domain reload using NamedBuildTarget API.");
        // }
        private static void ForceDomainReload()
        {
            AssetDatabase.ImportAsset("Packages/manifest.json", ImportAssetOptions.ForceUpdate);
            Debug.Log("🔁 Forced reimport of manifest.json.");

            EditorUtility.DisplayDialog(
                "Reload Required",
                "Dependencies were added successfully. Please restart Unity to apply all changes.",
                "OK"
            );
        }
    }
}
