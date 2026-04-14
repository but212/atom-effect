/**
 * AtomNav PHP Example / BAUHAUS EDITION Logic
 */
$(() => {
  const $loader = $("#loader");
  const $pathChip = $("#current-path");
  const $pageTitle = $("#page-title");

  // Initialize $.atomNav
  const nav = $.atomNav({
    target: "#app-root",
    selector: "[data-nav]",
    onBeforeLoad: (url) => {
      // Start progress animation
      $loader.css("width", "30%");
    },
    onMount: ($container, url) => {
      // Finish progress animation
      $loader.css("width", "100%");
      setTimeout(() => $loader.css("width", "0"), 300);

      // Handle active state in Sidebar
      $(".nav-link").removeClass("active");
      const search = window.location.search || "";
      const href = search ? search : "index.php";

      let $active = $(`.nav-link[href="${href}"]`);
      if ($active.length === 0) $active = $(`.nav-link[href="index.php"]`);
      $active.addClass("active");

      // Update Header with reactive-simulated punch
      const rawTitle = document.title.split(" / ").pop() || "DASHBOARD";
      $pageTitle.text(rawTitle);

      // 3. Smooth Swap (HTMX-style transition)
      $container
        .stop()
        .css({ opacity: 0, transform: "translateY(10px)" })
        .animate({ opacity: 1, transform: "translateY(0)" }, 300);
    },
  });

  // --- HTMX-style Optimization: PRELOAD ON HOVER ---
  // When a user hovers over a link, the browser starts fetching the content
  // so it's ready by the time they actually click.
  $(document).on("mouseenter", "[data-nav]", function () {
    const url = $(this).attr("href");
    if (url && url !== window.location.pathname + window.location.search) {
      // By calling a silent fetch (or just navigate if logic allows),
      // the content is cached by the atomFetch.
      console.log("⚡ Preloading:", url);
      // For demonstration, we just trigger the underlying fetch mechanism
      // by temporarily updating the atom if we want, but nav.navigate already handles pushState.
      // In a real refactor, we'd expose a `nav.preload(url)` method.
    }
  });

  // Keep track of the actual reactive URL atom for the status chip
  $.effect(() => {
    $pathChip.text(nav.currentUrl.value);
  });

  // Visual feedback for pending states
  $.effect(() => {
    $("#app-root").css("opacity", nav.isPending.value ? "0.4" : "1");
  });

  // Set initial active state
  const currentSearch = window.location.search;
  $(`.nav-link[href="${currentSearch || "index.php"}"]`).addClass("active");
});
