---
name: Android builds on this Replit workspace
description: Environment-specific JVM, cache, and memory constraints for native Android release builds.
---

**Rule:** For this workspace's Expo/Android Gradle release builds, use OpenJDK 17 with `-XX:-UsePerfData` and `-XX:MaxMetaspaceSize=768m`, keep `GRADLE_USER_HOME` inside the workspace, and pause the Expo, web, and API workflows during native C++ compilation. Keep CMake parallelism low because Ninja may still launch multiple compiler processes despite a parallelism limit.

**Why:** GraalVM and JVM performance-data initialization caused SIGBUS failures, the default Gradle cache location hit a disk quota, and simultaneous app workflows plus native compilation exhausted available memory. A 384 MB Metaspace cap also caused `OutOfMemoryError: Metaspace` during release lint without a cgroup OOM; raising it to 768 MB let the cached release build finish.

**How to apply:** Set the JVM and workspace cache before `assembleRelease`, stop nonessential managed workflows until Gradle exits, then restart them and verify their logs.
