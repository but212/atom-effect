<?php
$isPjax = ($_SERVER['HTTP_X_PJAX'] ?? '') === 'true';
$page = $_GET['page'] ?? 'home';

$pages = [
    'home' => [
        'title' => 'HOME / DASHBOARD',
        'header_title' => 'DASHBOARD',
        'path' => '/index.php',
    ],
    'features' => [
        'title' => 'FEATURES / LOGIC',
        'header_title' => 'FEATURES',
        'path' => '/index.php?page=features',
    ],
    'about' => [
        'title' => 'ABOUT / SYSTEM',
        'header_title' => 'ABOUT',
        'path' => '/index.php?page=about',
    ],
];

$navItems = [
    'home' => [
        'label' => 'Dashboard',
        'href' => 'index.php',
    ],
    'features' => [
        'label' => 'Features',
        'href' => '?page=features',
    ],
    'about' => [
        'label' => 'About',
        'href' => '?page=about',
    ],
];

if (!isset($pages[$page])) {
    $page = 'home';
}

$current = $pages[$page];

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function statCard(string $value, string $label, string $borderColor = 'var(--black)'): void
{
    ?>
    <article class="stat-card" style="border-color: <?= e($borderColor) ?>">
        <div class="stat-value"><?= e($value) ?></div>
        <div class="stat-label"><?= e($label) ?></div>
    </article>
    <?php
}

function infoCard(string $title, string $body, string $class = ''): void
{
    ?>
    <article class="card <?= e($class) ?>">
        <h2 class="card-title"><?= e($title) ?></h2>
        <p class="card-body-mono"><?= e($body) ?></p>
    </article>
    <?php
}

function taskItem(string $title, string $tag, bool $checked = true): void
{
    ?>
    <div class="task-item">
        <div class="checkbox-rect <?= $checked ? 'checked' : '' ?>"></div>
        <span class="task-title"><?= e($title) ?></span>
        <span class="task-tag"><?= e($tag) ?></span>
    </div>
    <?php
}

function renderPageContent(string $page): void
{
    switch ($page) {
        case 'about':
            ?>
            <section aria-labelledby="about-heading">
                <div class="stats-grid">
                    <?php statCard('MEM', 'SAFETY / LEAK_PREVENTION', 'var(--primary-blue)'); ?>
                    <?php statCard('PJAX', 'PROTOCOL / OPTIMIZED', 'var(--primary-red)'); ?>
                </div>

                <?php
                infoCard(
                    'Architecture',
                    'THE SYSTEM IS BUILT ON REACTIVE ATOMS. BY DECOUPLING THE NAVIGATION STATE FROM THE DOM, WE ACHIEVE PURE RECONCILIATION.',
                    'card-red'
                );
                ?>
            </section>
            <?php
            break;

        case 'features':
            ?>
            <section aria-labelledby="features-heading">
                <div class="task-list">
                    <?php taskItem('Title Synchronization', 'CORE'); ?>
                    <?php taskItem('Scroll Restoration', 'UX'); ?>
                    <?php taskItem('Memory Clearance', 'SYSTEM'); ?>
                </div>
            </section>
            <?php
            break;

        case 'home':
        default:
            ?>
            <section aria-labelledby="dashboard-heading">
                <div class="stats-grid">
                    <?php statCard('0.2s', 'SYNC / SPEED'); ?>
                    <?php statCard('CORE', 'STABLE / VERSION', 'var(--primary-blue)'); ?>
                </div>

                <article class="card card-blue">
                    <h2 class="card-title">Fundamental Reactivity</h2>
                    <p class="card-body-mono">
                        ATOM-EFFECT-JQUERY IS NOT A FRAMEWORK. IT IS A BRIDGE.
                        EXPERIENCE SEAMLESS PHP NAVIGATION.
                    </p>
                    <button class="btn-black" data-nav href="?page=features">EXPLORE_EXTERN()</button>
                </article>
            </section>
            <?php
            break;
    }
}

function renderFragment(string $page, array $current): void
{
    ?>
    <div data-page-title="<?= e($current['header_title']) ?>" data-doc-title="<?= e('AEJ / ' . $current['title']) ?>"
        data-current-path="<?= e($current['path']) ?>">
        <?php renderPageContent($page); ?>
    </div>
    <?php
}
?>

<?php if ($isPjax): ?>
    <title><?= e('AEJ / ' . $current['title']) ?></title>
    <?php renderFragment($page, $current); ?>
    <?php exit; ?>
<?php endif; ?>

<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><?= e('AEJ / ' . $current['title']) ?></title>

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&family=Inter:ital,wght@0,100..900;1,100..900&display=swap"
        rel="stylesheet" />
    <link rel="stylesheet" href="../styles.css" />

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
                <?php foreach ($navItems as $key => $item): ?>
                    <li class="nav-item">
                        <a class="nav-link <?= $key === $page ? 'active' : '' ?>" href="<?= e($item['href']) ?>" data-nav>
                            <?= e($item['label']) ?>
                        </a>
                    </li>
                <?php endforeach; ?>
            </ul>
        </nav>
    </aside>

    <div class="main-container">
        <header>
            <h1 id="page-title"><?= e($current['header_title']) ?></h1>
            <div id="status-chip" style="font-family: var(--font-mono); font-weight: 700; font-size: 0.75rem;">
                URL: <span id="current-path"><?= e($current['path']) ?></span>
            </div>
        </header>

        <div class="view-content">
            <main id="app-root">
                <?php renderFragment($page, $current); ?>
            </main>
        </div>
    </div>

    <script src="https://code.jquery.com/jquery-4.0.0.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.33.1/dist/atom-effect-jquery.min.js"></script>
    <script src="app.js"></script>
</body>

</html>