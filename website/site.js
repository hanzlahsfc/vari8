/* Vari8 product page — local interactions only.
   No dependencies, no network calls. Progressive enhancement:
   everything works without this file (all content stays visible). */
(function () {
  "use strict";

  document.documentElement.classList.add("js");

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ================= workflow demo ================= */

  var demo = document.querySelector("[data-demo]");
  if (demo) {
    var steps = Array.prototype.slice.call(demo.querySelectorAll(".demo-step"));
    var dots = Array.prototype.slice.call(demo.querySelectorAll(".demo-dot"));
    var toggle = demo.querySelector("[data-demo-toggle]");
    var replay = demo.querySelector("[data-demo-replay]");
    var status = demo.querySelector("[data-demo-status]");

    var STEP_MS = 3800;
    var current = 0;
    var playing = false;
    var inView = false;
    var timer = null;

    function showStep(index) {
      current = ((index % steps.length) + steps.length) % steps.length;
      steps.forEach(function (step, i) {
        step.classList.toggle("is-active", i === current);
      });
      dots.forEach(function (dot, i) {
        dot.classList.toggle("is-active", i === current);
        dot.setAttribute("aria-pressed", i === current ? "true" : "false");
      });
      if (status) {
        var caption = steps[current].querySelector("figcaption");
        status.textContent =
          "Step " +
          (current + 1) +
          " of " +
          steps.length +
          ": " +
          (caption ? caption.textContent.trim() : "");
      }
    }

    function stopTimer() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function startTimer() {
      stopTimer();
      if (playing && inView && !reducedMotion.matches && !document.hidden) {
        timer = setInterval(function () {
          showStep(current + 1);
        }, STEP_MS);
      }
    }

    function setPlaying(next) {
      playing = next;
      if (toggle) {
        toggle.textContent = playing ? "Pause" : "Play";
        toggle.setAttribute("aria-pressed", playing ? "true" : "false");
      }
      startTimer();
    }

    dots.forEach(function (dot) {
      dot.addEventListener("click", function () {
        showStep(Number(dot.getAttribute("data-goto")) || 0);
        startTimer(); // reset the clock so the new step gets a full slot
      });
    });

    if (toggle) {
      toggle.addEventListener("click", function () {
        setPlaying(!playing);
      });
    }
    if (replay) {
      replay.addEventListener("click", function () {
        showStep(0);
        setPlaying(true);
      });
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          inView = entries[0].isIntersecting;
          startTimer();
        },
        { threshold: 0.25 },
      ).observe(demo);
    } else {
      inView = true;
    }

    document.addEventListener("visibilitychange", startTimer);
    if (reducedMotion.addEventListener) {
      reducedMotion.addEventListener("change", startTimer);
    }

    // Autoplay only when motion is welcome; reduced-motion users get
    // manual control and a static first step.
    showStep(0);
    setPlaying(!reducedMotion.matches);
  }

  /* ================= feature showcase ================= */

  var showcase = document.querySelector("[data-showcase]");
  if (showcase) {
    var stageImg = showcase.querySelector("[data-showcase-img]");
    var stageTitle = showcase.querySelector("[data-showcase-title]");
    var stageText = showcase.querySelector("[data-showcase-text]");
    var tabs = Array.prototype.slice.call(
      showcase.querySelectorAll(".feature-tab"),
    );

    function selectTab(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.setAttribute("tabindex", on ? "0" : "-1");
      });
      if (stageImg) {
        stageImg.src = tab.getAttribute("data-img");
        stageImg.alt = tab.getAttribute("data-alt") || "";
      }
      if (stageTitle) stageTitle.textContent = tab.getAttribute("data-title");
      if (stageText) stageText.textContent = tab.getAttribute("data-text");
      if (focus) tab.focus();
    }

    tabs.forEach(function (tab, i) {
      tab.setAttribute(
        "tabindex",
        tab.classList.contains("is-active") ? "0" : "-1",
      );
      tab.addEventListener("click", function () {
        selectTab(tab, false);
      });
      tab.addEventListener("keydown", function (event) {
        var next = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          next = tabs[(i + 1) % tabs.length];
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          next = tabs[(i - 1 + tabs.length) % tabs.length];
        } else if (event.key === "Home") {
          next = tabs[0];
        } else if (event.key === "End") {
          next = tabs[tabs.length - 1];
        }
        if (next) {
          event.preventDefault();
          selectTab(next, true);
        }
      });
    });
  }
})();
