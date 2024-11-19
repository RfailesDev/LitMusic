# app.py

import os
import shutil
import sqlite3
import zipfile
import uuid
from io import BytesIO
from functools import wraps
from datetime import datetime, timedelta

from flask import (
    Flask,
    request,
    jsonify,
    send_from_directory,
    render_template,
    send_file,
    url_for,
    redirect,
    make_response
)
from flask_cors import CORS
from werkzeug.utils import secure_filename
import jwt

from database import Database

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# Secret key for JWT (Replace with a strong, unpredictable key in production)
app.config['SECRET_KEY'] = 'your_secret_key_here'

# Initialize the database
db = Database()

# Ensure the tracks directory exists
TRACKS_DIR = os.path.join(app.static_folder, 'tracks')
os.makedirs(TRACKS_DIR, exist_ok=True)

# Allowed file extensions for uploads
ALLOWED_EXTENSIONS = {'mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'}

def allowed_file(filename):
    """Check if the file has an allowed extension."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def token_required(f):
    """
    Decorator to ensure that the request contains a valid admin JWT token.
    If valid, the wrapped function is executed; otherwise, an error is returned.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.cookies.get('admin_token')
        if not token:
            return jsonify({'error': 'Админ доступ требуется.'}), 401
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            if not data.get('admin'):
                raise jwt.InvalidTokenError()
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Срок действия токена истек.'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Недействительный токен.'}), 401
        return f(*args, **kwargs)
    return decorated

@app.route('/')
def index():
    """Render the main page."""
    return render_template('index.html')

@app.route('/login_admin', methods=['GET', 'POST'])
def login_admin():
    """
    Admin login route.
    GET: Render the login form.
    POST: Validate the password and issue a JWT token if valid.
    """
    if request.method == 'POST':
        password = request.form.get('password', '')
        if password == 'viktortop4ik':  # Predefined admin password
            token = jwt.encode({
                'admin': True,
                'exp': datetime.utcnow() + timedelta(hours=1)  # Token expires in 1 hour
            }, app.config['SECRET_KEY'], algorithm="HS256")
            resp = make_response(redirect(url_for('index')))
            resp.set_cookie('admin_token', token, httponly=True, samesite='Lax')
            return resp
        else:
            error_message = 'Неверный пароль.'
            return render_template('login_admin.html', error=error_message)
    return render_template('login_admin.html')

@app.route('/logout_admin')
def logout_admin():
    """
    Admin logout route.
    Clears the admin JWT token cookie.
    """
    resp = make_response(redirect(url_for('index')))
    resp.set_cookie('admin_token', '', expires=0)
    return resp

@app.route('/admin_status')
def admin_status():
    """
    Check if the current user is an authenticated admin.
    Returns a JSON response with the admin status.
    """
    token = request.cookies.get('admin_token')
    if not token:
        return jsonify({'is_admin': False})
    try:
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        if data.get('admin'):
            return jsonify({'is_admin': True})
        else:
            return jsonify({'is_admin': False})
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return jsonify({'is_admin': False})

@app.route('/tracks', methods=['GET'])
def get_tracks():
    """
    Retrieve all tracks with pagination.
    Supports searching by name.
    """
    page = request.args.get('page', 1, type=int)
    per_page = 1000  # Adjust as needed
    name = request.args.get('name', type=str)

    if name:
        tracks, total = db.search_tracks_paginated(
            name=name,
            page=page,
            per_page=per_page
        )
    else:
        tracks, total = db.get_tracks(page, per_page)

    return jsonify({'tracks': tracks, 'total': total})

@app.route('/tracks/search', methods=['GET'])
def search_tracks():
    """
    Search for tracks based on description and tags.
    """
    description = request.args.get('description', '', type=str)
    tags = request.args.getlist('tags')
    tracks = db.search_tracks(description, tags)
    return jsonify({'tracks': tracks})

@app.route('/tracks', methods=['POST'])
@token_required
def add_track():
    """
    Add a new track with file upload.
    This route is protected and requires admin authentication.
    """
    # Get original URL if provided
    original_url = request.form.get('url')  # Optional

    # Check if the file part is present
    if 'file' not in request.files:
        return jsonify({'error': 'Файл трека обязателен.'}), 400

    file = request.files['file']

    # Get other form fields
    name = request.form.get('name')
    description = request.form.get('description')
    tags = request.form.getlist('tags')  # Expect tags as a list

    # Validate required fields
    if not name:
        return jsonify({'error': 'Название трека обязательно.'}), 400

    if file.filename == '':
        return jsonify({'error': 'Выберите файл для загрузки.'}), 400

    if file and allowed_file(file.filename):
        # Secure the filename
        filename = secure_filename(file.filename)
        # Generate a unique filename to prevent collisions
        unique_filename = f"{uuid.uuid4()}_{filename}"
        file_path = os.path.join(TRACKS_DIR, unique_filename)
        file.save(file_path)

        # URL to access the file
        local_url = url_for('static', filename=f"tracks/{unique_filename}")

        # Add track to the database
        track_id = db.add_track(name, description, local_url, original_url, tags)

        return jsonify({'message': 'Трек успешно добавлен.', 'track_id': track_id}), 201
    else:
        return jsonify({'error': 'Недопустимый тип файла. Поддерживаемые форматы: mp3, wav, aac, flac, ogg, m4a.'}), 400

