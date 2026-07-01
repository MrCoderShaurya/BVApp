(function() {
    var app = {
        // App State
        state: {
            activeTab: 'dashboard',
            notes: [],
            editingNoteId: null,
            zoomScale: 1.0,
            activeTool: 'text', // 'text', 'pen', 'eraser'
            penColor: '#000000',
            penThickness: 3,
            isDrawing: false,
            lastX: 0,
            lastY: 0
        },

        // DOM elements cache
        nodes: {},

        // Initialize application
        init: function() {
            document.addEventListener('deviceready', this.onDeviceReady.bind(this), false);
            
            // Fallback if not running in Cordova context
            if (!window.cordova) {
                window.addEventListener('load', this.onDeviceReady.bind(this), false);
            }
        },

        onDeviceReady: function() {
            this.cacheDomNodes();
            this.setupDrawingCanvas();
            this.bindEvents();
            this.loadNotesFromStorage();
            this.renderNotesList();
            
            // Clean active viewport
            this.switchTab('dashboard');
        },

        cacheDomNodes: function() {
            this.nodes.headerTitle = document.getElementById('header-title');
            this.nodes.btnHome = document.getElementById('btn-header-home');
            this.nodes.btnRefresh = document.getElementById('btn-header-refresh');
            this.nodes.btnZoomIn = document.getElementById('btn-zoom-in');
            this.nodes.btnZoomOut = document.getElementById('btn-zoom-out');
            this.nodes.zoomLevel = document.getElementById('zoom-level-indicator');

            this.nodes.views = document.querySelectorAll('.content-view');
            this.nodes.tabs = document.querySelectorAll('.nav-tab');

            this.nodes.zoomInput = document.getElementById('zoom-url-input');
            this.nodes.meetInput = document.getElementById('meet-url-input');
            this.nodes.meetingIframe = document.getElementById('iframe-meeting-portal');
            this.nodes.portalSpinner = document.getElementById('portal-spinner');

            this.nodes.canvas = document.getElementById('note-canvas');
            this.nodes.ctx = this.nodes.canvas ? this.nodes.canvas.getContext('2d') : null;
            this.nodes.noteTextInput = document.getElementById('note-text-input');
            this.nodes.notesContainer = document.getElementById('notes-container');
            this.nodes.searchField = document.getElementById('notes-search-input');
            this.nodes.drawer = document.querySelector('.editor-settings-drawer');
        },

        setupDrawingCanvas: function() {
            var canvas = this.nodes.canvas;
            if (!canvas) return;

            // Set visual bounds to overlay text area exactly
            var rect = canvas.getBoundingClientRect();
            canvas.width = rect.width || 600;
            canvas.height = rect.height || 400;

            // Canvas drawing settings
            var ctx = this.nodes.ctx;
            if (ctx) {
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            }
        },

        bindEvents: function() {
            var self = this;

            // Bottom Navigation Tabs
            for (var i = 0; i < this.nodes.tabs.length; i++) {
                this.nodes.tabs[i].addEventListener('click', function(e) {
                    var tabId = this.getAttribute('data-tab');
                    self.switchTab(tabId);
                });
            }

            // Header Action Buttons
            if (this.nodes.btnHome) {
                this.nodes.btnHome.addEventListener('click', function() {
                    self.switchTab('dashboard');
                });
            }
            if (this.nodes.btnRefresh) {
                this.nodes.btnRefresh.addEventListener('click', function() {
                    if (self.nodes.meetingIframe) {
                        self.showPortalSpinner();
                        self.nodes.meetingIframe.src = self.nodes.meetingIframe.src;
                    }
                });
            }

            // Software zoom controls
            if (this.nodes.btnZoomIn) {
                this.nodes.btnZoomIn.addEventListener('click', function() {
                    self.adjustZoom(0.1);
                });
            }
            if (this.nodes.btnZoomOut) {
                this.nodes.btnZoomOut.addEventListener('click', function() {
                    self.adjustZoom(-0.1);
                });
            }

            // Launcher action hooks
            document.getElementById('btn-launch-zoom-iframe').addEventListener('click', function() {
                var url = self.nodes.zoomInput.value.trim();
                if (!url) return;
                
                // If it's a numeric meeting ID, resolve to standard Zoom web join link
                if (/^\d+$/.test(url.replace(/\s+/g, ''))) {
                    url = 'https://zoom.us/wc/' + url.replace(/\s+/g, '') + '/join';
                }
                self.loadMeetingIframe(url);
            });

            document.getElementById('btn-launch-zoom-native').addEventListener('click', function() {
                var url = self.nodes.zoomInput.value.trim();
                if (!url) return;

                if (/^\d+$/.test(url.replace(/\s+/g, ''))) {
                    // Try to launch zoomus:// scheme
                    window.open('zoomus://zoom.us/join?confno=' + url.replace(/\s+/g, ''), '_system');
                } else {
                    window.open(url, '_system');
                }
            });

            document.getElementById('btn-launch-meet-iframe').addEventListener('click', function() {
                var url = self.nodes.meetInput.value.trim();
                if (!url) return;
                self.loadMeetingIframe(url);
            });

            document.getElementById('btn-launch-meet-native').addEventListener('click', function() {
                var url = self.nodes.meetInput.value.trim();
                if (!url) return;
                window.open(url, '_system');
            });

            // Iframe loaded events to dismiss spinner
            if (this.nodes.meetingIframe) {
                this.nodes.meetingIframe.onload = function() {
                    self.hidePortalSpinner();
                };
            }

            // --- Notes Editor actions ---
            document.getElementById('btn-fab-new-note').addEventListener('click', function() {
                self.openNoteEditor(null);
            });
            document.getElementById('btn-save-note').addEventListener('click', function() {
                self.saveActiveNote();
            });
            document.getElementById('btn-cancel-note').addEventListener('click', function() {
                self.closeNoteEditor();
            });

            // Notes Search filters
            if (this.nodes.searchField) {
                this.nodes.searchField.addEventListener('input', function() {
                    self.renderNotesList(this.value.trim());
                });
            }

            // Ribbon tool switches (Pen vs Text vs Eraser)
            var ribbonBtns = document.querySelectorAll('.ribbon-btn');
            for (var j = 0; j < ribbonBtns.length; j++) {
                ribbonBtns[j].addEventListener('click', function() {
                    for (var k = 0; k < ribbonBtns.length; k++) {
                        ribbonBtns[k].classList.remove('active');
                    }
                    this.classList.add('active');
                    var tool = this.getAttribute('data-tool');
                    self.switchEditorTool(tool);
                });
            }

            // Color selections
            var colors = document.querySelectorAll('.color-dot');
            for (var c = 0; c < colors.length; c++) {
                colors[c].addEventListener('click', function() {
                    for (var x = 0; x < colors.length; x++) colors[x].classList.remove('active');
                    this.classList.add('active');
                    self.state.penColor = this.getAttribute('data-color');
                });
            }

            // Thickness selections
            var sizes = document.querySelectorAll('.size-btn');
            for (var s = 0; s < sizes.length; s++) {
                sizes[s].addEventListener('click', function() {
                    for (var x = 0; x < sizes.length; x++) sizes[x].classList.remove('active');
                    this.classList.add('active');
                    self.state.penThickness = parseInt(this.getAttribute('data-thickness'));
                });
            }

            // Setup mouse & touch events for drawing canvas
            this.bindDrawingEvents();
        },

        bindDrawingEvents: function() {
            var canvas = this.nodes.canvas;
            if (!canvas) return;
            var self = this;

            function getCoordinates(e) {
                var rect = canvas.getBoundingClientRect();
                var clientX = e.touches ? e.touches[0].clientX : e.clientX;
                var clientY = e.touches ? e.touches[0].clientY : e.clientY;
                return {
                    x: clientX - rect.left,
                    y: clientY - rect.top
                };
            }

            function startDraw(e) {
                if (self.state.activeTool === 'text') return;
                self.state.isDrawing = true;
                var coords = getCoordinates(e);
                self.state.lastX = coords.x;
                self.state.lastY = coords.y;
                
                // Touch events can prevent browser scroll bounce
                if (e.cancelable) e.preventDefault();
            }

            function draw(e) {
                if (!self.state.isDrawing || self.state.activeTool === 'text') return;
                var coords = getCoordinates(e);
                var ctx = self.nodes.ctx;
                
                ctx.beginPath();
                ctx.moveTo(self.state.lastX, self.state.lastY);
                ctx.lineTo(coords.x, coords.y);
                
                if (self.state.activeTool === 'pen') {
                    ctx.strokeStyle = self.state.penColor;
                    ctx.lineWidth = self.state.penThickness;
                    ctx.globalCompositeOperation = 'source-over';
                } else if (self.state.activeTool === 'eraser') {
                    ctx.lineWidth = 24; // High eraser size
                    ctx.globalCompositeOperation = 'destination-out';
                }
                
                ctx.stroke();
                
                self.state.lastX = coords.x;
                self.state.lastY = coords.y;
                
                if (e.cancelable) e.preventDefault();
            }

            function stopDraw() {
                self.state.isDrawing = false;
            }

            // Attach touch support
            canvas.addEventListener('touchstart', startDraw, { passive: false });
            canvas.addEventListener('touchmove', draw, { passive: false });
            canvas.addEventListener('touchend', stopDraw);
            
            // Attach mouse fallback support
            canvas.addEventListener('mousedown', startDraw);
            canvas.addEventListener('mousemove', draw);
            canvas.addEventListener('mouseup', stopDraw);
            canvas.addEventListener('mouseleave', stopDraw);
        },

        // Tab Switching Router
        switchTab: function(tabId) {
            this.state.activeTab = tabId;

            // Highlight Tab Buttons
            for (var i = 0; i < this.nodes.tabs.length; i++) {
                if (this.nodes.tabs[i].getAttribute('data-tab') === tabId) {
                    this.nodes.tabs[i].classList.add('active');
                } else {
                    this.nodes.tabs[i].classList.remove('active');
                }
            }

            // Toggle active content view panels
            for (var j = 0; j < this.nodes.views.length; j++) {
                if (this.nodes.views[j].getAttribute('id') === 'view-' + tabId) {
                    this.nodes.views[j].classList.add('active');
                } else {
                    this.nodes.views[j].classList.remove('active');
                }
            }

            // Customize header actions depending on active viewport
            if (tabId === 'dashboard') {
                this.nodes.headerTitle.innerText = 'Meet & Notes';
                this.nodes.btnHome.classList.add('hidden');
                this.nodes.btnRefresh.classList.add('hidden');
                this.nodes.btnZoomIn.classList.add('hidden');
                this.nodes.btnZoomOut.classList.add('hidden');
                this.nodes.zoomLevel.classList.add('hidden');
            } else if (tabId === 'meeting-portal') {
                this.nodes.headerTitle.innerText = 'Meeting View';
                this.nodes.btnHome.classList.remove('hidden');
                this.nodes.btnRefresh.classList.remove('hidden');
                this.nodes.btnZoomIn.classList.remove('hidden');
                this.nodes.btnZoomOut.classList.remove('hidden');
                this.nodes.zoomLevel.classList.remove('hidden');
            } else if (tabId === 'notes') {
                this.nodes.headerTitle.innerText = 'My Notes';
                this.nodes.btnHome.classList.add('hidden');
                this.nodes.btnRefresh.classList.add('hidden');
                this.nodes.btnZoomIn.classList.add('hidden');
                this.nodes.btnZoomOut.classList.add('hidden');
                this.nodes.zoomLevel.classList.add('hidden');
                
                // Return notes list subview to default
                document.getElementById('notes-list-subview').classList.add('active');
                document.getElementById('notes-editor-subview').classList.remove('active');
                this.renderNotesList();
            }
        },

        loadMeetingIframe: function(url) {
            if (!this.nodes.meetingIframe) return;
            
            // Normalize URLs without protocol
            if (!/^https?:\/\//i.test(url)) {
                url = 'https://' + url;
            }

            this.showPortalSpinner();
            this.nodes.meetingIframe.src = url;
            
            // Re-apply current zoom level to fresh source
            this.applyZoomScale();
            this.switchTab('meeting-portal');
        },

        showPortalSpinner: function() {
            if (this.nodes.portalSpinner) this.nodes.portalSpinner.classList.remove('hidden');
        },

        hidePortalSpinner: function() {
            if (this.nodes.portalSpinner) this.nodes.portalSpinner.classList.add('hidden');
        },

        // Software Zoom transformations
        adjustZoom: function(step) {
            var newZoom = this.state.zoomScale + step;
            if (newZoom >= 0.5 && newZoom <= 3.0) {
                this.state.zoomScale = parseFloat(newZoom.toFixed(1));
                this.applyZoomScale();
            }
        },

        applyZoomScale: function() {
            var scale = this.state.zoomScale;
            var iframe = this.nodes.meetingIframe;
            if (iframe) {
                iframe.style.transform = 'scale(' + scale + ')';
                iframe.style.transformOrigin = '0 0';
                iframe.style.width = (100 / scale) + '%';
                iframe.style.height = (100 / scale) + '%';
            }
            if (this.nodes.zoomLevel) {
                this.nodes.zoomLevel.innerText = Math.round(scale * 100) + '%';
            }
        },

        // Switch Editor Tool
        switchEditorTool: function(tool) {
            this.state.activeTool = tool;
            
            // Toggle settings drawer visibility
            if (tool === 'pen' || tool === 'eraser') {
                this.nodes.drawer.classList.remove('hidden');
                this.nodes.canvas.style.pointerEvents = 'auto';
            } else {
                this.nodes.drawer.classList.add('hidden');
                this.nodes.canvas.style.pointerEvents = 'none';
            }
        },

        // Notes Database Operations
        loadNotesFromStorage: function() {
            try {
                var data = localStorage.getItem('meet_notes_list');
                this.state.notes = data ? JSON.parse(data) : [];
            } catch (e) {
                this.state.notes = [];
            }
        },

        saveNotesToStorage: function() {
            localStorage.setItem('meet_notes_list', JSON.stringify(this.state.notes));
        },

        renderNotesList: function(query) {
            var self = this;
            if (!this.nodes.notesContainer) return;
            this.nodes.notesContainer.innerHTML = '';

            var filtered = this.state.notes;
            if (query) {
                var q = query.toLowerCase();
                filtered = this.state.notes.filter(function(note) {
                    return (note.title && note.title.toLowerCase().indexOf(q) !== -1) || 
                           (note.text && note.text.toLowerCase().indexOf(q) !== -1);
                });
            }

            if (filtered.length === 0) {
                this.nodes.notesContainer.innerHTML = '<div class="empty-state">No notes matching filter. Tap "+" below to make one.</div>';
                return;
            }

            // Render note cards
            for (var i = 0; i < filtered.length; i++) {
                (function(note) {
                    var card = document.createElement('div');
                    card.className = 'note-card';
                    
                    var header = document.createElement('div');
                    header.className = 'note-card-header';
                    
                    var title = document.createElement('h4');
                    title.innerText = note.title || 'Untitled Note';
                    
                    var date = document.createElement('span');
                    date.className = 'note-card-date';
                    date.innerText = note.date || '';

                    header.appendChild(title);
                    header.appendChild(date);
                    card.appendChild(header);

                    var body = document.createElement('div');
                    body.className = 'note-card-body';

                    // Layer sketch drawing on top if exists
                    if (note.sketch) {
                        var sketchImg = document.createElement('img');
                        sketchImg.className = 'note-card-sketch';
                        sketchImg.src = note.sketch;
                        body.appendChild(sketchImg);
                    }

                    var textPreview = document.createElement('p');
                    textPreview.innerText = note.text || '';
                    body.appendChild(textPreview);

                    card.appendChild(body);

                    // Click to edit note details
                    card.addEventListener('click', function() {
                        self.openNoteEditor(note.id);
                    });

                    self.nodes.notesContainer.appendChild(card);
                })(filtered[i]);
            }
        },

        openNoteEditor: function(noteId) {
            this.state.editingNoteId = noteId;
            
            // Clean canvas contexts and textboxes
            if (this.nodes.ctx) {
                this.nodes.ctx.clearRect(0, 0, this.nodes.canvas.width, this.nodes.canvas.height);
            }
            this.nodes.noteTextInput.value = '';

            // Reset tools to text typing mode
            this.switchEditorTool('text');
            var toolBtns = document.querySelectorAll('.ribbon-btn');
            for (var b = 0; b < toolBtns.length; b++) {
                if (toolBtns[b].getAttribute('data-tool') === 'text') toolBtns[b].classList.add('active');
                else toolBtns[b].classList.remove('active');
            }

            if (noteId) {
                // Populate existing details
                var match = this.state.notes.find(function(n) { return n.id === noteId; });
                if (match) {
                    this.nodes.noteTextInput.value = match.text || '';
                    if (match.sketch) {
                        var img = new Image();
                        var self = this;
                        img.onload = function() {
                            if (self.nodes.ctx) {
                                self.nodes.ctx.drawImage(img, 0, 0);
                            }
                        };
                        img.src = match.sketch;
                    }
                }
            }

            // Switch subviews
            document.getElementById('notes-list-subview').classList.remove('active');
            document.getElementById('notes-editor-subview').classList.add('active');
            
            // Resize canvas to cover container sizing
            this.setupDrawingCanvas();
        },

        closeNoteEditor: function() {
            document.getElementById('notes-editor-subview').classList.remove('active');
            document.getElementById('notes-list-subview').classList.add('active');
            this.state.editingNoteId = null;
            this.renderNotesList();
        },

        saveActiveNote: function() {
            var text = this.nodes.noteTextInput.value.trim();
            
            // Extract title as first 25 characters of first line
            var lines = text.split('\n');
            var title = (lines[0] || 'Sketch Note').substring(0, 25);
            if (text.length > 25 && lines[0].length > 25) title += '...';

            var sketchDataUrl = null;
            
            // Check if user drew anything on the canvas by parsing pixel info
            if (this.nodes.canvas) {
                var pixels = this.nodes.ctx.getImageData(0, 0, this.nodes.canvas.width, this.nodes.canvas.height).data;
                var hasDrawing = false;
                for (var i = 3; i < pixels.length; i += 4) {
                    if (pixels[i] > 0) { // Alpha channel has color
                        hasDrawing = true;
                        break;
                    }
                }
                if (hasDrawing) {
                    sketchDataUrl = this.nodes.canvas.toDataURL();
                }
            }

            if (!text && !sketchDataUrl) {
                this.closeNoteEditor();
                return;
            }

            var localDate = new Date().toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            if (this.state.editingNoteId) {
                // Edit existing note details
                var match = this.state.notes.find(function(n) { return n.id === this.state.editingNoteId; }, this);
                if (match) {
                    match.title = title;
                    match.text = text;
                    match.sketch = sketchDataUrl;
                    match.date = localDate;
                }
            } else {
                // Add new note
                var newNote = {
                    id: Date.now().toString(),
                    title: title,
                    text: text,
                    sketch: sketchDataUrl,
                    date: localDate
                };
                this.state.notes.unshift(newNote); // Put at top of list
            }

            this.saveNotesToStorage();
            this.closeNoteEditor();
        }
    };

    app.init();
})();