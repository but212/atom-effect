/**
 * AEJ All Examples
 */
$(() => {
    const $loader = $("#loader");
    const $pathChip = $("#current-path");
    const $pageTitle = $("#page-title");

    // Page Scripts Registry
    const pageScripts = {};
    let currentPageCleanup = null;

    // --- BASIC COUNTER ---
    pageScripts['basic'] = () => {
        const count = $.atom(0);
        const doubled = $.computed(() => count.value * 2);
        const parity = $.computed(() => (count.value % 2 === 0 ? "EVEN" : "ODD"));

        $("#count").atomText(count);
        $("#doubled").atomText(doubled);
        $("#parity").atomText(parity);

        $("#increment").on("click", () => count.value++);
        $("#decrement").on("click", () => count.value--);
    };

    // --- ASYNC COMPUTED ---
    pageScripts['async'] = () => {
        const searchCount = $.atom(0);
        const debouncedQuery = $.atom("");
        let debounceTimer = null;

        const searchResults = $.computed(
            async () => {
                const query = debouncedQuery.value;
                if (!query || query.trim().length < 2) return [];

                const response = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=5`);
                if (!response.ok) throw new Error(`API Error: ${response.status}`);

                const data = await response.json();
                return data.items || [];
            },
            { defaultValue: [] },
        );

        const resultCount = $.computed(() => searchResults.value.length);
        const statusInfo = $.computed(() => {
            const state = searchResults.state;
            const query = debouncedQuery.value;

            switch (state) {
                case "idle": return { text: "IDLE", class: "status-idle", showSpinner: false };
                case "pending": return { text: `SEARCHING...`, class: "status-pending", showSpinner: true };
                case "resolved": {
                    const count = searchResults.value.length;
                    return { text: count > 0 ? `${count} ITEMS FOUND` : "NO RESULTS", class: "status-resolved", showSpinner: false };
                }
                case "rejected": return { text: "SYSTEM ERROR", class: "status-rejected", showSpinner: false };
                default: return { text: "UNKNOWN", class: "status-idle", showSpinner: false };
            }
        });

        $("#search-count").atomText(searchCount);
        $("#current-state").atomText($.computed(() => searchResults.state.toUpperCase()));
        $("#result-count").atomText(resultCount);

        $.effect(() => {
            const status = statusInfo.value;
            const $el = $("#status-indicator");
            $el.attr("class", `status ${status.class}`);
            if (status.showSpinner) {
                $el.html('<div class="spinner"></div> ' + status.text);
            } else {
                $el.text(status.text);
            }
        });

        $.effect(() => {
            const results = searchResults.value;
            const state = searchResults.state;
            const query = debouncedQuery.value;
            const $container = $("#results-container");

            if (state === "pending" && results.length > 0) {
                $container.css("opacity", "0.5");
                return;
            }

            $container.css("opacity", "1");

            if (!query || query.length < 2) {
                $container.html(`<div class="empty-state">SEARCH KEYWORD REQUIRED</div>`);
                return;
            }

            if (searchResults.hasError) {
                const error = searchResults.lastError;
                const isRateLimit = error?.message?.includes("403");
                const msg = isRateLimit ? "OVERLOAD: GITHUB API RATE LIMIT EXCEEDED." : "FAILURE: " + (error?.message || "UNKNOWN");
                const $errorDiv = $('<div class="error-message" style="color: var(--primary-red); font-weight: 900;"></div>').text(msg);
                $container.empty().append($errorDiv);
                return;
            }

            if (results.length === 0 && state === "resolved") {
                const $emptyDiv = $('<div class="empty-state"></div>').text("NO MATCHES FOUND FOR \"" + query.toUpperCase() + "\"");
                $container.empty().append($emptyDiv);
                return;
            }

            const $userList = $('<div class="user-list"></div>');
            results.forEach(user => {
                const $userItem = $('<div class="user-item"></div>');
                const $avatar = $('<div class="user-avatar"></div>');
                const $img = $('<img>', {
                    src: user.avatar_url,
                    alt: user.login,
                    onerror: function() {
                        $(this).css('display', 'none');
                        $(this).parent().text(user.login ? user.login[0].toUpperCase() : '');
                    }
                });
                $avatar.append($img);

                const $info = $('<div class="user-info"></div>');
                const $name = $('<div class="user-name"></div>').text(user.login || '');

                let displayUrl = user.html_url || '';
                try {
                    const urlObj = new URL(user.html_url);
                    displayUrl = urlObj.hostname + urlObj.pathname;
                } catch (e) {}

                const $email = $('<div class="user-email"></div>');
                const $link = $('<a>', {
                    href: user.html_url,
                    target: '_blank'
                }).text(displayUrl);
                $email.append($link);

                $info.append($name, $email);
                $userItem.append($avatar, $info);
                $userList.append($userItem);
            });
            $container.empty().append($userList);
        });

        $.effect(() => {
            if (searchResults.state === "resolved") {
                $("#last-update").text(new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" }));
            }
        });

        $("#search-input").on("input", function () {
            const value = $(this).val();
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (value.trim().length >= 2) searchCount.value++;
                debouncedQuery.value = value;
            }, 500);
        });

        setTimeout(() => $("#search-input").focus(), 0);

        return () => {
            clearTimeout(debounceTimer);
        };
    };

    // --- FORM BINDING ---
    pageScripts['form-binding'] = () => {
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

        const formState = $.atom(JSON.parse(JSON.stringify(initialState)));
        const submitTrigger = $.atom(0);

        const submission = $.computed(async () => {
            const id = submitTrigger.value;
            if (id === 0) return null;
            await new Promise((resolve) => setTimeout(resolve, 1500));
            if (Math.random() > 0.7) throw new Error("DATABASE_TIMEOUT: Failed to persist changes.");
            return { success: true, timestamp: new Date().toISOString() };
        }, { defaultValue: null });

        $("#user-form").atomForm(formState);

        $.effect(() => {
            $("#json-preview").text(JSON.stringify(formState.value, null, 2));
        });

        $.effect(() => {
            const $status = $("#submission-status");
            const $content = $("#status-content");
            const $btn = $("#submitBtn");
            const state = submission.state;
            const error = submission.lastError;

            if (state === "idle") {
                $status.hide();
                $btn.prop("disabled", false).html("Save Profiles");
                return;
            }

            $status.show();

            if (state === "pending") {
                $btn.prop("disabled", true).html('<div class="spinner"></div> SAVING...');
                $content.html(`<div class="status status-pending">SYNCRONIZING WITH CLOUD...</div>`);
            } else if (state === "rejected") {
                $btn.prop("disabled", false).html("Retry Save");
                const $errorDiv = $('<div class="status status-rejected" style="color:var(--primary-red)"></div>').text("ERROR: " + error.message);
                $content.empty().append($errorDiv);
            } else if (state === "resolved") {
                const result = submission.value;
                if (!result) { $status.hide(); return; }
                $btn.prop("disabled", false).html("Save Profiles");
                $content.html(`<div class="status status-resolved">SUCCESS: Profile updated at ${result.timestamp.split("T")[1].split(".")[0]}</div>`);
                setTimeout(() => { if (submission.state === "resolved") submitTrigger.value = 0; }, 3000);
            }
        });

        $("#user-form").on("submit", (e) => {
            e.preventDefault();
            submitTrigger.value++;
        });

        let customFieldCount = 0;
        $("#addField").on("click", () => {
            customFieldCount++;
            const name = `extra.field${customFieldCount}`;
            $("#dynamic-container").append(`
                <div class="form-group dynamic-field">
                    <label class="form-label">Custom Field #${customFieldCount} (${name})</label>
                    <input type="text" name="${name}" placeholder="Type something..." />
                </div>
            `);
        });

        $("#resetForm").on("click", () => {
            formState.value = JSON.parse(JSON.stringify(initialState));
            $("#dynamic-container").empty();
            submitTrigger.value = 0;
            customFieldCount = 0;
        });
    };

    // --- MINIMALIST ---
    pageScripts['minimalist'] = () => {
        const count = $.atom(0);
        $("#min-count").atomText(count);
        $("#min-increment").on("click", () => count.value++);
    };

    // --- EDGE CASES ---
    pageScripts['edge-cases'] = () => {
        const text = $.atom("");
        const isChecked = $.atom(false);

        $("#edge-input").atomVal(text);
        $("#edge-length").atomText($.computed(() => text.value.length));
        $("#edge-upper").atomText($.computed(() => text.value.toUpperCase()));

        $("#edge-clear").on("click", () => { text.value = ""; });

        $("#edge-check").atomProp("checked", isChecked).on("change", function() {
            isChecked.value = $(this).is(":checked");
        });

        $("#edge-check-text").atomText($.computed(() => isChecked.value ? "ON" : "OFF"));
    };

    // --- ASYNC PROPAGATION ---
    pageScripts['async-prop'] = () => {
        const trigger = $.atom(0);

        const step1 = $.computed(async () => {
            if (trigger.value === 0) return "Idle";
            await new Promise(r => setTimeout(r, 800));
            return "Step 1 Done";
        }, { defaultValue: "Idle" });

        const step2 = $.computed(async () => {
            if (step1.state !== "resolved" || step1.value === "Idle") return "Waiting";
            await new Promise(r => setTimeout(r, 800));
            return "Step 2 Done";
        }, { defaultValue: "Idle" });

        const step3 = $.computed(async () => {
            if (step2.state !== "resolved" || step2.value === "Waiting" || step2.value === "Idle") return "Waiting";
            await new Promise(r => setTimeout(r, 800));
            return "All Done!";
        }, { defaultValue: "Idle" });

        const updateStatus = ($el, comp) => {
            $.effect(() => {
                const s = comp.state;
                if (s === "pending") {
                    $el.attr("class", "status status-pending").html('<div class="spinner"></div> Working...');
                } else if (s === "resolved") {
                    $el.attr("class", "status status-resolved").text(comp.value);
                } else if (s === "rejected") {
                    $el.attr("class", "status status-rejected").text("Error");
                } else {
                    $el.attr("class", "status status-idle").text(comp.value);
                }
            });
        };

        updateStatus($("#prop-step1"), step1);
        updateStatus($("#prop-step2"), step2);
        updateStatus($("#prop-step3"), step3);

        $("#prop-trigger").on("click", () => trigger.value++);
    };

    // --- INIT NAV ---
    const nav = $.atomNav({
        target: "#app-root",
        selector: "[data-nav]",
        onBeforeLoad: (_) => {
            $loader.css("width", "30%");
        },
        onMount: ($container, _) => {
            $loader.css("width", "100%");
            setTimeout(() => $loader.css("width", "0"), 300);

            $(".nav-link").removeClass("active");
            const search = window.location.search || "";
            let href = search ? search : "index.php";

            let $active = $(`.nav-link[href="${href}"]`);
            if ($active.length === 0) $active = $(`.nav-link[href="index.php"]`);
            $active.addClass("active");

            const rawTitle = document.title.split(" / ").pop() || "DASHBOARD";
            $pageTitle.text(rawTitle);

            // Clean up previous page logic
            if (currentPageCleanup) {
                currentPageCleanup();
                currentPageCleanup = null;
            }

            // Execute Page Specific Logic
            const pageId = $("#page-wrapper").attr("data-page");
            if (pageId && pageScripts[pageId]) {
                currentPageCleanup = pageScripts[pageId]();
            }

            $container
                .stop()
                .css({ opacity: 0, transform: "translateY(10px)" })
                .animate({ opacity: 1, transform: "translateY(0)" }, 300);
        },
    });

    $.effect(() => {
        $pathChip.text(nav.currentUrl.value);
    });

    $.effect(() => {
        $("#app-root").css("opacity", nav.isPending.value ? "0.4" : "1");
    });

    // Initial page logic load
    const initialPage = $("#page-wrapper").attr("data-page");
    if (initialPage && pageScripts[initialPage]) {
        currentPageCleanup = pageScripts[initialPage]();
    }
});
