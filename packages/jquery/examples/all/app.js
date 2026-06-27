/**
 * AEJ All Examples
 */
$(() => {
  const $loader = $("#loader");
  const $pathChip = $("#current-path");
  const $pageTitle = $("#page-title");

  // Debug mode controller sync
  const debugEnabled = $.atom($.debug.enabled);
  $.effect(() => {
    $.debug.enabled = debugEnabled.value;
  });
  $("#debug-toggle").atomChecked(debugEnabled);

  // Page Scripts Registry
  const pageScripts = {};

  // --- BASIC COUNTER ---
  pageScripts["basic"] = () => {
    const count = $.atom(0);

    $("#count").atomText(count);
    $("#doubled").atomText(() => count.value * 2);
    $("#parity").atomText(() => (count.value % 2 === 0 ? "EVEN" : "ODD"));

    $("#increment").atomOn("click", () => count.value++);
    $("#decrement").atomOn("click", () => count.value--);
  };

  // --- ASYNC COMPUTED ---
  pageScripts["async"] = () => {
    const searchCount = $.atom(0);
    const debouncedQuery = $.atom("");

    const isQueryTooShort = $.computed(() => {
      const q = debouncedQuery.value.trim();
      return !q || q.length < 2;
    });

    // Use $.atomFetch for reactive network requests and cancellation
    const searchResults = $.atomFetch(
      () => {
        if (isQueryTooShort.value) {
          throw new Error("QUERY_TOO_SHORT");
        }
        return `https://api.github.com/search/users?q=${encodeURIComponent(debouncedQuery.value.trim())}&per_page=5`;
      },
      {
        defaultValue: [],
        transform: (data) => data.items || [],
        onError: (err) => {
          if (err.message === "QUERY_TOO_SHORT") return;
        },
      },
    );

    // Increment searchCount when debounced query is active and updated
    const effSearchCount = $.effect(() => {
      const q = debouncedQuery.value.trim();
      if (q.length >= 2) {
        searchCount.value = searchCount.peek() + 1;
      }
    });

    const placeholderText = $.computed(() => {
      if (isQueryTooShort.value) {
        return "SEARCH KEYWORD REQUIRED";
      }
      const { state, value, lastError } = searchResults;
      if (state === "resolved" && value.length === 0) {
        return `NO MATCHES FOUND FOR "${debouncedQuery.value.trim().toUpperCase()}"`;
      }
      if (state === "rejected") {
        if (lastError?.message?.includes("403")) {
          return "OVERLOAD: GITHUB API RATE LIMIT EXCEEDED.";
        }
        return "FAILURE: " + (lastError?.message || "UNKNOWN");
      }
      return "";
    });

    const uiState = $.computed(() => {
      if (isQueryTooShort.value) return "idle";
      return searchResults.state;
    });

    $("#search-count").atomText(searchCount);
    $("#current-state").atomText(() => uiState.value.toUpperCase());
    $("#result-count").atomText(() => searchResults.value.length);

    $("#status-indicator").atomBind({
      attr: {
        class: () => `status status-${uiState.value}`,
      },
      html: () => {
        const state = uiState.value;
        if (state === "pending")
          return '<div class="spinner"></div> SEARCHING...';
        if (state === "resolved") {
          const count = searchResults.value.length;
          return count > 0 ? `${count} ITEMS FOUND` : "NO RESULTS";
        }
        if (state === "rejected") return "SYSTEM ERROR";
        return "IDLE";
      },
    });

    $("#results-container").atomCss("opacity", () =>
      uiState.value === "pending" && searchResults.value.length > 0
        ? "0.5"
        : "1",
    );

    $("#search-placeholder")
      .atomText(placeholderText)
      .atomShow(() => placeholderText.value !== "");

    $("#results-list")
      .atomHide(() => placeholderText.value !== "")
      .atomList(searchResults, {
        key: "login",
        render: (user) => {
          const displayUrl = user.html_url
            ? user.html_url.replace(/^https?:\/\//, "")
            : "";
          return `
            <div class="user-item">
              <div class="user-avatar">
                <img src="${user.avatar_url}" alt="${user.login}" />
              </div>
              <div class="user-info">
                <div class="user-name">${user.login}</div>
                <div class="user-email">
                  <a href="${user.html_url}" target="_blank">${displayUrl}</a>
                </div>
              </div>
            </div>
          `;
        },
        bind: ($element, user) => {
          const initial = user.login ? user.login[0].toUpperCase() : "";
          $element.find("img").on("error", function () {
            $(this).hide();
            $(this).parent().text(initial);
          });
        },
      });

    const resolvedTime = $.atom("--:--");
    const effLastUpdate = $.effect(() => {
      if (uiState.value === "resolved") {
        resolvedTime.value = new Date().toLocaleTimeString([], {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    });
    const lastUpdate = $.computed(() => resolvedTime.value);

    $("#last-update").atomText(lastUpdate);

    $("#search-input").atomVal(debouncedQuery, { debounce: 500 });

    setTimeout(() => $("#search-input").focus(), 0);

    return () => {
      isQueryTooShort.dispose();
      searchResults.dispose();
      effSearchCount.dispose();
      effLastUpdate.dispose();
      placeholderText.dispose();
      uiState.dispose();
      lastUpdate.dispose();
    };
  };

  // --- FORM BINDING ---
  pageScripts["form-binding"] = () => {
    const initialState = {
      user: {
        firstName: "Jean",
        lastName: "Gravity",
        email: "jean.gravity@example.com",
        age: 28,
        role: "admin",
        bio: "Building the future of reactive jQuery interfaces.",
      },
      preferences: { theme: "dark", newsletter: true },
      extra: {},
    };

    const cloneState = () => ({
      user: { ...initialState.user },
      preferences: { ...initialState.preferences },
      extra: {},
    });

    const formState = $.atom(cloneState());
    const submitTrigger = $.atom(0);

    const submission = $.computed(
      async () => {
        const id = submitTrigger.value;
        if (id === 0) return null;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (Math.random() > 0.7)
          throw new Error("DATABASE_TIMEOUT: Failed to persist changes.");
        return { success: true, timestamp: new Date().toISOString() };
      },
      { defaultValue: null },
    );

    // Bind form with native constraint validation support
    $("#user-form").atomForm(formState, {
      validation: {
        "user.firstName": (v) =>
          v && v.trim().length >= 2
            ? true
            : "First name must be at least 2 characters",
        "user.email": (v) =>
          v && v.includes("@") ? true : "Please enter a valid email address",
        "user.age": (v) =>
          v >= 18 && v <= 100 ? true : "Age must be between 18 and 100",
      },
    });

    $("#json-preview").atomText(() => JSON.stringify(formState.value, null, 2));

    $("#submission-status").atomShow(() => {
      const state = submission.state;
      return state !== "idle" && (state !== "resolved" || !!submission.value);
    });

    $("#status-content").atomHtml(() => {
      const state = submission.state;
      if (state === "pending") {
        return '<div class="status status-pending">SYNCRONIZING WITH CLOUD...</div>';
      }
      if (state === "rejected") {
        const msg = submission.lastError?.message || "Unknown error";
        const escapedMsg = $("<div>").text(msg).html();
        return `<div class="status status-rejected" style="color:var(--primary-red)">ERROR: ${escapedMsg}</div>`;
      }
      if (state === "resolved") {
        const result = submission.value;
        if (!result) return "";
        const time = result.timestamp.split("T")[1].split(".")[0];
        return `<div class="status status-resolved">SUCCESS: Profile updated at ${time}</div>`;
      }
      return "";
    });

    $("#submitBtn").atomBind({
      prop: { disabled: () => submission.state === "pending" },
      html: () => {
        const state = submission.state;
        if (state === "pending") return '<div class="spinner"></div> SAVING...';
        if (state === "rejected") return "Retry Save";
        return "Save Profiles";
      },
    });

    $("#user-form").atomOn("submit", (e) => {
      e.preventDefault();
      submitTrigger.value++;
    });

    const effReset = $.effect(() => {
      if (submission.state === "resolved" && submission.value) {
        const timer = setTimeout(() => {
          if (submission.state === "resolved") {
            submitTrigger.value = 0;
          }
        }, 3000);
        return () => clearTimeout(timer);
      }
    });

    const customFields = $.atom([]); // Array of { id, name }

    $("#dynamic-container").atomList(customFields, {
      key: "id",
      render: (field) => `
        <div class="form-group dynamic-field">
          <label class="form-label">Custom Field #${field.id} (${field.name})</label>
          <input type="text" name="${field.name}" placeholder="Type something..." />
        </div>
      `,
    });

    $("#addField").atomOn("click", () => {
      const count = customFields.peek().length + 1;
      customFields.value = [
        ...customFields.peek(),
        { id: count, name: `extra.field${count}` },
      ];
    });

    $("#resetForm").atomOn("click", () => {
      formState.value = cloneState();
      customFields.value = [];
      submitTrigger.value = 0;
    });

    return () => {
      submission.dispose();
      effReset.dispose();
    };
  };

  // --- INIT NAV & PAGES ROUTING ---
  const PAGE_TITLES = {
    home: "DASHBOARD",
    basic: "BASIC",
    async: "ASYNC",
    "form-binding": "FORMS",
  };

  const nav = $.atomNav({
    target: "#app-root",
    selector: "[data-nav]",
    onMount: ($container, _) => {
      $container
        .stop()
        .css({ opacity: 0, transform: "translateY(10px)" })
        .animate({ opacity: 1, transform: "translateY(0)" }, 300);
    },
  });

  const currentPage = $.computed(() => {
    try {
      const url = new URL(nav.currentUrl.value, window.location.origin);
      return url.searchParams.get("page") || "home";
    } catch {
      return "home";
    }
  });

  // Bind active classes to sidebar links reactively
  $(".nav-link").each(function () {
    const $link = $(this);
    const href = $link.attr("href");
    const url = new URL(href, window.location.origin);
    const pageId = url.searchParams.get("page") || "home";
    $link.atomClass("active", () => currentPage.value === pageId);
  });

  // Bind header title and current path reactively
  $pageTitle.atomText(() => PAGE_TITLES[currentPage.value] || "DASHBOARD");
  $pathChip.atomText(nav.currentUrl);
  $("#app-root").atomCss("opacity", () => (nav.isPending.value ? "0.4" : "1"));

  // Standalone loader bar effect
  $.effect(() => {
    if (nav.isPending.value) {
      $loader.stop().css({ width: "30%", opacity: 1 });
    } else {
      $loader
        .stop()
        .css("width", "100%")
        .animate({ opacity: 0 }, 300, () => {
          $loader.css("width", "0%");
        });
    }
  });

  // Page lifecycle runner (replaces manual currentPageCleanup checks)
  $.effect(() => {
    const pageId = currentPage.value;
    if (pageScripts[pageId]) {
      return pageScripts[pageId]();
    }
  });
});
