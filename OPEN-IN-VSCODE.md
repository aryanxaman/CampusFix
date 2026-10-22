# Open the updated CampusFix project

Open `CampusFix.code-workspace` in this folder using Visual Studio Code.

Use **File → Open Workspace from File** and select `CampusFix.code-workspace` to see the organized sidebar. Opening only the folder uses the normal folder view.

The sidebar folders point directly to the working source code:

- **Frontend**: JSP pages, JavaScript, CSS and images.
- **Backend**: Java servlets, services, DAOs and models.
- **Tests**: Java automated tests.
- **database**: database schema and migrations.
- **scripts**: build and startup tools.

The workspace shows these as Frontend, Backend, Database, Tests, Documentation, Build & Run, and CampusFix. Backend opens directly at the Java classes. CampusFix contains the root configuration, startup instructions, and local runtime/database files. The terminal starts in the CampusFix project root so `npm run dev` still works.

The latest visual design is in `Frontend/assets/premium.css`, loaded by `Frontend/WEB-INF/views/shell.jsp`. These are the same files under `src/main/webapp`; the sidebar folders are shortcuts, so edits apply to the actual project.

In the VS Code terminal, run:

```sh
npm run dev
```

Open http://127.0.0.1:8080/campusfix/ and press **Ctrl+F5** to refresh previously cached assets.

After editing source files while the backend is already running, use `npm restart` to build and deploy the changes. Existing database records and uploaded photos are preserved.
