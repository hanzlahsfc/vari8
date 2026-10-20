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
    var scene = demo.querySelector("[data-scene]");
    var captions = Array.prototype.slice.call(
      demo.querySelectorAll(".demo-caption"),
    );
    var dots = Array.prototype.slice.call(demo.querySelectorAll(".demo-dot"));
    var toggle = demo.querySelector("[data-demo-toggle]");
    var replay = demo.querySelector("[data-demo-replay]");
    var status = demo.querySelector("[data-demo-status]");

    // Per-phase durations; the completed review holds longer before the
    // story loops back to Prepare.
    var PHASE_MS = [4200, 4200, 4200, 5600];
    var current = 0;
    var playing = false;
    var inView = false;
    var holdFrame = false; // user paused mid-flight: freeze, don't snap
    var timer = null;

    function updateMotion() {
      var blocked = playing && (!inView || document.hidden);
      var frozen = blocked || holdFrame;
      var snap = (!playing && !frozen) || (reducedMotion.matches && !frozen);
      demo.classList.toggle("is-frozen", frozen);
      demo.classList.toggle("is-snap", snap);
    }

    function showStep(index) {
      current = ((index % captions.length) + captions.length) % captions.length;
      if (scene) scene.setAttribute("data-phase", String(current));
      captions.forEach(function (cap, i) {
        cap.classList.toggle("is-active", i === current);
        cap.setAttribute("aria-hidden", i === current ? "false" : "true");
      });
      dots.forEach(function (dot, i) {
        dot.classList.toggle("is-active", i === current);
        dot.setAttribute("aria-pressed", i === current ? "true" : "false");
      });
      if (status) {
        status.textContent =
          "Step " +
          (current + 1) +
          " of " +
          captions.length +
          ": " +
          captions[current].textContent.trim();
      }
      updateMotion();
    }

    function stopTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    // Single chained timeout per phase — never two timers at once. The
    // story loops continuously while the visitor intends playback;
    // the review phase's longer duration gives the hold before restart.
    function startTimer() {
      stopTimer();
      if (playing && inView && !document.hidden) {
        timer = setTimeout(function () {
          timer = null;
          showStep(current + 1);
          startTimer();
        }, PHASE_MS[current]);
      }
      updateMotion();
    }

    function setPlaying(next) {
      playing = next;
      if (playing) {
        holdFrame = false;
      }
      if (status) status.setAttribute("aria-live", playing ? "off" : "polite");
      if (toggle) {
        toggle.textContent = playing ? "Pause" : "Play";
        toggle.setAttribute("aria-pressed", playing ? "true" : "false");
      }
      startTimer();
    }

    dots.forEach(function (dot) {
      dot.addEventListener("click", function () {
        holdFrame = false;
        setPlaying(false); // manual selection pauses so visitors can read
        showStep(Number(dot.getAttribute("data-goto")) || 0);
      });
    });

    if (toggle) {
      toggle.addEventListener("click", function () {
        if (playing) holdFrame = true; // pause freezes the scene mid-motion
        setPlaying(!playing);
      });
    }
    if (replay) {
      replay.addEventListener("click", function () {
        holdFrame = false;
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
      reducedMotion.addEventListener("change", function () {
        // Switching to reduced motion stops existing playback. Explicit
        // Play/Replay still works, with visual transitions disabled in CSS.
        if (reducedMotion.matches) setPlaying(false);
        updateMotion();
      });
    }

    // Autoplay only when motion is welcome; reduced-motion users get
    // manual control and a static first step.
    showStep(0);
    setPlaying(!reducedMotion.matches);
  }

  /* ================= feature showcase ================= */

  var showcase = document.querySelector("[data-showcase]");
  if (showcase) {
    var stageTitle = showcase.querySelector("[data-showcase-title]");
    var stageText = showcase.querySelector("[data-showcase-text]");
    var panel = showcase.querySelector("[role='tabpanel']");
    var tabs = Array.prototype.slice.call(
      showcase.querySelectorAll(".feature-tab"),
    );
    var fdemos = Array.prototype.slice.call(
      showcase.querySelectorAll("[data-fdemo]"),
    );
    var fdemoToggle = showcase.querySelector("[data-fdemo-toggle]");
    var fdemoInView = false;

    // Feature scenes are pure CSS loops gated on .is-active: removing the
    // class stops the previous demo outright, re-adding it restarts the new
    // one from its first frame — no timers, nothing runs hidden.
    function selectTab(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.setAttribute("tabindex", on ? "0" : "-1");
      });
      fdemos.forEach(function (d) {
        d.classList.toggle(
          "is-active",
          d.getAttribute("data-fdemo") === tab.getAttribute("data-feature"),
        );
      });
      if (stageTitle) stageTitle.textContent = tab.getAttribute("data-title");
      if (stageText) stageText.textContent = tab.getAttribute("data-text");
      if (panel) panel.setAttribute("aria-labelledby", tab.id);
      if (focus) tab.focus();
    }

    function updateFdemoFreeze() {
      showcase.classList.toggle("is-frozen", !fdemoInView || document.hidden);
    }

    function setFdemoPaused(paused) {
      showcase.classList.toggle("is-paused", paused);
      if (fdemoToggle) {
        fdemoToggle.textContent = paused ? "Play" : "Pause";
        fdemoToggle.setAttribute("aria-pressed", paused ? "false" : "true");
      }
    }

    if (fdemoToggle) {
      fdemoToggle.addEventListener("click", function () {
        setFdemoPaused(!showcase.classList.contains("is-paused"));
      });
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          fdemoInView = entries[0].isIntersecting;
          updateFdemoFreeze();
        },
        { threshold: 0.25 },
      ).observe(panel || showcase);
    } else {
      fdemoInView = true;
    }
    document.addEventListener("visibilitychange", updateFdemoFreeze);

    // Reduced motion is honoured in CSS (scenes render their complete static
    // state); start the toggle paused there so its label tells the truth.
    setFdemoPaused(reducedMotion.matches);

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
