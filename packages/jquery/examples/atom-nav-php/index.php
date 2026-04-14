<?php
/**
 * $.atomNav PHP Example / BAUHAUS EDITION
 * 
 * Features:
 * - Bauhaus Grid System
 * - X-PJAX Optimized Routing
 * - Robust Page Title Sync
 */

// 1. Detect PJAX Request
$isPjax = isset($_SERVER['HTTP_X_PJAX']) && $_SERVER['HTTP_X_PJAX'] === 'true';

// 2. Mock Routing Logic
$page = isset($_GET['page']) ? $_GET['page'] : 'home';
$content = "";
$title = "";

switch ($page) {
    case 'about':
        $title = "ABOUT / SYSTEM";
        $content = "
            <section aria-labelledby='about-heading'>
                <div class='stats-grid'>
                    <article class='stat-card' style='border-color: var(--primary-blue)'>
                        <div class='stat-value'>MEM</div>
                        <div class='stat-label'>SAFETY / LEAK_PREVENTION</div>
                    </article>
                    <article class='stat-card' style='border-color: var(--primary-red)'>
                        <div class='stat-value'>PJAX</div>
                        <div class='stat-label'>PROTOCOL / OPTIMIZED</div>
                    </article>
                </div>
                <article class='card card-red'>
                    <h2 class='card-title'>Architecture</h2>
                    <p class='card-body-mono'>
                        THE SYSTEM IS BUILT ON REACTIVE ATOMS. 
                        BY DECOUPLING THE NAVIGATION STATE FROM THE DOM, 
                        WE ACHIEVE PURE RECONCILIATION.
                    </p>
                </article>
            </section>";
        break;
    case 'features':
        $title = "FEATURES / LOGIC";
        $content = "
            <section aria-labelledby='features-heading'>
                <div class='task-list'>
                    <div class='task-item'>
                        <div class='checkbox-rect checked'></div>
                        <span class='task-title'>Title Synchronization</span>
                        <span class='task-tag'>CORE</span>
                    </div>
                    <div class='task-item'>
                        <div class='checkbox-rect checked'></div>
                        <span class='task-title'>Scroll Restoration</span>
                        <span class='task-tag'>UX</span>
                    </div>
                    <div class='task-item'>
                        <div class='checkbox-rect checked'></div>
                        <span class='task-title'>Memory Clearance</span>
                        <span class='task-tag'>SYSTEM</span>
                    </div>
                </div>
            </section>";
        break;
    default:
        $title = "HOME / DASHBOARD";
        $content = "
            <section aria-labelledby='dashboard-heading'>
                <div class='stats-grid'>
                    <article class='stat-card'>
                        <div class='stat-value'>0.2s</div>
                        <div class='stat-label'>SYNC / SPEED</div>
                    </article>
                    <article class='stat-card' style='border-color: var(--primary-blue)'>
                        <div class='stat-value'>CORE</div>
                        <div class='stat-label'>STABLE / VERSION</div>
                    </article>
                </div>
                <article class='card card-blue'>
                    <h2 class='card-title'>Fundamental Reactivity</h2>
                    <p class='card-body-mono'>
                        ATOM-EFFECT-JQUERY IS NOT A FRAMEWORK. IT IS A BRIDGE. 
                        EXPERIENCE SEAMLESS PHP NAVIGATION.
                    </p>
                    <button class='btn-black' data-nav href='?page=features'>EXPLORE_EXTERN()</button>
                </article>
            </section>";
        break;
}

// 3. Render Response
if ($isPjax): ?>
    <title>AEJ / <?php echo $title; ?></title>
    <?php echo $content; ?>
