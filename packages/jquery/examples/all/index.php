<?php
$isPjax = ($_SERVER['HTTP_X_PJAX'] ?? '') === 'true';
$page = $_GET['page'] ?? 'home';

$pages = [
    'home' => [
        'title' => 'HOME / DASHBOARD',
        'header_title' => 'DASHBOARD',
        'path' => '/index.php',
    ],
    'basic' => [
        'title' => 'BASIC COUNTER',
        'header_title' => 'BASIC',
        'path' => '/index.php?page=basic',
    ],
    'async' => [
        'title' => 'ASYNC COMPUTED',
        'header_title' => 'ASYNC',
        'path' => '/index.php?page=async',
    ],
    'form-binding' => [
        'title' => 'FORM BINDING',
        'header_title' => 'FORMS',
        'path' => '/index.php?page=form-binding',
    ],
];

$navItems = [
    'home' => ['label' => 'Dashboard', 'href' => 'index.php'],
    'basic' => ['label' => 'Basic Counter', 'href' => '?page=basic'],
    'async' => ['label' => 'Async Computed', 'href' => '?page=async'],
    'form-binding' => ['label' => 'Form Binding', 'href' => '?page=form-binding'],
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
    <article class="card <?= e($class) ?>" style="text-align: left;">
        <h2 class="card-title"><?= e($title) ?></h2>
        <p class="card-body-mono"><?= e($body) ?></p>
    </article>
    <?php
}

function renderPageContent(string $page): void
{
    switch ($page) {
        case 'basic':
            include 'pages/basic.php';
            break;
        case 'async':
            include 'pages/async.php';
            break;
        case 'form-binding':
            include 'pages/form-binding.php';
            break;
        case 'home':
        default:
    ?>
            <section aria-labelledby="dashboard-heading">
                <div class="stats-grid">
                    <?php statCard('ALL IN ONE', 'AEJ / EXAMPLES'); ?>
                    <?php statCard('CORE', 'STABLE / VERSION', 'var(--primary-blue)'); ?>
                </div>

                <article class="card card-blue" style="text-align: left;">
                    <h2 class="card-title">Fundamental Reactivity</h2>
                    <p class="card-body-mono">
                        ATOM-EFFECT-JQUERY IS NOT A FRAMEWORK. IT IS A BRIDGE.
                        EXPERIENCE SEAMLESS PHP NAVIGATION.
                    </p>
                    <a class="btn-black" data-nav href="?page=basic">EXPLORE BASIC COUNTER</a>
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
        data-current-path="<?= e($current['path']) ?>" id="page-wrapper" data-page="<?= e($page) ?>">
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
    <link rel="stylesheet" href="styles.css" />
</head>

<body>
    <div id="loader" class="loading-bar"></div>

    <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
            <div class="logo-text">AEJ<br>ALL</div>
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
            <div style="display: flex; align-items: center; gap: 20px;">
                <label style="font-family: var(--font-mono); font-weight: 700; font-size: 0.75rem; display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
                    <input type="checkbox" id="debug-toggle" style="width: 14px; height: 14px; accent-color: var(--primary-blue);" /> DEBUG MODE
                </label>
                <div id="status-chip" style="font-family: var(--font-mono); font-weight: 700; font-size: 0.75rem;">
                    URL: <span id="current-path"><?= e($current['path']) ?></span>
                </div>
            </div>
        </header>

        <div class="view-content">
            <main id="app-root">
                <?php renderFragment($page, $current); ?>
            </main>
        </div>
    </div>

    <script src="https://code.jquery.com/jquery-4.0.0.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@but212/atom-effect-jquery@0.34.0/dist/atom-effect-jquery.min.js"></script>
    <script src="app.js"></script>
</body>

</html>