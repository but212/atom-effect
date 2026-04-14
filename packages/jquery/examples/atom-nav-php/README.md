# $.atomNav PHP Example

A high-performance PJAX (Partial Page Loading) demonstration using PHP and `atom-effect-jquery`.

## Features

- **Smart Navigation**: Intercepts link clicks and button clicks to load content asynchronously.
- **SSR/PJAX Hybrid**: Automatically switches between full-page SSR and partial-page PJAX based on headers.
- **Reactive State**: Uses `nav.currentUrl` and `nav.isPending` atoms to update UI elements (loading bars, status chips).
- **SEO Ready**: Automatically synchronizes `document.title` and manages browser history.

## How to Run

1. **Prerequisites**:
   - A local PHP server (PHP 7.4+ recommended).
   - The library must be built (`npm run build`).

2. **Start Server**:
   For the best experience (to ensure relative CSS/JS paths are accessible), navigate to the `packages/jquery/examples` folder and run:

   ```bash
   php -S localhost:8000
   ```

3. **Access**:
   Open [http://localhost:8000/atom-nav-php/](http://localhost:8000/atom-nav-php/) in your browser.

## PHP Implementation Notes

The backend logic in `index.php` checks for a custom header:

```php
$isPjax = isset($_SERVER['HTTP_X_PJAX']) && $_SERVER['HTTP_X_PJAX'] === 'true';
```

If true, it only echoes the new `<title>` and page content. If false, it serves the entire HTML boilerplate.