@app.route('/tracks/<int:track_id>', methods=['DELETE'])
@token_required
def delete_track(track_id):
    """
    Delete a specific track by ID.
    This route is protected and requires admin authentication.
    """
    # Retrieve the track by ID
    track = db.get_track_by_id(track_id)
    if not track:
        return jsonify({'error': 'Трек не найден.'}), 404

    # Delete the track from the database
    db.delete_track(track_id)

    # Delete the local file
    file_path = os.path.join(app.root_path, track['url'].lstrip('/'))
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            # Optionally log the error
            pass

    return jsonify({'message': 'Трек успешно удален.'}), 200

@app.route('/get_db')
def download_db():
    """
    Download the entire database and tracks as a ZIP archive.
    """
    try:
        memory_file = BytesIO()
        with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Add the database to the archive
            zipf.write(db.db_path, arcname='tracks.db')

            # Add track files to the archive
            for root, _, files in os.walk(TRACKS_DIR):
                for file in files:
                    zipf.write(os.path.join(root, file), arcname=os.path.relpath(os.path.join(root, file), app.static_folder))

        memory_file.seek(0)

        return send_file(memory_file, as_attachment=True, download_name="tracks_backup.zip", mimetype="application/zip")

    except Exception as e:
        print(f"Error creating backup: {e}")
        return jsonify({'error': 'Ошибка при создании бэкапа.'}), 500

@app.route('/set_db', methods=['POST'])
def upload_db():
    """
    Upload a new database and replace existing tracks.
    """
    if 'db_file' not in request.files:
        return jsonify({'error': 'Файл базы данных не найден.'}), 400

    file = request.files['db_file']
    if file.filename == '':
        return jsonify({'error': 'Файл не выбран.'}), 400

    temp_dir = os.path.join(app.instance_path, f"temp_{uuid.uuid4()}")  # Use instance_path for safety
    os.makedirs(temp_dir, exist_ok=True)

    temp_db_path = None

    try:
        # Save the uploaded ZIP file temporarily
        zip_path = os.path.join(temp_dir, "temp_backup.zip")
        file.save(zip_path)

        # Extract the ZIP file
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)

        temp_db_path = os.path.join(temp_dir, 'tracks.db')

        # Connect to the temporary database
        temp_conn = sqlite3.connect(temp_db_path)
        temp_cursor = temp_conn.cursor()

        def get_tags_from_temp_db(temp_cursor, track_name):
            temp_cursor.execute('''
                SELECT g.name
                FROM tracks AS t
                INNER JOIN track_tags AS tt ON t.id = tt.track_id
                INNER JOIN tags AS g ON tt.tag_id = g.id
                WHERE t.name = ?
            ''', (track_name,))
            tags = [tag[0] for tag in temp_cursor.fetchall()]
            return tags

        # Retrieve all tracks from the temporary database
        temp_cursor.execute("SELECT name, description, url, original_url FROM tracks")
        tracks = temp_cursor.fetchall()

        # Move track files to the static/tracks directory
        temp_tracks_dir = os.path.join(temp_dir, 'tracks')
        if os.path.exists(temp_tracks_dir):
            for filename in os.listdir(temp_tracks_dir):
                shutil.move(os.path.join(temp_tracks_dir, filename), TRACKS_DIR)

        # Add tracks to the main database
        for track in tracks:
            # Update URL to point to the correct location
            track_url = track[2]  # URL from the temporary DB
            track_filename = os.path.basename(track_url.lstrip('/tracks/'))  # Extract filename from URL
            new_track_url = url_for('static', filename=f"tracks/{track_filename}")  # Update to /static/tracks/
            new_track_id = db.add_track(track[0], track[1], new_track_url, track[3], [])  # Add track without tags initially
            tags = get_tags_from_temp_db(temp_cursor, track[0])
            if tags:
                db.add_tags_to_track(new_track_id, tags)

        temp_conn.close()

        return jsonify({'message': 'Данные из базы данных успешно загружены.'}), 200

    except sqlite3.Error as e:
        return jsonify({'error': f'Ошибка SQLite: {e}'}), 400  # More informative error message
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': f'Ошибка при загрузке данных: {e}'}), 500
    finally:
        # Remove the temporary directory and its contents
        if temp_dir:
            try:
                shutil.rmtree(temp_dir)
            except OSError as e:
                print("Error: %s - %s." % (e.filename, e.strerror))

@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle file size limit errors."""
    return jsonify({'error': 'Файл слишком большой. Максимальный размер: 100MB.'}), 413

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=6390)