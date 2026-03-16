(function () {
    const slides = Array.from(document.querySelectorAll(".hero-slider .slide"));
    const dotsContainer = document.getElementById("sliderDots");
    const prevButton = document.getElementById("slidePrev");
    const nextButton = document.getElementById("slideNext");

    if (!slides.length || !dotsContainer || !prevButton || !nextButton) {
        return;
    }

    let currentSlide = 0;
    let autoPlayTimer = null;
    const autoPlayDelay = 4200;

    function goToSlide(index) {
        currentSlide = (index + slides.length) % slides.length;

        slides.forEach((slide, slideIndex) => {
            slide.classList.toggle("is-active", slideIndex === currentSlide);
        });

        const dots = dotsContainer.querySelectorAll(".slider-dot");
        dots.forEach((dot, dotIndex) => {
            dot.classList.toggle("is-active", dotIndex === currentSlide);
        });
    }

    function createDots() {
        slides.forEach((_, index) => {
            const dot = document.createElement("button");
            dot.className = "slider-dot";
            dot.type = "button";
            dot.setAttribute("aria-label", `Go to slide ${index + 1}`);
            dot.addEventListener("click", () => {
                goToSlide(index);
                restartAutoPlay();
            });
            dotsContainer.appendChild(dot);
        });
    }

    function nextSlide() {
        goToSlide(currentSlide + 1);
    }

    function previousSlide() {
        goToSlide(currentSlide - 1);
    }

    function stopAutoPlay() {
        if (autoPlayTimer) {
            window.clearInterval(autoPlayTimer);
            autoPlayTimer = null;
        }
    }

    function startAutoPlay() {
        stopAutoPlay();
        autoPlayTimer = window.setInterval(nextSlide, autoPlayDelay);
    }

    function restartAutoPlay() {
        startAutoPlay();
    }

    prevButton.addEventListener("click", () => {
        previousSlide();
        restartAutoPlay();
    });

    nextButton.addEventListener("click", () => {
        nextSlide();
        restartAutoPlay();
    });

    createDots();
    goToSlide(0);
    startAutoPlay();
})();