<?php else: ?>
    <!DOCTYPE html>
    <html lang="en">

    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AEJ / <?php echo $title; ?></title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
            href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&family=Inter:ital,wght@0,100..900;1,100..900&display=swap"
            rel="stylesheet" />
        <link rel="stylesheet" href="../styles.css">
        <style>
            :root {
                --primary-red: #e63946;
                --primary-blue: #2a52be;
                --primary-yellow: #ffd60a;
                --black: #000000;
                --white: #ffffff;
                --grey: #f0f0f0;
                --font-main: "Inter", sans-serif;
                --font-mono: "IBM Plex Mono", monospace;
                --border-width: 4px;
                /* Stronger Bauhaus border */
                --hard-shadow: 10px 10px 0px var(--black);
            }

            body {
                height: 100vh;
                overflow: hidden;
                display: flex;
                margin: 0;
                font-family: var(--font-main);
                background-color: var(--white);
                color: var(--black);
            }

            .sidebar {
                width: 320px;
                border-right: var(--border-width) solid var(--black);
                display: flex;
                flex-direction: column;
                background: var(--white);
                z-index: 100;
            }

            .sidebar-header {
                padding: 40px 24px;
                border-bottom: var(--border-width) solid var(--black);
                background: var(--primary-red);
                color: var(--white);
            }

            .logo-text {
                font-size: 2.5rem;
                font-weight: 900;
                letter-spacing: -2px;
                line-height: 0.8;
                text-transform: uppercase;
            }

            .nav-list {
                list-style: none;
                padding: 0;
                margin: 0;
            }

            .nav-item {
                border-bottom: var(--border-width) solid var(--black);
            }

            .nav-link {
                display: flex;
                align-items: center;
                padding: 24px;
                text-decoration: none;
                color: var(--black);
                font-weight: 900;
                text-transform: uppercase;
                font-size: 1.15rem;
                letter-spacing: -0.5px;
                transition: all 0.1s;
            }

            .nav-link:hover {
                background: var(--grey);
                padding-left: 32px;
            }

            .nav-link.active {
                background: var(--primary-blue);
                color: var(--white);
            }

            .main-container {
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            header {
                height: 120px;
                padding: 0 40px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: var(--border-width) solid var(--black);
            }

            #page-title {
                font-size: 3.5rem;
                font-weight: 900;
                letter-spacing: -4px;
                text-transform: uppercase;
                line-height: 1;
            }

            .view-content {
                flex: 1;
                padding: 60px;
                overflow-y: auto;
                background:
                    linear-gradient(90deg, var(--black) 1px, transparent 1px) 0 0 / 100px 100%,
                    linear-gradient(var(--black) 1px, transparent 1px) 0 0 / 100% 100px;
                background-color: var(--white);
            }

            .loading-bar {
                position: fixed;
                top: 0;
                left: 0;
                height: 6px;
                background: var(--primary-blue);
                width: 0;
                z-index: 1000;
                transition: width 0.3s cubic-bezier(0.19, 1, 0.22, 1);
            }

            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                gap: 40px;
                margin-bottom: 60px;
            }

            .stat-card {
                border: var(--border-width) solid var(--black);
                padding: 32px;
                background: var(--white);
                box-shadow: var(--hard-shadow);
            }

            .stat-value {
                font-size: 4.5rem;
                font-weight: 900;
                letter-spacing: -3px;
                line-height: 1;
                margin-bottom: 8px;
            }

            .stat-label {
                font-weight: 900;
                text-transform: uppercase;
                font-size: 0.9rem;
                background: var(--black);
                color: var(--white);
                display: inline-block;
                padding: 4px 12px;
            }

            .card {
                background: var(--white);
                border: var(--border-width) solid var(--black);
                padding: 40px;
                box-shadow: var(--hard-shadow);
                position: relative;
            }

            .card-blue {
                box-shadow: 12px 12px 0px var(--primary-blue);
            }

            .card-red {
                box-shadow: 12px 12px 0px var(--primary-red);
            }

            .card-title {
                font-weight: 900;
                text-transform: uppercase;
                font-size: 1.8rem;
                margin-bottom: 20px;
            }

            .card-body-mono {
                font-family: var(--font-mono);
                font-weight: 700;
                line-height: 1.6;
                max-width: 800px;
                text-transform: uppercase;
            }

            .btn-black {
                background: var(--black);
                color: var(--white);
                border: none;
                padding: 16px 32px;
                font-weight: 900;
                text-transform: uppercase;
                cursor: pointer;
                box-shadow: 6px 6px 0px var(--primary-blue);
                margin-top: 20px;
                transition: all 0.1s;
            }

            .btn-black:hover {
                transform: translate(-2px, -2px);
                box-shadow: 8px 8px 0px var(--primary-blue);
            }

            .btn-black:active {
                transform: translate(2px, 2px);
                box-shadow: 2px 2px 0px var(--black);
            }

            .task-list {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }

            .task-item {
                border: var(--border-width) solid var(--black);
                padding: 24px;
                display: flex;
                align-items: center;
                gap: 24px;
                background: var(--white);
                box-shadow: 6px 6px 0px var(--black);
            }

            .checkbox-rect {
                width: 36px;
                height: 36px;
                border: var(--border-width) solid var(--black);
                position: relative;
            }

            .checkbox-rect.checked::after {
                content: "";
                position: absolute;
                top: 6px;
                left: 6px;
                right: 6px;
                bottom: 6px;
                background: var(--primary-red);
            }

            .task-title {
                flex: 1;
                font-weight: 900;
                font-size: 1.3rem;
                text-transform: uppercase;
            }

            .task-tag {
                font-family: var(--font-mono);
                font-weight: 700;
                font-size: 0.85rem;
                padding: 6px 12px;
                border: 2px solid var(--black);
            }
        </style>
    </head>

    <body>
        <div id="loader" class="loading-bar"></div>

        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <div class="logo-text">AEJ<br>SYSTEM</div>
            </div>
            <nav>
                <ul class="nav-list">
                    <li class="nav-item"><a class="nav-link" href="index.php" data-nav>Dashboard</a></li>
                    <li class="nav-item"><a class="nav-link" href="?page=features" data-nav>Features</a></li>
                    <li class="nav-item"><a class="nav-link" href="?page=about" data-nav>About</a></li>
                </ul>
            </nav>
        </aside>

        <div class="main-container">
            <header>
                <h1 id="page-title">DASHBOARD</h1>
                <div id="status-chip" style="font-family: var(--font-mono); font-weight: 700; font-size: 0.75rem;">
                    URL: <span id="current-path">/index.php</span>
                </div>
            </header>

            <div class="view-content">
                <main id="app-root">
                    <?php echo $content; ?>
                </main>
            </div>
        </div>

        <!-- Dependencies -->
        <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.31.0"></script>
        <script src="app.js"></script>
    </body>

    </html>
<?php endif; ?>