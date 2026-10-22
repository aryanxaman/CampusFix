# VS Code freezing — 22 October 2026

Windows had approximately 440 MB of available committed memory against a roughly 16 GB limit, with no active paging file and automatic pagefile management disabled. Java logs reported failed native allocations. One crash was the Java editor service with a 2 GB heap; another was Tomcat with a 192 MB heap. VS Code logs also recorded an unresponsive window and a shared-process crash.

Project mitigations: Java editor heap capped at 512 MB, lightweight Java mode, automatic Java builds disabled, single concurrent build and duplicate folder-view watchers excluded. The workspace now has a single root, avoiding overlapping roots for the same source. Frontend, Backend and Tests folder views are retained.

Lightweight mode provides source navigation and syntax support but omits full dependency-aware analysis and editor debugging. Maven builds/tests and `npm run dev` still operate independently.

## Windows virtual memory

1. Press Win+R, enter `sysdm.cpl`, then press Enter.
2. Advanced → Performance Settings → Advanced.
3. Under Virtual memory, click Change.
4. Enable Automatically manage paging file size for all drives.
5. Confirm and restart Windows when prompted, after saving your work.

This system setting was diagnosed but not changed automatically. Project settings cannot guarantee stability while the entire system is near its commit limit.

Sources: https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/introduction-to-the-page-file and https://code.visualstudio.com/docs/java/java-project#_lightweight-mode
