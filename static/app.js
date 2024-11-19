// static/app.js

$(document).ready(function () {
    $(".litmusic-textlogout_admin").css("transform", "scale(1.5)");

    setTimeout(function () {
        $(".intro-container").css("pointer-events", "none");
        $(".intro-container").animate({opacity: 0}, 500, function () {
            $(this).remove();
        });
    }, 1000); // Задержка, чтобы анимация transform завершилась

    const $tracksContainer = $('#tracks-container');
    const $addTrackButton = $('#add-track-button');
    const $adminButton = $('#admin-button');
    const $logoutAdminButton = $('#logout-admin-button'); // Add this
    const $addTrackDialog = $('#add-track-dialog');
    const $closeAddDialog = $('#close-add-dialog');
    const $addTrackForm = $('#add-track-form');
    const $tagsContainer = $('#tags-container');
    const $addTagButton = $('#add-tag-button');
    const $audioPlayer = $('#audio-player');
    const $audioControl = $('#audio-control');
    const $trackTitle = $('#track-title');
    const $togglePlayerButton = $('#toggle-player-button');
    const $descriptionDialog = $('#description-dialog');
    const $closeDescriptionDialog = $('#close-description-dialog');
    const $descriptionTitle = $('#description-title');
    const $descriptionText = $('#description-text');
    const $searchForm = $('#search-form');
    const $clearSearchButton = $('#clear-search');
    const $paginationControls = $('#pagination-controls');
    const $fileDropArea = $('#file-drop-area');
    const $trackFileInput = $('#track-file');
    const $selectedFileInfo = $('#selected-file-info');
    const $trackFileName = $('#selected-file-name');
    const $removeSelectedFile = $('#remove-selected-file');
    const $globalOverlay = $('#global-overlay');


    let currentPage = 1;
    const perPage = 10;
    let totalTracks = 0;
    let currentSearch = {
        name: '',
        description: '',
        tags: []
    };
    const animationSpeed = 300;

    // Variables to track the current playing track
    let currentTrackId = null;
    let $currentPlayButton = null;

    // Global variable to store all tracks
    let allTracks = [];

    // Variable to store admin status
    let isAdmin = false;

    // Function to check admin status
    function checkAdminStatus() {
        $.getJSON('/admin_status', function (data) {
            isAdmin = data.is_admin;
            if (isAdmin) {
                $addTrackButton.show();
                $logoutAdminButton.show();
                $adminButton.hide();
            } else {
                $addTrackButton.hide();
                $logoutAdminButton.hide();
                $adminButton.show();
            }
            loadTracks(currentPage, currentSearch); // Reload tracks to show/hide delete buttons
        }).fail(function () {
            console.error('Не удалось проверить статус админа.');
        });
    }

    // Call the function on page load
    checkAdminStatus();

    // --- Functions ---
    function loadTracks(page = 1, search = {}) {
        currentPage = page;
        let url = `/tracks?page=${page}`;
        if (search.name) {
            url += `&name=${encodeURIComponent(search.name)}`;
        }
        if (search.description) {
            url += `&description=${encodeURIComponent(search.description)}`;
        }
        if (search.tags && search.tags.length > 0) {
            search.tags.forEach(tag => {
                url += `&tags=${encodeURIComponent(tag)}`;
            });
        }

        $.getJSON(url, function (data) {
            $tracksContainer.empty();
            totalTracks = data.total;
            allTracks = data.tracks; // Save loaded tracks
            if (data.tracks.length === 0) {
                $tracksContainer.append('<p>Треки не найдены.</p>');
            } else {
                $.each(data.tracks, function (index, track) {
                    const $trackTile = $('<div class="track-tile"></div>');
                    const $topDiv = $('<div class="top-div"></div>');
                    const $buttons = $('<div class="buttons"></div>');
                    const $title = $('<h3>' + track.name + '</h3>');

                    // Create Play/Pause button with data-track-id
                    const $playPauseButton = $(`
                        <button class="play-pause-button" data-track-id="${track.id}">
                            <img src="../static/icons/play.webp" alt="Play">
                        </button>
                    `).click(function () {
                        togglePlayPause(track, $(this));
                    });

                    // Add copy button only if original_url exists
                    if (track.original_url) {
                        const $copyButton = $('<button><img src="../static/icons/copy.webp" alt="Copy"></button>').click(function () {
                            copyToClipboard(track.original_url); // Copy original link
                        });
                        $buttons.append($copyButton);
                    }

                    const $descriptionButton = $('<button><img src="../static/icons/description.webp" alt="Description"></button>').click(function () {
                        showDescription(track);
                    });

                    $buttons.append($descriptionButton);
                    // If user is admin, add delete button
                    if (isAdmin) {
                        const $deleteButton = $('<button><img src="../static/icons/close.webp" alt="Delete"></button>').click(function () {
                            deleteTrack(track.id, track.name);
                        });
                        $buttons.append($deleteButton);
                    }

                    $topDiv.append($playPauseButton).append($title);
                    $trackTile.append($topDiv).append($buttons);
                    $tracksContainer.append($trackTile);
                });
            }
            renderPagination();
        }).fail(function (jqxhr, textStatus, error) {
            console.error('Ошибка при загрузке треков:', error);
            alert('Не удалось загрузить треки.');
        });
    }

    function togglePlayPause(track, $button) {
        if (currentTrackId === track.id) {
            // Toggle play/pause
            if ($audioControl[0].paused) {
                $audioControl[0].play();
                $button.find('img').attr('src', '../static/icons/pause.webp');
            } else {
                $audioControl[0].pause();
                $button.find('img').attr('src', '../static/icons/play.webp');
            }
        } else {
            // Play a new track
            // Pause the current track if any
            if (currentTrackId !== null && $currentPlayButton !== null) {
                $currentPlayButton.find('img').attr('src', '../static/icons/play.webp');
            }

            // Set the new track
            currentTrackId = track.id;
            $currentPlayButton = $button;
            $audioControl.attr('src', track.url);
            $trackTitle.text(track.name);
            $audioControl[0].play();  // Play audio

            // Change button icon to pause
            $button.find('img').attr('src', '../static/icons/pause.webp');
        }
        maximizePlayer();
    }

    function maximizePlayer() {
        $audioPlayer.removeClass('minimized').addClass('maximized');
        $togglePlayerButton.addClass('rotated');
    }

    function minimizePlayer() {
        $audioPlayer.addClass('minimized').removeClass('maximized');
        $togglePlayerButton.removeClass('rotated');
    }

    function showDescription(track) {
        $descriptionTitle.text(track.name);
        $descriptionText.text(track.description || 'Нет описания.');
        $descriptionDialog.fadeIn(animationSpeed);
    }

    /**
     * Function to display a notification.
     * @param {string} message - Notification text.
     */
    function showNotification(message) {
        const $notification = $('<div class="notification"></div>').text(message);
        $('#notifications-container').append($notification);

        // Trigger the show animation
        setTimeout(() => {
            $notification.addClass('show');
        }, 10); // Small delay for CSS transition

        // Remove notification after 1.5 seconds
        setTimeout(() => {
            $notification.removeClass('show').addClass('hide');
            // Remove the element from the DOM after animation
            $notification.on('transitionend', () => {
                $notification.remove();
            });
        }, 1500);
    }

    function copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(function() {
                showNotification('Ссылка скопирована!');
            }).catch(function(err) {
                console.error('Не удалось скопировать:', err);
                fallbackCopy(text); // Call fallback if Clipboard API fails
            });
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                showNotification('Ссылка скопирована!');
            } else {
                showNotification('Не удалось скопировать ссылку.');
            }
        } catch (err) {
            console.error('Ошибка при копировании fallback:', err);
            showNotification('Не удалось скопировать ссылку.');
        }

        document.body.removeChild(textArea);
    }

    function deleteTrack(trackId, trackName) {
        if (confirm(`Вы уверены, что хотите удалить трек "${trackName}"?`)) {
            $.ajax({
                url: `/tracks/${trackId}`,
                type: 'DELETE',
                success: function (data) {
                    if (data.error) {
                        showNotification('Ошибка: ' + data.error);
                    } else {
                        showNotification(data.message);
                        // If the deleted track is currently playing, reset the audio
                        if (currentTrackId === trackId) {
                            $audioControl[0].pause();
                            $audioControl.attr('src', '');
                            $trackTitle.text('');
                            if ($currentPlayButton !== null) {
                                $currentPlayButton.find('img').attr('src', '../static/icons/play.webp');
                                $currentPlayButton = null;
                            }
                            currentTrackId = null;
                        }
                        loadTracks(currentPage, currentSearch);
                    }
                },
                error: function (jqxhr, textStatus, error) {
                    console.error('Ошибка при удалении трека:', error);
                    showNotification('Что-то пошло не так.');
                }
            });
        }
    }

    // Rendering pagination controls
    function renderPagination() {
        const totalPages = Math.ceil(totalTracks / perPage);
        $paginationControls.empty();

        if (totalPages <= 1) return;

        // "Previous" button
        const $prevButton = $('<button>').text('<< Предыдущая').prop('disabled', currentPage === 1).click(function () {
            if (currentPage > 1) {
                loadTracks(currentPage - 1, currentSearch);
            }
        });
        $paginationControls.append($prevButton);

        // Page numbers (show up to 5)
        const maxPagesToShow = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
        let endPage = startPage + maxPagesToShow - 1;
        if (endPage > totalPages) {
            endPage = totalPages;
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const $pageButton = $('<button>').text(i).addClass(i === currentPage ? 'active' : '').click(function () {
                loadTracks(i, currentSearch);
            });
            $paginationControls.append($pageButton);
        }

        // "Next" button
        const $nextButton = $('<button>').text('Следующая >>').prop('disabled', currentPage === totalPages).click(function () {
            if (currentPage < totalPages) {
                loadTracks(currentPage + 1, currentSearch);
            }
        });
        $paginationControls.append($nextButton);
    }

    // --- Event Handlers ---

    // Open Add Track dialog
    $addTrackButton.click(function () {
        $addTrackDialog.fadeIn(animationSpeed);
    });
    $closeAddDialog.click(function () {
        $addTrackDialog.fadeOut(animationSpeed);
    });

    // Close Description dialog
    $closeDescriptionDialog.click(function () {
        $descriptionDialog.fadeOut(animationSpeed);
    });

    // Close modals when clicking outside them
    $(window).click(function (event) {
        if (event.target == $addTrackDialog[0]) {
            $addTrackDialog.fadeOut(animationSpeed);
        }
        if (event.target == $descriptionDialog[0]) {
            $descriptionDialog.fadeOut(animationSpeed);
        }
    });

    // Add a new tag
    $addTagButton.click(function () {
        const $tagItem = $('<div class="tag-item"></div>');
        const $tagInput = $('<input type="text" name="tags">');
        const $removeButton = $('<button type="button"><img src="../static/icons/close.webp" alt="Удалить тег"></button>').click(function () {
            $tagItem.remove();
        });
        $tagItem.append($tagInput).append($removeButton);
        $tagsContainer.append($tagItem);
    });

    // Handle file selection via input
    $trackFileInput.on('change', function () {
        const file = this.files[0];
        if (file) {
            $trackFileName.text(file.name);
            $selectedFileInfo.removeClass('hidden');
        } else {
            $selectedFileInfo.addClass('hidden');
            $trackFileName.text('');
        }
    });

    // Handle removing the selected file
    $removeSelectedFile.click(function () {
        $trackFileInput.val(''); // Clear the selected file

        // Create an empty DataTransfer to clear FileList
        const dataTransfer = new DataTransfer();
        $trackFileInput[0].files = dataTransfer.files;

        $trackFileName.text('');
        $selectedFileInfo.addClass('hidden');
    });

    // Submit Add Track form
    $addTrackForm.submit(function (event) {
        event.preventDefault();

        const formData = new FormData(this);

        // Validation: Check if file is present
        if (!formData.get('file')) {
            showNotification('Файл трека обязателен.');
            return;
        }

        $.ajax({
            url: '/tracks',
            type: 'POST',
            data: formData,
            processData: false, // Do not process data
            contentType: false, // Do not set contentType
            success: function (data) {
                if (data.error) {
                    showNotification('Ошибка: ' + data.error);
                } else {
                    showNotification('Трек успешно добавлен!');
                    $addTrackDialog.fadeOut(animationSpeed);
                    $addTrackForm[0].reset();
                    $tagsContainer.empty();
                    $selectedFileInfo.addClass('hidden');
                    loadTracks(1, {}); // Reload the first page without search
                }
            },
            error: function (jqxhr, textStatus, error) {
                console.error('Ошибка при добавлении трека:', error);
                const response = jqxhr.responseJSON;
                if (response && response.error) {
                    showNotification('Ошибка: ' + response.error);
                } else {
                    showNotification('Что-то пошло не так.');
                }
            }
        });
    });

    // Handle dragover and dragleave for file-drop-area
    $fileDropArea.on('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).addClass('hover');
    });

    $fileDropArea.on('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).removeClass('hover');
    });

    $fileDropArea.on('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).removeClass('hover');

        const files = e.originalEvent.dataTransfer.files;
        if (files.length > 0) {
            // Create a DataTransfer object and add the file
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(files[0]);

            // Set the created FileList to the input
            $trackFileInput[0].files = dataTransfer.files;

            // Display selected file information
            $trackFileName.text(files[0].name);
            $selectedFileInfo.removeClass('hidden');
        }
    });

    // Toggle player state
    $togglePlayerButton.click(function () {
        $audioPlayer.toggleClass('minimized maximized');
        $togglePlayerButton.toggleClass('rotated');
    });

    // Handle search form submission
    $searchForm.submit(function (event) {
        event.preventDefault();
        const name = $('#search-name').val().trim();

        currentSearch = {name};
        loadTracks(1, currentSearch);
    });

    // Clear search
    $clearSearchButton.click(function () {
        $searchForm[0].reset();
        currentSearch = {name: '', description: '', tags: []};
        loadTracks(1, currentSearch);
    });

    // Handle input in the search field
    $('#search-name').on('input', function () {
        const name = $(this).val().trim();
        currentSearch = {name};
        loadTracks(1, currentSearch);
    });

    // Handle track end
    $audioControl.on('ended', function () {
        if (currentTrackId !== null && $currentPlayButton !== null) {
            $currentPlayButton.find('img').attr('src', '../static/icons/play.webp');
            currentTrackId = null;
            $currentPlayButton = null;
        }
        minimizePlayer();
    });

    // Handle play event
    $audioControl.on('play', function () {
        if (currentTrackId !== null && $currentPlayButton !== null) {
            $currentPlayButton.find('img').attr('src', '../static/icons/pause.webp');
        }
    });

    // Handle pause event
    $audioControl.on('pause', function () {
        if (currentTrackId !== null && $currentPlayButton !== null) {
            $currentPlayButton.find('img').attr('src', '../static/icons/play.webp');
        }
    });

    // Functions to handle global file drag-and-drop
    let dragCounter = 0; // Counter to track drag events

    function showGlobalOverlay() {
        $globalOverlay.removeClass('hidden').addClass('fade-in').removeClass('fade-out');
    }

    function hideGlobalOverlay() {
        $globalOverlay.removeClass('fade-in').addClass('fade-out');
        // Hide after animation
        setTimeout(() => {
            $globalOverlay.removeClass('fade-out').addClass('hidden');
        }, 300);
    }

    // Handle dragenter
    $(document).on('dragenter', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter++;
        showGlobalOverlay();
    });

    // Handle dragleave
    $(document).on('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter--;
        if (dragCounter === 0) {
            hideGlobalOverlay();
        }
    });

    // Handle dragover
    $(document).on('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        // Optional: additional actions during dragover
    });

    // Handle drop
    $(document).on('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter = 0;
        hideGlobalOverlay();

        const files = e.originalEvent.dataTransfer.files;
        if (files.length > 0) {
            // Check if the first file is audio
            const audioFile = Array.from(files).find(file => file.type.startsWith('audio/'));
            if (audioFile) {
                $addTrackDialog.fadeIn(animationSpeed);
                // Create a DataTransfer object and add the file
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(audioFile);

                // Set the created FileList to the input
                $trackFileInput[0].files = dataTransfer.files;

                // Display selected file information
                $trackFileName.text(audioFile.name);
                $selectedFileInfo.removeClass('hidden');
            } else {
                showNotification('Пожалуйста, перетащите аудио-файл.');
            }
        }
    });

    // Function to get track by ID (for copying links)
    function getTrackById(trackId) {
        return allTracks.find(track => track.id === trackId) || null;
    }

    $adminButton.on('click', function(event) {
        event.preventDefault(); // Предотвращаем стандартное поведение кнопки (если есть)
        window.location.href = '/login_admin';
    });
    $logoutAdminButton.on('click', function(event) {
        event.preventDefault(); // Предотвращаем стандартное поведение кнопки (если есть)
        window.location.href = '/logout_admin';
    });

    // Initial track load
    // loadTracks(); --> Instead, load after checking admin status
});