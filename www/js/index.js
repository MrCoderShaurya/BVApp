/* ==========================================================================
   BVApp - Core Application Logic (Strict ES5 for iOS 9.3.5 Compatibility)
   ========================================================================== */

window.onerror = function(msg, url, line, col, error) {
    var extra = !col ? '' : '\ncolumn: ' + col;
    extra += !error ? '' : '\nerror: ' + error;
    alert("JS ERROR:\n" + msg + "\nurl: " + url + "\nline: " + line + extra);
    return false;
};

var appState = {
    activeTab: 'dashboard',
    previousLocalTab: 'dashboard',
    notes: [],
    activeNoteId: null,
    saveTimeout: null,
    isDarkMode: false,
    isOnline: true,
    
    // Sketchpad Drawing State
    isDrawing: false,
    currentTool: 'pen', // 'pen', 'eraser'
    currentSize: 3,
    currentEraserSize: 12,
    currentColor: '#2d3748',
    lastX: 0,
    lastY: 0,
    
    // Editor Active Tool State ('text', 'pen', 'eraser')
    activeTool: 'pen',

    // Reader Zoom and Full Screen State
    zoomLevels: {
        lectures: 100,
        bhajans: 100,
        reading: 100,
        calendar: 100
    },
    isFullscreen: false
};

// Target Embedded Iframe URLs
var WEBVIEW_URLS = {
    lectures: 'https://audio.iskcondesiretree.com/',
    bhajans: 'https://audio.iskcondesiretree.com/index.php?q=f&f=%2F05_-_ISKCON_Chowpatty%2F00_-_Bhajans%2F01_-_Vaishnava_Bhajans',
    reading: 'https://vedabase.io/en/',
    calendar: 'http://www.vaisnavacalendar.com/197/'
};

// Preconfigured Quick Bookmarks
var BOOKMARKS = [
    { name: 'Bhagavad-gita', tab: 'reading', url: 'https://vedabase.io/en/library/bg/' },
    { name: 'Srimad Bhagavatam', tab: 'reading', url: 'https://vedabase.io/en/library/sb/' },
    { name: 'Vaishnava Songs', tab: 'bhajans', url: 'https://audio.iskcondesiretree.com/index.php?q=f&f=%2F05_-_ISKCON_Chowpatty%2F00_-_Bhajans%2F01_-_Vaishnava_Bhajans' },
    { name: 'Prabhupada Lectures', tab: 'lectures', url: 'https://audio.iskcondesiretree.com/index.php?q=f&f=%2F01_-_Srila_Prabhupada' },
    { name: 'Festival Calendar', tab: 'calendar', url: 'http://www.vaisnavacalendar.com/197/' }
];

