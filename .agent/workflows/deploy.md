---
description: How to deploy the application to Firebase Hosting
---

1.  **Build the Project**:
    Run the build command to generate the production assets in the `dist` folder.
    ```bash
    npm run build
    ```
    *Note: If the build fails due to TypeScript errors (e.g., unused variables), fix them before proceeding.*

2.  **Deploy to Firebase**:
    Run the firebase deploy command to upload the `dist` folder to Firebase Hosting.
    ```bash
    firebase deploy
    ```

3.  **Verify**:
    Check the Hosting URL provided in the output (e.g., `https://recruitment-portal-7b629.web.app`) to ensure the changes are live.
