let bedtimeMode = false;
const STORY_FILE = 'lost knowledge.json';

async function loadStory(animate = false) {
    try {
        // Check if page is being served via HTTP or opened as file
        if (window.location.protocol === 'file:') {
            throw new Error('This page must be accessed through a web server. Please use: http://localhost:8000/storyofbinary.html');
        }

        // URL encode the filename to handle spaces
        const encodedFileName = encodeURIComponent(STORY_FILE);
        // Use relative path from current page location
        const filePath = `storylist/${encodedFileName}`;
        console.log('Fetching JSON from:', filePath);
        console.log('Current location:', window.location.href);

        const response = await fetch(filePath, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });

        console.log('Response status:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Response error text:', errorText);
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        console.log('JSON data received:', data);

        if (!data.ProjectEngine) {
            throw new Error('Invalid JSON structure: ProjectEngine not found');
        }

        const engine = data.ProjectEngine;

        // 1. Set Metadata
        document.getElementById('main-title').textContent = engine.Metadata.Title;
        document.getElementById('author-tag').textContent =
            `By ${engine.Metadata.Author} | Version ${engine.Metadata.Version}`;

        // 2. Render Timeline
        const timeline = document.getElementById('timeline');

        if (animate && bedtimeMode) {
            // Bedtime story mode with typing animation
            timeline.innerHTML = '';
            await renderBedtimeStory(engine.Timeline, timeline);
        } else {
            // Normal mode
            timeline.innerHTML = engine.Timeline.map(event => `
                <div class="event-card">
                    <span class="year-badge">${event.year} | ${event.region || ''}</span>
                    <h3>${event.Title}</h3>
                    <p class="description">${event.Description}</p>
                    ${event.Connection ? `<p><strong>Connection:</strong> ${event.Connection}</p>` : ''}
                </div>
            `).join('');
        }

        // 3. Render Sacred Logic
        const logic = engine.SacredLogic.Concept;
        const logicContent = document.getElementById('logic-content');

        if (animate && bedtimeMode) {
            logicContent.innerHTML = '';
            await typeText(logicContent, `
                <div class="binary-pulse">${logic.BinaryPulse.value}</div>
                <h3>${logic.name} (${logic.Word.text})</h3>
                <p><em>Gematria: ${logic.Gematria.total}</em></p>
                <p>${logic.Philosophy}</p>
            `);
        } else {
            logicContent.innerHTML = `
                <div class="binary-pulse">${logic.BinaryPulse.value}</div>
                <h3>${logic.name} (${logic.Word.text})</h3>
                <p><em>Gematria: ${logic.Gematria.total}</em></p>
                <p>${logic.Philosophy}</p>
            `;
        }

    } catch (error) {
        console.error("Error loading the Project Engine:", error);
        console.error("Error details:", {
            name: error.name,
            message: error.message,
            stack: error.stack
        });

        let errorMessage = error.message;

        // Provide helpful error messages
        if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
            errorMessage = 'Failed to fetch JSON file. Make sure you are accessing the page through the web server (http://localhost:8000/storyofbinary.html) and not opening it directly as a file.';
        }

        const timeline = document.getElementById('timeline');
        if (timeline) {
            timeline.innerHTML = `<div class="error-card">Error loading story: ${errorMessage}</div>`;
        } else {
            alert('Error loading story: ' + errorMessage);
        }
    }
}

async function typeText(element, htmlContent) {
    // Extract text content and create typing effect
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const textContent = tempDiv.textContent || tempDiv.innerText || '';

    element.innerHTML = '';
    let i = 0;
    const typingSpeed = 30; // milliseconds per character

    return new Promise((resolve) => {
        function typeChar() {
            if (i < textContent.length) {
                // Preserve HTML structure while typing
                if (i === 0) {
                    element.innerHTML = htmlContent.substring(0, htmlContent.indexOf(textContent[0]) + 1);
                }
                // Simple approach: just show the HTML after a delay
                if (i === textContent.length - 1) {
                    element.innerHTML = htmlContent;
                    resolve();
                } else {
                    i++;
                    setTimeout(typeChar, typingSpeed);
                }
            } else {
                resolve();
            }
        }
        // For simplicity, show content with fade-in
        element.style.opacity = '0';
        element.innerHTML = htmlContent;
        setTimeout(() => {
            element.style.transition = 'opacity 1s ease-in';
            element.style.opacity = '1';
            resolve();
        }, 100);
    });
}

async function renderBedtimeStory(timeline, container) {
    for (let i = 0; i < timeline.length; i++) {
        const event = timeline[i];
        const eventCard = document.createElement('div');
        eventCard.className = 'event-card';
        eventCard.style.opacity = '0';

        eventCard.innerHTML = `
            <span class="year-badge">${event.year} | ${event.region || ''}</span>
            <h3>${event.Title}</h3>
            <p class="description"></p>
            ${event.Connection ? `<p><strong>Connection:</strong> ${event.Connection}</p>` : ''}
        `;

        container.appendChild(eventCard);

        // Fade in card
        setTimeout(() => {
            eventCard.style.transition = 'opacity 0.8s ease-in';
            eventCard.style.opacity = '1';
        }, i * 200);

        // Type description
        const descElement = eventCard.querySelector('.description');
        await typeDescription(descElement, event.Description);

        // Wait before next event
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

async function typeDescription(element, text) {
    element.textContent = '';
    for (let i = 0; i < text.length; i++) {
        element.textContent += text[i];
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

function initLoadStoryButton() {
    const loadBtn = document.getElementById('load-story-btn');
    const storyContent = document.getElementById('story-content');

    if (!loadBtn) {
        console.error('Load story button not found!');
        return;
    }

    if (!storyContent) {
        console.error('Story content container not found!');
        return;
    }

    loadBtn.addEventListener('click', async () => {
        console.log('Load story button clicked');

        try {
            // Hide the button and show all content sections
            loadBtn.style.display = 'none';
            storyContent.classList.remove('hidden');

            // Show translator and bagua sections
            const translator = document.querySelector('.word-translator');
            const bagua = document.querySelector('.bagua-diagram');

            if (translator) translator.classList.remove('hidden');
            if (bagua) bagua.classList.remove('hidden');

            // Load the story
            console.log('Loading story from:', `storylist/${STORY_FILE}`);
            await loadStory(false);
            console.log('Story loaded successfully');

            // Initialize bedtime mode after story loads
            initBedtimeMode();
        } catch (error) {
            console.error('Error in load story button handler:', error);
            alert('Error loading story: ' + error.message);
        }
    });
}

function initBedtimeMode() {
    const bedtimeBtn = document.getElementById('bedtime-mode-btn');
    if (bedtimeBtn) {
        bedtimeBtn.addEventListener('click', () => {
            bedtimeMode = !bedtimeMode;
            bedtimeBtn.textContent = bedtimeMode ? '📖 Exit Bedtime Mode' : '📖 Bedtime Story Mode';
            bedtimeBtn.classList.toggle('active', bedtimeMode);
            loadStory(true);
        });
    }
}

function initProjectEngine() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM loaded, initializing...');
            initLoadStoryButton();
        });
    } else {
        // DOM is already ready
        console.log('DOM already ready, initializing...');
        initLoadStoryButton();
    }
}

initProjectEngine();