# FORM

FORM is an experimental browser app for turning photographs into layered exposure studies and composing them with text and shapes.

Use FIELD to arrange photographs and shape AFTERIMAGE effects along editable paths. Switch to FRAME to compose the same artwork on artboards, add layout guides, or make contact sheets. Save an editable `.form` project or export a PNG.

The current version is the 0.2.0 alpha. It runs locally in a desktop browser on your computer. There is no desktop installer, account, API key, or backend service to configure. Windows, macOS, and Linux setup uses the same npm commands. Browser and GPU behavior still needs testing across devices.

## Run on your computer

### 1. Install the requirements

Install [Node.js 24 LTS](https://nodejs.org/en/download), which includes npm. FORM requires Node.js 22.12.0 or newer. Use a current desktop browser with WebGL 2 and graphics acceleration enabled, such as Chrome or Edge.

After installing Node.js, open a new terminal. On Windows, use Command Prompt or PowerShell. On macOS or Linux, use Terminal. Check the installation:

```sh
node --version
npm --version
```

### 2. Download FORM

The `main` branch contains the runnable alpha and these setup instructions.

Without Git, [download the project ZIP](https://github.com/notlestat/FORM/archive/refs/heads/main.zip). Extract the ZIP, then open a terminal in the extracted folder that contains `package.json`.

On Windows, open that folder in File Explorer, type `cmd` in the address bar, and press Enter. On macOS or Linux, type `cd ` in Terminal, drag the extracted folder into the window, then press Enter.

If you already have [Git](https://git-scm.com/downloads), clone the repository instead:

```sh
git clone https://github.com/notlestat/FORM.git
cd FORM
```

### 3. Install and start

Run these commands in the folder containing `package.json`:

```sh
npm ci
npm run dev -- --port 5174 --strictPort
```

The first command downloads the dependencies. Keep the terminal open while you use FORM.

Open [http://127.0.0.1:5174/](http://127.0.0.1:5174/) in your browser. You should see FIELD with a sample marble-head photograph and an AFTERIMAGE output.

To stop FORM, press **Ctrl+C** in the terminal. To use it again, open a terminal in the same folder and run:

```sh
npm run dev -- --port 5174 --strictPort
```

You only need `npm ci` again after changing dependencies or downloading a different version. Internet access is needed to download the project and dependencies. Image processing and project storage happen locally in the browser; the app uses bundled fonts and a bundled sample photograph.

## Make and save a study

1. Try the sample first. Select its AFTERIMAGE output, then choose **Trajectory** to draw a path or move its handles.
2. To use your own image, choose **Place photograph** and select a JPEG or PNG. Select the photograph, then choose **Create AFTERIMAGE**.
3. Choose **Selection** to control which part of the photograph contributes to the effect. Choose an ellipse, paint a selection, draw a closed boundary, or import a luminance mask.
4. Move, resize, or rotate the artwork. Use **Linked copy** to repeat the same output or **Vary** to make an independently editable version.
5. Switch to **FRAME**. Choose **Place material** → **Artboard**, then add text, rectangles, or ellipses from the same menu. Select the artboard to set its dimensions and guides.
6. Choose **Save** to download an editable `.form` project. Use **Open** to load it later, including on another computer running this alpha.
7. Choose **Export PNG** for a composition, or select a FRAME artboard and choose **Export artboard** for an image at its exact dimensions. Check each artwork's **In export** setting to control what appears.

Photographs must fit within 4096 pixels per edge and 16 megapixels. FIELD supports PNG export with a 2K or 4K long edge. FRAME artboards support dimensions up to 8192 pixels per edge. Exports are raster images; editable text and shapes remain in the `.form` project.

### Keep a portable copy

A `.form` file embeds the original photographs and editable project settings. Save one to a folder you can find again. PNG export saves an image, not an editable project.

FORM also stores a recovery snapshot in the browser after edits settle and offers an earlier snapshot on startup. Browser storage can be cleared and is not a backup. Use the same browser and local address for recovery; another browser, port, or private browsing session uses separate storage.

This alpha saves project format 4 and reads formats 1 through 4. Older builds cannot open format 4. The [legacy study](http://127.0.0.1:5174/?legacy=1) is available separately and saves version 2 files.

### Use the canvas controls

- Hold **Space** and drag to pan. Scroll to pan, or pinch to zoom. Hold **Ctrl** on Windows or Linux, or **Command** on macOS, while scrolling to zoom.
- Press **F** to fit the selection in view.
- **Shift-click** artwork to select several items. Alignment controls appear in the inspector; spacing controls appear with three or more selected artworks.
- Hold **Shift** while dragging a size handle to preserve proportions.
- Use **Ctrl+Z** to undo and **Ctrl+Y** or **Ctrl+Shift+Z** to redo on Windows or Linux. On macOS, use **Command+Z** and **Command+Shift+Z**.
- Press **Delete** or **Backspace** to remove the selection. Press **Escape** to cancel a gesture. Text fields keep their normal editing behavior.

## Fix setup problems

- If `node` or `npm` is not recognized, install Node.js and open a new terminal.
- If npm reports a missing `package.json`, open the terminal in the extracted project folder. Check that the ZIP is extracted and that you are inside the folder containing `package.json`.
- If PowerShell blocks `npm.ps1`, use Command Prompt, or run `npm.cmd` in place of `npm`.
- If port 5174 is in use, stop an earlier FORM server or run `npm run dev -- --port 5175 --strictPort`. Open the address printed in the terminal. Recovery from port 5174 is separate.
- If the canvas fails to render or reports a WebGL error, enable graphics acceleration in your browser, restart it, and update your graphics driver. Try another browser with WebGL 2 support. A successful build does not establish GPU compatibility.
- If an image is rejected, convert it to JPEG or PNG and resize it within the limits above.
- If opening `index.html` directly does not work, start the local server with `npm run dev` and use its HTTP address.

## Build and check the project

To build the app and serve the built files locally:

```sh
npm run build
npm run preview -- --port 4173 --strictPort
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/). The build writes files to `dist/`. The preview server listens on your computer's loopback address. Its separate port also means separate recovery storage.

To run the automated CPU tests:

```sh
npm test
```

These tests cover project files, editing commands, geometry, and instrument definitions. They do not verify browser rendering, visual quality, or recovery after restarting a browser.

## Project status and further reading

FORM is an alpha with unfinished visual, interaction, recovery, and device acceptance checks. Native desktop apps, LIVE, camera and screen capture, TouchDesigner integration, additional instruments, and vector export remain future work.

- [Alpha scope and manual test guide](docs/FIRST_ALPHA.md)
- [Architecture](docs/ARCHITECTURE.md) and [design system](docs/DESIGN_SYSTEM.md)
- [Product vision](docs/PRODUCT_VISION.md) and [roadmap](docs/ROADMAP.md)
- [Project file history](docs/PROJECT_FILES.md) and [editing commands](docs/COMMANDS.md)
- [Development and pull request workflow](docs/GITHUB.md)
- [Sample photograph provenance](public/fixtures/README.md) and [Archivo font license](public/Archivo-OFL.txt)

Some linked documents describe earlier milestones. The alpha scope guide records the current implementation. Pull requests target `main` and require review and explicit approval before merging.
