document.addEventListener('DOMContentLoaded', () => {
    // Utilities

    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    let globalMuted = false;

    const speakDialogue = (text) => {

        return;
    };

    // Service worker

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(e => console.log('SW failed:', e));
        });
    }

    // Audio

    class SystemAudio {
        constructor() {
            this.ctx = null;
            this.osc = null;
            this.gain = null;
            this.filter = null;
            this.isRunning = false;
        }

        init() {
            if (this.ctx) return;
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.osc = this.ctx.createOscillator();
            this.osc.type = 'sawtooth';
            this.osc.frequency.setValueAtTime(40, this.ctx.currentTime);
            this.filter = this.ctx.createBiquadFilter();
            this.filter.type = 'lowpass';
            this.filter.frequency.setValueAtTime(100, this.ctx.currentTime);
            this.filter.Q.setValueAtTime(5, this.ctx.currentTime);
            this.gain = this.ctx.createGain();
            this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
            this.osc.connect(this.filter);
            this.filter.connect(this.gain);
            this.gain.connect(this.ctx.destination);
            this.osc.start();
        }

        startHum() {
            this.init();
            if (this.ctx.state === 'suspended') this.ctx.resume();
            this.gain.gain.setTargetAtTime(0.015, this.ctx.currentTime, 0.1);
            this.isRunning = true;
        }

        stopHum() {
            if (!this.gain) return;
            this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
            this.isRunning = false;
        }

        updateFrequency(isTyping) {
            if (!this.isRunning) return;
            const targetFreq = isTyping ? 55 : 40;
            const targetFilter = isTyping ? 150 : 100;
            this.osc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
            this.filter.frequency.setTargetAtTime(targetFilter, this.ctx.currentTime, 0.1);
        }

        modulate(intensity) {
            if (!this.isRunning || !this.ctx) return;
            const noise = intensity * 50;
            this.filter.frequency.setValueAtTime(100 + (Math.random() * noise), this.ctx.currentTime);
            this.filter.Q.setValueAtTime(5 + (Math.random() * intensity * 10), this.ctx.currentTime);
            if (intensity > 0.8 && Math.random() > 0.9) {
                this.gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
                setTimeout(() => this.gain.gain.setTargetAtTime(0.015, this.ctx.currentTime, 0.05), 50);
            }
        }
    }

    const systemAudio = new SystemAudio();

    // Radio

    class RadioController {
        constructor() {
            this.audio = document.getElementById('radio-audio');
            this.static = new Audio('assets/effects/audio/inter_01.mp3');
            this.amStatic = new Audio('assets/effects/audio/inter_02.mp3');
            this.static.loop = true;
            this.amStatic.loop = true;

            this.ctx = null;
            this.filter = null;
            this.gain = null;

            this.channel = 'fm';
            this.volume = 0.8;
            this.signalStrength = 0;
            this.isPowerOn = false;
            this.playlistStates = { am: { index: 0, tracks: [], time: 0 }, cm: { index: 0, tracks: [], time: 0 }, fm: { index: 0, tracks: [], time: 0 } };

            this.initListeners();
        }

        initContext() {
            if (this.ctx) return;
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.ctx.createMediaElementSource(this.audio);
            this.filter = this.ctx.createBiquadFilter();
            this.gain = this.ctx.createGain();
            source.connect(this.filter);
            this.filter.connect(this.gain);
            this.gain.connect(this.ctx.destination);
        }

        initListeners() {
            const pwr = document.getElementById('radio-power');
            if (pwr) pwr.addEventListener('click', () => this.togglePower());

            const dial = document.getElementById('radio-dial');
            if (dial) {
                let isDragging = false;
                const handleTuning = (e) => {
                    if (!isDragging) return;
                    const rect = dial.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
                    const clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
                    let angle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI) + 90;
                    if (angle < 0) angle += 360;
                    dial.style.transform = `rotate(${angle}deg)`;

                    const amDist = Math.min(Math.abs(angle - 0), Math.abs(angle - 360));
                    const cmDist = Math.abs(angle - 120);
                    const fmDist = Math.abs(angle - 240);
                    let newChan = this.channel;
                    let dist = 360;

                    if (amDist < 40) { newChan = 'am'; dist = amDist; }
                    else if (cmDist < 40) { newChan = 'cm'; dist = cmDist; }
                    else if (fmDist < 40) { newChan = 'fm'; dist = fmDist; }
                    else dist = 100;

                    this.signalStrength = Math.max(0, 1 - (dist / 30));
                    if (newChan !== this.channel && this.signalStrength > 0.1) this.setChannel(newChan);
                    else this.applyEffects();
                };
                dial.addEventListener('mousedown', () => isDragging = true);
                window.addEventListener('mousemove', handleTuning);
                window.addEventListener('mouseup', () => isDragging = false);
            }

            this.audio.addEventListener('ended', () => {
                const s = this.playlistStates[this.channel];
                s.index = (s.index + 1) % s.tracks.length;
                this.audio.src = s.tracks[s.index];
                if (this.isPowerOn && this.signalStrength > 0.05) this.audio.play().catch(() => { });
            });
        }

        async loadData() {
            try {
                const [aRes, cRes] = await Promise.all([fetch('data/assets.json'), fetch('data/radio_channels.json')]);
                const assets = await aRes.json();
                const chanData = await cRes.json();
                chanData.channels.forEach(c => {
                    this.playlistStates[c.id].tracks = c.playlist.map(id => assets.audio.find(a => a.id === id)?.src).filter(Boolean);
                });
                this.setChannel(localStorage.getItem('radio_channel') || 'fm', true);
            } catch (e) { console.error("Radio fail", e); }
        }

        setChannel(id, force = false) {
            if (!force && this.channel === id) return;
            this.playlistStates[this.channel].time = this.audio.currentTime;
            this.channel = id;
            localStorage.setItem('radio_channel', id);
            const s = this.playlistStates[id];
            if (s.tracks.length) {
                this.audio.src = s.tracks[s.index];
                this.audio.currentTime = s.time;
            }
            const arrow = document.getElementById('tuning-arrow');
            const pos = { am: '15%', cm: '50%', fm: '85%' };
            if (arrow) arrow.style.left = pos[id] || '50%';
            this.applyEffects();
        }

        togglePower() {
            this.isPowerOn = !this.isPowerOn;
            const rEl = document.getElementById('vintage-radio');
            if (this.isPowerOn) {
                document.getElementById('on-audio')?.play().catch(() => { });
                rEl.classList.add('playing');
                this.applyEffects();
            } else {
                document.getElementById('off-audio')?.play().catch(() => { });
                rEl.classList.remove('playing');
                this.audio.pause();
                this.static.pause();
                this.amStatic.pause();
            }
        }

        applyEffects() {
            if (!this.isPowerOn) return;
            this.initContext();
            if (this.ctx.state === 'suspended') this.ctx.resume();

            if (this.channel === 'fm') {
                this.filter.type = 'lowpass';
                this.filter.frequency.setTargetAtTime(15000, this.ctx.currentTime, 0.1);
            } else if (this.channel === 'am') {
                this.filter.type = 'lowpass';
                this.filter.frequency.setTargetAtTime(3000, this.ctx.currentTime, 0.1);
            } else if (this.channel === 'cm') {
                this.filter.type = 'peaking';
                this.filter.frequency.setTargetAtTime(800, this.ctx.currentTime, 0.1);
                this.filter.gain.setTargetAtTime(6, this.ctx.currentTime, 0.1);
            }

            let eff = this.signalStrength;
            const mVol = this.volume * Math.pow(eff, 2);
            const iVol = this.volume * (1 - eff);

            this.audio.volume = mVol;
            this.static.volume = iVol;
            if (this.channel === 'am') {
                this.amStatic.volume = this.volume * eff * 0.3;
                if (eff > 0.1) this.amStatic.play().catch(() => { });
            } else this.amStatic.pause();

            if (eff > 0.05) this.audio.play().catch(() => { }); else this.audio.pause();
            if (iVol > 0.05) this.static.play().catch(() => { }); else this.static.pause();
        }

        playJungle() { const a = document.getElementById('jungle-ambient'); if (a) { a.volume = 0.4; a.loop = true; a.play().catch(() => { }); } }
        stopJungle() { const a = document.getElementById('jungle-ambient'); if (a) { let v = a.volume; const f = setInterval(() => { v -= 0.05; if (v <= 0) { a.pause(); clearInterval(f); } else a.volume = v; }, 50); } }
        tick() { const a = document.getElementById('inter-01'); if (a) { a.volume = 0.05; a.currentTime = Math.random() * 5; a.play().catch(() => { }); setTimeout(() => a.pause(), 30); } }
        playRustle() { const a = document.getElementById('rustling-audio'); if (a) { a.currentTime = 0; a.play().catch(() => { }); } }
    }

    // Mainframe

    class MainframeController {
        constructor(radio) {
            this.radio = radio;
            this.isOn = false;
            this.isTrans = false;
            this.engineState = 'library';
            this.stories = [];
            this.currentCol = null;
            this.isGemstoneActive = false;
            this.cwd = '/';
            this.vfs = {
                'sys': {
                    'boot.log': 'System operational. Local Time: ' + new Date().toISOString(),
                    'eastereggs.txt': 'SECRET COMMANDS: whoiam, gemstone, alien, wolfgoldenclaw, tech-jcorp, secret, jaguar, lawithanx, film, radio'
                },
                'archives': {}
            };

            this.init();
        }

        init() {
            document.getElementById('tvbutton')?.addEventListener('click', () => this.togglePower());
            document.getElementById('terminal-input')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const val = e.target.value.trim();
                    if (val) { this.process(val); e.target.value = ''; }
                }
            });
        }

        async togglePower() {
            if (this.isTrans) return;
            this.isOn = !this.isOn;
            document.getElementById('tvbutton').classList.toggle('active', this.isOn);
            if (this.isOn) await this.boot();
            else await this.shutdown();
        }

        async boot() {
            this.isTrans = true;
            document.getElementById('main-interface').classList.add('hidden');
            const screen = document.getElementById('tv-screen');
            screen.classList.remove('hidden');

            const vid = document.getElementById('boot-video');
            if (vid) {
                vid.style.display = 'block'; vid.currentTime = 0; vid.play().catch(() => { });
                document.getElementById('on-audio')?.play().catch(() => { });
                await new Promise(r => { vid.onended = r; setTimeout(r, 4500); });
                vid.classList.add('video-fade-out');
                await delay(800);
                vid.style.display = 'none'; vid.classList.remove('video-fade-out');
                await this.logoFlash();
                this.initTerminal();
            }
            this.isTrans = false;
        }

        async shutdown() {
            this.isOn = false;
            const vid = document.getElementById('shutdown-video');
            const screen = document.getElementById('tv-screen');
            const interfaceContainer = document.getElementById('main-interface');
            const viewport = document.getElementById('engine-viewport');

            interfaceContainer.classList.add('hidden');
            viewport.classList.add('hidden');

            if (vid) {
                vid.style.display = 'block'; vid.currentTime = 0; vid.play().catch(() => { });
                document.getElementById('off-audio')?.play().catch(() => { });
                await delay(2000);
                vid.style.display = 'none';
            }
            screen.classList.add('hidden');
            systemAudio.stopHum();

            const jungle = document.getElementById('jungle-ambient');
            if (jungle) {
                jungle.pause();
                jungle.currentTime = 0;
            }
        }

        async logoFlash() {
            const screen = document.getElementById('tv-screen');
            screen.innerHTML = '<div class="crt-snow"></div>';
            await delay(1000);
            const logo = document.createElement('div');
            logo.className = 'screen-logo-flash';
            logo.innerHTML = '<img src="assets/effects/textures/img_logo_gear.png" class="logo-glitch"><div class="logo-subtext">SYSTEM INITIALIZED</div>';
            screen.appendChild(logo);
            document.getElementById('logo-audio')?.play().catch(() => { });

            const jungle = document.getElementById('jungle-ambient');
            if (jungle) {
                jungle.volume = 0.4;
                jungle.play().catch(() => { });
                setTimeout(() => {
                    let v = jungle.volume;
                    const f = setInterval(() => {
                        v -= 0.02;
                        if (v <= 0) { jungle.pause(); clearInterval(f); }
                        else jungle.volume = v;
                    }, 100);
                }, 15000);
            }

            await delay(5500);
            screen.innerHTML = '';
            screen.classList.add('on-bloom');
            await delay(500);
            screen.classList.remove('on-bloom');
        }

        initTerminal() {
            systemAudio.startHum();
            document.getElementById('tv-screen').classList.add('hidden');
            document.getElementById('main-interface').classList.remove('hidden');
            document.getElementById('terminal-output').innerHTML = '';
            this.loadLibrary();
        }

        async loadLibrary() {
            try {
                const res = await fetch('data/library.json');
                this.stories = await res.json();
                this.vfs.archives = {};
                this.stories.forEach(author => {
                    const authorId = author.id;
                    this.vfs.archives[authorId] = {};
                    author.items.forEach(item => {
                        this.vfs.archives[authorId][item.id + '.archive'] = item;
                    });
                });
                await this.type(`[SYSTEM] MULTI-CHANNEL DATA RECOVERY INTERFACE LOADED.`, 15);
                await this.type(`WELCOME BACK, OPERATIVE {NAME}. BRAVO-6 STANDING BY.`, 15);
                await delay(200);
                this.print("Type 'ls' to view directory contents or use index keys.");
                this.print("--------------------------------");
                await this.list();
            } catch (e) { this.print("Error: Library database offline."); }
        }

        async list() {
            this.print(`Directory of ${this.cwd}:`);
            const content = this.getVFSNode(this.cwd);
            if (typeof content === 'object') {
                const entries = Object.keys(content);
                for (let i = 0; i < entries.length; i++) {
                    const key = entries[i];
                    const isDir = typeof content[key] === 'object' && !content[key].id;
                    const suffix = isDir ? '/' : '';
                    let selectionHint = '';
                    if (this.cwd === '/archives') {
                        const author = this.stories.find(s => s.id === key);
                        if (author) selectionHint = `[${author.selection}] `;
                    } else if (this.cwd.startsWith('/archives/')) {
                        const parts = this.cwd.split('/');
                        const authorId = parts[2];
                        const author = this.stories.find(s => s.id === authorId);
                        if (author) {
                            const item = author.items.find(it => (it.id + '.archive') === key);
                            if (item) selectionHint = `[${item.selection}] `;
                        }
                    }
                    await this.type(`${selectionHint}${key}${suffix}`, 5);
                }
            }
            this.print("--------------------------------");
        }

        async print(text, isTyping = false) {
            const out = document.getElementById('terminal-output');
            const p = document.createElement('div');
            p.className = 'term-line';
            out.appendChild(p);
            const processedText = text.replace(/{NAME}/g, localStorage.getItem('operator_name') || "OPERATIVE");
            if (isTyping) {
                for (let i = 0; i < processedText.length; i++) {
                    p.textContent += processedText[i];
                    await delay(10);
                }
            } else {
                p.textContent = processedText;
            }
            out.scrollTop = out.scrollHeight;
        }

        async type(text, speed = 15) {
            const processedText = text.replace(/{NAME}/g, localStorage.getItem('operator_name') || "OPERATIVE");
            await this.print(processedText, true);
        }

        getVFSNode(path) {
            if (path === '/') return this.vfs;
            const parts = path.split('/').filter(p => p);
            let node = this.vfs;
            for (const p of parts) {
                if (node[p]) node = node[p];
                else return null;
            }
            return node;
        }

        async process(cmd) {
            const raw = cmd;
            const parts = cmd.toLowerCase().split(' ');
            const lower = parts[0];
            const args = parts.slice(1);
            const displayPath = this.cwd === '/' ? '~' : this.cwd;
            this.print(`op@engine:${displayPath}$ ${raw}`);

            if (lower === 'whoiam') {
                await this.type('"You examine the face of sky and earth, but the one who is before you, you have not recognized, and you do not know how to test this opportunity."', 30);
                return;
            }
            if (lower === 'gemstone') {
                await this.type("synchronising paranormal frequency... gemstone phase2 activated", 20);
                this.isGemstoneActive = !this.isGemstoneActive;
                document.body.classList.toggle('gemstone-mode', this.isGemstoneActive);
                return;
            }
            if (lower === 'alien') {
                await this.type("DECRYPTING ALIEN SIGNAL... SIGNAL IDENTIFIED: [GEMSTONE]", 40);
                return;
            }
            if (lower === 'wolfgoldenclaw') {
                this.print("CRITICAL OVERRIDE DETECTED");
                const lyrics = ["Do you want to play with me a game?", "With you by my side", "My heart's full of flames", "Cause glory await", "Our love is spark", "We'll glow in the dark", "It's lightning"];
                for (const l of lyrics) {
                    const line = document.createElement('div');
                    line.style.color = '#ff0000'; line.textContent = l;
                    document.getElementById('terminal-output').appendChild(line);
                    await delay(600);
                }
                const intercept = document.getElementById('numbers-station');
                if (intercept) { intercept.volume = 0.8; intercept.play(); setTimeout(() => { intercept.pause(); this.togglePower(); }, 7000); }
                return;
            }
            if (lower === 'tech-jcorp') {
                await this.type("TECH-JCORP: Building the future, today.", 20);
                await this.type("PROMO_CODE: JCORP40 (40% OFF FOR OPERATORS)", 10);
                return;
            }
            if (lower === 'secret') {
                await this.type('Job 41:1: "Can you draw out Leviathan with a fishhook? Or press down his tongue with a cord?"', 30);
                return;
            }
            if (lower === 'jaguar') {
                await this.type("CLASSIFIED LORE: The Jaguar (Balam) hears the frequency of the stars. To name it is to invite the risk of being seen.", 30);
                return;
            }
            if (lower === 'lawithanx') {
                await this.type("ACCESSING CIA CASE FILE: [REDACTED]...", 40);
                this.openStory({ id: 'story_lawithanx' });
                return;
            }
            if (lower === 'radio') {
                await this.type("MARK 301 CLANDESTINE RADIO SPECIFICATIONS:", 10);
                await this.type("- OPERATING MODES: AM (Historic), CM (Encrypted), FM (Broadband)", 10);
                await this.type("- ENCRYPTION: TEMPLE-GEM HARMONIZED", 10);
                return;
            }
            if (lower === 'film' || lower === 'project') {
                if (args.length === 0) {
                    await this.type("ACCESSING CLANDESTINE FILM ARCHIVE...", 10);
                    this.print("USE: project <item_id>");
                    return;
                }
                this.projectFilm('assets/effects/video/boot.mp4', args[0]);
                return;
            }

            if (lower === 'ls' || lower === 'dir') {
                await this.list();
            } else if (lower === 'pwd') {
                this.print(this.cwd);
            } else if (lower === 'clear') {
                document.getElementById('terminal-output').innerHTML = '';
            } else if (lower === 'exit') {
                this.togglePower();
            } else if (lower === 'cd') {
                const target = args[0] || '/';
                if (target === '..') {
                    if (this.cwd !== '/') {
                        const parts = this.cwd.split('/').filter(p => p);
                        parts.pop();
                        this.cwd = '/' + parts.join('/');
                    }
                } else if (target === '/') {
                    this.cwd = '/';
                } else {
                    let newPath = target.startsWith('/') ? target : (this.cwd === '/' ? '/' + target : this.cwd + '/' + target);
                    const node = this.getVFSNode(newPath);
                    if (node && typeof node === 'object' && !node.id) this.cwd = newPath;
                    else this.print(`cd: ${target}: No such directory`);
                }
            } else if (lower === 'cat' || lower === 'open') {
                const target = args[0];
                if (!target) return this.print("Usage: open <file>");
                let fullPath = target.startsWith('/') ? target : (this.cwd === '/' ? '/' + target : this.cwd + '/' + target);
                const node = this.getVFSNode(fullPath);
                if (node && node.id) {
                    this.openStory(node);
                } else if (typeof node === 'string') {
                    await this.type(node, 10);
                } else {
                    this.print(`open: ${target}: File not found or is a directory`);
                }
            } else if (lower === 'unlock') {
                const code = args[0];
                if (code === '1031') {
                    this.print("[SYSTEM] JAGUAR OVERRIDE INITIALIZED.");
                    this.print("[ALERT] UNKNOWN SECTOR ACCESSIBLE VIA 'cat /archives/secrets/jaguar.archive'");
                    this.vfs.archives.secrets = { "jaguar.archive": { id: "data/recovered_signal.json", selection: "X" } };
                } else {
                    this.print("ERROR: ACCESS DENIED. INCORRECT DECRYPTION KEY.");
                }
            } else if (lower === 'status') {
                this.print("SYSTEM STATUS: NOMINAL");
                this.print(`OPERATIVE: ${localStorage.getItem('operator_name') || "UNIDENTIFIED"}`);
                this.print("LOCATION: AMAZON BASIN // SECTOR 7G");
                this.print("INTEGRITY: 88%");
            } else if (!isNaN(lower)) {
                if (this.cwd === '/') {
                    if (lower === '1') this.process('cd archives');
                } else if (this.cwd === '/archives') {
                    const author = this.stories.find(s => s.selection === lower);
                    if (author) this.process(`cd ${author.id}`);
                } else if (this.cwd.startsWith('/archives/')) {
                    const parts = this.cwd.split('/');
                    const authorId = parts[2];
                    const author = this.stories.find(s => s.id === authorId);
                    if (author) {
                        const item = author.items.find(it => it.selection === lower);
                        if (item) this.openStory(item);
                        else if (this.cwd === '/archives/secrets' && lower === 'X') {
                            this.openStory(this.vfs.archives.secrets["jaguar.archive"]);
                        }
                        else this.print("Selection invalid.");
                    }
                }
            } else {
                this.print(`command not found: ${lower}`);
            }
        }

        async projectFilm(src, title) {
            document.getElementById('main-interface').classList.add('hidden');
            const screen = document.getElementById('tv-screen');
            screen.classList.remove('hidden');
            screen.innerHTML = '<div class="projector-boot"></div>';
            const pBoot = screen.querySelector('.projector-boot');
            for (const val of ['3', '2', '1', 'START']) {
                pBoot.textContent = val;
                pBoot.style.animation = 'none'; pBoot.offsetHeight; pBoot.style.animation = 'projector-pulse 0.5s ease-out';
                await delay(500);
            }
            screen.innerHTML = `
                <div class="movie-player-container">
                    <div class="film-grain"></div>
                    <video src="${src}" autoplay controls style="width:100%; height:100%; object-fit:contain;"></video>
                    <button class="nav-return-btn" style="position:absolute; top:20px; right:20px; z-index:100; writing-mode:horizontal-tb;">CLOSE</button>
                </div>
            `;
            screen.querySelector('button').onclick = () => {
                screen.innerHTML = '';
                screen.classList.add('hidden');
                document.getElementById('main-interface').classList.remove('hidden');
            };
            await this.type(`[SYSTEM] PROJECTING: ${title.toUpperCase()}...`, 20);
        }

        async openStory(meta) {
            document.getElementById('main-interface').classList.add('hidden');
            const vp = document.getElementById('engine-viewport');
            vp.classList.remove('hidden');
            const file = meta.id === "story_binary" ? "the_story_of_lost_knowledge.json" : `${meta.id}.json`;
            try {
                const res = await fetch(`data/${file}`);
                const dataRaw = await res.json();
                const data = dataRaw.ProjectEngine || dataRaw;
                const body = document.getElementById('story-body');
                body.innerHTML = `
                    <div class="story-metadata"><h1>${data.Metadata.Title}</h1><p>${data.Metadata.Summary || ''}</p></div>
                    <div class="story-content">${(data.Timeline || []).map(t => `<div class="timeline-entry"><h3>${t.Title}</h3><p>${t.Description || t.Content || ''}</p></div>`).join('')}</div>
                    <button class="nav-return-btn horizontal" id="story-close">CLOSE ARCHIVE</button>
                `;
                document.getElementById('story-close').onclick = () => {
                    vp.classList.add('hidden');
                    document.getElementById('main-interface').classList.remove('hidden');
                };
            } catch (e) { this.print("Error loading archive."); }
        }

        print(text) {
            const div = document.createElement('div'); div.textContent = text;
            const out = document.getElementById('terminal-output'); out.appendChild(div);
            const container = document.getElementById('terminal-interface');
            container.scrollTop = container.scrollHeight;
        }

        async type(text, speed = 25) {
            const div = document.createElement('div');
            const out = document.getElementById('terminal-output'); out.appendChild(div);
            for (let i = 0; i < text.length; i++) {
                if (!this.isOn) break;
                systemAudio.updateFrequency(true);
                div.textContent += text.charAt(i);
                const container = document.getElementById('terminal-interface');
                container.scrollTop = container.scrollHeight;
                await delay(speed);
                systemAudio.updateFrequency(false);
            }
        }
    }

    // Notepad

    class NotepadManager {
        constructor() {
            this.overlay = document.getElementById('notepad-overlay');
            this.textarea = document.getElementById('notepad-text');
            this.init();
        }

        init() {
            const saved = localStorage.getItem('field_notes');
            if (saved) this.textarea.value = saved;
            this.textarea.addEventListener('input', () => {
                localStorage.setItem('field_notes', this.textarea.value);
            });
            const toggles = ['notepad-btn', 'floating-notepad'];
            toggles.forEach(id => {
                document.getElementById(id)?.addEventListener('click', () => this.toggle());
            });
            document.getElementById('close-notepad')?.addEventListener('click', () => this.toggle(false));
            window.addEventListener('keydown', (e) => {
                if (e.key.toLowerCase() === 'n' && document.activeElement !== this.textarea && document.activeElement.tagName !== 'INPUT') {
                    this.toggle();
                }
                if (e.key.toLowerCase() === 'j' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                    window.mainframe.toggleJungleMode();
                }
            });
        }

        toggle(force) {
            const state = force !== undefined ? !force : this.overlay.classList.contains('hidden');
            if (state) {
                this.overlay.classList.remove('hidden');
                this.textarea.focus();
            } else {
                this.overlay.classList.add('hidden');
            }
        }
    }

    class IntroManager {
        constructor(radio, mainframe) {
            this.radio = radio; this.mainframe = mainframe;
            this.overlay = document.getElementById('intro-overlay');
            this.wristOverlay = document.getElementById('wrist-link-overlay');
            this.layers = [
                document.getElementById('intro-layer-1'),
                document.getElementById('intro-layer-2'),
                document.getElementById('intro-layer-3'),
                document.getElementById('intro-layer-4'),
                document.getElementById('intro-layer-5')
            ];
            this.scene = 0;
            this.progressClicks = 0;
            this.swipeAccumulator = 0;
            this.active = false;
            this.briefingComplete = false;
            this.commState = 'IDENT';
            this.gameState = { briefingAccepted: false, trustLevel: 100 };
            this.jungleScene = 0;
            this.userLocation = "AMAZON BASIN";
            this.init();
        }

        async captureUserContext() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((pos) => {
                    this.userLocation = `${pos.coords.latitude.toFixed(2)}N ${pos.coords.longitude.toFixed(2)}W`;
                }, () => { });
            }
        }

        async init() {
            const startClock = () => {
                const clock = document.getElementById('watch-time-display');
                if (clock) {
                    const now = new Date();
                    clock.textContent = now.toLocaleTimeString([], { hour12: false });
                }
            };
            setInterval(startClock, 1000);
            startClock();

            const watchToggles = ['watch-btn', 'floating-watch'];
            watchToggles.forEach(id => {
                document.getElementById(id)?.addEventListener('click', () => this.toggleWatch());
            });

            window.addEventListener('keydown', (e) => {
                const isFormInput = document.activeElement.tagName === 'TEXTAREA' ||
                    document.activeElement.tagName === 'INPUT' ||
                    document.activeElement.isContentEditable;
                if (e.key.toLowerCase() === 'w' && !isFormInput) this.toggleWatch();
            });

            document.getElementById('watch-btn-loc')?.addEventListener('click', () => this.showWatchData('LOC'));
            document.getElementById('watch-btn-unit')?.addEventListener('click', () => this.showWatchData('UNIT'));
            document.getElementById('watch-btn-brief')?.addEventListener('click', () => this.showWatchData('BRIEF'));
            document.getElementById('watch-btn-exit')?.addEventListener('click', () => this.toggleWatch(false));

            const watchInput = document.getElementById('watch-operator-input');
            watchInput?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleComm();
            });

            document.getElementById('watch-pulse-trigger')?.addEventListener('click', () => {
                this.toggleWatch();
                this.radio.tick();
            });

            this.setupExcavation();
            this.updateWatchUI();

            document.getElementById('intro-mute-btn')?.addEventListener('click', () => this.toggleMute());
            document.getElementById('mute-btn')?.addEventListener('click', () => this.toggleMute());

            setInterval(() => this.updateWatchUI(), 5000);

            if (localStorage.getItem('intro_cleared') === 'true') {
                this.overlay?.classList.add('hidden');
                if (this.wristOverlay) {
                    this.wristOverlay.classList.remove('hidden');
                    this.updateWatchUI();
                }
            } else {
                this.runOpeningSequence();
            }
        }

        showWatchData(type) {
            const display = document.getElementById('watch-display-area');
            if (!display) return;
            this.radio.tick();
            let content = "";
            const opName = localStorage.getItem('operator_name') || "UNIDENTIFIED";
            switch (type) {
                case 'LOC':
                    content = `<div class="data-item"><span class="label">COORDS //</span> <span>${this.userLocation}</span></div>
                               <div class="data-item"><span class="label">ALT //</span> <span>4,200 FT</span></div>`;
                    break;
                case 'UNIT':
                    content = `<div class="data-item"><span class="label">CALLSIGN //</span> <span>${opName}</span></div>
                               <div class="data-item"><span class="label">ID_CODE //</span> <span>DG-009-SEAMASTER</span></div>`;
                    break;
                case 'BRIEF':
                    content = `<div class="data-item"><span class="label">OBJ //</span> <span>CLASSIFIED</span></div>
                               <p style="font-size: 0.5rem; color: #ff3914; margin-top:5px;">ERROR: CLEARANCE LEVEL ALPHA REQUIRED</p>`;
                    break;
            }
            display.innerHTML = content;
            clearTimeout(this.watchTimer);
            this.watchTimer = setTimeout(() => this.resetWatchDisplay(), 5000);
        }

        resetWatchDisplay() {
            const display = document.getElementById('watch-display-area');
            if (!display) return;
            display.innerHTML = `<div class="comm-msg">
                <span class="sender">CHOPPER 5-3 //</span>
                <p id="watch-text-interface">Awaiting response...</p>
            </div>`;
        }

        toggleJungleMode() {
            const isFieldMode = !this.overlay?.classList.contains('hidden');
            if (isFieldMode) {
                this.overlay?.classList.add('hidden');
                document.getElementById('main-interface').classList.remove('hidden');
            } else {
                this.overlay?.classList.remove('hidden');
                this.overlay?.classList.remove('blackout');
                this.overlay?.classList.remove('chopper-view');
                document.getElementById('main-interface').classList.add('hidden');
                this.cycleExplorationScene();
            }
        }

        cycleExplorationScene() {
            const scenes = document.querySelectorAll('.exploration-scene');
            if (scenes.length === 0) return;
            scenes.forEach(s => { s.classList.add('hidden'); s.style.opacity = '0'; });
            const current = scenes[this.jungleScene];
            if (current) {
                current.classList.remove('hidden');
                requestAnimationFrame(() => { setTimeout(() => current.style.opacity = '1', 10); });
            }
            this.jungleScene = (this.jungleScene + 1) % scenes.length;
        }

        toggleMute() {
            globalMuted = !globalMuted;
            const introMuteBtn = document.getElementById('intro-mute-btn');
            const globalMuteBtn = document.getElementById('mute-btn');
            if (introMuteBtn) introMuteBtn.classList.toggle('muted', globalMuted);
            if (globalMuteBtn) globalMuteBtn.classList.toggle('unmuted', !globalMuted);
            if (globalMuted) window.speechSynthesis?.cancel();
            document.querySelectorAll('audio').forEach(a => a.muted = globalMuted);
            if (systemAudio?.gain) {
                systemAudio.gain.gain.setTargetAtTime(globalMuted ? 0 : 0.015, systemAudio.ctx.currentTime, 0.1);
            }
            if (this.radio?.gain) {
                const targetGain = globalMuted ? 0 : 1;
                this.radio.gain.gain.setTargetAtTime(targetGain, this.radio.ctx.currentTime, 0.1);
            }
        }

        async runOpeningSequence() {
            const credits = document.getElementById('intro-credits');
            const monologueTarget = document.getElementById('monologue-text');
            const eyeChoice = document.getElementById('eye-choice-container');
            if (!credits || !monologueTarget) return;

            const introMusic = document.getElementById('intro-music');
            if (introMusic) {
                introMusic.src = 'assets/effects/audio/jungle music happy.mp3';
                introMusic.volume = 0.5;
                introMusic.muted = globalMuted;
                introMusic.play().catch(e => console.log("Intro music blocked:", e));
            }

            credits.classList.remove('hidden');
            const text1 = "its dark its cold, im awaiting orders no clue where i am ... i hope its the bahamas but here i am..., Someone gives the order, I follow it... ";
            const text2 = "The contract is signed in smoke.\nYour life as a citizen ends here.\nAnd yet, here I am.";

            const textSfx = document.getElementById('text-sfx');
            if (textSfx) { textSfx.muted = globalMuted; textSfx.play().catch(() => { }); }

            for (let i = 0; i < text1.length; i++) { monologueTarget.textContent += text1[i]; await delay(60); }
            await delay(1500);

            eyeChoice.classList.remove('hidden');
            let choice = await new Promise(resolve => {
                document.getElementById('open-eyes-btn').onclick = () => resolve('open');
                document.getElementById('close-eyes-btn').onclick = () => resolve('closed');
            });

            eyeChoice.classList.add('hidden');
            monologueTarget.style.opacity = '0';
            await delay(1000);
            monologueTarget.textContent = "";
            monologueTarget.style.opacity = '1';

            if (choice === 'closed') {
                const closedText = "Of all the assignments they offered me at the academy, I could’ve been anywhere else by now.\nImagine that—some quiet post, some clean desk, a life that didn’t follow me home.\nThey said this one would serve my country—my father wore the uniform, and his father before him—so I followed, like I was born taking orders.\nBut when the mission ends and the silence sets in… 'who am I'?";
                for (let i = 0; i < closedText.length; i++) {
                    if (closedText[i] === "\n") monologueTarget.appendChild(document.createElement('br'));
                    else monologueTarget.innerHTML += closedText[i];
                    await delay(60);
                }
                await delay(1000);

                const identChoice = document.getElementById('identity-choice-container');
                identChoice.classList.remove('hidden');
                const legacy = await new Promise(resolve => {
                    document.getElementById('father-choice-btn').onclick = () => resolve('father');
                    document.getElementById('academy-choice-btn').onclick = () => resolve('academy');
                });

                identChoice.classList.add('hidden');
                monologueTarget.style.opacity = '0';
                await delay(1000);
                monologueTarget.textContent = "";
                monologueTarget.style.opacity = '1';

                if (legacy === 'academy') {
                    choice = 'open';
                } else if (legacy === 'father') {
                    const fatherText = "William Donovan was the 'Father of Intelligence.' To my father, David, he was just a ghost who chose the OSS over family.\nMy grandfather was barely on the map while Bill built his web. My father spent thirty years chasing that shadow, and now I've spent twenty-five doing the same.\nChasing ghosts in the dirt when we could have been in the Bahamas.\nAnd yet, here I am.";
                    for (let i = 0; i < fatherText.length; i++) {
                        if (fatherText[i] === "\n") monologueTarget.appendChild(document.createElement('br'));
                        else monologueTarget.innerHTML += fatherText[i];
                        await delay(60);
                    }
                    await delay(2000);

                    eyeChoice.classList.remove('hidden');
                    document.getElementById('close-eyes-btn')?.classList.add('hidden');
                    await new Promise(resolve => {
                        document.getElementById('open-eyes-btn').onclick = () => {
                            eyeChoice.classList.add('hidden'); choice = 'open'; resolve();
                        };
                    });
                    monologueTarget.style.opacity = '0';
                    await delay(1000);
                    monologueTarget.textContent = "";
                    monologueTarget.style.opacity = '1';
                }
            }

            const pulse = document.getElementById('watch-pulse-trigger');
            const activateVisuals = () => {
                if (pulse) { pulse.classList.remove('hidden'); this.radio.tick(); }
                this.captureUserContext();
                this.overlay?.classList.remove('blackout');
                this.overlay?.classList.add('chopper-closed-view');
            };

            if (choice === 'open') activateVisuals();
            else this.overlay?.classList.add('blackout');

            monologueTarget.style.opacity = '0';
            await delay(1500);
            monologueTarget.textContent = "";
            monologueTarget.style.opacity = '1';
            if (textSfx) textSfx.play().catch(() => { });

            for (let i = 0; i < text2.length; i++) {
                if (text2[i] === "\n") monologueTarget.appendChild(document.createElement('br'));
                else monologueTarget.innerHTML += text2[i];
                await delay(60);
            }
            await delay(1000);
            await delay(3000);

            if (pulse) {
                document.getElementById('watch-notification-badge')?.classList.remove('hidden');
                pulse.querySelector('.watch-icon')?.classList.add('hidden');
                pulse.querySelector('.message-icon')?.classList.remove('hidden');
                const beep = document.getElementById('message-beep');
                if (beep) { beep.muted = globalMuted; beep.play().catch(() => { }); }
                this.radio.tick();
            }

            await delay(4000);
            credits.style.opacity = '0';
            await delay(2000);
            credits.remove();
        }

        toggleWatch(force) {
            const state = force !== undefined ? !force : this.wristOverlay.classList.contains('hidden') || this.wristOverlay.style.opacity === '0';
            const trigger = document.getElementById('watch-pulse-trigger');
            if (state) {
                this.wristOverlay.classList.remove('hidden');
                this.wristOverlay.style.opacity = '1';
                this.wristOverlay.style.pointerEvents = 'auto';
                trigger?.classList.add('active-state');
                document.getElementById('watch-notification-badge')?.classList.add('hidden');
                trigger?.querySelector('.watch-icon')?.classList.remove('hidden');
                trigger?.querySelector('.message-icon')?.classList.add('hidden');
                this.updateWatchUI();
            } else {
                this.wristOverlay.style.opacity = '0';
                this.wristOverlay.style.pointerEvents = 'none';
                trigger?.classList.remove('active-state');
                setTimeout(() => { if (!this.active) this.wristOverlay.classList.add('hidden'); }, 1000);
            }
        }

        updateWatchUI() {
            if (!this.wristOverlay) return;
            const opName = localStorage.getItem('operator_name');
            if (opName) {
                document.querySelectorAll('.op-code-name').forEach(el => el.textContent = opName.toUpperCase());
            }
        }

        async handleComm() {
            const input = document.getElementById('watch-operator-input');
            const msg = document.getElementById('watch-text-interface');
            const inputCont = document.getElementById('watch-input-zone');
            if (this.commState === 'IDENT') {
                const name = input.value.trim();
                if (!name) return;
                localStorage.setItem('operator_name', name);
                inputCont.classList.add('hidden');
                msg.textContent = "UPLOADING IDENTITY DATA...";
                this.radio.tick();
                await delay(2000);
                msg.textContent = "ID VERIFIED. [ALPHA CLEARANCE GRANTED]";
                this.updateWatchUI();
                await delay(2000);
                msg.innerHTML = "PROCEED TO BRIEFING? <br><br> <button class='choice-btn' onclick='window.introManager.handleChoice(\"yes\")'>CONFIRM</button>";
                window.introManager = this;
                this.commState = 'CONFIRMING';
            }
        }

        async handleChoice(choice) {
            const msg = document.getElementById('watch-text-interface');
            if (choice === 'yes') {
                msg.textContent = "INITIATING BRIEFING LINK...";
                this.gameState.briefingAccepted = true;
                this.radio.tick();
                await delay(1500);
                this.toggleWatch(false);
                await delay(800);
                this.showBriefing();
            } else {
                msg.textContent = "SYSTEM ALERT: VOLUNTARY DISCONNECT INITIATED.";
                this.gameState.briefingAccepted = false;
                this.radio.tick();
                await delay(2000);
                msg.textContent = "COMMUNICATIONS RESTORED. MANDATORY RE-INITIALIZATION...";
            }
        }

        async showBriefing() {
            const brp = document.getElementById('intro-briefing');
            brp.classList.remove('hidden');
            brp.style.opacity = '1';
            const paragraphs = brp.querySelectorAll('.military-briefing p');
            for (const p of paragraphs) {
                p.classList.add('visible');
                this.radio.tick();
                await delay(1500);
            }
            document.getElementById('acknowledge-briefing-btn')?.classList.add('visible');
            document.getElementById('reject-briefing-btn')?.classList.add('visible');
            this.briefingComplete = true;
        }

        async rejectBriefing() {
            const brp = document.getElementById('intro-briefing');
            const monologueTarget = document.getElementById('monologue-text');
            const credits = document.getElementById('intro-credits');
            if (brp) { brp.style.opacity = '0'; await delay(1000); brp.classList.add('hidden'); }
            this.radio.tick();
            if (monologueTarget && credits) {
                credits.classList.remove('hidden');
                credits.style.opacity = '1';
                monologueTarget.textContent = "";
                const rejectText = "There is no 'No' for an asset of your class.\nThe coordinates are fixed. The satellite has you locked.\nTo refuse now is to be discarded.\nWe are initiating auto-deployment. Sleep well, operative.";
                for (let i = 0; i < rejectText.length; i++) {
                    if (rejectText[i] === "\n") monologueTarget.appendChild(document.createElement('br'));
                    else monologueTarget.innerHTML += rejectText[i];
                    await delay(60);
                }
                await delay(5000);
                credits.style.opacity = '0';
                await delay(2000);
                credits.classList.add('hidden');
            }
            this.transitionToJungle();
        }

        async transitionToJungle() {
            const brp = document.getElementById('intro-briefing');
            const monologueTarget = document.getElementById('monologue-text');
            const credits = document.getElementById('intro-credits');
            if (brp) { brp.style.opacity = '0'; await delay(1000); brp.classList.add('hidden'); }
            if (monologueTarget && credits) {
                credits.classList.remove('hidden');
                credits.style.opacity = '1';
                monologueTarget.textContent = "";
                const okText = "The contract is signed in smoke.\nYour life as a citizen ends here.\nThe jungle is hungry, operative.\nBut you were born for the hunt.";
                for (let i = 0; i < okText.length; i++) {
                    if (okText[i] === "\n") monologueTarget.appendChild(document.createElement('br'));
                    else monologueTarget.innerHTML += okText[i];
                    await delay(60);
                }
                await delay(3000);
                credits.style.opacity = '0';
                await delay(2000);
                credits.classList.add('hidden');
            }
            this.overlay.classList.remove('chopper-closed-view');
            this.overlay.classList.add('chopper-open-view');
            await delay(3000);
            this.overlay.classList.remove('blackout');
            this.overlay.classList.add('fade-out');
            const jungleImg = this.layers[0].querySelector('.intro-img');
            if (jungleImg) {
                jungleImg.classList.remove('hidden');
                jungleImg.style.opacity = '0';
                setTimeout(() => { jungleImg.style.opacity = '1'; }, 100);
            }
            this.wristOverlay.style.opacity = '0';
            this.wristOverlay.style.pointerEvents = 'none';
            this.active = true;
            this.radio.playJungle();
            this.typeDialogue(0);
        }

        async typeDialogue(idx) {
            const l = this.layers[idx];
            l.querySelector('.intro-content').classList.remove('hidden');
            const el = l.querySelector('.dialogue-text');
            const txt = el.dataset.text || el.textContent;
            el.dataset.text = txt;
            const finalTxt = txt.replace(/{NAME}/g, localStorage.getItem('operator_name'));
            speakDialogue(finalTxt);
            el.textContent = '';
            for (let i = 0; i < finalTxt.length; i++) { el.textContent += finalTxt[i]; await delay(20); }
        }

        setupExcavation() {
            this.layers.forEach((l, idx) => {
                let dragging = false;
                let lastPos = { x: 0, y: 0 };
                const start = (e) => {
                    if (this.active) { dragging = true; const p = e.touches ? e.touches[0] : e; lastPos = { x: p.clientX, y: p.clientY }; }
                };
                const move = (e) => {
                    if (dragging && this.active) {
                        const p = e.touches ? e.touches[0] : e;
                        const dist = Math.sqrt(Math.pow(p.clientX - lastPos.x, 2) + Math.pow(p.clientY - lastPos.y, 2));
                        this.swipeAccumulator += dist;
                        lastPos = { x: p.clientX, y: p.clientY };
                        if (this.swipeAccumulator > 120) { this.excavate(idx); this.swipeAccumulator = 0; }
                    }
                };
                l.addEventListener('mousedown', start);
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', () => dragging = false);
                l.addEventListener('touchstart', start);
                window.addEventListener('touchmove', move);
                window.addEventListener('touchend', () => dragging = false);
            });
        }

        excavate(idx) {
            if (this.scene !== idx) return;
            if (this.swipeAccumulator === 0 || this.swipeAccumulator === 1) this.radio.playRustle();
            this.layers[idx].classList.add('shaking');
            setTimeout(() => this.layers[idx].classList.remove('shaking'), 300);
            if (this.scene === 0 && this.progressClicks === 0) {
                const introMusic = document.getElementById('intro-music');
                if (introMusic) { introMusic.src = 'assets/effects/audio/junglemusic scary.mp3'; introMusic.play().catch(() => { }); }
            }
            this.progressClicks++;
            const targetClicks = [6, 5, 5, 4, 1][idx] || 1;
            if (this.progressClicks >= targetClicks) {
                this.layers[this.scene].classList.add('hidden');
                this.scene++;
                this.progressClicks = 0;
                this.swipeAccumulator = 0;
                if (this.scene < this.layers.length) { this.layers[this.scene].classList.remove('hidden'); this.typeDialogue(this.scene); }
                else this.finish();
            }
        }

        finish() {
            localStorage.setItem('intro_cleared', 'true');
            if (this.wristOverlay) {
                this.wristOverlay.classList.add('hidden');
                document.body.appendChild(this.wristOverlay);
                document.getElementById('close-watch')?.classList.remove('hidden');
            }
            document.getElementById('global-ui-controls')?.classList.remove('hidden');
            this.radio.stopJungle();
            this.overlay.classList.add('fade-out');
            setTimeout(() => { this.overlay.classList.add('hidden'); }, 2000);
        }
    }

    // Initialization

    const radio = new RadioController();
    window.mainframe = new MainframeController(radio);
    window.introManager = new IntroManager(radio, window.mainframe);
    new NotepadManager();

    radio.loadData();

    // Manual & Effects

    document.getElementById('manual-btn')?.addEventListener('click', () => document.getElementById('manual-overlay').classList.toggle('hidden'));
    document.getElementById('manual-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'manual-overlay') e.target.classList.add('hidden'); });

    setInterval(() => {
        if (!mainframe.isOn) return;
        let glitchChance = 0.02;
        let glitchIntensity = 0.5;
        let interference = 0;
        if (radio.isPowerOn) {
            interference = 1 - radio.signalStrength;
            glitchChance = 0.05 + (interference * 0.4);
            glitchIntensity = 1 + (interference * 5);
            systemAudio.modulate(interference);
        }
        if (Math.random() < glitchChance) {
            const screen = document.getElementById('tv-screen');
            const interfaceContainer = document.getElementById('main-interface');
            const viewport = document.getElementById('engine-viewport');
            const target = !viewport.classList.contains('hidden') ? viewport :
                (screen.classList.contains('hidden') ? interfaceContainer : screen);
            if (!target) return;
            const blur = Math.random() * glitchIntensity;
            const drift = (Math.random() - 0.5) * glitchIntensity * 10;
            target.style.filter = `blur(${blur}px) contrast(${1.1 + Math.random()}) sepia(${interference * 0.2})`;
            target.style.transform = `translateX(${drift}px) skewX(${(Math.random() - 0.5) * glitchIntensity}deg)`;
            if (interference > 0.8 && Math.random() > 0.9) {
                target.style.opacity = "0.7";
            }
            setTimeout(() => {
                target.style.filter = '';
                target.style.transform = '';
                target.style.opacity = "1";
            }, 60 + Math.random() * 100);
        }
    }, 150);

    // Draggable Radio
    const vRadio = document.getElementById('vintage-radio');
    if (vRadio) {
        let dragging = false, offset = { x: 0, y: 0 };
        vRadio.addEventListener('mousedown', (e) => {
            if (e.target.closest('button') || e.target.closest('.radio-dial')) return;
            dragging = true; const r = vRadio.getBoundingClientRect();
            offset = { x: e.clientX - r.left, y: e.clientY - r.top };
            vRadio.style.zIndex = '10000';
        });
        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            vRadio.style.left = (e.clientX - offset.x) + 'px'; vRadio.style.top = (e.clientY - offset.y) + 'px';
            vRadio.style.bottom = 'auto'; vRadio.style.right = 'auto';
        });
        window.addEventListener('mouseup', () => dragging = false);
    }
});
