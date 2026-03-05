document.addEventListener('DOMContentLoaded', function () {
    const translateBtn = document.getElementById('translate-btn');
    const wordInput = document.getElementById('word-input');
    const outputContainer = document.getElementById('translation-output');

    translateBtn.addEventListener('click', function () {
        const word = wordInput.value.trim();
        if (!word) {
            outputContainer.innerHTML = '<p class="error">Please enter a word to translate.</p>';
            return;
        }
        translateWord(word);
    });

    // Allow Enter key to trigger translation
    wordInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            translateBtn.click();
        }
    });

    function translateWord(word) {
        let binaryOutput = '';
        let visualOutput = '';
        let characterBreakdown = '';

        // Process each character in the word
        for (let i = 0; i < word.length; i++) {
            const char = word[i];
            const asciiNumber = char.charCodeAt(0);
            const binaryString = asciiNumber.toString(2).padStart(8, '0');

            binaryOutput += binaryString + ' ';

            // Create visual Yin/Yang representation for this character
            const yinYangLines = convertToYinYang(binaryString);
            characterBreakdown += `
                <div class="char-translation">
                    <div class="char-header">
                        <span class="char">"${char}"</span>
                        <span class="ascii">ASCII: ${asciiNumber}</span>
                        <span class="binary">${binaryString}</span>
                    </div>
                    <div class="yin-yang-visual">
                        ${yinYangLines}
                    </div>
                </div>
            `;
        }

        // Display the results
        outputContainer.innerHTML = `
            <div class="translation-result">
                <h3>Translation: "${word}"</h3>
                <div class="full-binary">
                    <strong>Full Binary:</strong> <code>${binaryOutput.trim()}</code>
                </div>
                <div class="character-breakdown">
                    ${characterBreakdown}
                </div>
            </div>
        `;
    }

    function convertToYinYang(binaryString) {
        // Convert each bit to Yin (broken line) or Yang (solid line)
        // 0 = Yin (broken line) = ⚋
        // 1 = Yang (solid line) = ⚊
        let lines = '';

        // Display as 8 lines (one for each bit)
        for (let i = 0; i < binaryString.length; i++) {
            const bit = binaryString[i];
            if (bit === '0') {
                // Yin - broken line (⚋)
                lines += '<div class="yin-line">⚋</div>';
            } else {
                // Yang - solid line (⚊)
                lines += '<div class="yang-line">⚊</div>';
            }
        }

        return lines;
    }
});

