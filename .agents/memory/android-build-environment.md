---
name: Android builds on this Replit workspace
description: Environment-specific JVM, cache, and memory constraints for native Android release builds.
---

**Rule:** For this workspace's Expo/Android Gradle release builds, use OpenJDK 17 with `-XX:-UsePerfData` and `-XX:MaxMetaspaceSize=768m`, keep `GRADLE_USER_HOME` inside the workspace, and pause the Expo, web, and API workflows during native C++ compilation. Keep CMake parallelism low because Ninja may still launch multiple compiler processes despite a parallelism limit.

**Why:** GraalVM and JVM performance-data initialization caused SIGBUS failures, the default Gradle cache location hit a disk quota, and simultaneous app workflows plus native compilation exhausted available memory. A 384 MB Metaspace cap also caused `OutOfMemoryError: Metaspace` during release lint without a cgroup OOM; raising it to 768 MB let the cached release build finish.

**How to apply:** Set the JVM and workspace cache before `assembleRelease`, stop nonessential managed workflows until Gradle exits, then restart them and verify their logs.

Remove regenerable native compiler intermediates before publishing hosted services, including those under pnpm dependency packages. Preserve native source, JavaScript runtime files, and the downloadable APK.

**Why:** Native Gradle builds leave very large shared libraries inside dependency directories; a subsequent publish passed all compilation steps but failed streaming one of these files into the deployment image.

**How to apply:** Treat native intermediates as disposable caches. After another APK build, ensure the hosted deployment cleanup still runs; package-size failures after successful compilation are not necessarily application startup or database failures.

Exclude workspace Gradle user-home caches and general tool caches from hosted deployment images, not only native compiler intermediates. Preserve runtime dependencies and generated mobile bundles required by serving processes.

**Why:** A hosted publish completed compilation but exceeded the 8 GiB container-layer limit because local native/tool caches were packaged; the emoji image assets were small and were not the cause.

**How to apply:** Check deployment logs before treating an “image size” failure as a picture-size problem. Keep native build caches available locally but outside the published image.
