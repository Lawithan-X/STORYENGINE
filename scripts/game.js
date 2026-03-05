let gameScore = 0;
let gameRunning = false;
let pulseInterval = null;
let currentPattern = '';
let targetPattern = '';
let pulseSpeed = 1000; // milliseconds

document.addEventListener('DOMContentLoaded', function () {
    const startBtn = document.getElementById('start-game-btn');
    const catchBtn = document.getElementById('catch-pulse-btn');
    const pulseDisplay = document.getElementById('pulse-display');
    const pulseLine = document.getElementById('pulse-line');
    const targetPatternDisplay = document.getElementById('target-pattern-display');
    const scoreDisplay = document.getElementById('game-score');

    function generatePattern(length = 6) {
        let pattern = '';
        for (let i = 0; i < length; i++) {
            pattern += Math.random() < 0.5 ? '0' : '1';
        }
        return pattern;
    }

    function patternToVisual(pattern) {
        return pattern.split('').map(bit => {
            return bit === '0'
                ? '<span class="game-yin">⚋</span>'
                : '<span class="game-yang">⚊</span>';
        }).join('');
    }

    startBtn.addEventListener('click', function () {
        if (gameRunning) {
            // Stop game
            stopGame();
            startBtn.textContent = 'Start Game';
        } else {
            // Start game
            gameRunning = true;
            gameScore = 0;
            scoreDisplay.textContent = '0';
            startBtn.textContent = 'Stop Game';
            catchBtn.disabled = false;

            // Generate target pattern
            targetPattern = generatePattern(6);
            targetPatternDisplay.innerHTML = patternToVisual(targetPattern);

            // Start pulse animation
            startPulse();
        }
    });

    catchBtn.addEventListener('click', function () {
        if (!gameRunning) return;

        if (currentPattern === targetPattern) {
            // Correct catch!
            gameScore += 10;
            scoreDisplay.textContent = gameScore;

            // Visual feedback - invert colors
            pulseLine.style.backgroundColor = '#000000';
            pulseLine.style.color = '#ffffff';
            setTimeout(() => {
                pulseLine.style.backgroundColor = '';
                pulseLine.style.color = '';
            }, 300);

            // Generate new target pattern
            targetPattern = generatePattern(6);
            targetPatternDisplay.innerHTML = patternToVisual(targetPattern);

            // Increase difficulty slightly
            if (pulseSpeed > 500) {
                pulseSpeed -= 50;
            }
        } else {
            // Wrong catch
            gameScore = Math.max(0, gameScore - 5);
            scoreDisplay.textContent = gameScore;

            // Visual feedback - border flash
            pulseLine.style.border = '3px solid #000000';
            setTimeout(() => {
                pulseLine.style.border = '';
            }, 300);
        }
    });

    function startPulse() {
        function updatePulse() {
            if (!gameRunning) return;

            currentPattern = generatePattern(6);
            pulseLine.innerHTML = patternToVisual(currentPattern);
            pulseLine.setAttribute('data-pattern', currentPattern);

            // Animate pulse
            pulseLine.style.animation = 'none';
            setTimeout(() => {
                pulseLine.style.animation = 'pulse 0.5s ease-in-out';
            }, 10);
        }

        updatePulse();
        pulseInterval = setInterval(updatePulse, pulseSpeed);
    }

    function stopGame() {
        gameRunning = false;
        catchBtn.disabled = true;
        if (pulseInterval) {
            clearInterval(pulseInterval);
            pulseInterval = null;
        }
        pulseSpeed = 1000; // Reset speed
        pulseLine.innerHTML = '';
        targetPatternDisplay.innerHTML = '';
    }
});

