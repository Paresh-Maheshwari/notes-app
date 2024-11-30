document.addEventListener('DOMContentLoaded', () => {
    const notesList = document.getElementById('notesList');
    const newNoteBtn = document.getElementById('newNoteBtn');
    const exportNoteBtn = document.getElementById('exportNoteBtn');
    const themeToggle = document.getElementById('themeToggle');
    const themeSelect = document.getElementById('themeSelect');
    const settingsBtn = document.getElementById('settingsBtn'); // Ensure this element exists in your HTML
    const exportAllNotesBtn = document.getElementById('exportAllNotes');
    const importNotesInput = document.getElementById('importNotes');
    const noteNameInput = document.getElementById('noteNameInput');
    const noteAuthorInput = document.getElementById('noteAuthorInput');
    const tagsInput = document.getElementById('tagsInput');
    const categorySelect = document.getElementById('categorySelect');
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
    const confirmDeleteBtn = document.getElementById('confirmDelete');
    const searchNotesInput = document.getElementById('searchNotes');

    let db;
    let activeNoteId = null;
    let editorInstance;

    // Open (or create) IndexedDB
    const request = indexedDB.open("notepadDB", 1);

    request.onupgradeneeded = function (event) {
        db = event.target.result;
        if (!db.objectStoreNames.contains("notes")) {
            db.createObjectStore("notes", { keyPath: "id" });
        }
    };

    request.onsuccess = function (event) {
        db = event.target.result;
        renderNotesList();
    };

    request.onerror = function () {
        console.error("Error opening the database.");
    };

    // Initialize CKEditor
    ClassicEditor
        .create(document.querySelector('#editor-container'), {
            toolbar: [
                'heading', '|',
                'bold', 'italic', 'underline', 'strikethrough', '|',
                'link', 'blockQuote', 'insertTable', '|',
                'bulletedList', 'numberedList', '|',
                'undo', 'redo', '|',
                'imageUpload', 'mediaEmbed', 'codeBlock'
            ],
            table: {
                contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells']
            }
        })
        .then(editor => {
            editorInstance = editor;

            // Set up a listener for changes in the editor content to save the note automatically
            editor.model.document.on('change:data', () => {
                saveCurrentNote();
            });
        })
        .catch(error => {
            console.error('There was a problem initializing CKEditor:', error);
        });

    // CRUD Operations for IndexedDB
    function addOrUpdateNote(note) {
        const transaction = db.transaction(["notes"], "readwrite");
        const store = transaction.objectStore("notes");
        store.put(note);
    }

    function deleteNoteById(id) {
        const transaction = db.transaction(["notes"], "readwrite");
        const store = transaction.objectStore("notes");
        store.delete(id);
        renderNotesList();
    }

    function getNotes(callback) {
        const transaction = db.transaction(["notes"], "readonly");
        const store = transaction.objectStore("notes");
        const request = store.getAll();
        request.onsuccess = function () {
            callback(request.result);
        };
    }

    function getNoteById(id, callback) {
        const transaction = db.transaction(["notes"], "readonly");
        const store = transaction.objectStore("notes");
        const request = store.get(id);
        request.onsuccess = function () {
            callback(request.result);
        };
    }

    // Render the notes list from IndexedDB
    function renderNotesList() {
        getNotes((notes) => {
            notesList.innerHTML = '';
            notes.forEach(note => {
                const noteItem = document.createElement('div');
                noteItem.className = 'note-item note-title';
                noteItem.innerHTML = `
                    <span>${note.title}</span>
                    <button class="delete-note-btn btn-sm" data-id="${note.id}" title="Delete Note">🗑️</button>
                `;
                noteItem.querySelector('.delete-note-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    activeNoteId = note.id;
                    deleteModal.show();
                });
                noteItem.addEventListener('click', () => loadNote(note.id));
                notesList.appendChild(noteItem);
            });
        });
    }

    // Load a note by its ID
    function loadNote(id) {
        getNoteById(id, (note) => {
            if (note) {
                activeNoteId = id;
                editorInstance.setData(note.content); // Load content into CKEditor
                noteNameInput.value = note.title;
                noteAuthorInput.value = note.author || '';
                themeSelect.value = note.theme || 'classic';
                tagsInput.value = note.tags ? note.tags.join(", ") : '';
                categorySelect.value = note.category || '';
                renderNotesList();
                const activeNoteElement = document.querySelector(`button[data-id="${id}"]`).parentElement;
                activeNoteElement.classList.add('active');
            }
        });
    }

    // Event Listeners
    newNoteBtn.addEventListener('click', () => {
        activeNoteId = null;
        const newNoteId = Date.now().toString();
        const newNote = {
            id: newNoteId,
            title: 'Untitled',
            author: '',
            content: '',
            tags: [],
            category: '',
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            theme: 'classic'
        };
        addOrUpdateNote(newNote);
        renderNotesList();
        loadNote(newNoteId);
    });

    // Save note title, author, tags, category, and theme in real-time as the user types
    noteNameInput.addEventListener('input', saveCurrentNote);
    noteAuthorInput.addEventListener('input', saveCurrentNote);
    tagsInput.addEventListener('input', saveCurrentNote);
    categorySelect.addEventListener('change', saveCurrentNote);
    themeSelect.addEventListener('change', saveCurrentNote);

    function saveCurrentNote() {
        if (activeNoteId) {
            getNoteById(activeNoteId, (note) => {
                const updatedNote = {
                    id: activeNoteId,
                    title: noteNameInput.value,
                    author: noteAuthorInput.value,
                    content: editorInstance.getData(), // Get HTML content from CKEditor
                    tags: tagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag !== ''),
                    category: categorySelect.value,
                    created: note?.created || new Date().toISOString(),
                    modified: new Date().toISOString(),
                    theme: themeSelect.value
                };
                addOrUpdateNote(updatedNote);
                renderNotesList();
            });
        }
    }

    confirmDeleteBtn.addEventListener('click', () => {
        if (activeNoteId) {
            deleteNoteById(activeNoteId);
            editorInstance.setData(''); // Clear CKEditor content
            noteNameInput.value = '';
            noteAuthorInput.value = '';
            tagsInput.value = '';
            categorySelect.value = '';
            deleteModal.hide();
            activeNoteId = null;
        }
    });

    // Export and Import Functions

    exportNoteBtn.addEventListener('click', () => {
        if (activeNoteId) {
            getNoteById(activeNoteId, (note) => {
                if (note) {
                    const htmlContent = generateExportHtml(note);
                    const blob = new Blob([htmlContent], { type: 'text/html' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `${note.title}.html`;
                    link.click();
                }
            });
        }
    });

    exportAllNotesBtn.addEventListener('click', () => {
        getNotes((notes) => {
            const blob = new Blob([JSON.stringify(notes)], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'all_notes.json';
            link.click();
        });
    });

    importNotesInput.addEventListener('change', event => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const importedNotes = JSON.parse(e.target.result);
                    importedNotes.forEach(note => {
                        let newId = note.id;
                        while (notesList.querySelector(`[data-id="${newId}"]`)) {
                            newId = Date.now().toString() + Math.floor(Math.random() * 1000);
                        }
                        note.id = newId;
                        addOrUpdateNote(note);
                    });
                    renderNotesList();
                } catch (error) {
                    console.error('Error importing notes:', error);
                }
            };
            reader.readAsText(file);
        }
    });

    searchNotesInput.addEventListener('input', () => {
        const searchTerm = searchNotesInput.value.trim().toLowerCase();
        getNotes((notes) => {
            const filteredNotes = notes.filter(note => {
                return note.title.toLowerCase().includes(searchTerm) || note.content.toLowerCase().includes(searchTerm);
            });
            renderFilteredNotes(filteredNotes);
        });
    });

    function renderFilteredNotes(filteredNotes) {
        notesList.innerHTML = '';
        filteredNotes.forEach(note => {
            const noteItem = document.createElement('div');
            noteItem.className = 'note-item note-title';
            noteItem.innerHTML = `
                <span>${note.title}</span>
                <button class="delete-note-btn btn-sm" data-id="${note.id}" title="Delete Note">🗑️</button>
            `;
            noteItem.querySelector('.delete-note-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                activeNoteId = note.id;
                deleteModal.show();
            });
            noteItem.addEventListener('click', () => loadNote(note.id));
            notesList.appendChild(noteItem);
        });
    }

    // Load theme from local storage
    themeToggle.checked = JSON.parse(localStorage.getItem('darkMode')) || false;
    document.body.dataset.theme = themeToggle.checked ? 'dark' : 'light';

    themeToggle.addEventListener('change', () => {
        document.body.dataset.theme = themeToggle.checked ? 'dark' : 'light';
        localStorage.setItem('darkMode', themeToggle.checked);
    });

    settingsBtn.addEventListener('click', () => new bootstrap.Modal(document.getElementById('settingsModal')).show());

    exportAllNotesBtn.addEventListener('click', () => {
        getNotes((notes) => {
            const blob = new Blob([JSON.stringify(notes)], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'all_notes.json';
            link.click();
        });
    });

    importNotesInput.addEventListener('change', event => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const importedNotes = JSON.parse(e.target.result);
                    importedNotes.forEach(note => {
                        let newId = note.id;

                        // Ensure unique key by generating a new one if there's a conflict
                        while (notesList.querySelector(`[data-id="${newId}"]`)) {
                            newId = Date.now().toString() + Math.floor(Math.random() * 1000);
                        }

                        addOrUpdateNote({ ...note, id: newId });
                    });

                    renderNotesList();
                } catch {
                    alert('Invalid file format.');
                }
            };
            reader.readAsText(file);
        }
    });

    // Helper function to generate HTML content for export
    function generateExportHtml(note) {
        const currentDate = new Date().toLocaleString();

        // Choose theme-specific CSS
        let themeStyles = '';
        if (note.theme === 'modern') {
            themeStyles = `
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background-color: #ffffff;
                    color: #333;
                    line-height: 1.6;
                }
                h1 {
                    color: #28a745;
                }
            `;
        } else if (note.theme === 'dark') {
            themeStyles = `
                body {
                    font-family: Arial, sans-serif;
                    background-color: #121212;
                    color: #e4e4e4;
                    line-height: 1.6;
                }
                h1 {
                    color: #bb86fc;
                }
            `;
        } else {
            themeStyles = `
                body {
                    font-family: Georgia, serif;
                    background-color: #f4f4f4;
                    color: #333;
                    line-height: 1.6;
                }
                h1 {
                    color: #007bff;
                }
            `;
        }

        // Extract headers for Table of Contents and footnotes for references
        const tempElement = document.createElement('div');
        tempElement.innerHTML = note.content;

        let headers = [];
        let footnotes = [];
        let footnoteCounter = 1;

        // Extract headers for TOC
        tempElement.querySelectorAll('h1, h2, h3').forEach((header, index) => {
            const anchorId = `header-${index}`;
            header.id = anchorId;
            headers.push({
                text: header.innerText,
                level: header.tagName,
                anchorId
            });
        });

        // Extract footnotes (marked as <sup>[footnote]</sup>)
        tempElement.querySelectorAll('sup').forEach((sup, index) => {
            const footnoteId = `footnote-${footnoteCounter}`;
            sup.id = `ref-${footnoteCounter}`;
            sup.innerHTML = `<a href="#${footnoteId}" class="footnote-ref">[${footnoteCounter}]</a>`;
            footnotes.push({
                id: footnoteId,
                content: sup.getAttribute('data-content') || sup.innerText
            });
            footnoteCounter++;
        });

        // Generate Table of Contents HTML
        let tocHtml = '';
        if (headers.length > 0) {
            tocHtml = `<div class="table-of-contents"><h2>Table of Contents</h2><ul>`;
            headers.forEach(header => {
                tocHtml += `
                    <li style="margin-left: ${header.level === 'H2' ? '20px' : header.level === 'H3' ? '40px' : '0'};">
                        <a href="#${header.anchorId}">${header.text}</a>
                    </li>
                `;
            });
            tocHtml += `</ul></div>`;
        }

        // Generate Footnotes HTML
        let footnotesHtml = '';
        if (footnotes.length > 0) {
            footnotesHtml = `<div class="footnotes"><h2>Footnotes</h2><ol>`;
            footnotes.forEach(footnote => {
                footnotesHtml += `<li id="${footnote.id}">${footnote.content} <a href="#ref-${footnote.id.split('-')[1]}" class="back-to-ref">↩</a></li>`;
            });
            footnotesHtml += `</ol></div>`;
        }

        // Modify content to make sections collapsible using details/summary HTML elements
        tempElement.querySelectorAll('h1, h2, h3').forEach(header => {
            const sectionContent = document.createElement('div');
            while (header.nextElementSibling && !['H1', 'H2', 'H3'].includes(header.nextElementSibling.tagName)) {
                sectionContent.appendChild(header.nextElementSibling);
            }

            if (sectionContent.children.length > 0) {
                const detailsElement = document.createElement('details');
                const summaryElement = document.createElement('summary');
                summaryElement.innerText = header.innerText;
                detailsElement.appendChild(summaryElement);
                detailsElement.appendChild(sectionContent);
                header.replaceWith(detailsElement);
            }
        });

        // Compile the final HTML content for export
        const htmlContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${note.title}</title>
                <style>
                    ${themeStyles}
                    body {
                        max-width: 800px;
                        margin: 2rem auto;
                        padding: 2rem;
                        border: 1px solid #ddd;
                        border-radius: 8px;
                        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                    }
                    .note-metadata {
                        font-size: 0.9rem;
                        color: #555;
                        margin-bottom: 1.5rem;
                    }
                    .note-content {
                        font-size: 1rem;
                        line-height: 1.8;
                    }
                    a {
                        color: #007bff;
                        text-decoration: none;
                    }
                    a:hover {
                        text-decoration: underline;
                    }
                    img {
                        max-width: 100%;
                        height: auto;
                        margin: 1rem 0;
                    }
                    pre {
                        background-color: #f8f9fa;
                        padding: 1rem;
                        border-radius: 5px;
                        overflow-x: auto;
                    }
                    @media (max-width: 600px) {
                        body {
                            padding: 1rem;
                            font-size: 0.9rem;
                        }
                        h1 {
                            font-size: 1.5rem;
                        }
                    }
                    .table-of-contents {
                        margin-bottom: 2rem;
                        padding: 1rem;
                        background-color: #e9ecef;
                        border-radius: 5px;
                    }
                    .footnotes {
                        margin-top: 3rem;
                        border-top: 1px solid #ddd;
                        padding-top: 1rem;
                    }
                    .footnote-ref, .back-to-ref {
                        font-size: 0.8rem;
                        color: #555;
                        text-decoration: none;
                    }
                    .footnote-ref:hover, .back-to-ref:hover {
                        text-decoration: underline;
                    }
                    details {
                        margin-bottom: 1rem;
                    }
                    summary {
                        font-weight: bold;
                        cursor: pointer;
                        color: #007bff;
                    }
                </style>
            </head>
            <body>
                <h1>${note.title}</h1>
                <div class="note-metadata">
                    <strong>Author:</strong> ${note.author || "Unknown"}<br>
                    <strong>Created On:</strong> ${new Date(note.created).toLocaleString()}<br>
                    <strong>Last Modified:</strong> ${new Date(note.modified).toLocaleString()}<br>
                    <strong>Tags:</strong> ${note.tags.join(", ")}<br>
                    <strong>Category:</strong> ${note.category || "None"}
                </div>
                ${tocHtml}
                <div class="note-content">
                    ${tempElement.innerHTML}
                </div>
                ${footnotesHtml}
            </body>
            </html>
        `;

        return htmlContent;
    }

});
