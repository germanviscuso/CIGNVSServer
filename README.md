# Cignvs Lab Core Unity Package

A set of tools for Cignvs Lab projects interfacing with Unity including a communications server.

## Importing to Unity
### Method 1 (add 1 repo)
Add package in Unity package manager via git url:
- https://github.com/germanviscuso/DharanaServer.git?path=CignvsLab.DependencyBootstrapper
- Go to CignvsLab in Editor and click "Install"
- Reload Unity
- If you want the Samples and Scripts (demos) locate Cignus package in Package manager and install them

### Method 2 (add 3 repos)
Add packages in Unity package manager via git url.
#### Dependencies
- https://github.com/endel/NativeWebSocket.git#upm
- https://github.com/jilleJr/Newtonsoft.Json-for-Unity.git#upm
#### Cignvs package
- https://github.com/germanviscuso/DharanaServer.git (latest, unstable)

If you want a specific version you can append the release number in the end:
- https://github.com/germanviscuso/DharanaServer.git#v1.0.4 (stable)