var BVApp = {
    // Constructor / Entry Point
    initialize: function() {
        document.addEventListener('deviceready', this.onDeviceReady.bind(this), false);
        document.addEventListener('resume', this.onResume.bind(this), false);
        
        // Browser fallback (in case it is tested in a web browser)
        if (!window.cordova) {
            this.onDeviceReady();
        }
    },

    onResume: function() {
        this.initTheme();
    },

    preloadIframes: function() {
        var self = this;
        if (!navigator.onLine) return;

        var remoteTabs = ['lectures', 'bhajans', 'reading', 'calendar'];
        for (var idx = 0; idx < remoteTabs.length; idx++) {
            (function(tabId, index) {
                setTimeout(function() {
                    var iframe = document.getElementById('iframe-' + tabId);
                    if (iframe && iframe.getAttribute('data-loaded') !== 'true') {
                        var targetUrl = localStorage.getItem('bv_last_url_' + tabId) || WEBVIEW_URLS[tabId];
                        iframe.setAttribute('data-loaded', 'true');
                        
                        // Setup spinner
                        var spinner = document.getElementById('spinner-' + tabId);
                        if (spinner) {
                            spinner.style.opacity = '1';
                            spinner.classList.remove('hidden');
                        }
                        if (!iframe.getAttribute('data-bound')) {
                            iframe.setAttribute('data-bound', 'true');
                            iframe.onload = function() {
                                var sNode = document.getElementById('spinner-' + tabId);
                                if (sNode) {
                                    sNode.style.opacity = '0';
                                    setTimeout(function() {
                                        sNode.classList.add('hidden');
                                    }, 300);
                                }
                            };
                        }
                        iframe.src = targetUrl;
                    }
                }, 1000 + (index * 800)); // Stagger by 800ms
            })(remoteTabs[idx], idx);
        }
    },

    onDeviceReady: function() {
        var self = this;

        // Cache DOM elements
        this.canvasElement = document.getElementById('note-canvas');
        this.canvasContext = this.canvasElement ? this.canvasElement.getContext('2d') : null;
        this.statusNode = document.getElementById('editor-status');
        this.noteTitleInput = document.getElementById('note-title-input');
        this.noteContentInput = document.getElementById('note-content-input');
        this.dateDisplayNode = document.getElementById('note-date-display');
        this.pinBtn = document.getElementById('btn-editor-pin');
        this.headerTitleNode = document.getElementById('header-title');
        this.homeBtn = document.getElementById('btn-home');
        this.refreshBtn = document.getElementById('btn-refresh');

        this.initTheme();
        this.initOfflineDetection();
        this.initNotes();
        this.renderBookmarks();
        this.bindEvents();
        this.initCanvasEvents();
        this.preloadIframes();

        // Initialize Reader controls (Zoom, Fullscreen)
        this.initZoom();
        this.initFullScreen();
        this.initScrollLock();

        // Bind resize event to adjust note canvas bounds dynamically
        window.addEventListener('resize', function() {
            self.resizeCanvasContainer();
        });

        // Hide Splash Screen after 0.6 seconds (600ms) for much faster startup
        setTimeout(function() {
            var splash = document.getElementById('splash-screen');
            if (splash) {
                splash.style.opacity = '0';
                setTimeout(function() {
                    if (splash.parentNode) {
                        splash.parentNode.removeChild(splash);
                    }
                }, 500); // Wait for CSS opacity transition to complete
            }
        }, 600);

        // Tab memory: Re-open the app on the last visited tab (Default to dashboard)
        var savedTab = localStorage.getItem('bv_active_tab') || 'dashboard';
        this.switchTab(savedTab);
    },

    // --- UI Navigation Engine ---
    bindEvents: function() {
        var self = this;

        // Bottom Tab Bar Navigation
        var tabs = document.querySelectorAll('.nav-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].addEventListener('click', function(e) {
                var tabId = this.getAttribute('data-tab');
                self.switchTab(tabId);
            });
        }

        // Dashboard Card Navigation
        var cards = document.querySelectorAll('.dash-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].addEventListener('click', function(e) {
                var targetId = this.getAttribute('data-target');
                self.switchTab(targetId);
            });
        }

        // Header Action Buttons
        document.getElementById('btn-home').addEventListener('click', function() {
            self.switchTab('dashboard');
        });

        document.getElementById('btn-refresh').addEventListener('click', function() {
            self.refreshActiveView();
        });

        document.getElementById('btn-theme').addEventListener('click', function() {
            self.toggleTheme();
        });

        // "Retry Connection" Helper View Action Buttons (Offline view)
        var retryBtns = document.querySelectorAll('.btn-retry-connection');
        for (var i = 0; i < retryBtns.length; i++) {
            retryBtns[i].addEventListener('click', function() {
                var tabId = this.getAttribute('data-tab');
                
                // Refresh connectivity check
                appState.isOnline = navigator.onLine;
                if (appState.isOnline) {
                    self.switchTab(tabId); // Success, reload tab
                } else {
                    alert('Still offline. Please check your internet connection and try again.');
                }
            });
        }

        // Local Notes Search
        var searchInput = document.getElementById('notes-search-input');
        var clearSearchBtn = document.getElementById('btn-clear-search');
        
        searchInput.addEventListener('input', function() {
            var val = this.value;
            if (val.length > 0) {
                clearSearchBtn.classList.remove('hidden');
            } else {
                clearSearchBtn.classList.add('hidden');
            }
            self.renderNotesList(val);
        });

        clearSearchBtn.addEventListener('click', function() {
            searchInput.value = '';
            this.classList.add('hidden');
            self.renderNotesList('');
            searchInput.focus();
        });

        // Create Note button
        document.getElementById('btn-new-note').addEventListener('click', function() {
            self.openEditor(null);
        });

        // Notes Editor controls
        document.getElementById('btn-editor-back').addEventListener('click', function() {
            self.closeEditor();
        });

        document.getElementById('btn-editor-pin').addEventListener('click', function() {
            self.togglePin(appState.activeNoteId);
        });

        document.getElementById('btn-editor-delete').addEventListener('click', function() {
            self.deleteNote(appState.activeNoteId);
        });

        // Unified Ribbon Tool Selection row click handlers
        var btnToolText = document.getElementById('btn-tool-text');
        if (btnToolText) {
            btnToolText.addEventListener('click', function() {
                self.setActiveTool('text');
            });
        }
        document.getElementById('btn-tool-pen').addEventListener('click', function() {
            self.setActiveTool('pen');
        });
        document.getElementById('btn-tool-eraser').addEventListener('click', function() {
            self.setActiveTool('eraser');
        });
        document.getElementById('btn-tool-clear').addEventListener('click', function() {
            var confirmed = confirm('Clear the entire drawing area?');
            if (confirmed) {
                self.clearCanvas();
            }
        });

        // Text formatting control event listeners
        var btnTextBold = document.getElementById('btn-text-bold');
        if (btnTextBold) {
            btnTextBold.addEventListener('click', function() {
                var note = self.findNoteById(appState.activeNoteId);
                if (note) {
                    note.bold = !note.bold;
                    if (note.bold) this.classList.add('active');
                    else this.classList.remove('active');
                    self.applyTextFormatting(note);
                    self.triggerAutoSave();
                }
            });
        }

        var btnTextItalic = document.getElementById('btn-text-italic');
        if (btnTextItalic) {
            btnTextItalic.addEventListener('click', function() {
                var note = self.findNoteById(appState.activeNoteId);
                if (note) {
                    note.italic = !note.italic;
                    if (note.italic) this.classList.add('active');
                    else this.classList.remove('active');
                    self.applyTextFormatting(note);
                    self.triggerAutoSave();
                }
            });
        }



        var selectTextSize = document.getElementById('select-text-size');
        if (selectTextSize) {
            selectTextSize.addEventListener('change', function() {
                var note = self.findNoteById(appState.activeNoteId);
                if (note) {
                    note.fontSize = this.value;
                    self.applyTextFormatting(note);
                    self.triggerAutoSave();
                }
            });
        }

        var textSwatches = document.querySelectorAll('.text-color-swatch');
        for (var i = 0; i < textSwatches.length; i++) {
            textSwatches[i].addEventListener('click', function() {
                var note = self.findNoteById(appState.activeNoteId);
                if (note) {
                    for (var j = 0; j < textSwatches.length; j++) {
                        textSwatches[j].classList.remove('active');
                    }
                    this.classList.add('active');
                    note.textColor = this.getAttribute('data-color');
                    self.applyTextFormatting(note);
                    self.triggerAutoSave();
                }
            });
        }

        // Notes Editor inputs (for auto-saving)
        var titleField = document.getElementById('note-title-input');
        var contentField = document.getElementById('note-content-input');

        if (titleField) {
            titleField.addEventListener('input', function() {
                self.triggerAutoSave();
            });
        }
        if (contentField) {
            contentField.addEventListener('input', function() {
                self.triggerAutoSave();
            });
        }

        // Catch clicks on Dashboard Recent Note Card
        var dashRecentNote = document.getElementById('dash-recent-note');
        if (dashRecentNote) {
            dashRecentNote.addEventListener('click', function() {
                if (appState.notes.length > 0) {
                    // Find latest modified note
                    var sorted = appState.notes.slice().sort(function(a, b) {
                        return b.modified - a.modified;
                    });
                    self.switchTab('notes');
                    self.openEditor(sorted[0].id);
                }
            });
        }

        // Accordion headers toggle listener (Offline Songbooks & Scriptures)
        var accHeaders = document.querySelectorAll('.accordion-header');
        for (var idx = 0; idx < accHeaders.length; idx++) {
            accHeaders[idx].addEventListener('click', function() {
                var content = this.nextElementSibling;
                if (content) {
                    if (content.classList.contains('active')) {
                        content.classList.remove('active');
                    } else {
                        // Optional: close other accordions in the same list
                        var siblingItems = this.parentNode.parentNode.querySelectorAll('.accordion-content');
                        for (var k = 0; k < siblingItems.length; k++) {
                            siblingItems[k].classList.remove('active');
                        }
                        content.classList.add('active');
                    }
                }
            });
        }
    },

    setActiveTool: function(toolName) {
        appState.activeTool = toolName;
        
        var btnText = document.getElementById('btn-tool-text');
        var btnPen = document.getElementById('btn-tool-pen');
        var btnEraser = document.getElementById('btn-tool-eraser');

        if (btnText) btnText.classList.remove('active');
        if (btnPen) btnPen.classList.remove('active');
        if (btnEraser) btnEraser.classList.remove('active');

        if (toolName === 'text' && btnText) btnText.classList.add('active');
        else if (toolName === 'pen' && btnPen) btnPen.classList.add('active');
        else if (toolName === 'eraser' && btnEraser) btnEraser.classList.add('active');

        // Toggle Formatting Trays
        var trayText = document.getElementById('format-tray-text');
        var trayDraw = document.getElementById('format-tray-draw');
        var trayEraser = document.getElementById('format-tray-eraser');

        if (trayText) trayText.classList.add('hidden');
        if (trayDraw) trayDraw.classList.add('hidden');
        if (trayEraser) trayEraser.classList.add('hidden');

        if (toolName === 'text') {
            if (trayText) trayText.classList.remove('hidden');
        } else if (toolName === 'pen') {
            if (trayDraw) trayDraw.classList.remove('hidden');
        } else if (toolName === 'eraser') {
            if (trayEraser) trayEraser.classList.remove('hidden');
        }

        // Toggle view-mode class on editor subview to control pointer events
        var editorSubview = document.getElementById('notes-editor-subview');
        if (editorSubview) {
            editorSubview.classList.remove('view-mode-text');
            editorSubview.classList.remove('view-mode-pen');
            editorSubview.classList.remove('view-mode-eraser');
            editorSubview.classList.add('view-mode-' + toolName);
        }

        // Update drawing canvas tool state
        appState.currentTool = toolName;
    },

    // --- Sketchpad Drawing Handlers ---
    initCanvasEvents: function() {
        var self = this;
        var canvas = this.canvasElement;
        if (!canvas) return;

        // Formats Select & swatches
        var selectBrushSize = document.getElementById('select-brush-size');
        var selectEraserSize = document.getElementById('select-eraser-size');
        var swatches = document.querySelectorAll('.color-swatch');

        // Size changes
        if (selectBrushSize) {
            selectBrushSize.addEventListener('change', function() {
                appState.currentSize = parseInt(this.value, 10);
            });
        }
        if (selectEraserSize) {
            selectEraserSize.addEventListener('change', function() {
                appState.currentEraserSize = parseInt(this.value, 10);
            });
        }

        // Color Swatches
        for (var i = 0; i < swatches.length; i++) {
            swatches[i].addEventListener('click', function() {
                for (var j = 0; j < swatches.length; j++) {
                    swatches[j].classList.remove('active');
                }
                this.classList.add('active');
                
                appState.currentColor = this.getAttribute('data-color');
                
                // If currently eraser, switch back to pen automatically
                if (appState.currentTool === 'eraser') {
                    self.setActiveTool('pen');
                }
            });
        }

        // Draw Touch Events (passive: false is REQUIRED to allow e.preventDefault() to block scrolling)
        canvas.addEventListener('touchstart', function(e) {
            self.startDrawing(e);
        }, { capture: false, passive: false });
        canvas.addEventListener('touchmove', function(e) {
            self.draw(e);
        }, { capture: false, passive: false });
        canvas.addEventListener('touchend', function(e) {
            self.stopDrawing();
        }, { capture: false, passive: false });
        canvas.addEventListener('touchcancel', function(e) {
            self.stopDrawing();
        }, { capture: false, passive: false });

        // Draw Mouse Events
        canvas.addEventListener('mousedown', function(e) {
            self.startDrawing(e);
        }, false);
        canvas.addEventListener('mousemove', function(e) {
            self.draw(e);
        }, false);
        canvas.addEventListener('mouseup', function(e) {
            self.stopDrawing();
        }, false);
        canvas.addEventListener('mouseleave', function(e) {
            self.stopDrawing();
        }, false);

        // Clear Button listener
        var clearBtn = document.getElementById('btn-tool-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                self.clearCanvas();
            });
        }
    },

    clearCanvas: function() {
        var canvas = this.canvasElement;
        if (!canvas) return;
        var ctx = this.canvasContext;
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Clear base64 image link
        var note = this.findNoteById(appState.activeNoteId);
        if (note) {
            note.image = null;
        }
        this.triggerAutoSave();
    },

    getCoords: function(e) {
        var canvas = this.canvasElement;
        if (!canvas) return { x: 0, y: 0 };
        var rect = this.cachedCanvasRect || canvas.getBoundingClientRect();
        var clientX, clientY;
        
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        var x = rect.width ? (clientX - rect.left) * (canvas.width / rect.width) : 0;
        var y = rect.height ? (clientY - rect.top) * (canvas.height / rect.height) : 0;
        
        return { x: x, y: y };
    },

    startDrawing: function(e) {
        e.preventDefault();
        appState.isDrawing = true;
        
        if (this.canvasElement) {
            this.cachedCanvasRect = this.canvasElement.getBoundingClientRect();
        }
        
        var coords = this.getCoords(e);
        appState.lastX = coords.x;
        appState.lastY = coords.y;
    },

    draw: function(e) {
        if (!appState.isDrawing) return;
        e.preventDefault();

        var canvas = this.canvasElement;
        if (!canvas) return;
        var ctx = this.canvasContext;
        if (!ctx) return;
        var coords = this.getCoords(e);

        ctx.beginPath();
        ctx.moveTo(appState.lastX, appState.lastY);
        ctx.lineTo(coords.x, coords.y);

        if (appState.currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = appState.currentEraserSize || 12;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = appState.currentColor;
            ctx.lineWidth = appState.currentSize;
        }

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        appState.lastX = coords.x;
        appState.lastY = coords.y;

        appState.canvasHasDrawing = true;
    },

    stopDrawing: function() {
        if (appState.isDrawing) {
            appState.isDrawing = false;
            this.triggerAutoSave();
        }
    },

    // --- Tab Switching Logic ---
    switchTab: function(tabId, customUrl) {
        appState.activeTab = tabId;

        // Remember the last active tab (excluding remote deep link launches)
        if (!customUrl) {
            localStorage.setItem('bv_active_tab', tabId);
        }

        // Save local tab history
        if (tabId === 'dashboard' || tabId === 'notes') {
            appState.previousLocalTab = tabId;
        }

        // Reader Tools Bar show/hide and Zoom Level synchronization
        var readerBar = document.getElementById('reader-tools-bar');
        var appContent = document.querySelector('.app-content');
        var remoteTabs = ['lectures', 'bhajans', 'reading', 'calendar'];
        
        if (remoteTabs.indexOf(tabId) !== -1) {
            if (readerBar) readerBar.classList.remove('hidden');
            if (appContent) appContent.classList.add('show-reader-bar');
            
            // Sync slider and text to zoom level
            var savedZoom = localStorage.getItem('bv_zoom_' + tabId);
            var zoomVal = savedZoom ? parseInt(savedZoom, 10) : (appState.zoomLevels[tabId] || 100);
            appState.zoomLevels[tabId] = zoomVal;
            
            var slider = document.getElementById('slider-zoom');
            if (slider) slider.value = zoomVal;
            var zoomIndicator = document.getElementById('zoom-value');
            if (zoomIndicator) zoomIndicator.innerText = zoomVal + '%';
            
            this.updateZoom(tabId, zoomVal);
        } else {
            if (readerBar) readerBar.classList.add('hidden');
            if (appContent) appContent.classList.remove('show-reader-bar');
        }

        // 1. Update active tab UI in bottom bar
        var tabs = document.querySelectorAll('.nav-tab');
        for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].getAttribute('data-tab') === tabId) {
                tabs[i].classList.add('active');
            } else {
                tabs[i].classList.remove('active');
            }
        }

        // 2. Switch main viewport
        var views = document.querySelectorAll('.content-view');
        for (var i = 0; i < views.length; i++) {
            views[i].classList.remove('active');
        }
        
        var activeView = document.getElementById('view-' + tabId);
        if (activeView) {
            activeView.classList.add('active');
        }

        // 3. Update Header styling & title
        var titleNode = this.headerTitleNode;
        var homeBtn = this.homeBtn;
        var refreshBtn = this.refreshBtn;

        if (tabId === 'dashboard') {
            titleNode.innerText = 'Bhakti Vedanta App';
            homeBtn.classList.add('hidden');
            refreshBtn.classList.add('hidden');
        } else {
            homeBtn.classList.remove('hidden');
            refreshBtn.classList.remove('hidden');

            if (tabId === 'notes') {
                titleNode.innerText = 'My Notes';
                refreshBtn.classList.add('hidden');
                // Ensure subview list is default when switching to tab
                document.getElementById('notes-list-subview').classList.add('active');
                document.getElementById('notes-editor-subview').classList.remove('active');
                this.renderNotesList('');
            } else if (tabId === 'lectures') titleNode.innerText = 'Lectures';
            else if (tabId === 'bhajans') titleNode.innerText = 'Bhajans';
            else if (tabId === 'reading') titleNode.innerText = 'Reading';
            else if (tabId === 'calendar') titleNode.innerText = 'Calendar';
        }

        // 4. Trigger iframe load for remote tabs (with connectivity support)
        if (tabId === 'lectures' || tabId === 'bhajans' || tabId === 'reading' || tabId === 'calendar') {
            var onlinePanel = document.querySelector('#view-' + tabId + ' .online-state');
            var offlinePanel = document.querySelector('#view-' + tabId + ' .offline-state');

            // Sync connection check
            appState.isOnline = navigator.onLine;

            if (appState.isOnline) {
                onlinePanel.classList.remove('hidden');
                offlinePanel.classList.add('hidden');

                var iframe = document.getElementById('iframe-' + tabId);
                if (iframe) {
                    var targetUrl = customUrl || localStorage.getItem('bv_last_url_' + tabId) || WEBVIEW_URLS[tabId];
                    
                    // Save last URL loaded
                    localStorage.setItem('bv_last_url_' + tabId, targetUrl);

                    // Check if it's not loaded yet, or if a customUrl is forced
                    if (customUrl || iframe.getAttribute('data-loaded') !== 'true') {
                        // Display spinner
                        var spinner = document.getElementById('spinner-' + tabId);
                        if (spinner) {
                            spinner.style.opacity = '1';
                            spinner.classList.remove('hidden');
                        }

                        // Attach onload event to clear spinner
                        if (!iframe.getAttribute('data-bound')) {
                            iframe.setAttribute('data-bound', 'true');
                            iframe.onload = function() {
                                var sNode = document.getElementById('spinner-' + tabId);
                                if (sNode) {
                                    sNode.style.opacity = '0';
                                    setTimeout(function() {
                                        sNode.classList.add('hidden');
                                    }, 300);
                                }
                            };
                        }

                        iframe.setAttribute('data-loaded', 'true');
                        iframe.src = targetUrl;
                    }
                }
            } else {
                onlinePanel.classList.add('hidden');
                offlinePanel.classList.remove('hidden');
            }
        }

        // 5. Update dashboard contents when returning to it
        if (tabId === 'dashboard') {
            this.renderRecentNoteOnDashboard();
        }


    },

    refreshActiveView: function() {
        var tabId = appState.activeTab;
        if (tabId === 'lectures' || tabId === 'bhajans' || tabId === 'reading' || tabId === 'calendar') {
            var iframe = document.getElementById('iframe-' + tabId);
            if (iframe) {
                // Show loader again
                var spinner = document.getElementById('spinner-' + tabId);
                if (spinner) {
                    spinner.style.opacity = '1';
                    spinner.classList.remove('hidden');
                }
                
                // Force reload src
                iframe.src = iframe.src;
            }
        }
    },

    // --- Bookmarks rendering ---
    renderBookmarks: function() {
        var container = document.getElementById('quick-links-list');
        if (!container) return;

        container.innerHTML = '';
        var self = this;

        BOOKMARKS.forEach(function(bm) {
            var btn = document.createElement('button');
            btn.className = 'bookmark-btn';
            
            var emoji = '🔖';
            if (bm.tab === 'lectures') emoji = '🎧';
            else if (bm.tab === 'bhajans') emoji = '🎵';
            else if (bm.tab === 'reading') emoji = '📖';
            else if (bm.tab === 'calendar') emoji = '📅';

            btn.innerHTML = '<span class="bookmark-icon">' + emoji + '</span>' + bm.name;
            
            btn.addEventListener('click', function() {
                self.switchTab(bm.tab, bm.url);
            });

            container.appendChild(btn);
        });
    },

    // --- Offline Status Indicator ---
    initOfflineDetection: function() {
        var self = this;
        
        var updateOnline = function() {
            appState.isOnline = navigator.onLine;
            var indicator = document.getElementById('offline-indicator');
            if (indicator) {
                if (appState.isOnline) {
                    indicator.classList.add('hidden');
                } else {
                    indicator.classList.remove('hidden');
                }
            }

            // If we suddenly return online, refresh active tab templates
            if (appState.isOnline) {
                var tabId = appState.activeTab;
                if (tabId === 'lectures' || tabId === 'bhajans' || tabId === 'reading' || tabId === 'calendar') {
                    self.switchTab(tabId);
                }
            }
        };

        window.addEventListener('online', updateOnline);
        window.addEventListener('offline', updateOnline);
        updateOnline(); // Trigger initial check
    },

    // --- Theme Engine (Light / Dark Mode) ---
    initTheme: function() {
        var savedTheme = localStorage.getItem('bv_theme');
        
        if (!savedTheme) {
            // Automatic time-based detection
            var hour = new Date().getHours();
            // Daytime (6 AM to 6 PM) => light mode, Nighttime (before 6 AM or after 6 PM) => dark mode
            var isNight = (hour < 6 || hour >= 18);
            savedTheme = isNight ? 'dark' : 'light';
        }
        
        this.applyTheme(savedTheme);
    },

    applyTheme: function(theme) {
        var moon = document.getElementById('theme-moon');
        var sun = document.getElementById('theme-sun');

        if (theme === 'dark') {
            appState.isDarkMode = true;
            document.body.classList.add('dark-mode');
            if (moon) moon.classList.add('hidden');
            if (sun) sun.classList.remove('hidden');
        } else {
            appState.isDarkMode = false;
            document.body.classList.remove('dark-mode');
            if (moon) moon.classList.remove('hidden');
            if (sun) sun.classList.add('hidden');
        }
    },

    toggleTheme: function() {
        var targetTheme = appState.isDarkMode ? 'light' : 'dark';
        localStorage.setItem('bv_theme', targetTheme);
        this.applyTheme(targetTheme);
    },

    // --- Local Notes Engine ---
    initNotes: function() {
        this.loadNotes();
        this.renderRecentNoteOnDashboard();
    },

    loadNotes: function() {
        try {
            var raw = localStorage.getItem('bv_notes');
            if (raw) {
                var parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    // Safe filter: ensure every note is a non-null object with an ID
                    appState.notes = parsed.filter(function(note) {
                        return note && typeof note === 'object' && note.id;
                    });
                } else {
                    appState.notes = [];
                }
            } else {
                appState.notes = [];
            }
        } catch(e) {
            console.error('Failed to parse notes:', e);
            appState.notes = [];
        }
    },

    saveNotes: function() {
        try {
            localStorage.setItem('bv_notes', JSON.stringify(appState.notes));
        } catch(e) {
            console.error('Failed to save notes:', e);
        }
    },

    renderNotesList: function(filterText) {
        var container = document.getElementById('notes-grid');
        if (!container) return;

        container.innerHTML = '';
        var self = this;
        var query = (filterText || '').toLowerCase().trim();

        // Filter
        var filtered = appState.notes.filter(function(note) {
            return (note.title || '').toLowerCase().indexOf(query) !== -1 || 
                   (note.content || '').toLowerCase().indexOf(query) !== -1;
        });

        // Sort: Pinned first, then modification timestamp descending
        filtered.sort(function(a, b) {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return b.modified - a.modified;
        });

        if (filtered.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerText = query ? 'No matching notes found.' : 'No notes created yet. Click the "+" button below.';
            container.appendChild(empty);
            return;
        }

        filtered.forEach(function(note) {
            var card = document.createElement('div');
            card.className = 'note-card';
            if (note.pinned) card.classList.add('pinned');

            var formattedDate = self.formatDateString(note.modified);
            var titleText = self.escapeHTML(note.title || 'Untitled');
            var previewText = self.escapeHTML(note.content || 'No description');

            // Limit preview length
            if (previewText.length > 80) {
                previewText = previewText.substring(0, 80) + '...';
            }

            var pinIcon = note.pinned ? '<span class="pin-indicator">📌</span>' : '';
            
            // Render canvas sketch transparent overlay on top of note card text
            var sketchOverlayHtml = '';
            if (note.image) {
                sketchOverlayHtml = '<div class="note-card-sketch-overlay"><img src="' + note.image + '" alt="Sketch overlay"></div>';
            }

            // Apply text color, bold, and italic styles inside note preview
            var cardBold = note.bold ? 'font-weight: bold;' : '';
            var cardItalic = note.italic ? 'font-style: italic;' : '';
            var cardColor = note.textColor ? 'color: ' + note.textColor + ';' : '';
            var previewStyle = ' style="' + cardBold + cardItalic + cardColor + '"';

            card.innerHTML = 
                '<div class="note-card-header">' +
                    '<h4 class="note-title">' + titleText + '</h4>' +
                    pinIcon +
                '</div>' +
                '<div class="note-card-body-container">' +
                    '<p class="note-preview"' + previewStyle + '>' + previewText + '</p>' +
                    sketchOverlayHtml +
                '</div>' +
                '<div class="note-date">' + formattedDate + '</div>';

            card.addEventListener('click', function() {
                self.openEditor(note.id);
            });

            container.appendChild(card);
        });
    },

    renderRecentNoteOnDashboard: function() {
        var dashContainer = document.getElementById('dash-recent-note');
        if (!dashContainer) return;

        if (appState.notes.length === 0) {
            dashContainer.innerHTML = '<div class="empty-state">No notes created yet. Tap "My Notes" below to start.</div>';
            return;
        }

        // Find the latest modified note
        var sorted = appState.notes.slice().sort(function(a, b) {
            return b.modified - a.modified;
        });

        var latest = sorted[0];
        var titleText = this.escapeHTML(latest.title || 'Untitled');
        var previewText = this.escapeHTML(latest.content || 'No content written');
        if (previewText.length > 120) {
            previewText = previewText.substring(0, 120) + '...';
        }
        var formattedDate = this.formatDateString(latest.modified);
        var pinIcon = latest.pinned ? ' 📌' : '';

        // Sketch transparent overlay on top of recent note on Dashboard
        var sketchHtml = '';
        if (latest.image) {
            sketchHtml = '<div class="recent-note-sketch-overlay"><img src="' + latest.image + '" alt="Sketch overlay"></div>';
        }

        // Apply text color, bold, and italic styles inside recent note dashboard preview
        var cardBold = latest.bold ? 'font-weight: bold;' : '';
        var cardItalic = latest.italic ? 'font-style: italic;' : '';
        var cardColor = latest.textColor ? 'color: ' + latest.textColor + ';' : '';
        var previewStyle = ' style="' + cardBold + cardItalic + cardColor + '"';

        dashContainer.innerHTML = 
            '<div class="recent-note-body-wrapper">' +
                '<div class="recent-note-header">' +
                    '<span class="recent-note-title">' + titleText + pinIcon + '</span>' +
                    '<span class="recent-note-date">' + formattedDate + '</span>' +
                '</div>' +
                '<div class="recent-note-content-layered">' +
                    '<p class="recent-note-body"' + previewStyle + '>' + previewText + '</p>' +
                    sketchHtml +
                '</div>' +
            '</div>';
    },

    // --- Notes Editor Sub-view Control ---
    openEditor: function(noteId) {
        var self = this;
        var titleField = this.noteTitleInput;
        var dateDisplay = this.dateDisplayNode;
        var pinBtn = this.pinBtn;
        var canvas = this.canvasElement;
        var ctx = this.canvasContext;

        document.getElementById('notes-list-subview').classList.remove('active');
        document.getElementById('notes-editor-subview').classList.add('active');

        // Clear canvas context to prevent bleed through
        if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        // Reset Ribbon Tool Selection to 'pen' default
        this.setActiveTool('pen');

        // Reset brush tool settings in UI
        appState.currentColor = '#2d3748';
        appState.currentSize = 3;
        appState.currentEraserSize = 12;
        
        var swatches = document.querySelectorAll('.color-swatch');
        for (var i = 0; i < swatches.length; i++) {
            if (swatches[i].getAttribute('data-color') === '#2d3748') {
                swatches[i].classList.add('active');
            } else {
                swatches[i].classList.remove('active');
            }
        }
        var selectBrushSize = document.getElementById('select-brush-size');
        if (selectBrushSize) selectBrushSize.value = '3';
        var selectEraserSize = document.getElementById('select-eraser-size');
        if (selectEraserSize) selectEraserSize.value = '12';

        if (noteId === null) {
            // New Note
            var newNote = {
                id: 'note_' + Date.now(),
                title: '',
                content: '',
                image: null,
                bold: false,
                italic: false,
                fontSize: '15px',
                textColor: '#2d3748',
                created: Date.now(),
                modified: Date.now(),
                pinned: false
            };
            appState.notes.push(newNote);
            appState.activeNoteId = newNote.id;
            this.saveNotes();
            appState.canvasHasDrawing = false;

            if (titleField) titleField.value = '';
            if (this.noteContentInput) this.noteContentInput.value = '';
            if (dateDisplay) dateDisplay.innerText = this.formatDateString(newNote.created);
            if (pinBtn) {
                pinBtn.classList.remove('pinned');
                pinBtn.title = 'Pin Note';
            }
            
            this.applyTextFormatting(newNote);
            
            // Resize canvas container to prevent stretching and overflow
            this.resizeCanvasContainer();
        } else {
            // Edit existing note
            appState.activeNoteId = noteId;
            var note = this.findNoteById(noteId);
            if (note) {
                if (titleField) titleField.value = note.title || '';
                if (this.noteContentInput) this.noteContentInput.value = note.content || '';
                if (dateDisplay) dateDisplay.innerText = 'Last modified: ' + this.formatDateString(note.modified);
                
                if (pinBtn) {
                    if (note.pinned) {
                        pinBtn.classList.add('pinned');
                        pinBtn.title = 'Unpin Note';
                    } else {
                        pinBtn.classList.remove('pinned');
                        pinBtn.title = 'Pin Note';
                    }
                }

                this.applyTextFormatting(note);

                // Resize canvas container to prevent stretching and overflow
                this.resizeCanvasContainer();

                // Load existing canvas drawing
                if (note.image && ctx) {
                    var img = new Image();
                    img.onload = function() {
                        if (ctx) ctx.drawImage(img, 0, 0);
                    };
                    img.src = note.image;
                    appState.canvasHasDrawing = true;
                } else {
                    appState.canvasHasDrawing = false;
                }
            }
        }

        // Set state status in editor toolbar
        var statusNode = document.getElementById('editor-status');
        if (statusNode) statusNode.innerText = 'Saved';
    },

    closeEditor: function() {
        // Clear saves timeouts just in case
        if (appState.saveTimeout) {
            clearTimeout(appState.saveTimeout);
            this.saveNoteDataImmediately();
        }

        appState.activeNoteId = null;
        document.getElementById('notes-editor-subview').classList.remove('active');
        document.getElementById('notes-list-subview').classList.add('active');

        // Cleanup empty notes
        this.cleanupEmptyNotes();

        this.renderNotesList('');
        this.renderRecentNoteOnDashboard();
    },

    triggerAutoSave: function() {
        var statusNode = this.statusNode;
        if (statusNode && statusNode.innerText !== 'Saving...') {
            statusNode.innerText = 'Saving...';
        }

        var self = this;
        if (appState.saveTimeout) {
            clearTimeout(appState.saveTimeout);
        }

        // Debounce autosave to 800ms
        appState.saveTimeout = setTimeout(function() {
            self.saveNoteDataImmediately();
        }, 800);
    },

    saveNoteDataImmediately: function() {
        var note = this.findNoteById(appState.activeNoteId);
        if (note) {
            var titleField = this.noteTitleInput;
            var contentField = this.noteContentInput;
            var canvas = this.canvasElement;
            
            note.title = titleField ? titleField.value.trim() : '';
            note.content = contentField ? contentField.value : '';
            note.modified = Date.now();

            // Export canvas content as base64 PNG data URL if user drew anything
            if (canvas && appState.canvasHasDrawing) {
                note.image = canvas.toDataURL();
            } else {
                note.image = null;
            }
            
            this.saveNotes();

            if (this.statusNode) {
                this.statusNode.innerText = 'Saved';
            }
            if (this.dateDisplayNode) {
                this.dateDisplayNode.innerText = 'Last modified: ' + this.formatDateString(note.modified);
            }
        }
    },

    togglePin: function(noteId) {
        var note = this.findNoteById(noteId);
        if (note) {
            note.pinned = !note.pinned;
            note.modified = Date.now();
            this.saveNotes();

            var pinBtn = document.getElementById('btn-editor-pin');
            if (note.pinned) {
                pinBtn.classList.add('pinned');
                pinBtn.title = 'Unpin Note';
            } else {
                pinBtn.classList.remove('pinned');
                pinBtn.title = 'Pin Note';
            }
            
            document.getElementById('editor-status').innerText = 'Saved';
        }
    },

    deleteNote: function(noteId) {
        if (!noteId) return;

        var confirmed = confirm('Are you sure you want to delete this note?');
        if (confirmed) {
            appState.notes = appState.notes.filter(function(note) {
                return note.id !== noteId;
            });
            this.saveNotes();
            
            // Clear active status
            appState.activeNoteId = null;
            
            // Return to list view
            document.getElementById('notes-editor-subview').classList.remove('active');
            document.getElementById('notes-list-subview').classList.add('active');
            
            this.renderNotesList('');
            this.renderRecentNoteOnDashboard();
        }
    },

    cleanupEmptyNotes: function() {
        // Remove notes with empty title, empty content, and empty canvas
        appState.notes = appState.notes.filter(function(note) {
            return (note.title || '').trim().length > 0 || 
                   (note.content || '').trim().length > 0 || 
                   note.image !== null;
        });
        this.saveNotes();
    },

    // --- Helper Functions ---
    findNoteById: function(noteId) {
        for (var i = 0; i < appState.notes.length; i++) {
            if (appState.notes[i].id === noteId) {
                return appState.notes[i];
            }
        }
        return null;
    },

    formatDateString: function(timestamp) {
        var date = new Date(timestamp);
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var month = months[date.getMonth()];
        var day = date.getDate();
        var year = date.getFullYear();
        var hours = date.getHours();
        var minutes = date.getMinutes();

        // Padding
        if (minutes < 10) minutes = '0' + minutes;
        
        return month + ' ' + day + ', ' + year + ' ' + hours + ':' + minutes;
    },



    resizeCanvasContainer: function() {
        var container = document.querySelector('.editor-workspace-container');
        if (!container) return;
        var parent = container.parentNode; // .editor-body
        if (!parent) return;
        
        // Calculate occupied height by siblings in the editor body
        var siblings = parent.children;
        var occupiedHeight = 0;
        for (var i = 0; i < siblings.length; i++) {
            var sibling = siblings[i];
            if (sibling !== container && !sibling.classList.contains('hidden') && sibling.style.display !== 'none') {
                occupiedHeight += sibling.offsetHeight;
                var style = window.getComputedStyle(sibling);
                occupiedHeight += parseInt(style.marginTop || 0, 10) + parseInt(style.marginBottom || 0, 10);
            }
        }
        
        var parentStyle = window.getComputedStyle(parent);
        var parentPaddingY = parseInt(parentStyle.paddingTop || 0, 10) + parseInt(parentStyle.paddingBottom || 0, 10);
        var parentHeight = parent.clientHeight - parentPaddingY;
        
        var availHeight = parentHeight - occupiedHeight - 15; // 15px safety margin
        var availWidth = parent.clientWidth - parseInt(parentStyle.paddingLeft || 0, 10) - parseInt(parentStyle.paddingRight || 0, 10);
        
        if (availHeight < 150) availHeight = 150; // Floor height
        
        // Locked ratio 1.25 (matches 1200x960 resolution)
        var targetRatio = 1.25;
        var w, h;
        
        if (availWidth / availHeight > targetRatio) {
            h = availHeight;
            w = availHeight * targetRatio;
        } else {
            w = availWidth;
            h = availWidth / targetRatio;
        }
        
        container.style.width = w + 'px';
        container.style.height = h + 'px';
    },

    applyTextFormatting: function(note) {
        var textarea = this.noteContentInput;
        if (!textarea) return;
        
        if (note) {
            textarea.style.fontWeight = note.bold ? 'bold' : 'normal';
            textarea.style.fontStyle = note.italic ? 'italic' : 'normal';
            textarea.style.fontSize = note.fontSize || '15px';
            textarea.style.color = note.textColor || '#2d3748';
            // Sync buttons active state
            var btnBold = document.getElementById('btn-text-bold');
            if (btnBold) {
                if (note.bold) btnBold.classList.add('active');
                else btnBold.classList.remove('active');
            }
            var btnItalic = document.getElementById('btn-text-italic');
            if (btnItalic) {
                if (note.italic) btnItalic.classList.add('active');
                else btnItalic.classList.remove('active');
            }
            var selectSize = document.getElementById('select-text-size');
            if (selectSize) {
                selectSize.value = note.fontSize || '15px';
            }
            
            var textSwatches = document.querySelectorAll('.text-color-swatch');
            for (var i = 0; i < textSwatches.length; i++) {
                if (textSwatches[i].getAttribute('data-color') === note.textColor) {
                    textSwatches[i].classList.add('active');
                } else {
                    textSwatches[i].classList.remove('active');
                }
            }
        } else {
            textarea.style.fontWeight = 'normal';
            textarea.style.fontStyle = 'normal';
            textarea.style.fontSize = '15px';
            textarea.style.color = '#2d3748';
            textarea.style.backgroundColor = 'transparent';
        }
    },

    initZoom: function() {
        var self = this;
        var slider = document.getElementById('slider-zoom');
        var zoomVal = document.getElementById('zoom-value');
        var btnOut = document.getElementById('btn-zoom-out');
        var btnIn = document.getElementById('btn-zoom-in');
        
        if (slider) {
            slider.addEventListener('input', function() {
                var val = parseInt(this.value, 10);
                if (zoomVal) zoomVal.innerText = val + '%';
            });
            slider.addEventListener('change', function() {
                var val = parseInt(this.value, 10);
                var activeTab = appState.activeTab;
                if (activeTab === 'lectures' || activeTab === 'bhajans' || activeTab === 'reading' || activeTab === 'calendar') {
                    self.updateZoom(activeTab, val);
                }
            });
        }
        
        if (btnOut) {
            btnOut.addEventListener('click', function() {
                if (slider) {
                    var val = Math.max(50, parseInt(slider.value, 10) - 10);
                    slider.value = val;
                    if (zoomVal) zoomVal.innerText = val + '%';
                    var activeTab = appState.activeTab;
                    if (activeTab === 'lectures' || activeTab === 'bhajans' || activeTab === 'reading' || activeTab === 'calendar') {
                        self.updateZoom(activeTab, val);
                    }
                }
            });
        }
        
        if (btnIn) {
            btnIn.addEventListener('click', function() {
                if (slider) {
                    var val = Math.min(200, parseInt(slider.value, 10) + 10);
                    slider.value = val;
                    if (zoomVal) zoomVal.innerText = val + '%';
                    var activeTab = appState.activeTab;
                    if (activeTab === 'lectures' || activeTab === 'bhajans' || activeTab === 'reading' || activeTab === 'calendar') {
                        self.updateZoom(activeTab, val);
                    }
                }
            });
        }
    },

    updateZoom: function(tabId, zoomPct) {
        appState.zoomLevels[tabId] = zoomPct;
        localStorage.setItem('bv_zoom_' + tabId, zoomPct);
        
        var iframe = document.getElementById('iframe-' + tabId);
        if (!iframe) return;
        
        var scale = zoomPct / 100;
        iframe.style.transform = 'scale(' + scale + ')';
        iframe.style.transformOrigin = 'top left';
        iframe.style.width = (100 / scale) + '%';
        iframe.style.height = (100 / scale) + '%';
    },



    initFullScreen: function() {
        var self = this;
        var btnReaderFS = document.getElementById('btn-reader-fullscreen');
        var btnExitFS = document.getElementById('btn-exit-fullscreen');
        
        var toggleFS = function() {
            appState.isFullscreen = !appState.isFullscreen;
            if (appState.isFullscreen) {
                document.body.classList.add('fullscreen-active');
                if (btnExitFS) btnExitFS.classList.remove('hidden');
            } else {
                document.body.classList.remove('fullscreen-active');
                if (btnExitFS) btnExitFS.classList.add('hidden');
            }
            self.resizeCanvasContainer();
        };
        
        if (btnReaderFS) btnReaderFS.addEventListener('click', toggleFS);
        if (btnExitFS) btnExitFS.addEventListener('click', toggleFS);
    },

    initScrollLock: function() {
        // Prevent viewport rubber-banding/scroll offscreen on iOS and webview container
        document.addEventListener('touchmove', function(e) {
            var target = e.target;
            var isScrollable = false;
            
            // Check if touch originates inside scrollable content containers
            while (target && target !== document.body) {
                if (target.classList && (
                    target.classList.contains('iframe-scroll-wrapper') ||
                    target.classList.contains('offline-scroll-container') ||
                    target.classList.contains('notes-grid-container') ||
                    target.classList.contains('editor-workspace-container') ||
                    target.tagName === 'TEXTAREA'
                )) {
                    isScrollable = true;
                    break;
                }
                target = target.parentNode;
            }
            
            if (!isScrollable) {
                e.preventDefault();
            }
        }, { capture: false, passive: false });
    },

    escapeHTML: function(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};

// Initialize the application
BVApp.initialize();